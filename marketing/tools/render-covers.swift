import AppKit

// Renders HIDN cover photos for social platforms. Usage:
//   swift marketing/tools/render-covers.swift marketing
// Each cover centres a terminal window inside the platform's safe zone.
let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r/255, green: g/255, blue: b/255, alpha: a) }
let green = rgb(77, 255, 110), pale = rgb(196, 247, 204), dim = rgb(143, 217, 160)
func mono(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont { NSFont.monospacedSystemFont(ofSize: size, weight: weight) }

func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ font: NSFont, _ color: NSColor, glow: Bool = true, fringe: Bool = false, kern: CGFloat = 0) {
  func draw(_ c: NSColor, _ dx: CGFloat, shadow: NSShadow?) {
    var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: c, .kern: kern]
    if let shadow { attrs[.shadow] = shadow }
    NSAttributedString(string: s, attributes: attrs).draw(at: NSPoint(x: x + dx, y: y))
  }
  if fringe {
    draw(rgb(255, 60, 90, 0.45), -2.5, shadow: nil)
    draw(rgb(60, 200, 255, 0.45), 2.5, shadow: nil)
  }
  var sh: NSShadow? = nil
  if glow { let g = NSShadow(); g.shadowColor = rgb(77, 255, 110, 0.7); g.shadowBlurRadius = 12; g.shadowOffset = .zero; sh = g }
  draw(color, 0, shadow: sh)
}
func width(_ s: String, _ font: NSFont, kern: CGFloat = 0) -> CGFloat {
  NSAttributedString(string: s, attributes: [.font: font, .kern: kern]).size().width
}

func savePNG(_ size: NSSize, _ name: String, _ draw: () -> Void) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = size
  NSGraphicsContext.saveGraphicsState()
  let base = NSGraphicsContext(bitmapImageRep: rep)!
  // y grows downward, like a web canvas; AppKit is told so text stays upright.
  base.cgContext.translateBy(x: 0, y: size.height)
  base.cgContext.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: base.cgContext, flipped: true)
  draw()
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(outDir)/\(name)"))
  print("wrote \(name) \(Int(size.width))x\(Int(size.height))")
}

func scanlines(_ size: NSSize) {
  rgb(0, 0, 0, 0.22).setFill()
  var y: CGFloat = 0
  while y < size.height { NSRect(x: 0, y: y, width: size.width, height: 1).fill(); y += 3 }
}
func bloom(_ c: NSPoint, _ r: CGFloat, _ a: CGFloat) {
  NSGradient(colors: [rgb(60, 160, 80, a), rgb(0, 0, 0, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: r, options: [])
}
func terminalWindow(_ win: NSRect, title: String, k: CGFloat) {
  let r = 14 * k, barH = 46 * k
  let body = NSBezierPath(roundedRect: win, xRadius: r, yRadius: r)
  rgb(2, 6, 3, 0.94).setFill(); body.fill()
  rgb(12, 22, 15).setFill()
  NSBezierPath(roundedRect: NSRect(x: win.minX, y: win.minY, width: win.width, height: barH), xRadius: r, yRadius: r).fill()
  NSRect(x: win.minX, y: win.minY + barH - r, width: win.width, height: r).fill()
  rgb(77, 255, 110, 0.35).setStroke(); body.lineWidth = 2; body.stroke()
  let line = NSBezierPath(); line.move(to: NSPoint(x: win.minX, y: win.minY + barH)); line.line(to: NSPoint(x: win.maxX, y: win.minY + barH)); line.lineWidth = 1.5; line.stroke()
  for (i, c) in [rgb(240, 94, 98), rgb(219, 167, 74), rgb(91, 219, 129)].enumerated() {
    c.setFill(); NSBezierPath(ovalIn: NSRect(x: win.minX + (22 + CGFloat(i) * 24) * k, y: win.minY + 16 * k, width: 14 * k, height: 14 * k)).fill()
  }
  let f = mono(17 * k)
  text(title, win.midX - width(title, f) / 2, win.minY + 12 * k, f, rgb(200, 240, 205, 0.6), glow: false)
}

func coverPhoto(_ size: NSSize, _ name: String, scale k: CGFloat, windowY: CGFloat) {
  savePNG(size, name) {
    rgb(1, 3, 1).setFill(); NSRect(origin: .zero, size: size).fill()
    bloom(NSPoint(x: size.width / 2, y: size.height * 0.45), size.width * 0.42, 0.16)
    let ww = 760 * k, wh = 290 * k
    let win = NSRect(x: (size.width - ww) / 2, y: windowY, width: ww, height: wh)
    terminalWindow(win, title: "hidn@room: ~", k: k)
    let x = win.minX + 40 * k
    text("hidn@room:~$ ./enter --without-a-name", x, win.minY + 70 * k, mono(17 * k), dim, glow: false)
    text("SAY WHAT YOU CAN'T", x, win.minY + 104 * k, mono(46 * k, .medium), green, fringe: true, kern: 3 * k)
    text("SAY PUBLICLY.", x, win.minY + 160 * k, mono(46 * k, .medium), green, fringe: true, kern: 3 * k)
    let tail = "> NO ACCOUNTS / NO NAMES / ZERO KNOWLEDGE"
    text(tail, x, win.minY + 234 * k, mono(17 * k), pale, kern: 1.5 * k)
    green.setFill(); NSRect(x: x + width(tail, mono(17 * k), kern: 1.5 * k) + 8 * k, y: win.minY + 236 * k, width: 10 * k, height: 21 * k).fill()
    let rule = win.maxY + 22 * k
    rgb(77, 255, 110, 0.25).setFill(); NSRect(x: win.minX, y: rule, width: ww, height: 1).fill()
    let tag = "///  SOME THOUGHTS ARE MEANT TO BE HIDN"
    text(tag, (size.width - width(tag, mono(15 * k), kern: 2 * k)) / 2, rule + 12 * k, mono(15 * k), dim, glow: false, kern: 2 * k)
    scanlines(size)
  }
}

coverPhoto(NSSize(width: 1500, height: 500), "hidn-cover-x-1500x500.png", scale: 1.0, windowY: 70)
coverPhoto(NSSize(width: 1584, height: 396), "hidn-cover-linkedin-1584x396.png", scale: 0.86, windowY: 34)
coverPhoto(NSSize(width: 1640, height: 624), "hidn-cover-facebook-1640x624.png", scale: 1.15, windowY: 104)
