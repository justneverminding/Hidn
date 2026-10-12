import * as THREE from "three";
import type { ExhibitionBuilder } from "./museum-exhibition";
import type { InstallationHooks } from "./museum-installations";

/** Void visitors: faceless, glossy-black figures with a faint glowing edge.
 * They walk loops, stop to read, or sit, so the museum feels inhabited by
 * other anonymous people without ever showing a face or a name. */

export type VisitorPlan =
  | { kind: "walk"; path: Array<[number, number]>; speed?: number; phase?: number }
  | { kind: "read"; x: number; z: number; facing: number; phase?: number }
  | { kind: "sit"; x: number; z: number; facing: number; seat?: number; phase?: number };

interface Figure {
  root: THREE.Group;
  hips: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  arms: Array<{ shoulder: THREE.Group; elbow: THREE.Group }>;
  legs: Array<{ hip: THREE.Group; knee: THREE.Group }>;
}

function pivot(parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function buildFigure(b: ExhibitionBuilder, body: THREE.Material, edge: THREE.Material, scale: number): Figure {
  const part = (geometry: THREE.BufferGeometry, parent: THREE.Object3D, position: [number, number, number], squash: [number, number, number] = [1, 1, 1]): void => {
    b.geometry(geometry);
    const mesh = new THREE.Mesh(geometry, body);
    mesh.position.set(...position);
    mesh.scale.set(...squash);
    mesh.castShadow = true;
    parent.add(mesh);
    // Inverted-hull outline: a slightly larger back-face shell glows at the
    // silhouette edge, giving the void figures their outline.
    const outline = new THREE.Mesh(geometry, edge);
    outline.position.copy(mesh.position);
    outline.scale.set(squash[0] * 1.07, squash[1] * 1.04, squash[2] * 1.07);
    parent.add(outline);
  };
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  const hips = pivot(root, 0, .94);
  part(new THREE.SphereGeometry(.15, 20, 14), hips, [0, 0, 0], [1.05, .72, .72]);
  const chest = pivot(hips, 0, .04);
  const torsoProfile = [[.12, 0], [.135, .1], [.15, .22], [.185, .36], [.2, .45], [.16, .5], [.06, .53]].map(([r, y]) => new THREE.Vector2(r, y));
  part(new THREE.LatheGeometry(torsoProfile, 24), chest, [0, 0, 0], [1, 1, .62]);
  const head = pivot(chest, 0, .56);
  part(new THREE.CylinderGeometry(.045, .055, .09, 12), head, [0, .02, 0]);
  part(new THREE.SphereGeometry(.105, 24, 18), head, [0, .15, .005], [.9, 1.16, 1]);

  const arms = [-1, 1].map((side) => {
    const shoulder = pivot(chest, side * .2, .44);
    part(new THREE.CapsuleGeometry(.048, .2, 6, 12), shoulder, [0, -.15, 0]);
    const elbow = pivot(shoulder, 0, -.3);
    part(new THREE.CapsuleGeometry(.04, .2, 6, 12), elbow, [0, -.14, 0]);
    part(new THREE.SphereGeometry(.045, 12, 10), elbow, [0, -.3, .01], [.8, 1.1, .6]);
    shoulder.rotation.z = side * .08;
    return { shoulder, elbow };
  });
  const legs = [-1, 1].map((side) => {
    const hip = pivot(hips, side * .09, -.04);
    part(new THREE.CapsuleGeometry(.07, .32, 6, 12), hip, [0, -.22, 0]);
    const knee = pivot(hip, 0, -.44);
    part(new THREE.CapsuleGeometry(.055, .32, 6, 12), knee, [0, -.21, 0]);
    part(new THREE.BoxGeometry(.09, .06, .22), knee, [0, -.44, .05]);
    return { hip, knee };
  });
  return { root, hips, chest, head, arms, legs };
}

function angleLerp(from: number, to: number, amount: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}

export function addVoidVisitors(b: ExhibitionBuilder, hooks: InstallationHooks, plans: VisitorPlan[], edgeColor = "#9fb89a"): void {
  const body = b.material(new THREE.MeshStandardMaterial({ color: "#040505", roughness: .22, metalness: .65 }));
  const edge = b.material(new THREE.MeshBasicMaterial({ color: edgeColor, side: THREE.BackSide, transparent: true, opacity: .42, depthWrite: false }));

  plans.forEach((plan, index) => {
    // Each figure owns its materials so it can fade on its own.
    const ownBody = b.material(body.clone());
    const ownEdge = b.material(edge.clone());
    ownBody.transparent = true;
    const edgeOpacity = ownEdge.opacity;
    const figure = buildFigure(b, ownBody, ownEdge, .94 + ((index * 37) % 9) / 100);
    b.scene.add(figure.root);
    const phase = plan.phase ?? index * 1.9;
    // Fade out as the visitor's camera comes close, so a figure never stands
    // solid between the viewer and what they are reading.
    const worldPosition = new THREE.Vector3();
    hooks.frame.push(() => {
      const camera = hooks.camera;
      if (!camera) return;
      figure.root.getWorldPosition(worldPosition);
      const distance = Math.hypot(worldPosition.x - camera.position.x, worldPosition.z - camera.position.z);
      const presence = THREE.MathUtils.smoothstep(distance, 1.6, 4.2);
      ownBody.opacity = presence;
      ownBody.depthWrite = presence > .98;
      ownEdge.opacity = edgeOpacity * presence;
      figure.root.visible = presence > .03;
    });

    if (plan.kind === "walk") {
      const points = plan.path.map(([x, z]) => new THREE.Vector2(x, z));
      const closed = [...points, points[0]];
      const lengths = closed.slice(1).map((point, i) => point.distanceTo(closed[i]));
      const total = lengths.reduce((sum, length) => sum + length, 0);
      const speed = plan.speed ?? .62;
      let facing = 0;
      let last = 0;
      const place = (time: number): void => {
        let distance = ((time / 1000) * speed + phase * 3) % total;
        let segment = 0;
        while (distance > lengths[segment]) distance -= lengths[segment++];
        const from = closed[segment], to = closed[segment + 1];
        const t = distance / lengths[segment];
        figure.root.position.set(THREE.MathUtils.lerp(from.x, to.x, t), 0, THREE.MathUtils.lerp(from.y, to.y, t));
        const target = Math.atan2(to.x - from.x, to.y - from.y);
        const dt = last ? Math.min(.1, (time - last) / 1000) : 1;
        last = time;
        facing = angleLerp(facing, target, Math.min(1, dt * 4));
        figure.root.rotation.y = facing;
        const stride = (time / 1000) * speed * 2.6 + phase;
        const swing = Math.sin(stride);
        figure.legs.forEach(({ hip, knee }, side) => {
          const s = side ? -swing : swing;
          hip.rotation.x = -s * .42;
          knee.rotation.x = Math.max(0, Math.sin(stride + (side ? Math.PI : 0) + 1.2)) * .62;
        });
        figure.arms.forEach(({ shoulder, elbow }, side) => {
          shoulder.rotation.x = (side ? swing : -swing) * .32;
          elbow.rotation.x = -.22;
        });
        figure.hips.position.y = .94 + Math.abs(Math.cos(stride)) * .025;
        figure.chest.rotation.y = swing * .06;
        figure.head.rotation.y = Math.sin(time / 2300 + phase) * .25;
      };
      place(0);
      hooks.tick.push(place);
      return;
    }

    figure.root.position.set(plan.x, 0, plan.z);
    figure.root.rotation.y = plan.facing;
    if (plan.kind === "sit") {
      // Thighs forward along the seat, shins hanging, hands resting on knees.
      const seat = plan.seat ?? .44;
      figure.hips.position.y = seat + .1;
      figure.legs.forEach(({ hip, knee }, side) => { hip.rotation.x = -Math.PI / 2 + .08; hip.rotation.y = (side ? -1 : 1) * .06; knee.rotation.x = Math.PI / 2 - .05; });
      figure.arms.forEach(({ shoulder, elbow }) => { shoulder.rotation.x = -.45; elbow.rotation.x = -.85; });
      figure.chest.rotation.x = .12;
    } else {
      figure.arms.forEach(({ shoulder, elbow }, side) => { shoulder.rotation.x = side ? -.05 : .04; elbow.rotation.x = side ? -1.2 : -.1; shoulder.rotation.z = (side ? 1 : -1) * .1; });
      figure.legs[1].hip.rotation.z = .05;
    }
    const baseHip = figure.hips.position.y;
    hooks.tick.push((time) => {
      const breath = Math.sin(time / 1300 + phase);
      figure.chest.scale.set(1 + breath * .012, 1 + breath * .008, 1 + breath * .015);
      // Slow glances: mostly at the exhibit, occasionally around the room.
      const glance = Math.sin(time / 4100 + phase) > .82 ? Math.sin(time / 900 + phase) * .45 : Math.sin(time / 3000 + phase) * .08;
      figure.head.rotation.y = glance;
      figure.head.rotation.x = plan.kind === "read" ? -.12 + Math.sin(time / 2600 + phase) * .05 : .18;
      if (plan.kind === "read") {
        figure.hips.rotation.z = Math.sin(time / 3400 + phase) * .025;
        figure.hips.position.y = baseHip + Math.sin(time / 3400 + phase) * .006;
      }
    });
  });
}

/** Squirrels that scurry between floor spots, stop, sit up, look around and
 * flick their tails. `avoid` circles keep their runs clear of furniture. */
export function addSquirrels(b: ExhibitionBuilder, hooks: InstallationHooks, spots: Array<[number, number]>, avoid: Array<{ x: number; z: number; r: number }>, count = 3): void {
  const fur = b.material(new THREE.MeshStandardMaterial({ color: "#8a5a34", roughness: .85 }));
  const belly = b.material(new THREE.MeshStandardMaterial({ color: "#d8c3a0", roughness: .9 }));
  const dark = b.material(new THREE.MeshStandardMaterial({ color: "#16110d", roughness: .3 }));
  const tailFur = b.material(new THREE.MeshStandardMaterial({ color: "#9a6a40", roughness: .95 }));
  const sphere = (r: number) => b.geometry(new THREE.SphereGeometry(r, 14, 10));
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, p: [number, number, number], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...p);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const clear = (from: [number, number], to: [number, number]): boolean => avoid.every(({ x, z, r }) => {
    const dx = to[0] - from[0], dz = to[1] - from[1];
    const t = THREE.MathUtils.clamp(((x - from[0]) * dx + (z - from[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(from[0] + dx * t - x, from[1] + dz * t - z) > r;
  });

  for (let n = 0; n < count; n++) {
    let seed = 97 + n * 31;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const root = new THREE.Group();
    root.scale.setScalar(1.35);
    b.scene.add(root);
    // Body pivots at the hips so it can rear up to sit.
    const body = new THREE.Group();
    body.position.set(0, .06, -.05);
    root.add(body);
    add(sphere(.08), fur, body, [0, .06, .07], [1, .95, 1.55]);
    add(sphere(.06), belly, body, [0, .035, .11], [.9, .7, 1.2]);
    const head = new THREE.Group();
    head.position.set(0, .12, .21);
    body.add(head);
    add(sphere(.058), fur, head, [0, 0, 0], [1, .95, 1.1]);
    add(sphere(.028), belly, head, [0, -.012, .05], [1, .85, 1]);
    add(sphere(.01), dark, head, [0, -.004, .077]);
    for (const side of [-1, 1]) {
      add(sphere(.011), dark, head, [side * .036, .016, .04]);
      const ear = add(b.geometry(new THREE.ConeGeometry(.017, .045, 8)), fur, head, [side * .028, .058, -.01]);
      ear.rotation.z = -side * .25;
    }
    for (const side of [-1, 1]) {
      add(sphere(.045), fur, body, [side * .05, .03, -.03], [.7, 1, 1.1]);
      add(b.geometry(new THREE.CapsuleGeometry(.014, .05, 4, 8)), fur, body, [side * .035, -.01, .15]);
      add(b.geometry(new THREE.BoxGeometry(.03, .012, .06)), dark, body, [side * .05, -.045, .0]);
    }
    // A bushy tail: graduated spheres along an S-curve rising behind.
    const tail = new THREE.Group();
    tail.position.set(0, .07, -.07);
    body.add(tail);
    // A continuous plume: a tapered tube along an S-curve, softened by
    // overlapping tufts so it reads as fur rather than segments.
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .05, -.08), new THREE.Vector3(0, .15, -.12),
      new THREE.Vector3(0, .25, -.09), new THREE.Vector3(0, .31, -.02), new THREE.Vector3(0, .3, .05),
    ]);
    const plume = new THREE.Mesh(b.geometry(new THREE.TubeGeometry(tailCurve, 24, .045, 10, false)), tailFur);
    plume.castShadow = true;
    tail.add(plume);
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      const point = tailCurve.getPoint(t);
      add(sphere(.03 + Math.sin(t * Math.PI) * .038), tailFur, tail, [point.x, point.y, point.z], [.8, 1, 1]);
    }

    let from = spots[Math.floor(rand() * spots.length)];
    let to = from;
    let state: "run" | "sit" = "sit";
    let stateStart = 0;
    let stateLength = 800 + rand() * 1500;
    let facing = rand() * Math.PI * 2;
    root.position.set(from[0], 0, from[1]);
    root.rotation.y = facing;
    const pickTarget = (): void => {
      for (let tries = 0; tries < 12; tries++) {
        const candidate = spots[Math.floor(rand() * spots.length)];
        if (candidate !== from && clear(from, candidate)) { to = candidate; return; }
      }
      to = from;
    };
    hooks.tick.push((time) => {
      const elapsed = time - stateStart;
      if (elapsed > stateLength) {
        stateStart = time;
        if (state === "sit") {
          pickTarget();
          state = to === from ? "sit" : "run";
          stateLength = state === "run" ? Math.hypot(to[0] - from[0], to[1] - from[1]) / 2.1 * 1000 : 1200;
          if (state === "run") facing = Math.atan2(to[0] - from[0], to[1] - from[1]);
        } else {
          from = to;
          state = "sit";
          stateLength = 1500 + rand() * 3500;
        }
        return;
      }
      const t = THREE.MathUtils.clamp(elapsed / stateLength, 0, 1);
      if (state === "run") {
        // Quick bounding hops: a lift and a nose-down pitch on each stride.
        const hop = Math.abs(Math.sin(elapsed / 1000 * Math.PI * 7));
        root.position.set(THREE.MathUtils.lerp(from[0], to[0], t), hop * .05, THREE.MathUtils.lerp(from[1], to[1], t));
        root.rotation.y = angleLerp(root.rotation.y, facing, .35);
        body.rotation.x = .12 - hop * .22;
        tail.rotation.x = -.35 + hop * .25;
        head.rotation.set(0, 0, 0);
      } else {
        // Rear up, glance about, flick the tail now and then.
        const rise = THREE.MathUtils.smoothstep(Math.min(elapsed, 400), 0, 400);
        root.position.y = 0;
        body.rotation.x = -1.0 * rise;
        head.rotation.x = .9 * rise;
        head.rotation.y = Math.sin(time / 520 + n) * .6 * rise;
        tail.rotation.x = .25 * rise + (Math.sin(time / 140 + n * 2) > .93 ? .3 : 0);
      }
    });
  }
}
