/** Terminal pieces: the Mac-style terminal window used by the access
 * screens, and the one-bit dithered eye drawn on share cards. Everything is
 * drawn locally; no images are fetched. */

export const ASSEMBLY = [
  "invoke GetObject, hRoom", "mov eax, [name]", "xor eax, eax", "push 0 ; name withheld",
  "lea rdi, [rel room]", "mov ecx, thoughts", "call shield", "add esp, 4",
  "mov edx, proof", "jz unseen", "cmp eax, witness", "jne stay_hidden",
  "mov [face], 0", "call nullifier", "pop ebx", "ret",
  "lea rsi, [rel signal]", "mov al, 0x7f", "and eax, mask", "jmp room",
];

/** Mac-style terminal window frame shared by the homepage and access. */
export function terminalWindow(title: string, body: string, className = ""): string {
  return `<section class="hidn-term ${className}">
    <div class="hidn-term__bar" aria-hidden="true"><i></i><i></i><i></i><span>${title}</span></div>
    <div class="hidn-term__body">${body}</div>
  </section>`;
}

// 4x4 ordered-dither thresholds give the crunchy one-bit look.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((value) => (value + .5) / 16);

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export interface EyeState { gazeX: number; gazeY: number; openness: number }

// Proportions of the eye in the frame, after the reference: a large eye
// with a big pupil, bold highlights and a dotted iris.
const EYE = { cx: .46, cy: .5, halfWidth: .44, upper: .34, lower: .27, iris: .21, pupil: .12 };

function eyeOpening(u: number, v: number, openness: number): { dx: number; dy: number; t: number; upper: number; lower: number } {
  const dx = u - EYE.cx, dy = (v - EYE.cy) * 1.33;
  const t = Math.max(0, 1 - (dx / EYE.halfWidth) ** 2);
  return { dx, dy, t, upper: EYE.upper * Math.pow(t, .7) * openness, lower: EYE.lower * Math.pow(t, .85) * openness };
}

/** Luminance of the eye at normalised (u, v) in [0,1]². */
function eyeLuminance(u: number, v: number, eye: EyeState): number {
  const { dx, dy, t, upper, lower } = eyeOpening(u, v, eye.openness);
  if (dy < -upper || dy > lower) {
    // Dark, sparse surround: socket shading, a brow, and lashes on the lid.
    const socket = Math.max(0, 1 - Math.hypot(dx / .7, dy / .75));
    const skin = .015 + socket * .14 + smoothNoise(u * 14, v * 14) * .06 + smoothNoise(u * 52, v * 52) * .04;
    const brow = Math.exp(-(((dy + .58 + dx * dx * .9) / .07) ** 2)) * .16;
    const lashBand = dy < -upper && dy > -upper - .07 && t > .04;
    const lash = lashBand && Math.sin(u * 200 + dy * 80) > .25 ? .2 : 0;
    const lowerLash = dy > lower && dy < lower + .035 && t > .1 && Math.sin(u * 260) > .5 ? .12 : 0;
    return Math.max(0, skin - brow - lash - lowerLash);
  }
  const ix = EYE.cx + eye.gazeX, iy = EYE.cy + eye.gazeY;
  const ox = u - ix, oy = (v - iy) * 1.33;
  const ri = Math.hypot(ox, oy);
  if (Math.hypot(ox + .07, oy + .06) < .055 || Math.hypot(ox + .025, oy - .05) < .022) return 1;
  if (ri < EYE.pupil) return .015;
  if (ri < EYE.iris) {
    // Dotted iris: radial striations brightening toward the rim.
    const angle = Math.atan2(oy, ox);
    const striation = Math.sin(angle * 34 + Math.sin(angle * 7) * 2) * .5 + .5;
    const rim = (ri - EYE.pupil) / (EYE.iris - EYE.pupil);
    return ri > EYE.iris - .012 ? .04 : .08 + striation * .32 * rim;
  }
  // Sclera: bright, shading only into the corners and under the upper lid.
  const edge = Math.min(1, Math.abs(dx) / EYE.halfWidth);
  const lidShadow = 1 - Math.min(1, (upper + dy) / .07);
  const vessel = Math.sin(u * 150 + v * 70) > .965 && edge > .5 ? .3 : 0;
  return Math.max(0, .98 - Math.pow(edge, 3) * .6 - lidShadow * .5 - vessel);
}

/** Draws the one-bit dithered eye, with its green iris grid, filling the canvas. */
export function drawDitheredEye(ctx: CanvasRenderingContext2D, eye: EyeState): void {
  const { width, height } = ctx.canvas;
  const cell = 3;
  ctx.fillStyle = "#020302";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#dfe6dc";
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const lum = eyeLuminance(x / width, y / height, eye);
      const threshold = BAYER[((y / cell) % 4) * 4 + ((x / cell) % 4)];
      if (lum > threshold) ctx.fillRect(x, y, cell, cell);
    }
  }
  // Green targeting grid over the iris, stepped to the eye opening.
  const ix = (EYE.cx + eye.gazeX) * width, iy = (EYE.cy + eye.gazeY) * height;
  const step = 16;
  const reach = EYE.iris * width * 1.45;
  ctx.strokeStyle = "rgba(47, 214, 120, .9)";
  ctx.lineWidth = 1;
  for (let gy = -8; gy <= 8; gy++) {
    for (let gx = -10; gx <= 10; gx++) {
      const x = Math.round(ix + gx * step - step / 2) + .5;
      const y = Math.round(iy + gy * step - step / 2) + .5;
      const { dy, upper, lower } = eyeOpening((x + step / 2) / width, (y + step / 2) / height, eye.openness);
      if (dy > -upper && dy < lower && Math.hypot(gx * step, gy * step) < reach) ctx.strokeRect(x, y, step, step);
    }
  }
}
