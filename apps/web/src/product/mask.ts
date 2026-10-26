import { escapeHtml } from "@hidn/ui";

// /mask: turn a profile picture into a HIDN one. Everything happens in this
// tab: the photo is read into a canvas, toned, redacted and saved back to the
// visitor's device. Nothing is uploaded and nothing is stored.

export const MASK_PATH = "/mask";
const SIZE = 1024;
const SHARE_TEXT = "I'm anon now. Get yours at hidnroom.com/mask";

type MaskStyle = "redacted" | "watcher" | "phosphor" | "haunted";

interface StyleSpec {
  label: string;
  hint: string;
  palette: "green" | "pumpkin";
  bar: string | null;
  eyes: boolean;
}

const STYLES: Record<MaskStyle, StyleSpec> = {
  redacted: { label: "REDACTED", hint: "a bar over the eyes", palette: "green", bar: "[ ANON ]", eyes: false },
  watcher: { label: "WATCHER", hint: "glowing eyes", palette: "green", bar: null, eyes: true },
  phosphor: { label: "PHOSPHOR", hint: "just the terminal glow", palette: "green", bar: null, eyes: false },
  haunted: { label: "HAUNTED", hint: "halloween only", palette: "pumpkin", bar: "[ FACE WITHHELD ]", eyes: false },
};
const STYLE_ORDER: MaskStyle[] = ["redacted", "watcher", "phosphor", "haunted"];

/** Where the eye line sits, in output pixels: centre and width of the bar. */
interface EyeLine { x: number; y: number; w: number }

interface MaskState {
  style: MaskStyle;
  source: HTMLCanvasElement | null;
  toned: Partial<Record<StyleSpec["palette"], HTMLCanvasElement>>;
  eyes: EyeLine;
  error: string;
  saved: boolean;
}

const state: MaskState = {
  style: "redacted",
  source: null,
  toned: {},
  eyes: { x: SIZE / 2, y: SIZE * 0.42, w: SIZE * 0.62 },
  error: "",
  saved: false,
};

export function renderMaskBody(): string {
  const styleButtons = STYLE_ORDER.map((key) => {
    const spec = STYLES[key];
    const active = key === state.style;
    return `<button class="hidn-mask__style${active ? " is-active" : ""}" type="button" data-mask-style="${key}" aria-pressed="${active}">
      <b>${escapeHtml(spec.label)}</b><span>${escapeHtml(spec.hint)}</span>
    </button>`;
  }).join("");
  const hasPhoto = Boolean(state.source);
  return `<div class="hidn-link hidn-mask">
    <p class="hidn-link__log">&gt; mask --local --no-upload</p>
    <p class="hidn-link__code-line">/// GO ANON</p>
    <h1 class="hidn-link__title" data-text="NO NAME. NO FACE.">NO NAME. NO FACE.</h1>
    <p class="hidn-link__line">&gt; Turn your profile picture into a HIDN one. Your photo never leaves this device: it's edited right here in your browser, and nothing is uploaded or kept.</p>

    <div class="hidn-mask__grid">
      <div class="hidn-mask__stage">
        <label class="hidn-mask__drop${hasPhoto ? " has-photo" : ""}" data-mask-drop>
          <canvas class="hidn-mask__canvas" data-mask-canvas width="${SIZE}" height="${SIZE}" aria-label="Your HIDN profile picture"></canvas>
          ${hasPhoto ? "" : `<span class="hidn-mask__empty">[ + CHOOSE A PHOTO ]<em>or drop one here</em></span>`}
          <input class="hidn-term__sr" type="file" accept="image/*" data-mask-file />
        </label>
        ${hasPhoto
          ? `<p class="hidn-link__note${STYLES[state.style].bar || STYLES[state.style].eyes ? "" : " hidn-mask__unused"}">&gt; Drag on the picture to line it up with your eyes.</p>`
          : ""}
      </div>

      <div class="hidn-mask__controls">
        <p class="hidn-link__label">&gt; 01 / PICK A STYLE</p>
        <div class="hidn-mask__styles">${styleButtons}</div>
        ${hasPhoto ? `<label class="hidn-mask__range${STYLES[state.style].bar || STYLES[state.style].eyes ? "" : " is-unused"}">
          <span class="hidn-link__label">&gt; 02 / ${STYLES[state.style].eyes ? "EYE SPACING" : "BAR WIDTH"}</span>
          <input type="range" min="${Math.round(SIZE * 0.3)}" max="${SIZE}" step="4" value="${Math.round(state.eyes.w)}" data-mask-width />
        </label>` : ""}
        ${state.error ? `<p class="hidn-link__error" role="alert">&gt; ${escapeHtml(state.error)}</p>` : ""}
        <div class="hidn-link__actions">
          ${hasPhoto
            ? `<button class="hidn-link__btn hidn-link__btn--primary" type="button" data-mask-action="save">[ ↓ SAVE PICTURE ]</button>
               <button class="hidn-link__btn" type="button" data-mask-action="share">[ ↗ SHARE ]</button>
               <button class="hidn-link__btn" type="button" data-mask-action="choose">[ NEW PHOTO ]</button>`
            : `<button class="hidn-link__btn hidn-link__btn--primary" type="button" data-mask-action="choose">[ + CHOOSE A PHOTO ]</button>`}
        </div>
        ${state.saved ? `<p class="hidn-link__log"><b>[ OK ]</b> SAVED · NOW SET IT AS YOUR PROFILE PICTURE</p>` : ""}
        <div class="hidn-mask__next">
          <p class="hidn-link__label">&gt; NEXT</p>
          <p class="hidn-link__note">Want people to tell you things? Get your own private link and let anyone message you, with no names.</p>
          <div class="hidn-link__actions"><a class="hidn-link__btn" href="/room/access">[ GET YOUR PRIVATE LINK → ]</a></div>
        </div>
      </div>
    </div>
  </div>`;
}

