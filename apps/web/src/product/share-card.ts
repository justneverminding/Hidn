/** Shareable thought card: a terminal window in phosphor green. The thought
 * prints as a terminal session, signed with a hatched black redaction and a
 * partly withheld hash instead of a name. 4:5 for phones. */

export interface ShareCardInput {
  text: string;
  replies: string[];
  room: string;
  reference: string;
  /** Short code shown in the corner, e.g. "// 6B60604E". No domain or URL. */
  mark: string;
  theme: "signal" | "quiet";
}

const WIDTH = 1080;
const M = 64;
const PAD = 56;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const PHOSPHOR = "#7dff9a";
const PALE = "#c4f7cc";
const DIM = "rgba(125, 255, 154, .55)";
const GROUND = "#020502";

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

/** Largest mono size at which `text` fits; truncates at the minimum. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number, max: number, min: number): { lines: string[]; size: number } {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `500 ${size}px ${MONO}`;
    const lines = wrap(ctx, text, width);
    if (lines.length <= maxLines) return { lines, size };
  }
  ctx.font = `500 ${min}px ${MONO}`;
  const lines = wrap(ctx, text, width).slice(0, maxLines);
  let last = lines[maxLines - 1] ?? "";
  while (ctx.measureText(`${last}…`).width > width && last.length > 1) last = last.slice(0, -1).trimEnd();
  lines[maxLines - 1] = `${last}…`;
  return { lines, size: min };
}

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = PHOSPHOR, blur = 14): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(125, 255, 154, .55)";
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A black redaction block with diagonal hatching and a phosphor outline. */
function redaction(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(125, 255, 154, .38)";
  ctx.lineWidth = 2;
  for (let i = -h; i < w; i += 9) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = "rgba(125, 255, 154, .6)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
}

/** A display-only digest of the reference, so each card has its own mark. */
function displayHash(seedText: string): string {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (const char of seedText) {
    a = Math.imul(a ^ char.charCodeAt(0), 0x01000193) >>> 0;
    b = Math.imul(b ^ char.charCodeAt(0), 0x85ebca6b) >>> 0;
  }
  return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")).slice(0, 16);
}

