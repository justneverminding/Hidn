import AppKit

// Renders the final HIDN logo kit: the glitch prompt mark >hidn▌.
//   swift marketing/tools/render-logo-final.swift public/brand
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

/// The HIDN mark: >hidn▌ in phosphor green, with an optional glitch (a
/// red/blue split and one torn slice). `scale` sets the type size relative to
/// the canvas width; `transparent` drops the background for overlays.
func logo(_ s: CGFloat, height h: CGFloat? = nil, scale: CGFloat = 0.2, glitch: Bool = true, transparent: Bool = false, lines: Bool = true) {
  let H = h ?? s
  if !transparent {
    ground.setFill(); NSRect(x: 0, y: 0, width: s, height: H).fill()
    let c = NSPoint(x: s / 2, y: H / 2)
    NSGradient(colors: [rgb(50, 140, 70, 0.22), rgb(0, 0, 0, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: max(s, H) * 0.62, options: [])
  }
  let chars = [(">", pale)] + letters("hidn", green) + [("▌", green)]
  let size = s * scale
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.saveGState(); ctx.translateBy(x: 0, y: (H - s) / 2)
  if glitch {
    for (dx, color) in [(-s * 0.006, rgb(255, 60, 90, 0.5)), (s * 0.006, rgb(60, 200, 255, 0.5))] {
      ctx.saveGState(); ctx.translateBy(x: dx, y: 0)
      _ = promptLine(s, chars.map { ($0.0, color) }, fontSize: size, glow: 0)
      ctx.restoreGState()
    }
  }
  _ = promptLine(s, chars, fontSize: size, glow: s * 0.018)
  if glitch {
    let tear = NSRect(x: 0, y: s / 2 - size * 0.225, width: s, height: size * 0.09)
    ctx.saveGState()
    NSBezierPath(rect: tear).addClip()
    if transparent { ctx.clear(tear) } else {
      ground.setFill(); tear.fill()
      let c = NSPoint(x: s / 2, y: H / 2)
      NSGradient(colors: [rgb(50, 140, 70, 0.22), rgb(0, 0, 0, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: max(s, H) * 0.62, options: [])
    }
    ctx.translateBy(x: size * 0.08, y: 0)
    _ = promptLine(s, chars, fontSize: size, glow: s * 0.018)
    ctx.restoreGState()
  }
  ctx.restoreGState()
  if lines && !transparent {
    rgb(0, 0, 0, 0.18).setFill()
    let step = max(3, s / 340)
    var y: CGFloat = 0
    while y < H { NSRect(x: 0, y: y, width: s, height: max(1, step / 3)).fill(); y += step }
  }
}

func renderRect(_ w: CGFloat, _ h: CGFloat, _ draw: () -> Void) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(w), pixelsHigh: Int(h), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: w, height: h)
  NSGraphicsContext.saveGraphicsState()
  let base = NSGraphicsContext(bitmapImageRep: rep)!
  base.cgContext.translateBy(x: 0, y: h); base.cgContext.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: base.cgContext, flipped: true)
  draw()
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

// Master and app icons (square, dark ground). The mark fills more of small
// icons, and the tiniest drop the glitch so they stay crisp.
save(render(1024) { s in logo(s) }, "hidn-mark.png")
save(render(512) { s in logo(s, scale: 0.21) }, "hidn-icon-512.png")
save(render(192) { s in logo(s, scale: 0.22) }, "hidn-icon-192.png")
save(render(180) { s in logo(s, scale: 0.22) }, "hidn-apple-touch-icon.png")
save(render(64) { s in logo(s, scale: 0.24, glitch: false, lines: false) }, "hidn-favicon-64.png")
save(render(32) { s in logo(s, scale: 0.25, glitch: false, lines: false) }, "hidn-favicon-32.png")
// Header wordmark for the public pages: transparent, wide, 2x for sharpness.
save(renderRect(780, 248) { logo(780, height: 248, scale: 0.2, transparent: true) }, "hidn-wordmark.png")