export function bindMaskPage(root: ParentNode): void {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-mask-canvas]");
  if (!canvas) return;
  const fileInput = root.querySelector<HTMLInputElement>("[data-mask-file]");
  const drop = root.querySelector<HTMLElement>("[data-mask-drop]");

  void document.fonts?.ready.then(() => drawPreview(canvas));
  drawPreview(canvas);

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void loadPhoto(file);
    fileInput.value = "";
  });
  drop?.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("is-over"); });
  drop?.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop?.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("is-over");
    const file = event.dataTransfer?.files?.[0];
    if (file) void loadPhoto(file);
  });

  // Once there's a photo, the label must not reopen the file picker on every
  // drag; the explicit buttons do that instead.
  drop?.addEventListener("click", (event) => { if (state.source) event.preventDefault(); });
  bindEyeDrag(canvas);

  root.querySelectorAll<HTMLButtonElement>("[data-mask-style]").forEach((button) => {
    button.addEventListener("click", () => {
      state.style = button.dataset.maskStyle as MaskStyle;
      state.saved = false;
      rerender();
    });
  });
  root.querySelector<HTMLInputElement>("[data-mask-width]")?.addEventListener("input", (event) => {
    state.eyes.w = Number((event.target as HTMLInputElement).value);
    drawPreview(canvas);
  });
  root.querySelector('[data-mask-action="choose"]')?.addEventListener("click", () => fileInput?.click());
  root.querySelector('[data-mask-action="save"]')?.addEventListener("click", () => void savePicture());
  root.querySelector('[data-mask-action="share"]')?.addEventListener("click", () => void sharePicture());
}

function rerender(): void {
  window.dispatchEvent(new CustomEvent("hidn:rerender"));
}

// MARK: Loading

