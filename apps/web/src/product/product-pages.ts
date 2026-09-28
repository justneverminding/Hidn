import {
  AlertMessage,
  CategoryTag,
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
  MOCK_INCOMING_TRANSMISSIONS,
  MOCK_CONFESSIONS,
  mockFlow,
  type FlowStep,
  type MockCategory,
  type MockConfession,
  type MockIncomingTransmission,
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
let homeStreamTimer: number | undefined;
let homeReceivingTimer: number | undefined;
let homeHeadlineTimer: number | undefined;
let homeHeadlineCursorTimer: number | undefined;
let homeHeadlineHasRun = false;

interface TransmissionView {
  text: string;
  time: string;
  category?: string;
}

const HOME_STREAM_LIMIT = 4;
const HOME_HEADLINE_LINES = ["SAY WHAT YOU", "CAN'T SAY", "PUBLICLY."] as const;
let homeStreamItems: TransmissionView[] = MOCK_CONFESSIONS.slice(0, HOME_STREAM_LIMIT)
  .reverse()
  .map((confession) => ({
    text: confession.text,
    time: confession.time,
    category: confession.category,
  }));
let homeStreamCursor = 0;

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

function formatTransmissionTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(date);
}

function transmissionViewFromConfession(confession: MockConfession): TransmissionView {
  return {
    text: confession.text,
    time: confession.time,
    category: confession.category,
  };
}

function renderTransmissionRow(
  transmission: TransmissionView,
  options: { href?: string; incoming?: boolean } = {},
): string {
  const className = options.incoming ? " transmission-row--incoming motion-transmission-arrival" : "";
  const category = transmission.category
    ? `<span class="transmission-row__category">${escapeHtml(transmission.category)}</span>`
    : "";
  const action = options.href
    ? `<a class="transmission-row__view" href="${escapeHtml(options.href)}">VIEW <span aria-hidden="true">→</span></a>`
    : "";

  return `<article class="transmission-row${className}">
    <div class="transmission-row__meta">
      <span>ANONYMOUS MESSAGE</span>
      <time>${escapeHtml(formatTransmissionTime(transmission.time))}</time>
    </div>
    <p class="transmission-row__thought">“${escapeHtml(transmission.text)}”</p>
    <footer class="transmission-row__footer">
      ${category}
      ${action}
    </footer>
  </article>`;
}

function renderHomeTransmissionRows(): string {
  return homeStreamItems
    .map((transmission, index) => renderTransmissionRow(transmission, { incoming: index === homeStreamItems.length - 1 }))
    .join("");
}

function renderHomeRoomCards(): string {
  const cards: TransmissionView[] = [
    ...MOCK_CONFESSIONS.slice(0, 7).map(transmissionViewFromConfession),
    ...MOCK_INCOMING_TRANSMISSIONS.slice(0, 5).map((transmission) => ({
      text: transmission.text,
      time: transmission.time,
      category: "INCOMING",
    })),
  ];
  const positions = [
    ["5%", "19%", "-8deg", "0.8", "-1s", "17s"],
    ["80%", "14%", "7deg", "0.76", "-7s", "21s"],
    ["11%", "48%", "5deg", "0.7", "-11s", "19s"],
    ["82%", "45%", "-6deg", "0.72", "-4s", "23s"],
    ["2%", "73%", "-4deg", "0.67", "-15s", "20s"],
    ["78%", "73%", "8deg", "0.7", "-8s", "18s"],
    ["29%", "13%", "-3deg", "0.62", "-2s", "24s"],
    ["63%", "8%", "4deg", "0.58", "-17s", "22s"],
    ["30%", "76%", "6deg", "0.58", "-10s", "26s"],
    ["61%", "77%", "-5deg", "0.62", "-20s", "19s"],
    ["15%", "4%", "-7deg", "0.5", "-13s", "27s"],
    ["87%", "27%", "5deg", "0.5", "-18s", "25s"],
  ] as const;

  return cards
    .map((transmission, index) => {
      const [left, top, rotation, scale, delay, duration] = positions[index % positions.length];
      const category = transmission.category ?? "ROOM";

      return `<article class="home-room-card" style="--card-left:${left};--card-top:${top};--card-rotation:${rotation};--card-scale:${scale};--card-delay:${delay};--card-duration:${duration};">
        <span class="home-room-card__meta">ANONYMOUS / ${escapeHtml(category)}</span>
        <p>“${escapeHtml(transmission.text)}”</p>
        <footer><span>PRIVATE ROOM</span><time>${escapeHtml(formatTransmissionTime(transmission.time))}</time></footer>
      </article>`;
    })
    .join("");
}

