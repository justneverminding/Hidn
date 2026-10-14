import AppKit
import AVFoundation
import CoreMedia

// HIDN story ad, "A room without names", 9:16, 40 seconds. Mostly typed text,
// one whispered line. Every frame and sound is generated here, except the
// room's own ambient loop from the site and the macOS whisper voice.
//   swift -O marketing/tools/render-ad-story.swift marketing/video
let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "marketing/video"
let shotsDir = "\(outDir)/shots"
let voDir = "\(outDir)/vo"
let roomAudioPath = "marketing/audio/hidn-recording-source.m4a"
let W = 1080, H = 1920
let fps: Int32 = 30
let duration: Double = 40
let frameCount = Int(duration * Double(fps))
let sampleRate: Double = 48_000
let voiceSpeed = 0.92

// MARK: - Palette and type

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r/255, green: g/255, blue: b/255, alpha: a) }
let ground = rgb(2, 5, 3), green = rgb(77, 255, 110), pale = rgb(196, 247, 204), dim = rgb(143, 217, 160), gold = rgb(244, 183, 40)
func mono(_ size: CGFloat, _ weight: NSFont.Weight = .medium) -> NSFont { NSFont.monospacedSystemFont(ofSize: size, weight: weight) }

/// Deterministic randomness so every render is identical.
struct RNG { var s: UInt64; mutating func next() -> Double { s = s &* 6364136223846793005 &+ 1442695040888963407; return Double(s >> 11) / Double(1 << 53) } }

/// How hard the picture is glitching on the frame being drawn.
var currentGlitch = 0.0
func textWidth(_ s: String, _ font: NSFont, kern: CGFloat = 0) -> CGFloat { NSAttributedString(string: s, attributes: [.font: font, .kern: kern]).size().width }
func draw(_ s: String, _ x: CGFloat, _ y: CGFloat, _ font: NSFont, _ color: NSColor, glow: CGFloat = 14, fringe: CGFloat = 0, kern: CGFloat = 0, alpha: CGFloat = 1) {
  func put(_ c: NSColor, _ dx: CGFloat, _ shadow: NSShadow?) {
    var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: c.withAlphaComponent(c.alphaComponent * alpha), .kern: kern]
    if let shadow { attrs[.shadow] = shadow }
    NSAttributedString(string: s, attributes: attrs).draw(at: NSPoint(x: x + dx, y: y))
  }
  let fringe = fringe * CGFloat(min(1, currentGlitch * 2)), glow = glow * 0.3
  if fringe > 0 { put(rgb(255, 60, 90, 0.5), -fringe, nil); put(rgb(60, 200, 255, 0.5), fringe, nil) }
  var sh: NSShadow? = nil
  if glow > 0.5 { let g = NSShadow(); g.shadowColor = color.withAlphaComponent(0.7 * alpha); g.shadowBlurRadius = glow; g.shadowOffset = .zero; sh = g }
  put(color, 0, sh)
}
func drawCentered(_ s: String, _ cy: CGFloat, _ font: NSFont, _ color: NSColor, glow: CGFloat = 14, fringe: CGFloat = 0, kern: CGFloat = 0, alpha: CGFloat = 1) {
  draw(s, (CGFloat(W) - textWidth(s, font, kern: kern)) / 2, cy, font, color, glow: glow, fringe: fringe, kern: kern, alpha: alpha)
}
func smooth(_ x: Double) -> Double { let t = max(0, min(1, x)); return t * t * (3 - 2 * t) }

// MARK: - Story script: a room without names

