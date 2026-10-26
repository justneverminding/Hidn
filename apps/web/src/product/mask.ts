import { escapeHtml } from "@hidn/ui";

// /mask: pick a disguise for your profile picture. Twelve masks, each with a
// few preset settings, drawn on canvases in this tab.
//
// The photo never leaves this tab and is never kept. It's read from the file
// picker straight into memory, drawn, and saved back to the visitor's own
// device. It is not sent over the network, not written to any browser storage
// (no localStorage, IndexedDB, cache or cookies), and every copy in memory is
// dropped when the visitor leaves the page, closes the tab or taps FORGET.

export const MASK_PATH = "/mask";
// Until Halloween ends everywhere, links into /mask open on the haunted style.
const HALLOWEEN_ENDS_AT = Date.parse("2026-11-01T12:00:00Z");
const SAVE_SIZE = 1024;
const HERO_SIZE = 720;
const THUMB_SIZE = 160;
const SHARE_TEXT = "I went anonymous. Pick your mask at hidnroom.com/mask";
/** The example face shown before anyone picks a photo: a public brand asset. */
const DEMO_SRC = "/brand/mask-demo.png";

/** Where to send people from elsewhere on the site, and what to call it. */
export function maskEntry(now = Date.now()): { href: string; label: string } {
  return { href: now < HALLOWEEN_ENDS_AT ? `${MASK_PATH}?style=haunted` : MASK_PATH, label: "make your pfp anon" };
}

// MARK: Masks and their settings

type MaskKey =
  | "hidn" | "eyes" | "anon" | "haunted" | "cctv" | "thermal"
  | "pop" | "glitch" | "blur" | "ascii" | "classified" | "neon";

/** A setting is always picked from presets: no free text goes on a face. */
type Control =
  | { kind: "swatch"; key: string; label: string; options: string[] }
  | { kind: "choice"; key: string; label: string; options: string[] }
  | { kind: "toggle"; key: string; label: string };

interface MaskSpec {
  label: string;
  /** Lined up on the face by dragging; the size slider then applies. */
  positioned: boolean;
  sizeLabel?: string;
  spacing?: boolean;
  controls: Control[];
  defaults: Record<string, string | boolean>;
}

const MASKS: Record<MaskKey, MaskSpec> = {
  hidn: {
    label: "HIDN", positioned: true, sizeLabel: "BAR SIZE",
    controls: [{ kind: "swatch", key: "color", label: "GLOW", options: ["#4dff6e", "#ffffff", "#ff2a3d", "#ffc21a"] }],
    defaults: { color: "#4dff6e" },
  },
  eyes: {
    label: "NEON EYES", positioned: true, sizeLabel: "GLOW SIZE", spacing: true,
    controls: [
      { kind: "swatch", key: "color", label: "GLOW COLOUR", options: ["#4dff6e", "#ff2a3d", "#ffc21a", "#22e6ff", "#b44dff", "#e8f0ff"] },
      { kind: "toggle", key: "streak", label: "LIGHT STREAK" },
    ],
    defaults: { color: "#4dff6e", streak: true },
  },
  anon: {
    label: "ANON", positioned: true, sizeLabel: "BAR SIZE",
    controls: [{ kind: "choice", key: "word", label: "BAR SAYS", options: ["[ ANON ]", "[ NO NAME ]", "[ REDACTED ]", "[ WITHHELD ]"] }],
    defaults: { word: "[ ANON ]" },
  },
  haunted: {
    label: "HAUNTED", positioned: true, sizeLabel: "BAR SIZE",
    controls: [{ kind: "choice", key: "word", label: "BAR SAYS", options: ["[ FACE WITHHELD ]", "[ BOO ]", "[ NOBODY HOME ]"] }],
    defaults: { word: "[ FACE WITHHELD ]" },
  },
  cctv: {
    label: "CCTV", positioned: true, sizeLabel: "BOX SIZE",
    controls: [
      { kind: "choice", key: "word", label: "LABEL", options: ["ID: UNKNOWN · MATCH 0%", "ID: NOT FOUND", "SUBJECT: ANON"] },
      { kind: "toggle", key: "rec", label: "● REC" },
    ],
    defaults: { word: "ID: UNKNOWN · MATCH 0%", rec: true },
  },
  thermal: {
    label: "THERMAL", positioned: true, sizeLabel: "SIGHT SIZE",
    controls: [
      { kind: "choice", key: "palette", label: "PALETTE", options: ["IRON", "RAINBOW", "WHITE HOT"] },
      { kind: "toggle", key: "sight", label: "CROSSHAIR" },
    ],
    defaults: { palette: "IRON", sight: true },
  },
  pop: {
    label: "POP", positioned: true, sizeLabel: "BAR SIZE",
    controls: [
      { kind: "swatch", key: "colors", label: "COLOURS", options: ["#ffe14d|#ff2d6f", "#7cf3c0|#6a2bff", "#ff8a3d|#1f3bff", "#ff9ad5|#111111"] },
      { kind: "choice", key: "word", label: "BAR SAYS", options: ["CENSORED", "NO NAMES", "NOPE"] },
      { kind: "choice", key: "burst", label: "BURST", options: ["ANON!", "SHH!", "BOO!", "WHO?"] },
    ],
    defaults: { colors: "#ffe14d|#ff2d6f", word: "CENSORED", burst: "ANON!" },
  },
  glitch: {
    label: "GLITCH", positioned: true, sizeLabel: "STRENGTH",
    controls: [{ kind: "toggle", key: "line", label: "RED LINE" }],
    defaults: { line: true },
  },
  blur: {
    label: "BLUR", positioned: true, sizeLabel: "BLUR SIZE",
    controls: [{ kind: "toggle", key: "tag", label: "IDENTITY PROTECTED" }],
    defaults: { tag: true },
  },
  ascii: {
    label: "ASCII", positioned: false,
    controls: [{ kind: "swatch", key: "color", label: "COLOUR", options: ["#ffb347", "#4dff6e", "#f2f2f2", "#ff6ad5"] }],
    defaults: { color: "#ffb347" },
  },
  classified: {
    label: "CLASSIFIED", positioned: true, sizeLabel: "BAR SIZE",
    controls: [{ kind: "choice", key: "word", label: "STAMP", options: ["CLASSIFIED", "TOP SECRET", "REDACTED", "UNKNOWN"] }],
    defaults: { word: "CLASSIFIED" },
  },
  neon: {
    label: "NEON", positioned: true, sizeLabel: "VISOR SIZE",
    controls: [
      { kind: "swatch", key: "colors", label: "COLOURS", options: ["#7a00ff|#7ff9ff", "#ff2bd6|#ffb000", "#00b4ff|#4dff6e", "#ff2a3d|#ffe14d"] },
      { kind: "toggle", key: "laser", label: "NEON VISOR" },
    ],
    defaults: { colors: "#7a00ff|#7ff9ff", laser: true },
  },
};
const ORDER: MaskKey[] = ["hidn", "eyes", "anon", "haunted", "cctv", "thermal", "pop", "glitch", "blur", "ascii", "classified", "neon"];

// MARK: State (memory only)

/** Where the eyes are, as fractions of the picture, plus the size, spacing
 * and tilt (radians, for photos where the head isn't straight). */
