import { escapeHtml } from "@hidn/ui";
import * as QRCode from "qrcode";
import { renderShareCard } from "./share-card";
import {
  createMyLinkInbox,
  deleteMyLinkMessage,
  fetchMyLinkInbox,
  fetchPublicLink,
  markMyLinkMessagesRead,
  sendLinkMessage,
  updateMyLinkInbox,
  type AnonymousProofEnvelope,
  type LinkInbox,
  type LinkInboxResponse,
} from "./room-api";

// Personal confession links: a member shares /to/<slug>, anyone holding it
// leaves an anonymous message, and it lands in the member's inbox. The inbox
// is opened by a key derived from the recovery secret; the server keeps only
// its hash and nothing at all about senders.

const LINK_MESSAGE_MAX_LENGTH = 500;
const LINK_PROMPT_MAX_LENGTH = 120;
const TIP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DEFAULT_PROMPT = "say what you never said to them.";

function rerender(): void {
  window.dispatchEvent(new CustomEvent("hidn:rerender"));
}

function linkUrl(slug: string): string {
  return `${window.location.origin}/to/${slug}`;
}

function button(label: string, action: string, options: { primary?: boolean; disabled?: boolean; type?: "button" | "submit" } = {}): string {
  return `<button class="hidn-link__btn${options.primary ? " hidn-link__btn--primary" : ""}" type="${options.type ?? "button"}" data-link-action="${action}"${options.disabled ? " disabled" : ""}>[ ${escapeHtml(label)} ]</button>`;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).toUpperCase();
}

function createTipCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => TIP_CODE_ALPHABET[byte % TIP_CODE_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** A ZIP-321 payment request whose private memo carries the tip code, so the
 * owner can match the payment in their wallet to the message. */
function tipPaymentUri(address: string, tipCode: string): string {
  const memo = btoa(`HIDN TIP ${tipCode}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `zcash:${address}?memo=${memo}`;
}

function hydrateQr(root: ParentNode): void {
  root.querySelectorAll<HTMLCanvasElement>("[data-link-qr]").forEach((canvas) => {
    const uri = canvas.dataset.linkQr;
    if (!uri) return;
    void QRCode.toCanvas(canvas, uri, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#010301", light: "#7dff9a" },
    }).catch(() => undefined);
  });
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

// MARK: The public link page, /to/<slug>

interface SendState {
  slug: string;
  status: "loading" | "ready" | "missing" | "error";
  link: LinkInbox | null;
  draft: string;
  attachZec: boolean;
  sending: boolean;
  error: string;
  sent: { tipCode: string } | null;
  copied: boolean;
}

let send: SendState | null = null;

export function linkSlugFromPath(path: string): string | null {
  const match = path.match(/^\/to\/([a-z2-9]{8})$/);
  return match ? match[1] : null;
}

function sendState(slug: string): SendState {
  if (!send || send.slug !== slug) {
    send = { slug, status: "loading", link: null, draft: "", attachZec: false, sending: false, error: "", sent: null, copied: false };
    void fetchPublicLink(slug)
      .then(({ link }) => {
        if (send?.slug !== slug) return;
        send.link = link;
        send.status = "ready";
      })
      .catch((error: unknown) => {
        if (send?.slug !== slug) return;
        const message = error instanceof Error ? error.message : "";
        send.status = /does not exist|replaced/i.test(message) ? "missing" : "error";
        send.error = message;
      })
      .finally(rerender);
  }
  return send;
}

export function renderLinkSendBody(slug: string): string {
  const state = sendState(slug);
  if (state.status === "loading") {
    return `<div class="hidn-link"><p class="hidn-link__log">&gt; resolving room ${escapeHtml(slug)}...<span class="hidn-link__caret">▌</span></p></div>`;
  }
  if (state.status === "missing" || state.status === "error" || !state.link) {
    return `<div class="hidn-link">
      <p class="hidn-link__log"><b>[FAIL]</b> ${state.status === "missing" ? "ROOM NOT FOUND" : "SIGNAL LOST"}</p>
      <h1 class="hidn-link__title" data-text="NO ROOM HERE.">NO ROOM HERE.</h1>
      <p class="hidn-link__line">&gt; ${state.status === "missing" ? "This link does not exist, or its owner replaced it with a new one." : "The room could not be reached. Try again in a moment."}</p>
      <div class="hidn-link__actions"><a class="hidn-link__btn" href="/">[ GET YOUR OWN LINK → ]</a></div>
    </div>`;
  }

  const link = state.link;
  if (state.sent) {
    const tip = state.sent.tipCode && link.tipAddress ? tipPaymentUri(link.tipAddress, state.sent.tipCode) : "";
    return `<div class="hidn-link">
      <p class="hidn-link__log"><b>[ OK ]</b> TRANSMITTED</p>
      <p class="hidn-link__log"><b>[ OK ]</b> SENDER: <span class="hidn-link__redact" aria-label="withheld"></span> · NOTHING KEPT</p>
      <h1 class="hidn-link__title" data-text="IT'S IN THE ROOM.">IT'S IN THE ROOM.</h1>
      <p class="hidn-link__line">&gt; They will read it without ever knowing who said it.</p>
      ${tip ? `<section class="hidn-link__tip">
        <p class="hidn-link__label">&gt; NOW SEND THE ZEC / SHIELDED MAINNET</p>
        <div class="hidn-link__tip-grid">
          <canvas class="hidn-link__qr" data-link-qr="${escapeHtml(tip)}" width="200" height="200" aria-label="QR code for the Zcash tip"></canvas>
          <div>
            <p class="hidn-link__note">Pay any amount from a shielded wallet. The memo carries your tip code, so they can match it to your message:</p>
            <code class="hidn-link__code">${escapeHtml(state.sent.tipCode)}</code>
            <div class="hidn-link__actions">
              <a class="hidn-link__btn hidn-link__btn--primary" href="${escapeHtml(tip)}">[ OPEN IN WALLET ↗ ]</a>
              ${button(state.copied ? "COPIED" : "COPY REQUEST", "copy-tip")}
            </div>
            <p class="hidn-link__note">Scan with a shielded Zcash wallet such as ZODL or Vizor. HIDN never holds the funds and cannot confirm the payment.</p>
          </div>
        </div>
      </section>` : ""}
      <div class="hidn-link__actions">
        ${button("SAY SOMETHING ELSE", "send-again")}
        <a class="hidn-link__btn hidn-link__btn--primary" href="/">[ GET YOUR OWN LINK → ]</a>
      </div>
    </div>`;
  }

  if (link.status === "closed") {
    return `<div class="hidn-link">
      <p class="hidn-link__log"><b>[LOCK]</b> ROOM CLOSED BY ITS OWNER</p>
      <h1 class="hidn-link__title" data-text="THE DOOR IS SHUT.">THE DOOR IS SHUT.</h1>
      <p class="hidn-link__line">&gt; This room is not taking messages right now.</p>
      <div class="hidn-link__actions"><a class="hidn-link__btn hidn-link__btn--primary" href="/">[ GET YOUR OWN LINK → ]</a></div>
    </div>`;
  }

  const prompt = link.prompt || DEFAULT_PROMPT;
  return `<form class="hidn-link" data-link-send-form novalidate>
    <p class="hidn-link__log">&gt; open room --to ${escapeHtml(link.slug)} --anonymous</p>
    <p class="hidn-link__log">&gt; owner: <span class="hidn-link__redact" aria-label="withheld"></span> · you: <span class="hidn-link__redact" aria-label="withheld"></span></p>
    <p class="hidn-link__code-line">/// SOMEONE OPENED A ROOM FOR YOU</p>
    <h1 class="hidn-link__title" data-text="SAY IT. NO NAMES.">SAY IT. NO NAMES.</h1>
    <p class="hidn-link__prompt">&gt; ${escapeHtml(prompt)}</p>
    <label class="hidn-link__field">
      <span class="hidn-term__sr">Your anonymous message</span>
      <textarea data-link-draft maxlength="${LINK_MESSAGE_MAX_LENGTH}" rows="6" placeholder="type here. nobody signs." spellcheck="true">${escapeHtml(state.draft)}</textarea>
      <span class="hidn-link__count" data-link-count>${state.draft.length} / ${LINK_MESSAGE_MAX_LENGTH}</span>
    </label>
    ${link.tipAddress ? `<label class="hidn-link__check">
      <input type="checkbox" data-link-attach-zec${state.attachZec ? " checked" : ""} />
      <span>+ ATTACH ZEC <em>you pay in your own wallet after sending</em></span>
    </label>` : ""}
    ${state.error ? `<p class="hidn-link__error" role="alert">&gt; ${escapeHtml(state.error)}</p>` : ""}
    <div class="hidn-link__actions">
      ${button(state.sending ? "TRANSMITTING..." : "TRANSMIT", "send", { primary: true, disabled: state.sending, type: "submit" })}
    </div>
    <p class="hidn-link__note">&gt; No account. No name. No trace kept of who sent it. The owner only sees the words.</p>
  </form>`;
}

export function bindLinkSendPage(root: ParentNode): void {
  if (!send) return;
  const state = send;
  hydrateQr(root);
  const draft = root.querySelector<HTMLTextAreaElement>("[data-link-draft]");
  const count = root.querySelector<HTMLElement>("[data-link-count]");
  draft?.addEventListener("input", () => {
    state.draft = draft.value;
    if (count) count.textContent = `${draft.value.length} / ${LINK_MESSAGE_MAX_LENGTH}`;
  });
  root.querySelector<HTMLInputElement>("[data-link-attach-zec]")?.addEventListener("change", (event) => {
    state.attachZec = (event.target as HTMLInputElement).checked;
  });
  root.querySelector<HTMLFormElement>("[data-link-send-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitLinkMessage(state);
  });
  root.querySelector<HTMLButtonElement>('[data-link-action="send-again"]')?.addEventListener("click", () => {
    state.sent = null;
    state.draft = "";
    state.attachZec = false;
    state.copied = false;
    rerender();
  });
  root.querySelector<HTMLButtonElement>('[data-link-action="copy-tip"]')?.addEventListener("click", async () => {
    if (!state.sent?.tipCode || !state.link?.tipAddress) return;
    state.copied = await copyText(tipPaymentUri(state.link.tipAddress, state.sent.tipCode));
    rerender();
  });
}

async function submitLinkMessage(state: SendState): Promise<void> {
  const content = state.draft.trim();
  if (!content) {
    state.error = "Write something before sending.";
    rerender();
    return;
  }
  const tipCode = state.attachZec && state.link?.tipAddress ? createTipCode() : "";
  state.sending = true;
  state.error = "";
  rerender();
  try {
    await sendLinkMessage(state.slug, { content, ...(tipCode ? { tipCode } : {}) });
    state.sent = { tipCode };
    state.draft = "";
  } catch (error) {
    state.error = error instanceof Error ? error.message : "The message could not be sent.";
  } finally {
    state.sending = false;
    rerender();
  }
}

// MARK: The owner's inbox, /room/inbox

export interface LinkOwnerContext {
  /** The inbox key derived from this member's recovery secret. */
  inboxKey(): Promise<string>;
  /** A membership proof bound to `content`, for opening the link. */
  prove(content: string): Promise<{ scope: string; proof: AnonymousProofEnvelope }>;
}

interface InboxState {
  status: "idle" | "loading" | "ready" | "error";
  data: LinkInboxResponse | null;
  unreadIds: Set<string>;
  busy: string;
  error: string;
  feedback: string;
  promptDraft: string;
  tipDraft: string;
  view: "messages" | "link";
  shareStatus: Map<string, string>;
  paidPromptOpen: boolean;
}

const inbox: InboxState = {
  status: "idle",
  data: null,
  unreadIds: new Set(),
  busy: "",
  error: "",
  feedback: "",
  promptDraft: "",
  tipDraft: "",
  view: "messages",
  shareStatus: new Map(),
  paidPromptOpen: false,
};

let ownerContext: LinkOwnerContext | null = null;

/** Forget the inbox when the member leaves, so another key never sees it. */
export function resetLinkInbox(): void {
  inbox.view = "messages";
  inbox.shareStatus = new Map();
  backgroundUnread = 0;
  backgroundCheckedAt = 0;
  inbox.status = "idle";
  inbox.data = null;
  inbox.unreadIds = new Set();
  inbox.busy = "";
  inbox.error = "";
  inbox.feedback = "";
}

// The unread count for the bottom bar, checked at most once a minute.
let backgroundUnread = 0;
let backgroundCheckedAt = 0;

export function linkInboxUnreadCount(): number {
  return backgroundUnread;
}

export function refreshLinkUnread(inboxKey: () => Promise<string>): void {
  if (Date.now() - backgroundCheckedAt < 60_000) return;
  backgroundCheckedAt = Date.now();
  void inboxKey()
    .then((key) => fetchMyLinkInbox(key))
    .then((data) => {
      if (data.unreadCount !== backgroundUnread) {
        backgroundUnread = data.unreadCount;
        rerender();
      }
    })
    .catch(() => undefined);
}

function applyInbox(data: LinkInboxResponse): void {
  inbox.data = data;
  inbox.promptDraft = data.link?.prompt ?? "";
  inbox.tipDraft = data.link?.tipAddress ?? "";
  for (const message of data.messages) {
    if (!message.readAt) inbox.unreadIds.add(message.id);
  }
}

async function loadInbox(context: LinkOwnerContext): Promise<void> {
  inbox.status = inbox.data ? "ready" : "loading";
  inbox.error = "";
  try {
    const key = await context.inboxKey();
    const data = await fetchMyLinkInbox(key);
    applyInbox(data);
    inbox.status = "ready";
    // Opening the inbox reads everything in it.
    backgroundUnread = 0;
    if (data.unreadCount > 0) {
      // Seen now; the highlight stays for this visit only.
      void markMyLinkMessagesRead(key).then(() => {
        if (inbox.data) inbox.data = { ...inbox.data, unreadCount: 0 };
      }).catch(() => undefined);
    }
  } catch (error) {
    inbox.status = "error";
    inbox.error = error instanceof Error ? error.message : "The inbox could not be opened.";
  }
  rerender();
}

function renderLinkCard(link: LinkInbox): string {
  const url = linkUrl(link.slug);
  const open = link.status === "open";
  return `<section class="hidn-link__card">
    <p class="hidn-link__label">&gt; YOUR LINK / ${open ? "OPEN" : "CLOSED"}</p>
    <code class="hidn-link__url">${escapeHtml(url)}</code>
    <div class="hidn-link__actions">
      ${button(inbox.feedback === "copied" ? "COPIED" : "COPY LINK", "copy-link", { primary: true })}
      ${"share" in navigator ? button("SHARE", "share-link") : ""}
      <a class="hidn-link__btn" href="/to/${escapeHtml(link.slug)}" target="_blank" rel="noopener">[ PREVIEW ↗ ]</a>
    </div>
    <form class="hidn-link__settings" data-link-settings-form novalidate>
      <label class="hidn-link__input">
        <span>&gt; PROMPT / WHAT VISITORS SEE (OPTIONAL)</span>
        <input type="text" data-link-prompt maxlength="${LINK_PROMPT_MAX_LENGTH}" value="${escapeHtml(inbox.promptDraft)}" placeholder="${DEFAULT_PROMPT}" autocomplete="off" />
      </label>
      <label class="hidn-link__input">
        <span>&gt; ZEC TIPS / SHIELDED ADDRESS (OPTIONAL)</span>
        <input type="text" data-link-tip maxlength="500" value="${escapeHtml(inbox.tipDraft)}" placeholder="u1... leave empty for no tips" autocomplete="off" spellcheck="false" />
      </label>
      <p class="hidn-link__note">Tips go straight from the sender's wallet to yours. Each tipped message shows a code; the same code arrives in the payment memo.</p>
      <div class="hidn-link__actions">
        ${button(inbox.busy === "save" ? "SAVING..." : "SAVE", "save", { type: "submit", disabled: Boolean(inbox.busy) })}
        ${button(open ? "CLOSE LINK" : "REOPEN LINK", open ? "close" : "reopen", { disabled: Boolean(inbox.busy) })}
        ${button("NEW LINK ADDRESS · ZEC", "rotate-paid", { disabled: Boolean(inbox.busy) })}
      </div>
    </form>
  </section>`;
}

/** A new link address is a paid feature. Until HIDN can confirm ZEC
 * payments, the prompt explains it and takes no money. */
function renderPaidAddressPrompt(): string {
  if (!inbox.paidPromptOpen) return "";
  return `<div class="hidn-link__paywall" role="dialog" aria-modal="true" aria-labelledby="hidn-paywall-title">
    <button class="hidn-link__paywall-backdrop" type="button" data-link-action="paid-close" aria-label="Close"></button>
    <section class="hidn-link__paywall-panel">
      <p class="hidn-link__log">&gt; new-address --pay zec --shielded</p>
      <p class="hidn-link__log"><b>[LOCK]</b> PAID FEATURE</p>
      <h2 id="hidn-paywall-title" class="hidn-link__title hidn-link__title--sm" data-text="A NEW ADDRESS.">A NEW ADDRESS.</h2>
      <p class="hidn-link__line">&gt; Swap your link for a fresh one. The old link dies at once, for when it has gone further than you wanted. Your messages stay.</p>
      <p class="hidn-link__note">Paid privately with ZEC from a shielded wallet such as ZODL or Vizor. Nothing about the payment is linked to you.</p>
      <div class="hidn-link__paywall-status">
        <p class="hidn-link__log"><b>[WAIT]</b> ZEC PAYMENT MODULE<span class="hidn-soon__dots" aria-hidden="true"></span></p>
        <div class="hidn-soon__bar" role="img" aria-label="Payments are still being built"><i></i></div>
        <p class="hidn-soon__title" data-text="COMING SOON">COMING SOON</p>
        <p class="hidn-link__note">HIDN is finishing the part that confirms payments. Until then nothing can be paid here and nothing is charged.</p>
      </div>
      <div class="hidn-link__actions">${button("CLOSE", "paid-close", { primary: true })}</div>
    </section>
  </div>`;
}

function renderMessages(data: LinkInboxResponse): string {
  const items = data.messages.map((message) => {
    const isNew = inbox.unreadIds.has(message.id);
    const status = inbox.shareStatus.get(message.id) ?? "";
    return `<article class="hidn-link__msg${isNew ? " hidn-link__msg--new" : ""}">
      <header><span>${isNew ? "● NEW" : "ANONYMOUS"}</span><time>${escapeHtml(formatWhen(message.createdAt))}</time></header>
      <p>${escapeHtml(message.text)}</p>
      ${message.tipCode ? `<p class="hidn-link__tipcode">ZEC TIP · CODE ${escapeHtml(message.tipCode)} · CHECK YOUR WALLET MEMOS</p>` : ""}
      <div class="hidn-link__msg-bar" role="group" aria-label="Message actions">
        <button class="hidn-link__seg" type="button" data-link-action="share-message" data-message-id="${escapeHtml(message.id)}"><span aria-hidden="true">↗</span> SHARE</button>
        <button class="hidn-link__seg" type="button" data-link-action="save-message" data-message-id="${escapeHtml(message.id)}"><span aria-hidden="true">↓</span> SAVE</button>
        <button class="hidn-link__seg hidn-link__seg--danger" type="button" data-link-action="delete" data-message-id="${escapeHtml(message.id)}"><span aria-hidden="true">✕</span> DELETE</button>
      </div>
      ${status ? `<p class="hidn-link__msg-status" role="status">&gt; ${escapeHtml(status)}</p>` : ""}
    </article>`;
  }).join("");
  return `<section class="hidn-link__inbox">
    <header class="hidn-link__inbox-head">
      <p class="hidn-link__label">&gt; ${data.messages.length} ${data.messages.length === 1 ? "MESSAGE" : "MESSAGES"}</p>
      ${button(inbox.status === "loading" ? "READING..." : "REFRESH", "refresh")}
    </header>
    ${items || `<p class="hidn-link__empty">&gt; nothing yet. share your link and wait in the dark.<span class="hidn-link__caret">▌</span></p>
      <div class="hidn-link__actions">${button("GET MY LINK", "view-link", { primary: true })}</div>`}
  </section>`;
}

export function renderLinkInboxBody(): string {
  const head = `<p class="hidn-link__code-line">/// INBOX</p>
    <h1 class="hidn-link__title" data-text="WHAT THEY CAN'T SAY TO YOUR FACE.">WHAT THEY CAN'T SAY TO YOUR FACE.</h1>
    <p class="hidn-link__line">&gt; Share your link anywhere. Anyone can leave you a message without a name. You read them here.</p>`;
  if (inbox.status === "idle" || (inbox.status === "loading" && !inbox.data)) {
    return `<div class="hidn-link">${head}<p class="hidn-link__log">&gt; opening inbox...<span class="hidn-link__caret">▌</span></p></div>`;
  }
  if (inbox.status === "error" && !inbox.data) {
    return `<div class="hidn-link">${head}
      <p class="hidn-link__error" role="alert">&gt; ${escapeHtml(inbox.error)}</p>
      <div class="hidn-link__actions">${button("TRY AGAIN", "refresh")}</div>
    </div>`;
  }

  const data = inbox.data!;
  const error = inbox.error ? `<p class="hidn-link__error" role="alert">&gt; ${escapeHtml(inbox.error)}</p>` : "";
  const status = inbox.feedback && inbox.feedback !== "copied" ? `<p class="hidn-link__ok" role="status">&gt; ${escapeHtml(inbox.feedback)}</p>` : "";
  if (!data.link) {
    return `<div class="hidn-link">${head}
      <section class="hidn-link__card">
        <p class="hidn-link__label">&gt; YOUR LINK / NOT CREATED</p>
        <p class="hidn-link__note">One link per member. It never shows your alias or anything you post in the room. Opening it proves you are a member without saying which one.</p>
        ${inbox.busy === "create" ? `<p class="hidn-link__log">&gt; proving membership... forging link<span class="hidn-link__caret">▌</span></p>` : ""}
        ${error}
        <div class="hidn-link__actions">${button(inbox.busy === "create" ? "FORGING..." : "CREATE MY LINK", "create", { primary: true, disabled: Boolean(inbox.busy) })}</div>
      </section>
    </div>`;
  }

  // Two views: the messages people come back for, and the link with its
  // settings, so the page never shows everything at once.
  const count = data.messages.length;
  const unread = inbox.unreadIds.size;
  const tab = (view: "messages" | "link", label: string): string =>
    `<button class="hidn-link__tab${inbox.view === view ? " hidn-link__tab--active" : ""}" type="button" role="tab" aria-selected="${inbox.view === view}" data-link-action="view-${view === "messages" ? "messages" : "link"}">${label}</button>`;
  return `<div class="hidn-link">
    <p class="hidn-link__code-line">/// INBOX</p>
    <div class="hidn-link__tabs" role="tablist" aria-label="Inbox">
      ${tab("messages", `MESSAGES${unread ? ` <b>${unread} NEW</b>` : count ? ` (${count})` : ""}`)}
      ${tab("link", "MY LINK")}
    </div>
    ${error}${status}
    ${inbox.view === "messages" ? renderMessages(data) : renderLinkCard(data.link)}
    ${renderPaidAddressPrompt()}
  </div>`;
}

export function bindLinkInbox(root: ParentNode, context: LinkOwnerContext): void {
  if (!root.querySelector(".hidn-link")) return;
  ownerContext = context;
  // Load on first visit, and again when new messages have arrived since.
  if (inbox.status === "idle" || (inbox.status === "ready" && backgroundUnread > 0)) {
    void loadInbox(context);
  }

  root.querySelector<HTMLInputElement>("[data-link-prompt]")?.addEventListener("input", (event) => {
    inbox.promptDraft = (event.target as HTMLInputElement).value;
  });
  root.querySelector<HTMLInputElement>("[data-link-tip]")?.addEventListener("input", (event) => {
    inbox.tipDraft = (event.target as HTMLInputElement).value;
  });
  root.querySelector<HTMLFormElement>("[data-link-settings-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void runInboxAction("save");
  });
  root.querySelectorAll<HTMLButtonElement>("[data-link-action]").forEach((element) => {
    const action = element.dataset.linkAction ?? "";
    if (action === "save") return;
    element.addEventListener("click", () => {
      void runInboxAction(action, element.dataset.messageId ?? "");
    });
  });
}

async function runInboxAction(action: string, messageId = ""): Promise<void> {
  const context = ownerContext;
  if (!context || inbox.busy) return;
  const link = inbox.data?.link;

  if (action === "refresh") {
    await loadInbox(context);
    return;
  }
  if (action === "view-messages" || action === "view-link") {
    inbox.view = action === "view-link" ? "link" : "messages";
    inbox.feedback = "";
    inbox.paidPromptOpen = false;
    rerender();
    return;
  }
  if ((action === "share-message" || action === "save-message") && messageId) {
    await shareMessageImage(messageId, action === "share-message" ? "share" : "save");
    return;
  }
  if (action === "copy-link" && link) {
    inbox.feedback = (await copyText(linkUrl(link.slug))) ? "copied" : "";
    rerender();
    window.setTimeout(() => {
      if (inbox.feedback === "copied") {
        inbox.feedback = "";
        rerender();
      }
    }, 1600);
    return;
  }
  if (action === "share-link" && link) {
    void navigator.share?.({ title: "HIDN", text: "say it. no names.", url: linkUrl(link.slug) }).catch(() => undefined);
    return;
  }
  if (action === "delete" && !window.confirm("Delete this message? It cannot be undone.")) {
    return;
  }
  if (action === "rotate-paid" || action === "paid-close") {
    inbox.paidPromptOpen = action === "rotate-paid";
    rerender();
    return;
  }
  if (action === "rotate" && !window.confirm("Replace your link? The old link stops working at once. Your messages stay.")) {
    return;
  }

  inbox.busy = action;
  inbox.error = "";
  inbox.feedback = "";
  rerender();
  try {
    const key = await context.inboxKey();
    if (action === "create") {
      // The proof is bound to the hash of the inbox key, which is all the
      // server ever stores for the owner.
      const keyHash = await sha256Hex(key);
      const { scope, proof } = await context.prove(keyHash);
      const { link: created } = await createMyLinkInbox(key, { proof, scope });
      inbox.data = { link: created, messages: inbox.data?.messages ?? [], unreadCount: 0 };
      inbox.promptDraft = created.prompt;
      inbox.tipDraft = created.tipAddress ?? "";
      inbox.feedback = "LINK CREATED. COPY IT AND SHARE IT ANYWHERE.";
      inbox.view = "link";
    } else if (action === "save" || action === "close" || action === "reopen" || action === "rotate") {
      const tip = inbox.tipDraft.trim().toLowerCase();
      if (action === "save" && tip && !/^(?:u1|zs1)[0-9a-z]{18,}$/.test(tip)) {
        throw new Error("Use a shielded Zcash mainnet address beginning with u1 or zs1.");
      }
      const { link: updated } = await updateMyLinkInbox(key, action === "save"
        ? { prompt: inbox.promptDraft, tipAddress: tip }
        : action === "rotate"
          ? { rotate: true }
          : { status: action === "close" ? "closed" : "open" });
      if (inbox.data) inbox.data = { ...inbox.data, link: updated };
      inbox.feedback = action === "save"
        ? "SAVED."
        : action === "rotate"
          ? "NEW ADDRESS LIVE. THE OLD LINK IS DEAD."
          : action === "close"
            ? "LINK CLOSED. NOBODY CAN WRITE TO YOU UNTIL YOU REOPEN IT."
            : "LINK OPEN AGAIN.";
    } else if (action === "delete" && messageId) {
      await deleteMyLinkMessage(key, messageId);
      if (inbox.data) inbox.data = { ...inbox.data, messages: inbox.data.messages.filter((message) => message.id !== messageId) };
    }
  } catch (error) {
    inbox.error = error instanceof Error ? error.message : "That did not work. Try again.";
  } finally {
    inbox.busy = "";
    rerender();
  }
}

/** The message as the room's share card: the words only, no name and no
 * link, so sharing it never points back to the owner or the sender. */
async function shareMessageImage(messageId: string, mode: "share" | "save"): Promise<void> {
  const message = inbox.data?.messages.find((candidate) => candidate.id === messageId);
  if (!message) return;
  const setStatus = (text: string): void => {
    if (text) inbox.shareStatus.set(messageId, text); else inbox.shareStatus.delete(messageId);
    rerender();
  };
  setStatus("RENDERING IMAGE...");
  try {
    const blob = await renderShareCard({
      text: message.text,
      replies: [],
      room: "MY INBOX",
      reference: message.id,
      mark: "// SENT TO ME, NO NAME",
      theme: "signal",
    });
    const filename = `hidn-message-${message.id.replace(/^MSG-/, "").slice(0, 8).toLowerCase()}.png`;
    const file = new File([blob], filename, { type: "image/png" });
    if (mode === "share" && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "HIDN", text: "said to me with no name. hidn." });
        setStatus("");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus("");
          return;
        }
      }
    }
    // Saving, or sharing where the browser cannot share files: download it.
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setStatus(mode === "save" ? "IMAGE SAVED" : "IMAGE SAVED. POST IT FROM YOUR PHOTOS.");
  } catch {
    setStatus("THE IMAGE COULD NOT BE MADE. TRY AGAIN.");
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
