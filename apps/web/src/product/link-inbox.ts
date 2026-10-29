import { escapeHtml } from "@hidn/ui";
import * as QRCode from "qrcode";
import { renderShareCard } from "./share-card";
import { openShareSheet } from "./share-sheet";
import { createLinkKeyMaterial, openLinkMessage, openLinkPrivateKey, sealLinkMessage } from "./link-e2e";
import { containsLink, LINK_BLOCKED_ERROR } from "./link-rules";
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
// its hash and nothing at all about senders. Messages are end-to-end
// encrypted (link-e2e.ts): the sender's browser seals them to the link's
// public key and only the owner's browser can open them.

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
  return `<button class="hidn-link__btn hidn-link__btn--plain${options.primary ? " hidn-link__btn--primary" : ""}" type="${options.type ?? "button"}" data-link-action="${action}"${options.disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
}

/** The owner's inbox (a room page) speaks in sentence case, without brackets. */
function ownerButton(label: string, action: string, options: { primary?: boolean; disabled?: boolean; type?: "button" | "submit" } = {}): string {
  return `<button class="hidn-link__btn hidn-link__btn--plain${options.primary ? " hidn-link__btn--primary" : ""}" type="${options.type ?? "button"}" data-link-action="${action}"${options.disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
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
      color: { dark: "#010301", light: "#e8f2e9" },
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
  const ownLink = `<a class="hidn-link__btn hidn-link__btn--plain" href="/">Get your own link</a>`;
  if (state.status === "loading") {
    return `<div class="hidn-link hidn-link--send"><p class="hidn-link__status">Opening the link…</p></div>`;
  }
  if (state.status === "missing" || state.status === "error" || !state.link) {
    return `<div class="hidn-link hidn-link--send">
      <p class="hidn-link__eyebrow">hidn://to/${escapeHtml(slug)}</p>
      <h1 class="hidn-link__title">${state.status === "missing" ? "This link doesn't exist." : "We couldn't reach this link."}</h1>
      <p class="hidn-link__line">${state.status === "missing" ? "It may be mistyped, or its owner replaced it with a new one." : "Try again in a moment."}</p>
      <div class="hidn-link__actions">${ownLink}</div>
    </div>`;
  }

  const link = state.link;
  if (state.sent) {
    const tip = state.sent.tipCode && link.tipAddress ? tipPaymentUri(link.tipAddress, state.sent.tipCode) : "";
    return `<div class="hidn-link hidn-link--send">
      <p class="hidn-link__eyebrow"><span class="hidn-link__dot" aria-hidden="true"></span>Sent anonymously</p>
      <h1 class="hidn-link__title">It's in their inbox.</h1>
      <p class="hidn-link__line">They'll read it without ever knowing who said it. Nothing about you was kept.</p>
      ${tip ? `<section class="hidn-link__tip" aria-labelledby="hidn-link-tip-title">
        <h2 id="hidn-link-tip-title" class="hidn-link__tip-title">Now send your ZEC tip</h2>
        <p class="hidn-link__note">Pay any amount from a shielded wallet. The memo carries this code, so they can match the tip to your message.</p>
        <div class="hidn-link__tip-grid">
          <canvas class="hidn-link__qr" data-link-qr="${escapeHtml(tip)}" width="200" height="200" aria-label="QR code for the Zcash tip"></canvas>
          <div class="hidn-link__tip-side">
            <span class="hidn-link__code-label">Tip code</span>
            <code class="hidn-link__code">${escapeHtml(state.sent.tipCode)}</code>
            <a class="hidn-link__btn hidn-link__btn--plain hidn-link__btn--zec" href="${escapeHtml(tip)}">Open in wallet</a>
            ${button(state.copied ? "Copied" : "Copy payment request", "copy-tip")}
          </div>
        </div>
        <p class="hidn-link__note">Works with shielded Zcash wallets such as ZODL or Vizor. HIDN never holds the money and can't confirm the payment.</p>
      </section>` : ""}
      <div class="hidn-link__actions">
        ${button("Say something else", "send-again")}
        ${ownLink.replace("hidn-link__btn--plain", "hidn-link__btn--plain hidn-link__btn--primary")}
      </div>
    </div>`;
  }

  if (link.status === "closed") {
    return `<div class="hidn-link hidn-link--send">
      <p class="hidn-link__eyebrow">hidn://to/${escapeHtml(link.slug)}</p>
      <h1 class="hidn-link__title">This link is closed.</h1>
      <p class="hidn-link__line">Its owner isn't taking messages right now.</p>
      <div class="hidn-link__actions">${ownLink.replace("hidn-link__btn--plain", "hidn-link__btn--plain hidn-link__btn--primary")}</div>
    </div>`;
  }

  const prompt = link.prompt || DEFAULT_PROMPT;
  return `<form class="hidn-link hidn-link--send" data-link-send-form novalidate>
    <p class="hidn-link__eyebrow"><span class="hidn-link__dot" aria-hidden="true"></span>Someone shared their private link with you</p>
    <h1 class="hidn-link__title">Say it. No names.</h1>
    <figure class="hidn-link__ask">
      <figcaption>They asked</figcaption>
      <blockquote>${escapeHtml(prompt)}</blockquote>
    </figure>
    <label class="hidn-link__field">
      <span class="hidn-link__field-label">Your message</span>
      <textarea data-link-draft maxlength="${LINK_MESSAGE_MAX_LENGTH}" rows="6" placeholder="Type here. Nobody signs." spellcheck="true">${escapeHtml(state.draft)}</textarea>
      <span class="hidn-link__count" data-link-count>${state.draft.length} / ${LINK_MESSAGE_MAX_LENGTH}</span>
    </label>
    ${link.tipAddress ? `<label class="hidn-link__check">
      <input type="checkbox" data-link-attach-zec${state.attachZec ? " checked" : ""} />
      <span><b>Add a ZEC tip</b><em>You pay from your own wallet after sending.</em></span>
    </label>` : ""}
    ${state.error ? `<p class="hidn-link__error" role="alert">${escapeHtml(state.error)}</p>` : ""}
    <div class="hidn-link__actions">
      ${button(state.sending ? "Sending…" : "Send anonymously", "send", { primary: true, disabled: state.sending, type: "submit" })}
    </div>
    <ul class="hidn-link__promises">
      <li>No account, email or phone number.</li>
      <li>Your name is never attached.</li>
      <li>They only see the words.</li>
      ${link.e2ePublicKey ? `<li>Encrypted on your device. Only they can read it, not even HIDN.</li>` : ""}
    </ul>
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
  if (content.length > LINK_MESSAGE_MAX_LENGTH) {
    state.error = `Messages must be ${LINK_MESSAGE_MAX_LENGTH} characters or fewer.`;
    rerender();
    return;
  }
  // The server can't read sealed messages, so the no-links rule runs here.
  if (containsLink(content)) {
    state.error = LINK_BLOCKED_ERROR;
    rerender();
    return;
  }
  const tipCode = state.attachZec && state.link?.tipAddress ? createTipCode() : "";
  state.sending = true;
  state.error = "";
  rerender();
  try {
    const publicKey = state.link?.e2ePublicKey;
    const message = publicKey ? { sealed: await sealLinkMessage(publicKey, content) } : { content };
    await sendLinkMessage(state.slug, { ...message, ...(tipCode ? { tipCode } : {}) });
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
  /** The recovery secret, used only in this browser to wrap and unwrap the link's message key. */
  secret(): string;
}

/** The link's private message key, opened on this device for this visit only. */
let openedKey: { publicKey: string; key: CryptoKey } | null = null;
/** Messages that couldn't be decrypted on this device, by id. */
const unreadable = new Set<string>();

/** Gives the link its encryption key the first time, then decrypts sealed messages in place. */
async function decryptInbox(data: LinkInboxResponse, context: LinkOwnerContext, inboxKey: string): Promise<LinkInboxResponse> {
  if (!data.link) return data;
  let link = data.link;
  if (!link.e2ePublicKey || !link.e2eWrappedKey) {
    const material = await createLinkKeyMaterial(context.secret());
    try {
      link = (await updateMyLinkInbox(inboxKey, { e2ePublicKey: material.publicKey, e2eWrappedKey: material.wrappedKey })).link;
    } catch {
      // Another device may have just set it; read it back.
      link = (await fetchMyLinkInbox(inboxKey)).link ?? link;
    }
  }
  if (!link.e2ePublicKey || !link.e2eWrappedKey) return { ...data, link };
  if (!openedKey || openedKey.publicKey !== link.e2ePublicKey) {
    openedKey = { publicKey: link.e2ePublicKey, key: await openLinkPrivateKey(context.secret(), { publicKey: link.e2ePublicKey, wrappedKey: link.e2eWrappedKey }) };
  }
  const key = openedKey.key;
  const messages = await Promise.all(data.messages.map(async (message) => {
    if (!message.encrypted) return message;
    try {
      return { ...message, text: await openLinkMessage(key, link.e2ePublicKey!, message.text) };
    } catch {
      unreadable.add(message.id);
      return { ...message, text: "" };
    }
  }));
  return { ...data, link, messages };
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
  openedKey = null;
  unreadable.clear();
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
    const data = await decryptInbox(await fetchMyLinkInbox(key), context, key);
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

/** The refresh button says what it's doing, then what it found. */
function refreshLabel(): string {
  if (inbox.busy === "refresh" || inbox.status === "loading") return "Refreshing…";
  if (inbox.feedback === "refreshed:0") return "Up to date ✓";
  if (inbox.feedback.startsWith("refreshed:")) return `${inbox.feedback.slice(10)} new ✓`;
  return "Refresh";
}

function renderLinkCard(link: LinkInbox): string {
  const url = linkUrl(link.slug);
  const open = link.status === "open";
  return `<section class="hidn-link__card">
    <p class="hidn-link__label">Your link · ${open ? "open" : "closed"}</p>
    <code class="hidn-link__url">${escapeHtml(url)}</code>
    <div class="hidn-link__actions">
      ${ownerButton(inbox.feedback === "copied" ? "Copied" : "Copy link", "copy-link", { primary: true })}
      ${"share" in navigator ? ownerButton("Share", "share-link") : ""}
      <a class="hidn-link__btn hidn-link__btn--plain" href="/to/${escapeHtml(link.slug)}" target="_blank" rel="noopener">Preview ↗</a>
    </div>
    <form class="hidn-link__settings" data-link-settings-form novalidate>
      <label class="hidn-link__input">
        <span>What visitors see (optional)</span>
        <input type="text" data-link-prompt maxlength="${LINK_PROMPT_MAX_LENGTH}" value="${escapeHtml(inbox.promptDraft)}" placeholder="${DEFAULT_PROMPT}" autocomplete="off" />
      </label>
      <label class="hidn-link__input">
        <span>Your shielded address for ZEC tips (optional)</span>
        <input type="text" data-link-tip maxlength="500" value="${escapeHtml(inbox.tipDraft)}" placeholder="u1... leave empty for no tips" autocomplete="off" spellcheck="false" />
      </label>
      <p class="hidn-link__note">Tips go straight from the sender's wallet to yours. Each tipped message shows a code; the same code arrives in the payment memo.</p>
      <div class="hidn-link__actions">
        ${ownerButton(inbox.busy === "save" ? "Saving…" : "Save", "save", { type: "submit", disabled: Boolean(inbox.busy) })}
        ${ownerButton(open ? "Close link" : "Reopen link", open ? "close" : "reopen", { disabled: Boolean(inbox.busy) })}
        ${ownerButton("New link address · ZEC", "rotate-paid", { disabled: Boolean(inbox.busy) })}
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
      <div class="hidn-link__actions">${ownerButton("Close", "paid-close", { primary: true })}</div>
    </section>
  </div>`;
}

function renderMessages(data: LinkInboxResponse): string {
  const items = data.messages.map((message) => {
    const isNew = inbox.unreadIds.has(message.id);
    const status = inbox.shareStatus.get(message.id) ?? "";
    return `<article class="hidn-link__msg${isNew ? " hidn-link__msg--new" : ""}">
      <header><span>${isNew ? "● new" : "anonymous"}</span><time>${escapeHtml(formatWhen(message.createdAt))}</time></header>
      ${unreadable.has(message.id)
        ? `<p class="hidn-link__note">This message couldn't be decrypted on this device.</p>`
        : `<p>${escapeHtml(message.text)}</p>`}
      ${message.encrypted ? "" : `<p class="hidn-link__plain-note">Sent before messages were end-to-end encrypted.</p>`}
      ${message.tipCode ? `<p class="hidn-link__tipcode">ZEC tip · code ${escapeHtml(message.tipCode)} · check your wallet memos</p>` : ""}
      <div class="hidn-link__msg-bar" role="group" aria-label="Message actions">
        <button class="hidn-link__seg" type="button" data-link-action="share-message" data-message-id="${escapeHtml(message.id)}"><span aria-hidden="true">↗</span> Share</button>
        <button class="hidn-link__seg" type="button" data-link-action="save-message" data-message-id="${escapeHtml(message.id)}"><span aria-hidden="true">↓</span> Save</button>
        <button class="hidn-link__seg hidn-link__seg--danger" type="button" data-link-action="delete" data-message-id="${escapeHtml(message.id)}"><span aria-hidden="true">✕</span> Delete</button>
      </div>
      ${status ? `<p class="hidn-link__msg-status" role="status">&gt; ${escapeHtml(status)}</p>` : ""}
    </article>`;
  }).join("");
  return `<section class="hidn-link__inbox">
    <header class="hidn-link__inbox-head">
      <p class="hidn-link__label">${data.messages.length} ${data.messages.length === 1 ? "message" : "messages"}</p>
      ${ownerButton(refreshLabel(), "refresh", { disabled: inbox.busy === "refresh" })}
    </header>
    ${items || `<p class="hidn-link__empty">&gt; nothing yet. share your link and wait in the dark.<span class="hidn-link__caret">▌</span></p>
      <div class="hidn-link__actions">${ownerButton("Get my link", "view-link", { primary: true })}</div>`}
  </section>`;
}

export function renderLinkInboxBody(): string {
  const head = `<p class="hidn-link__code-line">hidn://inbox</p>
    <h1 class="hidn-link__title" data-text="What they can't say to your face.">What they can't say to your face.</h1>
    <p class="hidn-link__line">Share your link anywhere. Anyone can leave you a message without a name. You read them here.</p>
    <p class="hidn-link__e2e"><span aria-hidden="true">e2e</span> End-to-end encrypted. Only you can read these messages, not even HIDN.</p>`;
  if (inbox.status === "idle" || (inbox.status === "loading" && !inbox.data)) {
    return `<div class="hidn-link">${head}<p class="hidn-link__log">&gt; opening inbox...<span class="hidn-link__caret">▌</span></p></div>`;
  }
  if (inbox.status === "error" && !inbox.data) {
    return `<div class="hidn-link">${head}
      <p class="hidn-link__error" role="alert">&gt; ${escapeHtml(inbox.error)}</p>
      <div class="hidn-link__actions">${ownerButton("Try again", "refresh")}</div>
    </div>`;
  }

  const data = inbox.data!;
  const error = inbox.error ? `<p class="hidn-link__error" role="alert">&gt; ${escapeHtml(inbox.error)}</p>` : "";
  const status = inbox.feedback && inbox.feedback !== "copied" && !inbox.feedback.startsWith("refreshed:") ? `<p class="hidn-link__ok" role="status">${escapeHtml(inbox.feedback)}</p>` : "";
  if (!data.link) {
    return `<div class="hidn-link">${head}
      <section class="hidn-link__card">
        <p class="hidn-link__label">Your link · not created yet</p>
        <p class="hidn-link__note">One link per member. It never shows your alias or anything you post in the room. Opening it proves you are a member without saying which one.</p>
        ${inbox.busy === "create" ? `<p class="hidn-link__log">&gt; proving membership... forging link<span class="hidn-link__caret">▌</span></p>` : ""}
        ${error}
        <div class="hidn-link__actions">${ownerButton(inbox.busy === "create" ? "Creating…" : "Create my link", "create", { primary: true, disabled: Boolean(inbox.busy) })}</div>
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
    <p class="hidn-link__code-line">hidn://inbox</p>
    ${data.link.e2ePublicKey ? `<p class="hidn-link__e2e"><span aria-hidden="true">e2e</span> End-to-end encrypted. Only you can read these messages, not even HIDN.</p>` : ""}
    <div class="hidn-link__tabs" role="tablist" aria-label="Inbox">
      ${tab("messages", `Messages${unread ? ` <b>${unread} new</b>` : count ? ` (${count})` : ""}`)}
      ${tab("link", "My link")}
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
    const before = new Set(inbox.data?.messages.map((message) => message.id) ?? []);
    inbox.busy = "refresh";
    inbox.feedback = "";
    rerender();
    await loadInbox(context);
    inbox.busy = "";
    if (inbox.status === "ready") {
      const added = inbox.data?.messages.filter((message) => !before.has(message.id)).length ?? 0;
      inbox.feedback = `refreshed:${added}`;
      window.setTimeout(() => {
        if (inbox.feedback.startsWith("refreshed:")) {
          inbox.feedback = "";
          rerender();
        }
      }, 2200);
    }
    rerender();
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
    shareMessageImage(messageId, action === "share-message" ? "share" : "save");
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
      // A new link gets its encryption key straight away, before anyone can write to it.
      inbox.data = await decryptInbox({ link: created, messages: inbox.data?.messages ?? [], unreadCount: 0 }, context, key);
      inbox.promptDraft = inbox.data.link?.prompt ?? created.prompt;
      inbox.tipDraft = inbox.data.link?.tipAddress ?? created.tipAddress ?? "";
      inbox.feedback = "Link created. Copy it and share it anywhere.";
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
/** Share or save a message as an image: pick Post, Story or Wide in the share sheet first. */
function shareMessageImage(messageId: string, mode: "share" | "save"): void {
  const message = inbox.data?.messages.find((candidate) => candidate.id === messageId);
  if (!message) return;
  const setStatus = (text: string): void => {
    if (text) inbox.shareStatus.set(messageId, text); else inbox.shareStatus.delete(messageId);
    rerender();
  };
  const filename = `hidn-message-${message.id.replace(/^MSG-/, "").slice(0, 8).toLowerCase()}`;
  openShareSheet({
    mode,
    replies: [],
    preselect: [],
    render: (size, _replies, mood) => renderShareCard({
      text: message.text,
      replies: [],
      room: "My inbox",
      reference: message.id,
      mark: "// sent to me",
      theme: "signal",
      size,
      mood,
      time: message.createdAt,
    }),
    confirm: async (blob, size, action) => {
      const file = new File([blob], `${filename}${size === "post" ? "" : `-${size}`}.png`, { type: "image/png" });
      if (action === "share" && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "HIDN", text: "said to me with no name. hidn." });
          setStatus("SHARED");
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
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus(action === "save" ? "IMAGE SAVED" : "IMAGE SAVED. POST IT FROM YOUR PHOTOS.");
    },
  });
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
