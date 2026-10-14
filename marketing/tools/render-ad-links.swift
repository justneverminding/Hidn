import AppKit
import AVFoundation
import CoreMedia

// HIDN ad for private links, "03:07", 16:9 landscape, 40 seconds. Someone
// awake at 3:07 AM opens a room with no names, shares the link, and by 4 AM
// strangers are finally saying it. Typed terminal narration over HIDN's own
// screens, scored with the site's room loop. Every frame and every other
// sound is generated here.
//   swift -O marketing/tools/render-ad-links.swift marketing/video
let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "marketing/video"
let musicPath = "public/audio/hidn-room-loop.m4a"
let W = 1920, H = 1080
let fps: Int32 = 30
let duration: Double = 40
let frameCount = Int(duration * Double(fps))
let sampleRate: Double = 48_000

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

// MARK: - Assets

var noiseFrames: [CGImage] = []
do {
  var r = RNG(s: 7)
  for _ in 0..<8 {
    let nw = 480, nh = 270
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


// MARK: - Story script: 03:07

// 1. The bedroom, 3:07 AM.
let roomLines = [Typed(text: "> 03:07.", start: 1.3, cps: 10), Typed(text: "> awake again.", start: 2.6, cps: 14)]
// 2. The phone lights up.
let phoneWake = 7.0
let wakeLines = [Typed(text: "> there's something nobody ever said to you.", start: 7.3, cps: 26), Typed(text: "> not to your face.", start: 9.4, cps: 16)]
// 3. Opening a link.
let createStart = 11.0, createTap = 13.2, forgeEnd = 15.0, copyTap = 16.6
let createLines = [Typed(text: "> so you open a room.", start: 11.4, cps: 17), Typed(text: "> with no names.", start: 13.0, cps: 16), Typed(text: "> and share it anywhere.", start: 16.0, cps: 20)]
let linkSlug = "k7f3q9md"
// 4. Time passes.
let waitStart = 19.0
let waitLines = [Typed(text: "> then the room starts talking.", start: 19.5, cps: 20)]
let buzzTimes: [Double] = [21.0, 21.4]
// 5. A stranger writes.
let strangerStart = 22.0, zecTick = 25.9, transmitTap = 26.5
let strangerLines = [Typed(text: "> somewhere, a stranger.", start: 22.3, cps: 18), Typed(text: "> no account. no name.", start: 23.9, cps: 18), Typed(text: "> and a tip in ZEC.", start: 25.6, cps: 16)]
let confession = Typed(text: "you were the only one who noticed when i left.", start: 22.7, cps: 17)
// 6. The inbox fills.
let inboxStart = 28.5
let arrivals: [Double] = [28.9, 29.9, 30.8, 31.6]
let messages: [(String, String?)] = [
  ("you were the only one who noticed when i left.", "5PNR-CXZD"),
  ("i still have the jacket you lent me in 2019.", nil),
  ("you're a lot kinder than you let people see.", nil),
  ("sorry for what i said at the wedding. i meant none of it.", nil),
]
let inboxLines = [Typed(text: "> someone finally said it.", start: 32.2, cps: 14)]
// 7. End.
let endCard = 34.4
let glitchCuts: [Double] = [0.9, 7.0, 11.0, 19.0, 22.0, 28.5, 34.35, 39.4]
let cutTimes: [Double] = [11.0, 19.0, 22.0, 28.5]
let channelFlips: [Double] = []
let narration = roomLines + wakeLines + createLines + waitLines + strangerLines + inboxLines
var typeTimes: [Double] = []
for f in narration { for (k, key) in f.keys.enumerated() where k == 0 || key.1 != f.keys[k - 1].1 + " " { typeTimes.append(key.0) } }
var tapTimes: [Double] = []
for (k, key) in confession.keys.enumerated() where k == 0 || key.1 != confession.keys[k - 1].1 + " " { tapTimes.append(key.0) }
func typingNow(_ t: Double) -> Bool { (typeTimes + tapTimes).contains { t >= $0 && t - $0 < 0.5 } }

// MARK: - The bedroom

/// The room at night: moonlight through blinds on the wall, the bed, a
/// nightstand with a clock and a phone. `lit` is how awake the phone is.
func drawBedroom(_ ctx: CGContext, _ t: Double, clock: String, lit: Double, push: CGFloat) {
  ctx.saveGState()
  ctx.translateBy(x: CGFloat(W) * 0.62, y: CGFloat(H) * 0.62)
  ctx.scaleBy(x: push, y: push)
  ctx.translateBy(x: -CGFloat(W) * 0.62, y: -CGFloat(H) * 0.62)
  // Wall.
  NSGradient(colors: [rgb(6, 12, 10), rgb(2, 5, 4)])!.draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -90)
  // Moonlight through blinds, slanted across the wall, breathing a little.
  let moon = 0.075 + 0.012 * sin(t * 0.7)
  for k in 0..<9 {
    let y0 = 150 + CGFloat(k) * 46
    let p = NSBezierPath()
    p.move(to: NSPoint(x: 180, y: y0)); p.line(to: NSPoint(x: 820, y: y0 + 120))
    p.line(to: NSPoint(x: 820, y: y0 + 142)); p.line(to: NSPoint(x: 180, y: y0 + 22)); p.close()
    rgb(170, 210, 190, CGFloat(moon)).setFill(); p.fill()
  }
  // Bed: mattress, blanket and pillow in shadow.
  rgb(10, 16, 14).setFill(); NSBezierPath(roundedRect: NSRect(x: -60, y: 760, width: 1380, height: 400), xRadius: 40, yRadius: 40).fill()
  let blanket = NSBezierPath()
  blanket.move(to: NSPoint(x: -60, y: 840))
  blanket.curve(to: NSPoint(x: 1320, y: 800), controlPoint1: NSPoint(x: 400, y: 760), controlPoint2: NSPoint(x: 900, y: 900))
  blanket.line(to: NSPoint(x: 1320, y: 1100)); blanket.line(to: NSPoint(x: -60, y: 1100)); blanket.close()
  rgb(14, 22, 19).setFill(); blanket.fill()
  rgb(16, 24, 21).setFill(); NSBezierPath(roundedRect: NSRect(x: 120, y: 720, width: 420, height: 110), xRadius: 50, yRadius: 50).fill()
  // Nightstand.
  rgb(9, 14, 12).setFill(); NSRect(x: 1390, y: 760, width: 420, height: 340).fill()
  rgb(14, 22, 18).setFill(); NSRect(x: 1370, y: 742, width: 460, height: 26).fill()
  // Clock: the only steady light in the room.
  let clockRect = NSRect(x: 1430, y: 640, width: 250, height: 102)
  rgb(4, 8, 6).setFill(); NSBezierPath(roundedRect: clockRect, xRadius: 14, yRadius: 14).fill()
  bloom(NSPoint(x: clockRect.midX, y: clockRect.midY), 260, 0.5)
  let cf = mono(64, .bold)
  draw(clock, clockRect.midX - textWidth(clock, cf) / 2, clockRect.minY + 12, cf, green, glow: 22)
  // The phone, face up on the nightstand.
  let phone = NSBezierPath()
  phone.move(to: NSPoint(x: 1620, y: 742)); phone.line(to: NSPoint(x: 1770, y: 742))
  phone.line(to: NSPoint(x: 1750, y: 728)); phone.line(to: NSPoint(x: 1636, y: 728)); phone.close()
  rgb(20, 26, 24).setFill(); phone.fill()
  if lit > 0 {
    bloom(NSPoint(x: 1694, y: 720), CGFloat(380 * lit), CGFloat(0.9 * lit))
    NSGradient(colors: [rgb(120, 255, 160, CGFloat(0.07 * lit)), rgb(0, 0, 0, 0)])!.draw(fromCenter: NSPoint(x: 1694, y: 700), radius: 0, toCenter: NSPoint(x: 1500, y: 300), radius: 900, options: [])
    rgb(150, 255, 180, CGFloat(0.85 * lit)).setFill(); phone.fill()
  }
  ctx.restoreGState()
  // Deep shadow at the edges of the frame.
  let c = NSPoint(x: W / 2, y: H / 2)
  NSGradient(colors: [rgb(0, 0, 0, 0), rgb(0, 0, 0, 0.7)], atLocations: [0.35, 1], colorSpace: .sRGB)!.draw(fromCenter: c, radius: 0, toCenter: c, radius: 1150, options: [.drawsAfterEndingLocation])
}

// MARK: - The phone and HIDN's screens

/// Screen content is drawn in phone points (390 x 844), scaled to fit.
struct Phone { let rect: NSRect; var k: CGFloat { rect.height / 844 } }
func phoneFrame(_ center: NSPoint, height: CGFloat) -> Phone {
  let w = height * 0.47
  return Phone(rect: NSRect(x: center.x - w / 2, y: center.y - height / 2, width: w, height: height))
}

/// Draws the phone body and runs `content` clipped to its screen.
func drawPhone(_ ctx: CGContext, _ phone: Phone, glow: CGFloat = 1, shake: CGFloat = 0, _ content: () -> Void) {
  let r = phone.rect.offsetBy(dx: shake, dy: 0)
  bloom(NSPoint(x: r.midX, y: r.midY), r.height * 0.75, 0.55 * glow)
  let body = NSBezierPath(roundedRect: r.insetBy(dx: -14, dy: -14), xRadius: 62, yRadius: 62)
  rgb(10, 14, 12).setFill(); body.fill()
  rgb(77, 255, 110, 0.18).setStroke(); body.lineWidth = 2; body.stroke()
  ctx.saveGState()
  NSBezierPath(roundedRect: r, xRadius: 48, yRadius: 48).addClip()
  ctx.translateBy(x: r.minX, y: r.minY); ctx.scaleBy(x: phone.k, y: phone.k)
  rgb(1, 4, 2).setFill(); NSRect(x: 0, y: 0, width: 390, height: 844).fill()
  content()
  ctx.restoreGState()
  // The notch.
  rgb(0, 0, 0).setFill(); NSBezierPath(roundedRect: NSRect(x: r.midX - 52, y: r.minY + 10, width: 104, height: 26), xRadius: 13, yRadius: 13).fill()
}

func ui(_ s: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ color: NSColor, weight: NSFont.Weight = .regular, kern: CGFloat = 0, glow: CGFloat = 4) {
  draw(s, x, y, mono(size, weight), color, glow: glow, kern: kern)
}
/// Word-wrapped text inside the phone; returns the height used.
@discardableResult
func uiWrap(_ s: String, _ x: CGFloat, _ y: CGFloat, width: CGFloat, size: CGFloat, color: NSColor, lineHeight: CGFloat = 1.5) -> CGFloat {
  let f = mono(size)
  var lines: [String] = [""]
  for w in s.split(separator: " ").map(String.init) {
    let candidate = lines[lines.count - 1].isEmpty ? w : lines[lines.count - 1] + " " + w
    if textWidth(candidate, f) > width { lines.append(w) } else { lines[lines.count - 1] = candidate }
  }
  for (i, l) in lines.enumerated() { draw(l, x, y + CGFloat(i) * size * lineHeight, f, color, glow: 3) }
  return CGFloat(lines.count) * size * lineHeight
}
func uiButton(_ label: String, _ rect: NSRect, pressed: Bool, primary: Bool = false) {
  (pressed ? green : rgb(77, 255, 110, primary ? 0.12 : 0)).setFill(); rect.fill()
  (primary || pressed ? green : rgb(77, 255, 110, 0.4)).setStroke()
  let b = NSBezierPath(rect: rect); b.lineWidth = 1.2; b.stroke()
  let f = mono(13, .medium)
  draw(label, rect.midX - textWidth(label, f, kern: 1.5) / 2, rect.midY - 9, f, pressed ? rgb(1, 2, 1) : green, glow: pressed ? 0 : 4, kern: 1.5)
}
func uiDashed(_ rect: NSRect, color: NSColor = rgb(77, 255, 110, 0.35)) {
  color.setStroke(); let p = NSBezierPath(rect: rect); p.lineWidth = 1; p.setLineDash([4, 3], count: 2, phase: 0); p.stroke()
}
/// The status bar, HIDN's window bar and the room tabs.
func uiChrome(title: String, tab: Int?, clock: String) {
  ui(clock, 26, 16, 14, pale, weight: .semibold, glow: 0)
  ui("●●● 5G", 300, 16, 11, pale, glow: 0)
  rgb(10, 18, 12).setFill(); NSRect(x: 10, y: 50, width: 370, height: 34).fill()
  rgb(77, 255, 110, 0.3).setStroke(); NSBezierPath(rect: NSRect(x: 10, y: 50, width: 370, height: 34)).stroke()
  for (i, c) in [rgb(240, 94, 98), rgb(219, 167, 74), rgb(91, 219, 129)].enumerated() { c.setFill(); NSBezierPath(ovalIn: NSRect(x: 22 + CGFloat(i) * 15, y: 62, width: 9, height: 9)).fill() }
  ui(title, 195 - textWidth(title, mono(10)) / 2, 59, 10, green, glow: 0)
  if let tab {
    let tabs = ["FEED", "ROOMS", "MUSEUM", "INBOX", "ME"]
    for (i, label) in tabs.enumerated() {
      let cx = 39 + CGFloat(i) * 78
      ui(label, cx - textWidth(label, mono(10), kern: 1) / 2, 100, 10, i == tab ? green : dim, kern: 1, glow: i == tab ? 6 : 0)
      if i == tab { green.setFill(); NSRect(x: cx - 24, y: 124, width: 48, height: 2).fill() }
    }
    rgb(77, 255, 110, 0.25).setFill(); NSRect(x: 0, y: 126, width: 390, height: 1).fill()
  }
}

/// The owner's inbox while the link is being made.
func screenCreate(_ t: Double) {
  uiChrome(title: "hidn://room_inbox", tab: 3, clock: "03:09")
  ui("/// INBOX", 22, 150, 12, dim, kern: 2)
  let title = "WHAT THEY CAN'T SAY TO YOUR FACE."
  uiWrap(title, 22, 176, width: 340, size: 22, color: green, lineHeight: 1.25)
  uiWrap("> Share your link anywhere. Anyone can leave you a message without a name.", 22, 250, width: 340, size: 13, color: pale)
  if t < forgeEnd {
    uiDashed(NSRect(x: 22, y: 330, width: 346, height: 200))
    ui("> YOUR LINK / NOT CREATED", 38, 346, 12, dim, kern: 1.5)
    uiWrap("One link per member. It never shows your name or anything you post.", 38, 374, width: 310, size: 12, color: dim)
    if t >= createTap {
      ui("> proving membership... forging link", 38, 436, 12, green)
      if Int(t * 2.4) % 2 == 0 { green.setFill(); NSRect(x: 38 + textWidth("> proving membership... forging link", mono(12)) + 4, y: 438, width: 7, height: 14).fill() }
    }
    uiButton(t >= createTap ? "[ FORGING... ]" : "[ CREATE MY LINK ]", NSRect(x: 38, y: 470, width: 314, height: 44), pressed: t >= createTap && t < createTap + 0.25, primary: true)
  } else {
    let a = CGFloat(smooth((t - forgeEnd) / 0.35))
    uiDashed(NSRect(x: 22, y: 330, width: 346, height: 168))
    ui("> YOUR LINK / OPEN", 38, 346, 12, dim, kern: 1.5)
    rgb(1, 3, 1).setFill(); NSRect(x: 38, y: 374, width: 314, height: 46).fill()
    rgb(77, 255, 110, 0.3).setStroke(); NSBezierPath(rect: NSRect(x: 38, y: 374, width: 314, height: 46)).stroke()
    draw("hidn.app/to/\(linkSlug)", 50, 387, mono(14, .medium), rgb(216, 255, 224, a), glow: 6)
    let copied = t >= copyTap
    uiButton(copied ? "[ COPIED ]" : "[ COPY LINK ]", NSRect(x: 38, y: 434, width: 150, height: 44), pressed: copied && t < copyTap + 0.3, primary: true)
    uiButton("[ SHARE ]", NSRect(x: 200, y: 434, width: 152, height: 44), pressed: false)
    if copied { ui("> LINK CREATED. SHARE IT ANYWHERE.", 22, 520, 12, green) }
  }
}

/// A stranger on the owner's link.
func screenStranger(_ t: Double) {
  uiChrome(title: "hidn://to_\(linkSlug)", tab: nil, clock: "04:16")
  ui(">hidn▌", 22, 108, 15, green, weight: .bold, glow: 6)
  if t < transmitTap + 0.4 {
    ui("> open room --to \(linkSlug) --anonymous", 22, 150, 11, dim)
    ui("/// SOMEONE OPENED A ROOM FOR YOU", 22, 180, 11, dim, kern: 1.5)
    uiWrap("SAY IT. NO NAMES.", 22, 204, width: 340, size: 26, color: green, lineHeight: 1.2)
    rgb(77, 255, 110, 0.5).setFill(); NSRect(x: 22, y: 250, width: 2, height: 22).fill()
    ui("> say what you never said to them.", 32, 252, 12, pale)
    rgb(1, 3, 1).setFill(); NSRect(x: 22, y: 290, width: 346, height: 170).fill()
    rgb(77, 255, 110, 0.4).setStroke(); NSBezierPath(rect: NSRect(x: 22, y: 290, width: 346, height: 170)).stroke()
    let typedText = confession.visible(t)
    let h = uiWrap(typedText.isEmpty ? " " : typedText, 36, 304, width: 318, size: 15, color: rgb(216, 255, 224))
    if Int(t * 2.4) % 2 == 0 || typingNow(t) {
      let f = mono(15)
      let lastLine = typedText.split(separator: " ").reduce(into: [String]()) { lines, w in
        let w = String(w)
        if let last = lines.last, textWidth(last + " " + w, f) <= 318 { lines[lines.count - 1] = last + " " + w } else { lines.append(w) }
      }.last ?? ""
      green.setFill(); NSRect(x: 36 + textWidth(lastLine, f) + 2, y: 304 + max(0, h - 15 * 1.5) + 2, width: 8, height: 17).fill()
    }
    ui("\(typedText.count) / 500", 296, 466, 10, dim)
    let ticked = t >= zecTick
    (ticked ? green : rgb(0, 0, 0, 0)).setFill(); NSRect(x: 24, y: 494, width: 14, height: 14).fill()
    green.setStroke(); NSBezierPath(rect: NSRect(x: 24, y: 494, width: 14, height: 14)).stroke()
    ui("+ ATTACH ZEC", 48, 493, 13, green, kern: 1.5)
    uiButton("[ TRANSMIT ]", NSRect(x: 22, y: 528, width: 346, height: 48), pressed: t >= transmitTap && t < transmitTap + 0.3, primary: true)
    ui("> No account. No name. No trace of who sent it.", 22, 594, 11, dim)
  } else {
    ui("[ OK ] TRANSMITTED", 22, 150, 13, green)
    ui("[ OK ] SENDER: ███████ · NOTHING KEPT", 22, 174, 13, green)
    uiWrap("IT'S IN THE ROOM.", 22, 210, width: 340, size: 26, color: green, lineHeight: 1.2)
    ui("> NOW SEND THE ZEC / SHIELDED", 22, 262, 12, dim)
    qrBlock(NSRect(x: 22, y: 290, width: 150, height: 150))
    ui("tip code", 190, 300, 11, dim)
    ui("5PNR-CXZD", 190, 320, 18, gold, weight: .semibold, glow: 6)
    uiButton("[ OPEN IN WALLET ↗ ]", NSRect(x: 190, y: 360, width: 178, height: 40), pressed: false, primary: true)
  }
}

/// A QR-like block of modules: a stand-in, not a real payment request.
func qrBlock(_ rect: NSRect) {
  rgb(125, 255, 154).setFill(); rect.fill()
  var r = RNG(s: 99)
  let n = 25, cell = rect.width / CGFloat(n)
  rgb(1, 3, 1).setFill()
  for y in 0..<n { for x in 0..<n {
    let finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
    if finder {
      let fx = x < 7 ? x : x - (n - 7), fy = y < 7 ? y : y - (n - 7)
      let ring = fx == 0 || fx == 6 || fy == 0 || fy == 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4)
      if ring { NSRect(x: rect.minX + CGFloat(x) * cell, y: rect.minY + CGFloat(y) * cell, width: cell, height: cell).fill() }
    } else if r.next() < 0.48 {
      NSRect(x: rect.minX + CGFloat(x) * cell, y: rect.minY + CGFloat(y) * cell, width: cell, height: cell).fill()
    }
  } }
}

