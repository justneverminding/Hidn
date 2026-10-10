import * as THREE from "three";

export interface MuseumPost {
  id?: string;
  text: string;
  category?: string;
  time: string;
}

interface Exhibit {
  group: THREE.Group;
  surface: THREE.Mesh;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  post: MuseumPost;
}

const EYE_HEIGHT = 1.7;
const HALF_WIDTH = 12;
const HALF_DEPTH = 17;
const initialView = { x: 3.4, z: 11.6, yaw: -0.3, pitch: -0.035, fov: 66 };
let savedView = { ...initialView };

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

function postTexture(post: MuseumPost, index: number, signal: boolean): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = "#101b18";
    ctx.fillRect(0, 0, 1024, 1024);
    const light = ctx.createLinearGradient(0, 0, 1024, 1024);
    light.addColorStop(0, "rgba(133,165,142,.09)");
    light.addColorStop(1, "rgba(0,0,0,.22)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = "#57685c";
    ctx.strokeRect(40, 40, 944, 944);
    ctx.fillStyle = signal ? "#a9e6b4" : "#d2c6a4";
    ctx.font = "22px monospace";
    ctx.fillText(`HIDN / ${String(index + 1).padStart(2, "0")}`, 88, 110);
    ctx.textAlign = "right";
    ctx.fillText((post.category ?? "THOUGHT").toUpperCase().slice(0, 26), 936, 110);
    ctx.textAlign = "left";
    ctx.strokeStyle = "#435448";
    ctx.beginPath(); ctx.moveTo(88, 148); ctx.lineTo(936, 148); ctx.stroke();
    let fontSize = 54;
    let lines: string[] = [];
    do {
      ctx.font = `${fontSize}px Georgia, serif`;
      lines = wrapText(ctx, post.text, 836);
      if (lines.length * fontSize * 1.3 <= 620 || fontSize <= 30) break;
      fontSize -= 2;
    } while (fontSize > 0);
    const maxLines = Math.floor(620 / (fontSize * 1.3));
    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      let lastLine = visibleLines[maxLines - 1];
      while (ctx.measureText(`${lastLine}…`).width > 836) lastLine = lastLine.slice(0, -1);
      visibleLines[maxLines - 1] = `${lastLine}…`;
    }
    ctx.fillStyle = "#e9e7d9";
    const top = 225 + Math.max(0, (620 - visibleLines.length * fontSize * 1.3) / 2);
    visibleLines.forEach((line, i) => ctx.fillText(line, 92, top + i * fontSize * 1.3));
    ctx.strokeStyle = "#435448";
    ctx.beginPath(); ctx.moveTo(88, 871); ctx.lineTo(936, 871); ctx.stroke();
    ctx.fillStyle = "#94a89b";
    ctx.font = "20px monospace";
    ctx.fillText("WITHOUT A NAME", 88, 923);
    ctx.textAlign = "right";
    ctx.fillText("TAP TO READ →", 936, 923);
  });
}

