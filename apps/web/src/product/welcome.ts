/** Terminal typing for the homepage panel and the access screens: lines type
 * one after another and the actions appear last. On the homepage, after 20
 * seconds of waiting, a small watcher terminal slides in. */

const IDLE_MS = 20_000;

export function renderWelcomeWatcher(enterPath: string): string {
  return `<aside class="hidn-watcher" data-hidn-watcher hidden aria-live="polite" aria-labelledby="hidn-watcher-question">
    <div class="hidn-watcher__bar"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><span aria-hidden="true">hidn@room: ~/watcher</span>
      <button type="button" class="hidn-watcher__close" data-hidn-watcher-close aria-label="Close">×</button>
    </div>
    <div class="hidn-watcher__body">
      <div class="hidn-watcher__eyes" aria-hidden="true">
        <span class="hidn-watcher__eye"><i data-hidn-pupil></i></span>
        <span class="hidn-watcher__eye"><i data-hidn-pupil></i></span>
      </div>
      <p class="hidn-watcher__line" id="hidn-watcher-question" data-hidn-watcher-text data-text="&gt;&gt; WHAT ARE YOU WAITING FOR?">&gt;&gt; WHAT ARE YOU WAITING FOR?</p>
      <a class="hidn-watcher__enter" href="${enterPath}" data-hidn-watcher-enter>[ ENTER THE ROOM ]</a>
    </div>
  </aside>`;
}

function typeInto(element: HTMLElement, text: string, speed: number, timers: number[], done: () => void): void {
  element.textContent = "";
  element.classList.add("hidn-typing");
  let index = 0;
  const tick = (): void => {
    element.textContent = text.slice(0, ++index);
    if (index < text.length) timers.push(window.setTimeout(tick, speed));
    else { element.classList.remove("hidn-typing"); done(); }
  };
  tick();
}

export function mountWelcome(root: ParentNode): () => void {
  // The homepage panel and the access screens share the same typing.
  const panel = root.querySelector<HTMLElement>(".hidn-welcome__panel, [data-hidn-type-panel]");
  if (!panel) return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timers: number[] = [];
  const abort = new AbortController();

  // Type each line only after the one before it has finished.
  const lines = [...panel.querySelectorAll<HTMLElement>("[data-hidn-type]")];
  const enter = panel.querySelector<HTMLElement>(".hidn-welcome__enter, [data-hidn-type-reveal]");
  // On the access screens people came to act, so the buttons do not wait.
  enter?.classList.add("hidn-welcome__enter--ready");
  if (!reduced && lines.length) {
    const texts = lines.map((line) => line.textContent ?? "");
    panel.classList.add("hidn-welcome__panel--typing");
    lines.forEach((line) => { line.textContent = ""; });
    let index = 0;
    const next = (): void => {
      if (index >= lines.length) { panel.classList.remove("hidn-welcome__panel--typing"); enter?.classList.add("hidn-welcome__enter--ready"); return; }
      const line = lines[index], text = texts[index++];
      line.classList.add("hidn-typed");
      typeInto(line, text, line.tagName === "H1" ? 50 : text.length > 60 ? 14 : 22, timers, () => { timers.push(window.setTimeout(next, 260)); });
    };
    timers.push(window.setTimeout(next, 350));
  } else {
    enter?.classList.add("hidn-welcome__enter--ready");
  }

  // After 20 seconds on the page, the watcher asks what the visitor is waiting for.
  const watcher = root.querySelector<HTMLElement>("[data-hidn-watcher]");
  if (watcher) {
    const text = watcher.querySelector<HTMLElement>("[data-hidn-watcher-text]")!;
    const question = text.textContent ?? "";
    const pupils = [...watcher.querySelectorAll<HTMLElement>("[data-hidn-pupil]")];
    timers.push(window.setTimeout(() => {
      watcher.hidden = false;
      requestAnimationFrame(() => watcher.classList.add("hidn-watcher--open"));
      if (reduced) return;
      typeInto(text, question, 45, timers, () => {});
    }, IDLE_MS));
    watcher.querySelector("[data-hidn-watcher-close]")?.addEventListener("click", () => {
      watcher.classList.remove("hidn-watcher--open");
      timers.push(window.setTimeout(() => { watcher.hidden = true; }, 400));
    }, { signal: abort.signal });
    // The eyes follow the pointer.
    if (!reduced) {
      window.addEventListener("pointermove", (event) => {
        if (watcher.hidden) return;
        pupils.forEach((pupil) => {
          const eye = pupil.parentElement!.getBoundingClientRect();
          const dx = event.clientX - (eye.left + eye.width / 2);
          const dy = event.clientY - (eye.top + eye.height / 2);
          const distance = Math.hypot(dx, dy) || 1;
          const reach = Math.min(1, distance / 200) * eye.width * .2;
          pupil.style.transform = `translate(${(dx / distance) * reach}px, ${(dy / distance) * reach}px)`;
        });
      }, { signal: abort.signal });
    }
  }

  return () => {
    abort.abort();
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}