/// The owner's inbox as messages arrive, newest on top.
func screenInbox(_ t: Double) {
  uiChrome(title: "hidn://room_inbox", tab: 3, clock: "04:31")
  let arrived = arrivals.filter { t >= $0 }.count
  ui("/// INBOX", 22, 146, 12, dim, kern: 2)
  ui("MESSAGES", 22, 176, 13, green, kern: 2)
  if arrived > 0 { ui("\(arrived) NEW", 22 + textWidth("MESSAGES ", mono(13), kern: 2), 176, 13, gold, weight: .semibold, kern: 2) }
  green.setFill(); NSRect(x: 22, y: 200, width: 150, height: 2).fill()
  ui("MY LINK", 200, 176, 13, dim, kern: 2)
  rgb(77, 255, 110, 0.22).setFill(); NSRect(x: 0, y: 202, width: 390, height: 1).fill()
  var y: CGFloat = 220
  for i in stride(from: arrived - 1, through: 0, by: -1) {
    let (text, tip) = messages[i]
    let since = t - arrivals[i]
    let slide = CGFloat(1 - smooth(since / 0.35))
    let x: CGFloat = 22 + slide * 60
    let f = mono(14)
    var lines = 1, line = ""
    for w in text.split(separator: " ") { let c = line.isEmpty ? String(w) : line + " " + w; if textWidth(c, f) > 318 { lines += 1; line = String(w) } else { line = c } }
    let h = 64 + CGFloat(lines) * 21 + (tip != nil ? 20 : 0)
    rgb(77, 255, 110, CGFloat(0.05 + 0.08 * (1 - smooth(since / 2)))).setFill(); NSRect(x: x, y: y, width: 346, height: h).fill()
    green.setFill(); NSRect(x: x, y: y, width: 2, height: h).fill()
    ui("● NEW", x + 14, y + 10, 11, green, kern: 1.5)
    ui(["04:12", "04:19", "04:24", "04:30"][i], x + 296, y + 10, 11, dim)
    uiWrap(text, x + 14, y + 32, width: 318, size: 14, color: rgb(226, 255, 232))
    var yy = y + 32 + CGFloat(lines) * 21 + 4
    if let tip { ui("ZEC TIP · CODE \(tip)", x + 14, yy, 10, gold, kern: 1); yy += 20 }
    rgb(77, 255, 110, 0.22).setStroke(); NSBezierPath(rect: NSRect(x: x + 14, y: yy, width: 318, height: 22)).stroke()
    for (j, label) in ["↗ SHARE", "↓ SAVE", "✕ DELETE"].enumerated() {
      let cx = x + 14 + 53 + CGFloat(j) * 106
      ui(label, cx - textWidth(label, mono(9), kern: 1) / 2, yy + 5, 9, j == 2 ? rgb(255, 107, 129, 0.75) : dim, kern: 1, glow: 0)
    }
    y += h + 12
  }
}