function renderPreviewTransmission(): string {
  return renderTransmissionRow({
    text: mockFlow.thought,
    time: "NOW",
    category: mockFlow.category,
  });
}

function setHomeReceivingStatus(root: ParentNode, state: "ambient" | "receiving" | "static"): void {
  const status = root.querySelector<HTMLElement>("[data-home-receiving]");
  const label = status?.querySelector<HTMLElement>(".ui-status-indicator > span:last-child");
  if (!status || !label) {
    return;
  }

  status.dataset.state = state;
  label.textContent =
    state === "receiving"
      ? "RECEIVING... / SIMULATED"
      : state === "static"
        ? "STATIC / REDUCED MOTION"
        : "LOCAL MOCK / AMBIENT";
}

function stopHomeStream(): void {
  if (homeStreamTimer !== undefined) {
    window.clearInterval(homeStreamTimer);
    homeStreamTimer = undefined;
  }

  if (homeReceivingTimer !== undefined) {
    window.clearTimeout(homeReceivingTimer);
    homeReceivingTimer = undefined;
  }
}

function receiveHomeTransmission(root: ParentNode): void {
  if (normalizePath(window.location.pathname) !== "/") {
    stopHomeStream();
    return;
  }

  const transmission: MockIncomingTransmission =
    MOCK_INCOMING_TRANSMISSIONS[homeStreamCursor % MOCK_INCOMING_TRANSMISSIONS.length];
  homeStreamCursor = (homeStreamCursor + 1) % MOCK_INCOMING_TRANSMISSIONS.length;
  homeStreamItems = [
    ...homeStreamItems.slice(-(HOME_STREAM_LIMIT - 1)),
    { text: transmission.text, time: transmission.time },
  ];

  const list = root.querySelector<HTMLElement>("#home-transmission-list");
  if (!list) {
    return;
  }

  list.innerHTML = renderHomeTransmissionRows();
  setHomeReceivingStatus(root, "receiving");

  if (homeReceivingTimer !== undefined) {
    window.clearTimeout(homeReceivingTimer);
  }

  homeReceivingTimer = window.setTimeout(() => {
    setHomeReceivingStatus(root, "ambient");
    homeReceivingTimer = undefined;
  }, 1600);
}

function startHomeStream(root: ParentNode): void {
  stopHomeStream();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setHomeReceivingStatus(root, "static");
    return;
  }

  setHomeReceivingStatus(root, "ambient");
  homeStreamTimer = window.setInterval(() => receiveHomeTransmission(root), 6500);
}

function clearHomeHeadlineTimers(): void {
  if (homeHeadlineTimer !== undefined) {
    window.clearInterval(homeHeadlineTimer);
    homeHeadlineTimer = undefined;
  }

  if (homeHeadlineCursorTimer !== undefined) {
    window.clearTimeout(homeHeadlineCursorTimer);
    homeHeadlineCursorTimer = undefined;
  }
}

function renderFullHomeHeadline(root: ParentNode): void {
  const lines = root.querySelectorAll<HTMLElement>("[data-home-headline-line]");
  const cursor = root.querySelector<HTMLElement>("[data-home-headline-cursor]");
  if (lines.length !== HOME_HEADLINE_LINES.length || !cursor) {
    return;
  }

  lines.forEach((line, index) => {
    line.textContent = HOME_HEADLINE_LINES[index];
  });
  lines[lines.length - 1].append(cursor);
  cursor.dataset.state = "hidden";
}

