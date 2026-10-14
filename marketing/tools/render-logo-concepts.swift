import AppKit

// Renders four terminal-style HIDN logo concepts plus a contact sheet.
//   swift marketing/tools/render-logo-concepts.swift marketing/logo-concepts
let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r/255, green: g/255, blue: b/255, alpha: a) }
let ground = rgb(2, 5, 3), green = rgb(77, 255, 110), pale = rgb(196, 247, 204), bone = rgb(236, 230, 214)
func mono(_ size: CGFloat, _ weight: NSFont.Weight = .medium) -> NSFont { NSFont.monospacedSystemFont(ofSize: size, weight: weight) }

func glowText(_ s: String, center: NSPoint, font: NSFont, color: NSColor, glow: CGFloat = 18, kern: CGFloat = 0) {
  let sh = NSShadow(); sh.shadowColor = color.withAlphaComponent(0.65); sh.shadowBlurRadius = glow; sh.shadowOffset = .zero
  let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .kern: kern, .shadow: sh]
  let str = NSAttributedString(string: s, attributes: attrs)
  let size = str.size()
  str.draw(at: NSPoint(x: center.x - size.width / 2, y: center.y - size.height / 2))
}
func charWidth(_ font: NSFont) -> CGFloat { NSAttributedString(string: "M", attributes: [.font: font]).size().width }

func render(_ size: CGFloat, _ draw: (CGFloat) -> Void) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: size, height: size)
  NSGraphicsContext.saveGraphicsState()
  let base = NSGraphicsContext(bitmapImageRep: rep)!
  base.cgContext.translateBy(x: 0, y: size)
  base.cgContext.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: base.cgContext, flipped: true)
  draw(size)
  NSGraphicsContext.restoreGraphicsState()
  return rep
}
func save(_ rep: NSBitmapImageRep, _ name: String) {
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(outDir)/\(name)"))
  print("wrote \(name)")
}

