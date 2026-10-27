/** Save / share sheet for thread images: pick a card size and which replies
 * ride along, with a live preview of the real image. Lives outside the page
 * render so route re-renders don't close it. */

import { SHARE_CARD_MAX_REPLIES, type ShareCardSize } from "./share-card";

export interface ShareSheetOptions {
  mode: "save" | "share";
  replies: string[];
  /** Reply indexes ticked when the sheet opens. */
  preselect: number[];
  render: (size: ShareCardSize, replies: string[]) => Promise<Blob>;
  confirm: (blob: Blob, size: ShareCardSize, action: "save" | "share") => Promise<void> | void;
}

const SIZE_KEY = "hidn.share.size";
const SIZES: Array<{ key: ShareCardSize; label: string; ratio: string }> = [
  { key: "post", label: "Post", ratio: "4:5" },
  { key: "story", label: "Story", ratio: "9:16" },
  { key: "wide", label: "Wide", ratio: "16:9" },
];

function rememberedSize(): ShareCardSize {
  try {
    const value = window.localStorage.getItem(SIZE_KEY);
    if (value === "post" || value === "story" || value === "wide") return value;
  } catch {
    // Storage blocked: fall back to a post.
  }
  return "post";
}

function rememberSize(size: ShareCardSize): void {
  try { window.localStorage.setItem(SIZE_KEY, size); } catch { /* storage blocked */ }
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

let openSheet: HTMLElement | null = null;

export function closeShareSheet(): void {
  openSheet?.remove();
  openSheet = null;
  document.body.classList.remove("hidn-share-sheet-open");
}

export function openShareSheet(options: ShareSheetOptions): void {
  closeShareSheet();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let size = rememberedSize();
  let picked = options.preselect.filter((index) => index >= 0 && index < options.replies.length);
  let blob: Blob | null = null;
  let previewUrl = "";
  let renderToken = 0;
  let busy = false;

  const sheet = document.createElement("div");
  sheet.className = "hidn-share-sheet";
  sheet.innerHTML = `
    <div class="hidn-share-sheet__scrim" data-share-close></div>
    <section class="hidn-share-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="hidn-share-sheet-title">
      <header class="hidn-share-sheet__head">
        <h2 id="hidn-share-sheet-title">${options.mode === "share" ? "Share image" : "Save image"}</h2>
        <button type="button" class="hidn-share-sheet__close" data-share-close aria-label="Close">×</button>
      </header>
      <div class="hidn-share-sheet__sizes" role="group" aria-label="Card size">
        ${SIZES.map((item) => `<button type="button" data-share-size="${item.key}"><b>${item.label}</b><span>${item.ratio}</span></button>`).join("")}
      </div>
      <div class="hidn-share-sheet__preview"><img alt="Preview of the image" data-share-preview></div>
      ${options.replies.length ? `<div class="hidn-share-sheet__replies">
        <div class="hidn-share-sheet__replies-head"><p>Add replies to the image</p><span data-share-count></span></div>
        <div class="hidn-share-sheet__list">
          ${options.replies.map((reply, index) => `<button type="button" class="hidn-share-sheet__reply" data-share-reply="${index}" aria-pressed="false"><i aria-hidden="true"></i><span>${escapeText(reply)}</span></button>`).join("")}
        </div>
        <p class="hidn-share-sheet__hint" data-share-hint></p>
      </div>` : ""}
      <footer class="hidn-share-sheet__actions">
        <button type="button" class="hidn-share-sheet__btn" data-share-go="share">Share</button>
        <button type="button" class="hidn-share-sheet__btn hidn-share-sheet__btn--primary" data-share-go="save">Save image</button>
      </footer>
      <p class="hidn-share-sheet__status" role="status" aria-live="polite" data-share-sheet-status></p>
    </section>`;
  document.body.append(sheet);
  document.body.classList.add("hidn-share-sheet-open");
  openSheet = sheet;

  const preview = sheet.querySelector<HTMLImageElement>("[data-share-preview]")!;
  const status = sheet.querySelector<HTMLElement>("[data-share-sheet-status]")!;
  const goButtons = sheet.querySelectorAll<HTMLButtonElement>("[data-share-go]");

  const paint = (): void => {
    const max = SHARE_CARD_MAX_REPLIES[size];
    picked = picked.slice(0, max);
    sheet.querySelectorAll<HTMLButtonElement>("[data-share-size]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.shareSize === size));
    });
    sheet.querySelectorAll<HTMLButtonElement>("[data-share-reply]").forEach((button) => {
      const index = Number(button.dataset.shareReply);
      const on = picked.includes(index);
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("is-full", !on && picked.length >= max);
    });
    const count = sheet.querySelector<HTMLElement>("[data-share-count]");
    if (count) count.textContent = `${picked.length} of ${max}`;
    const hint = sheet.querySelector<HTMLElement>("[data-share-hint]");
    if (hint) {
      hint.textContent = picked.length === 0
        ? "Just the post. Tap a reply to add it."
        : picked.length >= max
          ? size === "wide" ? "Wide fits one reply. Untick it to swap." : "That's the most that fits. Untick one to swap."
          : "Replies stay anonymous on the image too.";
    }
    sheet.querySelector(".hidn-share-sheet__preview")?.setAttribute("data-size", size);
  };

  const refresh = async (): Promise<void> => {
    paint();
    const token = ++renderToken;
    blob = null;
    goButtons.forEach((button) => { button.disabled = true; });
    const texts = [...picked].sort((a, b) => a - b).map((index) => options.replies[index]);
    try {
      const next = await options.render(size, texts);
      if (token !== renderToken || openSheet !== sheet) return;
      blob = next;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(next);
      preview.src = previewUrl;
      goButtons.forEach((button) => { button.disabled = busy; });
    } catch {
      if (token === renderToken) status.textContent = "The image couldn't be made. Try again.";
    }
  };

  const close = (): void => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    document.removeEventListener("keydown", onKey);
    closeShareSheet();
    opener?.focus();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && openSheet === sheet) close();
  };
  document.addEventListener("keydown", onKey);

  sheet.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-share-close]")) { close(); return; }
    const sizeButton = target.closest<HTMLButtonElement>("[data-share-size]");
    if (sizeButton) {
      size = sizeButton.dataset.shareSize as ShareCardSize;
      rememberSize(size);
      void refresh();
      return;
    }
    const replyButton = target.closest<HTMLButtonElement>("[data-share-reply]");
    if (replyButton) {
      const index = Number(replyButton.dataset.shareReply);
      if (picked.includes(index)) picked = picked.filter((value) => value !== index);
      else if (picked.length < SHARE_CARD_MAX_REPLIES[size]) picked = [...picked, index];
      else return;
      void refresh();
      return;
    }
    const go = target.closest<HTMLButtonElement>("[data-share-go]");
    if (go && blob && !busy) {
      busy = true;
      goButtons.forEach((button) => { button.disabled = true; });
      const action = go.dataset.shareGo === "share" ? "share" : "save";
      void Promise.resolve(options.confirm(blob, size, action)).finally(() => close());
    }
  });

  void refresh();
  sheet.querySelector<HTMLButtonElement>(`[data-share-go="${options.mode}"]`)?.focus();
}
