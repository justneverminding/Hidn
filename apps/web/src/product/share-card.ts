/** Shareable thought card. The words lead in Plex Sans; the room sits on top,
 * a hatched redaction signs it, and the wordmark closes it. Three sizes:
 * post (4:5), story (9:16) and wide (16:9). No domain or URL.
 *
 * A post's mood reskins the card (haunted, cctv, classified, note) without
 * changing the layout; the default is HIDN's own green-on-black. */

import type { PostMood } from "./room-api";

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
  mood?: PostMood;
  /** When the post was made, for the CCTV timestamp. */
  time?: string;
}

/** Replies that fit on each size. */
export const SHARE_CARD_MAX_REPLIES: Record<ShareCardSize, number> = { post: 3, story: 3, wide: 1 };

const SANS = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
// No handwriting face is hosted yet; each platform's own handwriting font stands in.
const HAND = '"Caveat", "Noteworthy", "Bradley Hand", "Segoe Print", "Marker Felt", cursive';
const TAGLINE = "Say what you can't say out loud.";

/** A mood's palette and type. */
interface Skin {
  ground: string;
  ink: string;
  replyInk: string;
  accent: string;
  muted: string;
  dim: string;
  rule: string;
  hatch: string;
  hatchFill: string;
  panel: string;
  eye: string;
  thoughtFamily: string;
  thoughtWeight: number;
  /** Handwriting reads small; scale its size up. */
  thoughtScale: number;
  /** A soft glow behind the words (haunted). */
  glow?: string;
}

const PLAIN: Skin = {
  ground: "#010403", ink: "#eef5ef", replyInk: "#c9d8cb", accent: "#5dff8f", muted: "#8aa18e", dim: "#6f8f78",
  rule: "#0f2b1d", hatch: "#2c6a46", hatchFill: "#0b1f14", panel: "rgba(93, 255, 143, .035)", eye: "#e8f2e9",
  thoughtFamily: SANS, thoughtWeight: 500, thoughtScale: 1,
};

const SKINS: Record<PostMood, Skin> = {
  plain: PLAIN,
  haunted: { ...PLAIN, ground: "#020a05", ink: "#e8f5ec", glow: "rgba(93, 255, 143, .35)" },
  cctv: {
    ...PLAIN, ground: "#0c110e", ink: "#dfe7e1", replyInk: "#c3cdc6", accent: "#dfe7e1", muted: "#93a198", dim: "#93a198",
    rule: "#26302a", hatch: "#55615a", hatchFill: "#151c18", panel: "rgba(255, 255, 255, .03)", eye: "#dfe7e1",
    thoughtFamily: MONO,
  },
  classified: {
    ...PLAIN, ground: "#e9e4d2", ink: "#1b1a16", replyInk: "#33302a", accent: "#1b1a16", muted: "#5a5647", dim: "#5a5647",
    rule: "#b9b29a", hatch: "#1b1a16", hatchFill: "#1b1a16", panel: "rgba(27, 26, 22, .05)", eye: "#1b1a16",
    thoughtFamily: MONO,
  },
  note: {
    ...PLAIN, ground: "#f6f1e3", ink: "#1d2a4a", replyInk: "#2f3b5c", accent: "#1d2a4a", muted: "#4a5576", dim: "#5a6585",
    rule: "#c7d6ee", hatch: "#4a5576", hatchFill: "#e8e1cc", panel: "rgba(29, 42, 74, .05)", eye: "#1d2a4a",
    thoughtFamily: HAND, thoughtWeight: 600, thoughtScale: 1.3,
  },
};

const RED = "#b3261e";

let mood: PostMood = "plain";
let skin: Skin = PLAIN;

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

interface Block { lines: string[]; size: number; lead: number; family: string; weight: number }
interface ReplyBlock extends Block { }

function measure(ctx: CanvasRenderingContext2D, text: string, size: number, weight: number, width: number, lead: number, maxLines: number, family = SANS): Block {
  ctx.font = `${weight} ${size}px ${family}`;
  return { lines: clamp(ctx, wrap(ctx, text, width), maxLines, width), size, lead: size * lead, family, weight };
}

