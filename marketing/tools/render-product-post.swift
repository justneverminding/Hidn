import AppKit

// Renders the HIDN product post (1080x1350) with the prompt-mark logo.
//   swift marketing/tools/render-product-post.swift marketing
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

func line(_ s: String, _ x: CGFloat, _ y: CGFloat, _ font: NSFont, _ color: NSColor, glow: Bool = true, fringe: Bool = false, kern: CGFloat = 0) {
  func draw(_ c: NSColor, _ dx: CGFloat, shadow: NSShadow?) {
    var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: c, .kern: kern]
    if let shadow { attrs[.shadow] = shadow }
    NSAttributedString(string: s, attributes: attrs).draw(at: NSPoint(x: x + dx, y: y))
  }
  if fringe { draw(rgb(255, 60, 90, 0.45), -2.5, shadow: nil); draw(rgb(60, 200, 255, 0.45), 2.5, shadow: nil) }
  var sh: NSShadow? = nil
  if glow { let g = NSShadow(); g.shadowColor = rgb(77, 255, 110, 0.7); g.shadowBlurRadius = 12; g.shadowOffset = .zero; sh = g }
  draw(color, 0, shadow: sh)
}
func textWidth(_ s: String, _ font: NSFont, kern: CGFloat = 0) -> CGFloat { NSAttributedString(string: s, attributes: [.font: font, .kern: kern]).size().width }

let W: CGFloat = 1080, H: CGFloat = 1350
let rep = renderRect(W, H) {
  ground.setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
  // The logo on its own band at the top, drawn as the master mark is.
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.saveGState(); ctx.translateBy(x: 0, y: -170)
  logo(W, height: W, scale: 0.17, lines: false)
  ctx.restoreGState()
  // The README window.
  let win = NSRect(x: 80, y: 540, width: 920, height: 640)
  let body = NSBezierPath(roundedRect: win, xRadius: 14, yRadius: 14)
  rgb(2, 6, 3, 0.96).setFill(); body.fill()
  rgb(12, 22, 15).setFill()
  NSBezierPath(roundedRect: NSRect(x: win.minX, y: win.minY, width: win.width, height: 46), xRadius: 14, yRadius: 14).fill()
  NSRect(x: win.minX, y: win.minY + 30, width: win.width, height: 16).fill()
  rgb(77, 255, 110, 0.35).setStroke(); body.lineWidth = 2; body.stroke()
  let bar = NSBezierPath(); bar.move(to: NSPoint(x: win.minX, y: win.minY + 46)); bar.line(to: NSPoint(x: win.maxX, y: win.minY + 46)); bar.lineWidth = 1.5; bar.stroke()
  for (i, c) in [rgb(240, 94, 98), rgb(219, 167, 74), rgb(91, 219, 129)].enumerated() {
    c.setFill(); NSBezierPath(ovalIn: NSRect(x: win.minX + 22 + CGFloat(i) * 24, y: win.minY + 16, width: 14, height: 14)).fill()
  }
  let title = "hidn@room: ~/about"
  line(title, win.midX - textWidth(title, mono(17, .regular)) / 2, win.minY + 12, mono(17, .regular), rgb(200, 240, 205, 0.6), glow: false)
  let x = win.minX + 50
  line("hidn@room:~$ cat README", x, win.minY + 82, mono(22, .regular), rgb(143, 217, 160), glow: false)
  line("SAY IT HERE.", x, win.minY + 130, mono(66), green, fringe: true, kern: 3)
  line("NOBODY KNOWS IT WAS YOU.", x, win.minY + 214, mono(36), pale, kern: 2)
  let items = [
    "> no accounts. no usernames. no email.",
    "> your key never leaves your device.",
    "> every post carries a zero-knowledge proof:",
    "  a member wrote this, never which one.",
    "> tip any thought in shielded ZEC.",
  ]
  for (i, l) in items.enumerated() { line(l, x, win.minY + 300 + CGFloat(i) * 46, mono(26, .regular), i == 3 ? rgb(143, 217, 160) : green, glow: i != 3, kern: 0.5) }
  let button = NSRect(x: x, y: win.maxY - 92, width: 330, height: 62)
  rgb(77, 255, 110, 0.6).setStroke(); let b = NSBezierPath(rect: button); b.lineWidth = 2; b.stroke()
  line("[ ENTER ROOM ]", button.minX + 34, button.minY + 15, mono(26), green, kern: 3)
  line("SOME THOUGHTS ARE MEANT TO BE HIDN", 80, 1240, mono(22, .regular), rgb(143, 217, 160), glow: false, kern: 2)
  let zec = "BUILT ON ZCASH"
  line(zec, 1000 - textWidth(zec, mono(22, .regular), kern: 2), 1240, mono(22, .regular), rgb(244, 183, 40, 0.85), glow: false, kern: 2)
  rgb(0, 0, 0, 0.22).setFill()
  var y: CGFloat = 0
  while y < H { NSRect(x: 0, y: y, width: W, height: 1).fill(); y += 3 }
}
save(rep, "hidn-product-post-1080x1350.png")
