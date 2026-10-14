import AppKit
import AVFoundation
import CoreMedia

// HIDN ad with voiceover, 9:16, 45 seconds. Every frame and sound is generated
// here; the voice is macOS speech (lines rendered with `say` into
// marketing/video/vo). No stock footage or licensed audio.
//   swift -O marketing/tools/render-ad-video-vo.swift marketing/video
let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "marketing/video"
let shotsDir = "\(outDir)/shots"
let voDir = "\(outDir)/vo"
let roomAudioPath = "marketing/audio/hidn-recording-source.m4a"
let W = 1080, H = 1920
let fps: Int32 = 30
let duration: Double = 45
let frameCount = Int(duration * Double(fps))
let sampleRate: Double = 48_000

// MARK: - Palette and type

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r/255, green: g/255, blue: b/255, alpha: a) }
let ground = rgb(2, 5, 3), green = rgb(77, 255, 110), pale = rgb(196, 247, 204), dim = rgb(143, 217, 160), gold = rgb(244, 183, 40)
func mono(_ size: CGFloat, _ weight: NSFont.Weight = .medium) -> NSFont { NSFont.monospacedSystemFont(ofSize: size, weight: weight) }

/// Deterministic randomness so every render is identical.
struct RNG { var s: UInt64; mutating func next() -> Double { s = s &* 6364136223846793005 &+ 1442695040888963407; return Double(s >> 11) / Double(1 << 53) } }

func textWidth(_ s: String, _ font: NSFont, kern: CGFloat = 0) -> CGFloat { NSAttributedString(string: s, attributes: [.font: font, .kern: kern]).size().width }
func draw(_ s: String, _ x: CGFloat, _ y: CGFloat, _ font: NSFont, _ color: NSColor, glow: CGFloat = 14, fringe: CGFloat = 0, kern: CGFloat = 0, alpha: CGFloat = 1) {
  func put(_ c: NSColor, _ dx: CGFloat, _ shadow: NSShadow?) {
    var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: c.withAlphaComponent(c.alphaComponent * alpha), .kern: kern]
    if let shadow { attrs[.shadow] = shadow }
    NSAttributedString(string: s, attributes: attrs).draw(at: NSPoint(x: x + dx, y: y))
  }
  if fringe > 0 { put(rgb(255, 60, 90, 0.5), -fringe, nil); put(rgb(60, 200, 255, 0.5), fringe, nil) }
  var sh: NSShadow? = nil
  if glow > 0 { let g = NSShadow(); g.shadowColor = color.withAlphaComponent(0.7 * alpha); g.shadowBlurRadius = glow; g.shadowOffset = .zero; sh = g }
  put(color, 0, sh)
}
func drawCentered(_ s: String, _ cy: CGFloat, _ font: NSFont, _ color: NSColor, glow: CGFloat = 14, fringe: CGFloat = 0, kern: CGFloat = 0, alpha: CGFloat = 1) {
  draw(s, (CGFloat(W) - textWidth(s, font, kern: kern)) / 2, cy, font, color, glow: glow, fringe: fringe, kern: kern, alpha: alpha)
}
func smooth(_ x: Double) -> Double { let t = max(0, min(1, x)); return t * t * (3 - 2 * t) }

// MARK: - Script

struct Typed { let text: String; let start: Double; let cps: Double
  func visible(_ t: Double) -> String { let n = Int(max(0, (t - start) * cps)); return String(text.prefix(min(n, text.count))) }
  var end: Double { start + Double(text.count) / cps }
}
/// Voiceover lines: file, start time, and the subtitle typed while it plays.
struct Voice { let file: String; let start: Double; let subtitle: String; let whisper: Bool }
let voiceSpeed = 0.84 // slowed and pitched well down: a darker, more menacing voice
let voices = [
  Voice(file: "01.aiff", start: 0.8, subtitle: "everyone has a thought they've never said out loud.", whisper: false),
  Voice(file: "02.aiff", start: 5.0, subtitle: "there's a room for that.", whisper: false),
  Voice(file: "03.aiff", start: 6.8, subtitle: "come in.", whisper: true),
  Voice(file: "04.aiff", start: 10.0, subtitle: "no names. no faces. just thoughts, on the walls.", whisper: false),
  Voice(file: "05.aiff", start: 15.6, subtitle: "read what nobody signed.", whisper: false),
  Voice(file: "06.aiff", start: 18.2, subtitle: "", whisper: false),
  Voice(file: "07.aiff", start: 25.8, subtitle: "", whisper: false),
  Voice(file: "08.aiff", start: 29.6, subtitle: "", whisper: false),
  Voice(file: "11.aiff", start: 32.3, subtitle: "", whisper: false),
  Voice(file: "09.aiff", start: 37.5, subtitle: "", whisper: false),
  Voice(file: "10.aiff", start: 40.9, subtitle: "are you sure you're in the right place?", whisper: true),
]

// The fast exploration: accelerating cuts through the rooms, like flipping channels.
struct Cut { let shot: Int; let start: Double; let end: Double; let focus: CGPoint; let zoom: CGFloat }
let montageStart = 9.6, holdStart = 16.0, holdEnd = 17.6
let cutLengths: [Double] = [0.9, 0.8, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.3, 0.25, 0.3]
let cutShots = [1, 0, 2, 4, 3, 5, 1, 2, 0, 4, 3, 5, 2]
var cuts: [Cut] = []
do {
  var r = RNG(s: 99)
  var at = montageStart
  for (i, len) in cutLengths.enumerated() {
    cuts.append(Cut(shot: cutShots[i], start: at, end: at + len, focus: CGPoint(x: r.next(), y: 0.2 + r.next() * 0.6), zoom: CGFloat(1.15 + r.next() * 0.9)))
    at += len
  }
}
let cutTimes = cuts.map(\.start) + [holdStart]
let channelFlips = [5.0, 6.7]
let features = [
  Typed(text: "> no accounts.", start: 18.25, cps: 18),
  Typed(text: "> your key never leaves", start: 19.75, cps: 26),
  Typed(text: "  your device.", start: 20.75, cps: 22),
  Typed(text: "> every post is proven", start: 22.0, cps: 22),
  Typed(text: "  with zero knowledge.", start: 23.2, cps: 22),
]
let confession = Typed(text: "i still keep the last voicemail. i never play it.", start: 26.7, cps: 22)
let transmitAt = 29.3
let endCard = 36.9
let shieldStart = 31.9
let glitchCuts: [Double] = [0.9, 4.75, 5.0, 6.7, 7.95, 9.6, 17.6, 18.0, 25.55, 29.3, 31.9, 36.85, 44.4]

// MARK: - Assets

