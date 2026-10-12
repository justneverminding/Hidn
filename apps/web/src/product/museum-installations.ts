import * as THREE from "three";
import type { ExhibitionBuilder } from "./museum-exhibition";
import * as QRCode from "qrcode";
import type { MuseumTheme } from "./museum-layout";
import type { ShieldedScanStats } from "./shieldedscan";
import { addSquirrels, addVoidVisitors } from "./museum-visitors";

/** Signature installations for the main room, hallway and themed rooms.
 * Everything is local geometry and generated textures: the exhibition
 * references set the spatial language, never the imagery. */

type Vec3 = [number, number, number];

const NEUTRAL_THEME: MuseumTheme = { accent: "#c9d3bd", glow: "#a9b69c", trim: "#4b5646", wall: "#171c18", floor: "#222820" };

/** Live displays register here; the scene feeds them ShieldedScan stats and
 * animation time, so no installation fetches or schedules on its own. */
export interface InstallationHooks {
  live: Array<(stats: ShieldedScanStats | null) => void>;
  tick: Array<(time: number) => void>;
  /** Runs every frame, even with reduced motion (no animation, only state). */
  frame: Array<() => void>;
  /** The visitor's camera, so figures can step out of the way of the view. */
  camera?: THREE.Camera;
}

export const ZCASH_WALLETS_URL = "https://zechub.wiki/wallets";

function seeded(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function canvasMap(b: ExhibitionBuilder, width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  b.texture(texture);
  return texture;
}

function mesh(b: ExhibitionBuilder, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, position: Vec3, rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
  const object = new THREE.Mesh(b.geometry(geometry), material);
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function glow(b: ExhibitionBuilder, color: string): THREE.MeshBasicMaterial {
  return b.material(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function liveCanvas(b: ExhibitionBuilder, hooks: InstallationHooks, width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number, stats: ShieldedScanStats | null) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  b.texture(texture);
  const paint = (stats: ShieldedScanStats | null): void => {
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height, stats);
    texture.needsUpdate = true;
  };
  paint(null);
  hooks.live.push(paint);
  return texture;
}

interface ZcashMetric {
  label: string;
  value: string;
  caption: string;
  ratio?: number;
}

// The most recent halving activated with NU6 at block 2,726,400 (Nov 2024).
// Future halving heights depend on NU7's block-time change, so the museum
// only counts forward from the last one.
const LAST_HALVING_HEIGHT = 2_726_400;
const ZEC_MAX_SUPPLY = 21_000_000;

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

function zcashMetrics(stats: ShieldedScanStats | null): ZcashMetric[] {
  const pending = "SYNCING";
  const circulating = stats?.marketCapUsd && stats.priceUsd ? stats.marketCapUsd / stats.priceUsd : null;
  const shieldedShare = stats?.shieldedSupplyZec != null && circulating ? stats.shieldedSupplyZec / circulating : null;
  const mined = circulating ? circulating / ZEC_MAX_SUPPLY : null;
  const sinceHalving = stats ? Math.max(0, stats.blockHeight - LAST_HALVING_HEIGHT) : null;
  return [
    { label: "BLOCK HEIGHT", value: stats ? whole.format(stats.blockHeight) : pending, caption: "The chain keeps time. It keeps no names." },
    { label: "SHIELDED SUPPLY", value: stats?.shieldedSupplyZec != null ? `${compact.format(stats.shieldedSupplyZec)} ZEC` : pending, caption: "ZEC held out of sight." },
    { label: "SHIELDED SHARE", value: shieldedShare != null ? `${(shieldedShare * 100).toFixed(1)}%` : pending, caption: "Of all ZEC in circulation.", ratio: shieldedShare ?? undefined },
    { label: "TRANSACTIONS / 24H", value: stats?.transactions24h != null ? whole.format(stats.transactions24h) : pending, caption: "Verified. Not exposed." },
    { label: "ZEC / USD", value: stats?.priceUsd != null ? `$${stats.priceUsd.toFixed(2)}` : pending, caption: "Mainnet spot price." },
    { label: "MARKET CAP", value: stats?.marketCapUsd != null ? `$${compact.format(stats.marketCapUsd)}` : pending, caption: "Price × circulating supply." },
    { label: "MINED OF 21M", value: mined != null ? `${(mined * 100).toFixed(1)}%` : pending, caption: "A fixed supply. No more, ever.", ratio: mined ?? undefined },
    { label: "SINCE LAST HALVING", value: sinceHalving != null ? `${compact.format(sinceHalving)} BLOCKS` : pending, caption: "Halving at block 2,726,400 · Nov 2024" },
  ];
}

function liveStamp(stats: ShieldedScanStats | null): string {
  if (!stats) return "SHIELDEDSCAN.XYZ · CONNECTING";
  const at = stats.asOf ? new Date(stats.asOf * 1000) : new Date();
  return `SHIELDEDSCAN.XYZ · MAINNET · ${at.toISOString().slice(11, 16)} UTC`;
}

/** Evenly spaced profile points keep texture V proportional to length, so
 * stripes stay the same width from rump to chest. */
function lathe(radius: (t: number) => number, length: number, segments = 40): THREE.LatheGeometry {
  const points = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    return new THREE.Vector2(Math.max(.002, radius(t)), t * length);
  });
  return new THREE.LatheGeometry(points, segments);
}

/** Organic zebra bands. Each band is a closed wave around U, so the pattern
 * wraps seamlessly around a lathe or cylinder. */
function stripeTexture(b: ExhibitionBuilder, bands: number, seed: number, wobble = 1): THREE.CanvasTexture {
  return canvasMap(b, 256, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#ece6d4";
    ctx.fillRect(0, 0, w, h);
    const random = seeded(seed);
    ctx.fillStyle = "#121512";
    const pitch = h / bands;
    for (let i = 0; i < bands; i++) {
      const center = (i + .5) * pitch;
      const thickness = pitch * (.36 + random() * .18);
      const phase = random() * Math.PI * 2;
      const amplitude = pitch * (.1 + random() * .16) * wobble;
      const waves = 1 + Math.floor(random() * 2);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = center - thickness / 2 + Math.sin(x / w * Math.PI * 2 * waves + phase) * amplitude;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let x = w; x >= 0; x -= 4) {
        const y = center + thickness / 2 + Math.sin(x / w * Math.PI * 2 * waves + phase + .8) * amplitude * .75;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  });
}

