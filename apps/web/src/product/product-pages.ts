import {
  AlertMessage,
  CategoryTag,
  ConfessionCard,
  EmptyState,
  ErrorState,
  FooterShell,
  GhostButton,
  ManifestoStatement,
  NavigationShell,
  PrimaryButton,
  PrivacyBadge,
  SecondaryButton,
  SelectControl,
  StatusIndicator,
  SurveillanceFrame,
  SystemMessage,
  TextArea,
  TerminalLabel,
  TransmissionDivider,
  VisibilityToggle,
  bindComponentInteractions,
  escapeHtml,
} from "@hidn/ui";
import {
  CONFESS_METADATA,
  EXPLORE_METADATA,
  HOME_METADATA,
  type HidnMetadata,
} from "../metadata";
import {
  createMockConfession,
  getMockConfession,
  isMockCategory,
  MOCK_CONFESSIONS,
  mockFlow,
  type FlowStep,
  type MockCategory,
  type MockConfession,
  type ProofState,
  resetMockFlow,
} from "./mock-data";

export interface RenderedProductRoute {
  html: string;
  metadata: HidnMetadata;
}

type FeedTab = "latest" | "random" | "felt";

let activeFeedTab: FeedTab = "latest";
let proofRunActive = false;

const categoryOptions: Array<{ value: MockCategory; label: string }> = [
  { value: "REGRET", label: "Regret" },
  { value: "CAREER", label: "Career" },
  { value: "RELATIONSHIPS", label: "Relationships" },
  { value: "FEAR", label: "Fear" },
  { value: "LONELINESS", label: "Loneliness" },
  { value: "AMBITION", label: "Ambition" },
  { value: "FAMILY", label: "Family" },
  { value: "MONEY", label: "Money" },
  { value: "IDENTITY", label: "Identity" },
  { value: "UNCERTAINTY", label: "Uncertainty" },
  { value: "JOY", label: "Joy" },
];

function normalizePath(path: string): string {
  const cleanPath = path.replace(/\/+$/, "");
  return cleanPath || "/";
}

