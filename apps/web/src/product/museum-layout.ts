export interface MuseumPoint { x: number; z: number }
export interface MuseumRect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface MuseumTheme {
  accent: string;
  glow: string;
  trim: string;
  wall: string;
  floor: string;
}
export interface GalleryDefinition {
  key: string;
  label: string;
  description: string;
  theme?: MuseumTheme;
  hasNewSignal?: boolean;
  signalCount?: number;
}
export interface GalleryLayout extends GalleryDefinition {
  index: number;
  side: number;
  center: MuseumPoint;
  bounds: MuseumRect;
  entrance: MuseumPoint;
  partitions: MuseumRect[];
}

/** One hallway, paired galleries, and passages between successive galleries. */
export function createMuseumLayout(rooms: GalleryDefinition[]): GalleryLayout[] {
  return rooms.map((room, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const x = side * 10.5;
    const z = -Math.floor(index / 2) * 20;
    // Keep the gallery footprint inside the museum shell. The widened
    // hallway now reads as a visitor route rather than a narrow doorway.
    const minX = side < 0 ? -11.35 : 3.65;
    const maxX = side < 0 ? -3.65 : 11.35;
    return {
      ...room, index, side, center: { x, z },
      bounds: { minX, maxX, minZ: z - 9, maxZ: z + 9 },
      entrance: { x: side * 4.15, z: z + 3 },
      // Room furniture can be added independently once the core route is
      // stable; leaving the path open keeps every gallery reliably walkable.
      partitions: [],
    };
  });
}

function inside(point: MuseumPoint, rect: MuseumRect, inset = 0): boolean {
  return point.x > rect.minX + inset && point.x < rect.maxX - inset
    && point.z > rect.minZ + inset && point.z < rect.maxZ - inset;
}

export function galleryAt(layout: GalleryLayout[], point: MuseumPoint): GalleryLayout | undefined {
  return layout.find((room) => inside(point, room.bounds));
}

export function canWalk(layout: GalleryLayout[], point: MuseumPoint): boolean {
  const lastZ = -Math.floor((layout.length - 1) / 2) * 20;
  if (Math.abs(point.x) < 3.35 && point.z > lastZ - 8.6 && point.z < 10.6) return true;
  for (const room of layout) {
    if (room.partitions.some((partition) => inside(point, partition, -.35))) continue;
    if (inside(point, room.bounds, .38)) return true;
    // The hallway door spans both sides of the gallery wall.
    // Overlap the hallway edge so the navigation graph can pass through a
    // doorway instead of leaving a one-grid-cell gap at the wall.
    if (Math.abs(point.x - room.entrance.x) < 1.25 && Math.abs(point.z - room.entrance.z) < 1.35) return true;
    const next = layout.find((other) => other.index === room.index + 2);
    if (next && Math.abs(point.x - room.center.x) < 1.25
      && point.z < room.center.z - 8 && point.z > next.center.z + 8) return true;
  }
  return false;
}

export function clearMuseumPath(layout: GalleryLayout[], from: MuseumPoint, to: MuseumPoint): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .16));
  for (let i = 1; i <= steps; i++) {
    if (!canWalk(layout, { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps })) return false;
  }
  return true;
}

/** A* respects walls; an index jump walks through the same doors as manual navigation. */
export function museumWalkingPath(layout: GalleryLayout[], from: MuseumPoint, to: MuseumPoint): MuseumPoint[] {
  if (!canWalk(layout, to)) return [from];
  if (clearMuseumPath(layout, from, to)) return [from, to];
  const grid = .5;
  const key = (x: number, z: number): string => `${x},${z}`;
  const start = { x: Math.round(from.x / grid), z: Math.round(from.z / grid) };
  const end = { x: Math.round(to.x / grid), z: Math.round(to.z / grid) };
  const startKey = key(start.x, start.z), endKey = key(end.x, end.z);
  const open = [{ ...start, cost: 0, score: 0 }];
  const costs = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const closed = new Set<string>();
  let found = false;
  while (open.length && closed.size < 14000) {
    open.sort((a, b) => a.score - b.score);
    const current = open.shift()!;
    const currentKey = key(current.x, current.z);
    if (closed.has(currentKey)) continue;
    if (currentKey === endKey) { found = true; break; }
    closed.add(currentKey);
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = current.x + dx, z = current.z + dz;
      const nextKey = key(x, z), cost = current.cost + 1;
      if (closed.has(nextKey) || cost >= (costs.get(nextKey) ?? Infinity)
        || !clearMuseumPath(layout, { x: current.x * grid, z: current.z * grid }, { x: x * grid, z: z * grid })) continue;
      costs.set(nextKey, cost); previous.set(nextKey, currentKey);
      open.push({ x, z, cost, score: cost + Math.abs(x - end.x) + Math.abs(z - end.z) });
    }
  }
  if (!found) return [from];
  const raw = [to];
  let cursor = endKey;
  while (cursor !== startKey) {
    const [x, z] = cursor.split(",").map(Number);
    raw.push({ x: x * grid, z: z * grid });
    cursor = previous.get(cursor)!;
  }
  raw.push(from); raw.reverse();
  const path = [from];
  for (let index = 0; index < raw.length - 1;) {
    let next = raw.length - 1;
    while (next > index + 1 && !clearMuseumPath(layout, raw[index], raw[next])) next--;
    if (!clearMuseumPath(layout, raw[index], raw[next])) return [from];
    path.push(raw[next]); index = next;
  }
  return path;
}
