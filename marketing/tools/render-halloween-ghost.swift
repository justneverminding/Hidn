import AppKit

// Renders the HIDN Halloween post: a phosphor pixel ghost whose eyes are
// redacted. Usage:
//   swift marketing/tools/render-halloween-ghost.swift marketing
let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r/255, green: g/255, blue: b/255, alpha: a) }
let green = rgb(77, 255, 110), pale = rgb(196, 247, 204), dim = rgb(143, 217, 160), pumpkin = rgb(255, 138, 31)
func mono(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont { NSFont.monospacedSystemFont(ofSize: size, weight: weight) }

struct RNG { var s: UInt64; mutating func next() -> CGFloat { s = s &* 6364136223846793005 &+ 1442695040888963407; return CGFloat(Double(s >> 11) / Double(1 << 53)) } }

func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ font: NSFont, _ color: NSColor, glow: CGFloat = 0, fringe: CGFloat = 0, kern: CGFloat = 0) {
  func put(_ c: NSColor, _ dx: CGFloat, _ shadow: NSShadow?) {
    var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: c, .kern: kern]
    if let shadow { attrs[.shadow] = shadow }
    NSAttributedString(string: s, attributes: attrs).draw(at: NSPoint(x: x + dx, y: y))
  }
  if fringe > 0 { put(rgb(255, 60, 90, 0.5), -fringe, nil); put(rgb(60, 200, 255, 0.5), fringe, nil) }
  var sh: NSShadow? = nil
  if glow > 0 { let g = NSShadow(); g.shadowColor = color.withAlphaComponent(0.6); g.shadowBlurRadius = glow; g.shadowOffset = .zero; sh = g }
  put(color, 0, sh)
}
func width(_ s: String, _ font: NSFont, kern: CGFloat = 0) -> CGFloat { NSAttributedString(string: s, attributes: [.font: font, .kern: kern]).size().width }

func savePNG(_ size: NSSize, _ name: String, _ draw: (CGContext) -> Void) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = size
  NSGraphicsContext.saveGraphicsState()
  let base = NSGraphicsContext(bitmapImageRep: rep)!
  base.cgContext.translateBy(x: 0, y: size.height); base.cgContext.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: base.cgContext, flipped: true)
  draw(base.cgContext)
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(outDir)/\(name)"))
  print("wrote \(name) \(Int(size.width))x\(Int(size.height))")
}

// The ghost, 16 x 18 pixels. "o" is the open mouth: BOO.
let sprite = [
  ".....######.....",
  "...##########...",
  "..############..",
  ".##############.",
  ".##############.",
  "################",
  "################",
  "################",
  "################",
  "#######oo#######",
  "######oooo######",
  "######oooo######",
  "#######oo#######",
  "################",
  "################",
  "################",
  "##.####..####.##",
  "#...##....##...#",
]