function actionLink(
  label: string,
  href: string,
  variant: "primary" | "secondary" | "ghost",
  className = "",
): string {
  return `<a class="ui-button ui-button--${variant}${className ? ` ${className}` : ""}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function publicNavigation(path: string): string {
  const links = [
    { label: "CONFESS", href: "/confess" },
    { label: "EXPLORE", href: "/explore" },
    { label: "HOW IT WORKS", href: "/how-it-works" },
    { label: "MANIFESTO", href: "/manifesto" },
  ].map((link) => ({ ...link, current: normalizePath(path) === link.href }));

  return NavigationShell({
    descriptor: "ANONYMOUS INTERNET NOIR",
    status: "BUILT ON ZCASH",
    links,
  });
}

function publicFrame(path: string, main: string, pageClass = ""): string {
  return `<div class="public-page ${pageClass} fx-grain fx-vignette">
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${publicNavigation(path)}
    ${main}
    ${FooterShell({
      links: [
        { label: "EXPLORE", href: "/explore" },
        { label: "HOW IT WORKS", href: "/how-it-works" },
        { label: "MANIFESTO", href: "/manifesto" },
        { label: "PRIVACY", href: "/privacy" },
      ],
      identity: "ANONYMOUS BY DESIGN.",
    })}
  </div>`;
}

function flowStepper(currentStep: FlowStep): string {
  const steps: Array<{ key: FlowStep; number: string; label: string }> = [
    { key: "prove", number: "01", label: "PROVE" },
    { key: "confess", number: "02", label: "CONFESS" },
    { key: "preview", number: "03", label: "PREVIEW" },
  ];
  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  return `<ol class="flow-stepper" aria-label="Confession steps">
    ${steps
      .map((step, index) => {
        const state =
          index < currentIndex || currentStep === "success"
            ? "complete"
            : index === currentIndex
              ? "current"
              : "upcoming";
        return `<li class="flow-step flow-step--${state}">
          <span class="flow-step__number">${step.number}</span>
          <span class="flow-step__label">${step.label}</span>
        </li>`;
      })
      .join("")}
  </ol>`;
}

function proofStateCopy(state: ProofState): { label: string; copy: string } {
  switch (state) {
    case "preparing":
      return { label: "PREPARING PRIVATE PROOF...", copy: "Setting up the local demo sequence." };
    case "generating":
      return { label: "GENERATING...", copy: "Simulating a short proof handoff." };
    case "verifying":
      return { label: "VERIFYING...", copy: "Checking the mock result locally." };
    case "verified":
      return { label: "PROOF VERIFIED / MOCK DEMO", copy: "The visual sequence is complete. No cryptographic proof was created." };
    default:
      return { label: "READY TO BEGIN", copy: "A short local demonstration of the future flow." };
  }
}

function renderProofStep(): string {
  const stateCopy = proofStateCopy(mockFlow.proofState);
  const isRunning = mockFlow.proofState !== "idle" && mockFlow.proofState !== "verified";

  return `<section class="flow-panel flow-proof" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("01 / PROVE")}
      ${StatusIndicator("MOCK DEMO / LOCAL ONLY", "warning")}
    </div>
    <h1 id="flow-title" class="type-display-lg">PROVE PRIVATELY</h1>
    <p class="flow-panel__lead">Prove you're real without revealing who you are. Nothing about your identity is published.</p>
    <div class="flow-trust-grid" aria-label="Privacy commitments">
      <div class="flow-trust-block"><strong>NO ACCOUNT</strong><span>WILL BE CREATED</span></div>
      <div class="flow-trust-block"><strong>YOUR IDENTITY</strong><span>REMAINS HIDN</span></div>
      <div class="flow-trust-block"><strong>FAST &amp; PRIVATE</strong><span>VERIFICATION</span></div>
    </div>
    <div class="flow-proof__action">
      ${
        mockFlow.proofState === "idle"
          ? PrimaryButton({ label: "PROVE PRIVATELY →", dataAction: "proof-start" })
          : mockFlow.proofState === "verified"
            ? PrimaryButton({ label: "CONTINUE TO CONFESSION →", dataAction: "proof-continue" })
            : PrimaryButton({ label: "WORKING...", disabled: true })
      }
    </div>
    <div class="flow-status" role="status" aria-live="polite">
      <span class="flow-status__line">${escapeHtml(stateCopy.label)}</span>
      <span class="flow-status__copy">${escapeHtml(stateCopy.copy)}</span>
    </div>
    ${SystemMessage("MOCK DEMO / NO CRYPTOGRAPHIC PROOF", "This interaction only simulates the product sequence. It creates no credential, nullifier, proof, wallet request, or network request.", "DEMO")}
  </section>`;
}

function renderConfessStep(): string {
  const characterCount = mockFlow.thought.length;
  return `<section class="flow-panel flow-confess" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("02 / CONFESS")}
      ${PrivacyBadge("NO ACCOUNT")}
    </div>
    <h1 id="flow-title" class="type-display-lg">WHAT CAN'T YOU<br />SAY PUBLICLY?</h1>
    <p class="flow-panel__lead">Write the thought as it is. The public surface keeps only the message and minimal context.</p>
    ${mockFlow.error ? AlertMessage("MESSAGE NEEDED", mockFlow.error, "danger") : ""}
    <form class="flow-form" id="confession-form" novalidate>
      ${TextArea({
        id: "confession-thought",
        label: "Your confession",
        value: mockFlow.thought,
        placeholder: "Write without attaching your name...",
        hint: "500 characters maximum. This demo keeps the draft in memory only.",
        rows: 8,
        maxLength: 500,
        required: true,
      })}
      <div class="flow-form__counter" aria-live="polite"><span data-character-count>${characterCount}</span> / 500</div>
      <div class="flow-form__controls">
        ${SelectControl({
          id: "confession-category",
          label: "Category",
          value: mockFlow.category,
          options: categoryOptions,
          hint: "A broad label, not a profile.",
        })}
        <div class="flow-visibility">
          <span class="ui-field__label">Visibility</span>
          ${VisibilityToggle("MINIMAL VISIBILITY")}
          <p>Thought, category, reaction count, and relative time only.</p>
        </div>
      </div>
      <div class="flow-form__footer">
        <p class="flow-form__reassurance">No account. No username. No history.</p>
        ${PrimaryButton({ label: "CONTINUE →", dataAction: "confess-continue" })}
      </div>
    </form>
  </section>`;
}

function renderPreviewStep(): string {
  return `<section class="flow-panel flow-preview" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("03 / PREVIEW")}
      ${PrivacyBadge("IDENTITYLESS")}
    </div>
    <h1 id="flow-title" class="type-display-lg">PREVIEW YOUR<br />CONFESSION</h1>
    <p class="flow-panel__lead">This is exactly how it will appear. No identity. No history.</p>
    <div class="flow-preview__card">
      ${ConfessionCard({ thought: mockFlow.thought, category: mockFlow.category, reference: "// PREVIEW", relativeTime: "NOW", reactions: 0 })}
    </div>
    <dl class="flow-summary" aria-label="Privacy summary">
      <div><dt>IDENTITY</dt><dd>HIDN</dd></div>
      <div><dt>USERNAME</dt><dd>NONE</dd></div>
      <div><dt>PROFILE</dt><dd>NONE</dd></div>
      <div><dt>HISTORY</dt><dd>NONE</dd></div>
    </dl>
    ${SystemMessage("FINAL CHECK / MOCK ONLY", "Posting here adds a local in-memory demo confession. No backend or persistent record is connected.", "DEMO")}
    <div class="flow-actions">
      ${SecondaryButton({ label: "EDIT", dataAction: "confession-edit" })}
      ${PrimaryButton({ label: "POST CONFESSION →", dataAction: "confession-post" })}
    </div>
  </section>`;
}

function renderSuccessStep(): string {
  const confessionId = mockFlow.createdId ?? "";
  return `<section class="flow-success" aria-labelledby="flow-title">
    <div class="flow-success__visual">
      ${SurveillanceFrame(`<img src="/brand/references/hidn-brand-reference-01.png" alt="Approved HIDN eye artwork reference" width="1536" height="1024" loading="eager" />`, "TRANSMISSION RECEIVED")}
    </div>
    <div class="flow-success__copy">
      ${TerminalLabel("TRANSMISSION RECEIVED")}
      <h1 id="flow-title" class="type-display-lg">CONFESSION POSTED</h1>
      <p class="flow-panel__lead">The message stays. You don't.</p>
      <p class="flow-success__note">This demo keeps the new confession in memory for this browser session only. No identity, account, or history was created.</p>
      <div class="flow-actions">
        ${actionLink("VIEW CONFESSION →", confessionId ? `/c/${confessionId}` : "/explore", "primary")}
        ${GhostButton({ label: "LEAVE HIDN", dataAction: "leave-hidn" })}
      </div>
    </div>
  </section>`;
}

function renderConfess(): string {
  const content =
    mockFlow.step === "success"
      ? renderSuccessStep()
      : mockFlow.step === "confess"
        ? renderConfessStep()
        : mockFlow.step === "preview"
          ? renderPreviewStep()
          : renderProofStep();

  return publicFrame(
    "/confess",
    `<main id="main-content" class="public-main flow-main">
      <div class="hidn-container flow-page">
        <header class="flow-header">
          ${TerminalLabel("HIDN / PRIVATE TRANSMISSION")}
          <p>VISIT → CONFESS → PROVE PRIVATELY → POST ANONYMOUSLY</p>
        </header>
        ${flowStepper(mockFlow.step)}
        ${content}
      </div>
    </main>`,
    "public-page--flow",
  );
}

function feedForTab(tab: FeedTab): MockConfession[] {
  if (tab === "felt") {
    return [...MOCK_CONFESSIONS].sort((left, right) => right.reactions - left.reactions);
  }

  if (tab === "random") {
    return [...MOCK_CONFESSIONS.slice(4), ...MOCK_CONFESSIONS.slice(0, 4)];
  }

  return MOCK_CONFESSIONS;
}

function renderFeedCards(tab: FeedTab): string {
  const confessions = feedForTab(tab);
  if (!confessions.length) {
    return EmptyState("NO TRANSMISSIONS", "Nothing is visible here yet.");
  }

  return confessions
    .map((confession) =>
      ConfessionCard({
        id: confession.id,
        reference: confession.reference,
        thought: confession.text,
        category: confession.category,
        relativeTime: confession.relativeTime,
        time: confession.time,
        reactions: confession.reactions,
      }),
    )
    .join("");
}

function renderExploreTabs(): string {
  const tabs: Array<{ key: FeedTab; label: string }> = [
    { key: "latest", label: "LATEST" },
    { key: "random", label: "RANDOM" },
    { key: "felt", label: "FELT" },
  ];

  return `<div class="explore-tabs" role="tablist" aria-label="Confession order">
    ${tabs
      .map(
        (tab) => `<button class="explore-tabs__tab" type="button" role="tab" data-feed-tab="${tab.key}" aria-selected="${activeFeedTab === tab.key}">${tab.label}</button>`,
      )
      .join("")}
  </div>`;
}

function renderExplore(): string {
  const popular = [...MOCK_CONFESSIONS].sort((left, right) => right.reactions - left.reactions).slice(0, 4);
  return publicFrame(
    "/explore",
    `<main id="main-content" class="public-main explore-main">
      <div class="hidn-container--wide explore-page">
        <header class="explore-header">
          ${TerminalLabel("PUBLIC TRANSMISSIONS / INDEX")}
          <h1 class="type-display-lg">CONFESSIONS</h1>
          <p>Raw thoughts. Real people. No identities.</p>
        </header>
        <div class="explore-layout">
          <aside class="explore-editorial" aria-label="Explore introduction">
            ${ManifestoStatement("The thought is public. The person stays out of frame.")}
            ${TransmissionDivider("NO AUTHOR TRAIL")}
            <p class="type-body-sm">Read without following. React without collecting a profile. Every card is a transmission, not a timeline.</p>
          </aside>
          <section class="explore-feed" aria-labelledby="explore-feed-title">
            <div class="explore-feed__heading">
              <div>
                ${TerminalLabel("LIVE / MOCK INDEX")}
                <h2 id="explore-feed-title" class="type-heading-2">A room without names.</h2>
              </div>
              ${StatusIndicator("LOCAL CONTENT", "warning")}
            </div>
            ${renderExploreTabs()}
            <div class="explore-feed__list" id="explore-feed-list" aria-live="polite">${renderFeedCards(activeFeedTab)}</div>
          </section>
          <aside class="explore-sidebar" aria-label="Explore activity">
            <section class="explore-side-block">
              ${TerminalLabel("POPULAR THIS WEEK")}
              <ol class="explore-side-list">
                ${popular.map((confession) => `<li><a href="/c/${escapeHtml(confession.id)}"><span>${escapeHtml(confession.category)}</span><strong>${escapeHtml(String(confession.reactions))} FELT</strong></a></li>`).join("")}
              </ol>
            </section>
            <section class="explore-side-block">
              ${TerminalLabel("ACTIVITY")}
              ${SystemMessage("NO ACCOUNTS DETECTED", "This index has no usernames, follows, or public profiles.", "OK")}
            </section>
          </aside>
        </div>
      </div>
    </main>`,
    "public-page--explore",
  );
}

function renderDetail(id: string): RenderedProductRoute {
  const confession = getMockConfession(id);
  const metadata: HidnMetadata = {
    kind: "anonymous-confession",
    title: "HIDN — Anonymous confession",
    description: "An anonymous HIDN confession. No public identity or confession history is attached.",
    canonicalPath: `/c/${encodeURIComponent(id)}`,
  };

  if (!confession) {
    return {
      metadata,
      html: publicFrame(
        `/c/${id}`,
        `<main id="main-content" class="public-main detail-main">
          <div class="hidn-container--reading detail-page">
            <h1 class="detail-page__title">TRANSMISSION NOT FOUND</h1>
            ${ErrorState("TRANSMISSION NOT FOUND", "This local demo confession is no longer available in memory.")}
            ${actionLink("BACK TO CONFESSIONS", "/explore", "secondary")}
          </div>
        </main>`,
        "public-page--detail",
      ),
    };
  }

  return {
    metadata,
    html: publicFrame(
      `/c/${id}`,
        `<main id="main-content" class="public-main detail-main">
        <div class="hidn-container--reading detail-page">
          <header class="detail-header">
            ${TerminalLabel("ANONYMOUS TRANSMISSION")}
            <h1 class="detail-page__title">ANONYMOUS CONFESSION</h1>
            <div class="detail-header__meta"><span>${escapeHtml(confession.reference)}</span><time datetime="${escapeHtml(confession.time)}">${escapeHtml(confession.relativeTime)}</time></div>
          </header>
          <article class="detail-card" aria-labelledby="detail-thought">
            <p id="detail-thought" class="detail-card__thought">“${escapeHtml(confession.text)}”</p>
            <div class="detail-card__footer">
              ${CategoryTag(confession.category)}
              ${PrivacyBadge("NO IDENTITY")}
            </div>
          </article>
          <div class="detail-meta-grid">
            <div><span>REACTIONS</span><strong>${escapeHtml(String(confession.reactions))} FELT</strong></div>
            <div><span>POSTED</span><strong>${escapeHtml(confession.relativeTime)}</strong></div>
            <div><span>HISTORY</span><strong>NONE</strong></div>
          </div>
          ${SystemMessage("PROOF STATUS / DEMO ONLY", "The public card contains no proof material. This mock route does not verify a person or connect a network identity.", "DEMO")}
          <div class="detail-actions" aria-label="Confession actions">
            <button class="ui-confession-card__action" type="button" data-demo="true">♡ ${escapeHtml(String(confession.reactions))}</button>
            <button class="ui-confession-card__action" type="button" data-demo="true">SHARE</button>
            <button class="ui-confession-card__action" type="button" data-demo="true">REPORT</button>
          </div>
          <p class="detail-boundary">NO PROFILE / NO AUTHOR PAGE / NO MORE FROM THIS PERSON</p>
          ${actionLink("BACK TO CONFESSIONS", "/explore", "ghost", "detail-back")}
        </div>
      </main>`,
      "public-page--detail",
    ),
  };
}

interface PlaceholderPage {
  eyebrow: string;
  title: string;
  copy: string;
  body: string;
}

function placeholderForPath(path: string): PlaceholderPage {
  if (path === "/manifesto") {
    return {
      eyebrow: "HIDN / MANIFESTO",
      title: "SHOW THE THOUGHT. HIDE THE PERSON.",
      copy: "A public surface for saying the thing without turning the person into content.",
      body: "HIDN treats anonymity as a boundary, not a personality. The message can be seen without requiring a name, a profile, or a trail to follow.",
    };
  }

  if (path === "/privacy") {
    return {
      eyebrow: "HIDN / PRIVACY",
      title: "REVEAL LESS BY DEFAULT.",
      copy: "Privacy language should stay concrete, limited, and understandable.",
      body: "This Phase 2 experience is a local mock. It creates no account, requests no wallet, makes no cryptographic proof, and stores no confession beyond the current browser memory.",
    };
  }

  return {
    eyebrow: "HIDN / HOW IT WORKS",
    title: "THE PERSON STAYS OUT OF FRAME.",
    copy: "Visit, write, preview, and leave without becoming a public identity.",
    body: "The public flow is intentionally small: a private-proof placeholder, a confession composer, an identityless preview, and a quiet posting result. The current experience is a frontend demonstration only.",
  };
}

function renderPlaceholder(path: string): RenderedProductRoute {
  const page = placeholderForPath(path);
  const title = path === "/manifesto" ? "Manifesto" : path === "/privacy" ? "Privacy" : "How it works";
  return {
    metadata: {
      kind: "public-page",
      title: `HIDN — ${title}`,
      description: page.copy,
      canonicalPath: path,
    },
    html: publicFrame(
      path,
      `<main id="main-content" class="public-main placeholder-main">
        <div class="hidn-container--reading placeholder-page">
          <header class="ui-section-header placeholder-header">
            ${TerminalLabel(page.eyebrow)}
            <h1 class="placeholder-header__title">${escapeHtml(page.title)}</h1>
            <p class="ui-section-header__copy">${escapeHtml(page.copy)}</p>
          </header>
          <div class="placeholder-content">
            ${ManifestoStatement(path === "/privacy" ? "Concrete controls. No absolute promises." : "Presence without exposure.")}
            <p class="type-body-lg">${escapeHtml(page.body)}</p>
          </div>
          ${
            path === "/how-it-works"
              ? `<ol class="placeholder-steps">
                <li><span>01</span><div><strong>PROVE PRIVATELY</strong><p>Future eligibility and proof work will be reviewed before it becomes real.</p></div></li>
                <li><span>02</span><div><strong>CONFESS</strong><p>Write the thought with no account, username, or profile.</p></div></li>
                <li><span>03</span><div><strong>POST ANONYMOUSLY</strong><p>Preview exactly what is shown, then leave the surface behind.</p></div></li>
              </ol>`
              : SystemMessage("PHASE 2 / FRONTEND DEMO", "Backend persistence, real proof, moderation, wallets, and analytics remain deferred.", "INFO")
          }
        </div>
      </main>`,
      "public-page--placeholder",
    ),
  };
}

function renderNotFound(): RenderedProductRoute {
  return {
    metadata: {
      kind: "not-found",
      title: "HIDN — Surface unavailable",
      description: "The requested HIDN surface is not available.",
      canonicalPath: "/",
    },
    html: publicFrame(
      "/",
      `<main id="main-content" class="public-main detail-main">
        <div class="hidn-container--reading detail-page">
          <h1 class="detail-page__title">SURFACE UNAVAILABLE</h1>
          ${ErrorState("SURFACE UNAVAILABLE", "The requested HIDN page is not part of this public experience.")}
          ${actionLink("RETURN TO HIDN", "/", "primary")}
        </div>
      </main>`,
      "public-page--detail",
    ),
  };
}

function renderHome(): RenderedProductRoute {
  return {
    metadata: HOME_METADATA,
    html: publicFrame(
      "/",
      `<main id="main-content" class="public-main home-main">
        <div class="hidn-container--wide home-page">
          <section class="home-hero" aria-labelledby="home-title">
            <div class="home-hero__copy">
              ${TerminalLabel("HIDN / ANONYMOUS INTERNET NOIR")}
              <h1 id="home-title" class="home-hero__title">SAY WHAT YOU<br />CAN'T SAY<br /><em>PUBLICLY.</em></h1>
              <p class="home-hero__supporting">No accounts. No usernames. No history.</p>
              <div class="home-hero__actions">
                ${actionLink("CONFESS →", "/confess", "primary")}
                ${actionLink("EXPLORE CONFESSIONS", "/explore", "secondary")}
              </div>
              <p class="home-hero__boundary">A quiet place for the thought to exist without making the person public.</p>
            </div>
            <figure class="home-hero__visual">
              ${SurveillanceFrame(`<img src="/brand/references/hidn-brand-reference-01.png" alt="Approved HIDN eye artwork reference" width="1536" height="1024" loading="eager" decoding="async" />`, "APPROVED HIDN REFERENCE 01")}
              <figcaption><span>${TerminalLabel("APPROVED REFERENCE / 01")}</span><span>FULL IMAGE / UNCHANGED</span></figcaption>
            </figure>
          </section>
          <section class="home-signal" aria-label="HIDN privacy boundary">
            <div>${StatusIndicator("IDENTITY OUT OF FRAME", "online", true)}</div>
            <p>HIDN keeps the confession visible and the sender out of the interface.</p>
          </section>
          <section class="home-editorial" aria-labelledby="home-editorial-title">
            <div class="home-editorial__statement">
              ${ManifestoStatement("SHOW THE THOUGHT. HIDE THE PERSON.")}
              ${TransmissionDivider("PRESENCE WITHOUT EXPOSURE")}
            </div>
            <div class="home-editorial__sample">
              ${TerminalLabel("A TRANSMISSION / SAMPLE")}
              ${ConfessionCard({ thought: "I have been waiting for permission from people who are not thinking about me.", category: "AMBITION", relativeTime: "6 MIN AGO", reactions: 28, reference: "// 00418" })}
            </div>
          </section>
          <section class="home-reference" aria-labelledby="reference-title">
            <div class="home-reference__heading">
              ${TerminalLabel("APPROVED DIRECTION / 02")}
              <h2 id="reference-title" class="type-heading-2">Some thoughts are better HIDN.</h2>
            </div>
            <figure>
              <img src="/brand/references/hidn-brand-reference-02.png" alt="Approved HIDN visual brand reference with wordmark and anonymous imagery" width="2056" height="765" loading="lazy" decoding="async" />
              <figcaption><span>CANONICAL REFERENCE / 02</span><span>FULL IMAGE / UNCHANGED</span></figcaption>
            </figure>
          </section>
        </div>
      </main>`,
      "public-page--home",
    ),
  };
}

export function renderProductRoute(path: string): RenderedProductRoute {
  const normalizedPath = normalizePath(path);

  if (normalizedPath === "/") {
    return renderHome();
  }

  if (normalizedPath === "/confess") {
    return { metadata: CONFESS_METADATA, html: renderConfess() };
  }

  if (normalizedPath === "/explore") {
    return { metadata: EXPLORE_METADATA, html: renderExplore() };
  }

  if (["/manifesto", "/how-it-works", "/privacy"].includes(normalizedPath)) {
    return renderPlaceholder(normalizedPath);
  }

  if (normalizedPath.startsWith("/c/")) {
    const id = normalizedPath.slice(3).split("/")[0];
    if (id) {
      try {
        return renderDetail(decodeURIComponent(id));
      } catch {
        return renderDetail(id);
      }
    }
  }

  return renderNotFound();
}

function rerenderProductRoute(): void {
  window.dispatchEvent(new CustomEvent("hidn:rerender"));
}

function navigateProductRoute(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("popstate"));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function runMockProof(): Promise<void> {
  if (proofRunActive || mockFlow.proofState !== "idle") {
    return;
  }

  proofRunActive = true;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const states: Array<{ state: ProofState; wait: number }> = [
    { state: "preparing", wait: 250 },
    { state: "generating", wait: 300 },
    { state: "verifying", wait: 300 },
    { state: "verified", wait: 0 },
  ];

  for (const item of states) {
    if (normalizePath(window.location.pathname) !== "/confess" || mockFlow.step !== "prove") {
      proofRunActive = false;
      return;
    }

    mockFlow.proofState = item.state;
    rerenderProductRoute();
    await delay(reducedMotion ? Math.min(item.wait, 30) : item.wait);
  }

  proofRunActive = false;
}

function renderExploreFeed(root: ParentNode, tab: FeedTab): void {
  const list = root.querySelector<HTMLElement>("#explore-feed-list");
  if (!list) {
    return;
  }

  list.innerHTML = renderFeedCards(tab);
  root.querySelectorAll<HTMLButtonElement>("[data-feed-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.feedTab === tab));
  });
  bindComponentInteractions(list);
}

export function bindProductRoute(root: ParentNode = document): void {
  bindComponentInteractions(root);

  root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      switch (button.dataset.action) {
        case "proof-start":
          void runMockProof();
          break;
        case "proof-continue":
          mockFlow.step = "confess";
          mockFlow.error = "";
          rerenderProductRoute();
          break;
        case "confess-continue": {
          const textarea = root.querySelector<HTMLTextAreaElement>("#confession-thought");
          mockFlow.thought = textarea?.value ?? "";
          if (!mockFlow.thought.trim()) {
            mockFlow.error = "Write a thought before continuing. The demo does not publish empty transmissions.";
            rerenderProductRoute();
            break;
          }

          mockFlow.error = "";
          mockFlow.step = "preview";
          rerenderProductRoute();
          break;
        }
        case "confession-edit":
          mockFlow.step = "confess";
          mockFlow.error = "";
          rerenderProductRoute();
          break;
        case "confession-post":
          if (mockFlow.thought.trim()) {
            createMockConfession();
            mockFlow.step = "success";
            rerenderProductRoute();
          }
          break;
        case "leave-hidn":
          resetMockFlow();
          navigateProductRoute("/");
          break;
        default:
          break;
      }
    });
  });

  root.querySelector<HTMLTextAreaElement>("#confession-thought")?.addEventListener("input", (event) => {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    mockFlow.thought = textarea.value;
    mockFlow.error = "";
    const counter = root.querySelector<HTMLElement>("[data-character-count]");
    if (counter) {
      counter.textContent = String(textarea.value.length);
    }
  });

  root.querySelector<HTMLSelectElement>("#confession-category")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    if (isMockCategory(select.value)) {
      mockFlow.category = select.value;
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-feed-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.feedTab;
      if (tab === "latest" || tab === "random" || tab === "felt") {
        activeFeedTab = tab;
        renderExploreFeed(root, activeFeedTab);
      }
    });
  });
}
