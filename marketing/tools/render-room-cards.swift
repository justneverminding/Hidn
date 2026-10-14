import AppKit

// Link-preview images for shared room links (/r/<slug>) and personal links
// (/to/<slug>), 1200x630, written to public/brand/rooms. Usage:
//   swift marketing/tools/render-room-cards.swift public/brand/rooms
let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "public/brand/rooms"
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r / 255, green: g / 255, blue: b / 255, alpha: a) }
func hex(_ s: String) -> NSColor {
  let v = Int(s.dropFirst(), radix: 16)!
  return rgb(CGFloat((v >> 16) & 255), CGFloat((v >> 8) & 255), CGFloat(v & 255))
}
let green = rgb(77, 255, 110), pale = rgb(196, 247, 204), dim = rgb(143, 217, 160)
func mono(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont { NSFont.monospacedSystemFont(ofSize: size, weight: weight) }
func width(_ s: String, _ f: NSFont, kern: CGFloat = 0) -> CGFloat { NSAttributedString(string: s, attributes: [.font: f, .kern: kern]).size().width }
func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ f: NSFont, _ c: NSColor, glow: CGFloat = 0, kern: CGFloat = 0) {
  var attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: c, .kern: kern]
  if glow > 0 { let g = NSShadow(); g.shadowColor = c.withAlphaComponent(0.55); g.shadowBlurRadius = glow; g.shadowOffset = .zero; attrs[.shadow] = g }
  NSAttributedString(string: s, attributes: attrs).draw(at: NSPoint(x: x, y: y))
}
func wrap(_ s: String, _ f: NSFont, _ maxWidth: CGFloat) -> [String] {
  var lines: [String] = [""]
  for w in s.split(separator: " ").map(String.init) {
    let c = lines[lines.count - 1].isEmpty ? w : lines[lines.count - 1] + " " + w
    if width(c, f) > maxWidth { lines.append(w) } else { lines[lines.count - 1] = c }
  }
  return lines
}

struct Card { let file: String; let path: String; let label: String; let title: String; let subtitle: String; let accent: String }
let cards = [
  Card(file: "general", path: "/r/general", label: "/// ROOM", title: "GENERAL", subtitle: "everything people are saying", accent: "#a9e6b4"),
  Card(file: "never-told-anyone", path: "/r/never-told-anyone", label: "/// ROOM", title: "THINGS I'VE NEVER TOLD ANYONE", subtitle: "say it here first", accent: "#a5d1d0"),
  Card(file: "talk-about-your-ex", path: "/r/talk-about-your-ex", label: "/// ROOM", title: "TALK ABOUT YOUR EX", subtitle: "women and men spill", accent: "#e6b0a9"),
  Card(file: "ragebait-me", path: "/r/ragebait-me", label: "/// ROOM", title: "RAGEBAIT ME", subtitle: "say the take that starts a fight", accent: "#f0a39a"),
  Card(file: "wildest-thing", path: "/r/wildest-thing", label: "/// ROOM", title: "THE WILDEST THING YOU'VE DONE", subtitle: "no names. no judgment. just tell it", accent: "#ecc29b"),
  Card(file: "student-secrets", path: "/r/student-secrets", label: "/// ROOM", title: "STUDENT SECRETS", subtitle: "school, uni, everything in between", accent: "#a9c4ec"),
  Card(file: "crypto-confessions", path: "/r/crypto-confessions", label: "/// ROOM", title: "CRYPTO CONFESSIONS", subtitle: "wins, losses, things you'd never tweet", accent: "#f4d38a"),
  Card(file: "personal-link", path: "/to/…", label: "/// SOMEONE OPENED A ROOM FOR YOU", title: "SAY IT. NO NAMES.", subtitle: "they'll never know it was you", accent: "#a9e6b4"),
]

for card in cards {
  let size = NSSize(width: 1200, height: 630)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1200, pixelsHigh: 630, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = size
  NSGraphicsContext.saveGraphicsState()
  let base = NSGraphicsContext(bitmapImageRep: rep)!
  base.cgContext.translateBy(x: 0, y: size.height); base.cgContext.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: base.cgContext, flipped: true)

  let accent = hex(card.accent)
  rgb(2, 5, 3).setFill(); NSRect(origin: .zero, size: size).fill()
  NSGradient(colors: [accent.withAlphaComponent(0.16), rgb(0, 0, 0, 0)])!.draw(fromCenter: NSPoint(x: 900, y: 120), radius: 0, toCenter: NSPoint(x: 900, y: 120), radius: 620, options: [])
  // Terminal window.
  let win = NSRect(x: 60, y: 60, width: 1080, height: 510)
  let body = NSBezierPath(roundedRect: win, xRadius: 16, yRadius: 16)
  rgb(3, 8, 5, 0.94).setFill(); body.fill()
  rgb(77, 255, 110, 0.35).setStroke(); body.lineWidth = 2; body.stroke()
  rgb(12, 22, 15).setFill(); NSRect(x: win.minX + 1, y: win.minY + 1, width: win.width - 2, height: 52).fill()
  let bar = "hidn@room: ~\(card.path)"
  text(bar, win.midX - width(bar, mono(18)) / 2, win.minY + 15, mono(18), rgb(200, 240, 205, 0.6))
  accent.setFill(); NSRect(x: win.minX + 1, y: win.minY + 53, width: win.width - 2, height: 3).fill()

  let x = win.minX + 56
  text(card.label, x, win.minY + 96, mono(20), dim, kern: 4)
  let titleFont = mono(card.title.count > 22 ? 58 : 72, .bold)
  let lines = wrap(card.title, titleFont, win.width - 112)
  var y = win.minY + 140
  for line in lines { text(line, x, y, titleFont, green, glow: 14, kern: 2); y += titleFont.pointSize * 1.12 }
  text("> \(card.subtitle)", x, y + 18, mono(28), pale)
  // Sign-off: the logo and the promise.
  let ly = win.maxY - 86
  let lf = mono(40, .bold)
  text(">", x, ly, lf, pale)
  text("hidn", x + width(">", lf), ly, lf, green, glow: 10)
  green.setFill(); NSRect(x: x + width(">hidn", lf) + 4, y: ly + 8, width: 20, height: 40).fill()
  let promise = "SAY IT. NO NAMES."
  text(promise, win.maxX - 56 - width(promise, mono(22, .medium), kern: 4), ly + 12, mono(22, .medium), accent, kern: 4)
  // Scanlines.
  rgb(0, 0, 0, 0.18).setFill()
  var sy: CGFloat = 0
  while sy < size.height { NSRect(x: 0, y: sy, width: size.width, height: 1).fill(); sy += 3 }

  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(outDir)/\(card.file).png"))
  print("wrote \(card.file).png")
}