// MARK: - Scenes

/// Typed narration; the cursor sits on the line being typed.
func typed(_ l: Typed, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ color: NSColor, _ t: Double, active: Bool) {
  guard t >= l.start else { return }
  let s = l.visible(t), f = mono(size)
  draw(s, x, y, f, color, glow: 10, fringe: 2)
  if active { cursorBlock(x + textWidth(s, f) + 6, y + size * 0.15, size * 0.85, t) }
}
func narrate(_ lines: [Typed], x: CGFloat, y: CGFloat, size: CGFloat, gap: CGFloat, _ t: Double) {
  let active = lines.lastIndex(where: { t >= $0.start })
  for (i, l) in lines.enumerated() { typed(l, x, y + CGFloat(i) * gap, size, i == 0 ? pale : green, t, active: i == active) }
}

func sceneRoom(_ ctx: CGContext, _ t: Double) {
  let lit = t < phoneWake ? 0 : smooth((t - phoneWake) / 0.6) * (0.9 + 0.1 * sin(t * 7))
  drawBedroom(ctx, t, clock: "03:07", lit: lit, push: 1 + 0.05 * CGFloat(smooth(t / createStart)))
  if t < 1.2 { rgb(0, 0, 0, CGFloat(1 - smooth(t / 1.2))).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill() }
  narrate(t < phoneWake ? roomLines : wakeLines, x: 120, y: 860, size: 46, gap: 70, t)
}