interface Placement { x: number; y: number; size: number; spread: number; tilt: number }

interface Sized { canvas: HTMLCanvasElement; lum: Float32Array; backdrop?: Uint8Array }

interface Photo {
  master: HTMLCanvasElement;
  demo: boolean;
  sized: Map<number, Sized>;
}

interface MaskState {
  style: MaskKey;
  options: Record<MaskKey, Record<string, string | boolean>>;
  place: Placement;
  seed: number;
  photo: Photo | null;
  demoLoading: boolean;
  thumbs: Partial<Record<MaskKey, HTMLCanvasElement>>;
  error: string;
  saved: boolean;
  dragged: boolean;
}

const PHOTO_PLACE: Placement = { x: 0.5, y: 0.42, size: 1, spread: 1, tilt: 0 };
const DEMO_PLACE: Placement = { x: 0.5, y: 0.585, size: 1, spread: 1, tilt: 0 };

const state: MaskState = {
  style: "hidn",
  options: Object.fromEntries(ORDER.map((key) => [key, { ...MASKS[key].defaults }])) as MaskState["options"],
  place: { ...DEMO_PLACE },
  seed: 7,
  photo: null,
  demoLoading: false,
  thumbs: {},
  error: "",
  saved: false,
  dragged: false,
};
let styleFromLink = false;

/** Shrinks a canvas to nothing, so the browser can drop its pixels now. */
function wipe(canvas: HTMLCanvasElement | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/** Drops every in-memory copy of the visitor's photo and everything drawn from it. */
function forgetPhoto(): void {
  const photo = state.photo;
  if (photo && !photo.demo) {
    wipe(photo.master);
    photo.sized.forEach((entry) => { wipe(entry.canvas); entry.lum.fill(0); entry.backdrop?.fill(0); });
    photo.sized.clear();
    Object.values(state.thumbs).forEach(wipe);
    state.thumbs = {};
    state.photo = null;
  }
  state.place = { ...DEMO_PLACE };
  state.saved = false;
  state.dragged = false;
  state.error = "";
  // The preview and thumbnails on screen are copies too.
  document.querySelectorAll<HTMLCanvasElement>(".mask canvas").forEach((canvas) => canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height));
}

// Closing or leaving the tab also drops the photo. If the browser brings the
// page back from its cache, it starts again from the example.
window.addEventListener("pagehide", () => { if (hasOwnPhoto()) forgetPhoto(); });
window.addEventListener("pageshow", (event) => { if (event.persisted && document.querySelector(".mask")) rerender(); });

// MARK: Page

export function renderMaskBody(): string {
  // A link can choose the starting mask, e.g. /mask?style=haunted.
  if (!styleFromLink) {
    styleFromLink = true;
    const requested = new URLSearchParams(window.location.search).get("style");
    if (requested && requested in MASKS) state.style = requested as MaskKey;
  }
  const own = hasOwnPhoto();
  const strip = ORDER.map((key) => `<button class="mask__pick${key === state.style ? " is-on" : ""}" type="button" data-mask-pick="${key}" aria-pressed="${key === state.style}">
      <canvas width="${THUMB_SIZE}" height="${THUMB_SIZE}" data-mask-thumb="${key}" aria-hidden="true"></canvas>
      <span>${escapeHtml(MASKS[key].label)}</span>
    </button>`).join("");
  return `<div class="mask">
    <header class="mask__head">
      <p class="mask__eyebrow"><i aria-hidden="true"></i>ON YOUR DEVICE ONLY · NEVER UPLOADED · NEVER STORED</p>
      <h1>GO <br class="mask__br" />ANONYMOUS.</h1>
      <p class="mask__sub">Pick a disguise for your profile picture. 12 masks. Takes 5 seconds.</p>
    </header>
    <div class="mask__layout">
      <div class="mask__stage">
        <div class="mask__hero${own ? " is-own" : ""}" data-mask-hero>
          <canvas width="${HERO_SIZE}" height="${HERO_SIZE}" data-mask-canvas aria-label="Your masked profile picture"></canvas>
          <span class="mask__badge${hasOwnPhoto() && state.dragged ? " is-done" : ""}" data-mask-badge>${heroBadge()}</span>
          ${own ? "" : `<button class="mask__try" type="button" data-mask-action="choose">📷 TRY IT WITH YOUR PHOTO</button>`}
        </div>
        <input class="mask__file" type="file" accept="image/*" data-mask-file aria-label="Choose a photo" />
        ${state.error ? `<p class="mask__error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        <p class="mask__privacy">Your photo stays in this tab's memory. It's never sent to us or anyone, never saved in your browser, and it's gone when you leave this page.${own ? ` <button type="button" data-mask-action="forget">FORGET MY PHOTO NOW</button>` : ""}</p>
      </div>
      <div class="mask__side">
        <div class="mask__strip" role="group" aria-label="Masks">${strip}</div>
        <div class="mask__controls" data-mask-controls>${renderControls()}</div>
        <div class="mask__row">
          <button class="mask__btn mask__btn--go" type="button" data-mask-action="save">${own ? (state.saved ? "✓ SAVED · SET IT AS YOUR PFP" : "↓ SAVE MY MASK") : "📷 USE MY PHOTO"}</button>
          <button class="mask__btn mask__btn--dice" type="button" data-mask-action="shuffle" aria-label="Shuffle this mask" title="Shuffle">🎲</button>
        </div>
        <div class="mask__row">
          <button class="mask__btn" type="button" data-mask-action="share"${own ? "" : " disabled"}>SHARE ↗</button>
          ${own ? `<button class="mask__btn" type="button" data-mask-action="choose">NEW PHOTO</button>` : ""}
        </div>
        <p class="mask__foot">made with <a href="/">hidn</a> · want people to tell you things? <a href="/room/access">get your anonymous link →</a></p>
      </div>
    </div>
  </div>`;
}

function hasOwnPhoto(): boolean {
  return Boolean(state.photo && !state.photo.demo);
}

function heroBadge(): string {
  if (!hasOwnPhoto()) return "EXAMPLE";
  return MASKS[state.style].positioned ? "DRAG ONTO YOUR EYES" : "LIVE PREVIEW";
}

function renderControls(): string {
  const spec = MASKS[state.style];
  const opts = state.options[state.style];
  const rows: string[] = [];
  for (const control of spec.controls) {
    if (control.kind === "swatch") {
      rows.push(`<div class="mask__ctl"><p>${escapeHtml(control.label)}</p><div class="mask__swatches">${control.options.map((value) => {
        const [a, b] = value.split("|");
        const fill = b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a;
        return `<button type="button" class="mask__swatch${opts[control.key] === value ? " is-on" : ""}" style="background:${fill}" data-mask-set="${control.key}" data-mask-value="${escapeHtml(value)}" aria-label="${escapeHtml(value)}"></button>`;
      }).join("")}</div></div>`);
    } else if (control.kind === "choice") {
      rows.push(`<div class="mask__ctl"><p>${escapeHtml(control.label)}</p><div class="mask__chips">${control.options.map((value) =>
        `<button type="button" class="mask__chip${opts[control.key] === value ? " is-on" : ""}" data-mask-set="${control.key}" data-mask-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("")}</div></div>`);
    }
  }
  const toggles = spec.controls.filter((control) => control.kind === "toggle");
  if (toggles.length) {
    rows.push(`<div class="mask__ctl"><p>EXTRAS</p><div class="mask__chips">${toggles.map((control) =>
      `<button type="button" class="mask__chip${opts[control.key] ? " is-on" : ""}" data-mask-toggle="${control.key}" aria-pressed="${Boolean(opts[control.key])}">${opts[control.key] ? "✓ " : ""}${escapeHtml(control.label)}</button>`).join("")}</div></div>`);
  }
  if (spec.positioned && spec.sizeLabel) {
    rows.push(`<label class="mask__ctl"><p>${escapeHtml(spec.sizeLabel)}</p><input type="range" min="0.5" max="1.7" step="0.01" value="${state.place.size}" data-mask-range="size" /></label>`);
  }
  if (spec.spacing) {
    rows.push(`<label class="mask__ctl"><p>EYE SPACING</p><input type="range" min="0.6" max="1.5" step="0.01" value="${state.place.spread}" data-mask-range="spread" /></label>`);
  }
  if (spec.positioned) {
    rows.push(`<label class="mask__ctl"><p>TILT <button type="button" class="mask__reset" data-mask-straighten>STRAIGHTEN</button></p><input type="range" min="-0.6" max="0.6" step="0.005" value="${state.place.tilt}" data-mask-range="tilt" /></label>`);
  }
  return rows.join("");
}

