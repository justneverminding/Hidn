import {
  AlertMessage,
  CheckboxControl,
  ConfessionCard,
  ConfessionComposerShell,
  EmptyState,
  ErrorState,
  FooterShell,
  GhostButton,
  HidnWordmark,
  LoadingState,
  ManifestoStatement,
  ModalDialog,
  NavigationShell,
  PrimaryButton,
  PrivacyBadge,
  RadioControl,
  RedactionBlock,
  ReportDialogShell,
  SecondaryButton,
  SectionHeader,
  SelectControl,
  StatusIndicator,
  SurveillanceFrame,
  SystemMessage,
  TextArea,
  TextInput,
  TerminalLabel,
  TransmissionDivider,
  VisibilityToggle,
  bindComponentInteractions,
} from "@hidn/ui";

const colorSwatches = [
  ["BG", "--hidn-bg", "#090b09"],
  ["SURFACE", "--hidn-surface", "#111511"],
  ["RAISED", "--hidn-surface-raised", "#171c17"],
  ["INSET", "--hidn-surface-inset", "#0d100d"],
  ["BONE", "--hidn-bone", "#f3efe3"],
  ["SIGNAL", "--hidn-signal", "#b8dc68"],
  ["ZCASH", "--hidn-zcash", "#c8a252"],
  ["DANGER", "--hidn-danger", "#d06b63"],
];

const spacingSwatches = [
  ["01", "0.25rem", "0.25rem"],
  ["02", "0.5rem", "0.5rem"],
  ["03", "0.75rem", "0.75rem"],
  ["04", "1rem", "1rem"],
  ["05", "1.5rem", "1.5rem"],
  ["06", "2rem", "2rem"],
  ["07", "3rem", "3rem"],
  ["08", "5rem", "5rem"],
];

function renderColorSwatches(): string {
  return colorSwatches
    .map(
      ([label, token, value]) => `<div class="system-swatch">
        <span class="system-swatch__color" style="background:${token === "--hidn-bone" ? "var(--hidn-bone)" : `var(${token})`}"></span>
        <div class="system-swatch__meta">
          <strong>${label}</strong>
          <span>${token}</span>
          <small>${value}</small>
        </div>
      </div>`,
    )
    .join("");
}

function renderSpacingSwatches(): string {
  return spacingSwatches
    .map(
      ([label, value, width]) => `<div class="system-space">
        <span class="system-space__label">${label}</span>
        <span class="system-space__bar" style="--space-width:${width}"></span>
        <span class="system-space__value">${value}</span>
      </div>`,
    )
    .join("");
}

function renderTypeSamples(): string {
  return `<div class="system-type-samples">
    <div class="system-type-sample"><span class="type-label">DISPLAY XL</span><p class="type-display-xl">THE THOUGHT</p></div>
    <div class="system-type-sample"><span class="type-label">HEADING 2</span><p class="type-heading-2">Presence without exposure.</p></div>
    <div class="system-type-sample"><span class="type-label">BODY LG</span><p class="type-body-lg">A calm reading voice keeps the person out of the interface.</p></div>
    <div class="system-type-sample"><span class="type-label">MONO / SYSTEM</span><p class="type-mono">NO ACCOUNT / ANONYMOUS / BUILT ON ZCASH</p></div>
  </div>`;
}