/// A line typed by a person: uneven keystrokes, hesitation before words and
/// after punctuation, and the odd typo that gets backspaced. The whole line
/// still lands in the time `cps` would give it, so the timeline holds.
struct Typed {
  let text: String; let start: Double; let cps: Double
  /// (time, what is on screen after this keystroke)
  let keys: [(Double, String)]
  init(text: String, start: Double, cps: Double, typo: (at: Int, wrong: String)? = nil) {
    self.text = text; self.start = start; self.cps = cps
    var r = RNG(s: UInt64(text.unicodeScalars.reduce(7) { $0 &* 31 &+ UInt64($1.value) }))
    let chars = Array(text)
    var steps: [(Double, String)] = []
    var shown = ""
    func key(_ gap: Double, _ next: String) { steps.append((gap, next)); shown = next }
    for (i, ch) in chars.enumerated() {
      if let typo, typo.at == i {
        for w in typo.wrong { key(0.6 + r.next() * 0.7, shown + String(w)) }
        key(2.6 + r.next(), shown)          // notices the mistake
        for _ in typo.wrong { key(0.55, String(shown.dropLast())) }
      }
      var gap = 0.45 + r.next() * 1.1      // uneven fingers
      if let typo, typo.at == i { gap += 1.2 } // a breath before retyping
      if r.next() < 0.12 { gap *= 0.4 }    // a fast roll of two keys
      if i > 0 && ".,:".contains(chars[i - 1]) { gap += 1.6 }
      if i > 0 && chars[i - 1] == " " && r.next() < 0.45 { gap += 0.9 + r.next() * 1.4 }
      key(gap, shown + String(ch))
    }
    // Fit the rhythm into the line's original duration.
    let total = steps.reduce(0) { $0 + $1.0 }, span = Double(text.count) / cps
    var at = start; var out: [(Double, String)] = []
    for (gap, s) in steps { at += gap / total * span * (out.isEmpty ? 0 : 1); out.append((at, s)) }
    keys = out
  }
  func visible(_ t: Double) -> String { keys.last(where: { $0.0 <= t })?.1 ?? "" }
  var end: Double { keys.last?.0 ?? start }
}
// 1. Earth.
let earthLines = [
  Typed(text: "> earth.", start: 1.2, cps: 14),
  Typed(text: "> 8,000,000,000 people.", start: 2.2, cps: 18),
  Typed(text: "> every one of them has a name.", start: 3.7, cps: 20, typo: (at: 21, wrong: "s")),
]
// 2. The zoom toward one light.
let zoomStart = 6.0, zoomEnd = 10.0
let zoomLines = [Typed(text: "> but somewhere...", start: 6.3, cps: 16), Typed(text: "> there is a room", start: 7.9, cps: 16)]
// 3. Locating.
let locateStart = 10.0, grantedAt = 11.9
let locateLine = Typed(text: "hidn@earth:~$ locate --room --unnamed", start: 10.15, cps: 34, typo: (at: 31, wrong: "a"))
// 4. Reveal and logo.
let revealStart = 12.5, logoStart = 14.2
// 5. The rooms, flipping like channels, music box speeding up.
let montageStart = 15.8, holdStart = 22.4, holdEnd = 24.4
let cutLengths: [Double] = [0.85, 0.75, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.3, 0.25, 0.3, 0.3]
let cutShots = [1, 0, 2, 4, 3, 5, 1, 2, 0, 4, 3, 5, 1, 0]
struct Cut { let shot: Int; let start: Double; let end: Double; let focus: CGPoint; let zoom: CGFloat }
var cuts: [Cut] = []
do {
  var r = RNG(s: 99)
  var at = montageStart
  for (i, len) in cutLengths.enumerated() where at < holdStart - 0.05 {
    let end = min(at + len, holdStart)
    cuts.append(Cut(shot: cutShots[i], start: at, end: end, focus: CGPoint(x: r.next(), y: 0.2 + r.next() * 0.6), zoom: CGFloat(1.15 + r.next() * 0.9)))
    at = end
  }
}
let cutTimes = cuts.map(\.start) + [holdStart]
let channelFlips: [Double] = [zoomEnd]
let nobodyLine = Typed(text: "> nobody signs.", start: 22.9, cps: 12)
// 6. Proof.
let proofStart = 24.8
let proofLines = [Typed(text: "> no accounts.", start: 25.2, cps: 16), Typed(text: "> no names.", start: 26.6, cps: 16), Typed(text: "> zero knowledge.", start: 27.9, cps: 16, typo: (at: 9, wrong: "w"))]
// 7. Shield.
let shieldStart = 29.6
let shieldLines = [Typed(text: "IF YOUR MONEY", start: 30.0, cps: 15), Typed(text: "CAN BE SHIELDED,", start: 31.0, cps: 15), Typed(text: "SO CAN", start: 32.4, cps: 12), Typed(text: "YOUR THOUGHTS.", start: 33.0, cps: 15)]
// 8. End.
let endCard = 34.4
let whisperAt = 37.0
let glitchCuts: [Double] = [0.9, 6.0, 9.95, 11.9, 12.5, 14.15, 15.8, 24.4, 24.8, 29.6, 34.35, 39.4]
let allTyped = earthLines + zoomLines + [locateLine, nobodyLine] + proofLines + shieldLines
var typeTimes: [Double] = []
for f in allTyped { for (k, key) in f.keys.enumerated() where k == 0 || key.1 != f.keys[k - 1].1 + " " { typeTimes.append(key.0) } }
/// A real cursor stays solid while keys are being pressed.
func typingNow(_ t: Double) -> Bool { typeTimes.contains { t >= $0 && t - $0 < 0.5 } }

// MARK: - The globe: a dark wireframe Earth of dots with city lights

struct GlobePoint { let lat: Double; let lon: Double; let land: Bool; let city: Bool; let phase: Double }
var globe: [GlobePoint] = []
do {
  var r = RNG(s: 2024)
  let n = 2600, golden = Double.pi * (3 - sqrt(5))
  for i in 0..<n {
    let y = 1 - 2 * (Double(i) + 0.5) / Double(n)
    let lat = asin(y), lon = golden * Double(i)
    // Blobby procedural continents.
    let f = sin(3 * lon) * cos(2 * lat) + 0.6 * sin(5 * lon + 1) * sin(3 * lat + 0.5) + 0.4 * cos(7 * lon - 2 * lat) + 0.3 * cos(lat * 4)
    let land = f > 0.35
    globe.append(GlobePoint(lat: lat, lon: lon, land: land, city: land && r.next() < 0.14, phase: r.next() * 6.28))
  }
}
let globeTilt = 0.38
/// The rotation at time t; it slows during the zoom so the target light settles.
func globeRotation(_ t: Double) -> Double { 0.9 + 0.12 * t - 0.25 * smooth((t - zoomStart) / (zoomEnd - zoomStart)) }
/// The one light the camera falls toward: chosen so it faces the viewer at the end of the zoom.
let targetLat = 0.32
let targetLon = -globeRotation(zoomEnd)
func project(_ lat: Double, _ lon: Double, _ rot: Double) -> (x: Double, y: Double, z: Double) {
  let x = cos(lat) * sin(lon + rot), y = sin(lat), z = cos(lat) * cos(lon + rot)
  return (x, y * cos(globeTilt) - z * sin(globeTilt), y * sin(globeTilt) + z * cos(globeTilt))
}
var stars: [(CGFloat, CGFloat, CGFloat, Double)] = []
do { var r = RNG(s: 77); for _ in 0..<260 { stars.append((CGFloat(r.next()) * CGFloat(W), CGFloat(r.next()) * CGFloat(H), CGFloat(0.6 + r.next() * 2.2), r.next() * 6.28)) } }