/** A glazed porcelain zebra: smooth lathed forms with continuous stripes. */
export function buildZebraSculpture(b: ExhibitionBuilder): THREE.Group {
  const zebra = new THREE.Group();
  const porcelain = (bands: number, seed: number, wobble = 1) => b.material(new THREE.MeshStandardMaterial({
    map: stripeTexture(b, bands, seed, wobble), roughness: .3, metalness: .04,
  }));
  const ivory = b.material(new THREE.MeshStandardMaterial({ color: "#ece6d4", roughness: .3, metalness: .04 }));
  const ink = b.material(new THREE.MeshStandardMaterial({ color: "#151815", roughness: .26, metalness: .08 }));
  const eyeMaterial = b.material(new THREE.MeshStandardMaterial({ color: "#050605", roughness: .08, metalness: .3 }));

  // Torso: one smooth form from rump (local -X) to chest (+X).
  const torsoLength = 1.95;
  const torso = mesh(b, lathe((t) => .52 * Math.pow(1 - Math.pow(Math.abs(2 * t - 1), 2.6), 1 / 2.6) * (1 - .06 * Math.exp(-(((t - .52) / .2) ** 2))), torsoLength, 48),
    porcelain(14, 3), zebra, [-torsoLength / 2, 1.32, 0], [0, 0, -Math.PI / 2]);
  torso.scale.set(.96, 1, .8);
  // Haunch and shoulder masses give the silhouette a real animal stance.
  const haunchMaterial = porcelain(7, 11, .8);
  const shoulderMaterial = porcelain(6, 17, .8);
  for (const z of [-.17, .17]) {
    // Poles run along the body so the bands wrap vertically, like the torso.
    const haunch = mesh(b, new THREE.SphereGeometry(.3, 28, 20), haunchMaterial, zebra, [-.6, 1.18, z * .8], [0, 0, Math.PI / 2]);
    haunch.scale.set(1.3, 1.05, .62);
    const shoulder = mesh(b, new THREE.SphereGeometry(.25, 28, 20), shoulderMaterial, zebra, [.56, 1.16, z * .8], [0, 0, Math.PI / 2]);
    shoulder.scale.set(1.35, .95, .62);
  }

  // Neck rises forward at ~55 degrees; the head angles down from it.
  const neckDirection = new THREE.Vector2(Math.sin(.61), Math.cos(.61));
  const neckBase = new THREE.Vector2(.62, 1.45);
  const neckLength = 1.02;
  const neckRadius = (t: number) => .31 - .13 * t;
  const neck = mesh(b, lathe(neckRadius, neckLength, 36), porcelain(7, 23), zebra, [neckBase.x, neckBase.y, 0], [0, 0, -.61]);
  neck.scale.z = .74;
  const headBase = new THREE.Vector2(1.1, 2.34);
  const headDirection = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
  const headLength = .72;
  const head = mesh(b, lathe((t) => (.215 - .095 * t) * Math.pow(1 - Math.pow(Math.abs(2 * t - 1), 5), 1 / 5), headLength, 36),
    porcelain(5, 31, .5), zebra, [headBase.x, headBase.y, 0], [0, 0, -2.36]);
  head.scale.z = .7;
  const muzzle = headBase.clone().addScaledVector(headDirection, headLength - .09);
  const nose = mesh(b, new THREE.SphereGeometry(.115, 20, 14), ink, zebra, [muzzle.x, muzzle.y, 0]);
  nose.scale.set(1, .9, .82);
  const eye = headBase.clone().addScaledVector(headDirection, .2);
  for (const z of [-.135, .135]) mesh(b, new THREE.SphereGeometry(.034, 12, 10), eyeMaterial, zebra, [eye.x + .02, eye.y + .05, z]);
  for (const z of [-.095, .095]) {
    mesh(b, new THREE.ConeGeometry(.058, .24, 12), ivory, zebra, [headBase.x - .04, headBase.y + .2, z], [z * 2.6, 0, .3]);
    mesh(b, new THREE.ConeGeometry(.026, .08, 8), ink, zebra, [headBase.x - .07, headBase.y + .3, z * 1.1], [z * 2.6, 0, .3]);
  }

  // Upright banded mane follows the dorsal line of the neck.
  const dorsal = new THREE.Vector2(-neckDirection.y, neckDirection.x);
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const point = neckBase.clone().addScaledVector(neckDirection, .12 + t * (neckLength + .05)).addScaledVector(dorsal, neckRadius(t) * .92 + .04);
    mesh(b, new THREE.BoxGeometry(.075, .17 - t * .03, .07), i % 2 ? ivory : ink, zebra, [point.x, point.y, 0], [0, 0, Math.atan2(neckDirection.y, neckDirection.x)]);
  }

  // Legs: banded upper and lower segments, knees, and dark hooves.
  const upperMaterial = porcelain(5, 41, .4);
  const lowerMaterial = porcelain(5, 47, .3);
  const legs: Array<[number, number, number]> = [[.6, .2, .05], [.54, -.2, -.04], [-.6, .2, -.05], [-.66, -.2, .06]];
  for (const [x, z, lean] of legs) {
    const leg = new THREE.Group();
    leg.position.set(x, 1.05, z);
    leg.rotation.z = lean;
    zebra.add(leg);
    mesh(b, new THREE.CylinderGeometry(.105, .074, .56, 18), upperMaterial, leg, [0, -.28, 0]);
    mesh(b, new THREE.SphereGeometry(.078, 14, 10), ivory, leg, [0, -.56, 0]);
    mesh(b, new THREE.CylinderGeometry(.064, .054, .42, 16), lowerMaterial, leg, [0, -.77, 0]);
    mesh(b, new THREE.CylinderGeometry(.066, .078, .1, 16), ink, leg, [0, -1.0, 0]);
  }

  // Tail with a dark tuft.
  mesh(b, new THREE.CylinderGeometry(.022, .045, .62, 10), porcelain(4, 53), zebra, [-1.06, 1.3, 0], [0, 0, -.32]);
  mesh(b, new THREE.ConeGeometry(.07, .26, 10), ink, zebra, [-1.17, .93, 0], [0, 0, Math.PI - .32]);
  return zebra;
}

/** The Zcash mark: a gold disc with the stemmed Z, extruded as a relief. */
export function buildZcashEmblem(b: ExhibitionBuilder, radius = .62): THREE.Group {
  const emblem = new THREE.Group();
  const gold = b.material(new THREE.MeshStandardMaterial({ color: "#f4b728", emissive: "#7a4d06", emissiveIntensity: .5, roughness: .28, metalness: .72 }));
  const rim = b.material(new THREE.MeshStandardMaterial({ color: "#ffd56b", emissive: "#80540c", emissiveIntensity: .35, roughness: .2, metalness: .85 }));
  const ink = b.material(new THREE.MeshStandardMaterial({ color: "#1d1b17", roughness: .4, metalness: .2 }));
  mesh(b, new THREE.CylinderGeometry(radius, radius, .1, 72), gold, emblem, [0, 0, 0], [Math.PI / 2, 0, 0]);
  mesh(b, new THREE.TorusGeometry(radius, .028, 12, 72), rim, emblem, [0, 0, .045]);
  const s = radius / .62;
  const outline: Array<[number, number]> = [
    [-.06, .45], [.06, .45], [.06, .33], [.3, .33], [.3, .2], [-.1, -.2], [.3, -.2], [.3, -.33], [.06, -.33], [.06, -.45],
    [-.06, -.45], [-.06, -.33], [-.3, -.33], [-.3, -.2], [.1, .2], [-.3, .2], [-.3, .33], [-.06, .33],
  ];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x * s, y * s)));
  mesh(b, new THREE.ExtrudeGeometry(shape, { depth: .05, bevelEnabled: true, bevelThickness: .01, bevelSize: .008, bevelSegments: 2 }), ink, emblem, [0, 0, .05]);
  return emblem;
}