/** Signature: "signed ▨▨▨ name withheld". */
function signature(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, barW: number, align: "left" | "right" | "center"): void {
  ctx.font = `400 ${size}px ${MONO}`;
  const gap = size * 0.8;
  const a = ctx.measureText("signed").width;
  const b = ctx.measureText("name withheld").width;
  const total = a + gap + barW + gap + b;
  let left = align === "left" ? x : align === "right" ? x - total : x - total / 2;
  ctx.fillStyle = skin.dim;
  ctx.textAlign = "left";
  ctx.fillText("signed", left, y);
  left += a + gap;
  const barH = size * 1.15;
  const top = y - barH * 0.82;
  ctx.save();
  ctx.fillStyle = skin.hatchFill;
  ctx.fillRect(left, top, barW, barH);
  ctx.beginPath(); ctx.rect(left, top, barW, barH); ctx.clip();
  ctx.strokeStyle = skin.hatch;
  ctx.lineWidth = 1.5;
  for (let i = -barH; i < barW; i += 5.5) { ctx.beginPath(); ctx.moveTo(left + i, top + barH); ctx.lineTo(left + i + barH, top); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = skin.hatch;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, barW - 1, barH - 1);
  ctx.fillStyle = skin.dim;
  ctx.fillText("name withheld", left + barW + gap, y);
}

function roomLabel(ctx: CanvasRenderingContext2D, room: string, x: number, y: number, size: number, dot: boolean): void {
  ctx.font = `500 ${size}px ${SANS}`;
  ctx.fillStyle = mood === "classified" || mood === "note" ? skin.dim : skin.accent;
  ctx.textAlign = "left";
  if (dot) {
    const r = size * 0.25;
    ctx.save();
    if (mood === "cctv") {
      ctx.fillStyle = "#ff4d4d";
    } else if (mood === "plain" || mood === "haunted") {
      ctx.shadowColor = "rgba(93, 255, 143, .7)";
      ctx.shadowBlur = 10;
    }
    ctx.beginPath(); ctx.arc(x + r, y - size * 0.33, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    x += r * 2 + size * 0.57;
  }
  ctx.fillText(room, x, y);
}

function eye(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = skin.eye;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = skin.ground;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.41, 0, Math.PI * 2); ctx.fill();
}