func sceneCreate(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let phone = phoneFrame(NSPoint(x: 1380, y: 700), height: 1260)
  let rise = CGFloat(1 - smooth((t - createStart) / 0.6))
  drawPhone(ctx, Phone(rect: phone.rect.offsetBy(dx: 0, dy: rise * 120)), glow: 1) { screenCreate(t) }
  narrate(createLines, x: 120, y: 420, size: 48, gap: 78, t)
}

func sceneWait(_ ctx: CGContext, _ t: Double) {
  let clock = t < 19.6 ? "03:12" : t < 20.4 ? "03:41" : t < 21.2 ? "04:12" : "04:16"
  let buzz = buzzTimes.contains { t >= $0 && t < $0 + 0.3 }
  let lit = buzz ? 1.0 : 0.25
  drawBedroom(ctx, t, clock: clock, lit: lit, push: 1.04)
  if buzz { rgb(120, 255, 160, 0.05).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill() }
  narrate(waitLines, x: 120, y: 880, size: 46, gap: 70, t)
}

func sceneStranger(_ ctx: CGContext, _ t: Double) {
  fillGround()
  // Somewhere else: a different light, colder, the phone on the left.
  bloom(NSPoint(x: 540, y: 540), 900, 0.3)
  let phone = phoneFrame(NSPoint(x: 540, y: 700), height: 1260)
  drawPhone(ctx, phone) { screenStranger(t) }
  narrate(strangerLines, x: 1010, y: 400, size: 46, gap: 76, t)
}