func loadImage(_ path: String) -> CGImage {
  guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("missing \(path)") }
  return cg
}
let shotFiles = ["01-main-room.jpg", "02-hallway.jpg", "04-room-night-shift.jpg", "03-room-redacted.jpg", "05-library-tv.jpg", "06-library.jpg"]
let shotImages = shotFiles.map { loadImage("\(shotsDir)/\($0)") }
var noiseFrames: [CGImage] = []
do {
  var r = RNG(s: 7)
  for _ in 0..<8 {
    let nw = 270, nh = 480
    var px = [UInt8](repeating: 0, count: nw * nh)
    for i in 0..<px.count { px[i] = UInt8(r.next() * 255) }
    let provider = CGDataProvider(data: Data(px) as CFData)!
    noiseFrames.append(CGImage(width: nw, height: nh, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: nw, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!)
  }
}

/// Draw a CGImage into a rect in the flipped (top-left origin) context.
func drawImage(_ ctx: CGContext, _ image: CGImage, _ rect: CGRect, source: CGRect? = nil, alpha: CGFloat = 1) {
  let img = source.flatMap { image.cropping(to: $0) } ?? image
  ctx.saveGState()
  ctx.setAlpha(alpha)
  ctx.translateBy(x: rect.minX, y: rect.maxY); ctx.scaleBy(x: 1, y: -1)
  ctx.interpolationQuality = .high
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: rect.width, height: rect.height))
  ctx.restoreGState()
}

// MARK: - Voiceover audio (loaded early: subtitle timing follows each line's length)

func loadVoice(_ path: String) -> [Float] {
  let file = try! AVAudioFile(forReading: URL(fileURLWithPath: path))
  let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: file.fileFormat.sampleRate, channels: 1, interleaved: false)!
  let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(file.length))!
  try! file.read(into: buf)
  let src = Array(UnsafeBufferPointer(start: buf.floatChannelData![0], count: Int(buf.frameLength)))
  // Resample to the output rate, slowed by voiceSpeed (which also lowers pitch).
  let ratio = file.fileFormat.sampleRate * voiceSpeed / sampleRate
  let outCount = Int(Double(src.count) / ratio)
  var out = [Float](repeating: 0, count: outCount)
  for i in 0..<outCount {
    let p = Double(i) * ratio, j = Int(p), f = Float(p - Double(j))
    let a = src[min(j, src.count - 1)], b = src[min(j + 1, src.count - 1)]
    out[i] = a + (b - a) * f
  }
  return out
}
let voiceSamples = voices.map { loadVoice("\(voDir)/\($0.file)") }
/// Whispered doubles of the narrated lines ("w" + file), for the psycho layer.
let doubleSamples: [[Float]?] = voices.map { v in
  let path = "\(voDir)/w\(v.file)"
  return FileManager.default.fileExists(atPath: path) ? loadVoice(path) : nil
}
let voiceLengths = voiceSamples.map { Double($0.count) / sampleRate }
func voiceSubtitle(_ t: Double) -> (String, Bool)? {
  for (i, v) in voices.enumerated() where !v.subtitle.isEmpty && t >= v.start && t < v.start + voiceLengths[i] + 0.9 {
    let p = (t - v.start) / max(0.5, voiceLengths[i] * 0.92)
    return (String(v.subtitle.prefix(Int(min(1, p) * Double(v.subtitle.count)))), v.whisper)
  }
  return nil
}

/// Every moment a character appears, for the typing sound.
var typeTimes: [Double] = []
for (i, v) in voices.enumerated() where !v.subtitle.isEmpty {
  let n = v.subtitle.count, span = max(0.5, voiceLengths[i] * 0.92)
  for k in 0..<n where Array(v.subtitle)[k] != " " { typeTimes.append(v.start + span * Double(k) / Double(n)) }
}
for f in features + [confession] { for (k, ch) in f.text.enumerated() where ch != " " { typeTimes.append(f.start + Double(k) / f.cps) } }
for f in [Typed(text: "IF YOUR MONEY", start: 32.4, cps: 14), Typed(text: "CAN BE SHIELDED,", start: 33.4, cps: 14), Typed(text: "SO CAN", start: 34.95, cps: 12), Typed(text: "YOUR THOUGHTS.", start: 35.5, cps: 14)] {
  for (k, ch) in f.text.enumerated() where ch != " " { typeTimes.append(f.start + Double(k) / f.cps) }
}
// MARK: - Shared visual pieces