export function bindMaskPage(root: ParentNode): void {
  const page = root.querySelector<HTMLElement>(".mask");
  if (!page) {
    // Navigated away inside the site: drop the photo.
    if (hasOwnPhoto()) forgetPhoto();
    return;
  }
  const hero = page.querySelector<HTMLCanvasElement>("[data-mask-canvas]")!;
  const fileInput = page.querySelector<HTMLInputElement>("[data-mask-file]")!;

  if (!state.photo && !state.demoLoading) void loadDemo();
  void document.fonts?.ready.then(() => { state.thumbs = {}; redraw(page, true); });
  redraw(page, false);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    // Clear the input straight away so the browser isn't holding the file either.
    fileInput.value = "";
    if (file) void loadPhoto(file);
  });
  const heroBox = page.querySelector<HTMLElement>("[data-mask-hero]")!;
  heroBox.addEventListener("dragover", (event) => { event.preventDefault(); heroBox.classList.add("is-over"); });
  heroBox.addEventListener("dragleave", () => heroBox.classList.remove("is-over"));
  heroBox.addEventListener("drop", (event) => {
    event.preventDefault();
    heroBox.classList.remove("is-over");
    const file = event.dataTransfer?.files?.[0];
    if (file) void loadPhoto(file);
  });
  bindDrag(hero, page);

  page.querySelectorAll<HTMLButtonElement>("[data-mask-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      state.style = button.dataset.maskPick as MaskKey;
      state.saved = false;
      page.querySelectorAll<HTMLButtonElement>("[data-mask-pick]").forEach((other) => {
        const on = other === button;
        other.classList.toggle("is-on", on);
        other.setAttribute("aria-pressed", String(on));
      });
      refreshControls(page);
      drawHero(page);
    });
  });
  const controls = page.querySelector<HTMLElement>("[data-mask-controls]")!;
  controls.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-mask-straighten]")) {
      event.preventDefault();
      state.place.tilt = 0;
      const range = controls.querySelector<HTMLInputElement>('[data-mask-range="tilt"]');
      if (range) range.value = "0";
      drawHero(page);
      scheduleThumbs(page);
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-mask-set], [data-mask-toggle]");
    if (!target) return;
    const opts = state.options[state.style];
    if (target.dataset.maskToggle) opts[target.dataset.maskToggle] = !opts[target.dataset.maskToggle];
    else if (target.dataset.maskSet) opts[target.dataset.maskSet] = target.dataset.maskValue ?? "";
    changed(page);
  });
  controls.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    const key = input.dataset.maskRange as "size" | "spread" | "tilt" | undefined;
    if (!key) return;
    state.place[key] = Number(input.value);
    state.saved = false;
    drawHero(page);
    scheduleThumbs(page);
  });
  page.querySelectorAll<HTMLButtonElement>('[data-mask-action="choose"]').forEach((button) => button.addEventListener("click", () => fileInput.click()));
  page.querySelector('[data-mask-action="save"]')?.addEventListener("click", () => void savePicture(page));
  page.querySelector('[data-mask-action="share"]')?.addEventListener("click", () => void sharePicture(page));
  page.querySelector('[data-mask-action="forget"]')?.addEventListener("click", () => {
    forgetPhoto();
    void loadDemo();
    rerender();
  });
  page.querySelector('[data-mask-action="shuffle"]')?.addEventListener("click", () => {
    const opts = state.options[state.style];
    for (const control of MASKS[state.style].controls) {
      opts[control.key] = control.kind === "toggle" ? Math.random() < 0.7 : control.options[Math.floor(Math.random() * control.options.length)];
    }
    state.seed = Math.floor(Math.random() * 1e9);
    changed(page);
  });
}

function rerender(): void {
  window.dispatchEvent(new CustomEvent("hidn:rerender"));
}

/** A setting changed: new controls, a new hero, and this mask's thumbnail. */
function changed(page: HTMLElement): void {
  state.saved = false;
  wipe(state.thumbs[state.style]);
  delete state.thumbs[state.style];
  refreshControls(page);
  drawHero(page);
  drawThumb(page, state.style);
  const save = page.querySelector('[data-mask-action="save"]');
  if (save && hasOwnPhoto()) save.textContent = "↓ SAVE MY MASK";
}

function refreshControls(page: HTMLElement): void {
  const controls = page.querySelector<HTMLElement>("[data-mask-controls]");
  if (controls) controls.innerHTML = renderControls();
  const badge = page.querySelector<HTMLElement>("[data-mask-badge]");
  if (badge) badge.textContent = heroBadge();
}

// MARK: Photos

async function loadDemo(): Promise<void> {
  state.demoLoading = true;
  try {
    const blob = await fetch(DEMO_SRC).then((response) => response.blob());
    if (state.photo) return;
    state.photo = { master: await squareMaster(blob), demo: true, sized: new Map() };
    state.thumbs = {};
    const page = document.querySelector<HTMLElement>(".mask");
    if (page) redraw(page, true);
  } catch {
    // The page still works without the example; it just starts empty.
  } finally {
    state.demoLoading = false;
  }
}

async function loadPhoto(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    state.error = "That isn't an image. Pick a JPG, PNG or WebP.";
    rerender();
    return;
  }
  try {
    // Read straight into a canvas. Drawing also drops the photo's metadata
    // (location, camera), so nothing but pixels is ever in memory.
    const master = await squareMaster(file);
    forgetPhoto();
    state.photo = { master, demo: false, sized: new Map() };
    state.place = { ...PHOTO_PLACE };
    state.thumbs = {};
  } catch {
    state.error = "That photo couldn't be opened. Try another one.";
  }
  rerender();
}

