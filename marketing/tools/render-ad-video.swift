import AppKit
import AVFoundation
import CoreMedia

// HIDN ad, 9:16, ~38 seconds, with a synthesized soundtrack. Every frame and
// every sound is generated here: no stock footage or licensed audio.
//   swift marketing/tools/render-ad-video.swift marketing/video
let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "marketing/video"
let shotsDir = "\(outDir)/shots"
let W = 1080, H = 1920
let fps: Int32 = 30
let duration: Double = 38
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

// MARK: - Script: every typed line, with the time each character appears.

struct Typed { let text: String; let start: Double; let cps: Double
  func visible(_ t: Double) -> String { let n = Int(max(0, (t - start) * cps)); return String(text.prefix(min(n, text.count))) }
  var end: Double { start + Double(text.count) / cps }
}
let bootLine = Typed(text: "hidn@room:~$ ./connect --without-a-name", start: 0.9, cps: 28)
let hook = [Typed(text: "SOME THOUGHTS", start: 2.7, cps: 16), Typed(text: "CAN'T BE SAID", start: 3.7, cps: 16), Typed(text: "OUT LOUD.", start: 4.7, cps: 16)]
let hook2 = [Typed(text: "SO SAY THEM", start: 6.2, cps: 18), Typed(text: "WITHOUT A NAME.", start: 7.0, cps: 18)]
struct Shot { let file: String; let caption: String; let start: Double; let end: Double; let focus: CGPoint }
let shots = [
  Shot(file: "01-main-room.jpg", caption: "a private room.", start: 10.0, end: 12.4, focus: CGPoint(x: 0.5, y: 0.55)),
  Shot(file: "02-hallway.jpg", caption: "walk it in the dark.", start: 12.4, end: 14.8, focus: CGPoint(x: 0.5, y: 0.45)),
  Shot(file: "04-room-night-shift.jpg", caption: "read what nobody signed.", start: 14.8, end: 17.4, focus: CGPoint(x: 0.3, y: 0.38)),
  Shot(file: "03-room-redacted.jpg", caption: "every room keeps a secret.", start: 17.4, end: 19.6, focus: CGPoint(x: 0.25, y: 0.27)),
  Shot(file: "05-library-tv.jpg", caption: "learn zcash in the library.", start: 19.6, end: 21.8, focus: CGPoint(x: 0.5, y: 0.35)),
]
let captionCps = 30.0
let features = [
  Typed(text: "> no accounts. no usernames.", start: 22.6, cps: 30),
  Typed(text: "> your key never leaves", start: 23.9, cps: 30),
  Typed(text: "  your device.", start: 24.8, cps: 30),
  Typed(text: "> a zero-knowledge proof", start: 25.6, cps: 30),
  Typed(text: "  on every post.", start: 26.5, cps: 30),
  Typed(text: "> tip any thought in", start: 27.3, cps: 30),
  Typed(text: "  shielded ZEC.", start: 28.0, cps: 30),
]
let confession = Typed(text: "i still keep the last voicemail. i never play it.", start: 29.4, cps: 26)
let transmitAt = 31.9
let endCard = 33.0
let glitchCuts: [Double] = [2.55, 6.05, 8.3, 9.95, 12.4, 14.8, 17.4, 19.6, 21.8, 29.1, 31.9, 32.9, 37.0]

/// Every moment a character appears, for the typing sound.
var typeTimes: [Double] = []
func addTypeTimes(_ t: Typed) { for i in 0..<t.text.count where t.text[t.text.index(t.text.startIndex, offsetBy: i)] != " " { typeTimes.append(t.start + Double(i) / t.cps) } }
([bootLine] + hook + hook2 + features + [confession]).forEach(addTypeTimes)
for s in shots { for i in 0..<s.caption.count { typeTimes.append(s.start + 0.25 + Double(i) / captionCps) } }

// MARK: - Assets

