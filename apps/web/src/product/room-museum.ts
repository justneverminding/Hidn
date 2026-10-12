import * as THREE from "three";
import {
  createMuseumLayout,
  canWalk,
  galleryAt,
  museumWalkingPath,
  type GalleryDefinition,
  type GalleryLayout,
  type MuseumTheme,
} from "./museum-layout";
import { fetchShieldedScanStats, type ShieldedScanStats } from "./shieldedscan";

export interface MuseumPost {
  id?: string;
  text: string;
  category?: string;
  time: string;
  roomKey?: string;
  roomLabel?: string;
}

export interface MuseumGallery extends GalleryDefinition {
  roomIndex?: number;
  posts: MuseumPost[];
}

interface MuseumOptions {
  foyer?: boolean;
  privateFoyer?: boolean;
  roomMode?: "hub" | "gallery";
  galleries?: MuseumGallery[];
  onActivity?: () => void;
  onGalleryEnter?: (gallery: MuseumGallery) => void;
  onReturnToMain?: () => void;
  onEnter?: (beginEntry: (complete: () => void) => void) => void;
}

interface Exhibit {
  group: THREE.Group;
  surface: THREE.Mesh;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  post: MuseumPost;
  frameWidth: number;
}

type MuseumCardStyle = "archive" | "paper" | "signal" | "blueprint" | "label";

interface MuseumCardLayout {
  width: number;
  height: number;
  style: MuseumCardStyle;
}

interface MuseumPlacement {
  post?: MuseumPost;
  x: number;
  y?: number;
  z: number;
  angle: number;
}

interface ProofDisplay {
  screenMaterial: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  glitchBar: THREE.Mesh;
  phase: number;
}

interface ShieldedScreen {
  screenMaterial: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  glitchBar: THREE.Mesh;
  phase: number;
}