function labelTexture(b: ExhibitionBuilder, title: string, body: string, background = "#d9d6c6", ink = "#1c201b", accent = "#7a8270"): THREE.CanvasTexture {
  return canvasMap(b, 768, 384, (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(40, 40, 64, 5);
    ctx.fillStyle = ink;
    ctx.font = "700 46px Georgia, serif";
    ctx.fillText(title, 40, 104);
    ctx.font = "25px Georgia, serif";
    wrapLines(ctx, body, w - 80).slice(0, 6).forEach((line, i) => ctx.fillText(line, 40, 156 + i * 34));
    ctx.font = "16px monospace";
    ctx.fillStyle = accent;
    ctx.fillText("HIDN / PERMANENT COLLECTION", 40, h - 30);
  });
}

/** Slanted reading lectern, as in museum diorama labels. */
function addLectern(b: ExhibitionBuilder, x: number, z: number, angle: number, title: string, body: string, length = .86, theme = NEUTRAL_THEME): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  b.scene.add(group);
  const body3d = b.material(new THREE.MeshStandardMaterial({ color: "#1b201c", roughness: .7, metalness: .3 }));
  // Slim pedestal: base plate, single stem, slanted reading surface.
  b.box(length * .5, .03, .3, 0, .015, 0, body3d, group);
  b.box(.06, .86, .06, 0, .45, -.04, body3d, group);
  const top = new THREE.Group();
  top.position.set(0, .93, .02);
  top.rotation.x = .62;
  group.add(top);
  b.box(length + .06, .03, .54, 0, -.02, 0, body3d, top);
  const face = b.plane(length, .5, b.material(new THREE.MeshBasicMaterial({ map: labelTexture(b, title, body, "#dcd8c6", "#1c201b", theme.trim), toneMapped: false })), top);
  face.rotation.x = -Math.PI / 2;
  face.position.y = .002;
  b.obstacles.push({ minX: x - .45, maxX: x + .45, minZ: z - .45, maxZ: z + .45 });
}

/** Main room: a light ring over the zebra dais and a backlit Zcash pillar. */
export function buildMainRoomInstallation(b: ExhibitionBuilder, hooks: InstallationHooks, z: number): void {
  const charcoal = b.material(new THREE.MeshStandardMaterial({ color: "#181d19", roughness: .86 }));
  const stone = b.material(new THREE.MeshStandardMaterial({ color: "#b9bcae", roughness: .55 }));
  const housing = b.material(new THREE.MeshStandardMaterial({ color: "#121613", roughness: .7, metalness: .3 }));
  const warm = glow(b, "#f3ecd6");

  // Suspended halo, as in the reference rotunda.
  mesh(b, new THREE.TorusGeometry(4.6, .14, 10, 120), housing, b.scene, [0, 5.62, z], [Math.PI / 2, 0, 0]).castShadow = false;
  mesh(b, new THREE.TorusGeometry(4.6, .05, 10, 120), warm, b.scene, [0, 5.5, z], [Math.PI / 2, 0, 0]).castShadow = false;
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    b.box(.02, .4, .02, Math.cos(a) * 4.6, 5.86, z + Math.sin(a) * 4.6, housing).castShadow = false;
  }
  const halo = new THREE.PointLight("#f1e8d0", 1.3, 15, 1.4);
  halo.position.set(0, 4.9, z);
  b.scene.add(halo);

  // Zebra on a tiered round dais, left of the central route.
  const zebraX = -3.25;
  mesh(b, new THREE.CylinderGeometry(1.72, 1.8, .22, 64), charcoal, b.scene, [zebraX, .11, z]);
  mesh(b, new THREE.CylinderGeometry(1.5, 1.55, .2, 64), stone, b.scene, [zebraX, .32, z]);
  mesh(b, new THREE.TorusGeometry(1.6, .012, 6, 96), warm, b.scene, [zebraX, .225, z], [Math.PI / 2, 0, 0]).castShadow = false;
  const zebra = buildZebraSculpture(b);
  zebra.position.set(zebraX - .1, .42, z);
  zebra.rotation.y = -.5;
  b.scene.add(zebra);
  b.obstacles.push({ minX: zebraX - 1.9, maxX: zebraX + 1.9, minZ: z - 1.9, maxZ: z + 1.9 });
  const zebraSpot = new THREE.SpotLight("#fff4dc", 9, 9, .42, .65, 1.3);
  zebraSpot.position.set(zebraX + 1.4, 5.6, z + 2.2);
  zebraSpot.target.position.set(zebraX, 1.4, z);
  b.scene.add(zebraSpot, zebraSpot.target);
  addLectern(b, zebraX + 1.55, z + 2.15, .55, "Zebra.", "No two coats are alike. The pattern is unmistakable, yet it never carries a name. Here the thought is visible; the person stays unseen.");

  // Backlit Zcash pillar on the right, turned toward the route.
  const pillar = new THREE.Group();
  pillar.position.set(3.35, 0, z);
  pillar.rotation.y = -.42;
  b.scene.add(pillar);
  b.box(1.9, .18, .9, 0, .09, 0, charcoal, pillar);
  b.box(1.74, 4.5, .46, 0, 2.43, 0, charcoal, pillar);
  const panel = b.plane(1.56, 4.3, b.material(new THREE.MeshBasicMaterial({ map: zcashPanelTexture(b), toneMapped: false })), pillar);
  panel.position.set(0, 2.43, .235);
  const emblem = buildZcashEmblem(b, .58);
  emblem.position.set(0, 3.25, .33);
  pillar.add(emblem);
  b.obstacles.push({ minX: 3.35 - 1.3, maxX: 3.35 + 1.3, minZ: z - 1.1, maxZ: z + 1.1 });
  const pillarSpot = new THREE.SpotLight("#ffe6a8", 6, 7, .35, .7, 1.3);
  pillarSpot.position.set(1.8, 5.6, z + 2.6);
  pillarSpot.target.position.set(3.35, 3, z);
  b.scene.add(pillarSpot, pillarSpot.target);
  // Live network figures circle under the halo; the glass cases hold
  // typed readings; a kiosk points to official wallets.
  addVitrineNotes(b, hooks, -10.92, -4, 9, -1, 0);
  addWalletKiosk(b, 8.25, 1.2, -.35);

  // Other anonymous visitors: one strolling, three reading, one resting.
  addVoidVisitors(b, hooks, [
    { kind: "walk", path: [[4, 12], [4, -1], [.6, -2.5], [.6, -12], [-.6, -12], [-.9, -3], [-9, -1], [-9, 12]] },
    // Readers stand beside the pieces, never between the route and a label.
    { kind: "read", x: -5.35, z: z + .4, facing: Math.atan2(2.1, -.4) },
    { kind: "read", x: 5.55, z: z + .9, facing: Math.atan2(-2.2, -.9) },
    { kind: "read", x: 10, z: -12, facing: Math.PI / 2 },
    { kind: "sit", x: 6.6, z: 6, facing: Math.PI, seat: .56 },
  ]);
  addLectern(b, 1.95, z + 1.75, -.5, "Zcash.", "Private money secured by zero-knowledge proofs. The network verifies the payment without revealing who sent it.");
}