function renderHomeHeadlineProgress(root: ParentNode, characterCount: number): void {
  const lines = [...root.querySelectorAll<HTMLElement>("[data-home-headline-line]")];
  const cursor = root.querySelector<HTMLElement>("[data-home-headline-cursor]");
  if (lines.length !== HOME_HEADLINE_LINES.length || !cursor) {
    return;
  }

  let remaining = characterCount;
  let activeLine = lines[0];

  lines.forEach((line, index) => {
    const lineText = HOME_HEADLINE_LINES[index];
    const visibleCharacters = Math.max(0, Math.min(lineText.length, remaining));
    line.textContent = lineText.slice(0, visibleCharacters);
    remaining -= lineText.length;
    if (visibleCharacters < lineText.length || index === lines.length - 1) {
      activeLine = line;
    }
  });

  activeLine.append(cursor);
  cursor.dataset.state = "typing";
}

function startHomeHeadline(root: ParentNode): void {
  if (homeHeadlineHasRun) {
    renderFullHomeHeadline(root);
    return;
  }

  homeHeadlineHasRun = true;
  clearHomeHeadlineTimers();

  const cursor = root.querySelector<HTMLElement>("[data-home-headline-cursor]");
  const composer = root.querySelector<HTMLElement>(".home-composer");
  if (!cursor) {
    renderFullHomeHeadline(root);
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    renderFullHomeHeadline(root);
    return;
  }

  const totalCharacters = HOME_HEADLINE_LINES.reduce((total, line) => total + line.length, 0);
  const characterDelay = 42;
  let characterCount = 0;
  renderHomeHeadlineProgress(root, characterCount);
  if (composer) {
    composer.dataset.headlineState = "typing";
  }

  homeHeadlineTimer = window.setInterval(() => {
    characterCount += 1;
    renderHomeHeadlineProgress(root, characterCount);

    if (characterCount >= totalCharacters) {
      clearHomeHeadlineTimers();
      cursor.dataset.state = "settling";
      homeHeadlineCursorTimer = window.setTimeout(() => {
        cursor.dataset.state = "hidden";
        if (composer) {
          composer.dataset.headlineState = "ready";
        }
        homeHeadlineCursorTimer = undefined;
      }, 460);
    }
  }, characterDelay);
}

function stopHomeHeadline(): void {
  clearHomeHeadlineTimers();
  homeHeadlineHasRun = false;
}

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
    { label: "EXPLORE", href: "/explore" },
    { label: "HOW IT WORKS", href: "/how-it-works" },
    { label: "MANIFESTO", href: "/manifesto" },
  ].map((link) => ({ ...link, current: normalizePath(path) === link.href }));

  return NavigationShell({
    descriptor: "ANONYMOUS INTERNET NOIR",
    status: normalizePath(path) === "/" ? "PRIVATE ROOM" : "BUILT ON ZCASH",
    links,
  });
}

