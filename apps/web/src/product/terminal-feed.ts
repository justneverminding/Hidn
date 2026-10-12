/** Social rooms as a live terminal: posts and room entries print in as they
 * scroll into view, one after another. Anything already printed stays still
 * when the feed re-renders; only posts that are new since then print, so a
 * fresh thought arriving reads as incoming. */

const PRINTABLE = ".transmission-row, .room-mobile-index__room, .room-directory__room";
const printed = new Set<string>();

function keyFor(element: HTMLElement): string {
  return element.querySelector<HTMLElement>("[data-share-id]")?.dataset.shareId
    ?? element.dataset.roomChannel
    ?? element.textContent?.trim().slice(0, 80)
    ?? "";
}

export function mountTerminalFeed(root: ParentNode): () => void {
  const page = root.querySelector<HTMLElement>(".public-page--explore");
  if (!page) return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  page.classList.add("hidn-feed");

  let batch = 0;
  let batchTimer = 0;
  const print = (element: HTMLElement): void => {
    // Rows that arrive together print in sequence, then the count resets.
    element.style.setProperty("--hidn-print-delay", `${Math.min(batch++, 8) * 80}ms`);
    window.clearTimeout(batchTimer);
    batchTimer = window.setTimeout(() => { batch = 0; }, 260);
    element.classList.add("hidn-printed");
    printed.add(keyFor(element));
  };

  const observer = reduced || !("IntersectionObserver" in window)
    ? undefined
    : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer!.unobserve(entry.target);
        print(entry.target as HTMLElement);
      }
    }, { rootMargin: "0px 0px -6% 0px" });

  const scan = (scope: ParentNode): void => {
    scope.querySelectorAll<HTMLElement>(PRINTABLE).forEach((element) => {
      if (element.classList.contains("hidn-printed") || element.dataset.hidnPrint) return;
      element.dataset.hidnPrint = "pending";
      if (!observer || printed.has(keyFor(element))) {
        element.classList.add("hidn-printed", "hidn-printed--still");
        return;
      }
      observer.observe(element);
    });
  };
  scan(page);

  // The feed list is replaced on refresh and tab changes.
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(PRINTABLE)) scan(node.parentElement ?? page);
        else scan(node);
      });
    }
  });
  mutations.observe(page, { childList: true, subtree: true });

  return () => {
    observer?.disconnect();
    mutations.disconnect();
    window.clearTimeout(batchTimer);
  };
}
