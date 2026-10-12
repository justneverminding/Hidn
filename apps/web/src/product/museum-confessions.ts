import * as THREE from "three";
import type { ExhibitionBuilder } from "./museum-exhibition";
import type { MuseumTheme } from "./museum-layout";
import type { InstallationHooks } from "./museum-installations";
import { addVoidVisitors, type VisitorPlan } from "./museum-visitors";

/** Six ways to hang a confession, one per room, each after a reference:
 * 0 column of letters (Anzac column), 1 arched bays (wool gallery),
 * 2 vitrine tables under a lit canopy (city archive), 3 backlit timeline
 * (map wall), 4 cloth rotunda (tapestry hall), 5 light pillars (sports hall). */

export interface ConfessionPost {
  text: string;
  category?: string;
  time: string;
}

export type ConfessionLook = "letter" | "panel" | "glass" | "cloth" | "lightbox";

export interface ConfessionContext {
  b: ExhibitionBuilder;
  hooks: InstallationHooks;
  theme: MuseumTheme;
  index: number;
  cz: number;
  front: number;
  back: number;
  posts: ConfessionPost[];
  /** Creates a readable, clickable confession surface on `parent`. */
  card: (post: ConfessionPost, parent: THREE.Object3D, width: number, height: number, look: ConfessionLook, i: number) => THREE.Mesh;
}

export const CONFESSION_STYLE_CAPACITY = [6, 4, 4, 4, 6, 6];

/** Invitation shown when a room has no thoughts yet; never an empty frame. */
export const FIRST_THOUGHT: ConfessionPost = {
  text: "Nothing has been left here yet. The first thought written in this room will hang in this place.",
  category: "WAITING",
  time: "",
};