/** Centre square crop of the image at the save size. */
async function squareMaster(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = canvasOf(SAVE_SIZE);
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SAVE_SIZE, SAVE_SIZE);
  bitmap.close();
  return canvas;
}

function canvasOf(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** The photo at one size, with its contrast-stretched luminance. Kept in memory while on the page. */
function photoAt(size: number): Sized | null {
  const photo = state.photo;
  if (!photo) return null;
  const cached = photo.sized.get(size);
  if (cached) return cached;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(photo.master, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const raw = new Uint8Array(size * size);
  const histogram = new Uint32Array(256);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    raw[p] = l;
    histogram[l]++;
  }
  // Stretch between the 2nd and 98th percentiles so dark and washed-out
  // photos both use the full range.
  const total = size * size;
  let low = 0, high = 255, seen = 0;
  for (let l = 0; l < 256; l++) { seen += histogram[l]; if (seen >= total * 0.02) { low = l; break; } }
  seen = 0;
  for (let l = 255; l >= 0; l--) { seen += histogram[l]; if (seen >= total * 0.02) { high = l; break; } }
  const span = Math.max(1, high - low);
  const lum = new Float32Array(total);
  for (let p = 0; p < total; p++) lum[p] = Math.min(1, Math.max(0, (raw[p] - low) / span));
  const entry = { canvas, lum };
  photo.sized.set(size, entry);
  return entry;
}

/** Light backdrop connected to the picture's edge, for masks that black it out. */
function backdropAt(size: number): Uint8Array {
  const entry = photoAt(size)!;
  if (entry.backdrop) return entry.backdrop;
  const { lum } = entry;
  const backdrop = new Uint8Array(size * size);
  const stack: number[] = [];
  for (let i = 0; i < size; i++) stack.push(i, (size - 1) * size + i, i * size, i * size + size - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (backdrop[i] || lum[i] < 0.72) continue;
    backdrop[i] = 1;
    const x = i % size, y = (i / size) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < size - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - size);
    if (y < size - 1) stack.push(i + size);
  }
  entry.backdrop = backdrop;
  return backdrop;
}

// MARK: Drawing

function redraw(page: HTMLElement, thumbs: boolean): void {
  drawHero(page);
  if (thumbs) scheduleThumbs(page);
  else ORDER.forEach((key) => blitThumb(page, key));
}

function drawHero(page: HTMLElement): void {
  const canvas = page.querySelector<HTMLCanvasElement>("[data-mask-canvas]");
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  const out = renderMask(state.style, HERO_SIZE);
  if (out) {
    ctx.drawImage(out, 0, 0);
    wipe(out);
  } else {
    ctx.fillStyle = "#0b0b0e";
    ctx.fillRect(0, 0, HERO_SIZE, HERO_SIZE);
  }
}

let thumbTimer = 0;
/** Thumbnails are redrawn a moment after changes stop, one per frame. */
function scheduleThumbs(page: HTMLElement): void {
  window.clearTimeout(thumbTimer);
  thumbTimer = window.setTimeout(() => {
    Object.values(state.thumbs).forEach(wipe);
    state.thumbs = {};
    let index = 0;
    const next = () => {
      if (index >= ORDER.length || !page.isConnected) return;
      drawThumb(page, ORDER[index++]);
      requestAnimationFrame(next);
    };
    next();
  }, 180);
}

function drawThumb(page: HTMLElement, key: MaskKey): void {
  if (!state.thumbs[key]) {
    const out = renderMask(key, THUMB_SIZE);
    if (!out) return;
    state.thumbs[key] = out;
  }
  blitThumb(page, key);
}

function blitThumb(page: HTMLElement, key: MaskKey): void {
  const thumb = state.thumbs[key];
  const canvas = page.querySelector<HTMLCanvasElement>(`[data-mask-thumb="${key}"]`);
  if (thumb && canvas) canvas.getContext("2d")!.drawImage(thumb, 0, 0);
}

