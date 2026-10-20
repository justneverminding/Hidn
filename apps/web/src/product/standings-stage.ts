import { escapeHtml } from "@hidn/ui";

// The live stage on top of the weekly room board: a few slides that turn on
// their own (leader, the race, the chase, last week's champion) and a LIVE
// line that lights up when a confession lands in a room. Live arrivals come
// from the live pulse, which only hands them over at least two minutes after
// posting plus a random wait, so nothing here can time a person.

export interface StageRoom { channel: string; posts: number }
export interface StageStandings { rooms: StageRoom[]; lastWeekWinner: StageRoom | null }

const SLIDE_MS = 5200;

const TROPHY = `<svg class="hidn-stage__trophy" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <path d="M20 10h24v14a12 12 0 0 1-24 0z" class="hidn-stage__trophy-cup"/>
  <path d="M20 14h-8v4a9 9 0 0 0 9 9M44 14h8v4a9 9 0 0 1-9 9" class="hidn-stage__trophy-arm"/>
  <path d="M28 36h8v8h-8zM22 46h20v6H22z" class="hidn-stage__trophy-cup"/>
  <path d="M27 18l3 3 7-7" class="hidn-stage__trophy-tick"/>
</svg>`;

const LAUREL = `<svg class="hidn-stage__laurel" viewBox="0 0 120 64" aria-hidden="true" focusable="false">
  <path d="M60 58C34 56 18 40 16 14M60 58c26-2 42-18 44-44" class="hidn-stage__laurel-stem"/>
  ${[0, 1, 2, 3, 4].map((i) => {
    const y = 18 + i * 8, xl = 20 + i * 6, xr = 100 - i * 6;
    return `<ellipse cx="${xl}" cy="${y}" rx="7" ry="3.2" transform="rotate(-40 ${xl} ${y})" class="hidn-stage__leaf"/><ellipse cx="${xr}" cy="${y}" rx="7" ry="3.2" transform="rotate(40 ${xr} ${y})" class="hidn-stage__leaf"/>`;
  }).join("")}
</svg>`;