func loadImage(_ path: String) -> CGImage {
  guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("missing \(path)") }
  return cg
}
let shotImages = shots.map { loadImage("\(shotsDir)/\($0.file)") }
var noiseFrames: [CGImage] = []
do {
  var r = RNG(s: 7)
  for _ in 0..<6 {
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

func sceneBoot(_ ctx: CGContext, _ t: Double) {
  fillGround()
  // CRT power-on: a bright line that opens into the screen.
  let open = smooth((t - 0.1) / 0.7)
  let lineH = max(2, CGFloat(open) * CGFloat(H))
  let lineAlpha = CGFloat(1 - smooth((t - 0.6) / 0.5))
  if lineAlpha > 0 { rgb(196, 247, 204, lineAlpha * 0.9).setFill(); NSRect(x: 0, y: (CGFloat(H) - min(lineH, 6)) / 2, width: CGFloat(W), height: min(lineH, 6)).fill() }
  bloom(NSPoint(x: W / 2, y: H / 2), 900, 0.18 * CGFloat(open))
  let s = bootLine.visible(t)
  draw(s, 70, 880, mono(34, .regular), dim, glow: 8)
  if t > 0.9 && t < 2.55 { cursorBlock(70 + textWidth(s, mono(34, .regular)) + 6, 884, 40, t) }
  if t > bootLine.end + 0.15 { draw("[ OK ] SECURE CHANNEL OPEN", 70, 940, mono(30, .regular), green, glow: 10) }
}

func sceneHook(_ ctx: CGContext, _ t: Double, lines: [Typed], top: CGFloat, size: CGFloat) {
  fillGround()
  bloom(NSPoint(x: W / 2, y: H / 2), 900, 0.2)
  let f = mono(size, .bold)
  for (i, l) in lines.enumerated() {
    let s = l.visible(t)
    let y = top + CGFloat(i) * size * 1.25
    let x = (CGFloat(W) - textWidth(l.text, f, kern: 4)) / 2
    draw(s, x, y, f, green, glow: 20, fringe: 4, kern: 4)
    if t >= l.start && (t < l.end + 0.15 || i == lines.count - 1) { cursorBlock(x + textWidth(s, f, kern: 4) + 8, y + size * 0.18, size * 0.82, t) }
  }
}

func sceneLogoReveal(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let p = smooth((t - 8.5) / 0.6)
  bloom(NSPoint(x: W / 2, y: H / 2), 900, 0.28 * CGFloat(p))
  logo(ctx, cx: CGFloat(W) / 2, cy: CGFloat(H) / 2 - 40, size: 190, alpha: CGFloat(p))
  if t > 9.0 { drawCentered("A ROOM WITHOUT NAMES.", CGFloat(H) / 2 + 120, mono(36, .regular), pale, glow: 10, kern: 5, alpha: CGFloat(smooth((t - 9.0) / 0.4))) }
}

func sceneShot(_ ctx: CGContext, _ t: Double, _ i: Int) {
  let shot = shots[i], img = shotImages[i]
  let local = (t - shot.start) / (shot.end - shot.start)
  // Ken Burns: a slow push in, cropping the thin border of the capture.
  let src = CGRect(x: 10, y: 10, width: CGFloat(img.width) - 20, height: CGFloat(img.height) - 20)
  let base = max(CGFloat(W) / src.width, CGFloat(H) / src.height)
  let zoom = base * (1.04 + 0.08 * CGFloat(local))
  let dw = src.width * zoom, dh = src.height * zoom
  let rect = CGRect(x: (CGFloat(W) - dw) * shot.focus.x, y: (CGFloat(H) - dh) * shot.focus.y, width: dw, height: dh)
  fillGround()
  drawImage(ctx, img, rect, source: src)
  // The private room is dark: a moving flashlight reveals it.
  let lx = CGFloat(W) * (0.35 + 0.3 * CGFloat(sin(t * 0.9 + Double(i))))
  let ly = CGFloat(H) * (0.42 + 0.12 * CGFloat(cos(t * 0.7 + Double(i) * 1.7)))
  let ctxDark = NSGradient(colors: [rgb(0, 0, 0, 0), rgb(0, 0, 0, 0.55), rgb(0, 0, 0, 0.9)], atLocations: [0, 0.45, 1], colorSpace: .sRGB)!
  ctxDark.draw(fromCenter: NSPoint(x: lx, y: ly), radius: 0, toCenter: NSPoint(x: lx, y: ly), radius: 1100, options: [.drawsAfterEndingLocation])
  rgb(20, 60, 30, 0.12).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
  // Caption as a terminal prompt in a bar near the bottom.
  let bar = NSRect(x: 50, y: 1560, width: CGFloat(W) - 100, height: 120)
  rgb(2, 6, 3, 0.86).setFill(); NSBezierPath(roundedRect: bar, xRadius: 16, yRadius: 16).fill()
  rgb(77, 255, 110, 0.45).setStroke(); let b = NSBezierPath(roundedRect: bar, xRadius: 16, yRadius: 16); b.lineWidth = 2.5; b.stroke()
  let n = Int(max(0, (t - shot.start - 0.25) * captionCps))
  let cap = "> " + String(shot.caption.prefix(n))
  draw(cap, bar.minX + 36, bar.minY + 34, mono(40), green, glow: 14, fringe: 2)
  cursorBlock(bar.minX + 36 + textWidth(cap, mono(40)) + 6, bar.minY + 38, 44, t)
}

func sceneFeatures(_ ctx: CGContext, _ t: Double) {
  fillGround()
  bloom(NSPoint(x: W / 2, y: 900), 900, 0.2)
  let p = smooth((t - 21.8) / 0.4)
  let win = NSRect(x: 60, y: 520, width: CGFloat(W) - 120, height: 860)
  ctx.saveGState(); ctx.setAlpha(CGFloat(p))
  terminalWindow(win, title: "hidn@room: ~/how-it-works")
  draw("hidn@room:~$ cat PRIVACY", win.minX + 50, win.minY + 110, mono(32, .regular), dim, glow: 0)
  for (i, f) in features.enumerated() {
    let s = f.visible(t)
    draw(s, win.minX + 50, win.minY + 200 + CGFloat(i) * 82, mono(44), i % 2 == 0 || i == 6 || i == 4 || i == 2 ? green : green, glow: 14)
  }
  if let last = features.last(where: { t >= $0.start }) {
    let idx = features.firstIndex(where: { $0.text == last.text })!
    let s = last.visible(t)
    cursorBlock(win.minX + 50 + textWidth(s, mono(44)) + 6, win.minY + 206 + CGFloat(idx) * 82, 48, t)
  }
  ctx.restoreGState()
}

func sceneConfession(_ ctx: CGContext, _ t: Double) {
  fillGround()
  bloom(NSPoint(x: W / 2, y: 900), 900, 0.2)
  let win = NSRect(x: 60, y: 560, width: CGFloat(W) - 120, height: 760)
  terminalWindow(win, title: "hidn@room: ~/say-it-here")
  draw("> SAY IT HERE", win.minX + 50, win.minY + 110, mono(32, .regular), dim, glow: 0)
  // The thought wraps inside the window.
  let s = confession.visible(t)
  let words = s.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
  var lines: [String] = [""]
  for w in words {
    let candidate = lines[lines.count - 1].isEmpty ? w : lines[lines.count - 1] + " " + w
    if textWidth(candidate, mono(50)) > win.width - 100 { lines.append(w) } else { lines[lines.count - 1] = candidate }
  }
  for (i, l) in lines.enumerated() { draw(l, win.minX + 50, win.minY + 190 + CGFloat(i) * 72, mono(50), pale, glow: 10) }
  if t < transmitAt { cursorBlock(win.minX + 50 + textWidth(lines.last ?? "", mono(50)) + 6, win.minY + 196 + CGFloat(lines.count - 1) * 72, 54, t) }
  // Signature: withheld.
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
  // The button presses, then the post transmits.
  let button = NSRect(x: win.minX + 50, y: win.minY + 580, width: 330, height: 90)
  let pressed = t >= transmitAt && t < transmitAt + 0.25
  (pressed ? green : rgb(77, 255, 110, 0.12)).setFill(); button.fill()
  rgb(77, 255, 110, 0.8).setStroke(); let bo = NSBezierPath(rect: button); bo.lineWidth = 3; bo.stroke()
  draw(t >= transmitAt + 0.25 ? "[ SENT ]" : "[ TRANSMIT ]", button.minX + 36, button.minY + 24, mono(38), pressed ? NSColor.black : green, glow: pressed ? 0 : 12)
  if t >= transmitAt + 0.3 { draw("[ OK ] posted. nobody knows it was you.", win.minX + 50, win.maxY + 40, mono(32, .regular), green, glow: 10) }
}

func sceneEnd(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let p = smooth((t - endCard) / 0.5)
  bloom(NSPoint(x: W / 2, y: H / 2 - 80), 950, 0.3 * CGFloat(p))
  logo(ctx, cx: CGFloat(W) / 2, cy: CGFloat(H) / 2 - 120, size: 200, alpha: CGFloat(p))
  if t > endCard + 0.6 { drawCentered("SOME THOUGHTS ARE", CGFloat(H) / 2 + 60, mono(40, .regular), pale, glow: 10, kern: 5, alpha: CGFloat(smooth((t - endCard - 0.6) / 0.4))) }
  if t > endCard + 0.9 { drawCentered("MEANT TO BE HIDN.", CGFloat(H) / 2 + 120, mono(40, .regular), pale, glow: 10, kern: 5, alpha: CGFloat(smooth((t - endCard - 0.9) / 0.4))) }
  if t > endCard + 1.4 {
    let a = CGFloat(smooth((t - endCard - 1.4) / 0.4))
    let label = "[ ENTER THE ROOM ]"
    let f = mono(44)
    let bw = textWidth(label, f, kern: 4) + 80
    let bx = (CGFloat(W) - bw) / 2, by = CGFloat(H) / 2 + 250
    rgb(77, 255, 110, 0.12 * a).setFill(); NSRect(x: bx, y: by, width: bw, height: 100).fill()
    rgb(77, 255, 110, 0.8 * a).setStroke(); let o = NSBezierPath(rect: NSRect(x: bx, y: by, width: bw, height: 100)); o.lineWidth = 3; o.stroke()
    draw(label, bx + 40, by + 26, f, green, glow: 14, kern: 4, alpha: a)
  }
  if t > endCard + 1.9 {
    let a = CGFloat(smooth((t - endCard - 1.9) / 0.4))
    drawCentered("NO ACCOUNTS  ·  NO NAMES  ·  ZERO KNOWLEDGE", CGFloat(H) - 330, mono(28, .regular), dim, glow: 0, kern: 3, alpha: a)
    drawCentered("BUILT ON ZCASH", CGFloat(H) - 270, mono(28, .regular), gold, glow: 6, kern: 4, alpha: a)
  }
  // CRT power-off in the last half second.
  let off = smooth((t - (duration - 0.6)) / 0.45)
  if off > 0 {
    NSColor.black.withAlphaComponent(CGFloat(off)).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
    let lh = CGFloat(H) * CGFloat(1 - off) * 0.5
    if off < 1 { rgb(196, 247, 204, 0.6 * CGFloat(1 - off)).setFill(); NSRect(x: 0, y: CGFloat(H) / 2 - lh / 2, width: CGFloat(W), height: max(3, lh * 0.02)).fill() }
  }
}

// MARK: - Post effects: glitch tears, static, scanlines, vignette

func glitchAmount(_ t: Double) -> Double {
  var a = 0.0
  for c in glitchCuts { let d = abs(t - c); if d < 0.14 { a = max(a, 1 - d / 0.14) } }
  return a
}
func postEffects(_ ctx: CGContext, _ t: Double, _ frame: Int) {
  let g = glitchAmount(t)
  if g > 0 {
    var r = RNG(s: UInt64(frame) &* 977 &+ 13)
    // Copy the frame and shift a few horizontal slices sideways.
    if let snap = ctx.makeImage() {
      for _ in 0..<Int(3 + g * 7) {
        let y = CGFloat(r.next()) * CGFloat(H), h = CGFloat(10 + r.next() * 90 * g)
        let dx = CGFloat((r.next() - 0.5) * 160 * g)
        ctx.saveGState()
        ctx.clip(to: CGRect(x: 0, y: y, width: CGFloat(W), height: h))
        // The snapshot is in device (unflipped) space; undo the flip to place it.
        ctx.translateBy(x: dx, y: CGFloat(H)); ctx.scaleBy(x: 1, y: -1)
        ctx.draw(snap, in: CGRect(x: 0, y: 0, width: CGFloat(W), height: CGFloat(H)))
        ctx.restoreGState()
      }
    }
    for _ in 0..<Int(2 + g * 4) {
      let c = r.next() < 0.5 ? rgb(255, 60, 90, 0.35 * CGFloat(g)) : rgb(60, 200, 255, 0.35 * CGFloat(g))
      c.setFill(); NSRect(x: 0, y: CGFloat(r.next()) * CGFloat(H), width: CGFloat(W), height: CGFloat(2 + r.next() * 8)).fill()
    }
  }
  // Static: faint always, strong in glitches and at the boot.
  let staticAlpha = 0.035 + 0.25 * g + (t < 0.8 ? 0.3 * (1 - t / 0.8) : 0)
  ctx.saveGState(); ctx.setBlendMode(.screen)
  drawImage(ctx, noiseFrames[frame % noiseFrames.count], CGRect(x: 0, y: 0, width: W, height: H), alpha: CGFloat(staticAlpha))
  ctx.restoreGState()
  // Scanlines and a rolling refresh band.
  rgb(0, 0, 0, 0.22).setFill()
  var y: CGFloat = 0
  while y < CGFloat(H) { NSRect(x: 0, y: y, width: CGFloat(W), height: 1.5).fill(); y += 4 }
  let bandY = CGFloat((t * 0.18).truncatingRemainder(dividingBy: 1.3) - 0.15) * CGFloat(H)
  NSGradient(colors: [rgb(140, 255, 170, 0), rgb(140, 255, 170, 0.06), rgb(140, 255, 170, 0)])!.draw(in: NSRect(x: 0, y: bandY, width: CGFloat(W), height: 260), angle: 90)
  // Vignette.
  let c = NSPoint(x: W / 2, y: H / 2)
  NSGradient(colors: [rgb(0, 0, 0, 0), rgb(0, 0, 0, 0.55)], atLocations: [0.55, 1], colorSpace: .sRGB)!.draw(fromCenter: c, radius: 0, toCenter: c, radius: 1150, options: [.drawsAfterEndingLocation])
}

func renderFrame(_ ctx: CGContext, _ frame: Int) {
  let t = Double(frame) / Double(fps)
  if t < 2.55 { sceneBoot(ctx, t) }
  else if t < 6.05 { sceneHook(ctx, t, lines: hook, top: 760, size: 92) }
  else if t < 8.3 { sceneHook(ctx, t, lines: hook2, top: 820, size: 88) }
  else if t < 10.0 { sceneLogoReveal(ctx, t) }
  else if let i = shots.firstIndex(where: { t >= $0.start && t < $0.end }) { sceneShot(ctx, t, i) }
  else if t < 29.1 { sceneFeatures(ctx, t) }
  else if t < endCard { sceneConfession(ctx, t) }
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
do {
  var r = RNG(s: 42)
  var lp = 0.0
  // Drone: low fifths with a slow swell, and filtered hiss.
  for i in 0..<totalSamples {
    let t = Double(i) / sampleRate
    let fadeIn = smooth(t / 2.5), fadeOut = 1 - smooth((t - (duration - 2.2)) / 2)
    let swell = 1 + 0.5 * smooth((t - 10) / 1.5) * (1 - smooth((t - 21.5) / 1.5))
    let lfo = 0.75 + 0.25 * sin(2 * .pi * 0.13 * t)
    var v = 0.11 * sin(2 * .pi * 55 * t) + 0.06 * sin(2 * .pi * 82.41 * t) + 0.035 * sin(2 * .pi * 110 * t + 0.4 * sin(2 * .pi * 0.21 * t))
    v *= lfo * swell * fadeIn * fadeOut
    lp += 0.02 * ((r.next() * 2 - 1) - lp)
    let hiss = lp * 0.09 * fadeIn * fadeOut
    add(i, v + hiss, pan: 0); if i % 2 == 0 { add(i, hiss * 0.3, pan: 0.4) }
  }
  // Keyboard clicks, one per typed character.
  for (k, tt) in typeTimes.enumerated() {
    let s0 = Int(tt * sampleRate), pan = (r.next() - 0.5) * 0.6
    let amp = 0.16 + r.next() * 0.08, tone = 1600 + r.next() * 900
    for j in 0..<Int(0.025 * sampleRate) {
      let tj = Double(j) / sampleRate
      let v = amp * ((r.next() * 2 - 1) * exp(-tj / 0.004) + 0.5 * sin(2 * .pi * tone * tj) * exp(-tj / 0.0025))
      add(s0 + j, v, pan: pan)
    }
    _ = k
  }
  // Glitch bursts: bit-crushed noise and a buzz at every cut.
  for c in glitchCuts {
    let s0 = Int((c - 0.08) * sampleRate), len = Int(0.2 * sampleRate)
    var hold = 0.0, holdLeft = 0
    for j in 0..<len {
      if holdLeft <= 0 { hold = r.next() * 2 - 1; holdLeft = 6 + Int(r.next() * 40) }
      holdLeft -= 1
      let tj = Double(j) / sampleRate
      let env = sin(.pi * Double(j) / Double(len))
      let buzz = (sin(2 * .pi * 118 * tj) > 0 ? 1.0 : -1.0) * 0.4
      let gate = (Int(tj * 60) % 2 == 0) ? 1.0 : 0.35
      add(s0 + j, 0.22 * env * gate * (hold + buzz), pan: (r.next() - 0.5) * 0.8)
    }
  }
  // Boot sweep and the CRT power-off sweep.
  func sweep(_ start: Double, _ len: Double, _ f0: Double, _ f1: Double, _ amp: Double) {
    var phase = 0.0
    for j in 0..<Int(len * sampleRate) {
      let p = Double(j) / (len * sampleRate)
      let f = f0 * pow(f1 / f0, p)
      phase += 2 * .pi * f / sampleRate
      add(Int(start * sampleRate) + j, amp * sin(phase) * sin(.pi * p), pan: 0)
    }
  }
  sweep(0.1, 0.8, 60, 900, 0.14)
  sweep(duration - 0.65, 0.5, 900, 40, 0.14)
  // Sub hits: the logo reveal, the transmit, the end card; a heartbeat under the rooms.
  func kick(_ at: Double, _ amp: Double) {
    var phase = 0.0
    for j in 0..<Int(0.7 * sampleRate) {
      let tj = Double(j) / sampleRate
      let f = 40 + 90 * exp(-tj / 0.05)
      phase += 2 * .pi * f / sampleRate
      add(Int(at * sampleRate) + j, amp * sin(phase) * exp(-tj / 0.22), pan: 0)
    }
  }
  kick(8.5, 0.75); kick(transmitAt, 0.5); kick(endCard, 0.8)
  var hb = 10.1
  while hb < 21.6 { kick(hb, 0.28); kick(hb + 0.22, 0.18); hb += 1.15 }
  // Soft limiter.
  var peak: Float = 0
  for i in 0..<totalSamples { left[i] = tanhf(left[i] * 1.2); right[i] = tanhf(right[i] * 1.2); peak = max(peak, abs(left[i]), abs(right[i])) }
  let gain = 0.89 / max(peak, 0.001)
  for i in 0..<totalSamples { left[i] *= gain; right[i] *= gain }
}

// MARK: - Encode

let outURL = URL(fileURLWithPath: "\(outDir)/hidn-ad-9x16.mp4")
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