type RGB = [number, number, number];
function hexRgb(hex: string): RGB {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}
function rgba([r, g, b]: RGB, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function tint([r, g, b]: RGB, amount: number): RGB {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount].map(Math.round) as RGB;
}
function mix(a: string, b: string): string {
  const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b);
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h((r1 + r2) / 2)}${h((g1 + g2) / 2)}${h((b1 + b2) / 2)}`;
}

const IMPACT = "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Black', sans-serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Everything a mask needs to draw itself at one size. */
interface Kit {
  x: CanvasRenderingContext2D;
  S: number;
  /** One "design pixel": masks are designed at 512 and scale from there. */
  u: number;
  src: HTMLCanvasElement;
  lum: Float32Array;
  eye: { x: number; y: number };
  size: number;
  spread: number;
  tilt: number;
  face: { x: number; y: number; w: number; h: number };
  opts: Record<string, string | boolean>;
  rand: () => number;
  mono: string;
}

function renderMask(key: MaskKey, S: number): HTMLCanvasElement | null {
  const entry = photoAt(S);
  if (!entry) return null;
  const out = canvasOf(S);
  const x = out.getContext("2d")!;
  const { size, spread, tilt } = state.place;
  const eye = { x: state.place.x * S, y: state.place.y * S };
  const fw = S * 0.56 * size, fh = S * 0.62 * size;
  let seed = state.seed >>> 0 || 1;
  const kit: Kit = {
    x, S, u: S / 512, src: entry.canvas, lum: entry.lum, eye, size, spread, tilt,
    face: { x: eye.x - fw / 2, y: eye.y - S * 0.025 * size - fh / 2, w: fw, h: fh },
    opts: state.options[key],
    rand: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; },
    mono: getComputedStyle(document.documentElement).getPropertyValue("--hidn-font-mono").trim() || "ui-monospace, Menlo, monospace",
  };
  DRAW[key](kit, key === "anon" ? backdropAt(S) : undefined);
  return out;
}

/** Maps luminance onto a colour ramp, writing the whole canvas. */
function gradientMap(k: Kit, stops: Array<[number, string]>, lum = k.lum): void {
  const parsed = stops.map(([p, h]) => [p, hexRgb(h)] as [number, RGB]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let j = 1;
    while (j < parsed.length - 1 && v > parsed[j][0]) j++;
    const [a, ca] = parsed[j - 1], [b, cb] = parsed[j];
    const t = Math.min(1, Math.max(0, (v - a) / (b - a || 1)));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = ca[c] + (cb[c] - ca[c]) * t;
  }
  const image = k.x.createImageData(k.S, k.S);
  const d = image.data;
  for (let p = 0; p < lum.length; p++) {
    const i = Math.round(lum[p] * 255) * 3;
    d[p * 4] = lut[i]; d[p * 4 + 1] = lut[i + 1]; d[p * 4 + 2] = lut[i + 2]; d[p * 4 + 3] = 255;
  }
  k.x.putImageData(image, 0, 0);
}

function bloom(k: Kit, alpha: number, blur: number): void {
  const copy = canvasOf(k.S);
  copy.getContext("2d")!.drawImage(k.x.canvas, 0, 0);
  k.x.save();
  k.x.globalCompositeOperation = "screen";
  k.x.globalAlpha = alpha;
  k.x.filter = `blur(${blur * k.u}px)`;
  k.x.drawImage(copy, 0, 0);
  k.x.restore();
  wipe(copy);
}

function grain(k: Kit, alpha: number): void {
  const n = Math.round((k.S * k.S) / 30);
  const d = Math.max(1, 1.5 * k.u);
  for (let i = 0; i < n; i++) {
    k.x.fillStyle = `rgba(255, 255, 255, ${alpha * k.rand()})`;
    k.x.fillRect(k.rand() * k.S, k.rand() * k.S, d, d);
  }
}

function scanlines(k: Kit, alpha: number, step = 3): void {
  k.x.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  const gap = Math.max(2, step * k.u), h = Math.max(1, k.u);
  for (let y = 0; y < k.S; y += gap) k.x.fillRect(0, y, k.S, h);
}

function vignette(k: Kit, alpha: number): void {
  const g = k.x.createRadialGradient(k.S / 2, k.S / 2, k.S * 0.3, k.S / 2, k.S / 2, k.S * 0.75);
  g.addColorStop(0, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
  k.x.fillStyle = g;
  k.x.fillRect(0, 0, k.S, k.S);
}

/** Centred text, shrunk to fit when a preset word is long for its bar. */
function centeredText(k: Kit, text: string, cx: number, cy: number, font: string, color: string, glow = 0, maxWidth = Infinity, angle = 0): void {
  k.x.save();
  k.x.font = font;
  const w = k.x.measureText(text).width;
  const scale = w > maxWidth ? maxWidth / w : 1;
  k.x.translate(cx, cy);
  k.x.rotate(angle);
  k.x.scale(scale, scale);
  k.x.textAlign = "center";
  k.x.textBaseline = "middle";
  k.x.fillStyle = color;
  if (glow) { k.x.shadowColor = color; k.x.shadowBlur = glow * k.u; }
  k.x.fillText(text, 0, 0);
  k.x.restore();
}

/** A black bar across the eyes, tilted with the head, with an optional outline. */
function eyeBar(k: Kit, w: number, h: number, outline: string | null): void {
  k.x.save();
  k.x.translate(k.eye.x, k.eye.y);
  k.x.rotate(k.tilt);
  k.x.shadowColor = "rgba(0, 0, 0, 0.6)";
  k.x.shadowBlur = 24 * k.u;
  k.x.fillStyle = "#040404";
  k.x.fillRect(-w / 2, -h / 2, w, h);
  k.x.shadowBlur = 0;
  if (outline) {
    k.x.strokeStyle = outline;
    k.x.lineWidth = 2 * k.u;
    k.x.strokeRect(-w / 2 + k.u, -h / 2 + k.u, w - 2 * k.u, h - 2 * k.u);
  }
  k.x.restore();
}

const DRAW: Record<MaskKey, (k: Kit, backdrop?: Uint8Array) => void> = {
  hidn(k) {
    gradientMap(k, [[0, "#060606"], [0.5, "#6e6e6e"], [1, "#f4f4f4"]]);
    grain(k, 0.22);
    vignette(k, 0.5);
    const w = k.S * 0.74 * k.size, h = 86 * k.u * k.size;
    eyeBar(k, w, h, null);
    centeredText(k, "H I D N", k.eye.x, k.eye.y, `800 ${60 * k.u * k.size}px ${SANS}`, String(k.opts.color), 22, w * 0.86, k.tilt);
  },
  eyes(k) {
    const col = hexRgb(String(k.opts.color));
    const core = rgba(tint(col, 0.7), 0.97);
    gradientMap(k, [[0, "#020302"], [0.55, "#22262a"], [1, "#a7adb2"]]);
    vignette(k, 0.55);
    const glow = 1.35 * k.size, half = k.S * 0.091 * k.spread * k.size;
    k.x.save();
    k.x.globalCompositeOperation = "lighter";
    // Drawn in the head's frame: centred on the eyes and tilted with them.
    k.x.translate(k.eye.x, k.eye.y);
    k.x.rotate(k.tilt);
    for (const cx of [-half, half]) {
      const ey = 0;
      if (k.opts.streak) {
        const st = k.x.createLinearGradient(cx - k.S * 0.6, 0, cx + k.S * 0.6, 0);
        st.addColorStop(0, rgba(col, 0)); st.addColorStop(0.5, core); st.addColorStop(1, rgba(col, 0));
        k.x.fillStyle = st;
        k.x.fillRect(cx - k.S * 0.6, ey - 4 * k.u * glow, k.S * 1.2, 8 * k.u * glow);
        const st2 = k.x.createLinearGradient(0, ey - 80 * k.u * glow, 0, ey + 80 * k.u * glow);
        st2.addColorStop(0, rgba(col, 0)); st2.addColorStop(0.5, rgba(col, 0.6)); st2.addColorStop(1, rgba(col, 0));
        k.x.fillStyle = st2;
        k.x.fillRect(cx - 2 * k.u, ey - 80 * k.u * glow, 4 * k.u, 160 * k.u * glow);
      }
      const R = 78 * k.u * glow;
      const g = k.x.createRadialGradient(cx, ey, 0, cx, ey, R);
      g.addColorStop(0, "rgba(255, 255, 255, 1)"); g.addColorStop(0.22, core); g.addColorStop(0.45, rgba(col, 0.75)); g.addColorStop(1, rgba(col, 0));
      k.x.fillStyle = g;
      k.x.beginPath(); k.x.arc(cx, ey, R, 0, Math.PI * 2); k.x.fill();
      // A solid hot core, so the real eye is fully covered.
      k.x.fillStyle = "rgba(255, 255, 255, 0.9)";
      k.x.beginPath(); k.x.ellipse(cx, ey, 20 * k.u * glow, 13 * k.u * glow, 0, 0, Math.PI * 2); k.x.fill();
    }
    k.x.restore();
    scanlines(k, 0.12, 4);
  },
  anon(k, backdrop) {
    const lum = backdrop ? k.lum.map((v, i) => (backdrop[i] ? 0.04 : v)) : k.lum;
    gradientMap(k, [[0, "#010302"], [0.35, "#0c461e"], [0.7, "#4dff6e"], [1, "#d7ffde"]], lum);
    bloom(k, 0.35, 8);
    const w = k.S * 0.6 * k.size, h = k.S * 0.13 * k.size;
    eyeBar(k, w, h, "rgba(77, 255, 110, 0.6)");
    centeredText(k, String(k.opts.word), k.eye.x, k.eye.y, `700 ${30 * k.u * k.size}px ${k.mono}`, "#4dff6e", 14, w * 0.86, k.tilt);
    scanlines(k, 0.22, 4);
    grain(k, 0.12);
    vignette(k, 0.62);
  },
  haunted(k) {
    gradientMap(k, [[0, "#0a0402"], [0.4, "#5a1e05"], [0.72, "#ff8a1f"], [1, "#ffe8c8"]]);
    bloom(k, 0.4, 10);
    scanlines(k, 0.18, 4);
    vignette(k, 0.6);
    const w = k.S * 0.7 * k.size, h = 62 * k.u * k.size;
    eyeBar(k, w, h, "rgba(77, 255, 110, 0.6)");
    centeredText(k, String(k.opts.word), k.eye.x, k.eye.y, `700 ${24 * k.u * k.size}px ${k.mono}`, "#4dff6e", 12, w * 0.88, k.tilt);
    k.x.font = `700 ${18 * k.u}px ${k.mono}`;
    k.x.fillStyle = "#ff8a1f";
    k.x.fillText("31.10 // HALLOWEEN", 24 * k.u, 40 * k.u);
  },
  cctv(k) {
    gradientMap(k, [[0, "#050505"], [0.5, "#7d8a86"], [1, "#f2f5f3"]]);
    grain(k, 0.35);
    scanlines(k, 0.25, 4);
    vignette(k, 0.6);
    const { x, y, w, h } = k.face, len = 34 * k.u * k.size;
    k.x.save();
    k.x.translate(k.eye.x, k.eye.y);
    k.x.rotate(k.tilt);
    k.x.translate(-k.eye.x, -k.eye.y);
    k.x.strokeStyle = "#ffffff";
    k.x.lineWidth = 3 * k.u;
    k.x.beginPath();
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      k.x.moveTo(cx, cy + dy * len); k.x.lineTo(cx, cy); k.x.lineTo(cx + dx * len, cy);
    }
    k.x.stroke();
    k.x.restore();
    const label = String(k.opts.word);
    k.x.font = `700 ${17 * k.u}px ${k.mono}`;
    const lw = Math.min(k.S - 16 * k.u, k.x.measureText(label).width + 20 * k.u);
    const lx = Math.min(Math.max(8 * k.u, k.eye.x - lw / 2), k.S - lw - 8 * k.u);
    const ly = Math.max(60 * k.u, y - 38 * k.u);
    k.x.fillStyle = "rgba(0, 0, 0, 0.7)";
    k.x.fillRect(lx, ly, lw, 30 * k.u);
    k.x.fillStyle = "#fff";
    k.x.fillText(label, lx + 10 * k.u, ly + 21 * k.u, lw - 20 * k.u);
    k.x.font = `700 ${22 * k.u}px ${k.mono}`;
    k.x.fillText(`CAM ${String(1 + Math.floor(k.rand() * 9)).padStart(2, "0")}`, 24 * k.u, 42 * k.u);
    if (k.opts.rec) {
      k.x.fillStyle = "#ff2a2a";
      k.x.beginPath(); k.x.arc(k.S - 112 * k.u, 34 * k.u, 9 * k.u, 0, Math.PI * 2); k.x.fill();
      k.x.fillStyle = "#fff";
      k.x.fillText("REC", k.S - 96 * k.u, 42 * k.u);
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    k.x.font = `600 ${17 * k.u}px ${k.mono}`;
    k.x.fillText(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}  ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`, 24 * k.u, k.S - 26 * k.u);
  },
  thermal(k) {
    const soft = canvasOf(k.S);
    const sc = soft.getContext("2d", { willReadFrequently: true })!;
    sc.filter = `blur(${3 * k.u}px)`;
    sc.drawImage(k.src, 0, 0);
    const d = sc.getImageData(0, 0, k.S, k.S).data;
    wipe(soft);
    const heat = new Float32Array(k.S * k.S);
    let lo = 1, hi = 0;
    for (let p = 0; p < heat.length; p++) { const v = (0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2]) / 255; heat[p] = v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let p = 0; p < heat.length; p++) heat[p] = Math.pow(1 - (heat[p] - lo) / (hi - lo || 1), 0.8);
    const palettes: Record<string, Array<[number, string]>> = {
      IRON: [[0, "#07001a"], [0.2, "#2a0a8c"], [0.4, "#a1009e"], [0.6, "#ff1e1e"], [0.78, "#ff9500"], [0.92, "#ffef3a"], [1, "#ffffff"]],
      RAINBOW: [[0, "#000033"], [0.2, "#0040ff"], [0.4, "#00e0ff"], [0.55, "#2bff3a"], [0.72, "#ffee00"], [0.88, "#ff3300"], [1, "#ffffff"]],
      "WHITE HOT": [[0, "#000000"], [0.6, "#7a7a7a"], [1, "#ffffff"]],
    };
    const stops = palettes[String(k.opts.palette)] ?? palettes.IRON;
    gradientMap(k, stops, heat);
    if (k.opts.sight) {
      const r = 60 * k.u * k.size, cx = 0, cy = 0;
      k.x.save();
      k.x.translate(k.eye.x, k.eye.y);
      k.x.rotate(k.tilt);
      k.x.strokeStyle = "rgba(255, 255, 255, 0.9)";
      k.x.lineWidth = 2 * k.u;
      k.x.beginPath();
      k.x.arc(cx, cy, r, 0, Math.PI * 2);
      k.x.moveTo(cx - r * 1.5, cy); k.x.lineTo(cx - r / 2, cy); k.x.moveTo(cx + r / 2, cy); k.x.lineTo(cx + r * 1.5, cy);
      k.x.moveTo(cx, cy - r * 1.5); k.x.lineTo(cx, cy - r / 2); k.x.moveTo(cx, cy + r / 2); k.x.lineTo(cx, cy + r * 1.5);
      k.x.stroke();
      k.x.restore();
    }
    k.x.fillStyle = "#fff";
    k.x.font = `700 ${20 * k.u}px ${k.mono}`;
    k.x.fillText(`${(36.4 + k.rand() * 1.4).toFixed(1)}°C`, 24 * k.u, 40 * k.u);
    k.x.font = `600 ${15 * k.u}px ${k.mono}`;
    k.x.fillText("SUBJECT: UNIDENTIFIED", 24 * k.u, k.S - 26 * k.u);
    const bar = k.x.createLinearGradient(0, 60 * k.u, 0, k.S - 60 * k.u);
    stops.forEach(([p, h]) => bar.addColorStop(1 - p, h));
    k.x.fillStyle = bar;
    k.x.fillRect(k.S - 40 * k.u, 60 * k.u, 14 * k.u, k.S - 120 * k.u);
  },
  pop(k) {
    const [bg, dot] = String(k.opts.colors).split("|");
    k.x.fillStyle = bg;
    k.x.fillRect(0, 0, k.S, k.S);
    const step = Math.max(4, 11 * k.u);
    const at = (px: number, py: number) => k.lum[Math.min(k.S - 1, Math.floor(py)) * k.S + Math.min(k.S - 1, Math.floor(px))];
    k.x.fillStyle = dot;
    for (let y = 0, row = 0; y < k.S; y += step, row++) {
      for (let x = (row % 2) * step / 2; x < k.S; x += step) {
        const r = (1 - at(x, y)) * step * 0.62;
        if (r > 0.6 * k.u) { k.x.beginPath(); k.x.arc(x, y, r, 0, Math.PI * 2); k.x.fill(); }
      }
    }
    k.x.fillStyle = "#111";
    for (let y = 0, row = 0; y < k.S; y += step, row++) {
      for (let x = (row % 2) * step / 2; x < k.S; x += step) {
        const v = at(x, y);
        if (v < 0.22) { k.x.beginPath(); k.x.arc(x, y, (0.22 - v) * step * 2.2, 0, Math.PI * 2); k.x.fill(); }
      }
    }
    const w = k.S * 0.66 * k.size, h = 74 * k.u * k.size;
    k.x.save();
    k.x.translate(k.eye.x, k.eye.y);
    k.x.rotate(k.tilt - 0.05);
    k.x.fillStyle = "#111";
    k.x.fillRect(-w / 2, -h / 2, w, h);
    k.x.restore();
    centeredText(k, String(k.opts.word), k.eye.x, k.eye.y, `400 ${52 * k.u * k.size}px ${IMPACT}`, "#fff", 0, w * 0.86, k.tilt - 0.05);
    k.x.save();
    k.x.translate(k.S - 92 * k.u, 92 * k.u);
    k.x.rotate(0.2);
    k.x.fillStyle = "#18d1ff";
    k.x.beginPath();
    for (let i = 0; i < 24; i++) { const a = (i * Math.PI) / 12, r = (i % 2 ? 52 : 70) * k.u; k.x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    k.x.fill();
    k.x.restore();
    centeredText(k, String(k.opts.burst), k.S - 92 * k.u, 94 * k.u, `400 ${28 * k.u}px ${IMPACT}`, "#111", 0, 96 * k.u);
  },
  glitch(k) {
    const base = canvasOf(k.S);
    gradientMap({ ...k, x: base.getContext("2d")! }, [[0, "#05050a"], [0.55, "#5d6a8a"], [1, "#eef2ff"]]);
    k.x.fillStyle = "#000";
    k.x.fillRect(0, 0, k.S, k.S);
    const shift = 9 * k.u * k.size;
    const layer = canvasOf(k.S);
    const lc = layer.getContext("2d")!;
    k.x.save();
    k.x.globalCompositeOperation = "lighter";
    for (const [col, dx, dy] of [["#ff0040", -shift, 0], ["#00ff9d", 0, 0], ["#2d6bff", shift, 2 * k.u]] as Array<[string, number, number]>) {
      lc.globalCompositeOperation = "source-over";
      lc.drawImage(base, 0, 0);
      lc.globalCompositeOperation = "multiply";
      lc.fillStyle = col;
      lc.fillRect(0, 0, k.S, k.S);
      k.x.drawImage(layer, dx, dy);
    }
    k.x.restore();
    wipe(base);
    const snap = layer;
    const sc = lc;
    sc.globalCompositeOperation = "source-over";
    for (let i = 0; i < 14; i++) {
      sc.drawImage(k.x.canvas, 0, 0);
      const y = k.rand() * k.S, h = (4 + k.rand() * 26) * k.u, dx = (k.rand() - 0.5) * 90 * k.u * k.size;
      k.x.drawImage(snap, 0, y, k.S, h, dx, y, k.S, h);
    }
    const band = 56 * k.u * k.size;
    sc.drawImage(k.x.canvas, 0, 0);
    k.x.drawImage(snap, 0, k.eye.y - band / 2, k.S, band, 46 * k.u * k.size, k.eye.y - band / 2, k.S, band);
    wipe(snap);
    if (k.opts.line) {
      k.x.save();
      k.x.translate(k.eye.x, k.eye.y);
      k.x.rotate(k.tilt);
      k.x.fillStyle = "rgba(255, 0, 64, 0.85)";
      k.x.fillRect(-k.S, -8 * k.u, k.S * 2, 3 * k.u);
      k.x.restore();
    }
    scanlines(k, 0.3, 3);
    k.x.font = `700 ${18 * k.u}px ${k.mono}`;
    k.x.fillStyle = "#fff";
    k.x.fillText("▒ SIGNAL LOST ▒", 24 * k.u, k.S - 26 * k.u);
  },
  blur(k) {
    k.x.drawImage(k.src, 0, 0);
    const image = k.x.getImageData(0, 0, k.S, k.S);
    const d = image.data;
    for (let p = 0; p < d.length; p += 4) {
      const g = d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11;
      for (let c = 0; c < 3; c++) d[p + c] = d[p + c] * 0.55 + g * 0.45;
    }
    k.x.putImageData(image, 0, 0);
    const cells = Math.max(5, Math.round(14 / k.size));
    const tiny = canvasOf(cells);
    tiny.getContext("2d")!.drawImage(k.src, 0, 0, cells, cells);
    const { x, y, w, h } = k.face;
    k.x.save();
    k.x.beginPath();
    k.x.ellipse(x + w / 2, y + h / 2, w * 0.52, h * 0.5, k.tilt, 0, Math.PI * 2);
    k.x.clip();
    k.x.imageSmoothingEnabled = false;
    k.x.drawImage(tiny, 0, 0, cells, cells, 0, 0, k.S, k.S);
    k.x.restore();
    wipe(tiny);
    if (k.opts.tag) {
      k.x.fillStyle = "#fff";
      k.x.fillRect(k.S / 2 - 130 * k.u, k.S - 70 * k.u, 260 * k.u, 40 * k.u);
      centeredText(k, "IDENTITY PROTECTED", k.S / 2, k.S - 50 * k.u, `800 ${18 * k.u}px ${SANS}`, "#111", 0, 240 * k.u);
    }
  },
  ascii(k) {
    k.x.fillStyle = "#0a0705";
    k.x.fillRect(0, 0, k.S, k.S);
    const chars = " .:-=+*#%@";
    const cw = 8 * k.u, ch = 12 * k.u;
    const [r, g, b] = hexRgb(String(k.opts.color));
    k.x.font = `700 ${12 * k.u}px ${k.mono}`;
    for (let y = 0; y < k.S; y += ch) {
      for (let x = 0; x < k.S; x += cw) {
        const v = k.lum[Math.min(k.S - 1, Math.floor(y + ch / 2)) * k.S + Math.min(k.S - 1, Math.floor(x + cw / 2))];
        const c = chars[Math.floor((1 - v) * (chars.length - 1) + 0.5)];
        if (c === " ") continue;
        k.x.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.45 + 0.55 * (1 - v)})`;
        k.x.fillText(c, x, y + 10 * k.u);
      }
    }
    k.x.font = `700 ${18 * k.u}px ${k.mono}`;
    k.x.fillStyle = String(k.opts.color);
    k.x.fillText("> user: ████████", 24 * k.u, 40 * k.u);
  },
  classified(k) {
    k.x.fillStyle = "#e9dfc8";
    k.x.fillRect(0, 0, k.S, k.S);
    grain(k, 0.15);
    const photo = canvasOf(k.S);
    gradientMap({ ...k, x: photo.getContext("2d")! }, [[0, "#151210"], [0.6, "#7b7466"], [1, "#efe7d3"]]);
    // The photo is pinned slightly tilted; the eye line goes through the same transform.
    const half = 180 * k.u, top = -190 * k.u;
    const crop = { x: k.S * 0.11, y: k.S * 0.09, w: k.S * 0.78 };
    k.x.save();
    k.x.translate(k.S / 2, k.S / 2 + 8 * k.u);
    k.x.rotate(-0.03);
    k.x.fillStyle = "#fff";
    k.x.fillRect(-196 * k.u, -206 * k.u, 392 * k.u, 412 * k.u);
    k.x.drawImage(photo, crop.x, crop.y, crop.w, crop.w, -half, top, half * 2, half * 2);
    const ex = ((k.eye.x - crop.x) / crop.w) * half * 2 - half;
    const ey = ((k.eye.y - crop.y) / crop.w) * half * 2 + top;
    const bw = 340 * k.u * k.size, bh = 46 * k.u * k.size;
    k.x.save();
    k.x.translate(ex, ey);
    k.x.rotate(k.tilt);
    k.x.fillStyle = "#0a0a0a";
    k.x.fillRect(-bw / 2, -bh / 2, bw, bh);
    k.x.restore();
    k.x.restore();
    wipe(photo);
    k.x.save();
    k.x.translate(k.S / 2 + 70 * k.u, k.S - 92 * k.u);
    k.x.rotate(-0.18);
    k.x.strokeStyle = "rgba(200, 20, 30, 0.85)";
    k.x.lineWidth = 5 * k.u;
    k.x.strokeRect(-140 * k.u, -30 * k.u, 280 * k.u, 60 * k.u);
    k.x.font = `400 ${44 * k.u}px ${IMPACT}`;
    k.x.fillStyle = "rgba(200, 20, 30, 0.85)";
    k.x.textAlign = "center";
    k.x.textBaseline = "middle";
    const word = String(k.opts.word);
    const fit = Math.min(1, (250 * k.u) / k.x.measureText(word).width);
    k.x.scale(fit, fit);
    k.x.fillText(word, 0, 2 * k.u);
    k.x.restore();
    k.x.font = `700 ${15 * k.u}px 'Courier New', ${k.mono}`;
    k.x.fillStyle = "#3a3226";
    k.x.fillText(`FILE NO. ${Math.floor(k.rand() * 9000) + 1000}-X   NAME: [REDACTED]`, 22 * k.u, 32 * k.u);
  },
  neon(k) {
    const [a, b] = String(k.opts.colors).split("|");
    gradientMap(k, [[0, "#12002e"], [0.45, a], [0.75, mix(a, b)], [1, b]]);
    bloom(k, 0.55, 14);
    if (k.opts.laser) {
      // A neon visor over the eyes: a wide glow, a solid band, a white-hot core.
      const w = k.S * 0.66 * k.size, h = 34 * k.u * k.size;
      const [r, g, bl] = hexRgb(b);
      k.x.save();
      k.x.translate(k.eye.x, k.eye.y);
      k.x.rotate(k.tilt);
      k.x.globalCompositeOperation = "lighter";
      const haze = k.x.createLinearGradient(0, -h * 2.4, 0, h * 2.4);
      haze.addColorStop(0, `rgba(${r}, ${g}, ${bl}, 0)`);
      haze.addColorStop(0.5, `rgba(${r}, ${g}, ${bl}, 0.55)`);
      haze.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
      k.x.fillStyle = haze;
      k.x.fillRect(-w * 0.62, -h * 2.4, w * 1.24, h * 4.8);
      k.x.globalCompositeOperation = "source-over";
      k.x.shadowColor = b;
      k.x.shadowBlur = 30 * k.u;
      k.x.fillStyle = b;
      k.x.beginPath();
      k.x.roundRect(-w / 2, -h / 2, w, h, h / 2);
      k.x.fill();
      k.x.shadowBlur = 12 * k.u;
      k.x.shadowColor = "#ffffff";
      k.x.fillStyle = "rgba(255, 255, 255, 0.92)";
      k.x.beginPath();
      k.x.roundRect(-w * 0.44, -h * 0.17, w * 0.88, h * 0.34, h * 0.17);
      k.x.fill();
      k.x.restore();
    }
    vignette(k, 0.45);
  },
};

// MARK: Lining up the eyes

function bindDrag(canvas: HTMLCanvasElement, page: HTMLElement): void {
  let dragging = false;
  let frame = 0;
  // Two fingers on the picture: twist to tilt, pinch to resize.
  const touches = new Map<number, { x: number; y: number }>();
  let gesture: { angle: number; dist: number; tilt: number; size: number } | null = null;
  const pair = () => {
    const [a, b] = [...touches.values()];
    return { angle: Math.atan2(b.y - a.y, b.x - a.x), dist: Math.hypot(b.x - a.x, b.y - a.y) || 1 };
  };
  const syncSliders = () => {
    const tilt = page.querySelector<HTMLInputElement>('[data-mask-range="tilt"]');
    const size = page.querySelector<HTMLInputElement>('[data-mask-range="size"]');
    if (tilt) tilt.value = String(state.place.tilt);
    if (size) size.value = String(state.place.size);
  };
  const move = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    state.place.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    state.place.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    state.saved = false;
    // At most one redraw per frame while dragging.
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawHero(page); });
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (!hasOwnPhoto() || !MASKS[state.style].positioned) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const now = pair();
      gesture = { angle: now.angle, dist: now.dist, tilt: state.place.tilt, size: state.place.size };
      dragging = false;
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    dragging = true;
    // They've found the drag; the hint would only cover the mask's corner text.
    state.dragged = true;
    page.querySelector("[data-mask-badge]")?.classList.add("is-done");
    canvas.setPointerCapture(event.pointerId);
    move(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture && touches.size === 2) {
      const now = pair();
      let turn = now.angle - gesture.angle;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      state.place.tilt = Math.min(0.6, Math.max(-0.6, gesture.tilt + turn));
      state.place.size = Math.min(1.7, Math.max(0.5, gesture.size * (now.dist / gesture.dist)));
      state.saved = false;
      syncSliders();
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawHero(page); });
      return;
    }
    if (dragging) move(event);
  });
  const end = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    if (gesture) {
      if (touches.size < 2) { gesture = null; scheduleThumbs(page); }
      return;
    }
    if (!dragging) return;
    dragging = false;
    scheduleThumbs(page);
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

// MARK: Saving and sharing (to the visitor's own device only)

function pictureBlob(): Promise<Blob | null> {
  const out = renderMask(state.style, SAVE_SIZE);
  if (!out) return Promise.resolve(null);
  return new Promise((resolve) => out.toBlob((blob) => { wipe(out); resolve(blob); }, "image/png"));
}

function fileName(): string {
  return `anon-${state.style}.png`;
}

async function savePicture(page: HTMLElement): Promise<void> {
  if (!hasOwnPhoto()) {
    page.querySelector<HTMLInputElement>("[data-mask-file]")?.click();
    return;
  }
  const blob = await pictureBlob();
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName();
  document.body.append(link);
  link.click();
  link.remove();
  // The download has its own copy; release this one.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  state.saved = true;
  const save = page.querySelector('[data-mask-action="save"]');
  if (save) save.textContent = "✓ SAVED · SET IT AS YOUR PFP";
}

async function sharePicture(page: HTMLElement): Promise<void> {
  if (!hasOwnPhoto()) return;
  const blob = await pictureBlob();
  if (!blob) return;
  const file = new File([blob], fileName(), { type: "image/png" });
  // Phones: the device's own share sheet, picture attached. Elsewhere: save
  // it, then open an X post with the text so the picture can be attached.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: SHARE_TEXT });
    } catch {
      // Closing the share sheet is not an error.
    }
    return;
  }
  await savePicture(page);
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}`, "_blank", "noopener,noreferrer");
}
