/** The way in: a full-screen black hole. Stars streak toward it, a green
 * accretion ring spins up, and the visitor's own void silhouette is pulled
 * through the horizon before the room opens. Drawn locally on a canvas. */

const DURATION_MS = 3200;

function ease(t: number): number {
  return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** A void figure, head and shoulders, centred at the origin, ~1 unit tall. */
function drawSilhouette(ctx: CanvasRenderingContext2D, rim: number): void {
  ctx.beginPath();
  ctx.ellipse(0, -.32, .13, .16, 0, 0, Math.PI * 2);
  ctx.moveTo(-.34, .5);
  ctx.bezierCurveTo(-.34, .1, -.2, -.08, 0, -.1);
  ctx.bezierCurveTo(.2, -.08, .34, .1, .34, .5);
  ctx.closePath();
  ctx.fillStyle = "#000";
  ctx.shadowColor = `rgba(77, 255, 110, ${.9 * rim})`;
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = .012;
  ctx.strokeStyle = `rgba(125, 255, 154, ${.85 * rim})`;
  ctx.stroke();
}

export function playPortal(): Promise<void> {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const overlay = document.createElement("div");
  overlay.className = "hidn-portal";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-label", "Entering the room");
  const canvas = document.createElement("canvas");
  overlay.append(canvas);
  const caption = document.createElement("p");
  caption.className = "hidn-portal__caption";
  caption.textContent = ">> ENTERING HIDN://ROOM";
  overlay.append(caption);
  document.body.append(overlay);

  if (reduced) {
    overlay.classList.add("hidn-portal--fade");
    return new Promise((resolve) => window.setTimeout(() => { resolve(); window.setTimeout(() => overlay.remove(), 400); }, 600));
  }

  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = (): void => {
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  resize();
  window.addEventListener("resize", resize);

  // Stars at random angles and depths, falling inward.
  const stars = Array.from({ length: 420 }, () => ({ angle: Math.random() * Math.PI * 2, radius: Math.random(), speed: .3 + Math.random() * .9 }));

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number): void => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
      const span = Math.hypot(w, h) / 2;
      ctx.fillStyle = `rgba(0, 0, 0, ${.35 + t * .3})`;
      ctx.fillRect(0, 0, w, h);

      // Warp streaks accelerate toward the singularity.
      const warp = ease(t);
      ctx.lineCap = "round";
      for (const star of stars) {
        star.radius -= star.speed * (.004 + warp * .03);
        if (star.radius <= .02) star.radius = 1;
        const r = star.radius * span;
        const swirl = star.angle + (1 - star.radius) * (1.2 + warp * 2.4);
        const tail = r * (1 + .08 + warp * .35);
        ctx.strokeStyle = `rgba(185, 247, 196, ${Math.min(1, .25 + (1 - star.radius) * .8)})`;
        ctx.lineWidth = (1 + warp * 1.5) * dpr;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(swirl) * r, cy + Math.sin(swirl) * r);
        ctx.lineTo(cx + Math.cos(swirl - .05) * tail, cy + Math.sin(swirl - .05) * tail);
        ctx.stroke();
      }

      // Accretion ring: a glowing, spinning ellipse that opens with time.
      const holeRadius = span * (.06 + Math.pow(t, 3) * 1.2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(now / 900);
      for (let ring = 0; ring < 3; ring++) {
        const radius = holeRadius * (1.6 + ring * .35);
        const gradient = ctx.createRadialGradient(0, 0, radius * .6, 0, 0, radius);
        gradient.addColorStop(0, "rgba(77, 255, 110, 0)");
        gradient.addColorStop(.75, `rgba(77, 255, 110, ${.35 - ring * .09})`);
        gradient.addColorStop(1, "rgba(77, 255, 110, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * (.42 + ring * .08), ring * .7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // The event horizon.
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(125, 255, 154, .6)";
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      // The visitor's silhouette falls in, stretching as it crosses.
      const fall = Math.min(1, t / .82);
      const scale = Math.min(w, h) * .55 * (1 - ease(fall)) + 2;
      if (fall < 1) {
        ctx.save();
        ctx.translate(cx, cy + (1 - ease(fall)) * h * .28);
        ctx.rotate(ease(fall) * 2.6);
        ctx.scale(scale * (1 - fall * .55), scale * (1 + fall * 1.6));
        drawSilhouette(ctx, 1 - fall * .6);
        ctx.restore();
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        window.removeEventListener("resize", resize);
        resolve();
        overlay.classList.add("hidn-portal--done");
        window.setTimeout(() => overlay.remove(), 700);
      }
    };
    requestAnimationFrame(frame);
  });
}