func fillGround(_ alpha: CGFloat = 1) {
  ground.withAlphaComponent(alpha).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
}
func bloom(_ c: NSPoint, _ r: CGFloat, _ a: CGFloat) {
  NSGradient(colors: [rgb(50, 140, 70, a), rgb(0, 0, 0, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: r, options: [])
}
func cursorBlock(_ x: CGFloat, _ y: CGFloat, _ h: CGFloat, _ t: Double) {
  if Int(t * 2.2) % 2 == 0 { green.setFill(); NSRect(x: x, y: y, width: h * 0.55, height: h).fill() }
}
/// The logo: >hidn▌ centred at (cx, cy), the same construction as the brand mark.
func logo(_ ctx: CGContext, cx: CGFloat, cy: CGFloat, size: CGFloat, alpha: CGFloat = 1, tear: Bool = true) {
  let f = mono(size, .semibold)
  let cw = textWidth("M", f)
  let total = cw * 6
  let x0 = cx - total / 2
  let chars: [(String, NSColor)] = [(">", pale), ("h", green), ("i", green), ("d", green), ("n", green)]
  func pass(_ dx: CGFloat, _ colorOverride: NSColor?, glow: CGFloat) {
    for (i, (ch, c)) in chars.enumerated() {
      let s = NSAttributedString(string: ch, attributes: [.font: f])
      let w = s.size().width, h = s.size().height
      draw(ch, x0 + cw * (CGFloat(i) + 0.5) - w / 2 + dx, cy - h / 2, f, colorOverride ?? c, glow: glow, alpha: alpha)
    }
    (colorOverride ?? green).withAlphaComponent((colorOverride?.alphaComponent ?? 1) * alpha).setFill()
    NSRect(x: x0 + cw * 5.1 + dx, y: cy - size * 0.5, width: cw * 0.8, height: size).fill()
  }
  pass(-size * 0.03, rgb(255, 60, 90, 0.5), glow: 0)
  pass(size * 0.03, rgb(60, 200, 255, 0.5), glow: 0)
  pass(0, nil, glow: size * 0.09)
  if tear {
    let band = CGRect(x: x0 - 40, y: cy - size * 0.24, width: total + 80, height: size * 0.09)
    ctx.saveGState(); ctx.clip(to: band)
    fillGround(); ctx.translateBy(x: size * 0.08, y: 0); pass(0, nil, glow: size * 0.09)
    ctx.restoreGState()
  }
}
func terminalWindow(_ win: NSRect, title: String) {
  let body = NSBezierPath(roundedRect: win, xRadius: 22, yRadius: 22)
  rgb(2, 6, 3, 0.96).setFill(); body.fill()
  rgb(12, 22, 15).setFill()
  NSBezierPath(roundedRect: NSRect(x: win.minX, y: win.minY, width: win.width, height: 70), xRadius: 22, yRadius: 22).fill()
  NSRect(x: win.minX, y: win.minY + 46, width: win.width, height: 24).fill()
  rgb(77, 255, 110, 0.4).setStroke(); body.lineWidth = 3; body.stroke()
  let bar = NSBezierPath(); bar.move(to: NSPoint(x: win.minX, y: win.minY + 70)); bar.line(to: NSPoint(x: win.maxX, y: win.minY + 70)); bar.lineWidth = 2; bar.stroke()
  for (i, c) in [rgb(240, 94, 98), rgb(219, 167, 74), rgb(91, 219, 129)].enumerated() {
    c.setFill(); NSBezierPath(ovalIn: NSRect(x: win.minX + 32 + CGFloat(i) * 36, y: win.minY + 24, width: 22, height: 22)).fill()
  }
  draw(title, win.midX - textWidth(title, mono(26, .regular)) / 2, win.minY + 18, mono(26, .regular), rgb(200, 240, 205, 0.6), glow: 0)
}

// MARK: - Scenes (each draws in the flipped context at absolute time t)

/// Typed subtitle, wrapped and centred, with a blinking cursor.
func subtitle(_ text: String, _ y: CGFloat, size: CGFloat, color: NSColor, t: Double, width: CGFloat = 900, glow: CGFloat = 14) {
  let f = mono(size)
  var lines: [String] = [""]
  for w in text.split(separator: " ", omittingEmptySubsequences: false).map(String.init) {
    let candidate = lines[lines.count - 1].isEmpty ? w : lines[lines.count - 1] + " " + w
    if textWidth(candidate, f) > width { lines.append(w) } else { lines[lines.count - 1] = candidate }
  }
  for (i, l) in lines.enumerated() {
    let ly = y + CGFloat(i) * size * 1.35
    let x = (CGFloat(W) - textWidth(l, f)) / 2
    draw(l, x, ly, f, color, glow: glow, fringe: 1.5)
    if i == lines.count - 1 { cursorBlock(x + textWidth(l, f) + 6, ly + size * 0.15, size * 0.85, t) }
  }
}

/// A room shot, darkened, lit by a wandering flashlight.
func roomShot(_ ctx: CGContext, _ shot: Int, focus: CGPoint, zoom: CGFloat, t: Double, light: CGFloat = 0.55) {
  let img = shotImages[shot]
  let src = CGRect(x: 10, y: 10, width: CGFloat(img.width) - 20, height: CGFloat(img.height) - 20)
  let base = max(CGFloat(W) / src.width, CGFloat(H) / src.height) * zoom
  let dw = src.width * base, dh = src.height * base
  fillGround()
  drawImage(ctx, img, CGRect(x: (CGFloat(W) - dw) * focus.x, y: (CGFloat(H) - dh) * focus.y, width: dw, height: dh), source: src)
  let lx = CGFloat(W) * (0.35 + 0.3 * CGFloat(sin(t * 1.3 + Double(shot))))
  let ly = CGFloat(H) * (0.42 + 0.12 * CGFloat(cos(t * 1.1 + Double(shot) * 1.7)))
  NSGradient(colors: [rgb(0, 0, 0, 0), rgb(0, 0, 0, light), rgb(0, 0, 0, 0.92)], atLocations: [0, 0.45, 1], colorSpace: .sRGB)!
    .draw(fromCenter: NSPoint(x: lx, y: ly), radius: 0, toCenter: NSPoint(x: lx, y: ly), radius: 1100, options: [.drawsAfterEndingLocation])
  rgb(20, 60, 30, 0.14).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
}

/// VHS-style on-screen display: channel number and play marker.
func osd(_ channel: Int, _ t: Double) {
  let f = mono(46, .bold)
  draw(String(format: "CH %02d", channel), 70, 170, f, rgb(235, 245, 235), glow: 6)
  if Int(t * 2) % 2 == 0 { draw("▶ PLAY", CGFloat(W) - 70 - textWidth("▶ PLAY", f), 170, f, rgb(235, 245, 235), glow: 6) }
}

func sceneOpen(_ ctx: CGContext, _ t: Double, _ frame: Int) {
  fillGround()
  let open = smooth((t - 0.1) / 0.6)
  let lineAlpha = CGFloat(1 - smooth((t - 0.5) / 0.4))
  if lineAlpha > 0 { rgb(196, 247, 204, lineAlpha * 0.9).setFill(); NSRect(x: 0, y: CGFloat(H) / 2 - 3, width: CGFloat(W), height: 6).fill() }
  bloom(NSPoint(x: W / 2, y: H / 2), 900, 0.16 * CGFloat(open))
  // Subliminal flashes: two frames of a room, gone before it registers.
  for (at, shot) in [(2.1, 2), (3.0, 0), (3.7, 4), (4.4, 1)] where t >= at && t < at + 0.067 {
    roomShot(ctx, shot, focus: CGPoint(x: 0.5, y: 0.4), zoom: 1.3, t: t, light: 0.3)
  }
  if let (s, w) = voiceSubtitle(t) { subtitle(s, 820, size: 56, color: w ? pale : green, t: t) }
}

func sceneHallway(_ ctx: CGContext, _ t: Double) {
  if t < 6.7 {
    let p = (t - 5.0) / 1.7
    roomShot(ctx, 1, focus: CGPoint(x: 0.5, y: 0.45), zoom: 1.05 + 0.12 * CGFloat(p), t: t, light: 0.6)
    if let (s, _) = voiceSubtitle(t) { subtitle(s, 1540, size: 50, color: green, t: t) }
  } else {
    fillGround()
    bloom(NSPoint(x: W / 2, y: H / 2), 700, 0.12)
    if let (s, _) = voiceSubtitle(t) { subtitle(s, 880, size: 96, color: pale, t: t, glow: 22) }
  }
}

func sceneLogo(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let p = smooth((t - 7.95) / 0.35)
  bloom(NSPoint(x: W / 2, y: H / 2), 900, 0.3 * CGFloat(p))
  logo(ctx, cx: CGFloat(W) / 2, cy: CGFloat(H) / 2 - 40, size: 200, alpha: CGFloat(p))
  if t > 8.5 { drawCentered("A ROOM WITHOUT NAMES.", CGFloat(H) / 2 + 120, mono(36, .regular), pale, glow: 10, kern: 5, alpha: CGFloat(smooth((t - 8.5) / 0.4))) }
}

func sceneMontage(_ ctx: CGContext, _ t: Double) {
  if let i = cuts.firstIndex(where: { t >= $0.start && t < $0.end }) {
    let c = cuts[i], p = (t - c.start) / (c.end - c.start)
    roomShot(ctx, c.shot, focus: c.focus, zoom: c.zoom + 0.1 * CGFloat(p), t: t, light: 0.5)
    osd(i + 1, t)
  } else {
    // The hold: the cuts stop on a confession, pushing in.
    let p = (t - holdStart) / (holdEnd - holdStart)
    roomShot(ctx, 2, focus: CGPoint(x: 0.12, y: 0.32), zoom: 1.35 + 0.18 * CGFloat(p), t: t, light: 0.35)
  }
  if let (s, _) = voiceSubtitle(t) {
    let bar = NSRect(x: 50, y: 1500, width: CGFloat(W) - 100, height: 230)
    rgb(2, 6, 3, 0.8).setFill(); NSBezierPath(roundedRect: bar, xRadius: 16, yRadius: 16).fill()
    subtitle(s, bar.minY + 40, size: 46, color: green, t: t, width: bar.width - 80)
  }
}

func sceneFeatures(_ ctx: CGContext, _ t: Double) {
  fillGround()
  bloom(NSPoint(x: W / 2, y: 900), 900, 0.2)
  let p = smooth((t - 18.0) / 0.3)
  let win = NSRect(x: 60, y: 560, width: CGFloat(W) - 120, height: 720)
  ctx.saveGState(); ctx.setAlpha(CGFloat(p))
  terminalWindow(win, title: "hidn@room: ~/how-it-works")
  draw("hidn@room:~$ cat PRIVACY", win.minX + 50, win.minY + 110, mono(32, .regular), dim, glow: 0)
  for (i, f) in features.enumerated() { draw(f.visible(t), win.minX + 50, win.minY + 200 + CGFloat(i) * 86, mono(46), green, glow: 14) }
  if let idx = features.lastIndex(where: { t >= $0.start }) {
    let s = features[idx].visible(t)
    cursorBlock(win.minX + 50 + textWidth(s, mono(46)) + 6, win.minY + 206 + CGFloat(idx) * 86, 50, t)
  }
  ctx.restoreGState()
}

func sceneConfession(_ ctx: CGContext, _ t: Double) {
  fillGround()
  bloom(NSPoint(x: W / 2, y: 900), 900, 0.2)
  let win = NSRect(x: 60, y: 560, width: CGFloat(W) - 120, height: 760)
  terminalWindow(win, title: "hidn@room: ~/say-it-here")
  draw("> SAY IT HERE", win.minX + 50, win.minY + 110, mono(34), green, glow: 10)
  let s = confession.visible(t)
  var lines: [String] = [""]
  for w in s.split(separator: " ", omittingEmptySubsequences: false).map(String.init) {
    let candidate = lines[lines.count - 1].isEmpty ? w : lines[lines.count - 1] + " " + w
    if textWidth(candidate, mono(50)) > win.width - 100 { lines.append(w) } else { lines[lines.count - 1] = candidate }
  }
  for (i, l) in lines.enumerated() { draw(l, win.minX + 50, win.minY + 190 + CGFloat(i) * 72, mono(50), pale, glow: 10) }
  if t < transmitAt { cursorBlock(win.minX + 50 + textWidth(lines.last ?? "", mono(50)) + 6, win.minY + 196 + CGFloat(lines.count - 1) * 72, 54, t) }
  let sigY = win.minY + 470
  draw("> SIGNED:", win.minX + 50, sigY, mono(36), pale, glow: 8)
  let red = NSRect(x: win.minX + 270, y: sigY + 2, width: 330, height: 44)
  NSColor.black.setFill(); red.fill()
  NSGraphicsContext.saveGraphicsState(); NSBezierPath(rect: red).addClip()
  rgb(77, 255, 110, 0.4).setStroke()
  var x = red.minX - red.height
  while x < red.maxX { let p = NSBezierPath(); p.move(to: NSPoint(x: x, y: red.maxY)); p.line(to: NSPoint(x: x + red.height, y: red.minY)); p.lineWidth = 3; p.stroke(); x += 12 }
  NSGraphicsContext.restoreGraphicsState()
  rgb(77, 255, 110, 0.7).setStroke(); let ro = NSBezierPath(rect: red); ro.lineWidth = 2; ro.stroke()
  let button = NSRect(x: win.minX + 50, y: win.minY + 580, width: 330, height: 90)
  let pressed = t >= transmitAt && t < transmitAt + 0.25
  (pressed ? green : rgb(77, 255, 110, 0.12)).setFill(); button.fill()
  rgb(77, 255, 110, 0.8).setStroke(); let bo = NSBezierPath(rect: button); bo.lineWidth = 3; bo.stroke()
  draw(t >= transmitAt + 0.25 ? "[ SENT ]" : "[ TRANSMIT ]", button.minX + 36, button.minY + 24, mono(38), pressed ? NSColor.black : green, glow: pressed ? 0 : 12)
  if t >= 29.6 { subtitle("nobody will ever know it was you.", win.maxY + 60, size: 44, color: green, t: t) }
}

func sceneEnd(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let p = smooth((t - endCard) / 0.5)
  bloom(NSPoint(x: W / 2, y: H / 2 - 80), 950, 0.3 * CGFloat(p))
  logo(ctx, cx: CGFloat(W) / 2, cy: CGFloat(H) / 2 - 260, size: 200, alpha: CGFloat(p))
  // The tagline lands with the voice.
  if t > endCard + 0.7 { drawCentered("SOME THOUGHTS ARE", CGFloat(H) / 2 - 70, mono(44, .regular), pale, glow: 10, kern: 5, alpha: CGFloat(smooth((t - endCard - 0.7) / 0.3))) }
  if t > endCard + 1.9 { drawCentered("MEANT TO BE HIDN.", CGFloat(H) / 2 - 10, mono(44, .regular), pale, glow: 10, kern: 5, alpha: CGFloat(smooth((t - endCard - 1.9) / 0.3))) }
  if t > endCard + 2.8 {
    let a = CGFloat(smooth((t - endCard - 2.8) / 0.4))
    let label = "[ ENTER THE ROOM ]", f = mono(44)
    let bw = textWidth(label, f, kern: 4) + 80, bx = (CGFloat(W) - bw) / 2, by = CGFloat(H) / 2 + 110
    rgb(77, 255, 110, 0.12 * a).setFill(); NSRect(x: bx, y: by, width: bw, height: 100).fill()
    rgb(77, 255, 110, 0.8 * a).setStroke(); let o = NSBezierPath(rect: NSRect(x: bx, y: by, width: bw, height: 100)); o.lineWidth = 3; o.stroke()
    draw(label, bx + 40, by + 26, f, green, glow: 14, kern: 4, alpha: a)
  }
  if let (s, _) = voiceSubtitle(t), t >= endCard + 4.0 { subtitle(s, CGFloat(H) / 2 + 300, size: 46, color: pale, t: t) }
  if t > endCard + 3.2 {
    let a = CGFloat(smooth((t - endCard - 3.2) / 0.4))
    drawCentered("NO ACCOUNTS  ·  NO NAMES  ·  ZERO KNOWLEDGE", CGFloat(H) - 300, mono(28, .regular), dim, glow: 0, kern: 3, alpha: a)
    drawCentered("BUILT ON ZCASH", CGFloat(H) - 240, mono(28, .regular), gold, glow: 6, kern: 4, alpha: a)
  }
  let off = smooth((t - (duration - 0.6)) / 0.45)
  if off > 0 {
    NSColor.black.withAlphaComponent(CGFloat(off)).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
    let lh = CGFloat(H) * CGFloat(1 - off) * 0.5
    if off < 1 { rgb(196, 247, 204, 0.6 * CGFloat(1 - off)).setFill(); NSRect(x: 0, y: CGFloat(H) / 2 - lh / 2, width: CGFloat(W), height: max(3, lh * 0.02)).fill() }
  }
}

/// "If your money can be shielded… so can your thoughts." A gold shield, then
/// the two halves typed as the voice says them.
func sceneShielded(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let p = smooth((t - shieldStart) / 0.5)
  let c = NSPoint(x: CGFloat(W) / 2, y: 640)
  NSGradient(colors: [rgb(244, 183, 40, 0.18 * CGFloat(p)), rgb(0, 0, 0, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: 520, options: [])
  // A shield outline, slowly glowing in.
  let w: CGFloat = 300, h: CGFloat = 360
  let shield = NSBezierPath()
  shield.move(to: NSPoint(x: c.x, y: c.y - h / 2))
  shield.curve(to: NSPoint(x: c.x + w / 2, y: c.y - h / 2 + 50), controlPoint1: NSPoint(x: c.x + w * 0.22, y: c.y - h / 2 + 30), controlPoint2: NSPoint(x: c.x + w * 0.4, y: c.y - h / 2 + 45))
  shield.line(to: NSPoint(x: c.x + w / 2, y: c.y + 10))
  shield.curve(to: NSPoint(x: c.x, y: c.y + h / 2), controlPoint1: NSPoint(x: c.x + w / 2, y: c.y + h * 0.3), controlPoint2: NSPoint(x: c.x + w * 0.2, y: c.y + h * 0.43))
  shield.curve(to: NSPoint(x: c.x - w / 2, y: c.y + 10), controlPoint1: NSPoint(x: c.x - w * 0.2, y: c.y + h * 0.43), controlPoint2: NSPoint(x: c.x - w / 2, y: c.y + h * 0.3))
  shield.line(to: NSPoint(x: c.x - w / 2, y: c.y - h / 2 + 50))
  shield.curve(to: NSPoint(x: c.x, y: c.y - h / 2), controlPoint1: NSPoint(x: c.x - w * 0.4, y: c.y - h / 2 + 45), controlPoint2: NSPoint(x: c.x - w * 0.22, y: c.y - h / 2 + 30))
  shield.close()
  NSGraphicsContext.saveGraphicsState()
  let glow = NSShadow(); glow.shadowColor = rgb(244, 183, 40, 0.8 * CGFloat(p)); glow.shadowBlurRadius = 24; glow.shadowOffset = .zero; glow.set()
  rgb(244, 183, 40, 0.9 * CGFloat(p)).setStroke(); shield.lineWidth = 7; shield.stroke()
  NSGraphicsContext.restoreGraphicsState()
  // Inside the shield, a thought line hidden by a redaction.
  if p > 0.5 {
    let red = NSRect(x: c.x - 90, y: c.y - 14, width: 180, height: 36)
    NSColor.black.setFill(); red.fill()
    rgb(244, 183, 40, 0.7).setStroke(); let ro = NSBezierPath(rect: red); ro.lineWidth = 2; ro.stroke()
  }
  let line1 = Typed(text: "IF YOUR MONEY", start: 32.4, cps: 14), line2 = Typed(text: "CAN BE SHIELDED,", start: 33.4, cps: 14)
  let line3 = Typed(text: "SO CAN", start: 34.95, cps: 12), line4 = Typed(text: "YOUR THOUGHTS.", start: 35.5, cps: 14)
  let f = mono(64, .bold)
  for (i, l) in [line1, line2].enumerated() {
    let x = (CGFloat(W) - textWidth(l.text, f, kern: 3)) / 2
    draw(l.visible(t), x, 1000 + CGFloat(i) * 84, f, gold, glow: 16, fringe: 3, kern: 3)
  }
  for (i, l) in [line3, line4].enumerated() {
    let x = (CGFloat(W) - textWidth(l.text, f, kern: 3)) / 2
    draw(l.visible(t), x, 1240 + CGFloat(i) * 84, f, green, glow: 18, fringe: 3, kern: 3)
  }
  if let last = [line1, line2, line3, line4].last(where: { t >= $0.start }) {
    let i = [line1, line2, line3, line4].firstIndex(where: { $0.text == last.text })!
    let y = (i < 2 ? 1000 : 1240) + CGFloat(i % 2) * 84
    let x = (CGFloat(W) - textWidth(last.text, f, kern: 3)) / 2 + textWidth(last.visible(t), f, kern: 3)
    cursorBlock(x + 8, y + 10, 60, t)
  }
}

// MARK: - Post effects: TV glass, channel static, glitch tears

func glitchAmount(_ t: Double) -> Double {
  var a = 0.0
  for c in glitchCuts { let d = abs(t - c); if d < 0.14 { a = max(a, 1 - d / 0.14) } }
  return a
}
/// Full static for a couple of frames at every channel change.
func channelStatic(_ t: Double) -> Double {
  for c in cutTimes + channelFlips where t >= c - 0.001 && t < c + 0.07 { return 1 }
  return 0
}
func postEffects(_ ctx: CGContext, _ t: Double, _ frame: Int) {
  let g = glitchAmount(t)
  if g > 0, let snap = ctx.makeImage() {
    var r = RNG(s: UInt64(frame) &* 977 &+ 13)
    for _ in 0..<Int(3 + g * 7) {
      let y = CGFloat(r.next()) * CGFloat(H), h = CGFloat(10 + r.next() * 90 * g)
      let dx = CGFloat((r.next() - 0.5) * 160 * g)
      ctx.saveGState()
      ctx.clip(to: CGRect(x: 0, y: y, width: CGFloat(W), height: h))
      ctx.translateBy(x: dx, y: CGFloat(H)); ctx.scaleBy(x: 1, y: -1)
      ctx.draw(snap, in: CGRect(x: 0, y: 0, width: CGFloat(W), height: CGFloat(H)))
      ctx.restoreGState()
    }
    for _ in 0..<Int(2 + g * 4) {
      let c = r.next() < 0.5 ? rgb(255, 60, 90, 0.35 * CGFloat(g)) : rgb(60, 200, 255, 0.35 * CGFloat(g))
      c.setFill(); NSRect(x: 0, y: CGFloat(r.next()) * CGFloat(H), width: CGFloat(W), height: CGFloat(2 + r.next() * 8)).fill()
    }
  }
  let full = channelStatic(t)
  let staticAlpha = full > 0 ? 0.92 : 0.04 + 0.25 * g + (t < 0.7 ? 0.35 * (1 - t / 0.7) : 0)
  ctx.saveGState(); ctx.setBlendMode(full > 0 ? .normal : .screen)
  drawImage(ctx, noiseFrames[frame % noiseFrames.count], CGRect(x: 0, y: 0, width: W, height: H), alpha: CGFloat(staticAlpha))
  ctx.restoreGState()
  // Interlaced scanlines and a rolling refresh band.
  rgb(0, 0, 0, 0.24).setFill()
  var y: CGFloat = 0
  while y < CGFloat(H) { NSRect(x: 0, y: y, width: CGFloat(W), height: 1.5).fill(); y += 4 }
  let bandY = CGFloat((t * 0.22).truncatingRemainder(dividingBy: 1.3) - 0.15) * CGFloat(H)
  NSGradient(colors: [rgb(140, 255, 170, 0), rgb(140, 255, 170, 0.07), rgb(140, 255, 170, 0)])!.draw(in: NSRect(x: 0, y: bandY, width: CGFloat(W), height: 260), angle: 90)
  // Tube glass: a curved vignette and rounded screen corners.
  let c = NSPoint(x: W / 2, y: H / 2)
  NSGradient(colors: [rgb(0, 0, 0, 0), rgb(0, 0, 0, 0.62)], atLocations: [0.5, 1], colorSpace: .sRGB)!.draw(fromCenter: c, radius: 0, toCenter: c, radius: 1120, options: [.drawsAfterEndingLocation])
  let screen = NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: W, height: H).insetBy(dx: 6, dy: 6), xRadius: 70, yRadius: 70)
  let frameMask = NSBezierPath(rect: NSRect(x: 0, y: 0, width: W, height: H)); frameMask.append(screen.reversed)
  NSColor.black.setFill(); frameMask.fill()
}

func renderFrame(_ ctx: CGContext, _ frame: Int) {
  let t = Double(frame) / Double(fps)
  if t < 4.75 { sceneOpen(ctx, t, frame) }
  else if t < 5.0 { fillGround() }
  else if t < 7.95 { sceneHallway(ctx, t) }
  else if t < montageStart { sceneLogo(ctx, t) }
  else if t < holdEnd { sceneMontage(ctx, t) }
  else if t < 18.0 { NSColor.black.setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill() }
  else if t < 25.55 { sceneFeatures(ctx, t) }
  else if t < shieldStart { sceneConfession(ctx, t) }
  else if t < endCard { sceneShielded(ctx, t) }
  else { sceneEnd(ctx, t) }
  postEffects(ctx, t, frame)
}

// MARK: - Soundtrack

let totalSamples = Int(duration * sampleRate)
var left = [Float](repeating: 0, count: totalSamples), right = [Float](repeating: 0, count: totalSamples)
func add(_ i: Int, _ v: Double, pan: Double = 0) {
  guard i >= 0 && i < totalSamples else { return }
  left[i] += Float(v * (1 - max(0, pan))); right[i] += Float(v * (1 + min(0, pan)))
}
/// 1 while the voice speaks (with soft edges): the music ducks under it.
func voiceActive(_ t: Double) -> Double {
  var a = 0.0
  for (i, v) in voices.enumerated() {
    let s = v.start - 0.1, e = v.start + voiceLengths[i] + 0.15
    if t > s - 0.12 && t < e + 0.12 { a = max(a, min(smooth((t - (s - 0.12)) / 0.12), 1 - smooth((t - e) / 0.12))) }
  }
  return a
}
do {
  var r = RNG(s: 42)
  // Dark bed: detuned saw tones on a D minor chord through a slowly moving
  // low-pass, a faint dissonant shimmer, moving wind, TV hum and tape crackle.
  // It drops out for the silence before the terminal and dips under the voice.
  let chord: [(Double, Double, Double)] = [(36.71, 0, 0.42), (55.0, -0.15, 0.3), (73.42, 0.2, 0.22), (87.31, -0.25, 0.16), (110.0, 0.3, 0.08)]
  var phases = [Double](repeating: 0, count: chord.count * 2)
  var l1 = 0.0, l2 = 0.0, r1 = 0.0, r2 = 0.0
  var low = 0.0, band = 0.0
  for i in 0..<totalSamples {
    let t = Double(i) / sampleRate
    let fadeIn = smooth(t / 2.0), fadeOut = 1 - smooth((t - (duration - 1.6)) / 1.3)
    let gap = 1 - (smooth((t - 17.55) / 0.05) * (1 - smooth((t - 18.0) / 0.05)))
    let duck = 1 - 0.5 * voiceActive(t)
    let tension = smooth((t - montageStart) / 6.4) * (1 - smooth((t - holdStart) / 0.25))
    var sl = 0.0, sr = 0.0
    for (k, (f, pan, amp)) in chord.enumerated() {
      for d in 0..<2 {
        let idx = k * 2 + d
        phases[idx] += (f * (d == 0 ? 1.0016 : 0.9984)) / sampleRate
        if phases[idx] >= 1 { phases[idx] -= 1 }
        let saw = 2 * phases[idx] - 1
        let breathe = 0.8 + 0.2 * sin(2 * .pi * (0.07 + 0.013 * Double(k)) * t + Double(k))
        let v = saw * amp * breathe
        if d == 0 { sl += v * (1 - max(0, pan)); sr += v * 0.6 * (1 + min(0, pan)) } else { sr += v * (1 + min(0, pan)); sl += v * 0.6 * (1 - max(0, pan)) }
      }
    }
    // Two-pole low-pass: mostly closed (dark), opening with the tension.
    let fc = 110 + 260 * (0.5 + 0.5 * sin(2 * .pi * 0.045 * t)) + 1100 * tension
    let a = 1 - exp(-2 * .pi * fc / sampleRate)
    l1 += a * (sl - l1); l2 += a * (l1 - l2); r1 += a * (sr - r1); r2 += a * (r1 - r2)
    // Dissonant shimmer: a minor second, high and faint, louder in the rooms.
    let shimmer = (sin(2 * .pi * 587.33 * t) + sin(2 * .pi * 622.25 * t + 0.7)) * (0.5 + 0.5 * sin(2 * .pi * 0.31 * t)) * (0.006 + 0.02 * tension)
    // Wind: noise through a band-pass that drifts between 250 and 900 Hz.
    let n = r.next() * 2 - 1
    let wc = 250 + 650 * (0.5 + 0.5 * sin(2 * .pi * 0.06 * t + 1.3))
    let f = 2 * sin(.pi * wc / sampleRate)
    low += f * band; let high = n - low - 0.7 * band; band += f * high
    let wind = band * 0.05
    let hum = 0.01 * sin(2 * .pi * 60 * t) + 0.005 * sin(2 * .pi * 180 * t)
    let crackle = r.next() < 0.00035 ? (r.next() - 0.5) * 0.12 : 0
    let env = fadeIn * fadeOut * gap * duck
    add(i, (l2 * 0.55 + shimmer + wind * 0.8 + hum + crackle) * env, pan: -0.2)
    add(i, (r2 * 0.55 + shimmer * 0.9 + wind + hum) * env, pan: 0.2)
  }
  // Distant metallic bells: inharmonic partials with a long tail and echoes.
  func bell(_ at: Double, _ f0: Double, _ amp: Double) {
    let partials: [(Double, Double, Double)] = [(1, 1, 2.2), (2.76, 0.5, 1.4), (5.4, 0.3, 0.9), (8.93, 0.18, 0.5)]
    for (echo, (delay, g)) in [(0.0, 1.0), (0.31, 0.45), (0.62, 0.22), (0.95, 0.1)].enumerated() {
      let s0 = Int((at + delay) * sampleRate)
      for j in 0..<Int(2.6 * sampleRate) {
        let tj = Double(j) / sampleRate
        var v = 0.0
        for (ratio, pa, decay) in partials { v += pa * sin(2 * .pi * f0 * ratio * tj) * exp(-tj / decay) }
        add(s0 + j, amp * g * v * min(1, tj / 0.004), pan: echo % 2 == 0 ? -0.35 : 0.35)
      }
    }
  }
  for (at, f0) in [(3.3, 196.0), (11.2, 185.0), (19.4, 196.0), (27.6, 174.6), (32.2, 207.65), (39.3, 146.8)] { bell(at, f0, 0.045) }
  // Braam: a heavy low brass-like hit, a saw stack whose filter slams open then closes.
  func braam(_ at: Double, _ amp: Double) {
    var ph = [0.0, 0.0, 0.0, 0.0], lp1 = 0.0, lp2 = 0.0
    let freqs = [36.71, 36.9, 73.42, 55.0]
    for j in 0..<Int(3.2 * sampleRate) {
      let tj = Double(j) / sampleRate
      var x = 0.0
      for k in 0..<4 { ph[k] += freqs[k] / sampleRate; if ph[k] >= 1 { ph[k] -= 1 }; x += (2 * ph[k] - 1) * (k == 2 ? 0.5 : 1) }
      let fc = 90 + 1400 * exp(-tj / 0.35)
      let a = 1 - exp(-2 * .pi * fc / sampleRate)
      lp1 += a * (x - lp1); lp2 += a * (lp1 - lp2)
      add(Int(at * sampleRate) + j, amp * lp2 * min(1, tj / 0.02) * exp(-tj / 1.4))
    }
  }
  braam(7.98, 0.32); braam(endCard - 0.02, 0.34)
  // Typewriter keys.
  for tt in typeTimes {
    let s0 = Int(tt * sampleRate), pan = (r.next() - 0.5) * 0.6
    let amp = 0.13 + r.next() * 0.07, tone = 1500 + r.next() * 900
    for j in 0..<Int(0.03 * sampleRate) {
      let tj = Double(j) / sampleRate
      add(s0 + j, amp * ((r.next() * 2 - 1) * exp(-tj / 0.004) + 0.5 * sin(2 * .pi * tone * tj) * exp(-tj / 0.0025) + 0.3 * sin(2 * .pi * 180 * tj) * exp(-tj / 0.01)), pan: pan)
    }
  }
  // Channel static at every cut and flip.
  for c in cutTimes + channelFlips {
    let s0 = Int(c * sampleRate)
    var hp = 0.0, prev = 0.0
    for j in 0..<Int(0.09 * sampleRate) {
      let n = r.next() * 2 - 1; hp = 0.85 * (hp + n - prev); prev = n
      add(s0 + j, 0.2 * hp * (1 - Double(j) / (0.09 * sampleRate)), pan: (r.next() - 0.5) * 0.5)
    }
  }
  // Glitch bursts.
  for c in glitchCuts {
    let s0 = Int((c - 0.06) * sampleRate), len = Int(0.16 * sampleRate)
    var hold = 0.0, holdLeft = 0
    for j in 0..<len {
      if holdLeft <= 0 { hold = r.next() * 2 - 1; holdLeft = 6 + Int(r.next() * 40) }
      holdLeft -= 1
      let tj = Double(j) / sampleRate, env = sin(.pi * Double(j) / Double(len))
      let buzz = (sin(2 * .pi * 118 * tj) > 0 ? 1.0 : -1.0) * 0.4
      add(s0 + j, 0.17 * env * ((Int(tj * 60) % 2 == 0) ? 1 : 0.35) * (hold + buzz), pan: (r.next() - 0.5) * 0.8)
    }
  }
  func sweep(_ start: Double, _ len: Double, _ f0: Double, _ f1: Double, _ amp: Double) {
    var phase = 0.0
    for j in 0..<Int(len * sampleRate) {
      let p = Double(j) / (len * sampleRate)
      phase += 2 * .pi * f0 * pow(f1 / f0, p) / sampleRate
      add(Int(start * sampleRate) + j, amp * sin(phase) * sin(.pi * p))
    }
  }
  sweep(0.05, 0.7, 60, 900, 0.12)
  sweep(duration - 0.6, 0.5, 900, 40, 0.13)
  // Riser through the fast exploration, cut dead when the cuts stop.
  do {
    var phase = 0.0, bp = 0.0
    let s0 = Int(montageStart * sampleRate), len = Int((holdStart - montageStart) * sampleRate)
    for j in 0..<len {
      let p = Double(j) / Double(len)
      phase += 2 * .pi * (180 * pow(5, p)) / sampleRate
      bp += (0.02 + 0.2 * p) * ((r.next() * 2 - 1) - bp)
      add(s0 + j, (0.05 * sin(phase) + 0.12 * bp) * pow(p, 1.6) * (1 - 0.5 * voiceActive(montageStart + p * (holdStart - montageStart))))
    }
  }
  func kick(_ at: Double, _ amp: Double, _ decay: Double = 0.22) {
    var phase = 0.0
    for j in 0..<Int(0.8 * sampleRate) {
      let tj = Double(j) / sampleRate
      phase += 2 * .pi * (38 + 95 * exp(-tj / 0.05)) / sampleRate
      add(Int(at * sampleRate) + j, amp * sin(phase) * exp(-tj / decay))
    }
  }
  kick(8.0, 0.85, 0.5)            // logo drop
  for c in cuts { kick(c.start, 0.32) } // heartbeat that quickens with the cuts
  kick(holdStart, 0.6, 0.35)
  kick(18.0, 0.7, 0.4)             // back from silence
  kick(transmitAt, 0.5); kick(endCard, 0.85, 0.5)
  // Voiceover, processed into a dark "antenna" voice: squeezed into a radio
  // band, driven into distortion, ring-modulated for a metallic wobble, partly
  // bit-crushed, with crackle and brief signal dropouts. A whispered double
  // shadows each narrated line, off to the sides, like someone at your ear.
  func antenna(_ samples: [Float], seed: UInt64, wobbleHz: Double) -> [Double] {
    var rr = RNG(s: seed)
    var hp = 0.0, prev = 0.0, l1 = 0.0, l2 = 0.0
    var out = [Double](repeating: 0, count: samples.count)
    var peak = 0.0
    for j in 0..<samples.count {
      let x = Double(samples[j])
      hp = 0.966 * (hp + x - prev); prev = x
      l1 += 0.34 * (hp - l1); l2 += 0.34 * (l1 - l2)
      out[j] = l2; peak = max(peak, abs(l2))
    }
    var hold = 0.0, dropGain = 1.0
    let block = Int(0.015 * sampleRate)
    for j in 0..<out.count {
      let tj = Double(j) / sampleRate
      if j % block == 0 { dropGain = rr.next() < 0.025 ? 0.12 : 1 }
      let x = out[j] / max(peak, 0.0001)
      let driven = tanh(3.2 * x) / tanh(3.2)
      let ring = driven * sin(2 * .pi * 52 * tj)
      if j % 4 == 0 { hold = (driven * 16).rounded() / 16 }
      let wobble = 0.82 + 0.18 * sin(2 * .pi * wobbleHz * tj) * sin(2 * .pi * 0.7 * tj)
      var v = (0.62 * driven + 0.22 * ring + 0.28 * hold) * wobble * dropGain
      if dropGain < 1 { v += (rr.next() - 0.5) * 0.25 }
      if rr.next() < 0.0006 { v += (rr.next() - 0.5) * 0.6 }
      out[j] = v
    }
    return out
  }
  for (k, v) in voices.enumerated() {
    let s0 = Int(v.start * sampleRate)
    if v.whisper {
      // Whispers stay airy and close, with a long eerie echo.
      let samples = voiceSamples[k]
      var hp = 0.0, prev = 0.0, peak = 0.0
      var processed = [Double](repeating: 0, count: samples.count)
      for j in 0..<samples.count { let x = Double(samples[j]); hp = 0.97 * (hp + x - prev); prev = x; processed[j] = hp; peak = max(peak, abs(hp)) }
      let gain = 0.62 / max(peak, 0.0001)
      for j in 0..<processed.count {
        let x = tanh(processed[j] * gain * 1.6) * 0.7
        add(s0 + j, x)
        for (d, g) in [(0.083, 0.38), (0.161, 0.26), (0.247, 0.18), (0.36, 0.12), (0.5, 0.07)] { add(s0 + j + Int(d * sampleRate), x * g, pan: Int(d * 100) % 2 == 0 ? 0.45 : -0.45) }
      }
      continue
    }
    let voice = antenna(voiceSamples[k], seed: UInt64(k + 1), wobbleHz: 5.5 + Double(k % 3))
    for j in 0..<voice.count {
      let x = voice[j] * 0.7
      add(s0 + j, x)
      for (d, g) in [(0.031, 0.16), (0.053, 0.1)] { add(s0 + j + Int(d * sampleRate), x * g, pan: d > 0.04 ? 0.3 : -0.3) }
    }
    // The whispered shadow: slightly late, panned wide, alternating sides.
    if let double = doubleSamples[k] {
      var hp = 0.0, prev = 0.0, peak = 0.0
      var w = [Double](repeating: 0, count: double.count)
      for j in 0..<double.count { let x = Double(double[j]); hp = 0.97 * (hp + x - prev); prev = x; w[j] = hp; peak = max(peak, abs(hp)) }
      let gain = 0.3 / max(peak, 0.0001), side = k % 2 == 0 ? 0.7 : -0.7
      let lag = Int(0.07 * sampleRate)
      for j in 0..<w.count {
        let x = w[j] * gain
        add(s0 + lag + j, x, pan: side)
        add(s0 + lag + j + Int(0.12 * sampleRate), x * 0.35, pan: -side)
      }
    }
  }
  // The room itself: HIDN's ambient loop (the sound behind [ ♪ ON ] on the
  // site), rising in the hallway and the rooms, gone in the silent beat.
  do {
    let file = try! AVAudioFile(forReading: URL(fileURLWithPath: roomAudioPath))
    let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: file.fileFormat.sampleRate, channels: 2, interleaved: false)!
    let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(file.length))!
    try! file.read(into: buf)
    let n = Int(buf.frameLength), srcL = buf.floatChannelData![0], srcR = buf.floatChannelData![1]
    let ratio = file.fileFormat.sampleRate / sampleRate
    var peakRoom: Float = 0
    for i in 0..<n { peakRoom = max(peakRoom, abs(srcL[i]), abs(srcR[i])) }
    let norm = Double(1 / max(peakRoom, 0.0001))
    for i in 0..<totalSamples {
      let t = Double(i) / sampleRate
      let level = 0.16 + 0.14 * smooth((t - 4.8) / 0.8) * (1 - smooth((t - 17.4) / 0.2)) + 0.08 * smooth((t - endCard) / 1.0)
      let fade = smooth(t / 2.5) * (1 - smooth((t - (duration - 1.4)) / 1.2))
      let gap = 1 - (smooth((t - 17.55) / 0.05) * (1 - smooth((t - 18.0) / 0.05)))
      let duck = 1 - 0.5 * voiceActive(t)
      // Start 4 s into the loop, wrapping around if the ad outlasts it.
      let j = (Int(Double(i) * ratio) + Int(4.0 * file.fileFormat.sampleRate)) % n
      let g = level * fade * gap * duck * norm
      left[i] += Float(Double(srcL[j]) * g); right[i] += Float(Double(srcR[j]) * g)
    }
  }
  var peak: Float = 0
  for i in 0..<totalSamples { left[i] = tanhf(left[i] * 1.15); right[i] = tanhf(right[i] * 1.15); peak = max(peak, abs(left[i]), abs(right[i])) }
  let g = 0.9 / max(peak, 0.001)
  for i in 0..<totalSamples { left[i] *= g; right[i] *= g }
}