const EYE_HEIGHT = 1.7;
const HALF_WIDTH = 12;
const initialView = { x: 0, z: 7.2, yaw: 0, pitch: -0.035, fov: 66 };
let savedView = { ...initialView };
const foyerInitialView = { x: 0, z: 0, yaw: 0, pitch: .035, fov: 68 };
let foyerView = { ...foyerInitialView };

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The gallery text could not be drawn.");
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      // Long URLs and unbroken text still have to fit inside the physical frame.
      const parts = ctx.measureText(word).width > width ? Array.from(word) : [word];
      for (const part of parts) {
        const next = line ? `${line}${parts.length === 1 ? " " : ""}${part}` : part;
        if (ctx.measureText(next).width > width && line) {
          lines.push(line);
          line = part;
        } else line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function museumCardLayout(post: MuseumPost, index: number): MuseumCardLayout {
  const source = `${post.id ?? ""}${post.text}`;
  const hash = Array.from(source).reduce((total, character) => total + character.charCodeAt(0), 0);
  const styles: MuseumCardStyle[] = ["archive", "paper", "signal", "blueprint", "label"];
  const style = styles[(hash + index) % styles.length];
  const length = post.text.trim().length;
  const estimatedCharactersPerLine = style === "label" ? 48 : style === "paper" ? 34 : 39;
  const estimatedLines = Math.max(2, Math.ceil(length / estimatedCharactersPerLine));
  const width = style === "label"
    ? Math.min(3.05, 2.55 + length * .0025)
    : style === "paper"
      ? Math.min(2.9, 2.2 + length * .0035)
      : style === "blueprint"
        ? Math.min(2.85, 2.45 + length * .0025)
        : style === "signal"
          ? Math.min(2.7, 2.05 + length * .0025)
          : Math.min(2.85, 2.25 + length * .003);
  const styleOffset = style === "paper" ? .24 : style === "blueprint" ? .16 : style === "label" ? -.1 : .06;
  const height = Math.min(2.65, Math.max(1.5, 1.3 + estimatedLines * .22 + styleOffset));
  return { width, height, style };
}

function postTexture(post: MuseumPost, index: number, signal: boolean, theme?: MuseumTheme): THREE.CanvasTexture {
  const layout = museumCardLayout(post, index);
  const canvasWidth = 1024;
  const canvasHeight = Math.max(520, Math.round(canvasWidth * layout.height / layout.width));
  return canvasTexture(canvasWidth, canvasHeight, (ctx) => {
    // Keep color in the room lighting. The wall works and their frames use a
    // restrained neutral palette so a themed room never paints the furniture
    // red, purple, or blue.
    const accent = signal ? "#b7c9b5" : "#c9c9bc";
    const trim = "#566159";
    const isPaper = layout.style === "paper";
    const isBlueprint = layout.style === "blueprint";
    const isSignal = layout.style === "signal";
    const isLabel = layout.style === "label";
    const background = isPaper ? "#d7d4c5" : isBlueprint ? "#182733" : isSignal ? "#07150f" : "#0c1511";
    const ink = isPaper ? "#18231b" : isBlueprint ? "#d3e3e4" : "#e9e7d9";
    const mutedInk = isPaper ? "#526155" : isBlueprint ? "#8ca9aa" : "#94a89b";
    const pad = isLabel ? 64 : 72;
    const footerHeight = isLabel ? 72 : 104;
    const contentTop = isLabel ? 162 : 198;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (isPaper) {
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.fillRect(28, 28, canvasWidth - 56, canvasHeight - 56);
      ctx.fillStyle = "rgba(36,52,40,.09)";
      ctx.fillRect(48, 48, canvasWidth - 96, canvasHeight - 96);
    } else if (isBlueprint) {
      ctx.strokeStyle = "rgba(164,206,207,.12)";
      ctx.lineWidth = 2;
      for (let x = 30; x < canvasWidth; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasHeight); ctx.stroke();
      }
      for (let y = 30; y < canvasHeight; y += 48) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y); ctx.stroke();
      }
    } else if (isSignal) {
      ctx.fillStyle = "rgba(116,200,139,.12)";
      ctx.fillRect(36, 36, 14, canvasHeight - 72);
      ctx.strokeStyle = "rgba(116,200,139,.12)";
      ctx.lineWidth = 1;
      for (let y = 14; y < canvasHeight; y += 18) {
        ctx.beginPath(); ctx.moveTo(72, y); ctx.lineTo(canvasWidth - 72, y); ctx.stroke();
      }
    }

    ctx.strokeStyle = trim;
    ctx.lineWidth = isLabel ? 3 : 5;
    ctx.strokeRect(36, 36, canvasWidth - 72, canvasHeight - 72);
    if (!isLabel) {
      ctx.lineWidth = 2;
      ctx.strokeRect(54, 54, canvasWidth - 108, canvasHeight - 108);
    }

    ctx.fillStyle = accent;
    ctx.font = `${isLabel ? 20 : 22}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText(`HIDN / ${String(index + 1).padStart(2, "0")}`, pad, 105);
    ctx.textAlign = "right";
    ctx.fillText((post.roomLabel ? `${post.roomLabel} / ` : "") + (post.category ?? "THOUGHT").toUpperCase().slice(0, 26), canvasWidth - pad, 105);
    ctx.textAlign = isLabel ? "center" : "left";
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad, 138); ctx.lineTo(canvasWidth - pad, 138); ctx.stroke();

    let fontSize = isPaper ? 54 : isBlueprint ? 48 : isLabel ? 48 : 54;
    let lines: string[] = [];
    const contentWidth = canvasWidth - pad * 2;
    const availableHeight = canvasHeight - contentTop - footerHeight;
    do {
      ctx.font = `${fontSize}px ${isPaper ? "Georgia, serif" : "Georgia, serif"}`;
      lines = wrapText(ctx, post.text, contentWidth);
      if (lines.length * fontSize * 1.24 <= availableHeight || fontSize <= 24) break;
      fontSize -= 2;
    } while (fontSize > 0);
    const maxLines = Math.max(1, Math.floor(availableHeight / (fontSize * 1.24)));
    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines && visibleLines.length) {
      let lastLine = visibleLines[maxLines - 1];
      while (ctx.measureText(`${lastLine}…`).width > contentWidth && lastLine.length > 1) lastLine = lastLine.slice(0, -1);
      visibleLines[maxLines - 1] = `${lastLine}…`;
    }
    ctx.fillStyle = ink;
    ctx.font = `${fontSize}px Georgia, serif`;
    const lineHeight = fontSize * 1.24;
    const textTop = contentTop + Math.max(fontSize, (availableHeight - visibleLines.length * lineHeight) / 2 + fontSize);
    visibleLines.forEach((line, lineIndex) => {
      ctx.fillText(line, isLabel ? canvasWidth / 2 : pad, textTop + lineIndex * lineHeight);
    });

    ctx.strokeStyle = trim;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad, canvasHeight - footerHeight); ctx.lineTo(canvasWidth - pad, canvasHeight - footerHeight); ctx.stroke();
    ctx.fillStyle = mutedInk;
    ctx.font = "20px monospace";
    ctx.textAlign = "left";
    ctx.fillText(isPaper ? "FOUND / UNNAMED" : isBlueprint ? "ARCHIVE / UNNAMED" : "WITHOUT A NAME", pad, canvasHeight - 52);
    ctx.textAlign = "right";
    ctx.fillText(isSignal ? "SIGNAL / READ →" : "TAP TO READ →", canvasWidth - pad, canvasHeight - 52);

    if (isPaper) {
      ctx.fillStyle = accent;
      ctx.fillRect(canvasWidth - 116, 34, 54, 10);
      ctx.fillRect(canvasWidth - 82, 34, 20, 42);
    } else if (isBlueprint) {
      ctx.fillStyle = accent;
      ctx.fillRect(66, canvasHeight - footerHeight + 18, 72, 5);
    } else if (isSignal) {
      ctx.fillStyle = accent;
      ctx.fillRect(canvasWidth - 84, 66, 16, canvasHeight - 132);
    }
  });
}

function exhibitionPanelTexture(title: string, body: string, index: number, _theme?: MuseumTheme): THREE.CanvasTexture {
  const width = 768;
  const height = 1240;
  // Exhibition hardware stays in HIDN's neutral reading palette. Room themes
  // can shape the architecture, but they should not turn the museum panels
  // into colored advertisements or warning lights.
  const accent = "#b7c9b5";
  const glow = "#8fb69a";
  return canvasTexture(width, height, (ctx) => {
    const variant = index % 3;
    ctx.fillStyle = "#101813";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(215, 229, 205, .035)";
    ctx.fillRect(28, 28, width - 56, height - 56);
    ctx.fillStyle = "rgba(143, 182, 154, .08)";
    ctx.fillRect(44, 44, 10, height - 88);
    ctx.strokeStyle = "rgba(184, 211, 187, .24)";
    ctx.lineWidth = 3;
    ctx.strokeRect(34, 34, width - 68, height - 68);
    ctx.strokeStyle = "rgba(184, 211, 187, .1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(56, 56, width - 112, height - 112);
    if (variant === 1) {
      ctx.fillStyle = "rgba(241, 195, 91, .08)";
      ctx.fillRect(58, 176, width - 116, 18);
      ctx.strokeStyle = "rgba(241, 195, 91, .14)";
      for (let y = 220; y < height - 220; y += 76) {
        ctx.beginPath(); ctx.moveTo(72, y); ctx.lineTo(width - 72, y); ctx.stroke();
      }
    } else if (variant === 2) {
      ctx.strokeStyle = "rgba(143, 182, 154, .12)";
      for (let x = 72; x < width - 72; x += 54) {
        ctx.beginPath(); ctx.moveTo(x, 176); ctx.lineTo(x, height - 190); ctx.stroke();
      }
      for (let y = 202; y < height - 190; y += 54) {
        ctx.beginPath(); ctx.moveTo(72, y); ctx.lineTo(width - 72, y); ctx.stroke();
      }
    }

    ctx.fillStyle = accent;
    ctx.font = "20px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`HIDN / EXHIBITION ${String(index + 1).padStart(2, "0")}`, 78, 104);
    ctx.textAlign = "right";
    ctx.fillText("UNNAMED / OPEN ARCHIVE", width - 78, 104);
    ctx.strokeStyle = glow;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(78, 142); ctx.lineTo(width - 78, 142); ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#edf0e5";
    ctx.font = "600 54px Georgia, serif";
    const titleLines = wrapText(ctx, title.toUpperCase(), width - 156).slice(0, 4);
    titleLines.forEach((line, lineIndex) => ctx.fillText(line, 78, 238 + lineIndex * 62));

    ctx.fillStyle = "#b9c9bb";
    ctx.font = "27px monospace";
    const bodyLines = wrapText(ctx, body, width - 156).slice(0, 13);
    const bodyTop = 238 + titleLines.length * 62 + 72;
    bodyLines.forEach((line, lineIndex) => ctx.fillText(line, 78, bodyTop + lineIndex * 38));

    ctx.strokeStyle = "rgba(184, 211, 187, .18)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(78, height - 166); ctx.lineTo(width - 78, height - 166); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = "18px monospace";
    ctx.fillText("THE PERSON STAYS HIDDEN", 78, height - 112);
    ctx.textAlign = "right";
    ctx.fillText("READ / MOVE / RETURN", width - 78, height - 112);
  });
}

/**
 * A local exhibition texture inspired by shielded-proof explorers. It is
 * intentionally sample data: HIDN should not imply that it has fetched or
 * verified a live NFT until a real source is wired in.
 */
function proofArtifactTexture(index: number): THREE.CanvasTexture {
  const width = 768;
  const height = 432;
  const accents = ["#b8dc68", "#86c6ba", "#d0c78d"];
  const accent = accents[index % accents.length];
  const kind = index % 3;
  return canvasTexture(width, height, (ctx) => {
    ctx.fillStyle = "#06100b";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(196, 218, 188, .035)";
    ctx.fillRect(22, 22, width - 44, height - 44);

    // Subtle CRT scanlines keep the screen feeling like an installation,
    // while the low contrast preserves the underground museum atmosphere.
    ctx.strokeStyle = "rgba(196, 218, 188, .075)";
    ctx.lineWidth = 1;
    for (let y = 18; y < height; y += 12) {
      ctx.beginPath(); ctx.moveTo(22, y); ctx.lineTo(width - 22, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(196, 218, 188, .34)";
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, width - 56, height - 56);
    ctx.strokeStyle = "rgba(196, 218, 188, .14)";
    ctx.strokeRect(42, 42, width - 84, height - 84);

    ctx.save();
    ctx.translate(width * .5, height * .51);
    ctx.strokeStyle = accent;
    ctx.fillStyle = "rgba(184, 220, 104, .08)";
    ctx.lineWidth = 3;
    if (kind === 0) {
      // Shield / proof glyph.
      ctx.beginPath();
      ctx.moveTo(0, -116); ctx.lineTo(92, -76); ctx.lineTo(72, 72);
      ctx.lineTo(0, 124); ctx.lineTo(-72, 72); ctx.lineTo(-92, -76); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-42, -4); ctx.lineTo(-12, 27); ctx.lineTo(53, -42); ctx.stroke();
      for (const [x, y] of [[-92, -76], [92, -76], [-72, 72], [72, 72], [0, 124]]) {
        ctx.fillRect(x - 5, y - 5, 10, 10);
      }
    } else if (kind === 1) {
      // A procedural “identity” portrait made from proof cells.
      ctx.strokeRect(-112, -112, 224, 224);
      ctx.strokeRect(-78, -78, 156, 156);
      for (let row = -3; row <= 3; row++) {
        for (let col = -3; col <= 3; col++) {
          const active = (row * 7 + col * 11 + index * 5) % 4 !== 0;
          if (active) ctx.fillRect(col * 28 - 8, row * 28 - 8, 16, 16);
        }
      }
      ctx.beginPath(); ctx.arc(0, 0, 47, 0, Math.PI * 2); ctx.stroke();
    } else {
      // A small network of commitments, reminiscent of a live market wall.
      const nodes = Array.from({ length: 10 }, (_, node) => ({
        x: Math.sin(node * 2.2 + index) * 116,
        y: Math.cos(node * 1.7 + index * .6) * 96,
      }));
      nodes.forEach((node, nodeIndex) => {
        const next = nodes[(nodeIndex + 3) % nodes.length];
        ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(next.x, next.y); ctx.stroke();
      });
      nodes.forEach((node) => { ctx.fillStyle = accent; ctx.fillRect(node.x - 5, node.y - 5, 10, 10); });
      ctx.strokeRect(-142, -122, 284, 244);
    }
    ctx.restore();

    ctx.fillStyle = accent;
    ctx.font = "24px monospace";
    ctx.textAlign = "left";
    ctx.fillText("zkSNARKS_", 60, 82);
    ctx.fillStyle = "#a3b6a6";
    ctx.font = "16px monospace";
    ctx.fillText("LOCAL PROOF ARTIFACT / DEMO DISPLAY", 60, height - 58);
    ctx.textAlign = "right";
    ctx.fillText(`ZCASH / SHIELDED / ${String(index + 1).padStart(3, "0")}`, width - 60, 82);
    ctx.fillText("FLOOR_ 00  ·  NETWORK ZCASH", width - 60, height - 58);

    // Deterministic signal breaks make every monitor feel slightly alive.
    ctx.fillStyle = accent;
    ctx.globalAlpha = .32;
    for (let block = 0; block < 5; block++) {
      const x = 86 + ((index * 113 + block * 71) % 560);
      const y = 112 + ((index * 47 + block * 29) % 220);
      ctx.fillRect(x, y, 18 + (block % 3) * 16, 3 + (block % 2) * 5);
    }
    ctx.globalAlpha = 1;
  });
}

function shieldedScanTexture(stats: ShieldedScanStats | null, state: "loading" | "live" | "unavailable"): THREE.CanvasTexture {
  const width = 1600;
  const height = 420;
  const formatNumber = (value: number | null, maximumFractionDigits = 0): string => value === null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
  const formatUsd = (value: number | null): string => value === null
    ? "—"
    : new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: value < 1 ? 4 : 2, style: "currency" }).format(value);
  const formatCompactUsd = (value: number | null): string => value === null
    ? "—"
    : new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 2, notation: "compact", style: "currency" }).format(value);
  return canvasTexture(width, height, (ctx) => {
    const accent = "#f1c35b";
    const ink = "#e5eadc";
    const muted = "#9fb49f";
    const live = state === "live";
    ctx.fillStyle = "#06100b";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(169, 203, 165, .035)";
    ctx.fillRect(26, 26, width - 52, height - 52);
    ctx.strokeStyle = "rgba(181, 211, 183, .16)";
    ctx.lineWidth = 2;
    for (let y = 18; y < height; y += 12) {
      ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(width - 28, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(181, 211, 183, .35)";
    ctx.strokeRect(30, 30, width - 60, height - 60);
    ctx.strokeStyle = "rgba(241, 195, 91, .42)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(68, 72); ctx.lineTo(252, 72); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = "600 34px monospace";
    ctx.fillText("ZCASH", 70, 126);
    ctx.fillStyle = ink;
    ctx.font = "600 25px monospace";
    ctx.fillText("SHIELDED SCAN", 70, 166);
    ctx.fillStyle = muted;
    ctx.font = "18px monospace";
    ctx.fillText(live ? "MAINNET / PUBLIC NETWORK METRICS" : state === "loading" ? "CONNECTING / SHIELDEDSCAN" : "DATA UNAVAILABLE / RETRY LATER", 70, 204);

    // A restrained Z glyph turns the data wall into an advertisement-like
    // object without reproducing external campaign artwork.
    ctx.save();
    ctx.translate(170, 306);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(-58, -52); ctx.lineTo(58, -52); ctx.lineTo(-58, 52); ctx.lineTo(58, 52); ctx.stroke();
    ctx.restore();

    const metrics = [
      ["BLOCK HEIGHT", stats ? formatNumber(stats.blockHeight) : "—"],
      ["TRANSACTIONS / 24H", stats ? formatNumber(stats.transactions24h) : "—"],
      ["SHIELDED SUPPLY", stats?.shieldedSupplyZec === null || !stats ? "—" : `${formatNumber(stats.shieldedSupplyZec)} ZEC`],
      ["ZEC PRICE", formatUsd(stats?.priceUsd ?? null)],
      ["MARKET CAP", formatCompactUsd(stats?.marketCapUsd ?? null)],
    ];
    metrics.forEach(([labelText, value], index) => {
      const x = 330 + index * 246;
      ctx.fillStyle = "rgba(17, 30, 22, .9)";
      ctx.fillRect(x, 82, 218, 178);
      ctx.strokeStyle = index === 0 ? "rgba(241, 195, 91, .56)" : "rgba(181, 211, 183, .2)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, 82, 218, 178);
      ctx.fillStyle = muted;
      ctx.font = "16px monospace";
      ctx.fillText(labelText, x + 18, 120);
      ctx.fillStyle = ink;
      ctx.font = "600 28px monospace";
      ctx.fillText(value, x + 18, 178);
      ctx.fillStyle = index === 0 ? accent : "#b7c9b5";
      ctx.fillRect(x + 18, 220, 64 + (index * 18), 5);
    });
    ctx.fillStyle = muted;
    ctx.font = "17px monospace";
    ctx.fillText("SHIELDEDSCAN / READ-ONLY DISPLAY / HIDN ROOM 00", 70, height - 70);
    ctx.textAlign = "right";
    ctx.fillStyle = live ? "#b7c9b5" : accent;
    ctx.fillText(live ? "LIVE DATA" : state.toUpperCase(), width - 70, height - 70);
    ctx.textAlign = "left";
  });
}

/** Physical geometry, first-person camera and raycast navigation. No panorama backdrop. */
export function mountRoomMuseum(root: HTMLElement, posts: MuseumPost[], signal: boolean, options: MuseumOptions = {}): () => void {
  const host = root.querySelector<HTMLElement>("[data-museum-stage]");
  if (!host) return () => {};
  const galleries: MuseumGallery[] = options.galleries?.length
    ? options.galleries
    : [{ key: "general", label: "GENERAL", description: "all signals", posts }];
  const singleRoom = options.roomMode === "gallery";
  const galleryLayout: GalleryLayout[] = options.foyer || singleRoom ? [] : createMuseumLayout(galleries);
  const galleryPairs = Math.max(1, Math.ceil(galleryLayout.length / 2));
  const worldFrontZ = options.foyer ? 17 : singleRoom ? 11 : 10;
  const worldBackZ = options.foyer ? -17 : singleRoom ? -11 : -((galleryPairs - 1) * 20 + 10);
  const worldDepth = worldFrontZ - worldBackZ;
  const worldCenterZ = (worldFrontZ + worldBackZ) / 2;
  const emptyRoom = singleRoom && (galleries[0]?.posts.length ?? 0) === 0;
  const abort = new AbortController();
  const events = { signal: abort.signal };
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const occluders: THREE.Object3D[] = [];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#06100a");
  scene.fog = new THREE.Fog("#0b1a12", 24, 64);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.7;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "room-museum__canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "3D museum. Drag to look around, tap the floor to walk, tap a framed thought to read, and select a room sign to enter. Use W and S to walk, A and D to move sideways, arrow keys to look.");
  host.prepend(canvas);
  const startingView = options.foyer ? foyerView : savedView;
  const camera = new THREE.PerspectiveCamera(startingView.fov, 1, 0.08, 110);
  camera.position.set(startingView.x, EYE_HEIGHT, startingView.z);
  camera.rotation.order = "YXZ";
  let yaw = startingView.yaw;
  if (!options.foyer && window.matchMedia("(max-width: 760px)").matches && savedView.x === initialView.x && savedView.z === initialView.z && savedView.yaw === initialView.yaw) yaw = -.8;
  let pitch = startingView.pitch;
  let disposed = false;
  let animationId = 0;
  let lastTime = 0;
  let dirty = true;
  let movement: { path: THREE.Vector3[]; lengths: number[]; distance: number; yaw: number; fromYaw: number; pitch: number; fromPitch: number; started: number; duration: number; complete?: () => void } | undefined;
  let entryStarted: number | undefined;
  let entryComplete = true;
  let entryActive = false;
  let entryCompletion: (() => void) | undefined;
  const beginEntry = (complete: () => void): void => {
    if (entryActive && !entryComplete) return;
    entryActive = true;
    entryComplete = false;
    entryStarted = undefined;
    entryCompletion = complete;
    movement = undefined;
    canvas.tabIndex = -1;
  };
  const requestEntry = (): void => {
    options.onEnter?.(beginEntry);
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const roomTheme = singleRoom ? galleries[0]?.theme : undefined;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: emptyRoom ? roomTheme?.floor ?? "#263a2b" : roomTheme?.wall ?? "#1b3023", roughness: .94 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#53665a", roughness: .58, metalness: .38 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#07120b", roughness: .8 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: "#a8c6a3" });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: "#303832", roughness: .48, metalness: .5 });
  const innerMaterial = new THREE.MeshStandardMaterial({ color: "#0e1d13", roughness: .68, metalness: .2 });
  [wallMaterial, trimMaterial, darkMaterial, glowMaterial, frameMaterial, innerMaterial].forEach((m) => materials.add(m));
  // Room themes change the architecture and panel content; exhibit hardware
  // stays in HIDN's neutral green so the gallery never turns into a colored
  // light show.
  const accentMaterial = (_theme?: MuseumTheme): THREE.MeshBasicMaterial => glowMaterial;
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, parent: THREE.Object3D = scene): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (parent === scene) occluders.push(mesh);
    return mesh;
  }
  function plane(w: number, h: number, material: THREE.Material, parent: THREE.Object3D = scene): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(w, h);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
    return mesh;
  }
  function texture(t: THREE.Texture): THREE.Texture { textures.add(t); return t; }
  function sculptMaterial<T extends THREE.Material>(material: T): T {
    materials.add(material);
    return material;
  }
  function sculptMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ): THREE.Mesh {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function makeZebraSculpture(): THREE.Group {
    const zebra = new THREE.Group();
    const ivory = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#e3dec9", roughness: .48, metalness: .12 }));
    const stripe = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#111914", roughness: .34, metalness: .2 }));
    const muzzle = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#252c24", roughness: .6 }));
    const eye = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#e7b84a", emissive: "#7b4b0e", emissiveIntensity: .45, roughness: .25 }));

    sculptMesh(new THREE.CapsuleGeometry(.52, 1.35, 8, 14), ivory, zebra, [0, 2.12, 0], [0, 0, Math.PI / 2]);
    for (const x of [-.62, -.38, -.14, .1, .34, .58]) {
      // The body runs along X, so each stripe ring needs its normal on X.
      // Rotating the torus this way keeps the pattern readable from the foyer
      // camera instead of collapsing into a nearly white animal silhouette.
      sculptMesh(new THREE.TorusGeometry(.505, .06, 8, 18), stripe, zebra, [x, 2.12, 0], [0, Math.PI / 2, 0]);
    }

    sculptMesh(new THREE.CapsuleGeometry(.31, .82, 8, 12), ivory, zebra, [-.77, 2.68, 0], [0, 0, -.18]);
    for (const y of [2.34, 2.56, 2.78]) {
      // The neck runs vertically, so its rings need their normal on Y.
      sculptMesh(new THREE.TorusGeometry(.315, .05, 8, 16), stripe, zebra, [-.82, y, 0], [Math.PI / 2, 0, 0]);
    }
    sculptMesh(new THREE.BoxGeometry(.62, .38, .38), ivory, zebra, [-1.2, 3.04, 0], [0, 0, -.08]);
    sculptMesh(new THREE.BoxGeometry(.3, .23, .32), muzzle, zebra, [-1.54, 2.98, 0]);
    sculptMesh(new THREE.SphereGeometry(.065, 8, 8), eye, zebra, [-1.31, 3.12, .2]);
    sculptMesh(new THREE.SphereGeometry(.065, 8, 8), eye, zebra, [-1.31, 3.12, -.2]);
    for (const z of [-.14, .14]) {
      sculptMesh(new THREE.ConeGeometry(.1, .28, 4), stripe, zebra, [-1.18, 3.35, z], [0, 0, -.18]);
    }

    for (const x of [-.45, .43]) {
      for (const z of [-.25, .25]) {
        sculptMesh(new THREE.CylinderGeometry(.095, .11, .35, 8), ivory, zebra, [x, 1.43, z]);
        sculptMesh(new THREE.CylinderGeometry(.085, .1, .32, 8), stripe, zebra, [x, 1.1, z]);
        sculptMesh(new THREE.BoxGeometry(.18, .08, .24), stripe, zebra, [x, .99, z]);
      }
    }
    sculptMesh(new THREE.CylinderGeometry(.045, .065, .48, 8), stripe, zebra, [.9, 2.14, 0], [0, 0, -.65]);
    sculptMesh(new THREE.ConeGeometry(.1, .2, 5), stripe, zebra, [1.12, 1.96, 0], [0, 0, -.65]);
    for (const x of [-.82, -.67, -.52]) {
      sculptMesh(new THREE.BoxGeometry(.06, .28, .08), stripe, zebra, [x, 3.05, -.16], [0, 0, .22]);
    }
    zebra.scale.setScalar(.78);
    zebra.position.y = .25;
    return zebra;
  }
  function makeZcashSculpture(): THREE.Group {
    const zcash = new THREE.Group();
    const gold = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#f4b728", emissive: "#6b3b08", emissiveIntensity: .35, roughness: .26, metalness: .78 }));
    const goldEdge = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#ffd76a", emissive: "#7b4c0e", emissiveIntensity: .28, roughness: .22, metalness: .82 }));
    const shadow = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#1a211b", roughness: .5, metalness: .28 }));
    sculptMesh(new THREE.CylinderGeometry(.86, .86, .18, 48), gold, zcash, [0, 2.1, 0], [Math.PI / 2, 0, 0]);
    sculptMesh(new THREE.TorusGeometry(.78, .055, 10, 48), goldEdge, zcash, [0, 2.1, .12], [Math.PI / 2, 0, 0]);
    sculptMesh(new THREE.CylinderGeometry(.68, .68, .035, 48), shadow, zcash, [0, 2.1, .12], [Math.PI / 2, 0, 0]);
    const zShape = new THREE.Shape();
    zShape.moveTo(-.47, .42);
    zShape.lineTo(.47, .42);
    zShape.lineTo(.47, .24);
    zShape.lineTo(-.16, -.24);
    zShape.lineTo(.47, -.24);
    zShape.lineTo(.47, -.42);
    zShape.lineTo(-.47, -.42);
    zShape.lineTo(-.47, -.24);
    zShape.lineTo(.16, .24);
    zShape.lineTo(-.47, .24);
    zShape.closePath();
    sculptMesh(new THREE.ExtrudeGeometry(zShape, { depth: .07, bevelEnabled: true, bevelThickness: .018, bevelSize: .018, bevelSegments: 2 }), goldEdge, zcash, [0, 2.1, .16]);
    zcash.scale.setScalar(.86);
    zcash.position.y = .25;
    return zcash;
  }
  function label(text: string, w: number, h: number, x: number, y: number, z: number, angle = 0, fontSize = 32, alwaysVisible = false): void {
    const map = texture(canvasTexture(1024, 256, (ctx) => {
      ctx.clearRect(0, 0, 1024, 256);
      ctx.fillStyle = "#b0c8b6";
      ctx.font = `600 ${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(text, 512, 145);
    }));
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, depthTest: !alwaysVisible });
    materials.add(mat);
    const mesh = plane(w, h, mat);
    mesh.position.set(x, y, z); mesh.rotation.y = angle;
  }

  const doorLeaves: THREE.Group[] = [];
  const entranceObjects: THREE.Object3D[] = [];

  if (options.foyer) {
    // The public foyer keeps its single recessed threshold.
    box(.3, 6, 34, -12.15, 3, 0, wallMaterial);
    box(.3, 6, 34, 12.15, 3, 0, wallMaterial);
    box(24.6, 6, .3, 0, 3, 17.15, wallMaterial);
    box(9.2, 6, .3, -7.4, 3, -17.15, wallMaterial);
    box(9.2, 6, .3, 7.4, 3, -17.15, wallMaterial);
    box(5.6, 1.8, .3, 0, 5.1, -17.15, wallMaterial);
    box(.25, 4.2, 4, -2.8, 2.1, -19, darkMaterial);
    box(.25, 4.2, 4, 2.8, 2.1, -19, darkMaterial);
    box(5.6, 4.2, .3, 0, 2.1, -21, wallMaterial);
    for (const side of [-1, 1]) {
      box(.07, .1, 34, side * 11.96, .16, 0, trimMaterial);
      box(.07, .025, 34, side * 11.95, .26, 0, glowMaterial);
      box(.08, .12, 34, side * 11.96, 5.75, 0, trimMaterial);
      box(.035, 4.1, .04, side * 2.65, 2.05, -16.96, glowMaterial);
    }
    box(5.35, .035, .04, 0, 4.1, -16.96, glowMaterial);
    label("HIDN / THE FOYER", 4.5, 1, 0, 2.6, -20.81);
  } else if (singleRoom) {
    // Every themed room keeps the same HIDN proportions as the main room:
    // one clear chamber, a visible return portal, and thoughts on every wall.
    box(.3, 6, worldDepth, -12.15, 3, worldCenterZ, wallMaterial);
    box(.3, 6, worldDepth, 12.15, 3, worldCenterZ, wallMaterial);
    box(24.6, 6, .3, 0, 3, worldBackZ - .15, wallMaterial);
    box(9.2, 6, .3, -7.4, 3, worldFrontZ + .15, wallMaterial);
    box(9.2, 6, .3, 7.4, 3, worldFrontZ + .15, wallMaterial);
    box(5.6, 1.8, .3, 0, 5.1, worldFrontZ + .15, wallMaterial);
    box(.25, 4.2, 4, -2.8, 2.1, worldFrontZ - .1, darkMaterial);
    box(.25, 4.2, 4, 2.8, 2.1, worldFrontZ - .1, darkMaterial);
    for (const side of [-1, 1]) {
      box(.07, .1, worldDepth, side * 11.96, .16, worldCenterZ, trimMaterial);
      box(.07, .025, worldDepth, side * 11.95, .26, worldCenterZ, accentMaterial(roomTheme));
      box(.08, .12, worldDepth, side * 11.96, 5.75, worldCenterZ, trimMaterial);
    }
    box(5.35, .035, .04, 0, 4.1, worldFrontZ - .16, accentMaterial(roomTheme));
    label(`${galleries[0]?.label ?? "ROOM"} / WITHOUT NAMES`, 5.2, 1, 0, 2.6, worldBackZ + .2, Math.PI);
    if (emptyRoom) {
      const quietPanelMaterial = new THREE.MeshStandardMaterial({
        color: roomTheme?.floor ?? "#2a3d2e",
        emissive: roomTheme?.glow ?? "#3e7650",
        emissiveIntensity: .2,
        roughness: .72,
      });
      materials.add(quietPanelMaterial);
      box(7.2, 2.2, .12, 0, 2.6, worldBackZ + .11, quietPanelMaterial);
      box(7.35, .05, .15, 0, 3.82, worldBackZ + .19, accentMaterial(roomTheme));
      box(7.35, .05, .15, 0, 1.38, worldBackZ + .19, accentMaterial(roomTheme));
      label("NO SIGNALS YET", 4.4, .62, 0, 2.6, worldBackZ + .2, Math.PI);
    }
    label("MAIN ROOM", 3.1, .6, 0, 4.88, worldFrontZ - .18);
    const returnMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    materials.add(returnMaterial);
    const returnHit = plane(5.45, 4.25, returnMaterial);
    returnHit.position.set(0, 2.05, worldFrontZ - .22);
    returnHit.userData.returnToMain = true;
    entranceObjects.push(returnHit);
  } else {
    // The room is a wider central hallway with paired galleries opening on both sides.
    box(.3, 6, worldDepth, -12.15, 3, worldCenterZ, wallMaterial);
    box(.3, 6, worldDepth, 12.15, 3, worldCenterZ, wallMaterial);
    box(24.6, 6, .3, 0, 3, worldFrontZ + .15, wallMaterial);
    box(24.6, 6, .3, 0, 3, worldBackZ - .15, wallMaterial);
    for (const side of [-1, 1]) {
      const rooms = galleryLayout.filter((room) => room.side === side).sort((a, b) => b.center.z - a.center.z);
      let cursor = worldFrontZ;
      for (const room of rooms) {
        const openingStart = room.center.z + 1.65;
        if (cursor - openingStart > .25) {
          box(.3, 6, cursor - openingStart, side * 3.65, 3, (cursor + openingStart) / 2, wallMaterial);
        }
        cursor = room.center.z - 1.65;
      }
      if (cursor - worldBackZ > .25) {
        box(.3, 6, cursor - worldBackZ, side * 3.65, 3, (cursor + worldBackZ) / 2, wallMaterial);
      }
      box(.07, .1, worldDepth, side * 11.96, .16, worldCenterZ, trimMaterial);
      box(.07, .025, worldDepth, side * 11.95, .26, worldCenterZ, glowMaterial);
      box(.08, .12, worldDepth, side * 11.96, 5.75, worldCenterZ, trimMaterial);
    }
    label("THE THOUGHT IS VISIBLE. THE PERSON STAYS HIDDEN.", 7.2, 1.3, 0, 4.8, worldFrontZ - .2);
    label("HIDN / THE ROOMS", 4.5, 1, 0, 2.6, worldBackZ + .2, Math.PI);
    // Open stair landings connect each pair of rooms without adding another
    // threshold. They are shallow visual transitions, so walking stays easy.
    for (let pair = 0; pair < galleryPairs - 1; pair++) {
      const z = -pair * 20 - 10;
      for (let step = 0; step < 4; step++) {
        box(4.6, .12 + step * .045, .9, 0, .06 + step * .022, z + 1.35 - step * .42, darkMaterial);
        box(4.7, .025, .78, 0, .14 + step * .045, z + 1.35 - step * .42, trimMaterial);
      }
      label("NEXT HALL", 2.1, .34, 0, .42, z - .1);
    }
    for (const room of galleryLayout) {
      const x = room.side * 3.65;
      const z = room.center.z;
      const roomAccent = accentMaterial(room.theme);
      // The opening remains open. This is a signboard, not a door: it names
      // the room while leaving the visitor a clear line into the gallery.
      const signboard = box(.18, .78, 2.02, x - room.side * .09, 4.08, z, darkMaterial);
      signboard.userData.roomIndex = room.index;
      box(.04, .04, 1.82, x - room.side * .21, 4.45, z, roomAccent);
      box(.04, .04, 1.82, x - room.side * .21, 3.71, z, roomAccent);
      box(.04, .66, .04, x - room.side * .21, 4.08, z - .91, roomAccent);
      box(.04, .66, .04, x - room.side * .21, 4.08, z + .91, roomAccent);
      const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      materials.add(hitMaterial);
      const hit = box(.46, 4.25, 3.45, x, 2.1, z, hitMaterial);
      hit.userData.roomIndex = room.index;
      entranceObjects.push(hit);
      box(.05, .035, 3.15, room.side * 11.92, .27, z, roomAccent);
      box(.12, .12, .2, x - room.side * .24, 4.83, z, room.hasNewSignal ? roomAccent : trimMaterial);
      label(room.label, 1.7, .3, x - room.side * .25, 4.22, z, room.side > 0 ? -Math.PI / 2 : Math.PI / 2, 24, true);
      label(room.description, 1.62, .2, x - room.side * .25, 3.93, z, room.side > 0 ? -Math.PI / 2 : Math.PI / 2, 18, true);
    }
  }

  const floorMap = texture(canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = roomTheme?.floor ?? "#282e28"; ctx.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 6; col++) {
        const x = col * 205 - (row % 2) * 102;
        const shade = 21 + ((row * 17 + col * 23) % 10);
        ctx.fillStyle = `rgb(${shade + 4},${shade + 7},${shade})`;
        ctx.fillRect(x + 1, row * 64 + 1, 203, 62);
        ctx.strokeStyle = "rgba(163,190,160,.07)";
        for (let line = 0; line < 6; line++) {
          ctx.beginPath(); ctx.moveTo(x + 3, row * 64 + 9 + line * 8); ctx.lineTo(x + 200, row * 64 + 9 + line * 8); ctx.stroke();
        }
      }
    }
  }));
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
  floorMap.repeat.set(4, Math.max(5.7, worldDepth / 6));
  floorMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorMap, roughness: .78, metalness: .03 });
  materials.add(floorMaterial);
  const floor = plane(24, worldDepth, floorMaterial);
  floor.position.z = worldCenterZ;
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  if (options.foyer) {
    const alcoveFloor = plane(5.6, 4.2, floorMaterial);
    alcoveFloor.rotation.x = -Math.PI / 2; alcoveFloor.position.z = -19;
  }

  // Roof beams and a glazed ceiling retain a museum scale, with space above it.
  for (const x of [-12, -8, 0, 8, 12]) box(.12, .18, worldDepth, x, 5.9, worldCenterZ, darkMaterial).castShadow = !options.foyer;
  for (let z = worldBackZ; z <= worldFrontZ; z += 4.25) box(24, .16, .12, 0, 5.9, z, darkMaterial).castShadow = !options.foyer;
  for (const side of [-1, 1]) {
    box(.06, .018, worldDepth, side * 10.7, 5.65, worldCenterZ, glowMaterial);
    for (let z = worldBackZ + 4; z < worldFrontZ; z += 8) {
      box(.18, .08, .28, side * 9.4, 5.55, z, trimMaterial);
      box(.13, .015, .22, side * 9.4, 5.49, z, glowMaterial);
    }
  }
  const starPositions: number[] = [];
  // Deterministic, still stars: no orbit or automatic camera motion.
  for (let i = 0; i < 520; i++) {
    starPositions.push(Math.sin(i * 127.1) * 40, 8 + ((i * 37) % 25), Math.cos(i * 311.7) * 45);
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  geometries.add(starsGeometry);
  const starsMaterial = new THREE.PointsMaterial({ color: "#88ab91", size: .065, transparent: true, opacity: .45 });
  materials.add(starsMaterial);
  scene.add(new THREE.Points(starsGeometry, starsMaterial));

  const obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  if (options.foyer) {
    for (const x of [-5.2, 5.2]) {
      for (const z of [-7, 5]) {
        const geometry = new THREE.CylinderGeometry(.22, .26, 5.8, 20);
        geometries.add(geometry);
        const pillar = new THREE.Mesh(geometry, trimMaterial);
        pillar.position.set(x, 2.9, z); scene.add(pillar);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        occluders.push(pillar);
        obstacles.push({ minX: x - .6, maxX: x + .6, minZ: z - .6, maxZ: z + .6 });
      }
    }
    box(5.2, 3.4, .24, -4.6, 1.7, 8, wallMaterial);
    box(5.2, .04, .3, -4.6, 3.43, 8, trimMaterial);
    box(5.2, .025, .025, -4.6, .19, 8.15, glowMaterial);
    obstacles.push({ minX: -7.5, maxX: -1.7, minZ: 7.55, maxZ: 8.45 });
    // A low museum bench sits outside the central walking path.
    box(3.3, .12, .9, 7.1, .5, 6, darkMaterial);
    for (const x of [5.9, 8.3]) box(.08, .45, .7, x, .23, 6, trimMaterial);
    obstacles.push({ minX: 5.2, maxX: 9, minZ: 5.2, maxZ: 6.8 });
  }
  if (options.foyer) {
    // Solid, hinged doors occupy the real opening at the far end of the hall.
    const portalMaterial = new THREE.MeshBasicMaterial({ color: "#b0d1a7" });
    materials.add(portalMaterial);
    const portal = plane(5.15, 4.05, portalMaterial);
    portal.position.set(0, 2.03, -20.75);
    for (const z of [-18, -19.2, -20.35]) {
      box(.055, 4.1, .055, -2.61, 2.05, z, glowMaterial);
      box(.055, 4.1, .055, 2.61, 2.05, z, glowMaterial);
      box(5.25, .055, .055, 0, 4.08, z, glowMaterial);
    }
    for (const side of [-1, 1]) {
      box(.29, 4.55, .31, side * 2.82, 2.21, -16.83, frameMaterial);
      box(.045, 4.38, .035, side * 2.62, 2.16, -16.62, trimMaterial);
      const hinge = new THREE.Group();
      hinge.position.set(side * 2.59, 0, -16.85);
      const center = -side * 1.285;
      box(2.57, 4.12, .17, center, 2.06, 0, frameMaterial, hinge);
      for (const panelY of [1.06, 3.02]) {
        box(2.12, 1.65, .045, center, panelY, .11, darkMaterial, hinge);
        box(1.93, 1.46, .075, center, panelY, .145, frameMaterial, hinge);
        for (const edge of [-1, 1]) {
          box(2.12, .035, .035, center, panelY + edge * .825, .145, trimMaterial, hinge);
          box(.035, 1.65, .035, center + edge * 1.06, panelY, .145, trimMaterial, hinge);
        }
      }
      box(.065, .55, .15, -side * 2.37, 1.85, .19, trimMaterial, hinge);
      hinge.children.forEach((object) => { object.userData.entrance = true; });
      scene.add(hinge); doorLeaves.push(hinge); entranceObjects.push(hinge);
    }
    // Keep the seam and inner moulding easy to tap on phones. This target is
    // invisible and only participates in the entrance raycast.
    const doorHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    materials.add(doorHitMaterial);
    const doorHitArea = plane(5.45, 4.25, doorHitMaterial);
    doorHitArea.position.set(0, 2.05, -16.46);
    doorHitArea.userData.entrance = true;
    entranceObjects.push(doorHitArea);
    if (options.privateFoyer) {
      // The private foyer uses the physical sign above the door as the only
      // call to continue. The doorway remains the actual interactive target.
      box(5.72, .98, .18, 0, 5.05, -16.83, frameMaterial);
      box(5.42, .72, .035, 0, 5.05, -16.71, innerMaterial);
      box(5.84, .045, .2, 0, 5.59, -16.83, trimMaterial);
      box(5.84, .045, .2, 0, 4.51, -16.83, trimMaterial);
      label("HALLWAY", 5.22, .38, 0, 5.23, -16.61, 0, 58, true);
      label("THE ROOMS", 5.22, .24, 0, 4.84, -16.61, 0, 32, true);
    } else {
      box(5.94, .26, .31, 0, 4.45, -16.83, frameMaterial);
      label("ENTER THE ROOM", 3.1, .6, 0, 4.88, -16.81);
    }
    // Quiet, stationary artifacts on plinths make the public foyer a gallery.
    const artifactSpots = [
      { x: -2.1, z: -9.8, sculpture: makeZebraSculpture() },
      { x: 2.1, z: -9.8, sculpture: makeZcashSculpture() },
    ];
    artifactSpots.forEach(({ x, z, sculpture }) => {
      box(1.35, .95, 1.35, x, .475, z, darkMaterial);
      box(1.43, .055, 1.43, x, .97, z, trimMaterial);
      sculpture.position.set(x, 0, z);
      scene.add(sculpture);
      occluders.push(sculpture);
      obstacles.push({ minX: x - .94, maxX: x + .94, minZ: z - .94, maxZ: z + .94 });
    });
  }

  scene.add(new THREE.HemisphereLight("#c2dcca", "#26392a", emptyRoom ? 1.85 : 1.5));
  const ceilingLight = new THREE.DirectionalLight("#e0ead8", emptyRoom ? 2.05 : 1.7);
  ceilingLight.position.set(4, 8, 10);
  ceilingLight.castShadow = true;
  ceilingLight.shadow.mapSize.set(1024, 1024);
  ceilingLight.shadow.camera.left = -22;
  ceilingLight.shadow.camera.right = 22;
  ceilingLight.shadow.camera.top = 24;
  ceilingLight.shadow.camera.bottom = -24;
  ceilingLight.shadow.normalBias = .05;
  scene.add(ceilingLight);
  const backLight = new THREE.DirectionalLight("#b7cbb4", emptyRoom ? 1.18 : .94);
  backLight.position.set(-8, 6, -14); scene.add(backLight);
  const undergroundGlow = new THREE.PointLight("#5c9569", emptyRoom ? 1.02 : .74, 30, 1.7);
  undergroundGlow.position.set(0, 2.4, -10);
  scene.add(undergroundGlow);
  // Keep the hallway readable without flattening the underground mood. This
  // is a room wash; the artwork frames remain unlit and neutral.
  const hallwayLight = new THREE.PointLight("#d7ddc5", options.foyer ? 1.26 : singleRoom ? (emptyRoom ? .96 : .56) : 1.62, 34, 1.45);
  hallwayLight.position.set(0, 4.95, options.foyer ? 3 : worldFrontZ - 4.5);
  scene.add(hallwayLight);

  // Small room lights make the walls readable without losing the underground
  // mood. Their stepped intensity is also the museum's quiet signal glitch.
  const galleryLights: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];
  const roomLightFixtureGeometry = new THREE.SphereGeometry(.07, 10, 8);
  geometries.add(roomLightFixtureGeometry);
  const lightStops = options.foyer
    ? [{ x: 0, z: -10, theme: undefined }]
    : singleRoom
      ? [{ x: 0, z: -1.5, theme: roomTheme }]
      : galleryLayout.map((room) => ({ x: room.side * 7.2, z: room.center.z, theme: room.theme }));
  lightStops.forEach((stop, index) => {
    const light = new THREE.PointLight("#d7dec5", singleRoom ? (emptyRoom ? 1.46 : 1.12) : .92, singleRoom ? 22 : 17, 1.55);
    light.position.set(stop.x, 4.75, stop.z);
    scene.add(light);
    const fixture = new THREE.Mesh(roomLightFixtureGeometry, accentMaterial(stop.theme));
    fixture.position.set(stop.x, 5.72, stop.z);
    scene.add(fixture);
    galleryLights.push({ light, base: light.intensity, phase: index * 1.47 });
  });
  const glitchLightBase = emptyRoom ? .68 : .52;
  const glitchLight = new THREE.PointLight("#9bcf83", glitchLightBase, 24, 1.65);
  glitchLight.position.set(0, 5.35, options.foyer ? -11 : singleRoom ? 5 : worldFrontZ - 5.5);
  scene.add(glitchLight);
  const glitchBulbGeometry = new THREE.SphereGeometry(.11, 12, 8);
  geometries.add(glitchBulbGeometry);
  const glitchBulb = new THREE.Mesh(glitchBulbGeometry, accentMaterial(roomTheme));
  glitchBulb.position.copy(glitchLight.position);
  scene.add(glitchBulb);

  const exhibits: Exhibit[] = [];
  const placements: MuseumPlacement[] = options.foyer
    ? (() => {
      const offsets = [-12, -7.2, -2.4, 2.4, 7.2, 12];
      const slots = [-1, 1].flatMap((side) => offsets.map((z, index) => ({
        x: side * 11.82,
        y: index % 2 === 0 ? 2.08 : 4.42,
        z,
        angle: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      })));
      return slots.map((slot, index) => ({ ...slot, post: posts[index] }));
    })()
    : singleRoom
      ? (() => {
        const roomPosts = galleries[0]?.posts ?? posts;
        const sideOffsets = [-8.2, -4.1, 0, 4.1, 8.2];
        const wallSlots = [-1, 1].flatMap((side) => sideOffsets.map((z, index) => ({
          x: side * 11.82,
          y: index % 2 === 0 ? 2.08 : 4.42,
          z,
          angle: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        })));
        const endSlots = [-7, -2.33, 2.33, 7].map((x) => ({
          x,
          y: 2.1,
          z: worldBackZ + .16,
          angle: 0,
        }));
        return [...wallSlots, ...endSlots].map((slot, index) => ({ ...slot, post: roomPosts[index] }));
      })()
      : galleryLayout.flatMap((room) => {
        const offsets = [-7.2, -3.6, 0, 3.6, 7.2];
        const angle = room.side > 0 ? -Math.PI / 2 : Math.PI / 2;
        const roomPosts = galleries[room.index]?.posts ?? [];
        return roomPosts.slice(0, offsets.length * 2).map((post, index) => ({
          post,
          x: room.side * 11.82,
          y: index < offsets.length ? 2.08 : 4.42,
          z: room.center.z + offsets[index % offsets.length],
          angle,
        }));
      });
  placements.forEach((placement, index) => {
    if (!placement.post) return;
    const post = placement.post;
    const placementTheme = galleries.find((gallery) => gallery.key === post.roomKey)?.theme ?? roomTheme;
    const card = museumCardLayout(post, index);
    const group = new THREE.Group();
    group.position.set(placement.x, placement.y ?? 2.25, placement.z);
    group.rotation.y = placement.angle;
    scene.add(group);
    const w = card.width;
    const h = card.height;
    box(w + .28, h + .28, .1, 0, 0, -.035, darkMaterial, group);
    box(w + .2, .08, .14, 0, (h + .12) / 2, .06, frameMaterial, group);
    box(w + .2, .08, .14, 0, -(h + .12) / 2, .06, frameMaterial, group);
    box(.08, h + .18, .14, -(w + .12) / 2, 0, .06, frameMaterial, group);
    box(.08, h + .18, .14, (w + .12) / 2, 0, .06, frameMaterial, group);
    box(w + .04, h + .04, .035, 0, 0, .08, innerMaterial, group);
    const map = texture(postTexture(post, index, signal, placementTheme));
    map.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false });
    materials.add(mat);
    const surface = plane(w, h, mat, group);
    surface.position.z = .105; surface.userData.exhibitIndex = index;
    exhibits.push({ group, surface, position: group.position.clone(), normal: new THREE.Vector3(Math.sin(placement.angle), 0, Math.cos(placement.angle)), post, frameWidth: w + .28 });
    // The frame is deliberately neutral. Room color comes from the ceiling
    // fixtures and point lights, never from colored picture-frame hardware.
    box(.45, .055, .12, 0, h / 2 + .34, .2, frameMaterial, group);
    if (card.style === "paper") {
      box(.18, .18, .12, -(w / 2 + .12), h / 2 + .12, .16, frameMaterial, group);
      box(.18, .18, .12, w / 2 + .12, -(h / 2 + .12), .16, frameMaterial, group);
    } else if (card.style === "blueprint") {
      for (const x of [-(w / 2 + .13), w / 2 + .13]) {
        for (const y of [-(h / 2 + .13), h / 2 + .13]) {
          box(.12, .12, .1, x, y, .16, frameMaterial, group);
        }
      }
    } else if (card.style === "signal") {
      box(.035, h * .72, .05, -(w / 2 + .16), 0, .16, frameMaterial, group);
    }
    group.children.forEach((object) => { object.userData.exhibitIndex = index; });
  });

  // A themed room has a second, slower exhibition layer: an island that can
  // be walked around, a shallow archival case in the rear wall, and a few
  // suspended frames above the visitor path. They are deliberately made from
  // local geometry and generated textures so the references guide the space
  // without importing someone else's photography or artwork.
  const roomInteriorLights: Array<{ light: THREE.PointLight; base: number; phase: number }> = [];
  const shieldedScreens: ShieldedScreen[] = [];
  function addRoomInterior(): void {
    if (!singleRoom) return;
    const roomPosts = galleries[0]?.posts ?? posts;
    const roomIndex = galleries[0]?.roomIndex ?? 0;
    const exhibitionMode = roomIndex % 3;
    const scanRoom = emptyRoom;
    const islandMaterial = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#c9cec1", roughness: .58, metalness: .06 }));
    const islandEdgeMaterial = sculptMaterial(new THREE.MeshStandardMaterial({ color: "#6f7e71", roughness: .44, metalness: .34 }));
    const glassMaterial = sculptMaterial(new THREE.MeshStandardMaterial({
      color: "#b7c9b5",
      transparent: true,
      opacity: .14,
      roughness: .12,
      metalness: .04,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const relicMaterial = sculptMaterial(new THREE.MeshStandardMaterial({
      color: "#dde4d2",
      emissive: "#5b7f64",
      emissiveIntensity: .28,
      roughness: .3,
      metalness: .28,
    }));
    const island = new THREE.Group();
    const islandX = exhibitionMode === 1 ? -2.15 : exhibitionMode === 2 ? 2.15 : 0;
    const islandZ = exhibitionMode === 2 ? -1.65 : -2.8;
    const islandDepthScale = exhibitionMode === 2 ? .35 : .46;
    island.position.set(islandX, 0, islandZ);
    scene.add(island);

    const islandBase = sculptMesh(new THREE.CylinderGeometry(2.8, 2.98, .34, 48), islandMaterial, island, [0, .17, 0]);
    islandBase.scale.z = islandDepthScale;
    const islandTop = sculptMesh(new THREE.CylinderGeometry(2.62, 2.72, .08, 48), islandMaterial, island, [0, .38, 0]);
    islandTop.scale.z = islandDepthScale;
    const islandRing = sculptMesh(new THREE.TorusGeometry(2.47, .035, 8, 48), glowMaterial, island, [0, .44, 0], [Math.PI / 2, 0, 0]);
    islandRing.scale.z = islandDepthScale;
    // A low transparent case keeps the center readable while giving the room
    // a single object visitors can orbit, like a real museum island.
    const displayCase = new THREE.Group();
    displayCase.position.set(0, 1.12, 0);
    island.add(displayCase);
    box(3.86, 1.38, .035, 0, 0, -.72, glassMaterial, displayCase);
    box(3.86, 1.38, .035, 0, 0, .72, glassMaterial, displayCase);
    box(.035, 1.38, 1.44, -1.93, 0, 0, glassMaterial, displayCase);
    box(.035, 1.38, 1.44, 1.93, 0, 0, glassMaterial, displayCase);
    box(3.92, .045, .05, 0, -.7, .74, islandEdgeMaterial, displayCase);
    box(3.92, .045, .05, 0, .7, .74, islandEdgeMaterial, displayCase);
    box(.05, 1.44, .05, -1.96, 0, .74, islandEdgeMaterial, displayCase);
    box(.05, 1.44, .05, 1.96, 0, .74, islandEdgeMaterial, displayCase);
    sculptMesh(new THREE.OctahedronGeometry(.46, 1), relicMaterial, displayCase, [0, .03, .04], [0, .22, 0]);
    sculptMesh(new THREE.TorusGeometry(.59, .028, 8, 32), glowMaterial, displayCase, [0, .03, .04], [Math.PI / 2, 0, 0]);
    const islandLight = new THREE.PointLight("#dfe5d3", .82, 10, 1.8);
    islandLight.position.set(islandX, 2.65, islandZ);
    scene.add(islandLight);
    roomInteriorLights.push({ light: islandLight, base: .82, phase: .8 });
    obstacles.push({ minX: islandX - 3.18, maxX: islandX + 3.18, minZ: islandZ - 1.75, maxZ: islandZ + 1.75 });

    const addShieldedScanScreen = (): void => {
      const screenGroup = new THREE.Group();
      screenGroup.position.set(0, 3.62, worldBackZ + .12);
      scene.add(screenGroup);
      const width = 8.8;
      const height = 1.62;
      box(width + .34, height + .34, .18, 0, 0, 0, darkMaterial, screenGroup);
      box(width + .16, .065, .2, 0, (height + .12) / 2, .11, frameMaterial, screenGroup);
      box(width + .16, .065, .2, 0, -(height + .12) / 2, .11, frameMaterial, screenGroup);
      box(.07, height + .12, .2, -(width + .08) / 2, 0, .11, frameMaterial, screenGroup);
      box(.07, height + .12, .2, (width + .08) / 2, 0, .11, frameMaterial, screenGroup);
      const map = shieldedScanTexture(null, "loading");
      textures.add(map);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      const screenMaterial = new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, fog: false });
      materials.add(screenMaterial);
      const surface = plane(width, height, screenMaterial, screenGroup);
      surface.position.z = .21;
      const glitchMaterial = new THREE.MeshBasicMaterial({ color: "#f1c35b", transparent: true, opacity: 0, depthWrite: false });
      materials.add(glitchMaterial);
      const glitchBar = box(width * .84, .026, .025, 0, 0, .23, glitchMaterial, screenGroup);
      shieldedScreens.push({ screenMaterial, texture: map, glitchBar, phase: 2.6 });
      const screenLight = new THREE.PointLight("#dce2cb", .58, 13, 1.7);
      screenLight.position.set(0, 3.2, worldBackZ + .9);
      scene.add(screenLight);
      roomInteriorLights.push({ light: screenLight, base: .58, phase: 3.1 });
      void fetchShieldedScanStats().then((stats) => {
        if (disposed) return;
        const nextMap = shieldedScanTexture(stats, "live");
        textures.add(nextMap);
        nextMap.wrapS = nextMap.wrapT = THREE.RepeatWrapping;
        screenMaterial.map = nextMap;
        screenMaterial.needsUpdate = true;
        const screen = shieldedScreens.at(-1);
        if (screen) screen.texture = nextMap;
      }).catch(() => {
        if (disposed) return;
        const nextMap = shieldedScanTexture(null, "unavailable");
        textures.add(nextMap);
        nextMap.wrapS = nextMap.wrapT = THREE.RepeatWrapping;
        screenMaterial.map = nextMap;
        screenMaterial.needsUpdate = true;
        const screen = shieldedScreens.at(-1);
        if (screen) screen.texture = nextMap;
      });
    };

    if (scanRoom) addShieldedScanScreen();

    // One wall case introduces the recessed, archival-display rhythm from the
    // references without competing with the larger confession frames.
    const wallCase = new THREE.Group();
    wallCase.position.set(exhibitionMode === 1 ? 6.25 : -6.25, 3.22, worldBackZ + .1);
    scene.add(wallCase);
    const caseWidth = 3.28;
    const caseHeight = 1.72;
    box(caseWidth + .26, caseHeight + .26, .16, 0, 0, 0, darkMaterial, wallCase);
    box(caseWidth + .08, caseHeight + .08, .045, 0, 0, .11, frameMaterial, wallCase);
    box(caseWidth, caseHeight, .025, 0, 0, .15, innerMaterial, wallCase);
    const wallMap = texture(roomPosts[1] ? postTexture(roomPosts[1], 31, signal, roomTheme) : proofArtifactTexture(31));
    const wallMaterial = new THREE.MeshBasicMaterial({ map: wallMap, toneMapped: false, fog: false });
    materials.add(wallMaterial);
    const wallSurface = plane(caseWidth - .18, caseHeight - .18, wallMaterial, wallCase);
    wallSurface.position.z = .17;
    if (roomPosts[1]) {
      const exhibitIndex = exhibits.length;
      wallSurface.userData.exhibitIndex = exhibitIndex;
      exhibits.push({
        group: wallCase,
        surface: wallSurface,
        position: wallCase.position.clone(),
        normal: new THREE.Vector3(0, 0, 1),
        post: roomPosts[1],
        frameWidth: caseWidth + .26,
      });
    }
    const wallCaseLight = new THREE.PointLight("#dce2cb", .3, 5.5, 1.8);
    wallCaseLight.position.set(0, .98, .35);
    wallCase.add(wallCaseLight);

    // Suspended panels echo the ceiling installations in the references. A
    // slight tilt and varied height keeps them feeling installed, not tiled.
    const hangingSlots = exhibitionMode === 1
      ? [
        { x: -4.5, z: -5.1, y: 4.76, tilt: -.16 },
        { x: -2.55, z: -4.35, y: 5.15, tilt: .1 },
        { x: -.65, z: -5.65, y: 4.7, tilt: -.08 },
        { x: 1.65, z: -4.6, y: 5.03, tilt: .15 },
        { x: 3.85, z: -5.35, y: 4.82, tilt: -.12 },
      ]
      : exhibitionMode === 2
        ? [
          { x: -3.35, z: -4.55, y: 5.1, tilt: -.08 },
          { x: -1.25, z: -5.85, y: 4.78, tilt: .13 },
          { x: .85, z: -4.65, y: 5.18, tilt: -.1 },
          { x: 2.9, z: -5.55, y: 4.72, tilt: .08 },
        ]
        : [
          { x: -3.8, z: -5.9, y: 4.85, tilt: -.12 },
          { x: -2.1, z: -4.7, y: 5.12, tilt: .08 },
          { x: -.35, z: -5.45, y: 4.72, tilt: -.06 },
          { x: 1.45, z: -4.55, y: 5.02, tilt: .11 },
          { x: 3.2, z: -5.8, y: 4.78, tilt: -.1 },
        ];
    hangingSlots.forEach((slot, index) => {
      const post = roomPosts[index];
      if (!post) return;
      const width = 1.02 + (index % 2) * .16;
      const height = 1.18 + ((index + 1) % 3) * .1;
      const hanging = new THREE.Group();
      hanging.position.set(slot.x, slot.y, slot.z);
      hanging.rotation.set(slot.tilt, (index % 3 - 1) * .06, index % 2 ? .045 : -.035);
      scene.add(hanging);
      box(width + .18, height + .16, .14, 0, 0, 0, darkMaterial, hanging);
      box(width + .08, .055, .16, 0, (height + .07) / 2, .1, frameMaterial, hanging);
      box(width + .08, .055, .16, 0, -(height + .07) / 2, .1, frameMaterial, hanging);
      box(.06, height + .08, .16, -(width + .04) / 2, 0, .1, frameMaterial, hanging);
      box(.06, height + .08, .16, (width + .04) / 2, 0, .1, frameMaterial, hanging);
      const map = texture(postTexture(post, index + 55, signal, roomTheme));
      map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const material = new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false });
      materials.add(material);
      const surface = plane(width, height, material, hanging);
      surface.position.z = .11;
      const exhibitIndex = exhibits.length;
      surface.userData.exhibitIndex = exhibitIndex;
      exhibits.push({
        group: hanging,
        surface,
        position: hanging.position.clone(),
        normal: new THREE.Vector3(0, 0, 1),
        post,
        frameWidth: width + .18,
      });
      // Thin suspension rods make the ceiling layer legible against the dark
      // roof without adding another visual wall.
      box(.018, .45, .018, 0, height / 2 + .33, 0, trimMaterial, hanging);
      box(.018, .025, .12, 0, height / 2 + .55, 0, glowMaterial, hanging);
    });
    const suspendedLight = new THREE.PointLight("#dce3d2", .38, 8, 1.65);
    suspendedLight.position.set(0, 4.45, -5.1);
    scene.add(suspendedLight);
    roomInteriorLights.push({ light: suspendedLight, base: .38, phase: 2.15 });
  }

  addRoomInterior();

  function addStandingPanel(
    position: { x: number; y: number; z: number; angle: number },
    title: string,
    body: string,
    index: number,
    theme?: MuseumTheme,
    post?: MuseumPost,
    dimensions?: { width?: number; height?: number },
  ): void {
    const hallwayPanel = !options.foyer && !singleRoom;
    const width = dimensions?.width ?? (hallwayPanel ? 1.1 : post ? 1.58 : 1.44);
    const height = dimensions?.height ?? (hallwayPanel ? 2.3 : post ? 2.92 : 2.78);
    const panel = new THREE.Group();
    panel.position.set(position.x, position.y, position.z);
    panel.rotation.y = position.angle;
    scene.add(panel);

    box(width + .24, height + .2, .16, 0, 0, 0, darkMaterial, panel);
    box(width + .1, .065, .2, 0, (height + .1) / 2, .1, frameMaterial, panel);
    box(width + .1, .065, .2, 0, -(height + .1) / 2, .1, frameMaterial, panel);
    box(.07, height + .1, .2, -(width + .05) / 2, 0, .1, frameMaterial, panel);
    box(.07, height + .1, .2, (width + .05) / 2, 0, .1, frameMaterial, panel);

    const map = post
      ? postTexture(post, index + 40, signal, theme)
      : exhibitionPanelTexture(title, body, index, theme);
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false });
    materials.add(material);
    const surface = plane(width, height, material, panel);
    surface.position.z = .205;
    if (post) {
      const exhibitIndex = exhibits.length;
      surface.userData.exhibitIndex = exhibitIndex;
      exhibits.push({
        group: panel,
        surface,
        position: panel.position.clone(),
        normal: new THREE.Vector3(Math.sin(position.angle), 0, Math.cos(position.angle)),
        post,
        frameWidth: width + .24,
      });
    }

    // A museum plinth keeps the panel visually separate from the wall and
    // creates the layered, walk-around exhibition rhythm from the references.
    box(width + .42, .12, .72, 0, -(height / 2 + .58), 0, darkMaterial, panel);
    box(width + .34, .035, .74, 0, -(height / 2 + .5), 0, frameMaterial, panel);
    box(.09, .46, .14, 0, -(height / 2 + .28), 0, frameMaterial, panel);
    box(width * .42, .025, .035, 0, height / 2 + .14, .24, glowMaterial, panel);
    const panelLight = new THREE.PointLight("#dce1c9", .34, 6.4, 1.8);
    panelLight.position.set(0, height / 2 + .32, .3);
    panel.add(panelLight);
    occluders.push(panel);
  }

  if (options.foyer) {
    addStandingPanel(
      { x: -6.2, y: 1.95, z: -5.8, angle: Math.PI / 2 },
      "THE PRIVATE FOYER",
      "A quiet entrance for unnamed thoughts. Move toward the hallway sign when you are ready.",
      0,
    );
    addStandingPanel(
      { x: 6.2, y: 1.95, z: 1.2, angle: -Math.PI / 2 },
      "ZCASH / SHIELDED",
      "The room is open. The person remains out of frame.",
      1,
    );
  } else if (singleRoom) {
    const gallery = galleries[0];
    const side = (gallery?.roomIndex ?? 0) % 2 === 0 ? -1 : 1;
    addStandingPanel(
      { x: side * 6.85, y: 1.95, z: worldFrontZ - 4.4, angle: side > 0 ? -Math.PI / 2 : Math.PI / 2 },
      gallery?.label ?? "ROOM",
      gallery?.description ?? "A room for unnamed thoughts.",
      gallery?.roomIndex ?? 0,
      gallery?.theme,
      gallery?.posts[0],
    );
    if (emptyRoom) {
      // Quiet rooms still need the layered reading rhythm from the museum
      // references. These are local archival labels, not live ZecHub content;
      // they keep an empty confession wall inhabited until real articles are
      // connected to the exhibition.
      const archivalStands = [
        {
          x: -5.85,
          z: 2.6,
          angle: Math.PI / 2,
          width: 1.28,
          height: 2.92,
          title: "ZEC HUB / ARCHIVE",
          body: "READING NOTE / SHIELDED VALUE. A quiet index for Zcash writing, proof systems, and the people building around them. LOCAL EXHIBITION / SOURCE PENDING.",
        },
        {
          x: 5.85,
          z: -.85,
          angle: -Math.PI / 2,
          width: 1.52,
          height: 3.18,
          title: "SCROLL 01 / ZK-SNARKS",
          body: "PROVE A STATEMENT WITHOUT REVEALING THE WITNESS. A short reading label for zero-knowledge systems. READ / MOVE / RETURN.",
        },
        {
          x: -3.45,
          z: -6.25,
          angle: 0,
          width: 1.38,
          height: 2.56,
          title: "ZEC HUB / FIELD NOTE",
          body: "PRIVATE BY DEFAULT / PUBLIC BY CHOICE. This room is waiting for live confessions; the archive keeps it inhabited while the wall stays quiet.",
        },
      ];
      archivalStands.forEach((stand, index) => {
        addStandingPanel(
          { x: stand.x, y: stand.height / 2 + .58, z: stand.z, angle: stand.angle },
          stand.title,
          stand.body,
          20 + index,
          gallery?.theme,
          undefined,
          { width: stand.width, height: stand.height },
        );
      });
    }
  } else {
    // The hallway receives freestanding curator panels in staggered pairs.
    // Their open spacing preserves a straight sightline to every room sign.
    galleryLayout.forEach((room) => {
      addStandingPanel(
        { x: room.side * 2.46, y: 1.72, z: room.center.z + (room.side < 0 ? 2.65 : -2.65), angle: room.side < 0 ? .1 : -.1 },
        room.label,
        room.description,
        room.index,
        room.theme,
      );
    });
  }

  // Proof-artifact displays are a second exhibition layer: small enough to
  // leave the confession walls readable, but visible enough to make the
  // connected rooms feel like one collection. Their content is local demo
  // art until HIDN has a real Zcash/NFT source to read from.
  const proofDisplays: ProofDisplay[] = [];
  function addProofDisplay(
    position: { x: number; y: number; z: number; angle: number },
    index: number,
    stand = false,
  ): void {
    const display = new THREE.Group();
    display.position.set(position.x, position.y, position.z);
    display.rotation.y = position.angle;
    scene.add(display);

    const width = stand ? 1.78 : 1.48;
    const height = stand ? 1.08 : .88;
    box(width + .26, height + .26, .17, 0, 0, 0, darkMaterial, display);
    box(width + .14, .07, .19, 0, (height + .12) / 2, .1, frameMaterial, display);
    box(width + .14, .07, .19, 0, -(height + .12) / 2, .1, frameMaterial, display);
    box(.07, height + .12, .19, -(width + .07) / 2, 0, .1, frameMaterial, display);
    box(.07, height + .12, .19, (width + .07) / 2, 0, .1, frameMaterial, display);

    const map = proofArtifactTexture(index);
    textures.add(map);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const screenMaterial = new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, fog: false });
    materials.add(screenMaterial);
    const screen = plane(width, height, screenMaterial, display);
    screen.position.z = .205;

    const glitchMaterial = new THREE.MeshBasicMaterial({ color: "#b8dc68", transparent: true, opacity: 0, depthWrite: false });
    materials.add(glitchMaterial);
    const glitchBar = box(width * .82, .026, .025, 0, 0, .225, glitchMaterial, display);

    if (stand) {
      box(.1, .66, .13, 0, -(height / 2 + .4), 0, frameMaterial, display);
      box(1.72, .1, .56, 0, -(height / 2 + .77), 0, darkMaterial, display);
      box(1.82, .035, .58, 0, -(height / 2 + .71), 0, frameMaterial, display);
      box(.12, .16, .5, -.68, -(height / 2 + .84), 0, frameMaterial, display);
      box(.12, .16, .5, .68, -(height / 2 + .84), 0, frameMaterial, display);
    }

    proofDisplays.push({ screenMaterial, texture: map, glitchBar, phase: index * 1.73 });
  }

  if (options.foyer) {
    addProofDisplay({ x: -11.96, y: 3.45, z: -4.8, angle: Math.PI / 2 }, 0);
    addProofDisplay({ x: 11.96, y: 3.45, z: 4.8, angle: -Math.PI / 2 }, 1);
  } else if (singleRoom) {
    // The side installation reads like a small gallery television without
    // narrowing the open path through the room.
    addProofDisplay({ x: 9.92, y: 2.45, z: worldBackZ + 4.6, angle: -Math.PI / 2 }, galleries[0]?.roomIndex ?? 0, true);
    addProofDisplay({ x: 0, y: 4.82, z: worldBackZ + .08, angle: 0 }, (galleries[0]?.roomIndex ?? 0) + 1);
  } else {
    // One quiet “market wall” panel sits above the hallway's open signboards;
    // the smaller panels repeat the installation along every room approach.
    galleryLayout.forEach((room) => {
      addProofDisplay({
        x: room.side * 3.03,
        y: 3.55,
        z: room.center.z - 4.15,
        angle: room.side > 0 ? -Math.PI / 2 : Math.PI / 2,
      }, room.index);
    });
    addProofDisplay({ x: 0, y: 4.78, z: worldBackZ + .08, angle: 0 }, galleryLayout.length + 1);
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const clickable = [floor, ...occluders, ...entranceObjects, ...exhibits.map((e) => e.group)];
  const ringGeometry = new THREE.RingGeometry(.21, .27, 40);
  geometries.add(ringGeometry);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: "#d2e5cb", transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false });
  materials.add(ringMaterial);
  const floorCursor = new THREE.Mesh(ringGeometry, ringMaterial);
  floorCursor.rotation.x = -Math.PI / 2; floorCursor.position.y = .025; floorCursor.visible = false;
  scene.add(floorCursor);
  root.addEventListener("museum-enter", requestEntry, events);
  const reader = root.querySelector<HTMLElement>("[data-museum-reader]");
  const status = root.querySelector<HTMLElement>("[data-museum-status]");
  const mapPosition = root.querySelector<SVGElement>("[data-museum-map-position]");
  const mapHeading = root.querySelector<SVGElement>("[data-museum-map-heading]");
  const mapPoint = (x: number, z: number): { x: number; y: number } => {
    if (singleRoom) {
      const roomIndex = galleries[0]?.roomIndex ?? 0;
      const side = roomIndex % 2 === 0 ? -1 : 1;
      const row = Math.floor(roomIndex / 2);
      const roomCenterX = side < 0 ? 28.5 : 91.5;
      return {
        x: roomCenterX + THREE.MathUtils.clamp(x, -11.2, 11.2) * (16 / 11.2),
        y: 10 + row * 44 + THREE.MathUtils.clamp((worldFrontZ - z) / worldDepth, 0, 1) * 30,
      };
    }
    return {
      x: 60 + THREE.MathUtils.clamp(x, -HALF_WIDTH, HALF_WIDTH) * (52 / HALF_WIDTH),
      y: 6 + THREE.MathUtils.clamp((worldFrontZ - z) / worldDepth, 0, 1) * 138,
    };
  };
  // The SVG map is intentionally taller than it is wide, so a raw yaw angle
  // would not keep the heading aligned with the camera on both axes. Project
  // the camera's ground-plane direction through the same map scales first.
  const mapScaleX = singleRoom ? 16 / 11.2 : 52 / HALF_WIDTH;
  const mapScaleY = singleRoom ? 30 / worldDepth : 138 / worldDepth;
  const mapHeadingAngle = (cameraYaw: number): number => THREE.MathUtils.radToDeg(
    Math.atan2(Math.sin(cameraYaw) * mapScaleX, Math.cos(cameraYaw) * mapScaleY),
  );
  let returnFocus: HTMLElement | null = null;
  function closeReader(): void {
    if (reader) reader.hidden = true;
    returnFocus?.focus();
    returnFocus = null;
  }
  function showPost(index: number): void {
    const exhibit = exhibits[index];
    if (!exhibit || !reader) return;
    root.dataset.museumSelected = String(index);
    reader.querySelector<HTMLElement>("[data-museum-post-category]")!.textContent = exhibit.post.category ?? "THOUGHT";
    reader.querySelector<HTMLElement>("[data-museum-post-text]")!.textContent = exhibit.post.text;
    const link = reader.querySelector<HTMLAnchorElement>("[data-museum-post-link]");
    if (link) {
      link.hidden = !exhibit.post.id;
      if (exhibit.post.id) link.href = `/c/${encodeURIComponent(exhibit.post.id)}`;
    }
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : canvas;
    reader.hidden = false;
    reader.querySelector<HTMLButtonElement>("[data-museum-reader-close]")?.focus();
  }
  function enterGallery(index: number): void {
    const room = galleryLayout.find((candidate) => candidate.index === index);
    if (!room) return;
    const destination = new THREE.Vector3(room.side * 7.2, EYE_HEIGHT, room.center.z);
    const lookYaw = room.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    moveTo(destination, lookYaw, () => {
      options.onGalleryEnter?.(galleries[room.index]);
      root.dataset.museumGallery = room.key;
    });
  }
  function allowed(x: number, z: number): boolean {
    if (singleRoom) {
      return Math.abs(x) < HALF_WIDTH - .65
        && z > worldBackZ + .65 && z < worldFrontZ - .65
        && !obstacles.some((obstacle) => x > obstacle.minX && x < obstacle.maxX && z > obstacle.minZ && z < obstacle.maxZ);
    }
    if (!options.foyer) return canWalk(galleryLayout, { x, z });
    return Math.abs(x) < HALF_WIDTH - .65 && Math.abs(z) < 17 - .65
      && !obstacles.some((o) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ);
  }
  function safeDestination(requested: THREE.Vector3): THREE.Vector3 {
    const destination = camera.position.clone();
    const distance = Math.hypot(requested.x - destination.x, requested.z - destination.z);
    const steps = Math.max(1, Math.ceil(distance / .12));
    for (let step = 1; step <= steps; step++) {
      const x = THREE.MathUtils.lerp(camera.position.x, requested.x, step / steps);
      const z = THREE.MathUtils.lerp(camera.position.z, requested.z, step / steps);
      if (!allowed(x, z)) break;
      destination.set(x, EYE_HEIGHT, z);
    }
    return destination;
  }
  function clearPath(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const steps = Math.max(1, Math.ceil(from.distanceTo(to) / .1));
    for (let i = 1; i <= steps; i++) {
      if (!allowed(THREE.MathUtils.lerp(from.x, to.x, i / steps), THREE.MathUtils.lerp(from.z, to.z, i / steps))) return false;
    }
    return true;
  }
  function walkingPath(requested: THREE.Vector3): THREE.Vector3[] {
    const from = camera.position.clone();
    const to = new THREE.Vector3(
      THREE.MathUtils.clamp(requested.x, -11.3, 11.3),
      EYE_HEIGHT,
      THREE.MathUtils.clamp(requested.z, worldBackZ + .75, worldFrontZ - .75),
    );
    if (singleRoom) {
      if (clearPath(from, to)) return [from, to];
      const routes: THREE.Vector3[][] = [];
      for (const obstacle of obstacles) {
        const left = obstacle.minX - .72;
        const right = obstacle.maxX + .72;
        routes.push(
          [from, new THREE.Vector3(left, EYE_HEIGHT, from.z), new THREE.Vector3(left, EYE_HEIGHT, to.z), to],
          [from, new THREE.Vector3(right, EYE_HEIGHT, from.z), new THREE.Vector3(right, EYE_HEIGHT, to.z), to],
        );
      }
      const pathDistance = (path: THREE.Vector3[]): number => path.slice(1).reduce((distance, point, index) => distance + path[index].distanceTo(point), 0);
      const validRoutes = routes.filter((path) => path.slice(1).every((point, index) => clearPath(path[index], point)));
      validRoutes.sort((a, b) => pathDistance(a) - pathDistance(b));
      if (validRoutes[0]) return validRoutes[0];
      return [from, safeDestination(to)];
    }
    if (!options.foyer) {
      return museumWalkingPath(galleryLayout, { x: from.x, z: from.z }, { x: to.x, z: to.z })
        .map((point) => new THREE.Vector3(point.x, EYE_HEIGHT, point.z));
    }
    if (clearPath(from, to)) return [from, to];
    if (!allowed(to.x, to.z)) return [from, safeDestination(to)];
    // A small navigation grid lets a floor tap walk around exhibition walls and benches.
    const grid = .4;
    const startX = Math.round(from.x / grid); const startZ = Math.round(from.z / grid);
    const endX = Math.round(to.x / grid); const endZ = Math.round(to.z / grid);
    const key = (x: number, z: number): string => `${x},${z}`;
    const startKey = key(startX, startZ); const endKey = key(endX, endZ);
    const open = [{ x: startX, z: startZ, cost: 0, score: 0 }];
    const costs = new Map<string, number>([[startKey, 0]]);
    const previous = new Map<string, string>();
    const closed = new Set<string>();
    let found = false;
    while (open.length && closed.size < 6000) {
      open.sort((a, b) => a.score - b.score);
      const current = open.shift()!;
      const currentKey = key(current.x, current.z);
      if (closed.has(currentKey)) continue;
      if (currentKey === endKey) { found = true; break; }
      closed.add(currentKey);
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const x = current.x + dx; const z = current.z + dz;
        const nextKey = key(x, z); const cost = current.cost + 1;
        if (!allowed(x * grid, z * grid) || closed.has(nextKey) || cost >= (costs.get(nextKey) ?? Infinity)) continue;
        costs.set(nextKey, cost); previous.set(nextKey, currentKey);
        open.push({ x, z, cost, score: cost + Math.abs(x - endX) + Math.abs(z - endZ) });
      }
    }
    if (!found) return [from, safeDestination(to)];
    const raw: THREE.Vector3[] = [to];
    let current = endKey;
    while (current !== startKey) {
      const [x, z] = current.split(",").map(Number);
      raw.push(new THREE.Vector3(x * grid, EYE_HEIGHT, z * grid));
      current = previous.get(current)!;
    }
    raw.push(from); raw.reverse();
    const path: THREE.Vector3[] = [from];
    let index = 0;
    while (index < raw.length - 1) {
      let next = raw.length - 1;
      while (next > index + 1 && !clearPath(raw[index], raw[next])) next--;
      path.push(raw[next]); index = next;
    }
    return path;
  }
  function moveTo(requested: THREE.Vector3, targetYaw = yaw, complete?: () => void, targetPitch = pitch): void {
    closeReader();
    const path = walkingPath(requested);
    const to = path[path.length - 1];
    const difference = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
    floorCursor.visible = false;
    if (path.length < 2 || !to) {
      yaw += difference;
      pitch = targetPitch;
      dirty = true;
      complete?.();
      return;
    }
    if (reducedMotion.matches) {
      camera.position.copy(to); yaw += difference; pitch = targetPitch; dirty = true; complete?.(); return;
    }
    const lengths = path.slice(1).map((point, i) => path[i].distanceTo(point));
    const distance = lengths.reduce((sum, length) => sum + length, 0);
    movement = { path, lengths, distance, yaw: yaw + difference, fromYaw: yaw, pitch: targetPitch, fromPitch: pitch, started: performance.now(), duration: THREE.MathUtils.clamp(distance * 110, 300, 1200), complete };
    dirty = true;
  }
  function approachExhibit(index: number): void {
    const exhibit = exhibits[index];
    if (!exhibit) return;
    // Fit the complete museum frame on portrait phones, including after zoom.
    const horizontalScale = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
    const readingDistance = Math.max(3.3, exhibit.frameWidth / (2 * horizontalScale * .88));
    const destination = exhibit.position.clone().addScaledVector(exhibit.normal, readingDistance);
    destination.y = EYE_HEIGHT;
    const lookYaw = Math.atan2(exhibit.normal.x, exhibit.normal.z);
    moveTo(destination, lookYaw, () => showPost(index), Math.atan2(exhibit.position.y - EYE_HEIGHT, readingDistance));
  }
  function step(forward: number, sideways = 0): void {
    const target = camera.position.clone();
    target.x += -Math.sin(yaw) * forward + Math.cos(yaw) * sideways;
    target.z += -Math.cos(yaw) * forward - Math.sin(yaw) * sideways;
    moveTo(target);
  }
  function pick(x: number, y: number): THREE.Intersection | undefined {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(clickable, true)[0];
  }
  const pointers = new Map<number, { x: number; y: number }>();
  let start = { x: 0, y: 0, yaw: 0, pitch: 0 };
  let dragged = false;
  let pinched = false;
  let pinchDistance = 0;
  function pointerDistance(): number {
    const values = [...pointers.values()];
    return values.length === 2 ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) : 0;
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (entryActive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    options.onActivity?.();
    canvas.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    movement = undefined;
    if (pointers.size === 1) {
      start = { x: event.clientX, y: event.clientY, yaw, pitch }; dragged = false; pinched = false;
    } else { pinched = true; pinchDistance = pointerDistance(); }
    root.dataset.museumDragging = "true";
  }, events);
  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType === "mouse" && !movement && (!reader || reader.hidden) && !entryActive) {
        const hit = pick(event.clientX, event.clientY);
        floorCursor.visible = hit?.object === floor && allowed(hit.point.x, hit.point.z);
        if (floorCursor.visible && hit) floorCursor.position.set(hit.point.x, .025, hit.point.z);
        canvas.style.cursor = hit?.object !== floor && hit ? "pointer" : "grab";
        dirty = true;
      }
      return;
    }
    options.onActivity?.();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const nextDistance = pointerDistance();
      camera.fov = THREE.MathUtils.clamp(camera.fov - (nextDistance - pinchDistance) * .1, 42, 82);
      pinchDistance = nextDistance; camera.updateProjectionMatrix();
    } else if (!pinched) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      dragged ||= Math.hypot(dx, dy) > 6;
      yaw = start.yaw + dx * .0032;
      pitch = THREE.MathUtils.clamp(start.pitch + dy * .0025, -.95, .95);
    }
    floorCursor.visible = false; dirty = true;
  }, events);
  canvas.addEventListener("pointerup", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!dragged && !pinched) {
      const hit = pick(event.clientX, event.clientY);
      if (hit?.object === floor) moveTo(hit.point);
      else if (typeof hit?.object.userData.roomIndex === "number") enterGallery(hit.object.userData.roomIndex);
      else if (hit?.object.userData.returnToMain) options.onReturnToMain?.();
      else if (hit?.object.userData.entrance) requestEntry();
      else if (hit && typeof hit.object.userData.exhibitIndex === "number") approachExhibit(hit.object.userData.exhibitIndex);
    }
    if (!pointers.size) root.dataset.museumDragging = "false";
  }, events);
  const release = (): void => { pointers.clear(); root.dataset.museumDragging = "false"; };
  canvas.addEventListener("pointercancel", release, events);
  canvas.addEventListener("lostpointercapture", (event) => { pointers.delete(event.pointerId); if (!pointers.size) release(); }, events);
  canvas.addEventListener("pointerleave", () => { floorCursor.visible = false; dirty = true; }, events);
  canvas.addEventListener("wheel", (event) => {
    if (entryActive) return;
    options.onActivity?.();
    event.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * .025, 42, 82);
    camera.updateProjectionMatrix(); dirty = true;
  }, { ...events, passive: false });
  root.querySelectorAll<HTMLButtonElement>("[data-museum-action]").forEach((button) => {
    button.addEventListener("click", () => {
      options.onActivity?.();
      const action = button.dataset.museumAction;
      if (action === "forward") step(2.4);
      if (action === "back") step(-2.4);
      if (action === "left" || action === "right") { movement = undefined; yaw += action === "left" ? Math.PI / 8 : -Math.PI / 8; dirty = true; }
      if (action === "zoom-in" || action === "zoom-out") {
        camera.fov = THREE.MathUtils.clamp(camera.fov + (action === "zoom-in" ? -6 : 6), 42, 82); camera.updateProjectionMatrix(); dirty = true;
      }
      if (action === "reset") {
        const view = options.foyer ? foyerInitialView : initialView;
        movement = undefined; camera.position.set(view.x, EYE_HEIGHT, view.z);
        yaw = !options.foyer && window.matchMedia("(max-width: 760px)").matches ? -.8 : view.yaw;
        pitch = view.pitch; camera.fov = view.fov; camera.updateProjectionMatrix(); closeReader(); dirty = true;
      }
      if (action === "map") {
        const map = root.querySelector<HTMLElement>("[data-museum-map]");
        if (map) { map.hidden = !map.hidden; button.setAttribute("aria-expanded", String(!map.hidden)); }
      }
    }, events);
  });
  root.querySelector<HTMLButtonElement>("[data-museum-reader-close]")?.addEventListener("click", () => {
    options.onActivity?.();
    closeReader();
  }, events);
  root.querySelectorAll<HTMLButtonElement>("[data-museum-exhibit]").forEach((button) => {
    button.addEventListener("click", () => {
      options.onActivity?.();
      const exhibition = root.querySelector<HTMLDetailsElement>("[data-museum-exhibition]");
      if (exhibition) exhibition.open = false;
      canvas.focus({ preventScroll: true });
      approachExhibit(Number(button.dataset.museumExhibit));
    }, events);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-museum-room]").forEach((button) => {
    button.addEventListener("click", () => {
      options.onActivity?.();
      const exhibition = root.querySelector<HTMLDetailsElement>("[data-museum-exhibition]");
      if (exhibition) exhibition.open = false;
      canvas.focus({ preventScroll: true });
      const room = galleryLayout.find((candidate) => candidate.key === button.dataset.museumRoom);
      if (room) enterGallery(room.index);
    }, events);
  });
  root.addEventListener("keydown", (event) => {
    if (entryActive) return;
    if (event.target instanceof Element && event.target.closest("input,textarea,select")) return;
    if (event.key === "Escape") { options.onActivity?.(); closeReader(); return; }
    if (reader && !reader.hidden) {
      if (event.key === "Tab") {
        const controls = [...reader.querySelectorAll<HTMLElement>("button,a[href]")].filter((el) => !el.hidden);
        if ((event.shiftKey && document.activeElement === controls[0]) || (!event.shiftKey && document.activeElement === controls.at(-1))) {
          event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
        }
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (event.target !== canvas && event.target instanceof Element && event.target.closest("button,a,summary")) return;
    if (!["w", "s", "a", "d", "arrowleft", "arrowright", "arrowup", "arrowdown", "enter"].includes(key)) return;
    options.onActivity?.();
    event.preventDefault();
    if (key === "w") step(1.8);
    if (key === "s") step(-1.8);
    if (key === "a") step(0, -1.6);
    if (key === "d") step(0, 1.6);
    if (key === "arrowleft") yaw += .13;
    if (key === "arrowright") yaw -= .13;
    if (key === "arrowup") pitch = Math.min(.95, pitch + .1);
    if (key === "arrowdown") pitch = Math.max(-.95, pitch - .1);
    if (key === "enter" && event.target === canvas) {
      const hit = pick(canvas.getBoundingClientRect().left + canvas.clientWidth / 2, canvas.getBoundingClientRect().top + canvas.clientHeight / 2);
      if (hit?.object.userData.entrance) requestEntry();
      else if (hit?.object.userData.returnToMain) options.onReturnToMain?.();
      else if (typeof hit?.object.userData.roomIndex === "number") enterGallery(hit.object.userData.roomIndex);
      else if (hit && typeof hit.object.userData.exhibitIndex === "number") approachExhibit(hit.object.userData.exhibitIndex);
    }
    dirty = true;
  }, events);
  const resize = new ResizeObserver(() => {
    const width = host.clientWidth; const height = host.clientHeight;
    if (!width || !height || disposed) return;
    // Give dense phone screens sharper lettering while bounding the GPU cost
    // on large displays. Recalculate when the phone rotates or the view resizes.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5, Math.sqrt(2_400_000 / (width * height))));
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true;
  });
  resize.observe(host);
  host.dataset.museumRenderer = "webgl";
  root.querySelector<HTMLElement>("[data-museum-loading]")?.setAttribute("hidden", "");
  function updateView(): void {
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    camera.updateMatrixWorld();
    root.dataset.museumPosition = `${camera.position.x.toFixed(2)},${camera.position.z.toFixed(2)}`;
    root.dataset.museumHeading = String(Math.round(THREE.MathUtils.radToDeg(yaw)));
    root.dataset.museumMoving = String(Boolean(movement));
    const heading = ((-THREE.MathUtils.radToDeg(yaw) % 360) + 360) % 360;
    root.querySelector<HTMLElement>("[data-museum-compass]")?.style.setProperty("--museum-heading", `${heading}deg`);
    const map = mapPoint(camera.position.x, camera.position.z);
    mapPosition?.setAttribute("cx", String(map.x));
    mapPosition?.setAttribute("cy", String(map.y));
    mapHeading?.setAttribute("transform", `translate(${map.x} ${map.y}) rotate(${mapHeadingAngle(yaw)})`);
    const gallery = !options.foyer && !singleRoom ? galleryAt(galleryLayout, { x: camera.position.x, z: camera.position.z }) : undefined;
    root.dataset.museumGallery = gallery?.key ?? "hallway";
    if (status) status.textContent = movement
      ? "MOVING THROUGH THE MUSEUM"
        : singleRoom
        ? `${galleries[0]?.label ?? "ROOM"} · TAP A FRAME TO READ · MAIN ROOM AT THE OPENING`
        : gallery ? `${gallery.label} · TAP A FRAME TO READ · ROOM SIGNS STAY OPEN` : "HALLWAY · TAP A ROOM SIGN TO ENTER · TAP A FRAME TO READ";
    if (!entryActive) {
      const view = { x: camera.position.x, z: camera.position.z, yaw, pitch, fov: camera.fov };
      if (options.foyer) foyerView = view; else savedView = view;
    }
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    abort.abort(); resize.disconnect(); cancelAnimationFrame(animationId);
    renderer.dispose(); renderer.forceContextLoss();
    textures.forEach((t) => t.dispose()); materials.forEach((m) => m.dispose()); geometries.forEach((g) => g.dispose());
    canvas.remove();
  }
  const entryFrom = camera.position.clone();
  const entryYaw = yaw;
  const entryPitch = pitch;
  const ease = (value: number): number => { const p = THREE.MathUtils.clamp(value, 0, 1); return p * p * (3 - 2 * p); };
  function animate(time: number): void {
    if (disposed) return;
    if (!host?.isConnected) { dispose(); return; }
    if (!document.hidden && time - lastTime > 1000 / 45) {
      lastTime = time;
      if (entryActive && !entryComplete) {
        entryStarted ??= time;
        const progress = reducedMotion.matches ? 1 : Math.min(1, (time - entryStarted) / 3200);
        const align = ease(progress / .32);
        const open = ease((progress - .2) / .4);
        const walk = ease((progress - .52) / .48);
        camera.position.set(THREE.MathUtils.lerp(entryFrom.x, 0, align), EYE_HEIGHT,
          THREE.MathUtils.lerp(THREE.MathUtils.lerp(entryFrom.z, -10.8, align), -20.3, walk));
        yaw = entryYaw + Math.atan2(Math.sin(-entryYaw), Math.cos(-entryYaw)) * align;
        pitch = THREE.MathUtils.lerp(entryPitch, .025, align);
        doorLeaves.forEach((leaf, index) => { leaf.rotation.y = (index === 0 ? 1 : -1) * open * Math.PI * .49; });
        root.dataset.museumEntryPhase = progress < .2 ? "approaching" : progress < .6 ? "opening" : "entering";
        dirty = true;
        if (progress >= 1) {
          entryComplete = true;
          entryActive = false;
          canvas.tabIndex = 0;
          const complete = entryCompletion;
          entryCompletion = undefined;
          complete?.();
          if (disposed) return;
        }
      }
      if (movement) {
        const progress = Math.min(1, (time - movement.started) / movement.duration);
        const eased = progress * progress * (3 - 2 * progress);
        let distance = movement.distance * eased;
        let segment = 0;
        while (segment < movement.lengths.length - 1 && distance > movement.lengths[segment]) distance -= movement.lengths[segment++];
        camera.position.lerpVectors(movement.path[segment], movement.path[segment + 1], movement.lengths[segment] > 0 ? distance / movement.lengths[segment] : 1);
        yaw = THREE.MathUtils.lerp(movement.fromYaw, movement.yaw, eased);
        pitch = THREE.MathUtils.lerp(movement.fromPitch, movement.pitch, eased);
        dirty = true;
        if (progress >= 1) { const complete = movement.complete; movement = undefined; complete?.(); }
      }
      galleryLights.forEach(({ light, base, phase }) => {
        const wave = Math.sin(time * .004 + phase) * .055 + Math.sin(time * .017 + phase * 2.1) * .025;
        const step = Math.floor(time / 190 + phase * 10) % 17;
        light.intensity = base * (0.91 + wave + (step === 4 || step === 5 ? -.14 : 0));
      });
      roomInteriorLights.forEach(({ light, base, phase }) => {
        const wave = Math.sin(time * .0046 + phase) * .08 + Math.sin(time * .021 + phase * 1.7) * .035;
        const step = Math.floor(time / 164 + phase * 8) % 23;
        light.intensity = base * (0.92 + wave + (step === 6 || step === 7 ? -.2 : 0));
      });
      const glitchStep = Math.floor(time / 135) % 29;
      const glitchScale = glitchStep === 4 ? .16 : glitchStep === 5 ? 1.3 : glitchStep === 12 ? .42 : 1;
      const glitchBreath = .94 + Math.sin(time * .0048) * .045;
      glitchLight.intensity = glitchLightBase * glitchScale * glitchBreath;
      glitchBulb.scale.setScalar(.78 + glitchScale * .22);
      proofDisplays.forEach((display) => {
        const screenStep = Math.floor(time / 118 + display.phase * 8) % 41;
        const barActive = screenStep === 5 || screenStep === 6 || screenStep === 23;
        display.screenMaterial.opacity = screenStep === 6 ? .48 : screenStep === 5 ? .8 : 1;
        display.texture.offset.x = screenStep === 5 ? .006 : screenStep === 6 ? -.004 : 0;
        display.texture.offset.y = screenStep === 23 ? .004 : 0;
        display.glitchBar.visible = barActive;
        display.glitchBar.position.y = screenStep === 23 ? -.16 : screenStep === 6 ? .18 : .04;
        display.glitchBar.scale.x = screenStep === 6 ? .72 : screenStep === 23 ? 1.14 : .9;
        (display.glitchBar.material as THREE.MeshBasicMaterial).opacity = screenStep === 6 ? .72 : .4;
      });
      shieldedScreens.forEach((display) => {
        const screenStep = Math.floor(time / 102 + display.phase * 7) % 37;
        const barActive = screenStep === 4 || screenStep === 5 || screenStep === 19 || screenStep === 28;
        display.screenMaterial.opacity = screenStep === 5 ? .5 : screenStep === 4 ? .84 : 1;
        display.texture.offset.x = screenStep === 4 ? .004 : screenStep === 5 ? -.003 : 0;
        display.glitchBar.visible = barActive;
        display.glitchBar.position.y = screenStep === 19 ? -.24 : screenStep === 28 ? .18 : .03;
        display.glitchBar.scale.x = screenStep === 5 ? .58 : screenStep === 19 ? 1.18 : .88;
        (display.glitchBar.material as THREE.MeshBasicMaterial).opacity = screenStep === 5 ? .76 : .46;
      });
      dirty = true;
      if (dirty) { updateView(); renderer.render(scene, camera); dirty = false; }
    }
    animationId = requestAnimationFrame(animate);
  }
  updateView();
  animationId = requestAnimationFrame(animate);
  // Context loss remains usable through the semantic exhibition list.
  canvas.addEventListener("webglcontextlost", () => {
    const loading = root.querySelector<HTMLElement>("[data-museum-loading]");
    if (loading) { loading.hidden = false; loading.textContent = "3D view paused. You can still read every thought in the exhibition list."; }
    const exhibition = root.querySelector<HTMLDetailsElement>("[data-museum-exhibition]");
    if (exhibition) exhibition.open = true;
  }, events);
  return dispose;
}