function zcashPanelTexture(b: ExhibitionBuilder): THREE.CanvasTexture {
  return canvasMap(b, 512, 1412, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#2a2414");
    gradient.addColorStop(.45, "#1a1913");
    gradient.addColorStop(1, "#0f110e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const halo = ctx.createRadialGradient(w / 2, 400, 40, w / 2, 400, 360);
    halo.addColorStop(0, "rgba(244,183,40,.45)");
    halo.addColorStop(1, "rgba(244,183,40,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(244,183,40,.16)";
    ctx.lineWidth = 1;
    for (let x = 24; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 760); ctx.lineTo(x, h - 260); ctx.stroke(); }
    ctx.fillStyle = "#f4b728";
    ctx.font = "700 92px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ZCASH", w / 2, 860);
    ctx.fillStyle = "#e9dfc4";
    ctx.font = "24px monospace";
    ctx.fillText("SHIELDED BY DESIGN", w / 2, 912);
    ctx.font = "30px Georgia, serif";
    ["The payment is proven.", "The sender is not shown.", "The thought remains."].forEach((line, i) => ctx.fillText(line, w / 2, 1040 + i * 48));
    ctx.fillStyle = "#f4b728";
    ctx.fillRect(w / 2 - 40, h - 150, 80, 3);
  });
}

function friezeTexture(b: ExhibitionBuilder, hooks: InstallationHooks, metres: number, offset: number): THREE.CanvasTexture {
  const width = Math.min(4096, Math.round(metres * 256));
  return liveCanvas(b, hooks, width, 282, (ctx, w, h, stats) => {
    const metrics = zcashMetrics(stats);
    ctx.fillStyle = "#0e1410";
    ctx.fillRect(0, 0, w, h);
    const cells = Math.max(1, Math.round(metres / 1.9));
    const cell = w / cells;
    for (let c = 0; c < cells; c++) {
      const x = c * cell;
      const metric = metrics[(c + offset) % metrics.length];
      const lit = ctx.createLinearGradient(x, 0, x, h);
      lit.addColorStop(0, "rgba(214,224,200,.13)");
      lit.addColorStop(1, "rgba(214,224,200,.03)");
      ctx.fillStyle = lit;
      ctx.fillRect(x + 6, 10, cell - 12, h - 20);
      ctx.fillStyle = "rgba(244,183,40,.75)";
      ctx.fillRect(x + 6, 10, 3, h - 20);
      ctx.font = "600 21px monospace";
      ctx.fillStyle = "#b6c3a7";
      ctx.fillText(metric.label, x + 30, 48);
      ctx.fillStyle = "#e9ecdc";
      let size = 60;
      do { ctx.font = `700 ${size}px Georgia, serif`; size -= 4; } while (ctx.measureText(metric.value).width > cell - 60 && size > 26);
      ctx.fillText(metric.value, x + 28, 118);
      ctx.font = "italic 23px Georgia, serif";
      ctx.fillStyle = "#cfd6c3";
      ctx.fillText(metric.caption, x + 30, 164, cell - 60);
      ctx.fillStyle = "rgba(182,195,167,.22)";
      ctx.fillRect(x + 30, 200, cell - 60, 6);
      if (metric.ratio !== undefined) {
        ctx.fillStyle = "#f4b728";
        ctx.fillRect(x + 30, 200, (cell - 60) * metric.ratio, 6);
      }
      ctx.font = "15px monospace";
      ctx.fillStyle = "#7f8c75";
      ctx.fillText(liveStamp(stats), x + 30, 244, cell - 60);
    }
  });
}

function roomPanelTexture(b: ExhibitionBuilder, number: number, title: string, description: string, theme: MuseumTheme): THREE.CanvasTexture {
  return canvasMap(b, 512, 768, (ctx, w, h) => {
    ctx.fillStyle = theme.trim;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(0, h - 170, w, 170);
    ctx.fillStyle = theme.accent;
    ctx.font = "600 24px monospace";
    ctx.fillText(`ROOM ${String(number).padStart(2, "0")}`, 44, 70);
    ctx.fillRect(44, 92, 60, 4);
    ctx.fillStyle = "#f4f1e6";
    ctx.font = "700 62px Georgia, serif";
    wrapLines(ctx, title, w - 88).slice(0, 3).forEach((line, i) => ctx.fillText(line, 44, 180 + i * 70));
    ctx.font = "28px Georgia, serif";
    ctx.fillStyle = "#e6e2d4";
    wrapLines(ctx, description, w - 88).slice(0, 6).forEach((line, i) => ctx.fillText(line, 44, 380 + i * 40));
    ctx.font = "20px monospace";
    ctx.fillStyle = theme.accent;
    ctx.fillText("ENTER THROUGH THE ARCH  →", 44, h - 72);
  });
}

export interface HallwayRoom {
  side: number;
  z: number;
  index: number;
  label: string;
  description: string;
  theme?: MuseumTheme;
}

/** Hallway: arched portals, themed text panels, reading rails, a backlit
 * frieze between doors, and ring lights over each pair of rooms. */