function publicWindowTitle(path: string): string {
  const normalizedPath = normalizePath(path);
  if (normalizedPath.startsWith("/c/")) {
    return "THREAD_ROOM";
  }

  if (normalizedPath === "/") {
    return "PRIVATE_ROOM";
  }

  return normalizedPath.slice(1).replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

function publicWindowChrome(path: string): string {
  return `<div class="public-page__window-chrome" aria-hidden="true">
    <div class="public-page__window-bar">
      <div class="public-page__window-controls">
        <span class="public-page__window-control public-page__window-control--close"></span>
        <span class="public-page__window-control public-page__window-control--minimize"></span>
        <span class="public-page__window-control public-page__window-control--maximize"></span>
      </div>
      <span class="public-page__window-title">HIDN://${publicWindowTitle(path)}</span>
      <span class="public-page__window-meta">TTY 01 // LOCAL</span>
    </div>
  </div>`;
}

function publicFrame(path: string, main: string, pageClass = ""): string {
  const isHome = normalizePath(path) === "/";

  return `<div class="public-page ${pageClass} fx-grain fx-vignette">
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${isHome ? "" : publicWindowChrome(path)}
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
      return { label: "PREPARING PRIVATE CHECK...", copy: "Setting up the local demo sequence." };
    case "generating":
      return { label: "GENERATING PROOF...", copy: "Simulating a short proof handoff." };
    case "verifying":
      return { label: "VERIFYING...", copy: "Checking the mock result locally." };
    case "verified":
      return { label: "✓ VERIFIED / MOCK", copy: "The visual sequence is complete. No cryptographic proof was created." };
    default:
      return { label: "READY TO BEGIN", copy: "A short local demonstration of the future flow." };
  }
}

function renderProofStep(): string {
  const stateCopy = proofStateCopy(mockFlow.proofState);

  return `<section class="flow-panel flow-proof" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("HIDN / PRIVATE CHANNEL")}
      ${StatusIndicator("MOCK / LOCAL ONLY", "warning")}
    </div>
    <h1 id="flow-title" class="type-display-lg">PRIVATE CHECK</h1>
    <p class="flow-panel__lead">Proving you can participate without revealing who you are.</p>
    <div class="flow-status" role="status" aria-live="polite">
      <span class="flow-status__line">${escapeHtml(stateCopy.label)}</span>
      <span class="flow-status__copy">${escapeHtml(stateCopy.copy)}</span>
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
    <p class="flow-mock-note">SIMULATED / NO CRYPTOGRAPHIC PROOF CREATED.</p>
  </section>`;
}

function renderConfessStep(): string {
  return `<section class="flow-panel flow-confess" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("HIDN / PRIVATE CHANNEL")}
      ${PrivacyBadge("NO ACCOUNT")}
    </div>
    <h1 id="flow-title" class="type-display-lg">WRITE THE THOUGHT</h1>
    <p class="flow-panel__lead">No name. No profile. Just the message.</p>
    ${mockFlow.error ? AlertMessage("MESSAGE NEEDED", mockFlow.error, "danger") : ""}
    <form class="flow-form" id="confession-form" novalidate>
      ${TextArea({
        id: "confession-thought",
        label: "Message",
        value: mockFlow.thought,
        placeholder: "What's on your mind?",
        hint: "This local demo keeps the draft in memory only.",
        rows: 8,
        required: true,
      })}
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
        <p class="flow-form__reassurance">NO ACCOUNT · NO USERNAME · NO HISTORY</p>
        ${PrimaryButton({ label: "CONTINUE →", dataAction: "confess-continue" })}
      </div>
    </form>
  </section>`;
}

function renderPreviewStep(): string {
  return `<section class="flow-panel flow-preview" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("HIDN / PRIVATE CHANNEL")}
      ${PrivacyBadge("IDENTITYLESS")}
    </div>
    <h1 id="flow-title" class="type-display-lg">PREVIEW THE MESSAGE</h1>
    <p class="flow-panel__lead">This is exactly how it will appear. No identity. No history.</p>
    <div class="flow-preview__message">
      ${renderPreviewTransmission()}
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
    <div class="flow-success__copy">
      ${TerminalLabel("TRANSMISSION COMPLETE")}
      ${StatusIndicator("LOCAL MOCK / RECEIVED", "warning")}
      <h1 id="flow-title" class="type-display-lg">CONFESSION POSTED</h1>
      <p class="flow-panel__lead">The message stays. You don't.</p>
      <p class="flow-success__note">This demo keeps the new confession in memory for this browser session only. No identity, account, or history was created.</p>
      <div class="flow-actions">
        ${actionLink("VIEW →", confessionId ? `/c/${confessionId}` : "/explore", "primary")}
        ${GhostButton({ label: "LEAVE →", dataAction: "leave-hidn" })}
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
          <p>PRIVATE CHANNEL / LOCAL MOCK</p>
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