/// Draws the ghost with its top-left at (x, y), each sprite pixel `p` points.
func ghost(_ x: CGFloat, _ y: CGFloat, _ p: CGFloat) {
  var r = RNG(s: 7)
  let gap = max(2, p * 0.12)
  // Soft haunting glow behind the body.
  let c = NSPoint(x: x + 8 * p, y: y + 8 * p)
  NSGradient(colors: [rgb(60, 200, 100, 0.22), rgb(0, 0, 0, 0)])!.draw(fromCenter: c, radius: 0, toCenter: c, radius: 14 * p, options: [])
  for (row, line) in sprite.enumerated() {
    // Two rows torn sideways, like a signal dropping.
    let tear: CGFloat = row == 3 ? p * 0.6 : row == 13 ? -p * 0.45 : 0
    for (col, ch) in line.enumerated() where ch == "o" {
      rgb(1, 3, 1).setFill(); NSRect(x: x + CGFloat(col) * p + tear, y: y + CGFloat(row) * p, width: p, height: p).fill()
    }
    for (col, ch) in line.enumerated() where ch == "#" {
      let px = x + CGFloat(col) * p + tear, py = y + CGFloat(row) * p
      let rect = NSRect(x: px + gap / 2, y: py + gap / 2, width: p - gap, height: p - gap)
      // Colour bleeds only off the ends of a torn row.
      if tear != 0 && (col == line.firstIndex(of: "#").map { line.distance(from: line.startIndex, to: $0) } || col == line.lastIndex(of: "#").map { line.distance(from: line.startIndex, to: $0) }) {
        let left = col < 8
        (left ? rgb(255, 60, 90, 0.6) : rgb(60, 200, 255, 0.6)).setFill()
        rect.offsetBy(dx: left ? -p * 0.35 : p * 0.35, dy: 0).fill()
      }
      let shade = 0.78 + 0.22 * r.next()
      rgb(77 + 120 * (1 - shade), 255, 110 + 60 * (1 - shade), shade).setFill()
      rect.fill()
    }
  }
  // The hem dissolves: pixels drifting down and fading out.
  for i in 0..<34 {
    let col = CGFloat(Int(r.next() * 16)), fall = 1 + r.next() * 5.5
    let a = 0.75 * (1 - fall / 6.6)
    let s = p * (0.75 - 0.08 * fall)
    rgb(77, 255, 110, a).setFill()
    NSRect(x: x + col * p + (p - s) / 2, y: y + (17 + fall) * p, width: s, height: s).fill()
    if i % 7 == 0 { rgb(77, 255, 110, a * 0.4).setFill(); NSRect(x: x + col * p + p * 0.3, y: y + (18.5 + fall) * p, width: s * 0.5, height: s * 0.5).fill() }
  }
  // No face: the eyes are redacted.
  let bar = NSRect(x: x - 1.2 * p, y: y + 5.15 * p, width: 18.4 * p, height: 2.7 * p)
  rgb(1, 3, 1).setFill(); bar.fill()
  rgb(77, 255, 110, 0.35).setStroke(); let edge = NSBezierPath(rect: bar.insetBy(dx: 0.5, dy: 0.5)); edge.lineWidth = 1; edge.stroke()
  let f = mono(p * 0.62, .medium)
  let label = "[ NAME WITHHELD ]"
  text(label, bar.midX - width(label, f, kern: p * 0.08) / 2, bar.midY - f.pointSize * 0.62, f, dim, kern: p * 0.08)
}

func logo(_ x: CGFloat, _ y: CGFloat, _ size: CGFloat) {
  let f = mono(size, .bold)
  text(">", x, y, f, pale)
  let gx = x + width(">", f)
  text("hidn", gx, y, f, green, glow: 6, fringe: 1.5)
  green.setFill(); NSRect(x: gx + width("hidn", f) + size * 0.08, y: y + size * 0.2, width: size * 0.5, height: size * 0.98).fill()
}

func atmosphere(_ size: NSSize) {
  rgb(1, 3, 1).setFill(); NSRect(origin: .zero, size: size).fill()
  // A faint wall of room traffic behind everything.
  var r = RNG(s: 99)
  let f = mono(15)
  let words = ["ANONYMOUS", "▌", "0x7f3a", "NO NAME", "boo", "SIGNAL", "▒▒▒▒", "nobody signs", "[REDACTED]", "∅"]
  var y: CGFloat = 12
  while y < size.height {
    var x: CGFloat = CGFloat(Int(r.next() * 60)) - 30
    while x < size.width { let w = words[Int(r.next() * CGFloat(words.count))]; text(w, x, y, f, rgb(77, 255, 110, 0.018 + 0.022 * r.next())); x += width(w, f) + 60 + r.next() * 140 }
    y += 34
  }
}