export function buildHallwayInstallation(b: ExhibitionBuilder, hooks: InstallationHooks, rooms: HallwayRoom[], front: number, back: number): void {
  const portalMaterial = b.material(new THREE.MeshStandardMaterial({ color: "#232925", roughness: .82 }));
  const housing = b.material(new THREE.MeshStandardMaterial({ color: "#121613", roughness: .7, metalness: .3 }));
  const frameMaterial = b.material(new THREE.MeshStandardMaterial({ color: "#3a423b", roughness: .5, metalness: .45 }));
  const warm = glow(b, "#e7ead9");
  const archWidth = 1.55;
  const springLine = 2.9;
  const portal = new THREE.Shape([new THREE.Vector2(-2.2, 0), new THREE.Vector2(2.2, 0), new THREE.Vector2(2.2, 6), new THREE.Vector2(-2.2, 6)]);
  const hole = new THREE.Path();
  hole.moveTo(-archWidth, 0);
  hole.lineTo(archWidth, 0);
  hole.lineTo(archWidth, springLine);
  hole.absarc(0, springLine, archWidth, 0, Math.PI, false);
  hole.lineTo(-archWidth, 0);
  portal.holes.push(hole);
  const portalGeometry = b.geometry(new THREE.ExtrudeGeometry(portal, { depth: .62, bevelEnabled: false, curveSegments: 32 }));

  for (const room of rooms) {
    const theme = room.theme ?? NEUTRAL_THEME;
    const faceX = room.side * 3.33;
    const arch = new THREE.Mesh(portalGeometry, portalMaterial);
    arch.position.set(room.side < 0 ? -3.95 : 3.33, 0, room.z);
    arch.rotation.y = Math.PI / 2;
    arch.castShadow = arch.receiveShadow = true;
    b.scene.add(arch);
    // A thin lamp line traces the arch on the hallway face.
    const archLine = glow(b, theme.accent);
    const curve = mesh(b, new THREE.TorusGeometry(archWidth + .06, .016, 6, 48, Math.PI), archLine, b.scene, [faceX - room.side * .005, springLine, room.z], [0, Math.PI / 2, 0]);
    curve.castShadow = false;
    for (const edge of [-1, 1]) b.box(.03, springLine, .03, faceX - room.side * .005, springLine / 2, room.z + edge * (archWidth + .06), archLine).castShadow = false;

    // Colored interpretation panel and reading rail beside the arch.
    const panelZ = room.z + 3.05;
    const panelAngle = room.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    b.box(.06, 2.12, 1.42, room.side * 3.47, 1.95, panelZ, frameMaterial);
    const panel = b.plane(1.3, 1.95, b.material(new THREE.MeshBasicMaterial({ map: roomPanelTexture(b, room.index + 1, room.label, room.description, theme), toneMapped: false })));
    panel.position.set(room.side * 3.43, 1.95, panelZ);
    panel.rotation.y = panelAngle;
  }

  // Continuous backlit frieze between portals (timeline-wall reference).
  const doorZones = rooms.map((room) => room.z);
  for (const side of [-1, 1]) {
    let cursor = front - .4;
    const stops = [...new Set(doorZones)].sort((a, c) => c - a);
    const segments: Array<[number, number]> = [];
    for (const z of stops) {
      if (cursor - (z + 4) > 1.2) segments.push([cursor, z + 4]);
      cursor = z - 4;
    }
    if (cursor - (back + .4) > 1.2) segments.push([cursor, back + .4]);
    segments.forEach(([start, end], i) => {
      const length = start - end;
      const center = (start + end) / 2;
      b.box(.08, 1.32, length + .1, side * 3.48, 2.85, center, housing).castShadow = false;
      const frieze = b.plane(length, 1.16, b.material(new THREE.MeshBasicMaterial({ map: friezeTexture(b, hooks, length, i * 3 + (side > 0 ? 4 : 0)), toneMapped: false })));
      frieze.position.set(side * 3.43, 2.85, center);
      frieze.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      b.box(.04, .025, length, side * 3.42, 3.56, center, warm).castShadow = false;
    });
  }

  // Visitors drift along the hall and stop at the live frieze.
  addVoidVisitors(b, hooks, [
    { kind: "walk", path: [[1.4, front - 2], [1.4, back + 4], [-1.4, back + 4], [-1.4, front - 2]], speed: .7 },
    { kind: "walk", path: [[1.4, front - 2], [1.4, back + 4], [-1.4, back + 4], [-1.4, front - 2]], speed: .55, phase: 19 },
    { kind: "read", x: -2.6, z: -8, facing: -Math.PI / 2 },
    { kind: "read", x: 2.6, z: -27, facing: Math.PI / 2 },
  ]);

  // Ring lights mark each pair of rooms from far down the hall.
  for (const z of [...new Set(doorZones)]) {
    mesh(b, new THREE.TorusGeometry(2.25, .1, 8, 80), housing, b.scene, [0, 5.66, z], [Math.PI / 2, 0, 0]).castShadow = false;
    mesh(b, new THREE.TorusGeometry(2.25, .035, 8, 80), warm, b.scene, [0, 5.58, z], [Math.PI / 2, 0, 0]).castShadow = false;
  }
}