function renderTransmissionRows(tab: FeedTab): string {
  const confessions = feedForTab(tab);
  if (!confessions.length) {
    return EmptyState("NO TRANSMISSIONS", "Nothing is visible here yet.");
  }

  return confessions
    .map((confession) => renderTransmissionRow(transmissionViewFromConfession(confession), { href: `/c/${confession.id}` }))
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
  return publicFrame(
    "/explore",
    `<main id="main-content" class="public-main explore-main">
      <div class="hidn-container--wide explore-page">
        <header class="explore-header">
          ${TerminalLabel("PRIVATE MESSAGE SPACE / MOCK")}
          <h1 class="type-display-lg">ANONYMOUS TRANSMISSIONS</h1>
          <p>The message is public. The person stays out of frame.</p>
        </header>
        <div class="explore-layout">
          <section class="explore-feed" aria-labelledby="explore-feed-title">
            <div class="explore-feed__heading">
              <div>
                ${TerminalLabel("ANONYMOUS TRANSMISSIONS")}
                <h2 id="explore-feed-title" class="type-heading-2">A room without names.</h2>
              </div>
              ${StatusIndicator("SIMULATED / LOCAL ONLY", "warning")}
            </div>
            ${renderExploreTabs()}
            <div class="explore-feed__list" id="explore-feed-list" aria-live="polite">${renderTransmissionRows(activeFeedTab)}</div>
          </section>
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
        <section class="home-room-stage" aria-labelledby="home-room-title">
          <div class="home-room-stars" aria-hidden="true"></div>
          <div class="home-room-noise" aria-hidden="true"></div>
          <div class="home-room-window" aria-hidden="true">
            <div class="home-room-window__bar">
              <div class="home-room-window__controls">
                <span class="home-room-window__control home-room-window__control--close"></span>
                <span class="home-room-window__control home-room-window__control--minimize"></span>
                <span class="home-room-window__control home-room-window__control--maximize"></span>
              </div>
              <span class="home-room-window__title">HIDN://PRIVATE_ROOM</span>
              <span class="home-room-window__meta">TTY 01 // LOCAL</span>
            </div>
          </div>
          <div class="home-room-card-field" aria-hidden="true">
            ${renderHomeRoomCards()}
          </div>
          <div class="home-room-core">
            <p class="home-room-core__eyebrow">${TerminalLabel("HIDN / PRIVATE ROOM")}</p>
            <h1 id="home-room-title">A ROOM<br />WITHOUT <em>NAMES.</em></h1>
            <p class="home-room-core__copy">A room for anonymous thoughts and unnamed conversations.</p>
            <a class="ui-button ui-button--primary home-room-enter" href="/explore" data-glitch-text="> ENTER ROOM" aria-label="ENTER ROOM">
              <span class="home-room-enter__prompt" aria-hidden="true">&gt;</span><span>ENTER ROOM</span><span class="home-room-enter__cursor" aria-hidden="true">_</span>
            </a>
            <p class="home-room-core__status">LOCAL MOCK ROOM / NO LIVE USERS</p>
          </div>
          <p class="home-room-corner home-room-corner--left" aria-hidden="true">OPEN CHANNEL / 01</p>
          <p class="home-room-corner home-room-corner--right" aria-hidden="true">NO NAMES / NO TRACE</p>
        </section>
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

function startHomeConfession(root: ParentNode): void {
  const textarea = root.querySelector<HTMLTextAreaElement>("#home-confession-thought");
  const error = root.querySelector<HTMLElement>("[data-home-error]");
  const thought = textarea?.value.trim() ?? "";

  if (!thought) {
    if (error) {
      error.hidden = false;
      error.textContent = "Write a thought before transmitting.";
    }
    textarea?.focus();
    return;
  }

  mockFlow.thought = thought;
  mockFlow.error = "";
  mockFlow.step = "prove";
  mockFlow.proofState = "idle";
  mockFlow.createdId = undefined;
  navigateProductRoute("/confess");
}

function renderExploreFeed(root: ParentNode, tab: FeedTab): void {
  const list = root.querySelector<HTMLElement>("#explore-feed-list");
  if (!list) {
    return;
  }

  list.innerHTML = renderTransmissionRows(tab);
  root.querySelectorAll<HTMLButtonElement>("[data-feed-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.feedTab === tab));
  });
  bindComponentInteractions(list);
}

export function bindProductRoute(root: ParentNode = document): void {
  bindComponentInteractions(root);

  if (normalizePath(window.location.pathname) === "/") {
  } else {
    stopHomeStream();
    stopHomeHeadline();
  }

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