func finish(_ size: NSSize) {
  let c = NSPoint(x: size.width / 2, y: size.height / 2)
  NSGradient(colors: [rgb(0, 0, 0, 0), rgb(0, 0, 0, 0.7)], atLocations: [0.45, 1], colorSpace: .sRGB)!.draw(fromCenter: c, radius: 0, toCenter: c, radius: max(size.width, size.height) * 0.72, options: [.drawsAfterEndingLocation])
  rgb(0, 0, 0, 0.22).setFill()
  var y: CGFloat = 0
  while y < size.height { NSRect(x: 0, y: y, width: size.width, height: 1).fill(); y += 3 }
  // Grain.
  var r = RNG(s: 4)
  for _ in 0..<Int(size.width * size.height / 90) {
    rgb(200, 255, 210, 0.05 * r.next()).setFill()
    NSRect(x: r.next() * size.width, y: r.next() * size.height, width: 1.5, height: 1.5).fill()
  }
}

func terminalLog(_ x: CGFloat, _ y: CGFloat, _ size: CGFloat) {
  let f = mono(size)
  let lines: [(String, NSColor)] = [
    ("hidn@room:~$ whoami", dim), ("> ghost", green),
    ("hidn@room:~$ ls ./names", dim), ("> 0 results", green),
  ]
  for (i, l) in lines.enumerated() { text(l.0, x, y + CGFloat(i) * size * 1.6, f, l.1, glow: l.1 == green ? 4 : 0) }
}

func tag(_ x: CGFloat, _ y: CGFloat, _ size: CGFloat, alignRight: Bool = false) {
  let s = "31.10 // HALLOWEEN IN THE ROOM", f = mono(size, .medium)
  let w = width(s, f, kern: size * 0.14)
  let tx = alignRight ? x - w : x
  pumpkin.withAlphaComponent(0.12).setFill(); NSRect(x: tx - 12, y: y - 7, width: w + 24, height: size * 1.75).fill()
  pumpkin.withAlphaComponent(0.6).setStroke(); let b = NSBezierPath(rect: NSRect(x: tx - 12, y: y - 7, width: w + 24, height: size * 1.75)); b.lineWidth = 1; b.stroke()
  text(s, tx, y, f, pumpkin, glow: 5, kern: size * 0.14)
}

// Landscape, for the X timeline (shows uncropped).
savePNG(NSSize(width: 1600, height: 900), "hidn-halloween-x-1600x900.png") { _ in
  let size = NSSize(width: 1600, height: 900)
  atmosphere(size)
  ghost(1010, 150, 26)
  terminalLog(110, 150, 22)
  let boo = mono(230, .bold)
  text("BOO.", 96, 300, boo, green, glow: 14, fringe: 4, kern: 6)
  text("> no name. no face. just the truth.", 112, 590, mono(30), pale, kern: 0.5)
  text("> some thoughts are meant to be hidn.", 112, 640, mono(22), dim, kern: 0.5)
  tag(1490, 70, 18, alignRight: true)
  logo(112, 760, 46)
  text("SAY IT. NO NAMES.", 300, 778, mono(18, .medium), dim, kern: 4)
  finish(size)
}

// Portrait, for a taller post.
savePNG(NSSize(width: 1080, height: 1350), "hidn-halloween-x-1080x1350.png") { _ in
  let size = NSSize(width: 1080, height: 1350)
  atmosphere(size)
  tag(540 + width("31.10 // HALLOWEEN IN THE ROOM", mono(18, .medium), kern: 18 * 0.14) / 2, 70, 18, alignRight: true)
  ghost(540 - 8 * 26, 160, 26)
  let boo = mono(200, .bold)
  text("BOO.", (1080 - width("BOO.", boo, kern: 6)) / 2, 760, boo, green, glow: 14, fringe: 4, kern: 6)
  let l1 = "> no name. no face. just the truth."
  text(l1, (1080 - width(l1, mono(30))) / 2, 1010, mono(30), pale)
  logo(380, 1150, 46)
  text("SAY IT. NO NAMES.", 572, 1168, mono(18, .medium), dim, kern: 4)
  finish(size)
}