/** Physical geometry, first-person camera and raycast navigation. No panorama backdrop. */
export function mountRoomMuseum(root: HTMLElement, posts: MuseumPost[], signal: boolean): () => void {
  const host = root.querySelector<HTMLElement>("[data-museum-stage]");
  if (!host) return () => {};
  const abort = new AbortController();
  const events = { signal: abort.signal };
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const occluders: THREE.Object3D[] = [];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#070e10");
  scene.fog = new THREE.Fog("#101c1c", 28, 68);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "room-museum__canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "3D museum. Drag to look around, tap the floor to walk, tap a framed thought to read. Use W and S to walk, A and D to move sideways, arrow keys to look.");
  host.prepend(canvas);
  const camera = new THREE.PerspectiveCamera(savedView.fov, 1, 0.08, 110);
  camera.position.set(savedView.x, EYE_HEIGHT, savedView.z);
  camera.rotation.order = "YXZ";
  let yaw = savedView.yaw;
  if (window.matchMedia("(max-width: 760px)").matches && savedView.x === initialView.x && savedView.z === initialView.z && savedView.yaw === initialView.yaw) yaw = -.8;
  let pitch = savedView.pitch;
  let disposed = false;
  let animationId = 0;
  let lastTime = 0;
  let dirty = true;
  let movement: { path: THREE.Vector3[]; lengths: number[]; distance: number; yaw: number; fromYaw: number; pitch: number; fromPitch: number; started: number; duration: number; complete?: () => void } | undefined;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#253932", roughness: .92 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#667768", roughness: .52, metalness: .45 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#0e1919", roughness: .75 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: signal ? "#b8dfb1" : "#c3c7aa" });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: "#877d5e", roughness: .34, metalness: .72 });
  const innerMaterial = new THREE.MeshStandardMaterial({ color: "#17251e", roughness: .62, metalness: .25 });
  [wallMaterial, trimMaterial, darkMaterial, glowMaterial, frameMaterial, innerMaterial].forEach((m) => materials.add(m));
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
  function label(text: string, w: number, h: number, x: number, y: number, z: number, angle = 0): void {
    const map = texture(canvasTexture(1024, 256, (ctx) => {
      ctx.clearRect(0, 0, 1024, 256);
      ctx.fillStyle = "#b0c8b6";
      ctx.font = "32px monospace";
      ctx.textAlign = "center";
      ctx.fillText(text, 512, 145);
    }));
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
    materials.add(mat);
    const mesh = plane(w, h, mat);
    mesh.position.set(x, y, z); mesh.rotation.y = angle;
  }

  // A continuous hall with an open central aisle and a recessed entrance.
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
  label("THE THOUGHT IS VISIBLE. THE PERSON STAYS HIDDEN.", 7.2, 1.3, 0, 4.8, -16.96);
  label("HIDN / A ROOM WITHOUT NAMES", 4.5, 1, 0, 2.6, -20.81);

  const floorMap = texture(canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = "#4a4d43"; ctx.fillRect(0, 0, 1024, 1024);
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 6; col++) {
        const x = col * 205 - (row % 2) * 102;
        const shade = 36 + ((row * 17 + col * 23) % 12);
        ctx.fillStyle = `rgb(${shade + 4},${shade + 7},${shade})`;
        ctx.fillRect(x + 1, row * 64 + 1, 203, 62);
        ctx.strokeStyle = "rgba(180,185,160,.08)";
        for (let line = 0; line < 6; line++) {
          ctx.beginPath(); ctx.moveTo(x + 3, row * 64 + 9 + line * 8); ctx.lineTo(x + 200, row * 64 + 9 + line * 8); ctx.stroke();
        }
      }
    }
  }));
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
  floorMap.repeat.set(4, 5.7);
  floorMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorMap, roughness: .78, metalness: .03 });
  materials.add(floorMaterial);
  const floor = plane(24, 34, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const alcoveFloor = plane(5.6, 4.2, floorMaterial);
  alcoveFloor.rotation.x = -Math.PI / 2; alcoveFloor.position.z = -19;

  // Roof beams and a glazed ceiling retain a museum scale, with space above it.
  for (const x of [-12, -8, 0, 8, 12]) box(.12, .18, 34, x, 5.9, 0, darkMaterial);
  for (let z = -17; z <= 17; z += 4.25) box(24, .16, .12, 0, 5.9, z, darkMaterial);
  for (const side of [-1, 1]) {
    box(.06, .018, 34, side * 10.7, 5.65, 0, glowMaterial);
    for (const z of [-12, -4, 4, 12]) {
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
  const starsMaterial = new THREE.PointsMaterial({ color: "#a2b7bb", size: .065, transparent: true, opacity: .65 });
  materials.add(starsMaterial);
  scene.add(new THREE.Points(starsGeometry, starsMaterial));

  const obstacles: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
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
  for (const z of [-7, 4]) {
    box(5.2, 3.4, .24, -4.6, 1.7, z, wallMaterial);
    box(5.2, .04, .3, -4.6, 3.43, z, trimMaterial);
    box(5.2, .025, .025, -4.6, .19, z + .15, glowMaterial);
    obstacles.push({ minX: -7.5, maxX: -1.7, minZ: z - .45, maxZ: z + .45 });
  }
  // A low museum bench sits outside the central walking path.
  box(3.3, .12, .9, 7.1, .5, 6, darkMaterial);
  for (const x of [5.9, 8.3]) box(.08, .45, .7, x, .23, 6, trimMaterial);
  obstacles.push({ minX: 5.2, maxX: 9, minZ: 5.2, maxZ: 6.8 });

  scene.add(new THREE.HemisphereLight("#c2d7d5", "#7c826b", 1.25));
  const ceilingLight = new THREE.DirectionalLight("#eceddc", 1.5);
  ceilingLight.position.set(4, 8, 10);
  ceilingLight.castShadow = true;
  ceilingLight.shadow.mapSize.set(1024, 1024);
  ceilingLight.shadow.camera.left = -22;
  ceilingLight.shadow.camera.right = 22;
  ceilingLight.shadow.camera.top = 24;
  ceilingLight.shadow.camera.bottom = -24;
  ceilingLight.shadow.normalBias = .05;
  scene.add(ceilingLight);
  const backLight = new THREE.DirectionalLight("#91b5aa", .9);
  backLight.position.set(-8, 6, -14); scene.add(backLight);

  const exhibits: Exhibit[] = [];
  const positions = [
    { x: 11.82, z: 5, angle: -Math.PI / 2 },
    { x: 11.82, z: -1, angle: -Math.PI / 2 },
    { x: 11.82, z: -7, angle: -Math.PI / 2 },
    { x: 11.82, z: -13, angle: -Math.PI / 2 },
    { x: 7.3, z: -16.81, angle: 0 },
    { x: -7.3, z: -16.81, angle: 0 },
    { x: -11.82, z: -12, angle: Math.PI / 2 },
    { x: -11.82, z: -5, angle: Math.PI / 2 },
    { x: -11.82, z: 2, angle: Math.PI / 2 },
    { x: -11.82, z: 10, angle: Math.PI / 2 },
    { x: -4.6, z: -6.82, angle: 0 },
    { x: -4.6, z: 4.18, angle: 0 },
  ];
  posts.slice(0, positions.length).forEach((post, index) => {
    const placement = positions[index];
    const group = new THREE.Group();
    group.position.set(placement.x, 2.25, placement.z);
    group.rotation.y = placement.angle;
    scene.add(group);
    const w = index === 4 || index === 5 ? 2.5 : 2.35;
    const h = w;
    box(w + .3, h + .3, .13, 0, 0, 0, darkMaterial, group);
    box(w + .22, .095, .16, 0, (h + .12) / 2, .06, frameMaterial, group);
    box(w + .22, .095, .16, 0, -(h + .12) / 2, .06, frameMaterial, group);
    box(.095, h + .2, .16, -(w + .12) / 2, 0, .06, frameMaterial, group);
    box(.095, h + .2, .16, (w + .12) / 2, 0, .06, frameMaterial, group);
    box(w + .06, h + .06, .035, 0, 0, .08, innerMaterial, group);
    const map = texture(postTexture(post, index, signal));
    map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false });
    materials.add(mat);
    const surface = plane(w, h, mat, group);
    surface.position.z = .115; surface.userData.exhibitIndex = index;
    exhibits.push({ group, surface, position: group.position.clone(), normal: new THREE.Vector3(Math.sin(placement.angle), 0, Math.cos(placement.angle)), post });
    // Each frame is physically fixed to its wall, including its label and picture light.
    box(.5, .065, .16, 0, h / 2 + .32, .18, trimMaterial, group);
    box(.44, .015, .09, 0, h / 2 + .28, .23, glowMaterial, group);
    group.children.forEach((object) => { object.userData.exhibitIndex = index; });
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const clickable = [floor, ...occluders, ...exhibits.map((e) => e.group)];
  const ringGeometry = new THREE.RingGeometry(.21, .27, 40);
  geometries.add(ringGeometry);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: "#d2e5cb", transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false });
  materials.add(ringMaterial);
  const floorCursor = new THREE.Mesh(ringGeometry, ringMaterial);
  floorCursor.rotation.x = -Math.PI / 2; floorCursor.position.y = .025; floorCursor.visible = false;
  scene.add(floorCursor);
  const reader = root.querySelector<HTMLElement>("[data-museum-reader]");
  const status = root.querySelector<HTMLElement>("[data-museum-status]");
  const mapPosition = root.querySelector<SVGElement>("[data-museum-map-position]");
  const mapHeading = root.querySelector<SVGElement>("[data-museum-map-heading]");
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
  function allowed(x: number, z: number): boolean {
    return Math.abs(x) < HALF_WIDTH - .65 && Math.abs(z) < HALF_DEPTH - .65
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
    const to = new THREE.Vector3(THREE.MathUtils.clamp(requested.x, -11.3, 11.3), EYE_HEIGHT, THREE.MathUtils.clamp(requested.z, -16.3, 16.3));
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
    const readingDistance = canvas.clientWidth < 760 ? 5 : 3.3;
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
    if (event.pointerType === "mouse" && event.button !== 0) return;
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
      if (event.pointerType === "mouse" && !movement && reader?.hidden) {
        const hit = pick(event.clientX, event.clientY);
        floorCursor.visible = hit?.object === floor && allowed(hit.point.x, hit.point.z);
        if (floorCursor.visible && hit) floorCursor.position.set(hit.point.x, .025, hit.point.z);
        canvas.style.cursor = hit?.object !== floor && hit ? "pointer" : "grab";
        dirty = true;
      }
      return;
    }
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
      else if (hit && typeof hit.object.userData.exhibitIndex === "number") approachExhibit(hit.object.userData.exhibitIndex);
    }
    if (!pointers.size) root.dataset.museumDragging = "false";
  }, events);
  const release = (): void => { pointers.clear(); root.dataset.museumDragging = "false"; };
  canvas.addEventListener("pointercancel", release, events);
  canvas.addEventListener("lostpointercapture", (event) => { pointers.delete(event.pointerId); if (!pointers.size) release(); }, events);
  canvas.addEventListener("pointerleave", () => { floorCursor.visible = false; dirty = true; }, events);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * .025, 42, 82);
    camera.updateProjectionMatrix(); dirty = true;
  }, { ...events, passive: false });
  root.querySelectorAll<HTMLButtonElement>("[data-museum-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.museumAction;
      if (action === "forward") step(2.4);
      if (action === "back") step(-2.4);
      if (action === "left" || action === "right") { movement = undefined; yaw += action === "left" ? Math.PI / 8 : -Math.PI / 8; dirty = true; }
      if (action === "zoom-in" || action === "zoom-out") {
        camera.fov = THREE.MathUtils.clamp(camera.fov + (action === "zoom-in" ? -6 : 6), 42, 82); camera.updateProjectionMatrix(); dirty = true;
      }
      if (action === "reset") {
        movement = undefined; camera.position.set(initialView.x, EYE_HEIGHT, initialView.z);
        yaw = window.matchMedia("(max-width: 760px)").matches ? -.8 : initialView.yaw;
        pitch = initialView.pitch; camera.fov = initialView.fov; camera.updateProjectionMatrix(); closeReader(); dirty = true;
      }
      if (action === "map") {
        const map = root.querySelector<HTMLElement>("[data-museum-map]");
        if (map) { map.hidden = !map.hidden; button.setAttribute("aria-expanded", String(!map.hidden)); }
      }
    }, events);
  });
  root.querySelector<HTMLButtonElement>("[data-museum-reader-close]")?.addEventListener("click", closeReader, events);
  root.querySelectorAll<HTMLButtonElement>("[data-museum-exhibit]").forEach((button) => {
    button.addEventListener("click", () => {
      const exhibition = root.querySelector<HTMLDetailsElement>("[data-museum-exhibition]");
      if (exhibition) exhibition.open = false;
      canvas.focus({ preventScroll: true });
      approachExhibit(Number(button.dataset.museumExhibit));
    }, events);
  });
  root.addEventListener("keydown", (event) => {
    if (event.target instanceof Element && event.target.closest("input,textarea,select")) return;
    if (event.key === "Escape") { closeReader(); return; }
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
    if (!["w", "s", "a", "d", "arrowleft", "arrowright", "arrowup", "arrowdown", "enter"].includes(key)) return;
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
      if (hit && typeof hit.object.userData.exhibitIndex === "number") approachExhibit(hit.object.userData.exhibitIndex);
    }
    dirty = true;
  }, events);
  const resize = new ResizeObserver(() => {
    const width = host.clientWidth; const height = host.clientHeight;
    if (!width || !height || disposed) return;
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
    mapPosition?.setAttribute("cx", String(60 + camera.position.x * 3));
    mapPosition?.setAttribute("cy", String(64 + camera.position.z * 3));
    mapHeading?.setAttribute("transform", `translate(${60 + camera.position.x * 3} ${64 + camera.position.z * 3}) rotate(${-THREE.MathUtils.radToDeg(yaw)})`);
    if (status) status.textContent = movement ? "MOVING THROUGH THE ROOM" : "DRAG TO LOOK · TAP THE FLOOR TO WALK · TAP A FRAME TO READ";
    savedView = { x: camera.position.x, z: camera.position.z, yaw, pitch, fov: camera.fov };
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    abort.abort(); resize.disconnect(); cancelAnimationFrame(animationId);
    renderer.dispose(); renderer.forceContextLoss();
    textures.forEach((t) => t.dispose()); materials.forEach((m) => m.dispose()); geometries.forEach((g) => g.dispose());
    canvas.remove();
  }
  function animate(time: number): void {
    if (disposed) return;
    if (!host?.isConnected) { dispose(); return; }
    if (!document.hidden && time - lastTime > 1000 / 45) {
      lastTime = time;
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