func drawGlobe(_ ctx: CGContext, _ t: Double) {
  NSColor.black.setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
  let z = smooth((t - zoomStart) / (zoomEnd - zoomStart))
  for (x, y, s, ph) in stars {
    let a = (0.25 + 0.35 * (0.5 + 0.5 * sin(t * 1.7 + ph))) * (1 - z)
    rgb(200, 255, 215, CGFloat(a)).setFill(); NSBezierPath(ovalIn: NSRect(x: x, y: y, width: s, height: s)).fill()
  }
  let rot = globeRotation(t)
  // The camera falls toward the target: the radius grows and the target moves to the centre.
  let radius = 430 * CGFloat(exp(4.0 * pow(z, 1.7)))
  let tp = project(targetLat, targetLon, rot)
  let cx0 = CGFloat(W) / 2, cy0 = CGFloat(H) * 0.47
  let cx = cx0 - CGFloat(tp.x) * radius * CGFloat(z), cy = cy0 + CGFloat(tp.y) * radius * CGFloat(z)
  // Atmosphere glow.
  let c = NSPoint(x: cx, y: cy)
  NSGradient(colors: [rgb(40, 140, 70, 0.0), rgb(40, 140, 70, 0.22), rgb(0, 0, 0, 0)], atLocations: [0.82, 0.92, 1], colorSpace: .sRGB)!
    .draw(fromCenter: c, radius: 0, toCenter: c, radius: radius * 1.18, options: [])
  rgb(2, 10, 5, 0.92).setFill(); NSBezierPath(ovalIn: NSRect(x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2)).fill()
  // Wireframe meridians and parallels.
  rgb(77, 255, 110, 0.13).setStroke()
  for m in 0..<12 {
    let path = NSBezierPath(); var started = false
    for k in 0...48 {
      let lat = -Double.pi / 2 + Double.pi * Double(k) / 48, p = project(lat, Double(m) * Double.pi / 6, rot)
      let pt = NSPoint(x: cx + CGFloat(p.x) * radius, y: cy - CGFloat(p.y) * radius)
      if p.z > 0 { if started { path.line(to: pt) } else { path.move(to: pt); started = true } } else { started = false }
    }
    path.lineWidth = 1.2; path.stroke()
  }
  for pr in stride(from: -60.0, through: 60.0, by: 30.0) {
    let path = NSBezierPath(); var started = false
    for k in 0...96 {
      let p = project(pr * .pi / 180, Double(k) * 2 * .pi / 96, rot)
      let pt = NSPoint(x: cx + CGFloat(p.x) * radius, y: cy - CGFloat(p.y) * radius)
      if p.z > 0 { if started { path.line(to: pt) } else { path.move(to: pt); started = true } } else { started = false }
    }
    path.lineWidth = 1.2; path.stroke()
  }
  // Dots: land green, ocean faint, cities twinkling gold.
  let dot = max(3.2, 3.2 * radius / 430 * 0.5)
  for g in globe {
    let p = project(g.lat, g.lon, rot)
    guard p.z > 0.02 else { continue }
    let px = cx + CGFloat(p.x) * radius, py = cy - CGFloat(p.y) * radius
    if px < -20 || px > CGFloat(W) + 20 || py < -20 || py > CGFloat(H) + 20 { continue }
    let shade = CGFloat(0.35 + 0.65 * p.z)
    if g.city {
      let tw = 0.6 + 0.4 * sin(t * 3 + g.phase)
      rgb(244, 200, 90, shade * CGFloat(tw)).setFill()
      NSBezierPath(ovalIn: NSRect(x: px - dot * 0.75, y: py - dot * 0.75, width: dot * 1.5, height: dot * 1.5)).fill()
    } else if g.land {
      rgb(77, 255, 110, shade * 0.95).setFill(); NSRect(x: px - dot / 2, y: py - dot / 2, width: dot, height: dot).fill()
    } else {
      rgb(77, 255, 110, shade * 0.12).setFill(); NSRect(x: px - dot / 3, y: py - dot / 3, width: dot / 1.5, height: dot / 1.5).fill()
    }
  }
  // The target light: a pulsing green beacon with surveillance brackets.
  if tp.z > 0 {
    let px = cx + CGFloat(tp.x) * radius, py = cy - CGFloat(tp.y) * radius
    let pulse = CGFloat(0.5 + 0.5 * sin(t * 6))
    let b = NSPoint(x: px, y: py)
    // Small and quiet until the camera commits to it.
    NSGradient(colors: [rgb(77, 255, 110, 0.95), rgb(77, 255, 110, 0)])!.draw(fromCenter: b, radius: 0, toCenter: b, radius: 9 + 7 * pulse + 30 * CGFloat(z), options: [])
    if t > 5.5 {
      let s: CGFloat = 70 + 20 * pulse, arm: CGFloat = 22
      rgb(196, 247, 204, 0.85).setStroke()
      for (dx, dy) in [(-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)] {
        let x0 = px + CGFloat(dx) * s, y0 = py + CGFloat(dy) * s
        let p = NSBezierPath(); p.move(to: NSPoint(x: x0 - CGFloat(dx) * arm, y: y0)); p.line(to: NSPoint(x: x0, y: y0)); p.line(to: NSPoint(x: x0, y: y0 - CGFloat(dy) * arm)); p.lineWidth = 3; p.stroke()
      }
    }
  }
  // The dive: a city at night rushes up around the target, lights and streets
  // spreading outward as the camera falls through them.
  let cityA = smooth((z - 0.3) / 0.35)
  if cityA > 0 {
    let tx = cx + CGFloat(tp.x) * radius, ty = cy - CGFloat(tp.y) * radius
    let scale = 30 * CGFloat(exp(4.6 * z))
    let ga = CGFloat(cityA)
    rgb(77, 255, 110, 0.18 * ga).setStroke()
    for k in -14...14 {
      let off = CGFloat(k) * 0.9 * scale
      let h = NSBezierPath(); h.move(to: NSPoint(x: tx - 30 * scale, y: ty + off)); h.line(to: NSPoint(x: tx + 30 * scale, y: ty + off)); h.lineWidth = 1.2; h.stroke()
      let v = NSBezierPath(); v.move(to: NSPoint(x: tx + off * 1.1, y: ty - 30 * scale)); v.line(to: NSPoint(x: tx + off * 1.1, y: ty + 30 * scale)); v.lineWidth = 1.2; v.stroke()
    }
    var cr = RNG(s: 31)
    for _ in 0..<700 {
      let ox = CGFloat((cr.next() - 0.5) * 2) * 26, oy = CGFloat((cr.next() - 0.5) * 2) * 26
      let px = tx + ox * scale * 0.5, py = ty + oy * scale * 0.5
      if px < -40 || px > CGFloat(W) + 40 || py < -40 || py > CGFloat(H) + 40 { continue }
      let warm = cr.next() < 0.55
      let sz = CGFloat(1.5 + cr.next() * 2.5) * min(6, max(1, scale / 60))
      (warm ? rgb(244, 200, 90, 0.85 * ga) : rgb(150, 255, 180, 0.6 * ga)).setFill()
      NSBezierPath(ovalIn: NSRect(x: px - sz / 2, y: py - sz / 2, width: sz, height: sz)).fill()
    }
  }
  // White-out as the camera arrives.
  let arrive = smooth((t - (zoomEnd - 0.35)) / 0.35)
  if arrive > 0 { rgb(220, 255, 230, CGFloat(arrive) * 0.9).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill() }
}
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
// MARK: - Shared visual pieces