func sceneInbox(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let phone = phoneFrame(NSPoint(x: 1380, y: 700), height: 1260)
  let shake = arrivals.contains { t >= $0 && t < $0 + 0.18 } ? CGFloat(sin(t * 160) * 5) : 0
  drawPhone(ctx, phone, shake: shake) { screenInbox(t) }
  if t >= inboxLines[0].start {
    let f = mono(54, .bold), s = inboxLines[0].visible(t)
    draw(s, 100, 470, f, green, glow: 22, fringe: 4)
    if t < inboxLines[0].end + 1.5 { cursorBlock(100 + textWidth(s, f) + 8, 478, 50, t) }
  } else {
    draw("> 04:12.", 100, 470, mono(48), pale, glow: 10)
  }
}

func sceneEnd(_ ctx: CGContext, _ t: Double) {
  fillGround()
  let a = CGFloat(smooth((t - endCard) / 0.5))
  bloom(NSPoint(x: W / 2, y: H / 2 - 60), 700, 0.35 * a)
  logo(ctx, cx: CGFloat(W) / 2, cy: 370, size: 150, alpha: a)
  let b = CGFloat(smooth((t - endCard - 0.8) / 0.5))
  drawCentered("PRIVATE LINKS ARE LIVE.", 520, mono(58, .bold), green, glow: 18, fringe: 3, kern: 6, alpha: b)
  let c = CGFloat(smooth((t - endCard - 1.8) / 0.5))
  drawCentered("make your link. let them say it.", 620, mono(36), pale, glow: 8, kern: 1, alpha: c)
  let d = CGFloat(smooth((t - endCard - 2.8) / 0.5))
  drawCentered("NO ACCOUNTS · NO NAMES · TIPS IN $ZEC", 720, mono(26), dim, glow: 0, kern: 4, alpha: d)
  drawCentered("BUILT ON ZCASH", 790, mono(24), gold, glow: 6, kern: 5, alpha: d)
  if t > 39.4 { NSColor.black.withAlphaComponent(CGFloat(smooth((t - 39.4) / 0.35))).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill() }
}

