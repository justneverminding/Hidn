import * as THREE from "three";
import { LITE } from "../perf";
import {
  createMuseumLayout,
  canWalk,
  galleryAt,
  museumWalkingPath,
  type GalleryDefinition,
  type GalleryLayout,
  type MuseumTheme,
} from "./museum-layout";
import { fetchShieldedScanStats } from "./shieldedscan";
import { buildExhibitionArchitecture, exhibitionGraphic, type ExhibitionBuilder } from "./museum-exhibition";
import { buildConfessionInstallation, CONFESSION_STYLE_CAPACITY, confessionStyleFor, confessionTexture, FIRST_THOUGHT, type ConfessionLook } from "./museum-confessions";
import { FOYER_TV, LIBRARY_TV, addLibraryPortal, addTelevisionStack, buildHallwayInstallation, buildLibraryInstallation, buildMainRoomInstallation, buildRoomInstallation, type InstallationHooks } from "./museum-installations";

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
  onLibraryEnter?: () => void;
  library?: boolean;
  /** Ease the view toward the cursor, so a background scene feels alive. */
  ambientLook?: boolean;
  onEnter?: (beginEntry: (complete: () => void) => void) => void;
}

interface Exhibit {
  group: THREE.Object3D;
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

const EYE_HEIGHT = 1.7;
const HALF_WIDTH = 12;
const initialView = { x: 0, z: 7.2, yaw: 0, pitch: -0.035, fov: 66 };
const roomViews = new Map<string, typeof initialView>();
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
  const styles: MuseumCardStyle[] = ["archive", "label", "paper", "signal", "blueprint"];
  const style = styles[index % styles.length];
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
  const height = Math.min(3.25, Math.max(1.55, 1.3 + estimatedLines * .24 + styleOffset + (style === "archive" ? .7 : 0)));
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
    const background = isPaper ? "#c9c6b7" : isBlueprint ? "#29302b" : isSignal ? "#202721" : "#141b17";
    const ink = isPaper ? "#242a24" : "#e9e7d9";
    const mutedInk = isPaper ? "#526155" : "#a4afa0";
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
    ctx.lineWidth = 1;

