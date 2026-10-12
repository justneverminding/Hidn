import * as THREE from "three";

/** Neutral architecture shared by the entrance, corridor and six galleries.
 * The references inform the construction, not a backdrop: every case, fin and
 * suspended panel belongs to the walkable scene. No external image requests. */
export interface ExhibitionBuilder {
  scene: THREE.Scene;
  box: (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, parent?: THREE.Object3D) => THREE.Mesh;
  plane: (w: number, h: number, material: THREE.Material, parent?: THREE.Object3D) => THREE.Mesh;
  geometry: <T extends THREE.BufferGeometry>(geometry: T) => T;
  material: <T extends THREE.Material>(material: T) => T;
  texture: (texture: THREE.Texture) => THREE.Texture;
  obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
}

export function exhibitionGraphic(title: string, subtitle: string, index: number, wide = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = wide ? 1536 : 768;
  canvas.height = wide ? 512 : 1280;
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = "#242924";
  ctx.fillRect(0, 0, w, h);
  // Engraved contours give the panel a physical, layered surface. They are
  // abstract exhibition graphics, never presented as an NFT or live data.
  ctx.lineWidth = wide ? 1.5 : 2;
  for (let i = 0; i < 28; i++) {
    ctx.strokeStyle = `rgba(185,194,173,${.055 + i % 4 * .018})`;
    ctx.beginPath();
    for (let y = 0; y <= h; y += 12) {
      const x = w * .56 + Math.sin(y * .006 + index * .8 + i * .055) * w * .19 + i * 12;
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const pad = wide ? 70 : 66;
  ctx.fillStyle = "#b6bcac";
  ctx.font = "20px monospace";
  ctx.fillText(`HIDN   /   ${String(index).padStart(2, "0")}`, pad, 75);
  ctx.fillStyle = "#e4e0d3";
  let font = wide ? 112 : 100;
  let words = title.split(/\s+/);
  let lines: string[] = [];
  do {
    ctx.font = `${font}px Georgia, serif`;
    lines = []; let line = "";
    for (const word of words) {
      if (ctx.measureText(`${line} ${word}`).width > w - pad * 2 && line) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
    if (lines.length <= (wide ? 2 : 4)) break;
    font -= 4;
  } while (font > 36);
  lines.forEach((line, i) => ctx.fillText(line, pad, (wide ? 210 : 290) + i * font * 1.08));
  ctx.fillStyle = "#acb3a3";
  ctx.font = "25px Arial, sans-serif";
  const bodyWords = subtitle.split(/\s+/);
  const bodyLines: string[] = []; let body = "";
  for (const word of bodyWords) {
    if (ctx.measureText(`${body} ${word}`).width > w - pad * 2 && body) { bodyLines.push(body); body = word; }
    else body = body ? `${body} ${word}` : word;
  }
  bodyLines.push(body);
  bodyLines.slice(0, 4).forEach((line, i) => ctx.fillText(line, pad, (wide ? h - 98 : h - 270) + i * 36));
  ctx.fillStyle = "#747e6b";
  ctx.fillRect(pad, h - 76, wide ? 190 : 82, 2);
  ctx.font = "17px monospace";
  ctx.fillText("SHOW THE THOUGHT. HIDE THE PERSON.", pad, h - 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildExhibitionArchitecture(
  b: ExhibitionBuilder,
  options: { kind: "main" | "hall" | "room"; index: number; title: string; description: string; back: number; front: number },
): void {
  const { box, plane, scene } = b;
  const { kind, index, back, front } = options;
  const depth = front - back;
  const charcoal = b.material(new THREE.MeshStandardMaterial({ color: "#171c18", roughness: .91 }));
  const stone = b.material(new THREE.MeshStandardMaterial({ color: "#50594e", roughness: .82 }));
  const paleStone = b.material(new THREE.MeshStandardMaterial({ color: "#abb1a1", roughness: .65 }));
  const metal = b.material(new THREE.MeshStandardMaterial({ color: "#424a40", roughness: .5, metalness: .46 }));
  const lamp = b.material(new THREE.MeshBasicMaterial({ color: "#c9cfb9" }));
  const glass = b.material(new THREE.MeshStandardMaterial({ color: "#dce2d5", transparent: true, opacity: .12, roughness: .1, depthWrite: false, side: THREE.DoubleSide }));
  const panelMaterial = (title: string, subtitle: string, i: number, wide = false) => b.material(new THREE.MeshBasicMaterial({
    map: b.texture(exhibitionGraphic(title, subtitle, i, wide)), toneMapped: false,
  }));

  // A real dark ceiling and narrow coves replace the starfield/grid canopy.
  box(24.3, .16, depth, 0, 6.05, (front + back) / 2, charcoal).castShadow = false;
  for (const side of [-1, 1]) {
    box(.38, .14, depth, side * (kind === "hall" ? 3.1 : 9.6), 5.8, (front + back) / 2, charcoal);
    box(.09, .026, depth - .8, side * (kind === "hall" ? 3.04 : 9.54), 5.71, (front + back) / 2, lamp);
  }

  // Low, lit archival vitrines follow the walls, leaving the middle free.
  function wallCase(x: number, z: number, length: number, angle: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z); group.rotation.y = angle; scene.add(group);
    box(length, .64, .9, 0, .32, 0, charcoal, group);
    box(length + .06, .08, 1.04, 0, .68, 0, paleStone, group);
    box(length, .035, .88, 0, .74, 0, metal, group);
    // Live index cards are laid inside by museum-installations.
    box(length, .4, .018, 0, .98, .46, glass, group);
    box(length, .4, .018, 0, .98, -.46, glass, group);
    box(.018, .4, .92, -length / 2, .98, 0, glass, group);
    box(.018, .4, .92, length / 2, .98, 0, glass, group);
    box(length, .018, .92, 0, 1.18, 0, glass, group);
    box(length, .018, .02, 0, .74, .45, lamp, group);
    // Cases live at the perimeter; retain a small walkable buffer in front.
    const alongZ = Math.abs(angle) > 1;
    b.obstacles.push({ minX: x - (alongZ ? .85 : length / 2 + .3), maxX: x + (alongZ ? .85 : length / 2 + .3), minZ: z - (alongZ ? length / 2 + .3 : .85), maxZ: z + (alongZ ? length / 2 + .3 : .85) });
  }

  if (kind === "hall") {
    // Portals, frieze and ring lights live in museum-installations; only the
    // inlaid floor guide strips belong to the base architecture.
    for (const side of [-1, 1]) box(.025, .008, depth - 1, side * 1.85, .012, (front + back) / 2, metal);
    return;
  }

  // Each room uses the same exhibition language but changes the rhythm:
  // fluted archive, staggered fins, or broad gallery bays.
  const rhythm = index % 3;
  for (const side of [-1, 1]) {
    // Place fins between the confession bays, never across their text.
    for (let z = kind === "main" ? -14.4 : -10.25; z < front; z += kind === "main" ? 4.8 : 4.1) {
      const group = new THREE.Group();
      group.position.set(side * 11.85, 2.8, z); group.rotation.y = -side * Math.PI / 2; scene.add(group);
      if (rhythm === 0) {
        for (let slat = 0; slat < 4; slat++) box(.07, 5.25, .16, (slat - 1.5) * .14, 0, .03, metal, group);
      } else {
        const fin = box(.32, 5.25, .28, 0, 0, .06, stone, group);
        fin.rotation.y = rhythm === 1 ? .34 : 0;
      }
      box(.025, 4.8, .025, .38, 0, .04, lamp, group);
    }
    wallCase(side * 10.92, kind === "main" ? -4 : 0, kind === "main" ? 9 : 7.8, Math.PI / 2);
  }

  if (kind === "main") {
    // Large interpretation panels flank the existing doorway and artifacts.
    for (const side of [-1, 1]) {
      box(4.8, 5.4, .22, side * 7.3, 2.8, back + .3, charcoal);
      const panel = plane(4.55, 5.1, panelMaterial(side < 0 ? "A room without names." : "The thought remains.", side < 0 ? "Anonymous thoughts. Unnamed conversations." : "Move through the hallway to explore the rooms.", side < 0 ? 0 : 1));
      panel.position.set(side * 7.3, 2.8, back + .43);
    }
  } else {
    // A broad wall title integrates wayfinding into the architecture.
    const title = plane(9, 3, panelMaterial(options.title, options.description, index + 1, true));
    title.position.set(0, 4.32, back + .025);
    // A thin, stepped dais reads as exhibition furniture, not an obstacle
    // across the central circulation route.
    for (const side of [-1, 1]) {
      box(3.6, .2, 1.65, side * 7.15, .1, back + 2, charcoal);
      b.obstacles.push({ minX: side * 7.15 - 2.05, maxX: side * 7.15 + 2.05, minZ: back + .85, maxZ: back + 3.05 });
    }
  }
}