func renderScene(_ ctx: CGContext, _ t: Double) {
  if t < createStart { sceneRoom(ctx, t) }
  else if t < waitStart { sceneCreate(ctx, t) }
  else if t < strangerStart { sceneWait(ctx, t) }
  else if t < inboxStart { sceneStranger(ctx, t) }
  else if t < endCard { sceneInbox(ctx, t) }
  else { sceneEnd(ctx, t) }
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
  // HIDN's room loop is the music.
  do {
    let file = try! AVAudioFile(forReading: URL(fileURLWithPath: musicPath))
    let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: file.fileFormat.sampleRate, channels: 2, interleaved: false)!
    let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(file.length))!
    try! file.read(into: buf)
    let n = Int(buf.frameLength), srcL = buf.floatChannelData![0], srcR = buf.floatChannelData![1]
    let ratio = file.fileFormat.sampleRate / sampleRate
    // Start inside the loop where the music box plays early on.
    let offset = Int(4.0 * file.fileFormat.sampleRate)
    for i in 0..<totalSamples {
      let t = Double(i) / sampleRate
      let level = 0.75 + 0.35 * smooth((t - endCard + 0.5) / 1.0)
      let fade = smooth(t / 2.5) * (1 - smooth((t - (duration - 1.2)) / 1.1))
      let j = (Int(Double(i) * ratio) + offset) % n
      left[i] += srcL[j] * Float(level * fade); right[i] += srcR[j] * Float(level * fade)
    }
  }
  // The clock ticks while the room is dark.
  var tick = 0.4
  while tick < strangerStart {
    if tick < createStart || (tick >= waitStart && tick < strangerStart) {
      for j in 0..<Int(0.02 * sampleRate) {
        let tj = Double(j) / sampleRate
        add(Int(tick * sampleRate) + j, 0.05 * sin(2 * .pi * 3200 * tj) * exp(-tj / 0.004), pan: 0.45)
      }
    }
    tick += 1
  }
  // Keys for the narration, softer taps for the stranger's phone.
  for tt in typeTimes {
    let s0 = Int(tt * sampleRate), pan = (r.next() - 0.5) * 0.6
    let amp = 0.12 + r.next() * 0.06, tone = 1500 + r.next() * 900
    for j in 0..<Int(0.03 * sampleRate) {
      let tj = Double(j) / sampleRate
      add(s0 + j, amp * ((r.next() * 2 - 1) * exp(-tj / 0.004) + 0.5 * sin(2 * .pi * tone * tj) * exp(-tj / 0.0025) + 0.3 * sin(2 * .pi * 180 * tj) * exp(-tj / 0.01)), pan: pan)
    }
  }
  for tt in tapTimes {
    let s0 = Int(tt * sampleRate)
    for j in 0..<Int(0.02 * sampleRate) {
      let tj = Double(j) / sampleRate
      add(s0 + j, 0.07 * sin(2 * .pi * 900 * tj) * exp(-tj / 0.003), pan: -0.3)
    }
  }
  // Button taps.
  for at in [createTap, copyTap, zecTick, transmitTap] {
    for j in 0..<Int(0.05 * sampleRate) {
      let tj = Double(j) / sampleRate
      add(Int(at * sampleRate) + j, 0.14 * sin(2 * .pi * 1250 * tj) * exp(-tj / 0.012))
    }
  }
  // The phone buzzing on the nightstand.
  func buzz(_ at: Double, _ len: Double) {
    for j in 0..<Int(len * sampleRate) {
      let tj = Double(j) / sampleRate
      let env = min(1, tj / 0.01) * min(1, (len - tj) / 0.02)
      add(Int(at * sampleRate) + j, 0.22 * env * (sin(2 * .pi * 155 * tj) + 0.4 * sin(2 * .pi * 310 * tj)) * (0.6 + 0.4 * sin(2 * .pi * 28 * tj)), pan: 0.4)
    }
  }
  buzz(phoneWake, 0.35)
  for b in buzzTimes { buzz(b, 0.3) }
  // Message chimes: two soft notes each time one lands.
  func chime(_ at: Double, _ f: Double) {
    for (k, freq) in [f, f * 1.5].enumerated() {
      let s0 = Int((at + Double(k) * 0.09) * sampleRate)
      for j in 0..<Int(0.6 * sampleRate) {
        let tj = Double(j) / sampleRate
        add(s0 + j, 0.09 * (sin(2 * .pi * freq * tj) + 0.3 * sin(2 * .pi * freq * 2.01 * tj)) * exp(-tj / 0.18), pan: 0.3)
      }
    }
  }
  for (i, a) in arrivals.enumerated() { chime(a, [880, 932, 988, 1047][i]) }
  chime(transmitTap + 0.4, 784)
  // Glitch bursts at every cut.
  for c in glitchCuts {
    let s0 = Int((c - 0.06) * sampleRate), len = Int(0.16 * sampleRate)
    var hold = 0.0, holdLeft = 0
    for j in 0..<len {
      if holdLeft <= 0 { hold = r.next() * 2 - 1; holdLeft = 6 + Int(r.next() * 40) }
      holdLeft -= 1
      let tj = Double(j) / sampleRate, env = sin(.pi * Double(j) / Double(len))
      let buzzTone = (sin(2 * .pi * 118 * tj) > 0 ? 1.0 : -1.0) * 0.4
      add(s0 + j, 0.14 * env * ((Int(tj * 60) % 2 == 0) ? 1 : 0.35) * (hold + buzzTone), pan: (r.next() - 0.5) * 0.8)
    }
  }
  // The landing: a low swell and a kick under the end card.
  do {
    var ph = [0.0, 0.0, 0.0], lp = 0.0
    let freqs = [36.71, 36.9, 73.42]
    for j in 0..<Int(3.4 * sampleRate) {
      let tj = Double(j) / sampleRate
      var x = 0.0
      for q in 0..<3 { ph[q] += freqs[q] / sampleRate; if ph[q] >= 1 { ph[q] -= 1 }; x += 2 * ph[q] - 1 }
      lp += (1 - exp(-2 * .pi * (90 + 1200 * exp(-tj / 0.35)) / sampleRate)) * (x - lp)
      add(Int(endCard * sampleRate) + j, 0.3 * lp * min(1, tj / 0.02) * exp(-tj / 1.4))
    }
    var phase = 0.0
    for j in 0..<Int(0.8 * sampleRate) {
      let tj = Double(j) / sampleRate
      phase += 2 * .pi * (38 + 95 * exp(-tj / 0.05)) / sampleRate
      add(Int(endCard * sampleRate) + j, 0.7 * sin(phase) * exp(-tj / 0.45))
    }
  }
  var peak: Float = 0
  for i in 0..<totalSamples { left[i] = tanhf(left[i] * 1.1); right[i] = tanhf(right[i] * 1.1); peak = max(peak, abs(left[i]), abs(right[i])) }
  let g = 0.9 / max(peak, 0.001)
  for i in 0..<totalSamples { left[i] *= g; right[i] *= g }
}

