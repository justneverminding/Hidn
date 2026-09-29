import { attribute, attributes, classNames, escapeHtml } from "./dom";

export type StatusTone = "online" | "idle" | "warning" | "danger";
export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface HidnWordmarkOptions {
  href?: string;
  className?: string;
  label?: string;
}

export function HidnWordmark({
  href = "/",
  className,
  label = "HIDN home",
}: HidnWordmarkOptions = {}): string {
  return `<a class="${classNames("ui-wordmark", className)}" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">
    <picture class="ui-wordmark__picture">
      <source media="(max-width: 430px)" srcset="/brand/hidn-symbol.png" />
      <img class="ui-wordmark__image" src="/brand/hidn-logo.png" width="390" height="124" alt="" />
    </picture>
  </a>`;
}

export function TerminalLabel(label: string, className?: string): string {
  return `<span class="${classNames("ui-terminal-label", className)}">${escapeHtml(label)}</span>`;
}

export function StatusDot(
  tone: StatusTone = "online",
  pulse = false,
  label?: string,
): string {
  const toneClass = tone === "online" ? "" : `ui-status-dot--${tone}`;
  const pulseClass = pulse ? "ui-status-dot--pulse" : "";
  const dot = `<span class="${classNames("ui-status-dot", toneClass, pulseClass)}" aria-hidden="true"></span>`;

  return label ? `<span class="ui-status-indicator">${dot}<span>${escapeHtml(label)}</span></span>` : dot;
}

export function StatusIndicator(
  label: string,
  tone: StatusTone = "online",
  pulse = false,
): string {
  return `<span class="ui-status-indicator">${StatusDot(tone, pulse)}<span>${escapeHtml(label)}</span></span>`;
}

export interface ButtonOptions {
  label: string;
  type?: "button" | "submit" | "reset";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  dataDemo?: boolean;
  dataAction?: string;
}

function button(options: ButtonOptions, variant: ButtonVariant): string {
  return `<button${attributes({
    type: options.type ?? "button",
    class: classNames("ui-button", `ui-button--${variant}`, options.className),
    disabled: options.disabled,
    "aria-label": options.ariaLabel,
    "data-demo": options.dataDemo,
    "data-action": options.dataAction,
  })}>${escapeHtml(options.label)}</button>`;
}

export function PrimaryButton(options: ButtonOptions): string {
  return button(options, "primary");
}

export function SecondaryButton(options: ButtonOptions): string {
  return button(options, "secondary");
}

export function GhostButton(options: ButtonOptions): string {
  return button(options, "ghost");
}

export interface IconButtonOptions {
  icon: string;
  label: string;
  className?: string;
  disabled?: boolean;
}

export function IconButton({ icon, label, className, disabled }: IconButtonOptions): string {
  return `<button${attributes({
    type: "button",
    class: classNames("ui-icon-button", className),
    "aria-label": label,
    disabled,
    "data-demo": true,
  })}><span aria-hidden="true">${escapeHtml(icon)}</span></button>`;
}

export interface TextInputOptions {
  id: string;
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  type?: "text" | "search" | "email";
}

export function TextInput(options: TextInputOptions): string {
  const hintId = options.hint ? `${options.id}-hint` : undefined;
  return `<div class="ui-field">
    <label class="ui-field__label" for="${escapeHtml(options.id)}">${escapeHtml(options.label)}</label>
    <input${attributes({
      id: options.id,
      name: options.id,
      type: options.type ?? "text",
      value: options.value,
      placeholder: options.placeholder,
      required: options.required,
      disabled: options.disabled,
      "aria-describedby": hintId,
    })} />
    ${options.hint ? `<span class="ui-field__hint" id="${escapeHtml(hintId)}">${escapeHtml(options.hint)}</span>` : ""}
  </div>`;
}

export interface TextAreaOptions {
  id: string;
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
}