func background(_ s: CGFloat) {
  ground.setFill(); NSRect(x: 0, y: 0, width: s, height: s).fill()
  let c = NSPoint(x: s / 2, y: s / 2)
  NSGradient(colors: [rgb(50, 140, 70, 0.22), rgb(0, 0, 0, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: s * 0.62, options: [])
}
func scanlines(_ s: CGFloat) {
  rgb(0, 0, 0, 0.18).setFill()
  let step = max(3, s / 340)
  var y: CGFloat = 0
  while y < s { NSRect(x: 0, y: y, width: s, height: max(1, step / 3)).fill(); y += step }
}
/// A black bar with diagonal hatching and a phosphor outline: the redaction.
func redaction(_ r: NSRect, line: CGFloat) {
  NSColor.black.setFill(); r.fill()
  NSGraphicsContext.saveGraphicsState()
  NSBezierPath(rect: r).addClip()
  rgb(77, 255, 110, 0.42).setStroke()
  var x = r.minX - r.height
  while x < r.maxX {
    let p = NSBezierPath(); p.move(to: NSPoint(x: x, y: r.maxY)); p.line(to: NSPoint(x: x + r.height, y: r.minY)); p.lineWidth = line; p.stroke()
    x += line * 4.5
  }
  NSGraphicsContext.restoreGraphicsState()
  rgb(77, 255, 110, 0.75).setStroke(); let o = NSBezierPath(rect: r.insetBy(dx: line / 2, dy: line / 2)); o.lineWidth = line; o.stroke()
}

// A. REDACTED: the ID in HIDN is withheld. H[██]N.
func conceptRedacted(_ s: CGFloat) {
  background(s)
  let f = mono(s * 0.25, .bold)
  let w = charWidth(f)
  let total = w * 4, x0 = (s - total) / 2, cy = s / 2
  glowText("H", center: NSPoint(x: x0 + w * 0.5, y: cy), font: f, color: bone, glow: s * 0.01)
  glowText("N", center: NSPoint(x: x0 + w * 3.5, y: cy), font: f, color: bone, glow: s * 0.01)
  redaction(NSRect(x: x0 + w * 1.06, y: cy - s * 0.1, width: w * 1.88, height: s * 0.2), line: s * 0.008)
  scanlines(s)
}

// B. PROMPT: the wordmark typed at a prompt, cursor waiting.
func conceptPrompt(_ s: CGFloat) {
  background(s)
  let f = mono(s * 0.17, .semibold)
  let label = ">hidn"
  let w = charWidth(f)
  let total = w * CGFloat(label.count) + w * 0.9
  let x0 = (s - total) / 2, cy = s / 2
  for (i, ch) in label.enumerated() {
    glowText(String(ch), center: NSPoint(x: x0 + w * (CGFloat(i) + 0.5), y: cy), font: f, color: i == 0 ? pale : green)
  }
  green.setFill(); NSRect(x: x0 + w * CGFloat(label.count) + w * 0.12, y: cy - s * 0.085, width: w * 0.72, height: s * 0.17).fill()
  scanlines(s)
}

// C. TERMINAL EYE: a terminal window whose cursor is an eye.
func conceptTerminalEye(_ s: CGFloat) {
  background(s)
  let win = NSRect(x: s * 0.14, y: s * 0.2, width: s * 0.72, height: s * 0.6)
  let body = NSBezierPath(roundedRect: win, xRadius: s * 0.05, yRadius: s * 0.05)
  rgb(4, 10, 6).setFill(); body.fill()
  rgb(77, 255, 110, 0.55).setStroke(); body.lineWidth = s * 0.008; body.stroke()
  let barH = s * 0.1
  let bar = NSBezierPath(); bar.move(to: NSPoint(x: win.minX, y: win.minY + barH)); bar.line(to: NSPoint(x: win.maxX, y: win.minY + barH)); bar.lineWidth = s * 0.006; bar.stroke()
  for (i, c) in [rgb(240, 94, 98), rgb(219, 167, 74), rgb(91, 219, 129)].enumerated() {
    c.setFill(); NSBezierPath(ovalIn: NSRect(x: win.minX + s * (0.045 + CGFloat(i) * 0.05), y: win.minY + barH / 2 - s * 0.017, width: s * 0.034, height: s * 0.034)).fill()
  }
  let f = mono(s * 0.2, .bold)
  let cy = win.minY + barH + (win.height - barH) / 2
  glowText(">", center: NSPoint(x: win.minX + s * 0.17, y: cy), font: f, color: green)
  // The cursor block is an eye: almond white, green iris, black pupil.
  let eye = NSRect(x: win.minX + s * 0.29, y: cy - s * 0.085, width: s * 0.3, height: s * 0.17)
  let almond = NSBezierPath()
  almond.move(to: NSPoint(x: eye.minX, y: eye.midY))
  almond.curve(to: NSPoint(x: eye.maxX, y: eye.midY), controlPoint1: NSPoint(x: eye.minX + eye.width * 0.3, y: eye.minY - eye.height * 0.35), controlPoint2: NSPoint(x: eye.maxX - eye.width * 0.3, y: eye.minY - eye.height * 0.35))
  almond.curve(to: NSPoint(x: eye.minX, y: eye.midY), controlPoint1: NSPoint(x: eye.maxX - eye.width * 0.3, y: eye.maxY + eye.height * 0.35), controlPoint2: NSPoint(x: eye.minX + eye.width * 0.3, y: eye.maxY + eye.height * 0.35))
  bone.setFill(); almond.fill()
  NSGraphicsContext.saveGraphicsState(); almond.addClip()
  let iris = NSRect(x: eye.midX - eye.height * 0.42, y: eye.midY - eye.height * 0.42, width: eye.height * 0.84, height: eye.height * 0.84)
  green.setFill(); NSBezierPath(ovalIn: iris).fill()
  NSColor.black.setFill(); NSBezierPath(ovalIn: iris.insetBy(dx: iris.width * 0.3, dy: iris.height * 0.3)).fill()
  NSGraphicsContext.restoreGraphicsState()
  scanlines(s)
}

// D. BRACKETED: a lowercase h under surveillance brackets, with a cursor.
func conceptBracketed(_ s: CGFloat) {
  background(s)
  let inset = s * 0.2, arm = s * 0.12, lw = s * 0.018
  bone.setStroke()
  for (x, y, dx, dy) in [(inset, inset, 1.0, 1.0), (s - inset, inset, -1.0, 1.0), (inset, s - inset, 1.0, -1.0), (s - inset, s - inset, -1.0, -1.0)] {
    let p = NSBezierPath(); p.move(to: NSPoint(x: x + arm * dx, y: y)); p.line(to: NSPoint(x: x, y: y)); p.line(to: NSPoint(x: x, y: y + arm * dy))
    p.lineWidth = lw; p.lineCapStyle = .square; p.stroke()
  }
  let f = mono(s * 0.4, .bold)
  let w = charWidth(f)
  glowText("h", center: NSPoint(x: s / 2 - w * 0.28, y: s / 2 - s * 0.02), font: f, color: green)
  green.setFill(); NSRect(x: s / 2 + w * 0.3, y: s / 2 + s * 0.14, width: w * 0.55, height: s * 0.045).fill()
  scanlines(s)
}

let concepts: [(String, String, (CGFloat) -> Void)] = [
  ("a-redacted", "A  REDACTED", conceptRedacted),
  ("b-prompt", "B  PROMPT", conceptPrompt),
  ("c-terminal-eye", "C  TERMINAL EYE", conceptTerminalEye),
  ("d-bracketed", "D  BRACKETED", conceptBracketed),
]
for (slug, _, draw) in concepts { save(render(1024, draw), "hidn-logo-\(slug).png") }

// Contact sheet: each concept large, plus the same mark at real avatar sizes.
let sheetW: CGFloat = 1600, sheetH: CGFloat = 700
let sheet = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(sheetW), pixelsHigh: Int(sheetH), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let sbase = NSGraphicsContext(bitmapImageRep: sheet)!
sbase.cgContext.translateBy(x: 0, y: sheetH); sbase.cgContext.scaleBy(x: 1, y: -1)
NSGraphicsContext.current = NSGraphicsContext(cgContext: sbase.cgContext, flipped: true)
rgb(1, 3, 1).setFill(); NSRect(x: 0, y: 0, width: sheetW, height: sheetH).fill()
for (i, (_, label, draw)) in concepts.enumerated() {
  let col = CGFloat(i), x = 40 + col * 390
  let big = render(340, draw)
  big.draw(in: NSRect(x: x, y: 90, width: 340, height: 340), from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
  let attrs: [NSAttributedString.Key: Any] = [.font: mono(22), .foregroundColor: pale]
  NSAttributedString(string: label, attributes: attrs).draw(at: NSPoint(x: x, y: 40))
  // Avatar sizes, clipped to circles like profile pictures.
  for (j, size) in [128.0, 64.0, 40.0].enumerated() {
    let s = CGFloat(size)
    let rect = NSRect(x: x + [0, 150, 236][j], y: 480, width: s, height: s)
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(ovalIn: rect).addClip()
    render(s * 2, draw).draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
    NSGraphicsContext.restoreGraphicsState()
  }
}
let note: [NSAttributedString.Key: Any] = [.font: mono(18), .foregroundColor: rgb(143, 217, 160, 0.8)]
NSAttributedString(string: "Concepts only. The canonical eye logo is unchanged until one is chosen.", attributes: note).draw(at: NSPoint(x: 40, y: 650))
NSGraphicsContext.restoreGraphicsState()
save(sheet, "hidn-logo-concepts-sheet.png")
