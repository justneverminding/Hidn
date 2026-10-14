import AVFoundation
import AppKit

// Prints a video's tracks and saves a contact sheet of frames at given times.
//   swift marketing/tools/video-frames.swift video.mp4 sheet.png 1.5,4,9.2
let url = URL(fileURLWithPath: CommandLine.arguments[1]), out = CommandLine.arguments[2]
let times: [Double] = CommandLine.arguments.count > 3 ? CommandLine.arguments[3].split(separator: ",").map { Double($0)! } : [1, 5, 10, 15, 20, 25, 30, 35]
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
var images: [CGImage] = []
Task {
  for t in try await asset.load(.tracks) { print(t.mediaType.rawValue, try await t.load(.naturalSize), try await t.load(.timeRange).duration.seconds) }
  let gen = AVAssetImageGenerator(asset: asset); gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
  gen.maximumSize = CGSize(width: 270, height: 480)
  for s in times { images.append(try await gen.image(at: CMTime(seconds: s, preferredTimescale: 600)).image) }
  sem.signal()
}
sem.wait()
let cols = 6, tw = 270, th = 480, rows = (images.count + cols - 1) / cols
let ctx = CGContext(data: nil, width: cols * tw, height: rows * th, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(gray: 0, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: cols * tw, height: rows * th))
for (i, img) in images.enumerated() { ctx.draw(img, in: CGRect(x: (i % cols) * tw, y: (rows - 1 - i / cols) * th, width: tw, height: th)) }
try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("sheet written")
