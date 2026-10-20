import { escapeHtml } from "@hidn/ui";

// A slim line that briefly announces new confessions, then fades. The server
// only hands out posts that are at least two minutes old, and each one waits
// a further random 0-60 seconds here, so nothing lights up the moment a
// person presses TRANSMIT. At most one line every 20 seconds; a burst
// becomes a single summary.

interface PulsePost {
  id: string;
  channel: string;
  opening: string;
  createdAt: string;
}

export interface PulseOptions {
  channelLabel(key: string): string;
  isOwn(id: string): boolean;
  hrefFor(id: string): string;
  feedHref: string;
}

const POLL_MS = 20_000;
const SHOW_MS = 4_500;
const GAP_MS = 20_000;
const EXTRA_DELAY_MS = 60_000;
const FIRST_SHOW_AFTER_MS = 8_000;

let options: PulseOptions | null = null;
let pollTimer: number | undefined;
let since = "";
const seen = new Set<string>();
const ready: PulsePost[] = [];
let lastShownAt = 0;
let startedAt = 0;
let element: HTMLElement | null = null;
let hideTimer: number | undefined;

function line(): HTMLElement {
  if (!element) {
    element = document.createElement("a");
    element.className = "hidn-pulse";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    document.body.append(element);
  }
  return element;
}

async function poll(): Promise<void> {
  if (!options || document.hidden) return;
  try {
    const response = await fetch(`/api/room/pulse?since=${encodeURIComponent(since)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json() as { until: string; posts: PulsePost[] };
    since = data.until;
    for (const post of data.posts) {
      if (seen.has(post.id) || options.isOwn(post.id)) continue;
      seen.add(post.id);
      // Each post waits its own random extra time before it can show.
      window.setTimeout(() => {
        ready.push(post);
        // The room board listens for this to bump its numbers.
        window.dispatchEvent(new CustomEvent("hidn:pulse-post", { detail: { channel: post.channel } }));
        showNext();
      }, Math.random() * EXTRA_DELAY_MS);
    }
  } catch {
    // The line is a nicety; a missed poll changes nothing.
  }
}

function typing(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && active.type !== "checkbox");
}

function showNext(): void {
  if (!options || !ready.length) return;
  const now = Date.now();
  const wait = Math.max(lastShownAt + GAP_MS - now, startedAt + FIRST_SHOW_AFTER_MS - now);
  if (wait > 0 || typing() || document.hidden) {
    window.setTimeout(showNext, Math.max(wait, 3000));
    return;
  }

  const batch = ready.splice(0, ready.length);
  const el = line();
  if (batch.length >= 3) {
    el.setAttribute("href", options.feedHref);
    el.innerHTML = `<b>[ RX ]</b> <span>${batch.length} new confessions just landed</span><i aria-hidden="true">SEE THEM →</i>`;
  } else {
    const post = batch[batch.length - 1];
    // Anything older in a small batch is simply skipped; one line at a time.
    const opening = post.opening.replace(/\s+/g, " ").trim();
    const short = opening.length > 42 ? `${opening.slice(0, 42).trimEnd()}…` : opening;
    el.setAttribute("href", options.hrefFor(post.id));
    el.innerHTML = `<b>[ RX ]</b> <span>new in ${escapeHtml(options.channelLabel(post.channel))} · “${escapeHtml(short)}”</span><i aria-hidden="true">→</i>`;
  }
  lastShownAt = now;
  el.classList.remove("hidn-pulse--out");
  el.classList.add("hidn-pulse--in");
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    el.classList.remove("hidn-pulse--in");
    el.classList.add("hidn-pulse--out");
  }, SHOW_MS);
}

/** Keep the line running on the pages it belongs to; stop it elsewhere. */
export function setLivePulse(active: PulseOptions | null): void {
  options = active;
  if (!active) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
    element?.classList.remove("hidn-pulse--in");
    return;
  }
  if (pollTimer !== undefined) return;
  startedAt = Date.now();
  // Start from posts that are just now crossing the two-minute line.
  since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  void poll();
  pollTimer = window.setInterval(() => void poll(), POLL_MS);
}
