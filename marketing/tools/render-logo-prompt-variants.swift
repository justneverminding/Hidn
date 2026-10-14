import AppKit

// Renders variations on the prompt logo (>hidn▌) plus a contact sheet.
//   swift marketing/tools/render-logo-prompt-variants.swift marketing/logo-concepts
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

/// Lays out monospace characters centred on the canvas. Each entry is a
/// character and its colour; "▌" draws a solid block cursor.
func promptLine(_ s: CGFloat, _ chars: [(String, NSColor)], fontSize: CGFloat, weight: NSFont.Weight = .semibold, cy: CGFloat? = nil, glow: CGFloat = 18) -> (x0: CGFloat, w: CGFloat) {
  let f = mono(fontSize, weight)
  let w = charWidth(f)
  let x0 = (s - w * CGFloat(chars.count)) / 2
  let y = cy ?? s / 2
  for (i, (ch, color)) in chars.enumerated() {
    let cx = x0 + w * (CGFloat(i) + 0.5)
    if ch == "▌" {
      color.setFill(); NSRect(x: cx - w * 0.4, y: y - fontSize * 0.5, width: w * 0.8, height: fontSize).fill()
    } else if ch == "_" {
      color.setFill(); NSRect(x: cx - w * 0.42, y: y + fontSize * 0.33, width: w * 0.84, height: fontSize * 0.13).fill()
    } else {
      glowText(ch, center: NSPoint(x: cx, y: y), font: f, color: color, glow: glow)
    }
  }
  return (x0, w)
}
func letters(_ s: String, _ color: NSColor) -> [(String, NSColor)] { s.map { (String($0), color) } }

// 1. Original, enlarged so it fills more of an avatar.
func vOriginal(_ s: CGFloat) {
  background(s)
  _ = promptLine(s, [(">", pale)] + letters("hidn", green) + [("▌", green)], fontSize: s * 0.2)
  scanlines(s)
}
// 2. Shell prompt with an underscore cursor.
func vDollar(_ s: CGFloat) {
  background(s)
  _ = promptLine(s, [("$", pale), (" ", green)] + letters("hidn", green) + [("_", green)], fontSize: s * 0.17)
  scanlines(s)
}
// 3. The cursor sits on the d: the letter shows in reverse video.
func vSelected(_ s: CGFloat) {
  background(s)
  let size = s * 0.2
  let (x0, w) = promptLine(s, [(">", pale), ("h", green), ("i", green), (" ", green), ("n", green)], fontSize: size)
  let cx = x0 + w * 3.5
  green.setFill(); NSRect(x: cx - w * 0.5, y: s / 2 - size * 0.56, width: w, height: size * 1.12).fill()
  glowText("d", center: NSPoint(x: cx, y: s / 2), font: mono(size, .semibold), color: NSColor.black, glow: 0)
  scanlines(s)
}
// 4. The ID is redacted inside the prompt: >h██n▌
func vRedactedID(_ s: CGFloat) {
  background(s)
  let size = s * 0.18
  let (x0, w) = promptLine(s, [(">", pale), ("h", green), (" ", green), (" ", green), ("n", green), ("▌", green)], fontSize: size)
  redaction(NSRect(x: x0 + w * 2.06, y: s / 2 - size * 0.42, width: w * 1.88, height: size * 0.84), line: s * 0.007)
  scanlines(s)
}
// 5. Glitch: a red/blue split and one torn horizontal slice.
func vGlitch(_ s: CGFloat) {
  background(s)
  let chars = [(">", pale)] + letters("hidn", green) + [("▌", green)]
  let ctx = NSGraphicsContext.current!.cgContext
  for (dx, color) in [(-s * 0.006, rgb(255, 60, 90, 0.5)), (s * 0.006, rgb(60, 200, 255, 0.5))] {
    ctx.saveGState(); ctx.translateBy(x: dx, y: 0)
    _ = promptLine(s, chars.map { ($0.0, color) }, fontSize: s * 0.2, glow: 0)
    ctx.restoreGState()
  }
  _ = promptLine(s, chars, fontSize: s * 0.2)
  // Torn slice: a band of the canvas shifted sideways.
  ctx.saveGState()
  let tear = NSRect(x: 0, y: s * 0.455, width: s, height: s * 0.018)
  NSBezierPath(rect: tear).addClip()
  background(s)
  ctx.translateBy(x: s * 0.016, y: 0)
  _ = promptLine(s, chars, fontSize: s * 0.2)
  ctx.restoreGState()
  scanlines(s)
}
// 6. Stacked for avatars: a large >_ with the name beneath.
func vStacked(_ s: CGFloat) {
  background(s)
  _ = promptLine(s, [(">", pale), ("_", green)], fontSize: s * 0.42, weight: .bold, cy: s * 0.42)
  _ = promptLine(s, letters("hidn", green), fontSize: s * 0.11, cy: s * 0.74, glow: 10)
  scanlines(s)
}
// 7. Inside a terminal window.
func vWindow(_ s: CGFloat) {
  background(s)
  let win = NSRect(x: s * 0.1, y: s * 0.26, width: s * 0.8, height: s * 0.48)
  let body = NSBezierPath(roundedRect: win, xRadius: s * 0.045, yRadius: s * 0.045)
  rgb(4, 10, 6).setFill(); body.fill()
  rgb(77, 255, 110, 0.55).setStroke(); body.lineWidth = s * 0.007; body.stroke()
  let barH = s * 0.09
  let bar = NSBezierPath(); bar.move(to: NSPoint(x: win.minX, y: win.minY + barH)); bar.line(to: NSPoint(x: win.maxX, y: win.minY + barH)); bar.lineWidth = s * 0.005; bar.stroke()
  for (i, c) in [rgb(240, 94, 98), rgb(219, 167, 74), rgb(91, 219, 129)].enumerated() {
    c.setFill(); NSBezierPath(ovalIn: NSRect(x: win.minX + s * (0.04 + CGFloat(i) * 0.045), y: win.minY + barH / 2 - s * 0.015, width: s * 0.03, height: s * 0.03)).fill()
  }
  _ = promptLine(s, [(">", pale)] + letters("hidn", green) + [("▌", green)], fontSize: s * 0.14, cy: win.minY + barH + (win.height - barH) / 2)
  scanlines(s)
}
// 8. Capitals in bone, like the original wordmark, with a green cursor.
func vCaps(_ s: CGFloat) {
  background(s)
  _ = promptLine(s, [(">", green)] + letters("HIDN", bone) + [("▌", green)], fontSize: s * 0.19, weight: .bold, glow: 8)
  scanlines(s)
}

