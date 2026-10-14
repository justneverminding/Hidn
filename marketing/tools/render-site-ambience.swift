import AVFoundation

// Renders the site's room sound as a long, seamless loop built from the
// story ad's soundtrack: the dark D-minor bed, wind and crackle, the music-box
// tune in sparse phrases, the doll-like servo turn, soft terminal beeps and
// typing, with the original interface sound underneath. Usage:
//   swift -O marketing/tools/render-site-ambience.swift public/audio/hidn-room-loop.m4a
// The original sound stays at public/audio/hidn-recording-source.m4a.

let outPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "hidn-room-loop.m4a"
let originalPath = "public/audio/hidn-recording-source.m4a"
let sampleRate = 44_100.0
let loopLength = 180.0      // seconds in one loop
let tailLength = 10.0       // rendered past the end, then folded onto the start
let total = Int((loopLength + tailLength) * sampleRate)
var left = [Float](repeating: 0, count: total), right = [Float](repeating: 0, count: total)

struct RNG { var s: UInt64; mutating func next() -> Double { s = s &* 6364136223846793005 &+ 1442695040888963407; return Double(s >> 11) / Double(1 << 53) } }
func smooth(_ x: Double) -> Double { let t = max(0, min(1, x)); return t * t * (3 - 2 * t) }
func add(_ i: Int, _ v: Double, pan: Double = 0) {
  guard i >= 0 && i < total else { return }
  left[i] += Float(v * (1 - max(0, pan))); right[i] += Float(v * (1 + min(0, pan)))
}
var r = RNG(s: 7)

// 1. Dark bed: detuned saws on a D minor chord, low-passed, slowly breathing,
// with wind and the odd crackle.
do {
  let chord: [(Double, Double, Double)] = [(36.71, 0, 0.42), (55.0, -0.15, 0.3), (73.42, 0.2, 0.22), (87.31, -0.25, 0.16), (110.0, 0.3, 0.08)]
  var phases = [Double](repeating: 0, count: chord.count * 2)
  var l1 = 0.0, l2 = 0.0, r1 = 0.0, r2 = 0.0, low = 0.0, band = 0.0
  for i in 0..<total {
    let t = Double(i) / sampleRate
    var sl = 0.0, sr = 0.0
    for (k, (f, pan, amp)) in chord.enumerated() {
      for d in 0..<2 {
        let idx = k * 2 + d
        phases[idx] += (f * (d == 0 ? 1.0016 : 0.9984)) / sampleRate
        if phases[idx] >= 1 { phases[idx] -= 1 }
        let v = (2 * phases[idx] - 1) * amp * (0.8 + 0.2 * sin(2 * .pi * (0.07 + 0.013 * Double(k)) * t + Double(k)))
        if d == 0 { sl += v * (1 - max(0, pan)); sr += v * 0.6 * (1 + min(0, pan)) } else { sr += v * (1 + min(0, pan)); sl += v * 0.6 * (1 - max(0, pan)) }
      }
    }
    // A slow swell every minute so the loop has a shape, never a jolt.
    let swell = 0.5 + 0.5 * sin(2 * .pi * t / 60 - .pi / 2)
    let fc = 110 + 220 * (0.5 + 0.5 * sin(2 * .pi * 0.045 * t)) + 260 * swell
    let a = 1 - exp(-2 * .pi * fc / sampleRate)
    l1 += a * (sl - l1); l2 += a * (l1 - l2); r1 += a * (sr - r1); r2 += a * (r1 - r2)
    let n = r.next() * 2 - 1
    let wc = 250 + 650 * (0.5 + 0.5 * sin(2 * .pi * 0.06 * t + 1.3))
    let f = 2 * sin(.pi * wc / sampleRate)
    low += f * band; let high = n - low - 0.7 * band; band += f * high
    let crackle = r.next() < 0.0003 ? (r.next() - 0.5) * 0.08 : 0
    let bed = 0.42 + 0.12 * swell
    add(i, (l2 * bed + band * (0.035 + 0.02 * swell) + crackle), pan: -0.2)
    add(i, (r2 * bed + band * (0.04 + 0.02 * swell)), pan: 0.2)
  }
}