async function loadPhoto(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    state.error = "That isn't an image. Pick a JPG, PNG or WebP.";
    rerender();
    return;
  }
  try {
    const bitmap = await createImageBitmap(file);
    // Centre square crop, scaled to the output size. Drawing to a canvas also
    // drops the photo's metadata (location, camera), which never goes anywhere.
    const side = Math.min(bitmap.width, bitmap.height);
    const source = document.createElement("canvas");
    source.width = SIZE;
    source.height = SIZE;
    source.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
    bitmap.close();
    state.source = source;
    state.toned = {};
    state.eyes = { x: SIZE / 2, y: SIZE * 0.42, w: SIZE * 0.62 };
    state.error = "";
    state.saved = false;
  } catch {
    state.error = "That photo couldn't be opened. Try another one.";
  }
  rerender();
}

// MARK: Drawing

/** Luminance → colour ramps: near-black ground, the brand colour, pale highlights. */
const RAMPS: Record<StyleSpec["palette"], Array<[number, [number, number, number]]>> = {
  green: [[0, [1, 3, 2]], [0.35, [12, 70, 30]], [0.7, [77, 255, 110]], [1, [215, 255, 222]]],
  pumpkin: [[0, [3, 2, 1]], [0.35, [90, 36, 6]], [0.7, [255, 138, 31]], [1, [255, 232, 200]]],
};

