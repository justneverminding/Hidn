/** Shareable thought card. The words lead in Plex Sans; the room sits on top,
 * a hatched redaction signs it, and the wordmark closes it. Three sizes:
 * post (4:5), story (9:16) and wide (16:9). No domain or URL. */

export type ShareCardSize = "post" | "story" | "wide";

export interface ShareCardInput {
  text: string;
  replies: string[];
  room: string;
  reference: string;
  /** Short code shown in the corner, e.g. "// 6B60604E". No domain or URL. */
  mark: string;
  theme?: "signal" | "quiet";
  size?: ShareCardSize;
}

/** Replies that fit on each size. */
export const SHARE_CARD_MAX_REPLIES: Record<ShareCardSize, number> = { post: 3, story: 3, wide: 1 };

const SANS = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const GROUND = "#010403";
const INK = "#eef5ef";
const REPLY_INK = "#c9d8cb";
const GREEN = "#5dff8f";
const MUTED = "#8aa18e";
const DIM = "#6f8f78";
const RULE = "#0f2b1d";
const HATCH = "#2c6a46";
const TAGLINE = "Say what you can't say out loud.";

// Each layout is drawn in its mockup's units, then scaled to the export width.
const LAYOUTS: Record<ShareCardSize, { w: number; h: number; scale: number }> = {
  post: { w: 540, h: 675, scale: 2 },
  story: { w: 405, h: 720, scale: 1080 / 405 },
  wide: { w: 600, h: 338, scale: 2 },
};

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function clamp(ctx: CanvasRenderingContext2D, lines: string[], max: number, width: number): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (ctx.measureText(`${last}…`).width > width && last.length > 1) last = last.slice(0, -1).trimEnd();
  kept[max - 1] = `${last}…`;
  return kept;
}

interface Block { lines: string[]; size: number; lead: number }
interface ReplyBlock extends Block { }

function measure(ctx: CanvasRenderingContext2D, text: string, size: number, weight: number, width: number, lead: number, maxLines: number): Block {
  ctx.font = `${weight} ${size}px ${SANS}`;
  return { lines: clamp(ctx, wrap(ctx, text, width), maxLines, width), size, lead: size * lead };
}

/** Signature: "signed ▨▨▨ name withheld". Returns its width. */
function signature(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, barW: number, align: "left" | "right" | "center"): void {
  ctx.font = `400 ${size}px ${MONO}`;
  const gap = size * 0.8;
  const a = ctx.measureText("signed").width;
  const b = ctx.measureText("name withheld").width;
  const total = a + gap + barW + gap + b;
  let left = align === "left" ? x : align === "right" ? x - total : x - total / 2;
  ctx.fillStyle = DIM;
  ctx.textAlign = "left";
  ctx.fillText("signed", left, y);
  left += a + gap;
  const barH = size * 1.15;
  const top = y - barH * 0.82;
  ctx.save();
  ctx.fillStyle = "#0b1f14";
  ctx.fillRect(left, top, barW, barH);
  ctx.beginPath(); ctx.rect(left, top, barW, barH); ctx.clip();
  ctx.strokeStyle = HATCH;
  ctx.lineWidth = 1.5;
  for (let i = -barH; i < barW; i += 5.5) { ctx.beginPath(); ctx.moveTo(left + i, top + barH); ctx.lineTo(left + i + barH, top); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = HATCH;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, barW - 1, barH - 1);
  ctx.fillStyle = DIM;
  ctx.fillText("name withheld", left + barW + gap, y);
}

function roomLabel(ctx: CanvasRenderingContext2D, room: string, x: number, y: number, size: number, dot: boolean): void {
  ctx.font = `500 ${size}px ${SANS}`;
  ctx.fillStyle = GREEN;
  ctx.textAlign = "left";
  if (dot) {
    const r = size * 0.25;
    ctx.save();
    ctx.shadowColor = "rgba(93, 255, 143, .7)";
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x + r, y - size * 0.33, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    x += r * 2 + size * 0.57;
  }
  ctx.fillText(room, x, y);
}

function eye(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = "#e8f2e9";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = GROUND;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.41, 0, Math.PI * 2); ctx.fill();
}