// 2. The music box: the ad's tune, in sparse phrases with long silences.
let melody: [Double] = [12, 7, 12, 7, 10, 8, 7, 5, 3, 5, 7, 0, 2, 3, 2, -2]
func musicBoxNote(_ at: Double, _ semis: Double, _ amp: Double, pitch: Double = 1, pan: Double = 0) {
  let f0 = 440 * pow(2, semis / 12) * pitch
  let s0 = Int(at * sampleRate)
  for j in 0..<Int(1.6 * sampleRate) {
    let tj = Double(j) / sampleRate
    var v = sin(2 * .pi * f0 * tj) * exp(-tj / 0.9) + 0.35 * sin(2 * .pi * f0 * 3.95 * tj) * exp(-tj / 0.25) + 0.12 * sin(2 * .pi * f0 * 9.8 * tj) * exp(-tj / 0.06)
    v *= min(1, tj / 0.002)
    add(s0 + j, amp * v, pan: pan)
    add(s0 + j + Int(0.19 * sampleRate), amp * v * 0.22, pan: -pan)
    add(s0 + j + Int(0.41 * sampleRate), amp * v * 0.1, pan: pan * 0.5)
  }
}
// Phrases: (start, first note, length, gap between notes, pitch).
let phrases: [(Double, Int, Int, Double, Double)] = [
  (6, 0, 8, 0.62, 1.0),
  (38, 8, 8, 0.66, 0.995),
  (71, 0, 16, 0.55, 1.0),
  (112, 4, 6, 0.7, 0.99),
  (141, 0, 8, 0.6, 1.0),
]
for (start, first, count, gap, pitch) in phrases {
  for n in 0..<count {
    let jitter = (r.next() - 0.5) * 0.04
    musicBoxNote(start + Double(n) * gap + jitter, melody[(first + n) % melody.count], 0.05, pitch: pitch, pan: n % 2 == 0 ? -0.3 : 0.3)
  }
}
// Once a loop the box winds down, slower and flatter, like the spring running out.
do {
  var at = 160.0, interval = 0.5, pitch = 1.0
  for n in 0..<6 {
    musicBoxNote(at, melody[(n + 10) % melody.count], 0.045, pitch: pitch, pan: n % 2 == 0 ? -0.2 : 0.2)
    at += interval; interval *= 1.3; pitch *= 0.96
  }
}

// 3. The doll turning its head: a slow servo whirr with gear clicks.
func servo(_ at: Double, _ amp: Double) {
  let s0 = Int(at * sampleRate), len = Int(0.9 * sampleRate)
  var ph = 0.0, lp = 0.0
  for j in 0..<len {
    let p = Double(j) / Double(len)
    ph += (130 + 210 * sin(.pi * p)) / sampleRate; if ph >= 1 { ph -= 1 }
    lp += 0.08 * ((2 * ph - 1) - lp)
    let click = (j % Int(0.022 * sampleRate)) < 40 ? (r.next() - 0.5) * 0.5 : 0
    add(s0 + j, amp * (lp + 0.5 * click) * sin(.pi * p), pan: -0.15)
  }
}
servo(64, 0.11)
servo(133, 0.09)

// 4. The interface: soft terminal beeps and short bursts of typing.
func beep(_ at: Double, _ f: Double, _ len: Double, _ amp: Double) {
  for j in 0..<Int(len * sampleRate) {
    let tj = Double(j) / sampleRate
    add(Int(at * sampleRate) + j, amp * (sin(2 * .pi * f * tj) > 0 ? 1 : -1) * min(1, tj / 0.003) * (1 - tj / len))
  }
}
for (at, f) in [(24.0, 660.0), (24.12, 880.0), (52.0, 520.0), (97.0, 660.0), (97.12, 1320.0), (124.0, 520.0), (171.0, 880.0)] { beep(at, f, 0.06, 0.025) }
func typing(_ at: Double, _ keys: Int) {
  var t = at
  for _ in 0..<keys {
    let s0 = Int(t * sampleRate), pan = (r.next() - 0.5) * 0.6
    let amp = 0.06 + r.next() * 0.04, tone = 1500 + r.next() * 900
    for j in 0..<Int(0.03 * sampleRate) {
      let tj = Double(j) / sampleRate
      add(s0 + j, amp * ((r.next() * 2 - 1) * exp(-tj / 0.004) + 0.5 * sin(2 * .pi * tone * tj) * exp(-tj / 0.0025) + 0.3 * sin(2 * .pi * 180 * tj) * exp(-tj / 0.01)), pan: pan)
    }
    t += 0.07 + r.next() * 0.16 + (r.next() < 0.15 ? 0.35 : 0)
  }
}
typing(18, 14); typing(90, 10); typing(150, 12)

