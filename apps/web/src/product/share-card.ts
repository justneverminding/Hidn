import { ASSEMBLY, drawDitheredEye } from "./terminal-gate";

/** Shareable thought card: a terminal poster in phosphor green. A dithered
 * eye watches from the top panel; the thought prints below as terminal
 * lines, signed with a redaction instead of a name. 4:5 for phones. */

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
const HEIGHT = 1350;
const M = 64;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const PHOSPHOR = "#7dff9a";
const PALE = "#c4f7cc";
const DIM = "rgba(125, 255, 154, .55)";
const GROUND = "#030703";

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

function dashedRule(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.save();
  ctx.strokeStyle = DIM;
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(WIDTH - M, y); ctx.stroke();
  ctx.restore();
}

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = PHOSPHOR): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(125, 255, 154, .55)";
  ctx.shadowBlur = 14;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Each thought's eye looks a slightly different way. */
function seededGaze(seedText: string): { gazeX: number; gazeY: number } {
  let seed = 7;
  for (const char of seedText) seed = (seed * 31 + char.charCodeAt(0)) % 2147483647;
  const a = (seed % 1000) / 1000, b = ((seed >> 10) % 1000) / 1000;
  return { gazeX: (a - .5) * .1, gazeY: (b - .5) * .04 };
}

export function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas rendering is unavailable."));
  ctx.textBaseline = "alphabetic";

  // Ground: deep phosphor black with a faint centre glow.
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT * .42, 40, WIDTH / 2, HEIGHT * .42, 900);
  glow.addColorStop(0, "rgba(60, 160, 80, .14)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header: an eye mark and the room's line, between dashed rules.
  dashedRule(ctx, 70);
  dashedRule(ctx, 128);
  ctx.strokeStyle = PHOSPHOR;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(M + 22, 99, 20, 12, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = PHOSPHOR;
  ctx.beginPath(); ctx.arc(M + 22, 99, 6, 0, Math.PI * 2); ctx.fill();
  ctx.font = `500 24px ${MONO}`;
  glowText(ctx, "A ROOM WITHOUT NAMES. // HIDN://ROOM", M + 64, 108);

  // Measure the words first; the eye takes whatever height they leave.
  const textWidth = WIDTH - M * 2 - 60 - 52;
  const replies = input.replies.filter((reply) => reply.trim()).slice(0, 2);
  const text = input.text.replace(/\s+/g, " ").trim();
  const largest = replies.length ? 34 : text.length < 60 ? 58 : text.length < 120 ? 46 : 38;
  const thought = fit(ctx, text, textWidth, replies.length ? 6 : 10, largest, 22);
  const thoughtLead = Math.round(thought.size * 1.42);
  const replyBlocks = replies.map((reply) => {
    const block = fit(ctx, reply.replace(/\s+/g, " ").trim(), textWidth, 2, 28, 20);
    return { ...block, lead: Math.round(block.size * 1.42) };
  });
  const contentHeight = 30 + thought.lines.length * thoughtLead
    + replyBlocks.reduce((sum, block) => sum + 14 + block.lines.length * block.lead, 0) + 70;
  const boxHeight = Math.min(620, Math.max(260, contentHeight));
  const panelHeight = HEIGHT - 156 - 22 - 44 - 22 - boxHeight - 112;

  // The watching eye, dithered and tinted phosphor green.
  const panel = { x: M, y: 156, w: WIDTH - M * 2, h: panelHeight };
  const eyeCanvas = document.createElement("canvas");
  eyeCanvas.width = 360;
  eyeCanvas.height = 270;
  const eyeContext = eyeCanvas.getContext("2d");
  if (eyeContext) {
    drawDitheredEye(eyeContext, { ...seededGaze(input.reference), openness: 1 });
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const sourceHeight = 360 * panel.h / panel.w;
    ctx.drawImage(eyeCanvas, 0, (270 - sourceHeight) / 2, 360, sourceHeight, panel.x, panel.y, panel.w, panel.h);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = PALE;
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.restore();
  }
  // Assembly column, thumbnail grid and label inside the panel.
  ctx.save();
  ctx.beginPath(); ctx.rect(panel.x, panel.y, panel.w, panel.h); ctx.clip();
  ctx.fillStyle = "rgba(125, 255, 154, .5)";
  ctx.font = `15px ${MONO}`;
  ctx.textAlign = "right";
  for (let i = 0; i < 22; i++) ctx.fillText(ASSEMBLY[(i * 7 + input.reference.length) % ASSEMBLY.length], panel.x + panel.w - 18, panel.y + 70 + i * 21);
  ctx.textAlign = "left";
  ctx.strokeStyle = PHOSPHOR;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) ctx.strokeRect(panel.x + panel.w - 3 * 46 + (i % 3) * 46, panel.y + Math.floor(i / 3) * 32, 46, 32);
  ctx.font = `500 40px ${MONO}`;
  glowText(ctx, "hidn://room", panel.x + 40, panel.y + panel.h - 40, "#a8ffbb");
  ctx.restore();
  ctx.strokeStyle = PHOSPHOR;
  ctx.lineWidth = 3;
  ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);

  // Solid bar: what this is, where it was said, and by whom (no one).
  const barY = panel.y + panel.h + 22;
  ctx.fillStyle = PALE;
  ctx.fillRect(M, barY, WIDTH - M * 2, 44);
  ctx.fillStyle = GROUND;
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText(`TRANSMISSION // ${input.room.toUpperCase()} // NAME WITHHELD`, M + 18, barY + 29);

  // Terminal box: the thought, replies, and a redacted signature.
  const box = { x: M, y: barY + 66, w: WIDTH - M * 2, h: boxHeight };
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  const textX = box.x + 30;
  let y = box.y + 30 + thought.size;
  ctx.font = `500 ${thought.size}px ${MONO}`;
  thought.lines.forEach((line, index) => {
    if (index === 0) glowText(ctx, ">", textX, y);
    glowText(ctx, line, textX + 52, y);
    y += thoughtLead;
  });
  for (const block of replyBlocks) {
    y += 14;
    ctx.font = `500 ${block.size}px ${MONO}`;
    block.lines.forEach((line, index) => {
      if (index === 0) glowText(ctx, ">>", textX, y, DIM);
      glowText(ctx, line, textX + 52, y, DIM);
      y += block.lead;
    });
  }
  const signY = Math.min(box.y + box.h - 28, y + 22);
  ctx.font = `500 22px ${MONO}`;
  glowText(ctx, "> SIGNED:", textX, signY, DIM);
  ctx.fillStyle = PALE;
  ctx.fillRect(textX + 150, signY - 20, 230, 26);

  // Footer.
  dashedRule(ctx, HEIGHT - 84);
  ctx.font = `500 20px ${MONO}`;
  glowText(ctx, "THERE'S NO PLACE LIKE HIDN://ROOM", M, HEIGHT - 44, DIM);
  ctx.textAlign = "right";
  glowText(ctx, input.mark, WIDTH - M, HEIGHT - 44, DIM);
  ctx.textAlign = "left";

  // CRT glass: scanlines over everything.
  ctx.fillStyle = "rgba(0, 0, 0, .22)";
  for (let line = 0; line < HEIGHT; line += 4) ctx.fillRect(0, line, WIDTH, 1);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The thread image could not be created."))), "image/png");
  });
}