export function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas rendering is unavailable."));

  // Measure the words first; the card's height follows the content.
  const winW = WIDTH - M * 2;
  const x = M + PAD;
  const textWidth = winW - PAD * 2 - 80;
  const replies = input.replies.filter((reply) => reply.trim()).slice(0, 3);
  const text = input.text.replace(/\s+/g, " ").trim();
  const largest = replies.length ? 40 : text.length < 60 ? 60 : text.length < 140 ? 48 : 40;
  const thought = fit(ctx, text, textWidth, 16, largest, 26);
  const thoughtLead = Math.round(thought.size * 1.42);
  const replyBlocks = replies.map((reply) => {
    const block = fit(ctx, reply.replace(/\s+/g, " ").trim(), textWidth, 5, 30, 22);
    return { ...block, lead: Math.round(block.size * 1.42) };
  });
  const blockHeight = thought.lines.length * thoughtLead
    + replyBlocks.reduce((sum, block) => sum + 22 + block.lines.length * block.lead, 0);
  // Title bar, command and header, the thought with breathing room, signature.
  const winH = 58 + 70 + 70 + blockHeight + 70 + 210;
  const HEIGHT = Math.min(1600, Math.max(760, 120 + winH + 150));
  canvas.height = HEIGHT;
  ctx.textBaseline = "alphabetic";

  // Ground with a faint phosphor bloom.
  ctx.fillStyle = "#010301";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const bloom = ctx.createRadialGradient(WIDTH / 2, HEIGHT * .45, 40, WIDTH / 2, HEIGHT * .45, 900);
  bloom.addColorStop(0, "rgba(60, 160, 80, .12)");
  bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Terminal window: Mac-style title bar over a dark pane.
  const win = { x: M, y: 120, w: winW, h: HEIGHT - 120 - 150 };
  ctx.fillStyle = GROUND;
  ctx.fillRect(win.x, win.y, win.w, win.h);
  ctx.fillStyle = "#0c160f";
  ctx.fillRect(win.x, win.y, win.w, 58);
  ctx.strokeStyle = "rgba(125, 255, 154, .35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(win.x + 1, win.y + 1, win.w - 2, win.h - 2);
  ctx.beginPath(); ctx.moveTo(win.x, win.y + 58); ctx.lineTo(win.x + win.w, win.y + 58); ctx.stroke();
  ["#f05e62", "#dba74a", "#5bdb81"].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(win.x + 30 + i * 26, win.y + 29, 8, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = "rgba(200, 240, 205, .6)";
  ctx.font = `20px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText("hidn@room: ~/thread", win.x + win.w / 2, win.y + 36);
  ctx.textAlign = "left";

  // Session: header, the thought, replies, signature and hash.
  let y = win.y + 58 + 70;
  ctx.font = `500 22px ${MONO}`;
  glowText(ctx, `/// TRANSMISSION // ${input.room.toUpperCase()}`, x, y, PALE, 8);

  // Centre the thought block in the space above the signature.
  const signatureTop = win.y + win.h - 210;
  y = Math.max(y + 60, y + 40 + (signatureTop - y - 40 - blockHeight) / 2) + thought.size * .8;
  ctx.font = `500 ${thought.size}px ${MONO}`;
  // The prompt's indent scales with the type so it never touches the words.
  const indent = Math.round(thought.size * 1.3);
  thought.lines.forEach((line, index) => {
    if (index === 0) glowText(ctx, ">", x, y);
    glowText(ctx, line, x + indent, y);
    y += thoughtLead;
  });
  for (const block of replyBlocks) {
    y += 22;
    ctx.font = `500 ${block.size}px ${MONO}`;
    block.lines.forEach((line, index) => {
      if (index === 0) glowText(ctx, ">>", x, y, DIM, 8);
      glowText(ctx, line, x + Math.round(block.size * 1.9), y, DIM, 8);
      y += block.lead;
    });
  }

  // Signature: a rule, then the name and the hash, both withheld.
  ctx.save();
  ctx.strokeStyle = "rgba(125, 255, 154, .3)";
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(x, signatureTop); ctx.lineTo(win.x + win.w - PAD, signatureTop); ctx.stroke();
  ctx.restore();
  ctx.font = `500 24px ${MONO}`;
  const labelWidth = ctx.measureText("> SIGNED: ").width;
  let lineY = signatureTop + 66;
  glowText(ctx, "> SIGNED:", x, lineY, PALE, 8);
  redaction(ctx, x + labelWidth + 10, lineY - 26, 300, 34);
  ctx.font = `500 18px ${MONO}`;
  glowText(ctx, "[ NAME WITHHELD ]", x + labelWidth + 330, lineY - 3, DIM, 6);

  lineY += 58;
  ctx.font = `500 24px ${MONO}`;
  glowText(ctx, "> HASH:", x, lineY, PALE, 8);
  const hash = displayHash(input.reference);
  const hashX = x + labelWidth + 10;
  ctx.font = `500 24px ${MONO}`;
  const head = `${hash.slice(0, 4)} ${hash.slice(4, 8)}`;
  glowText(ctx, head, hashX, lineY, PHOSPHOR, 8);
  const headWidth = ctx.measureText(`${head} `).width;
  redaction(ctx, hashX + headWidth, lineY - 26, 170, 34);
  glowText(ctx, hash.slice(12, 16), hashX + headWidth + 186, lineY, PHOSPHOR, 8);
  ctx.font = `500 24px ${MONO}`;
  glowText(ctx, "▌", x, lineY + 58, PHOSPHOR, 10);

  // Footer outside the window.
  ctx.font = `500 22px ${MONO}`;
  glowText(ctx, "SOME THOUGHTS ARE MEANT TO BE HIDN", M, HEIGHT - 70, DIM, 8);
  ctx.textAlign = "right";
  glowText(ctx, input.mark, WIDTH - M, HEIGHT - 70, DIM, 8);
  ctx.textAlign = "left";
  ctx.font = `500 22px ${MONO}`;
  glowText(ctx, "A ROOM WITHOUT NAMES.", M, 76, PALE, 10);

  // CRT glass: scanlines over everything.
  ctx.fillStyle = "rgba(0, 0, 0, .22)";
  for (let line = 0; line < HEIGHT; line += 4) ctx.fillRect(0, line, WIDTH, 1);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The thread image could not be created."))), "image/png");
  });
}