// MARK: - Encode

let outURL = URL(fileURLWithPath: "\(outDir)/hidn-ad-voiceover-9x16.mp4")
try? FileManager.default.removeItem(at: outURL)
let writer = try! AVAssetWriter(outputURL: outURL, fileType: .mp4)
let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
videoInput.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
])
let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
  AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: sampleRate, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 192_000,
])
audioInput.expectsMediaDataInRealTime = false
writer.add(videoInput); writer.add(audioInput)
writer.startWriting(); writer.startSession(atSourceTime: .zero)

var asbd = AudioStreamBasicDescription(mSampleRate: sampleRate, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked, mBytesPerPacket: 8, mFramesPerPacket: 1, mBytesPerFrame: 8, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
var audioFormat: CMAudioFormatDescription?
CMAudioFormatDescriptionCreate(allocator: nil, asbd: &asbd, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &audioFormat)

let group = DispatchGroup()
var frameIndex = 0
group.enter()
videoInput.requestMediaDataWhenReady(on: DispatchQueue(label: "video")) {
  while videoInput.isReadyForMoreMediaData {
    if frameIndex >= frameCount { videoInput.markAsFinished(); group.leave(); return }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    let buffer = pb!
    CVPixelBufferLockBaseAddress(buffer, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.translateBy(x: 0, y: CGFloat(H)); ctx.scaleBy(x: 1, y: -1)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: true)
    renderFrame(ctx, frameIndex)
    NSGraphicsContext.restoreGraphicsState()
    CVPixelBufferUnlockBaseAddress(buffer, [])
    adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frameIndex), timescale: fps))
    if frameIndex % 150 == 0 { print("frame \(frameIndex)/\(frameCount)") }
    frameIndex += 1
  }
}
var sampleIndex = 0
let chunk = 4096
group.enter()
audioInput.requestMediaDataWhenReady(on: DispatchQueue(label: "audio")) {
  while audioInput.isReadyForMoreMediaData {
    if sampleIndex >= totalSamples { audioInput.markAsFinished(); group.leave(); return }
    let n = min(chunk, totalSamples - sampleIndex)
    var interleaved = [Float](repeating: 0, count: n * 2)
    for k in 0..<n { interleaved[2 * k] = left[sampleIndex + k]; interleaved[2 * k + 1] = right[sampleIndex + k] }
    var block: CMBlockBuffer?
    let bytes = n * 8
    CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: bytes, blockAllocator: nil, customBlockSource: nil, offsetToData: 0, dataLength: bytes, flags: 0, blockBufferOut: &block)
    interleaved.withUnsafeBytes { CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: block!, offsetIntoDestination: 0, dataLength: bytes) }
    var sample: CMSampleBuffer?
    CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: nil, dataBuffer: block!, formatDescription: audioFormat!, sampleCount: n, presentationTimeStamp: CMTime(value: CMTimeValue(sampleIndex), timescale: CMTimeScale(sampleRate)), packetDescriptions: nil, sampleBufferOut: &sample)
    audioInput.append(sample!)
    sampleIndex += n
  }
}
group.wait()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "wrote \(outURL.path)" : "failed: \(String(describing: writer.error))")
