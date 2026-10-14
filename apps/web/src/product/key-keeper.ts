import { escapeHtml } from "@hidn/ui";

// The recovery key is a member's whole account: there is no email to reset.
// This module helps people keep it the way they keep any password: in the
// browser's password manager, as a downloaded file, or copied somewhere
// safe. Until they have done one of those, HIDN keeps reminding them.

/** What the password manager shows next to the saved key. */
export const KEY_CREDENTIAL_NAME = "HIDN anonymous key";
const SAVED_STORAGE = "hidn:key-saved";

/** A short, one-way tag for the key, so this device can remember it was
 * saved without storing the key or the member's commitment. */
function keyTag(recoveryCode: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < recoveryCode.length; i += 1) {
    hash ^= recoveryCode.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function isKeySaved(recoveryCode: string): boolean {
  if (!recoveryCode) return true;
  try {
    return window.localStorage.getItem(`${SAVED_STORAGE}:${keyTag(recoveryCode)}`) === "1";
  } catch {
    return false;
  }
}

function markKeySaved(recoveryCode: string): void {
  try {
    window.localStorage.setItem(`${SAVED_STORAGE}:${keyTag(recoveryCode)}`, "1");
  } catch {
    // Without storage the reminder simply keeps showing.
  }
}

let feedback = "";
let reminderDismissed = false;

function rerender(): void {
  window.dispatchEvent(new CustomEvent("hidn:rerender"));
}

/** The save step: shows the key and three ways to keep it. */
export function renderKeySaveCard(recoveryCode: string, options: { heading?: string } = {}): string {
  const saved = isKeySaved(recoveryCode);
  return `<section class="hidn-key${saved ? " hidn-key--saved" : ""}" aria-labelledby="hidn-key-title">
    <p class="hidn-key__label">&gt; ${saved ? "KEY SAVED ON THIS DEVICE" : "YOUR KEY / NOT SAVED YET"}</p>
    <h2 id="hidn-key-title" class="hidn-key__title">${escapeHtml(options.heading ?? "SAVE YOUR KEY.")}</h2>
    <p class="hidn-key__why">This key <b>is</b> your account. There's no email and no password reset, so if you lose it, nobody (not even us) can get you back in, and your posts and inbox are gone.</p>
    <form class="hidn-key__form" data-key-save-form action="/room/access" method="post" autocomplete="on">
      <input class="hidn-key__sr" type="text" name="username" autocomplete="username" value="${KEY_CREDENTIAL_NAME}" readonly tabindex="-1" aria-hidden="true" />
      <input class="hidn-key__sr" type="password" name="password" autocomplete="new-password" value="${escapeHtml(recoveryCode)}" readonly tabindex="-1" aria-hidden="true" />
      <code class="hidn-key__code" data-key-code>${escapeHtml(recoveryCode)}</code>
      <div class="hidn-key__actions">
        <button class="hidn-key__btn hidn-key__btn--primary" type="submit">[ SAVE TO PASSWORDS ]</button>
        <button class="hidn-key__btn" type="button" data-key-download>[ DOWNLOAD ]</button>
        <button class="hidn-key__btn" type="button" data-key-copy>[ COPY ]</button>
      </div>
    </form>
    ${feedback ? `<p class="hidn-key__feedback" role="status">&gt; ${escapeHtml(feedback)}</p>` : ""}
    <p class="hidn-key__tip">Tip: saving to passwords is easiest. Next time, your phone or browser fills the key in for you.</p>
  </section>`;
}

export function bindKeySaveCard(root: ParentNode, recoveryCode: string): void {
  const form = root.querySelector<HTMLFormElement>("[data-key-save-form]");
  if (!form || !recoveryCode) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveToPasswords(recoveryCode);
  });
  root.querySelector<HTMLButtonElement>("[data-key-download]")?.addEventListener("click", () => {
    const text = [
      "HIDN ANONYMOUS KEY",
      "",
      recoveryCode,
      "",
      "This key is your HIDN account. There is no email and no reset.",
      "Keep it private. Anyone with this key can enter as you.",
      "To return: open HIDN, choose I HAVE A KEY, and paste it in.",
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "hidn-key.txt";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    saved(recoveryCode, "DOWNLOADED AS hidn-key.txt. KEEP THAT FILE SOMEWHERE SAFE.");
  });
  root.querySelector<HTMLButtonElement>("[data-key-copy]")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      saved(recoveryCode, "COPIED. PASTE IT INTO YOUR NOTES OR PASSWORD APP NOW.");
    } catch {
      feedback = "COPY FAILED. PRESS AND HOLD THE KEY TO SELECT IT.";
      rerender();
    }
  });
}

function saved(recoveryCode: string, message: string): void {
  markKeySaved(recoveryCode);
  feedback = message;
  rerender();
}

async function saveToPasswords(recoveryCode: string): Promise<void> {
  // Chrome, Edge and Android offer an explicit save prompt. Safari and
  // others offer to save on form submission, which this already was.
  const PasswordCredentialCtor = (window as unknown as { PasswordCredential?: new (data: { id: string; password: string; name: string }) => Credential }).PasswordCredential;
  if (PasswordCredentialCtor && navigator.credentials?.store) {
    try {
      await navigator.credentials.store(new PasswordCredentialCtor({ id: KEY_CREDENTIAL_NAME, password: recoveryCode, name: KEY_CREDENTIAL_NAME }));
      saved(recoveryCode, "SAVED TO YOUR PASSWORDS. YOUR BROWSER WILL FILL IT IN NEXT TIME.");
      return;
    } catch {
      // Fall through to the generic message.
    }
  }
  saved(recoveryCode, "IF YOUR BROWSER ASKED TO SAVE IT, YOU'RE SET. IF NOT, USE DOWNLOAD OR COPY TOO.");
}

/** Asks the password manager for a saved key (Chrome, Edge, Android). */
export async function readSavedKey(): Promise<string> {
  const credentials = navigator.credentials as CredentialsContainer & {
    get(options: { password: boolean; mediation?: string }): Promise<Credential | null>;
  };
  if (!("PasswordCredential" in window) || !credentials?.get) return "";
  try {
    const credential = await credentials.get({ password: true, mediation: "optional" }) as (Credential & { password?: string }) | null;
    return credential?.password ?? "";
  } catch {
    return "";
  }
}

export function canReadSavedKey(): boolean {
  return "PasswordCredential" in window;
}

/** A thin bar inside the room until the key has been saved once. */
export function renderKeyReminder(recoveryCode: string): string {
  if (!recoveryCode || reminderDismissed || isKeySaved(recoveryCode)) return "";
  return `<div class="hidn-key-reminder" role="status">
    <span>⚠ YOUR KEY ISN'T SAVED<span class="hidn-key-reminder__long">. LOSE IT AND YOU LOSE YOUR ACCOUNT.</span></span>
    <a href="/room/profile#key">[ SAVE IT ]</a>
    <button type="button" data-key-reminder-close aria-label="Hide until next visit">×</button>
  </div>`;
}

export function bindKeyReminder(root: ParentNode): void {
  root.querySelector<HTMLButtonElement>("[data-key-reminder-close]")?.addEventListener("click", () => {
    reminderDismissed = true;
    rerender();
  });
}

/** True right after a save in this visit, so the confirmation stays visible. */
export function keyJustSaved(): boolean {
  return feedback !== "";
}

/** A new session starts with a fresh reminder and no stale messages. */
export function resetKeyKeeper(): void {
  feedback = "";
  reminderDismissed = false;
}