function fitLines(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number, font: (size: number) => string, start: number, min: number): { lines: string[]; size: number } {
  for (let size = start; size >= min; size -= 2) {
    ctx.font = font(size);
    const lines: string[] = [];
    let line = "";
    for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines) return { lines, size };
    if (size - 2 < min) {
      const clipped = lines.slice(0, maxLines);
      clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/[.,;:!?]?\s*\S*$/, "")}…`;
      return { lines: clipped, size };
    }
  }
  return { lines: [text], size: min };
}

function stamp(time: string): string {
  if (!time) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time.toUpperCase();
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase();
}

/** Canvas texture for one confession in a given material language. */
export function confessionTexture(post: ConfessionPost, look: ConfessionLook, theme: MuseumTheme, aspect: number, seed: number): THREE.CanvasTexture {
  const w = 768;
  const h = Math.round(w / aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const pad = Math.round(w * .09);
  const serif = (size: number) => `${look === "letter" ? "italic " : ""}${size}px Georgia, "Times New Roman", serif`;
  const label = (post.category ?? "THOUGHT").toUpperCase();
  const when = stamp(post.time);
  let ink = "#1d1b17", muted = "#6a6355";

  if (look === "letter") {
    ctx.fillStyle = "#ece4cf";
    ctx.fillRect(0, 0, w, h);
    const fibre = ctx.createLinearGradient(0, 0, w, h);
    fibre.addColorStop(0, "rgba(255,255,255,.18)");
    fibre.addColorStop(1, "rgba(120,96,60,.12)");
    ctx.fillStyle = fibre;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(90,80,60,.12)";
    for (let y = pad + 90; y < h - pad; y += 46) { ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke(); }
    ink = "#29241b";
  } else if (look === "panel") {
    ctx.fillStyle = theme.trim;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.fillRect(0, h * .78, w, h * .22);
    ink = "#f6f1e6"; muted = theme.accent;
  } else if (look === "glass") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(232,238,224,.92)");
    g.addColorStop(1, "rgba(208,218,200,.86)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(0, 0, w, 10);
    ink = "#141813"; muted = "#56604f";
  } else if (look === "cloth") {
    ctx.fillStyle = "#2a2116";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(18, 18, w - 36, h - 36);
    // Woven texture and a border motif.
    ctx.globalAlpha = .12;
    ctx.fillStyle = "#000";
    for (let y = 18; y < h - 18; y += 6) ctx.fillRect(18, y, w - 36, 2);
    ctx.globalAlpha = .55;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, w - 80, h - 80);
    for (let x = 60; x < w - 60; x += 36) { ctx.beginPath(); ctx.moveTo(x, 52); ctx.lineTo(x + 18, 70); ctx.lineTo(x + 36, 52); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ink = "#f3ead6"; muted = theme.accent;
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#fbf8ee");
    g.addColorStop(1, "#e7e2d2");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(pad, pad, 70, 8);
    ink = "#121410"; muted = "#5f5a4c";
  }

  const top = look === "cloth" ? pad + 70 : pad;
  ctx.fillStyle = muted;
  ctx.font = `600 ${Math.round(w * .03)}px monospace`;
  ctx.fillText(label, pad, top + 30);
  if (when) {
    ctx.textAlign = "right";
    ctx.fillText(when, w - pad, top + 30);
    ctx.textAlign = "left";
  }
  const bodyTop = top + 80;
  const footer = Math.round(w * .1);
  const maxSize = look === "lightbox" ? 62 : 50;
  const available = h - bodyTop - footer - pad;
  const { lines, size } = fitLines(ctx, post.text, w - pad * 2, Math.max(2, Math.floor(available / 52)), serif, maxSize, 28);
  ctx.fillStyle = ink;
  ctx.font = serif(size);
  const lead = size * 1.36;
  lines.forEach((line, i) => ctx.fillText(line, pad, bodyTop + size + i * lead));
  ctx.fillStyle = muted;
  ctx.font = `${Math.round(w * .026)}px monospace`;
  ctx.fillText(post === FIRST_THOUGHT ? "OPEN THE ROOM FEED TO WRITE" : "WITHOUT A NAME", pad, h - pad * .7);
  void seed;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function standard(b: ExhibitionBuilder, color: string, roughness = .8, metalness = .1): THREE.MeshStandardMaterial {
  return b.material(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
}

function geometryMesh(b: ExhibitionBuilder, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(b.geometry(geometry), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function lamp(b: ExhibitionBuilder, color: string): THREE.MeshBasicMaterial {
  return b.material(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
}

function point(ctx: ConfessionContext, color: string, intensity: number, distance: number, x: number, y: number, z: number): void {
  const light = new THREE.PointLight(color, intensity, distance, 1.6);
  light.position.set(x, y, z);
  ctx.b.scene.add(light);
}

/** 0 — A glowing column of handwriting with confessions hung on wires. */
function columnOfLetters(ctx: ConfessionContext): void {
  const { b, cz, theme } = ctx;
  const script = document.createElement("canvas");
  script.width = script.height = 1024;
  const s = script.getContext("2d")!;
  s.fillStyle = "#f2ecdc";
  s.fillRect(0, 0, 1024, 1024);
  s.strokeStyle = "rgba(70,62,48,.45)";
  s.lineWidth = 2.2;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 46; y < 1004; y += 38) {
    for (let x = 30 + rand() * 60; x < 984;) {
      const word = 30 + rand() * 70;
      s.beginPath(); s.moveTo(x, y);
      for (let p = x; p < x + word; p += 7) s.quadraticCurveTo(p + 3.5, y - 6 - rand() * 12, p + 7, y + (rand() - .5) * 3);
      s.stroke();
      x += word + 14 + rand() * 16;
    }
  }
  const map = b.texture(new THREE.CanvasTexture(script));
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.repeat.set(2, 1);
  geometryMesh(b, new THREE.CylinderGeometry(.7, .7, 5.9, 48, 1, true), b.material(new THREE.MeshBasicMaterial({ map, toneMapped: false })), b.scene, [0, 2.95, cz]).castShadow = false;
  geometryMesh(b, new THREE.CylinderGeometry(.95, 1.02, .2, 48), standard(b, "#191e1a"), b.scene, [0, .1, cz]);
  point(ctx, theme.glow, 1.3, 9, 0, 3, cz);
  const wire = standard(b, "#3a413a", .45, .55);
  const frame = standard(b, "#171b17", .6, .3);
  const posts = ctx.posts.slice(0, CONFESSION_STYLE_CAPACITY[0]);
  posts.forEach((post, i) => {
    const angle = i / posts.length * Math.PI * 2 + .3;
    const radius = 1.55 + (i % 2) * .5;
    const y = 1.65 + (i % 3) * .95;
    const group = new THREE.Group();
    group.position.set(Math.sin(angle) * radius, y, cz + Math.cos(angle) * radius);
    group.rotation.y = angle;
    b.scene.add(group);
    b.box(.86, 1.08, .04, 0, 0, -.025, frame, group);
    const card = ctx.card(post, group, .78, 1.0, "letter", i);
    card.position.z = .002;
    const top = 6 - (y + .54);
    b.box(.008, top, .008, 0, .54 + top / 2, 0, wire, group).castShadow = false;
  });
  b.obstacles.push({ minX: -2.5, maxX: 2.5, minZ: cz - 2.5, maxZ: cz + 2.5 });
  visitors(ctx, [
    { kind: "walk", path: ring(cz, 3.4, 12), speed: .45, phase: ctx.index },
    { kind: "read", x: 2.9, z: cz + 1.6, facing: Math.atan2(-2.9, -1.6) },
  ]);
}

/** 1 — Freestanding arches in a row, each framing a colored panel. */
function archedBays(ctx: ConfessionContext): void {
  const { b, theme } = ctx;
  const shell = standard(b, "#262b27", .85);
  const inner = standard(b, new THREE.Color(theme.trim).multiplyScalar(.55).getStyle(), .9);
  const shape = new THREE.Shape([new THREE.Vector2(-1.25, 0), new THREE.Vector2(1.25, 0), new THREE.Vector2(1.25, 3.2), new THREE.Vector2(-1.25, 3.2)]);
  shape.absarc(0, 3.2, 1.25, 0, Math.PI, false);
  const archGeometry = b.geometry(new THREE.ExtrudeGeometry(shape, { depth: .55, bevelEnabled: false, curveSegments: 28 }));
  const posts = ctx.posts.slice(0, CONFESSION_STYLE_CAPACITY[1]);
  posts.forEach((post, i) => {
    const side = i % 2 ? 1 : -1;
    const z = 6.2 - Math.floor(i / 2) * 5.2;
    const group = new THREE.Group();
    group.position.set(side * 3.1, 0, z);
    group.rotation.y = -side * Math.PI / 2;
    b.scene.add(group);
    const arch = new THREE.Mesh(archGeometry, shell);
    arch.position.z = -.55;
    arch.castShadow = arch.receiveShadow = true;
    group.add(arch);
    // A recessed, softly lit alcove holds the panel.
    b.box(2.1, 3.9, .04, 0, 2.15, .02, inner, group);
    const card = ctx.card(post, group, 1.35, 1.9, "panel", i);
    card.position.set(0, 1.85, .05);
    b.box(1.6, .02, .03, 0, 3.0, .06, lamp(b, theme.accent), group).castShadow = false;
    b.obstacles.push({ minX: side * 3.1 - (side < 0 ? 1 : .6), maxX: side * 3.1 + (side < 0 ? .6 : 1), minZ: z - 1.45, maxZ: z + 1.45 });
  });
  point(ctx, theme.glow, .8, 10, 0, 4.2, 1);
  visitors(ctx, [
    { kind: "walk", path: [[0, 8.5], [0, -7], [-.4, -7], [-.4, 8.5]], speed: .5 },
    { kind: "read", x: -1.6, z: 6.2, facing: -Math.PI / 2 },
  ]);
}

/** 2 — Low glass vitrines down the room under a canopy of lit panels. */
function vitrineTables(ctx: ConfessionContext): void {
  const { b, theme } = ctx;
  const body = standard(b, "#1a1f1b", .8);
  const top = standard(b, "#3b433b", .5, .4);
  const glass = b.material(new THREE.MeshStandardMaterial({ color: "#d9e2d3", transparent: true, opacity: .14, roughness: .08, depthWrite: false, side: THREE.DoubleSide }));
  const glowStrip = lamp(b, theme.accent);
  const posts = ctx.posts.slice(0, CONFESSION_STYLE_CAPACITY[2]);
  const tables = Math.ceil(posts.length / 2);
  for (let t = 0; t < tables; t++) {
    const z = 3.4 - t * 5.2;
    const group = new THREE.Group();
    group.position.set(0, 0, z);
    b.scene.add(group);
    b.box(5.2, .82, 1.5, 0, .41, 0, body, group);
    b.box(5.3, .05, 1.6, 0, .84, 0, top, group);
    b.box(5.2, .02, .02, 0, .86, .78, glowStrip, group).castShadow = false;
    for (const [w, h, d, x, y, zz] of [[5.2, .45, .02, 0, 1.09, .77], [5.2, .45, .02, 0, 1.09, -.77], [.02, .45, 1.54, -2.6, 1.09, 0], [.02, .45, 1.54, 2.6, 1.09, 0], [5.2, .02, 1.54, 0, 1.31, 0]] as const) {
      b.box(w, h, d, x, y, zz, glass, group).castShadow = false;
    }
    for (let k = 0; k < 2; k++) {
      const post = posts[t * 2 + k];
      if (!post) continue;
      const tilt = new THREE.Group();
      tilt.position.set((k ? 1 : -1) * 1.25, .95, .05);
      tilt.rotation.x = -1.05;
      tilt.rotation.z = (k ? -1 : 1) * .05;
      group.add(tilt);
      ctx.card(post, tilt, 1.7, 1.1, "letter", t * 2 + k);
    }
    b.obstacles.push({ minX: -2.9, maxX: 2.9, minZ: z - 1.1, maxZ: z + 1.1 });
    point(ctx, "#efe6cf", .7, 5, 0, 2.6, z);
  }
  // Lit canopy panels overhead, as in the archive reference.
  const sketch = document.createElement("canvas");
  sketch.width = 512; sketch.height = 352;
  const s = sketch.getContext("2d")!;
  s.fillStyle = "#e8eadb"; s.fillRect(0, 0, 512, 352);
  s.strokeStyle = "rgba(48,56,46,.4)"; s.lineWidth = 2;
  for (let i = 0; i < 4; i++) { s.beginPath(); s.arc(256, 176, 40 + i * 34, 0, Math.PI * 2); s.stroke(); }
  const map = b.texture(new THREE.CanvasTexture(sketch));
  map.colorSpace = THREE.SRGBColorSpace;
  const panelMaterial = b.material(new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.DoubleSide, color: "#cfd4c2" }));
  for (let i = 0; i < 14; i++) {
    const panel = b.plane(1.5, 1.0, panelMaterial);
    panel.position.set(((i % 4) - 1.5) * 2.1 + (i % 2) * .3, 5.15 + (i % 3) * .2, 6 - Math.floor(i / 4) * 3.6);
    panel.rotation.set(Math.PI / 2 - .3 - (i % 3) * .08, (i % 5 - 2) * .12, 0, "YXZ");
  }
  visitors(ctx, [
    { kind: "read", x: -1.2, z: 6.9, facing: Math.PI },
    { kind: "walk", path: [[4.2, 8], [4.2, -8], [-4.2, -8], [-4.2, 8]], speed: .45 },
  ]);
}

/** 3 — A backlit glass timeline along the back wall with reading rails. */
function timelineWall(ctx: ConfessionContext): void {
  const { b, theme, back } = ctx;
  const housing = standard(b, "#121613", .7, .3);
  const rail = standard(b, "#1b201c", .7, .3);
  const posts = ctx.posts.slice(0, CONFESSION_STYLE_CAPACITY[3]);
  const span = Math.min(posts.length, 6) * 2.9;
  b.box(span + .4, 2.3, .14, 0, 2.55, back + .5, housing);
  b.box(span + .2, .03, .05, 0, 3.72, back + .6, lamp(b, theme.accent)).castShadow = false;
  posts.forEach((post, i) => {
    const x = (i - (posts.length - 1) / 2) * 2.9;
    const group = new THREE.Group();
    group.position.set(x, 2.55, back + .59);
    b.scene.add(group);
    ctx.card(post, group, 2.6, 2.0, "glass", i);
    // A slanted reading rail beneath each entry.
    const railGroup = new THREE.Group();
    railGroup.position.set(x, 0, back + 1.4);
    b.scene.add(railGroup);
    b.box(.06, .9, .06, 0, .45, 0, rail, railGroup);
    const plate = b.box(1.2, .03, .42, 0, .95, .05, rail, railGroup);
    plate.rotation.x = .5;
  });
  point(ctx, "#e8efdf", 1.1, 9, 0, 3, back + 2.5);
  b.obstacles.push({ minX: -span / 2 - .3, maxX: span / 2 + .3, minZ: back, maxZ: back + 1.9 });
  visitors(ctx, [
    { kind: "read", x: -1.45, z: back + 2.4, facing: Math.PI },
    { kind: "read", x: 4.35, z: back + 2.5, facing: Math.PI },
    { kind: "walk", path: [[-6, back + 3.4], [6, back + 3.4], [6, 6], [-6, 6]], speed: .4 },
  ]);
}

/** 4 — Cloth confessions hanging from a tiered ceiling ring around a seat. */
function clothRotunda(ctx: ConfessionContext): void {
  const { b, cz, theme } = ctx;
  const warm = lamp(b, "#f3e7c8");
  geometryMesh(b, new THREE.CylinderGeometry(5.2, 5.2, .08, 72), standard(b, "#2a2219", .8), b.scene, [0, 5.96, cz]).castShadow = false;
  for (const [r, y] of [[4.9, 5.86], [3.6, 5.74], [2.3, 5.62]] as const) {
    geometryMesh(b, new THREE.TorusGeometry(r, .04, 8, 120), warm, b.scene, [0, y, cz], [Math.PI / 2, 0, 0]).castShadow = false;
  }
  const rod = standard(b, "#5b4630", .6, .2);
  const posts = ctx.posts.slice(0, CONFESSION_STYLE_CAPACITY[4]);
  posts.forEach((post, i) => {
    const angle = i / posts.length * Math.PI * 2 + .2;
    const radius = 3.6;
    const group = new THREE.Group();
    group.position.set(Math.sin(angle) * radius, 3.45, cz + Math.cos(angle) * radius);
    group.rotation.y = angle;
    b.scene.add(group);
    b.box(1.5, .05, .05, 0, 1.12, 0, rod, group);
    const cloth = ctx.card(post, group, 1.4, 2.1, "cloth", i);
    cloth.position.z = .01;
    for (const x of [-.6, .6]) b.box(.006, 6 - 4.6, .006, x, 1.12 + (6 - 4.6) / 2, 0, rod, group).castShadow = false;
  });
  // Round seat at the centre, after the fountain bench in the reference.
  geometryMesh(b, new THREE.CylinderGeometry(1.5, 1.6, .42, 48), standard(b, theme.trim, .95), b.scene, [0, .21, cz]);
  geometryMesh(b, new THREE.CylinderGeometry(.6, .6, .5, 32), standard(b, "#2a2219", .7), b.scene, [0, .5, cz]);
  b.obstacles.push({ minX: -1.8, maxX: 1.8, minZ: cz - 1.8, maxZ: cz + 1.8 });
  point(ctx, "#f2d9a6", 1.2, 10, 0, 4.5, cz);
  visitors(ctx, [
    { kind: "sit", x: 0, z: cz + 1.32, facing: 0, seat: .42 },
    { kind: "sit", x: -1.1, z: cz - .8, facing: Math.atan2(-1.1, -.8), seat: .42 },
    { kind: "walk", path: ring(cz, 2.6, 12), speed: .4, phase: 4 },
  ]);
}

/** 5 — Tall backlit pillars in an oval under a single halo. */
function lightPillars(ctx: ConfessionContext): void {
  const { b, cz, theme } = ctx;
  const base = standard(b, "#141815", .7, .3);
  const posts = ctx.posts.slice(0, CONFESSION_STYLE_CAPACITY[5]);
  posts.forEach((post, i) => {
    const angle = i / posts.length * Math.PI * 2 + .35;
    const group = new THREE.Group();
    group.position.set(Math.sin(angle) * 4.6, 0, cz + Math.cos(angle) * 3.6);
    group.rotation.y = angle;
    b.scene.add(group);
    b.box(1.3, .3, .62, 0, .15, 0, base, group);
    b.box(1.14, 3.3, .42, 0, 1.95, 0, base, group);
    const face = ctx.card(post, group, 1.0, 3.0, "lightbox", i);
    face.position.set(0, 1.95, .215);
    b.obstacles.push({ minX: group.position.x - .8, maxX: group.position.x + .8, minZ: group.position.z - .8, maxZ: group.position.z + .8 });
  });
  geometryMesh(b, new THREE.TorusGeometry(3.4, .12, 10, 120), standard(b, "#111412", .6, .3), b.scene, [0, 5.5, cz], [Math.PI / 2, 0, 0]).castShadow = false;
  geometryMesh(b, new THREE.TorusGeometry(3.4, .05, 10, 120), lamp(b, theme.accent), b.scene, [0, 5.4, cz], [Math.PI / 2, 0, 0]).castShadow = false;
  point(ctx, theme.glow, 1, 11, 0, 4.4, cz);
  visitors(ctx, [
    { kind: "read", x: 1.2, z: cz + 1.2, facing: Math.atan2(1.9, 1.6) },
    { kind: "walk", path: ring(cz, 2.2, 10), speed: .4 },
  ]);
}

function ring(cz: number, radius: number, steps: number): Array<[number, number]> {
  return Array.from({ length: steps }, (_, i): [number, number] => [Math.sin(i / steps * Math.PI * 2) * radius, cz + Math.cos(i / steps * Math.PI * 2) * radius]);
}

function visitors(ctx: ConfessionContext, plans: VisitorPlan[]): void {
  addVoidVisitors(ctx.b, ctx.hooks, plans, ctx.theme.accent);
}

const STYLES = [columnOfLetters, archedBays, vitrineTables, timelineWall, clothRotunda, lightPillars];

export function confessionStyleFor(index: number): number {
  return index % STYLES.length;
}

export function buildConfessionInstallation(ctx: ConfessionContext): void {
  STYLES[confessionStyleFor(ctx.index)](ctx);
}