export function renderSystemPage(): string {
  return `<div class="system-shell fx-grain fx-vignette">
    <a class="skip-link" href="#system-content">Skip to content</a>
    ${NavigationShell({
      descriptor: "INTERNAL / VISUAL SYSTEM",
      status: "NOINDEX PREVIEW",
      links: [
        { label: "FOUNDATIONS", href: "#foundations", current: true },
        { label: "COMPONENTS", href: "#components" },
        { label: "COMPOSITION", href: "#composition" },
        { label: "REFERENCES", href: "#references" },
      ],
    })}

    <main id="system-content" class="system-page">
      <section class="system-hero hidn-container--wide" aria-labelledby="system-title">
        <div class="system-hero__copy">
          ${TerminalLabel("PHASE 1 / DESIGN SYSTEM")}
          <h1 id="system-title" class="type-display-xl">SHOW THE THOUGHT.<br /><em>HIDE THE PERSON.</em></h1>
          <p class="type-body-lg">A reusable visual language for a privacy-native product. Editorial, quiet, and readable before it is ever technical.</p>
        </div>
        <div class="system-hero__aside">
          ${StatusIndicator("SYSTEM READY", "online", true)}
          <p class="type-mono-sm">INTERNAL PREVIEW / NOT A PUBLIC PRODUCT PAGE</p>
          <p class="type-body-sm">The controls below are visual contracts only. No confession, proof, wallet, account, or moderation logic is connected.</p>
        </div>
      </section>

      <section id="foundations" class="system-section hidn-container--wide" aria-label="Foundations">
        ${SectionHeader("01 / FOUNDATIONS", "Near-black, bone, signal.", "The system stays restrained so the thought can carry the weight. Gold is a secondary signal, never the primary voice.")}
        <div class="system-foundation-grid">
          <div class="system-panel">
            <div class="system-panel__header"><span class="type-label">SEMANTIC COLOR</span><span class="type-mono-sm">NO PURPLE</span></div>
            <div class="system-swatch-grid">${renderColorSwatches()}</div>
          </div>
          <div class="system-panel">
            <div class="system-panel__header"><span class="type-label">TYPE ROLES</span><span class="type-mono-sm">3 VOICES</span></div>
            ${renderTypeSamples()}
          </div>
        </div>
        <div class="system-panel system-panel--spacing">
          <div class="system-panel__header"><span class="type-label">SPACING SCALE</span><span class="type-mono-sm">NEGATIVE SPACE FIRST</span></div>
          <div class="system-space-grid">${renderSpacingSwatches()}</div>
        </div>
      </section>

      <section id="components" class="system-section hidn-container--wide" aria-label="Components">
        ${SectionHeader("02 / COMPONENTS", "Tools for the quiet surface.", "Controls are sharp, legible, and thumb-friendly. Nothing here creates an identity by accident.")}
        <div class="system-component-grid">
          <div class="system-component-group">
            <span class="type-label">ACTIONS</span>
            <div class="system-inline-row">
              ${PrimaryButton({ label: "CONFESS ANONYMOUSLY", dataDemo: true })}
              ${SecondaryButton({ label: "READ MORE", dataDemo: true })}
              ${GhostButton({ label: "CANCEL", dataDemo: true })}
              <button class="ui-icon-button" type="button" aria-label="More actions" data-demo="true"><span aria-hidden="true">···</span></button>
            </div>
          </div>
          <div class="system-component-group">
            <span class="type-label">IDENTITYLESS STATUS</span>
            <div class="system-inline-row system-inline-row--wrap">
              ${PrivacyBadge("NO ACCOUNT")}
              ${PrivacyBadge("ANONYMOUS")}
              ${StatusIndicator("NETWORK ONLINE", "online", true)}
              ${StatusIndicator("REVIEW NEEDED", "warning")}
            </div>
          </div>
          <div class="system-component-group">
            <span class="type-label">INPUTS</span>
            <div class="system-form-grid">
              ${TextInput({ id: "preview-search", label: "Search", placeholder: "Find a thought...", hint: "Visual input / no search connected." })}
              ${SelectControl({ id: "preview-select", label: "Category", value: "fear", options: [{ value: "fear", label: "Fear" }, { value: "desire", label: "Desire" }, { value: "regret", label: "Regret" }] })}
              ${TextArea({ id: "preview-textarea", label: "Transmission", placeholder: "Write with room to breathe...", rows: 4 })}
            </div>
            <div class="system-inline-row system-inline-row--wrap">
              ${CheckboxControl({ id: "preview-checkbox", label: "Keep this surface quiet", checked: true })}
              ${RadioControl({ id: "preview-radio-1", label: "Public", name: "preview-radio", checked: true })}
              ${RadioControl({ id: "preview-radio-2", label: "Private", name: "preview-radio" })}
              ${VisibilityToggle()}
            </div>
          </div>
          <div class="system-component-group">
            <span class="type-label">MESSAGES</span>
            <div class="system-message-stack">
              ${SystemMessage("PROOF STATE RESERVED", "A future proof state will be explained in plain language here.")}
              ${AlertMessage("READ BEFORE POSTING", "Privacy language must remain concrete and limited to what the system can support.")}
              ${AlertMessage("SURFACE UNAVAILABLE", "This is a visual error state only.", "danger")}
            </div>
          </div>
        </div>
      </section>

      <section id="composition" class="system-section hidn-container--wide" aria-label="Composition">
        ${SectionHeader("03 / COMPOSITION", "The thought is the focal point.", "Cards, frames, and redactions provide structure without turning an anonymous person into a profile.")}
        <div class="system-editorial-grid">
          <div class="system-composition-copy">
            ${ManifestoStatement("Visible, but not identifiable.")}
            ${TransmissionDivider("IDENTITY STAYS OUT OF FRAME")}
            <p class="type-body">Asymmetry and negative space create a sense of surveillance without making the product feel like a game or developer console.</p>
            <p class="type-mono-sm">IDENTITY FIELD: <span class="system-inline-redaction">${RedactionBlock()}</span></p>
          </div>
          <div class="system-card-stack">
            ${ConfessionCard()}
            ${SurveillanceFrame(`<div class="system-frame-content"><span class="type-label">FRAME / 004</span><p class="type-heading-3">Someone is here.<br /><em>${RedactionBlock("THE PERSON IS HIDDEN")}</em></p><span class="type-mono-sm">PRESENCE WITHOUT EXPOSURE</span></div>`)}
          </div>
        </div>
        ${ConfessionComposerShell()}
      </section>

      <section id="states" class="system-section hidn-container--wide" aria-label="States">
        ${SectionHeader("04 / STATES", "Every surface has a quiet fallback.", "Loading, empty, error, modal, and report shells are designed before real data exists.")}
        <div class="system-state-grid">
          ${EmptyState()}
          ${LoadingState()}
          ${ErrorState()}
        </div>
        <div class="system-dialog-stage">
          <div>
            ${TerminalLabel("DIALOG / MODAL")}
            <p class="type-body-sm">The open dialog is a preview sample. Close it to test the keyboard-visible close affordance.</p>
          </div>
          ${ModalDialog({ id: "preview-dialog", title: "Before you transmit", copy: "This is a future privacy explanation surface. It makes no account, proof, or network claim.", open: true })}
          ${ReportDialogShell()}
        </div>
      </section>

      <section id="chrome" class="system-section hidn-container--wide" aria-label="Chrome">
        ${SectionHeader("05 / CHROME", "The shell stays quiet.", "Navigation and footer elements carry system language without exposing admin surfaces or adding a wallet call-to-action.")}
        <div class="system-chrome-preview">
          ${NavigationShell({ descriptor: "PUBLIC SURFACE", status: "BUILT ON ZCASH", links: [{ label: "CONFESS", href: "#components", current: true }, { label: "EXPLORE", href: "#composition" }, { label: "PRIVACY", href: "#foundations" }] })}
          ${FooterShell({ links: [{ label: "MANIFESTO", href: "#composition" }, { label: "PRIVACY", href: "#foundations" }, { label: "HOW IT WORKS", href: "#components" }, { label: "ZCASH", href: "#foundations" }] })}
        </div>
      </section>

      <section id="references" class="system-section hidn-container--wide" aria-label="References">
        ${SectionHeader("06 / REFERENCES", "Original mood references, unchanged.", "The original supplied artwork, kept for mood and texture. The eye logo in it is retired; the HIDN logo is the >hidn▌ prompt mark.")}
        <div class="system-reference-grid">
          <figure class="system-reference">
            <img src="/brand/references/hidn-brand-reference-01.png" alt="Approved HIDN eye artwork reference" />
            <figcaption><span class="type-label">REFERENCE 01</span><span class="type-mono-sm">1536 × 1024 / RGB PNG</span></figcaption>
          </figure>
          <figure class="system-reference">
            <img src="/brand/references/hidn-brand-reference-02.png" alt="Approved HIDN visual brand reference with wordmark and anonymous imagery" />
            <figcaption><span class="type-label">REFERENCE 02</span><span class="type-mono-sm">2056 × 765 / RGB PNG</span></figcaption>
          </figure>
        </div>
      </section>
    </main>

    ${FooterShell({ links: [{ label: "PHASE 0", href: "/" }, { label: "BRAND SOURCE", href: "/#foundation" }], identity: "INTERNAL DESIGN SYSTEM / NOINDEX" })}
  </div>`;
}

export function bindSystemPage(): void {
  bindComponentInteractions(document);
}