export function TextArea(options: TextAreaOptions): string {
  const hintId = options.hint ? `${options.id}-hint` : undefined;
  return `<div class="ui-field">
    <label class="ui-field__label" for="${escapeHtml(options.id)}">${escapeHtml(options.label)}</label>
    <textarea${attributes({
      id: options.id,
      name: options.id,
      rows: options.rows ?? 6,
      maxlength: options.maxLength,
      placeholder: options.placeholder,
      required: options.required,
      disabled: options.disabled,
      "aria-describedby": hintId,
    })}>${escapeHtml(options.value)}</textarea>
    ${options.hint ? `<span class="ui-field__hint" id="${escapeHtml(hintId)}">${escapeHtml(options.hint)}</span>` : ""}
  </div>`;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectOptions {
  id: string;
  label: string;
  options: SelectOption[];
  value?: string;
  hint?: string;
  disabled?: boolean;
}

export function SelectControl(options: SelectOptions): string {
  return `<div class="ui-field">
    <label class="ui-field__label" for="${escapeHtml(options.id)}">${escapeHtml(options.label)}</label>
    <select${attributes({
      id: options.id,
      name: options.id,
      disabled: options.disabled,
      "aria-describedby": options.hint ? `${options.id}-hint` : undefined,
    })}>
      ${options.options
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}"${option.value === options.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
        )
        .join("")}
    </select>
    ${options.hint ? `<span class="ui-field__hint" id="${escapeHtml(options.id)}-hint">${escapeHtml(options.hint)}</span>` : ""}
  </div>`;
}

export interface ChoiceOptions {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  name?: string;
}

export function CheckboxControl(options: ChoiceOptions): string {
  return `<label class="ui-check" for="${escapeHtml(options.id)}">
    <input${attributes({
      id: options.id,
      name: options.name ?? options.id,
      type: "checkbox",
      checked: options.checked,
      disabled: options.disabled,
    })} />
    <span class="ui-check__label">${escapeHtml(options.label)}</span>
  </label>`;
}

export function RadioControl(options: ChoiceOptions): string {
  return `<label class="ui-radio" for="${escapeHtml(options.id)}">
    <input${attributes({
      id: options.id,
      name: options.name ?? "hidn-radio",
      type: "radio",
      checked: options.checked,
      disabled: options.disabled,
    })} />
    <span class="ui-radio__label">${escapeHtml(options.label)}</span>
  </label>`;
}

export function VisibilityToggle(label = "PUBLIC SURFACE"): string {
  return `<button class="ui-visibility-toggle" type="button" aria-pressed="false" data-visibility-toggle data-demo="true">
    <span aria-hidden="true">◌</span>
    <span>${escapeHtml(label)}</span>
  </button>`;
}

export function PrivacyBadge(label = "ANONYMOUS"): string {
  return `<span class="ui-privacy-badge">${escapeHtml(label)}</span>`;
}

export function CategoryTag(label: string): string {
  return `<span class="ui-category-tag">${escapeHtml(label)}</span>`;
}

export interface ConfessionCardOptions {
  thought?: string;
  category?: string;
  time?: string;
  relativeTime?: string;
  reactions?: number;
  reference?: string;
  id?: string;
}

export function ConfessionCard({
  thought = "I don't know if I'm becoming the person everyone thinks I am.",
  category = "REGRET",
  time = "03:41",
  relativeTime,
  reactions = 19,
  reference,
  id,
}: ConfessionCardOptions = {}): string {
  return `<article class="ui-confession-card" aria-label="Anonymous confession"${id ? ` data-confession-id="${escapeHtml(id)}"` : ""}>
    <header class="ui-confession-card__header">
      <span>${escapeHtml(reference ?? "ANONYMOUS")}</span>
      <time>${escapeHtml(relativeTime ?? time)}</time>
    </header>
    <p class="ui-confession-card__thought">“${escapeHtml(thought)}”</p>
    <footer class="ui-confession-card__footer">
      ${CategoryTag(category)}
      <div class="ui-confession-card__actions" aria-label="Confession actions">
        ${id ? `<a class="ui-confession-card__read" href="/c/${escapeHtml(id)}">READ THOUGHT <span aria-hidden="true">→</span></a>` : ""}
        <button class="ui-confession-card__action" type="button" data-demo="true">♡ ${escapeHtml(reactions)}</button>
        <button class="ui-confession-card__action" type="button" data-demo="true">SHARE</button>
        <button class="ui-confession-card__action" type="button" data-demo="true">REPORT</button>
      </div>
    </footer>
  </article>`;
}

export function ConfessionComposerShell(): string {
  return `<section class="ui-composer" aria-labelledby="composer-title">
    <div class="ui-composer__header">
      <div>
        ${TerminalLabel("TRANSMISSION / COMPOSER")}
        <h3 class="type-heading-3" id="composer-title">Say what you cannot say publicly.</h3>
      </div>
      ${PrivacyBadge("NO ACCOUNT")}
    </div>
    ${TextArea({
      id: "preview-confession",
      label: "Your thought",
      placeholder: "Write without attaching your name...",
      hint: "Visual-only shell. Submission is intentionally not connected.",
      rows: 6,
    })}
    <div class="ui-composer__controls">
      ${SelectControl({
        id: "preview-category",
        label: "Category",
        value: "regret",
        options: [
          { value: "regret", label: "Regret" },
          { value: "fear", label: "Fear" },
          { value: "desire", label: "Desire" },
        ],
      })}
      ${VisibilityToggle("PUBLIC SURFACE")}
    </div>
    <div class="ui-composer__footer">
      <p class="ui-composer__privacy">NO ACCOUNT / NO USERNAME / NO HISTORY</p>
      ${PrimaryButton({ label: "CONFESS ANONYMOUSLY", dataDemo: true })}
    </div>
  </section>`;
}

export function SystemMessage(title: string, copy: string, mark = "OK"): string {
  return `<aside class="ui-system-message" role="status">
    <span class="ui-system-message__mark" aria-hidden="true">[${escapeHtml(mark)}]</span>
    <div class="ui-system-message__body">
      <strong class="ui-system-message__title">${escapeHtml(title)}</strong>
      <p class="ui-system-message__copy">${escapeHtml(copy)}</p>
    </div>
  </aside>`;
}

export function AlertMessage(
  title: string,
  copy: string,
  tone: "warning" | "danger" = "warning",
): string {
  const mark = tone === "danger" ? "!" : "?";
  return `<aside class="${classNames("ui-alert", tone === "danger" && "ui-alert--danger")}" role="alert">
    <span class="ui-alert__mark" aria-hidden="true">[${mark}]</span>
    <div class="ui-alert__body">
      <strong class="ui-alert__title">${escapeHtml(title)}</strong>
      <p class="ui-alert__copy">${escapeHtml(copy)}</p>
    </div>
  </aside>`;
}

export function RedactionBlock(label = "IDENTITY HIDDEN"): string {
  return `<span class="ui-redaction" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}

export function SurveillanceFrame(content: string, label = "SURVEILLANCE FRAME"): string {
  return `<div class="ui-surveillance-frame" aria-label="${escapeHtml(label)}">
    <span class="ui-surveillance-frame__corner ui-surveillance-frame__corner--top-right" aria-hidden="true"></span>
    <span class="ui-surveillance-frame__corner ui-surveillance-frame__corner--bottom-left" aria-hidden="true"></span>
    ${content}
  </div>`;
}

export function SectionHeader(
  eyebrow: string,
  title: string,
  copy?: string,
): string {
  return `<header class="ui-section-header">
    ${TerminalLabel(eyebrow)}
    <h2 class="ui-section-header__title">${escapeHtml(title)}</h2>
    ${copy ? `<p class="ui-section-header__copy">${escapeHtml(copy)}</p>` : ""}
  </header>`;
}

export function ManifestoStatement(text: string): string {
  return `<blockquote class="ui-manifesto">${escapeHtml(text)}</blockquote>`;
}

export function TransmissionDivider(label = "TRANSMISSION CONTINUES"): string {
  return `<div class="ui-transmission-divider" role="separator"><span>${escapeHtml(label)}</span></div>`;
}

export interface NavigationLink {
  label: string;
  href: string;
  current?: boolean;
}

export interface NavigationShellOptions {
  centerContent?: string;
  links?: NavigationLink[];
  descriptor?: string;
  showIdentity?: boolean;
  showStatus?: boolean;
  status?: string;
  href?: string;
}

export function NavigationShell({
  centerContent = "",
  links = [],
  descriptor = "ANONYMOUS INTERNET NOIR",
  showIdentity = true,
  showStatus = true,
  status = "BUILT ON ZCASH",
  href = "/",
}: NavigationShellOptions = {}): string {
  return `<header class="ui-nav-shell" data-shell-region="navigation">
    ${showIdentity ? `<div class="ui-nav-shell__identity">
      ${HidnWordmark({ href })}
      ${descriptor ? `<span class="ui-nav-shell__descriptor">${escapeHtml(descriptor)}</span>` : ""}
    </div>` : ""}
    ${centerContent}
    <nav aria-label="Primary navigation">
      <ul class="ui-nav-shell__links">
        ${links
          .map(
            (link) =>
              `<li><a href="${escapeHtml(link.href)}"${link.current ? ' aria-current="page"' : ""}>${escapeHtml(link.label)}</a></li>`,
          )
        .join("")}
      </ul>
    </nav>
    ${showStatus ? `<span class="ui-nav-shell__status">${escapeHtml(status)}</span>` : ""}
  </header>`;
}

export interface FooterShellOptions {
  links?: NavigationLink[];
  identity?: string;
}

export function FooterShell({
  links = [],
  identity = "ANONYMOUS BY DESIGN.",
}: FooterShellOptions = {}): string {
  return `<footer class="ui-footer-shell" data-shell-region="footer">
    <div class="ui-footer-shell__identity">
      ${HidnWordmark({ href: "/", label: "HIDN home" })}
      ${identity ? `<p>${escapeHtml(identity)}</p>` : ""}
    </div>
    <ul class="ui-footer-shell__links">
      ${links
        .map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`)
        .join("")}
    </ul>
  </footer>`;
}

export interface ModalDialogOptions {
  id: string;
  title: string;
  copy: string;
  open?: boolean;
  content?: string;
}

export function ModalDialog({ id, title, copy, open = false, content = "" }: ModalDialogOptions): string {
  return `<dialog class="ui-dialog" id="${escapeHtml(id)}"${open ? " open" : ""}>
    <div class="ui-dialog__header">
      <h3 class="ui-dialog__title">${escapeHtml(title)}</h3>
      ${IconButton({ icon: "×", label: "Close dialog", className: "ui-dialog__close" })}
    </div>
    <div class="ui-dialog__body">
      <p class="ui-dialog__copy">${escapeHtml(copy)}</p>
      ${content}
    </div>
    <div class="ui-dialog__footer">
      ${GhostButton({ label: "CANCEL", className: "ui-dialog__close", dataDemo: true })}
      ${SecondaryButton({ label: "CONTINUE", dataDemo: true })}
    </div>
  </dialog>`;
}

export function ReportDialogShell(): string {
  return `<section class="ui-report-dialog" aria-labelledby="report-shell-title">
    ${TerminalLabel("REPORT / SHELL")}
    <h3 class="type-heading-3" id="report-shell-title">Keep the surface safe.</h3>
    <p class="type-body-sm">Reporting is a future moderation flow. This component currently shows only its visual contract.</p>
    <div class="ui-report-dialog__options">
      ${RadioControl({ id: "report-harm", label: "Harmful content", name: "report-reason", checked: true })}
      ${RadioControl({ id: "report-private", label: "Private information", name: "report-reason" })}
    </div>
    ${SecondaryButton({ label: "REVIEW REPORT", dataDemo: true })}
  </section>`;
}

export function EmptyState(title = "NO TRANSMISSIONS", copy = "Nothing is visible here yet."): string {
  return `<section class="ui-empty-state" aria-live="polite">
    <p class="ui-empty-state__title">${escapeHtml(title)}</p>
    <p class="ui-empty-state__copy">${escapeHtml(copy)}</p>
  </section>`;
}

export function LoadingState(title = "LISTENING", copy = "Waiting for the next transmission."): string {
  return `<section class="ui-loading-state" aria-live="polite">
    <span class="ui-loading-state__signal" aria-hidden="true"></span>
    <p class="ui-loading-state__title">${escapeHtml(title)}</p>
    <p class="ui-loading-state__copy">${escapeHtml(copy)}</p>
  </section>`;
}

export function ErrorState(title = "SIGNAL LOST", copy = "This surface could not be loaded."): string {
  return `<section class="ui-error-state" role="alert">
    <p class="ui-error-state__title">${escapeHtml(title)}</p>
    <p class="ui-error-state__copy">${escapeHtml(copy)}</p>
  </section>`;
}

export function bindComponentInteractions(root: ParentNode = document): void {
  root.querySelectorAll<HTMLButtonElement>("[data-visibility-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const pressed = toggle.getAttribute("aria-pressed") === "true";
      toggle.setAttribute("aria-pressed", String(!pressed));
    });
  });

  root.querySelectorAll<HTMLButtonElement>(".ui-dialog__close").forEach((closeButton) => {
    closeButton.addEventListener("click", () => {
      const dialog = closeButton.closest<HTMLDialogElement>("dialog");
      dialog?.close();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.matches(".ui-dialog__close, [data-visibility-toggle]")) {
        return;
      }

      event.preventDefault();
    });
  });
}