function scriptTexture(b: ExhibitionBuilder): THREE.CanvasTexture {
  const texture = canvasMap(b, 1024, 1024, (ctx, w, h) => {
    const random = seeded(77);
    ctx.fillStyle = "#f2ecdc";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(70,62,48,.5)";
    ctx.lineWidth = 2.2;
    for (let y = 46; y < h - 20; y += 38) {
      let x = 30 + random() * 60;
      while (x < w - 40) {
        const word = 30 + random() * 70;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let p = x; p < x + word; p += 7) ctx.quadraticCurveTo(p + 3.5, y - 6 - random() * 12, p + 7, y + (random() - .5) * 3);
        ctx.stroke();
        x += word + 14 + random() * 16;
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}



/** Shared room furniture around each confession style: live notes in the
 * glass cases, a live band over the title, two scrolls and a wallet kiosk
 * tucked into a front corner. */
export function buildRoomInstallation(b: ExhibitionBuilder, hooks: InstallationHooks, options: { back: number; index: number; theme?: MuseumTheme }): void {
  const theme = options.theme ?? NEUTRAL_THEME;
  // One glass case of live readings per room keeps the data moderate.
  addVitrineNotes(b, hooks, (options.index % 2 ? 1 : -1) * 10.92, 0, 7.8, options.index % 2 ? 1 : -1, options.index * 2);
  void theme;
  addScroll(b, -7.15, options.back + 2, options.index * 2);
  addScroll(b, 7.15, options.back + 2, options.index * 2 + 1);
  const kioskSide = options.index % 2 === 0 ? 1 : -1;
  addWalletKiosk(b, kioskSide * 9.6, 8.6, kioskSide * -.75);
}

/** A slow ring of live figures circling just below the ceiling. */
function addTickerRing(b: ExhibitionBuilder, hooks: InstallationHooks, x: number, y: number, z: number, radius: number, accent: string): void {
  const map = liveCanvas(b, hooks, 4096, 160, (ctx, w, h, stats) => {
    ctx.fillStyle = "#0b100d";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 6, w, 3);
    ctx.fillRect(0, h - 9, w, 3);
    const items = zcashMetrics(stats).map((metric) => `${metric.label}  ${metric.value}`);
    ctx.font = "600 58px monospace";
    ctx.textBaseline = "middle";
    let cursor = 40;
    // Two passes fill the full circumference without a visible seam.
    for (let pass = 0; pass < 2; pass++) {
      for (const item of items) {
        ctx.fillStyle = "#e7ead9";
        ctx.fillText(item, cursor, h / 2);
        cursor += ctx.measureText(item).width + 46;
        ctx.fillStyle = "#f4b728";
        ctx.fillText("ⓩ", cursor, h / 2);
        cursor += 104;
      }
    }
  });
  map.wrapS = THREE.RepeatWrapping;
  const band = new THREE.Mesh(b.geometry(new THREE.CylinderGeometry(radius, radius, .34, 128, 1, true)),
    b.material(new THREE.MeshBasicMaterial({ map, toneMapped: false })));
  band.position.set(x, y, z);
  b.scene.add(band);
  hooks.tick.push((time) => { band.rotation.y = time * .000035; });
}

/** Index cards lying under the glass of a wall vitrine, typed with live data. */
function addVitrineNotes(b: ExhibitionBuilder, hooks: InstallationHooks, x: number, z: number, length: number, side: number, metricOffset: number): void {
  for (let i = 0; i < 3; i++) {
    const map = liveCanvas(b, hooks, 512, 360, (ctx, w, h, stats) => {
      const metric = zcashMetrics(stats)[(metricOffset + i) % 8];
      ctx.fillStyle = "#ebe6d4";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(140,60,50,.35)";
      ctx.beginPath(); ctx.moveTo(0, 74); ctx.lineTo(w, 74); ctx.stroke();
      ctx.strokeStyle = "rgba(70,100,140,.18)";
      for (let y = 112; y < h; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.fillStyle = "#3b3a33";
      ctx.font = "600 24px monospace";
      ctx.fillText(metric.label, 30, 52);
      ctx.fillStyle = "#151714";
      let size = 64;
      do { ctx.font = `700 ${size}px Georgia, serif`; size -= 4; } while (ctx.measureText(metric.value).width > w - 60 && size > 28);
      ctx.fillText(metric.value, 30, 160);
      ctx.font = "italic 26px Georgia, serif";
      ctx.fillStyle = "#3b3a33";
      ctx.fillText(metric.caption, 30, 214, w - 60);
      // Rubber stamp marks the card as a live reading.
      ctx.save();
      ctx.translate(w - 120, h - 62);
      ctx.rotate(-.12);
      ctx.strokeStyle = "rgba(160,58,44,.75)";
      ctx.fillStyle = "rgba(160,58,44,.75)";
      ctx.lineWidth = 3;
      ctx.strokeRect(-92, -26, 184, 52);
      ctx.font = "700 22px monospace";
      ctx.textAlign = "center";
      ctx.fillText(stats ? "LIVE · MAINNET" : "AWAITING DATA", 0, 8);
      ctx.restore();
      ctx.font = "15px monospace";
      ctx.fillStyle = "#6c6a5e";
      ctx.fillText(liveStamp(stats), 30, h - 24);
    });
    // Each card leans back on a small easel so it reads through the glass.
    const easel = new THREE.Group();
    easel.position.set(x, .95, z + (i - 1) * length * .3);
    easel.rotation.y = -side * Math.PI / 2 + (i - 1) * .06;
    b.scene.add(easel);
    const note = b.plane(.7, .46, b.material(new THREE.MeshBasicMaterial({ map, toneMapped: false })), easel);
    note.rotation.x = -.62;
    b.box(.04, .2, .04, 0, -.08, -.14, b.material(new THREE.MeshStandardMaterial({ color: "#2c312c", roughness: .6 })), easel).castShadow = false;
  }
}

/** Paraphrased from ZecHub's "Start Here" wiki (zechub.wiki/start-here). */
export const ZCASH_LESSONS: Array<[string, string]> = [
  ["Zcash basics", "ZEC is a privacy-first digital currency on the Zcash blockchain. Shielded payments use zero-knowledge proofs, and you choose what to reveal, and to whom."],
  ["Who can see a payment?", "Every payment moves between transparent and shielded addresses. Whatever touches a transparent address becomes public. Only shielded to shielded hides sender, recipient and amount."],
  ["Shield on arrival", "Many exchanges only withdraw to transparent addresses. Shield your ZEC as soon as it lands in your wallet, before you spend it."],
  ["One address, many keys", "The spending key moves funds and is never shared. A full viewing key is read-only. An incoming viewing key shows only arriving payments."],
  ["The narrowest key", "A viewing key cannot be revoked. Give the smallest key that answers the question. To cut access off, move funds to a new address."],
  ["Public is permanent", "Fees stay public even in a shielded payment. Anything the chain shows today, it shows in twenty years. You cannot shield a payment after sending it."],
  ["Monetary policy", "A fixed supply of 21 million ZEC. A block every 75 seconds pays 1.5625 ZEC to miners and the development fund, halving about every four years."],
  ["Your first steps", "Buy a little ZEC; fractions are fine. Set up a shielded wallet such as Zodl, Zingo! or Vizor. Withdraw to it, then send your first shielded payment."],
  ["Encrypted memos", "A shielded payment can carry a fully encrypted message in its memo field. Sending one costs only the transaction fee, under one cent."],
  ["Network upgrades", "From Sprout in 2016 through Sapling, Canopy and NU5's Orchard pool on Halo 2, with no trusted setup, to Ironwood in July 2026."],
  ["Join the community", "The Zcash Community Forum and Discord welcome newcomers, and questions are always fine. ZecHub's wiki is open to edits from anyone."],
];

function scrollTexture(b: ExhibitionBuilder, number: number, title: string, body: string): THREE.CanvasTexture {
  return canvasMap(b, 440, 1012, (ctx, w, h) => {
    const paper = ctx.createLinearGradient(0, 0, w, 0);
    paper.addColorStop(0, "#d9cfb2");
    paper.addColorStop(.5, "#ede4c9");
    paper.addColorStop(1, "#d6cbad");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(90,70,40,.35)";
    ctx.strokeRect(22, 22, w - 44, h - 44);
    ctx.fillStyle = "#8a5a1c";
    ctx.font = "600 22px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`LEARN · ${String(number).padStart(2, "0")}`, w / 2, 92);
    ctx.fillStyle = "#c79a2a";
    ctx.beginPath(); ctx.arc(w / 2, 170, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a2418";
    ctx.font = "700 50px Georgia, serif";
    ctx.fillText("Z", w / 2, 188);
    ctx.font = "700 44px Georgia, serif";
    wrapLines(ctx, title, w - 80).forEach((line, i) => ctx.fillText(line, w / 2, 300 + i * 52));
    ctx.textAlign = "left";
    ctx.font = "28px Georgia, serif";
    ctx.fillStyle = "#3a3122";
    wrapLines(ctx, body, w - 90).slice(0, 12).forEach((line, i) => ctx.fillText(line, 45, 450 + i * 42));
    ctx.textAlign = "center";
    ctx.font = "16px monospace";
    ctx.fillStyle = "#7a6a4a";
    ctx.fillText("ZECHUB.WIKI / START HERE", w / 2, h - 60);
  });
}

/** A hanging paper scroll with wooden rods, suspended from the ceiling. */
export function addScroll(b: ExhibitionBuilder, x: number, z: number, lesson: number, angle = 0): void {
  const [title, body] = ZCASH_LESSONS[lesson % ZCASH_LESSONS.length];
  const wood = b.material(new THREE.MeshStandardMaterial({ color: "#3b2a1a", roughness: .6 }));
  const brass = b.material(new THREE.MeshStandardMaterial({ color: "#b58a3a", roughness: .35, metalness: .7 }));
  const cord = b.material(new THREE.MeshStandardMaterial({ color: "#272a26", roughness: .9 }));
  const group = new THREE.Group();
  const centerY = 2.9;
  group.position.set(x, centerY, z);
  group.rotation.y = angle;
  b.scene.add(group);
  const paper = b.plane(.95, 2.18, b.material(new THREE.MeshStandardMaterial({ map: scrollTexture(b, lesson % ZCASH_LESSONS.length + 1, title, body), roughness: .9, side: THREE.DoubleSide })), group);
  paper.receiveShadow = true;
  for (const y of [1.11, -1.11]) {
    mesh(b, new THREE.CylinderGeometry(.035, .035, 1.12, 14), wood, group, [0, y, .01], [0, 0, Math.PI / 2]);
    for (const end of [-.6, .6]) mesh(b, new THREE.SphereGeometry(.05, 12, 10), brass, group, [end, y, .01]);
  }
  const cordLength = 6 - (centerY + 1.11);
  for (const end of [-.42, .42]) b.box(.006, cordLength, .006, end, 1.11 + cordLength / 2, 0, cord, group).castShadow = false;
}

function walletTexture(b: ExhibitionBuilder): THREE.CanvasTexture {
  return canvasMap(b, 800, 1100, (ctx, w, h) => {
    ctx.fillStyle = "#101511";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f4b728";
    ctx.fillRect(48, 52, 70, 5);
    ctx.font = "600 24px monospace";
    ctx.fillText("ZCASH / WALLETS", 48, 100);
    ctx.fillStyle = "#eef0e2";
    ctx.font = "700 58px Georgia, serif";
    ctx.fillText("Carry it shielded.", 48, 176);
    // Ironwood-ready shielded wallets, from ZecHub's wallet directory.
    const wallets: Array<[string, string]> = [
      ["ZODL", "Mobile"], ["Zingo!", "Mobile · Desktop"], ["Vizor", "Desktop · Mobile"], ["Edge", "Mobile"],
      ["Cake", "Mobile · Desktop"], ["Unstoppable", "Mobile"], ["Keystone", "Hardware"], ["Ledger", "Hardware"],
    ];
    ctx.fillStyle = "#aab69e";
    ctx.font = "22px Georgia, serif";
    ctx.fillText("Ironwood-ready wallets, via ZecHub.", 48, 214);
    wallets.forEach(([name, platform], i) => {
      const x = 48 + (i % 2) * ((w - 96) / 2 + 8);
      const y = 248 + Math.floor(i / 2) * 104;
      const cw = (w - 96) / 2 - 8;
      ctx.fillStyle = "rgba(233,236,220,.06)";
      ctx.fillRect(x, y, cw, 88);
      ctx.fillStyle = "#f4b728";
      ctx.fillRect(x, y, 4, 88);
      ctx.fillStyle = "#eef0e2";
      ctx.font = "700 34px Georgia, serif";
      ctx.fillText(name, x + 22, y + 40);
      ctx.fillStyle = "#aab69e";
      ctx.font = "20px monospace";
      ctx.fillText(platform.toUpperCase(), x + 22, y + 72);
    });
    // QR code for z.cash/wallets, drawn from the module matrix.
    const qr = QRCode.create(ZCASH_WALLETS_URL, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    const box = 236;
    const cell = Math.floor(box / (size + 4));
    const qx = 48, qy = h - box - 70;
    ctx.fillStyle = "#eef0e2";
    ctx.fillRect(qx, qy, cell * (size + 4), cell * (size + 4));
    ctx.fillStyle = "#101511";
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (qr.modules.get(r, c)) ctx.fillRect(qx + (c + 2) * cell, qy + (r + 2) * cell, cell, cell);
    ctx.fillStyle = "#eef0e2";
    ctx.font = "700 32px Georgia, serif";
    ctx.fillText("Download a wallet", qx + box + 32, qy + 70);
    ctx.font = "24px Georgia, serif";
    ctx.fillStyle = "#aab69e";
    ctx.fillText("Scan, or tap this panel, to", qx + box + 32, qy + 118);
    ctx.fillText("compare all 34 on ZecHub.", qx + box + 32, qy + 152);
    ctx.fillStyle = "#f4b728";
    ctx.font = "600 22px monospace";
    ctx.fillText("ZECHUB.WIKI/WALLETS ↗", qx + box + 32, qy + 206);
  });
}

/** A freestanding wallet kiosk. Its invisible hit volume carries the link. */
export function addWalletKiosk(b: ExhibitionBuilder, x: number, z: number, angle: number): void {
  const charcoal = b.material(new THREE.MeshStandardMaterial({ color: "#171c18", roughness: .8 }));
  const gold = glow(b, "#f4b728");
  const kiosk = new THREE.Group();
  kiosk.position.set(x, 0, z);
  kiosk.rotation.y = angle;
  b.scene.add(kiosk);
  b.box(1.5, .14, .7, 0, .07, 0, charcoal, kiosk);
  b.box(1.42, 2.1, .2, 0, 1.25, 0, charcoal, kiosk);
  const screen = b.plane(1.28, 1.76, b.material(new THREE.MeshBasicMaterial({ map: walletTexture(b), toneMapped: false })), kiosk);
  screen.position.set(0, 1.3, .105);
  b.box(1.28, .02, .03, 0, 2.24, .1, gold, kiosk).castShadow = false;
  const hit = b.box(1.5, 2.2, .3, 0, 1.25, .2, b.material(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
  hit.position.applyMatrix4(new THREE.Matrix4().makeRotationY(angle)).add(new THREE.Vector3(x, 0, z));
  hit.rotation.y = angle;
  hit.castShadow = false;
  hit.userData.href = ZCASH_WALLETS_URL;
  b.obstacles.push({ minX: x - .9, maxX: x + .9, minZ: z - .9, maxZ: z + .9 });
}

/** The Library: the rotunda plus walls of ZecHub learning scrolls. */
export function buildLibraryInstallation(b: ExhibitionBuilder, hooks: InstallationHooks, cz: number): void {
  const lessons = [6, 7, 8, 9, 10, 0, 1, 2];
  let next = 0;
  for (const side of [-1, 1]) {
    // Between the wall fins (±2.05, ±6.15, ±10.25) and clear of the cases.
    for (const z of [-8.2, -4.1, 4.1, 8.2]) addScroll(b, side * 11.3, z, lessons[next++], -side * Math.PI / 2);
  }
  // A reading rotunda: lit column of handwriting, gold rings, two benches.
  const charcoal = b.material(new THREE.MeshStandardMaterial({ color: "#191e1a", roughness: .85 }));
  mesh(b, new THREE.CylinderGeometry(.72, .72, 5.9, 48, 1, true), b.material(new THREE.MeshBasicMaterial({ map: scriptTexture(b), color: "#fff3d6", toneMapped: false })), b.scene, [0, 2.95, cz]).castShadow = false;
  mesh(b, new THREE.CylinderGeometry(1.0, 1.08, .2, 48), charcoal, b.scene, [0, .1, cz]);
  mesh(b, new THREE.TorusGeometry(4.6, .04, 8, 120), glow(b, "#f0c766"), b.scene, [0, 5.88, cz], [Math.PI / 2, 0, 0]).castShadow = false;
  const light = new THREE.PointLight("#f2d39a", 1.3, 10, 1.6);
  light.position.set(0, 3, cz);
  b.scene.add(light);
  const fabric = b.material(new THREE.MeshStandardMaterial({ color: "#4a3a1c", roughness: .95 }));
  for (const a of [-.95, .95]) {
    const bench = new THREE.Group();
    bench.position.set(Math.sin(a) * 3.85, 0, cz + Math.cos(a) * 3.85);
    bench.rotation.y = a;
    b.scene.add(bench);
    b.box(2.1, .3, .5, 0, .15, 0, charcoal, bench);
    b.box(2.25, .14, .64, 0, .37, 0, fabric, bench);
    b.obstacles.push({ minX: bench.position.x - 1.2, maxX: bench.position.x + 1.2, minZ: bench.position.z - 1.0, maxZ: bench.position.z + 1.0 });
  }
  b.obstacles.push({ minX: -1.3, maxX: 1.3, minZ: cz - 1.3, maxZ: cz + 1.3 });
  addVoidVisitors(b, hooks, [
    { kind: "sit", x: Math.sin(.95) * 3.85 + Math.cos(.95) * .35, z: cz + Math.cos(.95) * 3.85 - Math.sin(.95) * .35, facing: .95 + Math.PI },
    { kind: "read", x: -9.4, z: 5.6, facing: -Math.PI / 2 },
  ], "#f0c766");
  // Squirrels keep the reading room lively, darting between quiet corners.
  addSquirrels(b, hooks, [
    [-6, 6.5], [-3, 8.5], [3, 8], [6.5, 5.5], [8.5, .5], [6.5, -6], [2.8, -7.4], [-2.6, -7.6],
    [-6.8, -6], [-8.6, .4], [-4.8, 2.4], [4.8, 2.4], [0, 3.8], [-1.8, -6], [-8.8, 8],
  ], [
    { x: 0, z: cz, r: 1.5 },
    { x: Math.sin(.95) * 3.85, z: cz + Math.cos(.95) * 3.85, r: 1.35 },
    { x: -Math.sin(.95) * 3.85, z: cz + Math.cos(.95) * 3.85, r: 1.35 },
    { x: -7.15, z: -9, r: 2.1 },
    { x: 7.15, z: -9, r: 2.1 },
    { x: 9.6, z: 8.6, r: 1.3 },
  ], 3);
}

/** An arched portal in the hallway's end wall that leads to the Library. */
export function addLibraryPortal(b: ExhibitionBuilder, back: number): THREE.Mesh {
  const portalMaterial = b.material(new THREE.MeshStandardMaterial({ color: "#232925", roughness: .82 }));
  const gold = glow(b, "#f4b728");
  const width = 1.7, spring = 3;
  const shape = new THREE.Shape([new THREE.Vector2(-2.6, 0), new THREE.Vector2(2.6, 0), new THREE.Vector2(2.6, 6), new THREE.Vector2(-2.6, 6)]);
  const hole = new THREE.Path();
  hole.moveTo(-width, 0); hole.lineTo(width, 0); hole.lineTo(width, spring);
  hole.absarc(0, spring, width, 0, Math.PI, false); hole.lineTo(-width, 0);
  shape.holes.push(hole);
  const arch = new THREE.Mesh(b.geometry(new THREE.ExtrudeGeometry(shape, { depth: .5, bevelEnabled: false, curveSegments: 32 })), portalMaterial);
  arch.position.set(0, 0, back);
  arch.castShadow = arch.receiveShadow = true;
  b.scene.add(arch);
  mesh(b, new THREE.TorusGeometry(width + .06, .02, 6, 48, Math.PI), gold, b.scene, [0, spring, back + .51]).castShadow = false;
  for (const edge of [-1, 1]) b.box(.035, spring, .035, edge * (width + .06), spring / 2, back + .51, gold).castShadow = false;
  // A warm reading-room glow fills the opening.
  const inside = canvasMap(b, 512, 768, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#3a2c10");
    g.addColorStop(1, "#120f08");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(244,183,40,.18)";
    for (let y = 120; y < h; y += 58) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 40, y); ctx.stroke(); }
    ctx.fillStyle = "#f4b728";
    ctx.textAlign = "center";
    ctx.font = "600 26px monospace";
    ctx.fillText("LEARN ZCASH", w / 2, h * .46);
    ctx.fillStyle = "#efe3c0";
    ctx.font = "700 64px Georgia, serif";
    ctx.fillText("The Library", w / 2, h * .56);
    ctx.font = "22px monospace";
    ctx.fillStyle = "#c9b98c";
    ctx.fillText("SCROLLS FROM ZECHUB", w / 2, h * .63);
  });
  const glowPlane = b.plane(width * 2, spring + width, b.material(new THREE.MeshBasicMaterial({ map: inside, toneMapped: false })));
  glowPlane.position.set(0, (spring + width) / 2, back + .02);
  const light = new THREE.PointLight("#f4c46a", .9, 9, 1.6);
  light.position.set(0, 2.6, back + 1.6);
  b.scene.add(light);
  const hit = b.box(width * 2, spring + width, .3, 0, (spring + width) / 2, back + .7, b.material(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
  hit.castShadow = false;
  hit.userData.library = true;
  return hit;
}