function rampColor(palette: StyleSpec["palette"], v: number): [number, number, number] {
  const stops = RAMPS[palette];
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    const [p0, c0] = stops[i - 1];
    if (v <= p1) {
      const t = (v - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}

/** The photo in the style's colours, with its contrast stretched. Cached per palette. */
function tonedSource(palette: StyleSpec["palette"]): HTMLCanvasElement | null {
  if (!state.source) return null;
  const cached = state.toned[palette];
  if (cached) return cached;
  const ctx = state.source.getContext("2d")!;
  const image = ctx.getImageData(0, 0, SIZE, SIZE);
  const data = image.data;
  // Stretch between the 2nd and 98th luminance percentiles so dark and
  // washed-out photos both land on the full ramp.
  const histogram = new Uint32Array(256);
  const lum = new Uint8Array(SIZE * SIZE);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    lum[p] = l;
    histogram[l]++;
  }
  const total = SIZE * SIZE;
  let low = 0, high = 255, seen = 0;
  for (let l = 0; l < 256; l++) { seen += histogram[l]; if (seen >= total * 0.02) { low = l; break; } }
  seen = 0;
  for (let l = 255; l >= 0; l--) { seen += histogram[l]; if (seen >= total * 0.02) { high = l; break; } }
  const span = Math.max(1, high - low);
  const lut: Array<[number, number, number]> = [];
  for (let l = 0; l < 256; l++) {
    const v = Math.min(1, Math.max(0, (l - low) / span));
    // A gentle S-curve for the CRT punch.
    lut.push(rampColor(palette, v * v * (3 - 2 * v)));
  }
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const [r, g, b] = lut[lum[p]];
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  const toned = document.createElement("canvas");
  toned.width = SIZE;
  toned.height = SIZE;
  toned.getContext("2d")!.putImageData(image, 0, 0);
  state.toned[palette] = toned;
  return toned;
}

function monoFont(): string {
  const token = getComputedStyle(document.documentElement).getPropertyValue("--hidn-font-mono").trim();
  return token || "ui-monospace, Menlo, monospace";
}

/** Draws the finished picture at full size onto `ctx`. */
function compose(ctx: CanvasRenderingContext2D): void {
  const spec = STYLES[state.style];
  const accent = spec.palette === "pumpkin" ? "255, 138, 31" : "77, 255, 110";
  const font = monoFont();
  ctx.save();
  ctx.fillStyle = "#010201";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const toned = tonedSource(spec.palette);
  if (toned) {
    ctx.drawImage(toned, 0, 0);
    // Phosphor bloom: a blurred copy added on top.
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.35;
    ctx.filter = "blur(10px)";
    ctx.drawImage(toned, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  } else {
    // No photo yet: a faint placeholder head so the frame isn't empty.
    ctx.fillStyle = `rgba(${accent}, 0.08)`;
    ctx.beginPath(); ctx.ellipse(SIZE / 2, SIZE * 0.42, SIZE * 0.2, SIZE * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(SIZE / 2, SIZE * 1.02, SIZE * 0.38, SIZE * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  }

  const { x, y, w } = state.eyes;
  if (toned && spec.eyes) {
    // Two glowing eyes on the eye line.
    for (const dx of [-w * 0.22, w * 0.22]) {
      const r = w * 0.085;
      const glow = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r * 3.2);
      glow.addColorStop(0, "rgba(200, 255, 210, 0.95)");
      glow.addColorStop(0.3, `rgba(${accent}, 0.85)`);
      glow.addColorStop(1, `rgba(${accent}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x + dx, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(235, 255, 238, 0.95)";
      ctx.beginPath(); ctx.ellipse(x + dx, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (toned && spec.bar) {
    const h = w * 0.2;
    ctx.fillStyle = "#010301";
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 24;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(77, 255, 110, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - w / 2 + 1.5, y - h / 2 + 1.5, w - 3, h - 3);
    let size = h * 0.42;
    ctx.font = `600 ${size}px ${font}`;
    while (ctx.measureText(spec.bar).width > w * 0.84 && size > 8) { size -= 2; ctx.font = `600 ${size}px ${font}`; }
    ctx.fillStyle = "#4dff6e";
    ctx.shadowColor = "rgba(77, 255, 110, 0.7)";
    ctx.shadowBlur = 14;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spec.bar, x, y + size * 0.04);
    ctx.shadowBlur = 0;
  }

  // Scanlines.
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  for (let sy = 0; sy < SIZE; sy += 4) ctx.fillRect(0, sy, SIZE, 1.5);
  // Grain, the same every time.
  let seed = 7;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(220, 255, 225, ${0.06 * rand()})`;
    ctx.fillRect(rand() * SIZE, rand() * SIZE, 2, 2);
  }
  // CRT vignette.
  const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.3, SIZE / 2, SIZE / 2, SIZE * 0.75);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.65)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // A small mark, kept clear of the circle most sites crop avatars to.
  ctx.font = `700 34px ${font}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(196, 247, 204, 0.75)";
  ctx.fillText(">", SIZE - 150, SIZE - 34);
  const gt = ctx.measureText(">").width;
  ctx.fillStyle = "rgba(77, 255, 110, 0.85)";
  ctx.fillText("hidn", SIZE - 150 + gt, SIZE - 34);
  ctx.restore();
}

function drawPreview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (ctx) compose(ctx);
}

// MARK: Lining up the eyes

function bindEyeDrag(canvas: HTMLCanvasElement): void {
  let dragging = false;
  const toCanvas = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * SIZE, y: ((event.clientY - rect.top) / rect.height) * SIZE };
  };
  const move = (event: PointerEvent) => {
    const p = toCanvas(event);
    state.eyes.x = Math.min(SIZE, Math.max(0, p.x));
    state.eyes.y = Math.min(SIZE, Math.max(0, p.y));
    state.saved = false;
    drawPreview(canvas);
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.source) return;
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    move(event);
  });
  canvas.addEventListener("pointermove", (event) => { if (dragging) move(event); });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
}

// MARK: Saving and sharing

function pictureBlob(): Promise<Blob | null> {
  const out = document.createElement("canvas");
  out.width = SIZE;
  out.height = SIZE;
  compose(out.getContext("2d")!);
  return new Promise((resolve) => out.toBlob(resolve, "image/png"));
}

function fileName(): string {
  return `hidn-${state.style}.png`;
}

async function savePicture(): Promise<void> {
  const blob = await pictureBlob();
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName();
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  state.saved = true;
  rerender();
}

async function sharePicture(): Promise<void> {
  const blob = await pictureBlob();
  if (!blob) return;
  const file = new File([blob], fileName(), { type: "image/png" });
  // Phones: the share sheet, picture attached. Elsewhere: save it, then open
  // an X post with the text so the picture can be attached there.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: SHARE_TEXT });
      return;
    } catch {
      return;
    }
  }
  await savePicture();
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}`, "_blank", "noopener,noreferrer");
}