export function renderStandingsStage(standings: StageStandings, label: (channel: string) => string): string {
  const rooms = standings.rooms;
  const [first, second] = rooms;
  const quiet = !first || first.posts === 0;
  const slides: string[] = [];

  slides.push(quiet
    ? `<div class="hidn-stage__slide" data-stage-slide>
        ${TROPHY}
        <div class="hidn-stage__copy"><p class="hidn-stage__kicker">#1 THIS WEEK</p><p class="hidn-stage__big">nobody yet.</p><p class="hidn-stage__small">the first confession puts its room on top.</p></div>
      </div>`
    : `<div class="hidn-stage__slide" data-stage-slide>
        ${TROPHY}
        <div class="hidn-stage__copy">
          <p class="hidn-stage__kicker">#1 THIS WEEK</p>
          <p class="hidn-stage__big">${escapeHtml(label(first.channel))}</p>
          <p class="hidn-stage__small"><b data-stage-count="${escapeHtml(first.channel)}">${first.posts}</b> confessions${second ? ` · leading by ${first.posts - second.posts}` : ""}</p>
        </div>
      </div>`);

  const podium = rooms.slice(0, 3);
  const top = Math.max(1, ...podium.map((room) => room.posts));
  slides.push(`<div class="hidn-stage__slide" data-stage-slide>
    <div class="hidn-stage__race">
      <p class="hidn-stage__kicker">THE RACE</p>
      ${podium.map((room, i) => `<div class="hidn-stage__lane">
        <span class="hidn-stage__lane-rank">${i + 1}</span>
        <span class="hidn-stage__lane-name">${escapeHtml(label(room.channel))}</span>
        <span class="hidn-stage__lane-track"><i style="--to: ${Math.max(2, Math.round((room.posts / top) * 100))}%"></i></span>
        <span class="hidn-stage__lane-count" data-stage-count="${escapeHtml(room.channel)}">${room.posts}</span>
      </div>`).join("")}
    </div>
  </div>`);

  if (first && second) {
    const gap = first.posts - second.posts + 1;
    const share = first.posts > 0 ? Math.round((second.posts / first.posts) * 100) : 0;
    slides.push(`<div class="hidn-stage__slide" data-stage-slide>
      <div class="hidn-stage__chase">
        <p class="hidn-stage__kicker">THE CHASE</p>
        <p class="hidn-stage__big">${first.posts === 0 ? "wide open." : `${escapeHtml(label(second.channel))}`}</p>
        <p class="hidn-stage__small">${first.posts === 0 ? "any room can win this week." : `needs <b>${gap}</b> to take #1 from ${escapeHtml(label(first.channel))}`}</p>
        <span class="hidn-stage__gap" aria-hidden="true"><i style="--to: ${Math.max(2, share)}%"></i></span>
      </div>
    </div>`);
  }

  if (standings.lastWeekWinner) {
    slides.push(`<div class="hidn-stage__slide" data-stage-slide>
      ${LAUREL}
      <div class="hidn-stage__copy">
        <p class="hidn-stage__kicker">LAST WEEK'S CHAMPION</p>
        <p class="hidn-stage__big">${escapeHtml(label(standings.lastWeekWinner.channel))}</p>
        <p class="hidn-stage__small">won with ${standings.lastWeekWinner.posts} confessions</p>
      </div>
    </div>`);
  }

  return `<div class="hidn-stage" data-standings-stage>
    <div class="hidn-stage__slides" aria-live="off">${slides.join("")}</div>
    <div class="hidn-stage__foot">
      <p class="hidn-stage__live" role="status" aria-live="polite"><span class="hidn-stage__dot" aria-hidden="true"></span><b>LIVE</b> <span data-stage-live>listening for new confessions…</span></p>
      <div class="hidn-stage__dots" role="tablist" aria-label="Board slides">${slides.map((_, i) => `<button type="button" role="tab" class="hidn-stage__pip" data-stage-pip="${i}" aria-label="Slide ${i + 1}"></button>`).join("")}</div>
    </div>
  </div>`;
}

let stopStage: (() => void) | null = null;

/** Run the slides and the LIVE line; `rooms` is updated as posts land. */
export function mountStandingsStage(root: ParentNode, standings: StageStandings, label: (channel: string) => string): void {
  stopStage?.();
  stopStage = null;
  const stage = root.querySelector<HTMLElement>("[data-standings-stage]");
  if (!stage) return;
  const slides = [...stage.querySelectorAll<HTMLElement>("[data-stage-slide]")];
  const pips = [...stage.querySelectorAll<HTMLButtonElement>("[data-stage-pip]")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = 0, paused = false;
  const show = (i: number) => {
    index = (i + slides.length) % slides.length;
    slides.forEach((slide, k) => slide.classList.toggle("is-active", k === index));
    pips.forEach((pip, k) => pip.setAttribute("aria-selected", String(k === index)));
  };
  show(0);
  const timer = reduced ? undefined : window.setInterval(() => { if (!paused && !document.hidden) show(index + 1); }, SLIDE_MS);
  pips.forEach((pip, k) => pip.addEventListener("click", () => show(k)));
  stage.addEventListener("pointerenter", () => { paused = true; });
  stage.addEventListener("pointerleave", () => { paused = false; });

  const live = stage.querySelector<HTMLElement>("[data-stage-live]");
  const onPost = (event: Event) => {
    const { channel } = (event as CustomEvent<{ channel: string }>).detail;
    const room = standings.rooms.find((candidate) => candidate.channel === channel);
    if (room) room.posts += 1;
    if (live) {
      live.textContent = `a confession just landed in ${label(channel)}`;
      live.parentElement?.classList.remove("is-flash"); void live.offsetWidth; live.parentElement?.classList.add("is-flash");
    }
    // Bump the numbers and bars on the board and the stage.
    document.querySelectorAll<HTMLElement>(`[data-stage-count="${CSS.escape(channel)}"], [data-standing-count="${CSS.escape(channel)}"]`).forEach((el) => {
      el.textContent = String(room?.posts ?? Number(el.textContent) + 1);
      el.classList.remove("is-bump"); void el.offsetWidth; el.classList.add("is-bump");
    });
    const top = Math.max(1, ...standings.rooms.map((r) => r.posts));
    standings.rooms.forEach((r) => {
      document.querySelectorAll<HTMLElement>(`[data-standing-bar="${CSS.escape(r.channel)}"]`).forEach((bar) => { bar.style.width = `${Math.round((r.posts / top) * 100)}%`; });
    });
  };
  window.addEventListener("hidn:pulse-post", onPost);
  stopStage = () => {
    window.clearInterval(timer);
    window.removeEventListener("hidn:pulse-post", onPost);
  };
}

/** Mobile: one slim line on the feed that cycles through the race. */
export function renderStandingsTicker(standings: StageStandings, label: (channel: string) => string): string {
  const [first, second] = standings.rooms;
  const lines: string[] = [];
  if (first && first.posts > 0) {
    lines.push(`🏆 <b>${escapeHtml(label(first.channel))}</b> leads this week · ${first.posts}`);
    if (second) lines.push(second.posts === first.posts ? `<b>${escapeHtml(label(second.channel))}</b> is tied for #1` : `<b>${escapeHtml(label(second.channel))}</b> needs ${first.posts - second.posts + 1} to take #1`);
  } else {
    lines.push(`🏆 no room leads yet this week · <b>your post could</b>`);
  }
  if (standings.lastWeekWinner) lines.push(`last week: <b>${escapeHtml(label(standings.lastWeekWinner.channel))}</b> won with ${standings.lastWeekWinner.posts}`);
  return `<a class="hidn-ticker" href="/room/rooms" data-standings-ticker aria-label="Loudest rooms this week. Open the full board.">
    <span class="hidn-ticker__tag"><i aria-hidden="true"></i>LIVE</span>
    <span class="hidn-ticker__window">${lines.map((line, i) => `<span class="hidn-ticker__line${i === 0 ? " is-active" : ""}" data-ticker-line>${line}</span>`).join("")}</span>
    <span class="hidn-ticker__go" aria-hidden="true">BOARD →</span>
  </a>`;
}

let stopTicker: (() => void) | null = null;

export function mountStandingsTicker(root: ParentNode, label: (channel: string) => string): void {
  stopTicker?.();
  stopTicker = null;
  const ticker = root.querySelector<HTMLElement>("[data-standings-ticker]");
  if (!ticker) return;
  const window_ = ticker.querySelector<HTMLElement>(".hidn-ticker__window")!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = 0;
  const lines = () => [...window_.querySelectorAll<HTMLElement>("[data-ticker-line]")];
  const show = (i: number) => {
    const all = lines();
    index = (i + all.length) % all.length;
    all.forEach((line, k) => line.classList.toggle("is-active", k === index));
  };
  const timer = reduced ? undefined : window.setInterval(() => { if (!document.hidden) show(index + 1); }, 3800);
  const onPost = (event: Event) => {
    const { channel } = (event as CustomEvent<{ channel: string }>).detail;
    // A live arrival jumps the queue for one turn, then joins the rotation.
    let live = window_.querySelector<HTMLElement>("[data-ticker-live]");
    if (!live) {
      live = document.createElement("span");
      live.className = "hidn-ticker__line";
      live.dataset.tickerLine = "";
      live.dataset.tickerLive = "";
      window_.append(live);
    }
    live.innerHTML = `a confession just landed in <b>${escapeHtml(label(channel))}</b>`;
    show(lines().indexOf(live));
    ticker.classList.remove("is-flash"); void ticker.offsetWidth; ticker.classList.add("is-flash");
  };
  window.addEventListener("hidn:pulse-post", onPost);
  stopTicker = () => { window.clearInterval(timer); window.removeEventListener("hidn:pulse-post", onPost); };
}