function ground(ctx: CanvasRenderingContext2D, w: number, h: number, glowX: number, glowY: number): void {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(glowX, glowY, 10, glowX, glowY, Math.max(w, h) * 0.55);
  glow.addColorStop(0, "rgba(93, 255, 143, .065)");
  glow.addColorStop(1, "rgba(93, 255, 143, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(93, 255, 143, .025)";
  for (let line = 0; line < h; line += 4) ctx.fillRect(0, line, w, 1);
}

/** The quiet panel holding replies. Returns its height. */
function replyPanelHeight(blocks: ReplyBlock[], labelSize: number, pad: number): number {
  if (!blocks.length) return 0;
  const inner = blocks.reduce((sum, block) => sum + labelSize * 1.3 + 4 + block.lines.length * block.lead, 0);
  return pad * 2 + inner + (blocks.length - 1) * 29;
}

function drawReplyPanel(ctx: CanvasRenderingContext2D, blocks: ReplyBlock[], x: number, y: number, w: number, labelSize: number, pad: number): void {
  if (!blocks.length) return;
  const h = replyPanelHeight(blocks, labelSize, pad);
  ctx.fillStyle = "rgba(93, 255, 143, .035)";
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
  let cy = y + pad;
  ctx.textAlign = "left";
  blocks.forEach((block, index) => {
    if (index) {
      cy += 14;
      ctx.fillStyle = RULE;
      ctx.fillRect(x + pad, cy, w - pad * 2, 1);
      cy += 15;
    }
    ctx.font = `400 ${labelSize}px ${MONO}`;
    ctx.fillStyle = DIM;
    ctx.fillText("reply · anonymous", x + pad, cy + labelSize);
    cy += labelSize * 1.3 + 4;
    ctx.font = `400 ${block.size}px ${SANS}`;
    ctx.fillStyle = REPLY_INK;
    for (const line of block.lines) { ctx.fillText(line, x + pad, cy + block.size * 1.05); cy += block.lead; }
  });
}

/** Sizes the thought and replies to the space they have, largest first. */
function fitContent(ctx: CanvasRenderingContext2D, text: string, replies: string[], width: number, space: number, maxThought: number, fixed: number, replyPad: number): { thought: Block; replyBlocks: ReplyBlock[]; height: number } {
  const minThought = 17;
  for (let size = maxThought; size >= minThought; size -= 1) {
    const replySize = Math.max(12.5, Math.min(17, size * 0.56));
    const thought = measure(ctx, text, size, 500, width, 1.38, 40);
    const replyBlocks = replies.map((reply) => measure(ctx, reply, replySize, 400, width - replyPad * 2, 1.5, 6));
    const panel = replyPanelHeight(replyBlocks, 11, replyPad);
    const height = fixed + thought.lines.length * thought.lead + (panel ? 28 + panel : 0);
    if (height <= space || size === minThought) {
      if (height > space) {
        // Still too tall at the smallest size: trim the thought to what fits.
        const room = space - fixed - (panel ? 28 + panel : 0);
        const maxLines = Math.max(2, Math.floor(room / thought.lead));
        ctx.font = `500 ${size}px ${SANS}`;
        thought.lines = clamp(ctx, thought.lines, maxLines, width);
      }
      return { thought, replyBlocks, height: fixed + thought.lines.length * thought.lead + (panel ? 28 + panel : 0) };
    }
  }
  throw new Error("unreachable");
}

function drawThought(ctx: CanvasRenderingContext2D, thought: Block, x: number, y: number, align: "left" | "center"): number {
  ctx.font = `500 ${thought.size}px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.textAlign = align;
  for (const line of thought.lines) { ctx.fillText(line, x, y + thought.size * 1.02); y += thought.lead; }
  ctx.textAlign = "left";
  return y;
}

function drawPost(ctx: CanvasRenderingContext2D, input: ShareCardInput, text: string, replies: string[]): void {
  const { w, h } = LAYOUTS.post;
  const padX = 44;
  ground(ctx, w, h, w / 2, h * 0.45);
  roomLabel(ctx, input.room, padX, 40 + 15, 14, true);
  ctx.font = `400 12px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.textAlign = "right";
  ctx.fillText(input.mark, w - padX, 40 + 14);
  ctx.textAlign = "left";

  const footerTop = h - 36 - 48 - 20;
  const top = 40 + 30;
  const space = footerTop - top - 20;
  const width = w - padX * 2;
  const fit = fitContent(ctx, text, replies, width, space, replies.length ? 30 : 34, 14 + 22, 20);
  let y = top + (space - fit.height) / 2;
  signature(ctx, padX, y + 12, 12, 92, "left");
  y = drawThought(ctx, fit.thought, padX, y + 14 + 22, "left");
  drawReplyPanel(ctx, fit.replyBlocks, padX, y + 28, width, 11, 20);

  ctx.fillStyle = RULE;
  ctx.fillRect(padX, footerTop, width, 1);
  ctx.font = `600 22px ${MONO}`;
  ctx.fillStyle = GREEN;
  ctx.fillText(">hidn", padX, footerTop + 20 + 21);
  ctx.font = `400 13px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(TAGLINE, padX, footerTop + 20 + 22 + 6 + 14);
  ctx.font = `400 12px ${MONO}`;
  ctx.fillStyle = DIM;
  ctx.textAlign = "right";
  ctx.fillText("zero knowledge", w - padX, footerTop + 20 + 22 + 6 + 14);
  ctx.textAlign = "left";
}

function drawStory(ctx: CanvasRenderingContext2D, input: ShareCardInput, text: string, replies: string[]): void {
  const { w, h } = LAYOUTS.story;
  const padX = 34;
  ground(ctx, w, h, w / 2, h / 2);
  eye(ctx, w / 2 - 20, 104 + 17, 17);
  eye(ctx, w / 2 + 20, 104 + 17, 17);
  ctx.font = `500 13px ${SANS}`;
  ctx.fillStyle = GREEN;
  ctx.textAlign = "center";
  ctx.fillText(input.room, w / 2, 104 + 34 + 16 + 13);

  const top = 104 + 34 + 16 + 20 + 24;
  const footerTop = h - 112 - 46;
  const space = footerTop - top - 24;
  const width = w - padX * 2;
  const fit = fitContent(ctx, text, replies, width, space, replies.length ? 25 : 29, 20 + 14, 18);
  let y = top + (space - fit.height) / 2;
  y = drawThought(ctx, fit.thought, w / 2, y, "center");
  signature(ctx, w / 2, y + 20 + 11, 11, 70, "center");
  drawReplyPanel(ctx, fit.replyBlocks, padX, y + 20 + 14 + 28, width, 11, 18);

  ctx.textAlign = "center";
  ctx.font = `600 20px ${MONO}`;
  ctx.fillStyle = GREEN;
  ctx.fillText(">hidn", w / 2, footerTop + 20);
  ctx.font = `400 13px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(TAGLINE, w / 2, footerTop + 20 + 6 + 15);
  ctx.textAlign = "left";
}

function drawWide(ctx: CanvasRenderingContext2D, input: ShareCardInput, text: string, replies: string[]): void {
  const { w, h } = LAYOUTS.wide;
  const padX = 36;
  ground(ctx, w, h, w * 0.4, h / 2);
  roomLabel(ctx, input.room, padX, 30 + 13, 13, true);
  signature(ctx, w - padX, 30 + 12, 11, 60, "right");

  const footerTop = h - 26 - 22 - 14;
  const top = 30 + 26;
  const space = footerTop - top - 14;
  const width = w - padX * 2;
  const fit = fitContent(ctx, text, replies.slice(0, 1), width, space, replies.length ? 24 : 30, 0, 16);
  let y = top + (space - fit.height) / 2;
  y = drawThought(ctx, fit.thought, padX, y, "left");
  drawReplyPanel(ctx, fit.replyBlocks, padX, y + 28, width, 11, 16);

  ctx.fillStyle = RULE;
  ctx.fillRect(padX, footerTop, width, 1);
  ctx.font = `600 18px ${MONO}`;
  ctx.fillStyle = GREEN;
  ctx.fillText(">hidn", padX, footerTop + 14 + 17);
  ctx.font = `400 12px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "right";
  ctx.fillText(TAGLINE, w - padX, footerTop + 14 + 16);
  ctx.textAlign = "left";
}

/** Waits for the self-hosted Plex faces so the canvas never falls back mid-draw. */
async function loadFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`500 34px ${SANS}`),
    document.fonts.load(`400 17px ${SANS}`),
    document.fonts.load(`400 12px ${MONO}`),
    document.fonts.load(`600 22px ${MONO}`),
  ]).catch(() => undefined);
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const size = input.size ?? "post";
  const layout = LAYOUTS[size];
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.w * layout.scale);
  canvas.height = Math.round(layout.h * layout.scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");
  await loadFonts();
  ctx.scale(layout.scale, layout.scale);
  ctx.textBaseline = "alphabetic";

  const text = input.text.replace(/\s+/g, " ").trim();
  const replies = input.replies
    .map((reply) => reply.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, SHARE_CARD_MAX_REPLIES[size]);
  if (size === "story") drawStory(ctx, input, text, replies);
  else if (size === "wide") drawWide(ctx, input, text, replies);
  else drawPost(ctx, input, text, replies);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The thread image could not be created."))), "image/png");
  });
}