// 5. A distant low swell, twice a loop, felt more than heard.
func braam(_ at: Double, _ amp: Double) {
  var ph = [0.0, 0.0, 0.0, 0.0], lp1 = 0.0, lp2 = 0.0
  let freqs = [36.71, 36.9, 73.42, 55.0]
  for j in 0..<Int(5 * sampleRate) {
    let tj = Double(j) / sampleRate
    var x = 0.0
    for q in 0..<4 { ph[q] += freqs[q] / sampleRate; if ph[q] >= 1 { ph[q] -= 1 }; x += (2 * ph[q] - 1) * (q == 2 ? 0.5 : 1) }
    let a = 1 - exp(-2 * .pi * (80 + 500 * exp(-tj / 0.8)) / sampleRate)
    lp1 += a * (x - lp1); lp2 += a * (lp1 - lp2)
    add(Int(at * sampleRate) + j, amp * lp2 * smooth(tj / 1.2) * exp(-tj / 2.2))
  }
}
braam(56, 0.14)
braam(118, 0.12)

// 6. The original interface sound underneath, looped with its own seam softened.
do {
  let file = try! AVAudioFile(forReading: URL(fileURLWithPath: originalPath))
  let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: file.fileFormat.sampleRate, channels: 2, interleaved: false)!
  let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(file.length))!
  try! file.read(into: buf)
  let n = Int(buf.frameLength), srcL = buf.floatChannelData![0], srcR = buf.floatChannelData![1]
  var peak: Float = 0
  for i in 0..<n { peak = max(peak, abs(srcL[i]), abs(srcR[i])) }
  let norm = Double(1 / max(peak, 0.0001))
  let fadeLen = Int(1.5 * file.fileFormat.sampleRate)
  let step = file.fileFormat.sampleRate / sampleRate
  for i in 0..<total {
    let pos = Int(Double(i) * step) % n
    // Near the end of the source, blend in its start so each wrap is smooth.
    var l = Double(srcL[pos]), rr = Double(srcR[pos])
    if pos >= n - fadeLen {
      let w = Double(pos - (n - fadeLen)) / Double(fadeLen)
      let k = pos - (n - fadeLen)
      l = l * cos(w * .pi / 2) + Double(srcL[k]) * sin(w * .pi / 2)
      rr = rr * cos(w * .pi / 2) + Double(srcR[k]) * sin(w * .pi / 2)
    }
    let level = 0.16 * norm
    left[i] += Float(l * level); right[i] += Float(rr * level)
  }
}

// Fold the tail onto the start with an equal-power crossfade: the end of the
// file now flows straight into its beginning.
let loopSamples = Int(loopLength * sampleRate), tailSamples = Int(tailLength * sampleRate)
for j in 0..<tailSamples {
  let w = Double(j) / Double(tailSamples)
  let fadeIn = sin(w * .pi / 2), fadeOut = cos(w * .pi / 2)
  left[j] = Float(Double(left[j]) * fadeIn + Double(left[loopSamples + j]) * fadeOut)
  right[j] = Float(Double(right[j]) * fadeIn + Double(right[loopSamples + j]) * fadeOut)
}

// Gentle limiting, then a level close to the original so the site's mix holds.
var peak: Float = 0
for i in 0..<loopSamples { left[i] = tanhf(left[i] * 1.1); right[i] = tanhf(right[i] * 1.1); peak = max(peak, abs(left[i]), abs(right[i])) }
// Match the original file's loudness (RMS about 0.07), so the site's
// existing mix and volume settings keep working.
var energy = 0.0
for i in 0..<loopSamples { energy += Double(left[i] * left[i] + right[i] * right[i]) }
let rms = sqrt(energy / Double(2 * loopSamples))
let gain = Float(min(0.075 / max(rms, 0.0001), 0.95 / Double(max(peak, 0.001))))

let settings: [String: Any] = [
  AVFormatIDKey: kAudioFormatMPEG4AAC,
  AVSampleRateKey: sampleRate,
  AVNumberOfChannelsKey: 2,
  AVEncoderBitRateKey: 128_000,
]
// Written inside a function so the file is closed and finalised on return.
func writeLoop() {
  let outURL = URL(fileURLWithPath: outPath)
  try? FileManager.default.removeItem(at: outURL)
  let out = try! AVAudioFile(forWriting: outURL, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
  let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 2, interleaved: false)!
  var offset = 0
  while offset < loopSamples {
    let count = min(44_100, loopSamples - offset)
    let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(count))!
    buf.frameLength = AVAudioFrameCount(count)
    for j in 0..<count {
      buf.floatChannelData![0][j] = left[offset + j] * gain
      buf.floatChannelData![1][j] = right[offset + j] * gain
    }
    try! out.write(from: buf)
    offset += count
  }
}
writeLoop()
print("wrote \(outPath) \(Int(loopLength))s loop")