// MARK: - Post effects: glass, static, glitch tears

func glitchAmount(_ t: Double) -> Double {
  var a = 0.0
  for c in glitchCuts { let d = abs(t - c); if d < 0.14 { a = max(a, 1 - d / 0.14) } }
  return a
}
/// Full static for a couple of frames at every hard cut.
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
  NSGradient(colors: [rgb(0, 0, 0, 0), rgb(0, 0, 0, 0.62)], atLocations: [0.5, 1], colorSpace: .sRGB)!.draw(fromCenter: c, radius: 0, toCenter: c, radius: CGFloat(max(W, H)) * 0.62, options: [.drawsAfterEndingLocation])
  let screen = NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: W, height: H).insetBy(dx: 6, dy: 6), xRadius: 70, yRadius: 70)
  let frameMask = NSBezierPath(rect: NSRect(x: 0, y: 0, width: W, height: H)); frameMask.append(screen.reversed)
  NSColor.black.setFill(); frameMask.fill()
}

func renderFrame(_ ctx: CGContext, _ frame: Int) {
  let t = Double(frame) / Double(fps)
  currentGlitch = glitchAmount(t)
  // Handheld: slow drift plus a little hand tremor, never perfectly still.
  let sx = 6 * sin(t * 0.83) + 3 * sin(t * 2.1 + 1) + 1.0 * sin(t * 9.7)
  let sy = 5 * sin(t * 0.67 + 2) + 2.5 * sin(t * 1.9) + 0.8 * sin(t * 11.3 + 0.5)
  let rot = 0.0016 * sin(t * 0.55) + 0.0006 * sin(t * 3.1)
  ctx.saveGState()
  ctx.translateBy(x: CGFloat(W) / 2 + CGFloat(sx), y: CGFloat(H) / 2 + CGFloat(sy))
  ctx.rotate(by: CGFloat(rot)); ctx.scaleBy(x: 1.02, y: 1.02)
  ctx.translateBy(x: -CGFloat(W) / 2, y: -CGFloat(H) / 2)
  renderScene(ctx, t)
  ctx.restoreGState()
  postEffects(ctx, t, frame)
}

// MARK: - Encode

let outURL = URL(fileURLWithPath: "\(outDir)/hidn-ad-links-16x9.mp4")
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