    ctx.fillStyle = accent;
    ctx.font = `${isLabel ? 20 : 22}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText(`${String(index + 1).padStart(2, "0")}  /  ${post.id ? "UNNAMED" : "SAMPLE THOUGHT"}`, pad, 105);
    ctx.textAlign = "right";
    ctx.fillText((post.category ?? "THOUGHT").toUpperCase().slice(0, 19), canvasWidth - pad, 105);
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
  return exhibitionGraphic(title, body, index);
}



/** Physical geometry, first-person camera and raycast navigation. No panorama backdrop. */
export function mountRoomMuseum(root: HTMLElement, posts: MuseumPost[], signal: boolean, options: MuseumOptions = {}): () => void {
  const host = root.querySelector<HTMLElement>("[data-museum-stage]");
  if (!host) return () => {};
  const galleries: MuseumGallery[] = options.galleries?.length
    ? options.galleries
    : [{ key: "general", label: "GENERAL", description: "everything people are saying", posts }];
  const singleRoom = options.roomMode === "gallery";
  const galleryLayout: GalleryLayout[] = options.foyer || singleRoom ? [] : createMuseumLayout(galleries);
  const galleryPairs = Math.max(1, Math.ceil(galleryLayout.length / 2));
  const worldFrontZ = options.foyer ? 17 : singleRoom ? 11 : 10;
  const worldBackZ = options.foyer ? -17 : singleRoom ? -11 : -((galleryPairs - 1) * 20 + 10);
  const worldDepth = worldFrontZ - worldBackZ;
  const worldCenterZ = (worldFrontZ + worldBackZ) / 2;
  const emptyRoom = singleRoom && !options.library && (galleries[0]?.posts.length ?? 0) === 0;
  const abort = new AbortController();
  const events = { signal: abort.signal };
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const occluders: THREE.Object3D[] = [];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101611");
  scene.fog = new THREE.Fog("#111b15", 28, 78);
  // Lite devices skip antialiasing and shadows; the scene reads the same.
  const renderer = new THREE.WebGLRenderer({ antialias: !LITE, alpha: false, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.shadowMap.enabled = !LITE;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "room-museum__canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "3D museum. Drag to look around, tap the floor to walk, tap a framed thought to read, and select a room sign to enter. Use W and S to walk, A and D to move sideways, arrow keys to look.");
  host.prepend(canvas);
  const viewKey = singleRoom ? galleries[0]?.key ?? "general" : "hall";
  const defaultView = singleRoom ? { ...initialView, yaw: .18, fov: 70 } : initialView;
  const startingView = options.foyer ? foyerView : roomViews.get(viewKey) ?? defaultView;
  const camera = new THREE.PerspectiveCamera(startingView.fov, 1, 0.08, 110);
  camera.position.set(startingView.x, EYE_HEIGHT, startingView.z);
  // Portrait screens have a narrow horizontal view; a first visit starts a
  // few steps back so the zebra and the Zcash pillar are both in frame.
  if (options.foyer && startingView === foyerView && foyerView.x === foyerInitialView.x && foyerView.z === foyerInitialView.z
    && host.clientWidth < host.clientHeight * .8) camera.position.z = 6.2;
  camera.rotation.order = "YXZ";
  let yaw = startingView.yaw;
  let pitch = startingView.pitch;
  let disposed = false;
  let animationId = 0;
  let lastTime = 0;
  let dirty = true;
  const hoverLook = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
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
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#30382f", roughness: .94 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#596151", roughness: .58, metalness: .38 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#101711", roughness: .8 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: "#bfc9af" });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: "#343c33", roughness: .48, metalness: .5 });
  const innerMaterial = new THREE.MeshStandardMaterial({ color: "#171f18", roughness: .68, metalness: .2 });
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
    label("HALLWAY", 4.8, .8, 0, 4.78, worldFrontZ - .2, Math.PI, 64);
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
      // The sign sits on the arch face, above the portal opening.
      const signX = room.side * 3.26;
      const signboard = box(.12, .78, 2.6, signX, 5.02, z, darkMaterial);
      signboard.userData.roomIndex = room.index;
      box(.03, .03, 2.4, signX - room.side * .07, 5.39, z, roomAccent);
      box(.03, .03, 2.4, signX - room.side * .07, 4.65, z, roomAccent);
      const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      materials.add(hitMaterial);
      const hit = box(.46, 4.25, 3.45, x, 2.1, z, hitMaterial);
      hit.userData.roomIndex = room.index;
      entranceObjects.push(hit);
      box(.05, .035, 3.15, room.side * 11.92, .27, z, roomAccent);
      box(.1, .1, .16, signX - room.side * .08, 5.6, z, room.hasNewSignal ? roomAccent : trimMaterial);
      label(room.label, 2.3, .56, signX - room.side * .09, 5.04, z, room.side > 0 ? -Math.PI / 2 : Math.PI / 2, 72);
    }
  }

  const floorMap = texture(canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = "#222820"; ctx.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const shade = 43 + ((row * 17 + col * 23) % 6);
        ctx.fillStyle = `rgb(${shade + 2},${shade + 5},${shade})`;
        ctx.fillRect(col * 256 + 1, row * 256 + 1, 254, 254);
      }
    }
  }));
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
  floorMap.repeat.set(4, Math.max(5.7, worldDepth / 6));
  floorMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorMap, roughness: .34, metalness: .12 });
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
  const starsMaterial = new THREE.PointsMaterial({ color: "#88ab91", size: .065, transparent: true, opacity: .12 });
  materials.add(starsMaterial);
  scene.add(new THREE.Points(starsGeometry, starsMaterial));

  const obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  const installationHooks: InstallationHooks = { live: [], tick: [], frame: [], camera };
  const exhibitionBuilder: ExhibitionBuilder = {
    scene, box, plane, obstacles, material: sculptMaterial, texture,
    geometry: (geometry) => { geometries.add(geometry); return geometry; },
  };
  buildExhibitionArchitecture(exhibitionBuilder, {
    kind: options.foyer ? "main" : singleRoom ? "room" : "hall",
    index: galleries[0]?.roomIndex ?? 0,
    title: galleries[0]?.label ?? "The private room.",
    description: galleries[0]?.description ?? "A room for anonymous thoughts.",
    back: worldBackZ, front: worldFrontZ,
  });
  if (options.foyer) {
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
      label("HALLWAY", 5.22, .75, 0, 5.19, -16.61, 0, 156);
      label("THE ROOMS", 5.22, .34, 0, 4.82, -16.61, 0, 78);
    } else {
      box(5.94, .26, .31, 0, 4.45, -16.83, frameMaterial);
      label("ENTER THE ROOM", 3.1, .6, 0, 4.88, -16.81);
    }
    // The zebra and the Zcash pillar share one lit rotunda before the door.
    buildMainRoomInstallation(exhibitionBuilder, installationHooks, -5.6);
    if (options.privateFoyer) addTelevisionStack(exhibitionBuilder, installationHooks, FOYER_TV);
  }

  scene.add(new THREE.HemisphereLight("#e0e1ce", "#283326", 1.75));
  const ceilingLight = new THREE.DirectionalLight("#eee7d5", 2.2);
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
  const undergroundGlow = new THREE.PointLight("#b0c1a2", .8, 30, 1.7);
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
        y: index % 2 === 0 ? 2.95 : 2.6,
        z,
        angle: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      })));
      return slots.map((slot, index) => ({ ...slot, post: posts[index] }));
    })()
    : singleRoom
      ? (() => {
        // Confessions hang in the room's own installation first; only the
        // overflow reaches the side walls, so no frame is ever empty.
        const styleCapacity = options.library ? 0 : CONFESSION_STYLE_CAPACITY[confessionStyleFor(galleries[0]?.roomIndex ?? 0)];
        const roomPosts = (galleries[0]?.posts ?? posts).slice(styleCapacity);
        // Side walls fill from the entrance inward; larger rooms add two
        // freestanding partitions with a thought on each face.
        const wallSlots = [8.2, 4.1, 0, -4.1, -8.2].flatMap((z) => [-1, 1].map((side) => ({
          x: side * 11.82, y: Math.abs(z) === 4.1 ? 2.7 : 2.95, z, angle: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        })));
        const partitionSlots = [-1, 1].flatMap((side) => [
          { x: side * 6.82, y: 2.2, z: 4.5, angle: side < 0 ? -Math.PI / 2 : Math.PI / 2 },
          { x: side * 7.18, y: 2.2, z: 4.5, angle: side < 0 ? Math.PI / 2 : -Math.PI / 2 },
        ]);
        // Partitions go up only when every face will hold a thought, so a
        // freestanding wall is never left blank.
        const usesPartitions = roomPosts.length >= 6 + partitionSlots.length;
        if (usesPartitions) {
          for (const side of [-1, 1]) {
            box(.3, 3.7, 3.6, side * 7, 1.85, 4.5, wallMaterial);
            box(.34, .06, 3.64, side * 7, 3.72, 4.5, trimMaterial);
            obstacles.push({ minX: side * 7 - .5, maxX: side * 7 + .5, minZ: 2.4, maxZ: 6.6 });
          }
        }
        const slots = usesPartitions ? [...wallSlots.slice(0, 6), ...partitionSlots, ...wallSlots.slice(6)] : wallSlots;
        return slots.map((slot, index) => ({ ...slot, post: roomPosts[index] }));
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
    // Interpretive panels float off full-height architectural backings.
    // Alternate the mounts instead of repeating a grid of picture frames.
    if (options.foyer || singleRoom) {
      box(w + .36, 4.9, .08, 0, 2.65 - (placement.y ?? 2.25), -.11, index % 3 === 0 ? trimMaterial : darkMaterial, group);
    }
    box(w + .08, h + .08, .075, 0, 0, -.015, darkMaterial, group);
    box(w + .08, .027, .085, 0, (h + .04) / 2, .06, frameMaterial, group);
    box(w + .08, .027, .085, 0, -(h + .04) / 2, .06, frameMaterial, group);
    box(.027, h + .06, .085, -(w + .04) / 2, 0, .06, frameMaterial, group);
    box(.027, h + .06, .085, (w + .04) / 2, 0, .06, frameMaterial, group);
    box(w + .04, h + .04, .035, 0, 0, .08, innerMaterial, group);
    const map = texture(postTexture(post, index, signal, placementTheme));
    map.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false });
    materials.add(mat);
    const surface = plane(w, h, mat, group);
    const exhibitIndex = exhibits.length;
    surface.position.z = .105; surface.userData.exhibitIndex = exhibitIndex;
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
    group.children.forEach((object) => { object.userData.exhibitIndex = exhibitIndex; });
  });

  // Each themed room hangs its confessions in its own installation style
  // (museum-confessions), around a light shared layer of live data, scrolls
  // and a wallet kiosk. All geometry and textures are generated locally.
  function addRoomInterior(): void {
    if (!singleRoom) return;
    const roomIndex = galleries[0]?.roomIndex ?? 0;
    buildRoomInstallation(exhibitionBuilder, installationHooks, { back: worldBackZ, index: roomIndex, theme: roomTheme });
    if (options.library) {
      buildLibraryInstallation(exhibitionBuilder, installationHooks, -2.5);
    } else {
      const neutral = { accent: "#c9d3bd", glow: "#a9b69c", trim: "#4b5646", wall: "#171c18", floor: "#222820" };
      const theme = roomTheme ?? neutral;
      const roomPosts = galleries[0]?.posts ?? [];
      const pending: Array<{ surface: THREE.Mesh; post: MuseumPost; width: number }> = [];
      buildConfessionInstallation({
        b: exhibitionBuilder, hooks: installationHooks, theme, index: roomIndex, cz: -2.5, front: worldFrontZ, back: worldBackZ,
        posts: roomPosts.length ? roomPosts : [FIRST_THOUGHT],
        card: (post, parent, width, height, look: ConfessionLook, i) => {
          const map = texture(confessionTexture(post, look, theme, width / height, i));
          const material = new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false, side: look === "cloth" ? THREE.DoubleSide : THREE.FrontSide });
          materials.add(material);
          const surface = plane(width, height, material, parent);
          if (post !== FIRST_THOUGHT) pending.push({ surface, post: post as MuseumPost, width: width + .3 });
          return surface;
        },
      });
      // Register every hung confession as a readable exhibit.
      scene.updateMatrixWorld(true);
      for (const { surface, post, width } of pending) {
        const position = surface.getWorldPosition(new THREE.Vector3());
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
        normal.y = 0;
        if (normal.lengthSq() < .01) normal.set(0, 0, 1);
        normal.normalize();
        const exhibitIndex = exhibits.length;
        surface.userData.exhibitIndex = exhibitIndex;
        exhibits.push({ group: surface, surface, position, normal, post, frameWidth: width });
      }
    }



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
    const width = dimensions?.width ?? (hallwayPanel ? 1.35 : post ? 1.58 : 1.44);
    const height = dimensions?.height ?? (hallwayPanel ? 1.85 : post ? 2.4 : 2.35);
    const panel = new THREE.Group();
    panel.position.set(position.x, position.y, position.z);
    panel.rotation.y = position.angle;
    scene.add(panel);

    box(width + .24, height + .2, .16, 0, 0, 0, darkMaterial, panel);
    box(width + .1, .065, .2, 0, (height + .1) / 2, .1, frameMaterial, panel);
    box(width + .1, .065, .2, 0, -(height + .1) / 2, .1, frameMaterial, panel);
    box(.07, height + .1, .2, -(width + .05) / 2, 0, .1, frameMaterial, panel);
    box(.07, height + .1, .2, (width + .05) / 2, 0, .1, frameMaterial, panel);

    const map = texture(post
      ? postTexture(post, index + 40, signal, theme)
      : exhibitionPanelTexture(title, body, index, theme));
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
    if (!hallwayPanel) obstacles.push({ minX: position.x - .9, maxX: position.x + .9, minZ: position.z - .9, maxZ: position.z + .9 });
    occluders.push(panel);
  }

  if (options.foyer) {
    addStandingPanel(
      { x: -8.25, y: 1.85, z: -5.8, angle: .2 },
      "THE PRIVATE ROOM",
      "A quiet entrance for unnamed thoughts. Move toward the hallway sign when you are ready.",
      0,
    );
  } else if (!singleRoom) {
    if (options.onLibraryEnter) entranceObjects.push(addLibraryPortal(exhibitionBuilder, worldBackZ));
    buildHallwayInstallation(exhibitionBuilder, installationHooks, galleryLayout.map((room) => ({
      side: room.side, z: room.center.z, index: room.index, label: room.label, description: room.description, theme: room.theme,
    })), worldFrontZ, worldBackZ);
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
    if (!options.foyer && !singleRoom) {
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
      else if (hit?.object.userData.library) options.onLibraryEnter?.();
      else if (hit?.object.userData.tv) root.dispatchEvent(new CustomEvent("hidn-tv-open"));
      else if (typeof hit?.object.userData.href === "string") window.open(hit.object.userData.href, "_blank", "noopener,noreferrer");
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
        const view = options.foyer ? foyerInitialView : defaultView;
        movement = undefined; camera.position.set(view.x, EYE_HEIGHT, view.z);
        yaw = view.yaw;
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
      else if (hit?.object.userData.library) options.onLibraryEnter?.();
      else if (hit?.object.userData.tv) root.dispatchEvent(new CustomEvent("hidn-tv-open"));
      else if (hit?.object.userData.returnToMain) options.onReturnToMain?.();
      else if (typeof hit?.object.userData.roomIndex === "number") enterGallery(hit.object.userData.roomIndex);
      else if (typeof hit?.object.userData.href === "string") window.open(hit.object.userData.href, "_blank", "noopener,noreferrer");
      else if (hit && typeof hit.object.userData.exhibitIndex === "number") approachExhibit(hit.object.userData.exhibitIndex);
    }
    dirty = true;
  }, events);
  // Set once a phone proves too slow for the sharper buffer (see animate).
  let lowResolution = false;
  function applyPixelRatio(width: number, height: number): void {
    // Give dense phone screens sharper lettering while bounding the GPU cost
    // on large displays. Phones (lite) get up to 2x: at 1.25x a 3x screen drew
    // the room at 40% sharpness, so the posts only read up close. The buffer
    // stays near 1.3M pixels (about 10 MB); textures are unchanged. A phone
    // that can't keep up drops back to the old 1.25x.
    const cap = LITE ? (lowResolution ? 1.25 : 2) : 2.5;
    const budget = LITE ? (lowResolution ? 1_100_000 : 1_300_000) : 2_400_000;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap, Math.sqrt(budget / (width * height))));
  }
  const resize = new ResizeObserver(() => {
    const width = host.clientWidth; const height = host.clientHeight;
    if (!width || !height || disposed) return;
    // Recalculate when the phone rotates or the view resizes.
    applyPixelRatio(width, height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true;
  });
  resize.observe(host);
  host.dataset.museumRenderer = "webgl";
  root.querySelector<HTMLElement>("[data-museum-loading]")?.setAttribute("hidden", "");
  function updateView(): void {
    camera.rotation.set(pitch + hoverLook.pitch, yaw + hoverLook.yaw, 0, "YXZ");
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
    root.dataset.museumGallery = options.foyer ? "main" : singleRoom ? galleries[0]?.key : gallery?.key ?? "hallway";
    const tvSpot = options.library ? LIBRARY_TV : options.privateFoyer ? FOYER_TV : undefined;
    if (tvSpot) {
      // Close to the television stack, the room offers to switch it on.
      const near = Math.hypot(camera.position.x - tvSpot.x, camera.position.z - tvSpot.z) < 4.2;
      if (near) root.dataset.tvNear = "true"; else delete root.dataset.tvNear;
    }
    // Short, one-line terminal hints that fit a phone's footer.
    if (status) status.textContent = movement
      ? "MOVING…"
      : options.ambientLook ? "DRAG TO LOOK AROUND"
        : singleRoom ? `${galleries[0]?.label ?? "ROOM"} · TAP A THOUGHT TO READ`
        : options.foyer ? "MAIN ROOM · WALK TO THE DOOR"
        : gallery ? `${gallery.label} · TAP A THOUGHT TO READ` : "HALLWAY · TAP A SIGN TO ENTER";
    if (!entryActive) {
      const view = { x: camera.position.x, z: camera.position.z, yaw, pitch, fov: camera.fov };
      if (options.foyer) foyerView = view; else roomViews.set(viewKey, view);
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
  if (options.ambientLook && !reducedMotion.matches) {
    window.addEventListener("pointermove", (event) => {
      hoverLook.targetYaw = -(event.clientX / window.innerWidth - .5) * .38;
      hoverLook.targetPitch = -(event.clientY / window.innerHeight - .5) * .12;
    }, events);
  }
  if (options.ambientLook) {
    // The page keeps the scene dark; a pool of light follows the pointer.
    const bounds = (): DOMRect => root.getBoundingClientRect();
    window.addEventListener("pointermove", (event) => {
      const rect = bounds();
      root.style.setProperty("--museum-light-x", `${event.clientX - rect.left}px`);
      root.style.setProperty("--museum-light-y", `${event.clientY - rect.top}px`);
      root.dataset.museumLit = "true";
    }, events);
    document.documentElement.addEventListener("pointerleave", () => { delete root.dataset.museumLit; }, events);
  }
  // Frame budget: 45fps on capable hardware, less on phones, and less
  // again when the museum is only the homepage's background.
  const frameInterval = 1000 / (LITE ? (options.ambientLook ? 24 : 30) : 45);
  let lastRenderTime = 0; let sampledFrames = 0; let slowFrames = 0;
  function animate(time: number): void {
    if (disposed) return;
    if (!host?.isConnected) { dispose(); return; }
    if (!document.hidden && time - lastTime > frameInterval) {
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
      if (!reducedMotion.matches) {
      if (!LITE) galleryLights.forEach(({ light, base, phase }) => {
        const wave = Math.sin(time * .004 + phase) * .055 + Math.sin(time * .017 + phase * 2.1) * .025;
        const step = Math.floor(time / 190 + phase * 10) % 17;
        light.intensity = base * (0.91 + wave + (step === 4 || step === 5 ? -.14 : 0));
      });
      const glitchStep = LITE ? 0 : Math.floor(time / 135) % 29;
      const glitchScale = glitchStep === 4 ? .16 : glitchStep === 5 ? 1.3 : glitchStep === 12 ? .42 : 1;
      const glitchBreath = .94 + Math.sin(time * .0048) * .045;
      glitchLight.intensity = glitchLightBase * glitchScale * glitchBreath;
      glitchBulb.scale.setScalar(.78 + glitchScale * .22);
      installationHooks.tick.forEach((tick) => tick(time));
      dirty = true;
      }
      installationHooks.frame.forEach((frame) => frame());
      if (Math.abs(hoverLook.targetYaw - hoverLook.yaw) + Math.abs(hoverLook.targetPitch - hoverLook.pitch) > 1e-4) {
        hoverLook.yaw += (hoverLook.targetYaw - hoverLook.yaw) * .06;
        hoverLook.pitch += (hoverLook.targetPitch - hoverLook.pitch) * .06;
        dirty = true;
      }
      if (dirty) {
        updateView(); renderer.render(scene, camera); dirty = false;
        // While the view moves frame after frame, count frames that come in
        // well under the budget (below ~18fps). Mostly slow: lower the
        // resolution once, for the rest of the visit.
        if (LITE && !lowResolution) {
          const gap = time - lastRenderTime;
          if (gap < 1000) {
            sampledFrames += 1;
            if (gap > 55) slowFrames += 1;
            if (sampledFrames >= 40) {
              if (slowFrames > 24) {
                lowResolution = true;
                applyPixelRatio(host.clientWidth, host.clientHeight);
                renderer.setSize(host.clientWidth, host.clientHeight, false);
                dirty = true;
              }
              sampledFrames = 0; slowFrames = 0;
            }
          }
          lastRenderTime = time;
        }
      }
    }
    animationId = requestAnimationFrame(animate);
  }
  // One ShieldedScan feed serves every live installation, refreshed each
  // minute while the museum is mounted.
  if (installationHooks.live.length) {
    const refreshLive = (): void => {
      void fetchShieldedScanStats().then((stats) => {
        if (disposed) return;
        installationHooks.live.forEach((paint) => paint(stats));
        dirty = true;
      }).catch(() => undefined);
    };
    refreshLive();
    const liveTimer = window.setInterval(refreshLive, 60_000);
    abort.signal.addEventListener("abort", () => window.clearInterval(liveTimer));
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