let variants: [(String, String, (CGFloat) -> Void)] = [
  ("p1-original", "1  ORIGINAL", vOriginal),
  ("p2-dollar", "2  $ PROMPT", vDollar),
  ("p3-selected", "3  CURSOR ON D", vSelected),
  ("p4-redacted-id", "4  REDACTED ID", vRedactedID),
  ("p5-glitch", "5  GLITCH", vGlitch),
  ("p6-stacked", "6  STACKED", vStacked),
  ("p7-window", "7  WINDOW", vWindow),
  ("p8-caps", "8  CAPS", vCaps),
]
for (slug, _, draw) in variants { save(render(1024, draw), "hidn-logo-\(slug).png") }

// Contact sheet: two rows of four, each with avatar-size circles.
let sheetW: CGFloat = 1600, sheetH: CGFloat = 1260
let sheet = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(sheetW), pixelsHigh: Int(sheetH), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let sbase = NSGraphicsContext(bitmapImageRep: sheet)!
sbase.cgContext.translateBy(x: 0, y: sheetH); sbase.cgContext.scaleBy(x: 1, y: -1)
NSGraphicsContext.current = NSGraphicsContext(cgContext: sbase.cgContext, flipped: true)
rgb(1, 3, 1).setFill(); NSRect(x: 0, y: 0, width: sheetW, height: sheetH).fill()
for (i, (_, label, draw)) in variants.enumerated() {
  let col = CGFloat(i % 4), row = CGFloat(i / 4)
  let x = 40 + col * 390, top = 30 + row * 600
  NSAttributedString(string: label, attributes: [.font: mono(22), .foregroundColor: pale]).draw(at: NSPoint(x: x, y: top))
  render(340, draw).draw(in: NSRect(x: x, y: top + 44, width: 340, height: 340), from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
  for (j, size) in [112.0, 64.0, 40.0].enumerated() {
    let s = CGFloat(size)
    let rect = NSRect(x: x + [0, 136, 216][j], y: top + 410, width: s, height: s)
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(ovalIn: rect).addClip()
    render(s * 2, draw).draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
    NSGraphicsContext.restoreGraphicsState()
  }
}
NSGraphicsContext.restoreGraphicsState()
save(sheet, "hidn-logo-prompt-variants-sheet.png")
