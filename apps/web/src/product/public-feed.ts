import { escapeHtml } from "@hidn/ui";
import { fetchAnonymousPosts, type RoomPost } from "./room-api";

// Read before joining: a public, read-only window into the room at /read,
// and a live ticker of real posts on the homepage. Anything that writes
// (like, reply, post) asks the visitor to get a key first.

const READ_CHANNELS: Array<{ key: string; label: string }> = [
  { key: "general", label: "GENERAL" },
  { key: "love", label: "LETTING GO" },
  { key: "night-shift", label: "NIGHT SHIFT" },
  { key: "blackbox", label: "BLACKBOX" },
  { key: "redacted", label: "REDACTED" },
  { key: "underground", label: "UNDERGROUND" },
];

function rerender(): void {
  window.dispatchEvent(new CustomEvent("hidn:rerender"));
}

export function timeAgo(value: string): string {
  const then = Date.parse(value);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// MARK: /read

interface ChannelFeed {
  status: "loading" | "ready" | "error";
  posts: RoomPost[];
  loadedAt: number;
}

const FEED_REFRESH_MS = 60_000;
const FEED_RETRY_MS = 8_000;

const feeds = new Map<string, ChannelFeed>();
let joinPromptFor = "";

export function readChannelFromPath(path: string): string | null {
  if (path === "/read") return "general";
  const match = path.match(/^\/read\/([a-z-]+)$/);
  return match && READ_CHANNELS.some((channel) => channel.key === match[1]) ? match[1] : null;
}

function feedFor(channel: string): ChannelFeed {
  let feed = feeds.get(channel);
  // Fetch on first view, quietly again once the cached copy is a minute old,
  // and after a failure no more than every few seconds.
  const age = feed ? Date.now() - feed.loadedAt : Infinity;
  if (!feed || (feed.status === "ready" && age > FEED_REFRESH_MS) || (feed.status === "error" && age > FEED_RETRY_MS)) {
    feed = feed ?? { status: "loading", posts: [], loadedAt: 0 };
    feed.loadedAt = Date.now();
    feeds.set(channel, feed);
    const target = feed;
    void fetchAnonymousPosts(channel)
      .then((response) => {
        target.posts = response.posts;
        target.status = "ready";
      })
      .catch(() => {
        // Keep showing what we had, if anything; otherwise say the signal dropped.
        if (!target.posts.length) target.status = "error";
      })
      .finally(rerender);
  }
  return feed;
}

function renderReadPost(post: RoomPost): string {
  return `<article class="hidn-read__post">
    <header><span>ANONYMOUS</span><time datetime="${escapeHtml(post.time)}">${escapeHtml(timeAgo(post.time))}</time></header>
    <p>${escapeHtml(post.text)}</p>
    <footer>
      <button type="button" data-read-join="like" aria-label="Like this post">♡ ${post.reactions}</button>
      <button type="button" data-read-join="reply" aria-label="Reply to this post">↳ ${post.replies} ${post.replies === 1 ? "REPLY" : "REPLIES"}</button>
    </footer>
  </article>`;
}

function renderJoinPrompt(): string {
  if (!joinPromptFor) return "";
  const verb = joinPromptFor === "like" ? "like this" : joinPromptFor === "reply" ? "reply" : "say something";
  return `<div class="hidn-read__join" role="dialog" aria-modal="true" aria-labelledby="hidn-read-join-title">
    <button class="hidn-read__join-backdrop" type="button" data-read-join-close aria-label="Keep reading"></button>
    <section class="hidn-read__join-panel">
      <p class="hidn-read__join-log">&gt; access required</p>
      <h2 id="hidn-read-join-title">TO ${escapeHtml(verb.toUpperCase())}, GET A KEY.</h2>
      <p>It takes a few seconds. No email. No phone number. No name. Nobody, not even us, can see who you are.</p>
      <div class="hidn-read__join-actions">
        <a class="hidn-read__btn hidn-read__btn--primary" href="/room/access">[ GET MY KEY ]</a>
        <button class="hidn-read__btn" type="button" data-read-join-close>[ KEEP READING ]</button>
      </div>
    </section>
  </div>`;
}

export function renderReadBody(channel: string, signedIn: boolean): string {
  const feed = feedFor(channel);
  const tabs = READ_CHANNELS.map((option) => `<a class="hidn-read__tab${option.key === channel ? " hidn-read__tab--active" : ""}" href="${option.key === "general" ? "/read" : `/read/${option.key}`}"${option.key === channel ? ' aria-current="page"' : ""}>${escapeHtml(option.label)}</a>`).join("");
  const list = feed.status === "loading"
    ? `<p class="hidn-read__status">&gt; tuning in...<span class="hidn-read__caret">▌</span></p>`
    : feed.status === "error"
      ? `<p class="hidn-read__status">&gt; the signal dropped. <a href="${channel === "general" ? "/read" : `/read/${channel}`}">try again</a></p>`
      : feed.posts.length
        ? feed.posts.map(renderReadPost).join("")
        : `<p class="hidn-read__status">&gt; nothing here yet. this room is waiting for its first voice.<span class="hidn-read__caret">▌</span></p>`;
  const cta = signedIn
    ? `<a class="hidn-read__btn hidn-read__btn--primary" href="/room/rooms">[ YOU'RE IN · OPEN THE ROOM → ]</a>`
    : `<button class="hidn-read__btn hidn-read__btn--primary" type="button" data-read-join="post">[ ✎ SAY SOMETHING ]</button>`;

  return `<div class="hidn-read">
    <p class="hidn-read__code">/// READ FIRST</p>
    <h1 class="hidn-read__title" data-text="WHAT PEOPLE CAN'T SAY OUT LOUD.">WHAT PEOPLE CAN'T SAY OUT LOUD.</h1>
    <p class="hidn-read__line">&gt; Real posts from real people. No names attached, ever. Read as long as you like.</p>
    <nav class="hidn-read__tabs" aria-label="Rooms">${tabs}</nav>
    <div class="hidn-read__list">${list}</div>
    <div class="hidn-read__bar">
      <span>&gt; ${signedIn ? "your key is active." : "want to say something? free, no email."}</span>
      ${cta}
    </div>
    ${renderJoinPrompt()}
  </div>`;
}

export function bindReadPage(root: ParentNode): void {
  if (!root.querySelector(".hidn-read")) return;
  root.querySelectorAll<HTMLButtonElement>("[data-read-join]").forEach((button) => {
    button.addEventListener("click", () => {
      joinPromptFor = button.dataset.readJoin ?? "post";
      rerender();
    });
  });
  root.querySelectorAll<HTMLElement>("[data-read-join-close]").forEach((button) => {
    button.addEventListener("click", () => {
      joinPromptFor = "";
      rerender();
    });
  });
}

// MARK: Homepage ticker

/** Slides real confessions from every room across the homepage, shuffled,
 * a new one every five seconds. */
const TICKER_INTERVAL_MS = 5000;

export function mountHomeTicker(root: ParentNode): () => void {
  const ticker = root.querySelector<HTMLElement>("[data-home-ticker]");
  if (!ticker) return () => {};
  const quote = ticker.querySelector<HTMLElement>("[data-home-ticker-text]")!;
  const meta = ticker.querySelector<HTMLElement>("[data-home-ticker-meta]")!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timers: number[] = [];
  let stopped = false;

  void Promise.allSettled(READ_CHANNELS.map((channel) => fetchAnonymousPosts(channel.key))).then((results) => {
    // Short posts read best in passing.
    const pool = results
      .flatMap((result) => (result.status === "fulfilled" ? result.value.posts : []))
      .filter((post) => post.text.trim().length >= 12 && post.text.length <= 160);
    if (stopped || !pool.length) return;
    // Fisher-Yates, so every visit deals the room in a new order.
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    let index = 0;
    const put = (post: RoomPost): void => {
      quote.textContent = `“${post.text.replace(/\s+/g, " ").trim()}”`;
      meta.textContent = `— anonymous · ${timeAgo(post.time)}`;
    };
    const next = (): void => {
      if (stopped) return;
      const post = pool[index++ % pool.length];
      if (reduced || ticker.hidden) {
        put(post);
      } else {
        // Slide the current one out to the left, the next in from the right.
        ticker.classList.add("hidn-welcome__ticker--out");
        timers.push(window.setTimeout(() => {
          if (stopped) return;
          put(post);
          ticker.classList.remove("hidn-welcome__ticker--out");
          ticker.classList.add("hidn-welcome__ticker--in");
          void ticker.offsetWidth;
          ticker.classList.remove("hidn-welcome__ticker--in");
        }, 380));
      }
      ticker.hidden = false;
      ticker.classList.add("hidn-welcome__ticker--on");
      timers.push(window.setTimeout(next, TICKER_INTERVAL_MS));
    };
    // Start once the welcome lines have typed themselves in.
    timers.push(window.setTimeout(next, reduced ? 0 : 3000));
  });

  return () => {
    stopped = true;
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}