function ground(ctx: CanvasRenderingContext2D, w: number, h: number, glowX: number, glowY: number): void {
  ctx.fillStyle = skin.ground;
  ctx.fillRect(0, 0, w, h);
  if (mood === "classified") return;
  if (mood === "note") {
    // Ruled notebook paper with a red margin.
    ctx.fillStyle = skin.rule;
    for (let line = 29; line < h; line += 30) ctx.fillRect(0, line, w, 1);
    return;
  }
  if (mood === "cctv") {
    ctx.fillStyle = "rgba(255, 255, 255, .045)";
    for (let line = 0; line < h; line += 3) ctx.fillRect(0, line, w, 1);
    return;
  }
  const corner = mood === "haunted";
  const gx = corner ? w * 0.9 : glowX;
  const gy = corner ? 0 : glowY;
  const glow = ctx.createRadialGradient(gx, gy, 10, gx, gy, Math.max(w, h) * 0.55);
  glow.addColorStop(0, corner ? "rgba(93, 255, 143, .11)" : "rgba(93, 255, 143, .065)");
  glow.addColorStop(1, "rgba(93, 255, 143, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(93, 255, 143, .025)";
  for (let line = 0; line < h; line += 4) ctx.fillRect(0, line, w, 1);
}

// The haunted cobweb, drawn from its mockup path (a 92×94 box, corner at top right).
const WEB = "M88 2 L2 6 M88 2 L14 46 M88 2 L38 80 M88 2 L70 92 M66.5 3 Q72 7 69.5 13 Q75 16 75.5 21.5 Q81 21 83.5 24.5 M45 4 Q56 12 51 24 Q63 26 63 41 Q74 36 79 47 M23.5 5 Q40 16 32.5 35 Q51 39 50.5 60.5 Q68 52 74.5 69.5 M2 6 Q20 22 14 46 Q34 56 38 80";

function cobweb(ctx: CanvasRenderingContext2D, w: number, size: number): void {
  if (typeof Path2D === "undefined") return;
  const k = size / 92;
  const web = new Path2D(WEB);
  ctx.save();
  ctx.translate(w - 92 * k, 0);
  ctx.scale(k, k);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(111, 216, 148, .55)";
  ctx.lineWidth = 0.8;
  ctx.stroke(web);
  // A second, offset pass makes it look sketched.
  ctx.translate(1.2, 0.8);
  ctx.strokeStyle = "rgba(111, 216, 148, .3)";
  ctx.lineWidth = 0.5;
  ctx.stroke(web);
  ctx.translate(-1.2, -0.8);
  ctx.strokeStyle = "rgba(111, 216, 148, .6)";
  ctx.beginPath(); ctx.moveTo(58, 30); ctx.lineTo(57, 58); ctx.stroke();
  ctx.fillStyle = "#8dffb0";
  ctx.strokeStyle = "rgba(141, 255, 176, .85)";
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.ellipse(57, 61.5, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.stroke(new Path2D("M55 60 l-4 -3 M55 62 l-5 0 M55 63.5 l-4 3 M59 60 l4 -3 M59 62 l5 0 M59 63.5 l4 3"));
  ctx.restore();
}

/** CCTV viewfinder corners. */
function corners(ctx: CanvasRenderingContext2D, w: number, h: number, inset: number, arm: number): void {
  ctx.save();
  ctx.strokeStyle = "#c9d4cc";
  ctx.lineWidth = 2;
  for (const [x, y, dx, dy] of [[inset, inset, 1, 1], [w - inset, inset, -1, 1], [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + arm * dy); ctx.lineTo(x, y); ctx.lineTo(x + arm * dx, y); ctx.stroke();
  }
  ctx.restore();
}

function cctvStamp(time?: string): string {
  const date = time ? new Date(time) : new Date();
  const value = Number.isNaN(date.getTime()) ? new Date() : date;
  return [value.getHours(), value.getMinutes(), value.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "● REC · CAM 03" heads-up line. */
function cctvHud(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, align: "left" | "center"): void {
  ctx.font = `500 ${size}px ${MONO}`;
  const r = size * 0.32;
  const width = r * 2 + size * 0.5 + ctx.measureText(label).width;
  const left = align === "left" ? x : x - width / 2;
  ctx.fillStyle = "#ff4d4d";
  ctx.beginPath(); ctx.arc(left + r, y - size * 0.34, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#c9d4cc";
  ctx.textAlign = "left";
  ctx.fillText(label, left + r * 2 + size * 0.5, y);
}

function fileNumber(reference: string): string {
  const code = reference.replace(/^THR-/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().padEnd(6, "0");
  return `FILE NO. ${code.slice(0, 4)}-${code.slice(4, 6)}`;
}

/** The red CLASSIFIED stamp, centred on (cx, cy). */
function stamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-4 * Math.PI / 180);
  ctx.font = `600 ${size}px ${MONO}`;
  const label = "CLASSIFIED";
  const tracking = size * 0.14;
  const textW = ctx.measureText(label).width + tracking * (label.length - 1);
  const padX = size * 0.6;
  const padY = size * 0.35;
  const boxW = textW + padX * 2;
  const boxH = size + padY * 2;
  ctx.strokeStyle = RED;
  ctx.lineWidth = size * 0.15;
  ctx.beginPath(); ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 3); ctx.stroke();
  ctx.fillStyle = RED;
  ctx.textAlign = "left";
  let x = -textW / 2;
  for (const char of label) { ctx.fillText(char, x, size * 0.36); x += ctx.measureText(char).width + tracking; }
  ctx.restore();
}

function dashedRule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.save();
  ctx.strokeStyle = skin.rule;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + w, y + 0.5); ctx.stroke();
  ctx.restore();
}

/** The note's red margin line and a strip of tape. */
function notePaper(ctx: CanvasRenderingContext2D, w: number, h: number, marginX: number): void {
  ctx.fillStyle = "#e58c8c";
  ctx.fillRect(marginX, 0, 1, h);
  ctx.save();
  ctx.translate(w / 2, 4);
  ctx.rotate(2 * Math.PI / 180);
  ctx.fillStyle = "rgba(250, 240, 190, .85)";
  ctx.fillRect(-w * 0.13, -14, w * 0.26, 30);
  ctx.restore();
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
  ctx.fillStyle = skin.panel;
  ctx.strokeStyle = skin.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
  let cy = y + pad;
  ctx.textAlign = "left";
  blocks.forEach((block, index) => {
    if (index) {
      cy += 14;
      ctx.fillStyle = skin.rule;
      ctx.fillRect(x + pad, cy, w - pad * 2, 1);
      cy += 15;
    }
    ctx.font = `400 ${labelSize}px ${MONO}`;
    ctx.fillStyle = skin.dim;
    ctx.fillText("reply · anonymous", x + pad, cy + labelSize);
    cy += labelSize * 1.3 + 4;
    ctx.font = `400 ${block.size}px ${SANS}`;
    ctx.fillStyle = skin.replyInk;
    for (const line of block.lines) { ctx.fillText(line, x + pad, cy + block.size * 1.05); cy += block.lead; }
  });
}

/** Sizes the thought and replies to the space they have, largest first. */
function fitContent(ctx: CanvasRenderingContext2D, text: string, replies: string[], width: number, space: number, maxThought: number, fixed: number, replyPad: number): { thought: Block; replyBlocks: ReplyBlock[]; height: number } {
  const scale = skin.thoughtScale;
  const minThought = Math.round(17 * scale);
  const top = Math.round(maxThought * (skin.thoughtFamily === MONO ? 0.86 : scale));
  for (let size = top; size >= minThought; size -= 1) {
    const replySize = Math.max(12.5, Math.min(17, (size / scale) * 0.56));
    const thought = measure(ctx, text, size, skin.thoughtWeight, width, skin.thoughtFamily === HAND ? 1.2 : 1.38, 40, skin.thoughtFamily);
    const replyBlocks = replies.map((reply) => measure(ctx, reply, replySize, 400, width - replyPad * 2, 1.5, 6));
    const panel = replyPanelHeight(replyBlocks, 11, replyPad);
    const height = fixed + thought.lines.length * thought.lead + (panel ? 28 + panel : 0);
    if (height <= space || size === minThought) {
      if (height > space) {
        // Still too tall at the smallest size: trim the thought to what fits.
        const room = space - fixed - (panel ? 28 + panel : 0);
        const maxLines = Math.max(2, Math.floor(room / thought.lead));
        ctx.font = `${skin.thoughtWeight} ${size}px ${skin.thoughtFamily}`;
        thought.lines = clamp(ctx, thought.lines, maxLines, width);
      }
      return { thought, replyBlocks, height: fixed + thought.lines.length * thought.lead + (panel ? 28 + panel : 0) };
    }
  }
  throw new Error("unreachable");
}

function drawThought(ctx: CanvasRenderingContext2D, thought: Block, x: number, y: number, align: "left" | "center"): number {
  ctx.save();
  ctx.font = `${thought.weight} ${thought.size}px ${thought.family}`;
  ctx.fillStyle = skin.ink;
  ctx.textAlign = align;
  if (skin.glow) { ctx.shadowColor = skin.glow; ctx.shadowBlur = 16; }
  for (const line of thought.lines) { ctx.fillText(line, x, y + thought.size * 1.02); y += thought.lead; }
  ctx.restore();
  ctx.textAlign = "left";
  return y;
}

function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.font = `600 ${size}px ${MONO}`;
  ctx.fillStyle = mood === "plain" || mood === "haunted" ? "#5dff8f" : skin.accent;
  ctx.fillText(">hidn", x, y);
}

function drawPost(ctx: CanvasRenderingContext2D, input: ShareCardInput, text: string, replies: string[]): void {
  const { w, h } = LAYOUTS.post;
  const padX = mood === "note" ? 60 : 44;
  ground(ctx, w, h, w / 2, h * 0.45);
  if (mood === "haunted") cobweb(ctx, w, 170);
  if (mood === "cctv") corners(ctx, w, h, 14, 24);
  if (mood === "note") notePaper(ctx, w, h, 40);

  if (mood === "cctv") {
    cctvHud(ctx, `REC · ${input.room}`, padX, 40 + 14, 13, "left");
    ctx.font = `500 13px ${MONO}`;
    ctx.fillStyle = "#c9d4cc";
    ctx.textAlign = "right";
    ctx.fillText(cctvStamp(input.time), w - padX, 40 + 14);
    ctx.textAlign = "left";
  } else if (mood === "classified") {
    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = skin.dim;
    ctx.fillText(fileNumber(input.reference), padX, 40 + 6);
    ctx.fillText(input.room.toUpperCase(), padX, 40 + 24);
    stamp(ctx, w - padX - 70, 40 + 10, 16);
    dashedRule(ctx, padX, 40 + 40, w - padX * 2);
  } else {
    roomLabel(ctx, input.room, padX, 40 + 15, 14, mood !== "note");
    if (mood !== "haunted") {
      ctx.font = `400 12px ${MONO}`;
      ctx.fillStyle = skin.dim;
      ctx.textAlign = "right";
      ctx.fillText(input.mark, w - padX, 40 + 14);
      ctx.textAlign = "left";
    }
  }

  const footerTop = h - 36 - 48 - 20;
  const top = 40 + (mood === "classified" ? 50 : 30);
  const space = footerTop - top - 20;
  const width = w - padX * 2;
  const fit = fitContent(ctx, text, replies, width, space, replies.length ? 30 : 34, 14 + 22, 20);
  let y = top + (space - fit.height) / 2;
  signature(ctx, padX, y + 12, 12, 92, "left");
  y = drawThought(ctx, fit.thought, padX, y + 14 + 22, "left");
  drawReplyPanel(ctx, fit.replyBlocks, padX, y + 28, width, 11, 20);

  if (mood === "classified") dashedRule(ctx, padX, footerTop, width);
  else { ctx.fillStyle = skin.rule; ctx.fillRect(padX, footerTop, width, 1); }
  wordmark(ctx, padX, footerTop + 20 + 21, 22);
  ctx.font = `400 13px ${SANS}`;
  ctx.fillStyle = skin.muted;
  ctx.fillText(TAGLINE, padX, footerTop + 20 + 22 + 6 + 14);
  ctx.font = `400 12px ${MONO}`;
  ctx.fillStyle = skin.dim;
  ctx.textAlign = "right";
  ctx.fillText("zero knowledge", w - padX, footerTop + 20 + 22 + 6 + 14);
  ctx.textAlign = "left";
}

function drawStory(ctx: CanvasRenderingContext2D, input: ShareCardInput, text: string, replies: string[]): void {
  const { w, h } = LAYOUTS.story;
  const padX = mood === "note" ? 48 : 34;
  ground(ctx, w, h, w / 2, h / 2);
  if (mood === "haunted") cobweb(ctx, w, 150);
  if (mood === "cctv") {
    corners(ctx, w, h, 14, 22);
    cctvHud(ctx, `REC · CAM 03   ${cctvStamp(input.time)}`, w / 2, 56, 12, "center");
  }
  if (mood === "note") notePaper(ctx, w, h, 30);

  if (mood === "classified") {
    stamp(ctx, w / 2, 104 + 17, 18);
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = skin.dim;
    ctx.textAlign = "center";
    ctx.fillText(fileNumber(input.reference), w / 2, 64);
  } else {
    eye(ctx, w / 2 - 20, 104 + 17, 17);
    eye(ctx, w / 2 + 20, 104 + 17, 17);
  }
  ctx.font = `500 13px ${SANS}`;
  ctx.fillStyle = mood === "classified" || mood === "note" ? skin.dim : skin.accent;
  ctx.textAlign = "center";
  ctx.fillText(input.room, w / 2, 104 + 34 + 16 + 13);

  const top = 104 + 34 + 16 + 20 + 24;
  const footerTop = h - 112 - 46;
  const space = footerTop - top - 24;
  const width = w - padX * 2;
  const fit = fitContent(ctx, text, replies, width, space, replies.length ? 25 : 29, 20 + 14, 18);
  let y = top + (space - fit.height) / 2;
  y = drawThought(ctx, fit.thought, w / 2 + (mood === "note" ? 7 : 0), y, "center");
  signature(ctx, w / 2, y + 20 + 11, 11, 70, "center");
  drawReplyPanel(ctx, fit.replyBlocks, padX, y + 20 + 14 + 28, width, 11, 18);

  ctx.textAlign = "center";
  wordmark(ctx, w / 2, footerTop + 20, 20);
  ctx.font = `400 13px ${SANS}`;
  ctx.fillStyle = skin.muted;
  ctx.textAlign = "center";
  ctx.fillText(TAGLINE, w / 2, footerTop + 20 + 6 + 15);
  ctx.textAlign = "left";
}

function drawWide(ctx: CanvasRenderingContext2D, input: ShareCardInput, text: string, replies: string[]): void {
  const { w, h } = LAYOUTS.wide;
  const padX = mood === "note" ? 52 : 36;
  ground(ctx, w, h, w * 0.4, h / 2);
  if (mood === "haunted") cobweb(ctx, w, 120);
  if (mood === "cctv") corners(ctx, w, h, 10, 18);
  if (mood === "note") notePaper(ctx, w, h, 36);

  if (mood === "cctv") {
    cctvHud(ctx, `REC · ${input.room}   ${cctvStamp(input.time)}`, padX, 30 + 12, 11, "left");
    signature(ctx, w - padX, 30 + 12, 11, 60, "right");
  } else if (mood === "classified") {
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = skin.dim;
    ctx.fillText(`${fileNumber(input.reference)} · ${input.room.toUpperCase()}`, padX, 30 + 12);
    stamp(ctx, w - padX - 62, 30 + 8, 14);
  } else {
    roomLabel(ctx, input.room, padX, 30 + 13, 13, mood !== "note");
    if (mood !== "haunted") signature(ctx, w - padX, 30 + 12, 11, 60, "right");
  }

  const footerTop = h - 26 - 22 - 14;
  const top = 30 + 26;
  const space = footerTop - top - 14;
  const width = w - padX * 2 - (mood === "haunted" ? 40 : 0);
  const fit = fitContent(ctx, text, replies.slice(0, 1), width, space, replies.length ? 24 : 30, 0, 16);
  let y = top + (space - fit.height) / 2;
  y = drawThought(ctx, fit.thought, padX, y, "left");
  drawReplyPanel(ctx, fit.replyBlocks, padX, y + 28, w - padX * 2, 11, 16);

  if (mood === "classified") dashedRule(ctx, padX, footerTop, w - padX * 2);
  else { ctx.fillStyle = skin.rule; ctx.fillRect(padX, footerTop, w - padX * 2, 1); }
  wordmark(ctx, padX, footerTop + 14 + 17, 18);
  if (mood === "classified" || mood === "haunted") {
    signature(ctx, w - padX, footerTop + 14 + 16, 11, 60, "right");
  } else {
    ctx.font = `400 12px ${SANS}`;
    ctx.fillStyle = skin.muted;
    ctx.textAlign = "right";
    ctx.fillText(TAGLINE, w - padX, footerTop + 14 + 16);
  }
  ctx.textAlign = "left";
}

/** Waits for the self-hosted Plex faces so the canvas never falls back mid-draw. */
async function loadFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`500 34px ${SANS}`),
    document.fonts.load(`400 17px ${SANS}`),
    document.fonts.load(`400 12px ${MONO}`),
    document.fonts.load(`500 20px ${MONO}`),
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
  // Drawing below is synchronous, so the mood set here can't leak into another card.
  mood = input.mood && input.mood in SKINS ? input.mood : "plain";
  skin = SKINS[mood];
  if (size === "story") drawStory(ctx, input, text, replies);
  else if (size === "wide") drawWide(ctx, input, text, replies);
  else drawPost(ctx, input, text, replies);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The thread image could not be created."))), "image/png");
  });
}