func fillGround(_ alpha: CGFloat = 1) {
  ground.withAlphaComponent(alpha).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
}
func bloom(_ c: NSPoint, _ r: CGFloat, _ a: CGFloat) {
  NSGradient(colors: [rgb(50, 140, 70, a * 0.45), rgb(0, 0, 0, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: r, options: [])
}
func cursorBlock(_ x: CGFloat, _ y: CGFloat, _ h: CGFloat, _ t: Double) {
  if typingNow(t) || Int(t * 2.2) % 2 == 0 { green.setFill(); NSRect(x: x, y: y, width: h * 0.55, height: h).fill() }
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

// MARK: - Scenes

/// A typed terminal line; the cursor sits on the line being typed.
func typed(_ l: Typed, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ color: NSColor, _ t: Double, active: Bool, glow: CGFloat = 12, fringe: CGFloat = 1.5) {
  guard t >= l.start else { return }
  let s = l.visible(t), f = mono(size)
  draw(s, x, y, f, color, glow: glow, fringe: fringe)
  if active { cursorBlock(x + textWidth(s, f) + 6, y + size * 0.15, size * 0.85, t) }
}
func activeIndex(_ lines: [Typed], _ t: Double) -> Int? { lines.lastIndex(where: { t >= $0.start }) }

func sceneEarth(_ ctx: CGContext, _ t: Double) {
  drawGlobe(ctx, t)
  let lines = t < zoomStart ? earthLines : zoomLines
  let a = activeIndex(lines, t)
  let fade = t < zoomStart ? CGFloat(1 - smooth((t - 5.6) / 0.4)) : 1
  ctx.saveGState(); ctx.setAlpha(fade)
  for (i, l) in lines.enumerated() { typed(l, 80, 1450 + CGFloat(i) * 70, 44, i == 0 && t < zoomStart ? pale : green, t, active: i == a) }
  ctx.restoreGState()
}

func sceneLocate(_ ctx: CGContext, _ t: Double) {
  fillGround()
  bloom(NSPoint(x: W / 2, y: 900), 800, 0.18)
  let win = NSRect(x: 60, y: 700, width: CGFloat(W) - 120, height: 460)
  terminalWindow(win, title: "hidn@earth: ~")
  typed(locateLine, win.minX + 40, win.minY + 110, 30, dim, t, active: t < locateLine.end + 0.1, glow: 6, fringe: 0)
  if t > locateLine.end + 0.1 {
    let p = min(1, (t - locateLine.end - 0.1) / (grantedAt - locateLine.end - 0.25))
    let blocks = 18, filled = Int(Double(blocks) * p)
    let bar = String(repeating: "▓", count: filled) + String(repeating: "░", count: blocks - filled)
    draw("> locating room  \(bar)  \(Int(p * 100))%", win.minX + 40, win.minY + 180, mono(32), green, glow: 10)
  }
  if t >= grantedAt {
    let flash = CGFloat(1 - smooth((t - grantedAt) / 0.4))
    if flash > 0 { rgb(77, 255, 110, 0.18 * flash).setFill(); win.fill() }
    draw("[ ACCESS GRANTED ]", win.minX + 40, win.minY + 270, mono(54, .bold), green, glow: 20, fringe: 3)
  }
}

func sceneReveal(_ ctx: CGContext, _ t: Double) {
  NSColor.black.setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
  bloom(NSPoint(x: W / 2, y: H / 2), 700, 0.14)
  // "A ROOM" fades up, then "WITHOUT NAMES." slams in on the hit.
  let a = CGFloat(smooth((t - revealStart) / 0.3))
  drawCentered("A ROOM", 790, mono(64, .regular), pale, glow: 12, kern: 12, alpha: a)
  if t >= revealStart + 0.75 {
    let shake = CGFloat(t < revealStart + 0.95 ? sin(t * 140) * 10 : 0)
    let f = mono(104, .bold)
    draw("WITHOUT NAMES.", (CGFloat(W) - textWidth("WITHOUT NAMES.", f, kern: 4)) / 2 + shake, 880, f, green, glow: 26, fringe: 5, kern: 4)
  }
}

func sceneLogo(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let p = smooth((t - logoStart) / 0.3)
  bloom(NSPoint(x: W / 2, y: H / 2), 900, 0.3 * CGFloat(p))
  logo(ctx, cx: CGFloat(W) / 2, cy: CGFloat(H) / 2 - 40, size: 200, alpha: CGFloat(p))
}

func sceneRooms(_ ctx: CGContext, _ t: Double) {
  if let i = cuts.firstIndex(where: { t >= $0.start && t < $0.end }) {
    let c = cuts[i], p = (t - c.start) / (c.end - c.start)
    roomShot(ctx, c.shot, focus: c.focus, zoom: c.zoom + 0.1 * CGFloat(p), t: t, light: 0.5)
    osd(i + 1, t)
  } else {
    let p = (t - holdStart) / (holdEnd - holdStart)
    roomShot(ctx, 2, focus: CGPoint(x: 0.12, y: 0.32), zoom: 1.35 + 0.18 * CGFloat(p), t: t, light: 0.35)
    let bar = NSRect(x: 50, y: 1560, width: CGFloat(W) - 100, height: 120)
    if t >= nobodyLine.start {
      rgb(2, 6, 3, 0.86).setFill(); NSBezierPath(roundedRect: bar, xRadius: 16, yRadius: 16).fill()
      typed(nobodyLine, bar.minX + 36, bar.minY + 32, 48, green, t, active: true, glow: 14, fringe: 2)
    }
  }
}

func sceneProof(_ ctx: CGContext, _ t: Double) {
  fillGround()
  bloom(NSPoint(x: W / 2, y: 900), 900, 0.2)
  let win = NSRect(x: 80, y: 700, width: CGFloat(W) - 160, height: 480)
  let p = CGFloat(smooth((t - proofStart) / 0.3))
  ctx.saveGState(); ctx.setAlpha(p)
  terminalWindow(win, title: "hidn@room: ~/rules")
  let a = activeIndex(proofLines, t)
  for (i, l) in proofLines.enumerated() { typed(l, win.minX + 50, win.minY + 130 + CGFloat(i) * 100, 60, green, t, active: i == a, glow: 16, fringe: 2) }
  ctx.restoreGState()
}

func sceneShield(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let p = smooth((t - shieldStart) / 0.5)
  bloom(NSPoint(x: W / 2, y: H / 2), 800, 0.16 * CGFloat(p))
  let f = mono(68, .bold), a = activeIndex(shieldLines, t)
  for (i, l) in shieldLines.enumerated() where t >= l.start {
    let x = (CGFloat(W) - textWidth(l.text, f, kern: 3)) / 2
    let y: CGFloat = i < 2 ? 700 + CGFloat(i) * 90 : 960 + CGFloat(i - 2) * 90
    let s = l.visible(t)
    draw(s, x, y, f, i < 2 ? gold : green, glow: 16, fringe: 3, kern: 3)
    if i == a { cursorBlock(x + textWidth(s, f, kern: 3) + 8, y + 10, 64, t) }
  }
}

func sceneEnd(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let p = smooth((t - endCard) / 0.5)
  bloom(NSPoint(x: W / 2, y: H / 2 - 80), 950, 0.3 * CGFloat(p))
  logo(ctx, cx: CGFloat(W) / 2, cy: CGFloat(H) / 2 - 240, size: 200, alpha: CGFloat(p))
  if t > endCard + 0.6 { drawCentered("A ROOM WITHOUT NAMES.", CGFloat(H) / 2 - 60, mono(46, .regular), pale, glow: 12, kern: 6, alpha: CGFloat(smooth((t - endCard - 0.6) / 0.4))) }
  if t > endCard + 1.4 {
    let a = CGFloat(smooth((t - endCard - 1.4) / 0.4))
    let label = "[ ENTER THE ROOM ]", f = mono(44)
    let bw = textWidth(label, f, kern: 4) + 80, bx = (CGFloat(W) - bw) / 2, by = CGFloat(H) / 2 + 80
    let blink = t > whisperAt && Int(t * 2.5) % 2 == 0
    rgb(77, 255, 110, (blink ? 0.3 : 0.12) * a).setFill(); NSRect(x: bx, y: by, width: bw, height: 100).fill()
    rgb(77, 255, 110, 0.8 * a).setStroke(); let o = NSBezierPath(rect: NSRect(x: bx, y: by, width: bw, height: 100)); o.lineWidth = 3; o.stroke()
    draw(label, bx + 40, by + 26, f, green, glow: 14, kern: 4, alpha: a)
  }
  if t > endCard + 2.0 {
    let a = CGFloat(smooth((t - endCard - 2.0) / 0.4))
    drawCentered("SOME THOUGHTS ARE MEANT TO BE HIDN", CGFloat(H) - 300, mono(28, .regular), dim, glow: 0, kern: 3, alpha: a)
    drawCentered("BUILT ON ZCASH", CGFloat(H) - 240, mono(28, .regular), gold, glow: 6, kern: 4, alpha: a)
  }
  let off = smooth((t - (duration - 0.6)) / 0.45)
  if off > 0 {
    NSColor.black.withAlphaComponent(CGFloat(off)).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
    let lh = CGFloat(H) * CGFloat(1 - off) * 0.5
    if off < 1 { rgb(196, 247, 204, 0.6 * CGFloat(1 - off)).setFill(); NSRect(x: 0, y: CGFloat(H) / 2 - lh / 2, width: CGFloat(W), height: max(3, lh * 0.02)).fill() }
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
  // Film grain, a different patch of noise every frame, and the slight
  // exposure breathing of a camera pointed at a screen.
  var gr = RNG(s: UInt64(frame) &* 7919 &+ 3)
  let grain = noiseFrames[Int(gr.next() * Double(noiseFrames.count))]
  ctx.saveGState(); ctx.setBlendMode(.overlay)
  let ox = CGFloat(gr.next()) * -200, oy = CGFloat(gr.next()) * -200
  drawImage(ctx, grain, CGRect(x: ox, y: oy, width: CGFloat(W) + 200, height: CGFloat(H) + 200), alpha: 0.22)
  ctx.restoreGState()
  rgb(0, 0, 0, CGFloat(0.03 + 0.05 * gr.next())).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
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
  currentGlitch = glitchAmount(t)
  // Handheld: slow drift plus a little hand tremor, never perfectly still.
  let sx = 7 * sin(t * 0.83) + 4 * sin(t * 2.1 + 1) + 1.2 * sin(t * 9.7)
  let sy = 6 * sin(t * 0.67 + 2) + 3 * sin(t * 1.9) + 1.0 * sin(t * 11.3 + 0.5)
  let rot = 0.0022 * sin(t * 0.55) + 0.0008 * sin(t * 3.1)
  ctx.saveGState()
  ctx.translateBy(x: CGFloat(W) / 2 + CGFloat(sx), y: CGFloat(H) / 2 + CGFloat(sy))
  ctx.rotate(by: CGFloat(rot)); ctx.scaleBy(x: 1.025, y: 1.025)
  ctx.translateBy(x: -CGFloat(W) / 2, y: -CGFloat(H) / 2)
  if t < zoomEnd { sceneEarth(ctx, t) }
  else if t < revealStart { sceneLocate(ctx, t) }
  else if t < logoStart { sceneReveal(ctx, t) }
  else if t < montageStart { sceneLogo(ctx, t) }
  else if t < holdEnd { sceneRooms(ctx, t) }
  else if t < proofStart { NSColor.black.setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill() }
  else if t < shieldStart { sceneProof(ctx, t) }
  else if t < endCard { sceneShield(ctx, t) }
  else { sceneEnd(ctx, t) }
  ctx.restoreGState()
  postEffects(ctx, t, frame)
}

// MARK: - Soundtrack

let totalSamples = Int(duration * sampleRate)
var left = [Float](repeating: 0, count: totalSamples), right = [Float](repeating: 0, count: totalSamples)
func add(_ i: Int, _ v: Double, pan: Double = 0) {
  guard i >= 0 && i < totalSamples else { return }
  left[i] += Float(v * (1 - max(0, pan))); right[i] += Float(v * (1 + min(0, pan)))
}
let silence = (24.4, 24.8)
func gapGain(_ t: Double) -> Double { 1 - smooth((t - (silence.0 - 0.05)) / 0.05) * (1 - smooth((t - silence.1) / 0.05)) }
do {
  var r = RNG(s: 42)
  // Dark bed: detuned saws on a D minor chord, low-passed, with wind and hum.
  let chord: [(Double, Double, Double)] = [(36.71, 0, 0.42), (55.0, -0.15, 0.3), (73.42, 0.2, 0.22), (87.31, -0.25, 0.16), (110.0, 0.3, 0.08)]
  var phases = [Double](repeating: 0, count: chord.count * 2)
  var l1 = 0.0, l2 = 0.0, r1 = 0.0, r2 = 0.0, low = 0.0, band = 0.0
  for i in 0..<totalSamples {
    let t = Double(i) / sampleRate
    let fade = smooth(t / 2.0) * (1 - smooth((t - (duration - 1.6)) / 1.3))
    let tension = smooth((t - montageStart) / 6.6) * (1 - smooth((t - holdStart) / 0.25)) + 0.6 * smooth((t - zoomStart) / 4) * (1 - smooth((t - zoomEnd) / 0.3))
    var sl = 0.0, sr = 0.0
    for (k, (f, pan, amp)) in chord.enumerated() {
      for d in 0..<2 {
        let idx = k * 2 + d
        phases[idx] += (f * (d == 0 ? 1.0016 : 0.9984)) / sampleRate
        if phases[idx] >= 1 { phases[idx] -= 1 }
        let v = (2 * phases[idx] - 1) * amp * (0.8 + 0.2 * sin(2 * .pi * (0.07 + 0.013 * Double(k)) * t + Double(k)))
        if d == 0 { sl += v * (1 - max(0, pan)); sr += v * 0.6 * (1 + min(0, pan)) } else { sr += v * (1 + min(0, pan)); sl += v * 0.6 * (1 - max(0, pan)) }
      }
    }
    let fc = 100 + 240 * (0.5 + 0.5 * sin(2 * .pi * 0.045 * t)) + 1000 * tension
    let a = 1 - exp(-2 * .pi * fc / sampleRate)
    l1 += a * (sl - l1); l2 += a * (l1 - l2); r1 += a * (sr - r1); r2 += a * (r1 - r2)
    let n = r.next() * 2 - 1
    let wc = 250 + 650 * (0.5 + 0.5 * sin(2 * .pi * 0.06 * t + 1.3))
    let f = 2 * sin(.pi * wc / sampleRate)
    low += f * band; let high = n - low - 0.7 * band; band += f * high
    let env = fade * gapGain(t)
    let crackle = r.next() < 0.0003 ? (r.next() - 0.5) * 0.1 : 0
    add(i, (l2 * 0.5 + band * 0.045 + crackle) * env, pan: -0.2)
    add(i, (r2 * 0.5 + band * 0.05) * env, pan: 0.2)
  }

  // Music box: an original childlike tune in A minor. Sparse over the Earth,
  // racing through the rooms, then winding down off-key when the cuts stop.
  let melody: [Double] = [12, 7, 12, 7, 10, 8, 7, 5, 3, 5, 7, 0, 2, 3, 2, -2]
  func musicBoxNote(_ at: Double, _ semis: Double, _ amp: Double, pitch: Double = 1, pan: Double = 0) {
    let f0 = 440 * pow(2, semis / 12) * pitch
    let s0 = Int(at * sampleRate)
    for j in 0..<Int(1.4 * sampleRate) {
      let tj = Double(j) / sampleRate
      var v = 1.0 * sin(2 * .pi * f0 * tj) * exp(-tj / 0.9) + 0.35 * sin(2 * .pi * f0 * 3.95 * tj) * exp(-tj / 0.25) + 0.12 * sin(2 * .pi * f0 * 9.8 * tj) * exp(-tj / 0.06)
      v *= min(1, tj / 0.002)
      add(s0 + j, amp * v, pan: pan)
      add(s0 + j + Int(0.19 * sampleRate), amp * v * 0.22, pan: -pan) // a small, hollow echo
    }
  }
  for (k, at) in [1.8, 2.8, 3.8, 4.8].enumerated() { musicBoxNote(at, melody[k], 0.06, pitch: 0.995, pan: k % 2 == 0 ? -0.25 : 0.25) }
  var at = montageStart, k = 0
  while at < holdStart {
    let p = (at - montageStart) / (holdStart - montageStart)
    musicBoxNote(at, melody[k % melody.count], 0.075 + 0.03 * p, pitch: 1 + 0.06 * p, pan: k % 2 == 0 ? -0.3 : 0.3)
    at += 0.36 - 0.24 * p; k += 1
  }
  var interval = 0.15, pitch = 1.0
  at = holdStart
  while at < holdStart + 1.7 {
    musicBoxNote(at, melody[k % melody.count], 0.08, pitch: pitch, pan: k % 2 == 0 ? -0.2 : 0.2)
    at += interval; interval *= 1.32; pitch *= 0.94; k += 1
  }
  for (j, a) in [35.0, 35.8, 36.6].enumerated() { musicBoxNote(a, melody[j + 8], 0.05, pitch: 0.94, pan: 0) }

  // The head turn: a slow mechanical servo whirr with gear clicks before the reveal.
  do {
    let s0 = Int((revealStart - 0.15) * sampleRate), len = Int(0.85 * sampleRate)
    var ph = 0.0, lp = 0.0
    for j in 0..<len {
      let p = Double(j) / Double(len)
      let f = 130 + 210 * sin(.pi * p)
      ph += f / sampleRate; if ph >= 1 { ph -= 1 }
      lp += 0.08 * ((2 * ph - 1) - lp)
      let click = (j % Int(0.022 * sampleRate)) < 40 ? (r.next() - 0.5) * 0.5 : 0
      add(s0 + j, (0.16 * lp + 0.08 * click) * sin(.pi * p))
    }
  }

  // Terminal beeps.
  func beep(_ at: Double, _ f: Double, _ len: Double, _ amp: Double) {
    for j in 0..<Int(len * sampleRate) {
      let tj = Double(j) / sampleRate
      add(Int(at * sampleRate) + j, amp * (sin(2 * .pi * f * tj) > 0 ? 1 : -1) * min(1, tj / 0.003) * (1 - tj / len))
    }
  }
  beep(locateLine.start, 660, 0.06, 0.05)
  beep(grantedAt, 880, 0.08, 0.06); beep(grantedAt + 0.1, 1320, 0.12, 0.06)
  for l in proofLines { beep(l.start - 0.05, 520, 0.05, 0.045) }

  // Typewriter keys.
  for tt in typeTimes {
    let s0 = Int(tt * sampleRate), pan = (r.next() - 0.5) * 0.6
    let amp = 0.13 + r.next() * 0.07, tone = 1500 + r.next() * 900
    for j in 0..<Int(0.03 * sampleRate) {
      let tj = Double(j) / sampleRate
      add(s0 + j, amp * ((r.next() * 2 - 1) * exp(-tj / 0.004) + 0.5 * sin(2 * .pi * tone * tj) * exp(-tj / 0.0025) + 0.3 * sin(2 * .pi * 180 * tj) * exp(-tj / 0.01)), pan: pan)
    }
  }
  // Channel static and glitch bursts.
  for c in cutTimes + channelFlips {
    let s0 = Int(c * sampleRate)
    var hp = 0.0, prev = 0.0
    for j in 0..<Int(0.09 * sampleRate) {
      let n = r.next() * 2 - 1; hp = 0.85 * (hp + n - prev); prev = n
      add(s0 + j, 0.2 * hp * (1 - Double(j) / (0.09 * sampleRate)), pan: (r.next() - 0.5) * 0.5)
    }
  }
  for c in glitchCuts {
    let s0 = Int((c - 0.06) * sampleRate), len = Int(0.16 * sampleRate)
    var hold = 0.0, holdLeft = 0
    for j in 0..<len {
      if holdLeft <= 0 { hold = r.next() * 2 - 1; holdLeft = 6 + Int(r.next() * 40) }
      holdLeft -= 1
      let tj = Double(j) / sampleRate, env = sin(.pi * Double(j) / Double(len))
      let buzz = (sin(2 * .pi * 118 * tj) > 0 ? 1.0 : -1.0) * 0.4
      add(s0 + j, 0.16 * env * ((Int(tj * 60) % 2 == 0) ? 1 : 0.35) * (hold + buzz), pan: (r.next() - 0.5) * 0.8)
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
  sweep(0.05, 0.7, 60, 900, 0.1)
  sweep(duration - 0.6, 0.5, 900, 40, 0.12)
  // Rising whoosh as the camera falls toward the Earth.
  do {
    var bp = 0.0
    let s0 = Int(zoomStart * sampleRate), len = Int((zoomEnd - zoomStart) * sampleRate)
    for j in 0..<len {
      let p = Double(j) / Double(len)
      bp += (0.01 + 0.3 * p * p) * ((r.next() * 2 - 1) - bp)
      add(s0 + j, 0.2 * bp * pow(p, 2.2), pan: sin(Double(j) / sampleRate * 3) * 0.3)
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
  func braam(_ at: Double, _ amp: Double) {
    var ph = [0.0, 0.0, 0.0, 0.0], lp1 = 0.0, lp2 = 0.0
    let freqs = [36.71, 36.9, 73.42, 55.0]
    for j in 0..<Int(3.2 * sampleRate) {
      let tj = Double(j) / sampleRate
      var x = 0.0
      for q in 0..<4 { ph[q] += freqs[q] / sampleRate; if ph[q] >= 1 { ph[q] -= 1 }; x += (2 * ph[q] - 1) * (q == 2 ? 0.5 : 1) }
      let a = 1 - exp(-2 * .pi * (90 + 1400 * exp(-tj / 0.35)) / sampleRate)
      lp1 += a * (x - lp1); lp2 += a * (lp1 - lp2)
      add(Int(at * sampleRate) + j, amp * lp2 * min(1, tj / 0.02) * exp(-tj / 1.4))
    }
  }
  kick(zoomEnd, 0.5, 0.3)
  braam(revealStart + 0.75, 0.36); kick(revealStart + 0.75, 0.8, 0.45)
  kick(logoStart, 0.6, 0.4)
  for c in cuts { kick(c.start, 0.3) }
  kick(proofStart, 0.6, 0.35)
  kick(shieldStart, 0.45, 0.4)
  braam(endCard, 0.34); kick(endCard, 0.75, 0.5)

  // The room's own sound, the interface loop from the site.
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
      let level = 0.14 + 0.16 * smooth((t - montageStart + 1.6) / 1.0) * (1 - smooth((t - holdEnd) / 0.2)) + 0.1 * smooth((t - endCard) / 1.0)
      let fade = smooth(t / 3.0) * (1 - smooth((t - (duration - 1.4)) / 1.2))
      let j = (Int(Double(i) * ratio) + Int(4.0 * file.fileFormat.sampleRate)) % n
      let g = level * fade * gapGain(t) * norm
      left[i] += Float(Double(srcL[j]) * g); right[i] += Float(Double(srcR[j]) * g)
    }
  }

  // One whisper at the very end: "come in."
  do {
    let samples = loadVoice("\(voDir)/03.aiff")
    var hp = 0.0, prev = 0.0, peak = 0.0
    var processed = [Double](repeating: 0, count: samples.count)
    for j in 0..<samples.count { let x = Double(samples[j]); hp = 0.97 * (hp + x - prev); prev = x; processed[j] = hp; peak = max(peak, abs(hp)) }
    let gain = 0.7 / max(peak, 0.0001), s0 = Int(whisperAt * sampleRate)
    for j in 0..<processed.count {
      let x = tanh(processed[j] * gain * 1.6) * 0.75
      add(s0 + j, x)
      for (d, g) in [(0.083, 0.4), (0.161, 0.28), (0.247, 0.19), (0.36, 0.13), (0.5, 0.08)] { add(s0 + j + Int(d * sampleRate), x * g, pan: Int(d * 100) % 2 == 0 ? 0.45 : -0.45) }
    }
  }

  var peak: Float = 0
  for i in 0..<totalSamples { left[i] = tanhf(left[i] * 1.15); right[i] = tanhf(right[i] * 1.15); peak = max(peak, abs(left[i]), abs(right[i])) }
  let g = 0.9 / max(peak, 0.001)
  for i in 0..<totalSamples { left[i] *= g; right[i] *= g }
}

// MARK: - Encode

let outURL = URL(fileURLWithPath: "\(outDir)/hidn-ad-story-9x16.mp4")
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
