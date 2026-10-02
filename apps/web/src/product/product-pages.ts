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
  StatusIndicator,
  SystemMessage,
  TerminalLabel,
  TransmissionDivider,
  bindComponentInteractions,
  escapeHtml,
} from "@hidn/ui";
import {
  EXPLORE_METADATA,
  HOME_METADATA,
  ROOM_METADATA,
  type HidnMetadata,
} from "../metadata";
import {
  getMockConfession,
  isMockCategory,
  MOCK_INCOMING_TRANSMISSIONS,
  MOCK_CONFESSIONS,
  type MockCategory,
  type MockConfession,
  type MockIncomingTransmission,
} from "./mock-data";
import { fetchCipherScanMainnetTip } from "./cipherscan";
import {
  buildZkChallengeMessage,
  credentialFromRecoveryCode,
  createZkProof,
  generateZkCredential,
  publicKeyToHex,
} from "@hidn/zk";
import {
  createRoomPost,
  createPaymentIntent,
  createRoomSession,
  fetchRoomPosts,
  fetchAdminReports,
  fetchModerationVisibility,
  fetchPaymentIntent,
  fetchRoomConfig,
  loginAccount,
  loginRoomSession,
  logoutAccount,
  moderateAdminContent,
  requestZkChallenge,
  signupZkAccount,
  submitReport,
  updateAdminReport,
  verifyZkLogin,
  verifyRoomDemoPayment,
  type AdminReportsResponse,
  type AccountAccessLevel,
  type AccountResponse,
  type ModerationTargetType,
  type PaymentIntentResponse,
  type RoomPost,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from "./room-api";

export interface RenderedProductRoute {
  html: string;
  metadata: HidnMetadata;
}

type FeedTab = "latest" | "random" | "felt";
type RoomChannel = "general" | "love" | "privacy" | "politics" | "family" | "work";
type RoomAccessMode = "choose" | "create" | "login" | "ready";
type RoomEntryTransitionKind = "first" | "return";
type ShareCardType = "THREAD" | "REPLY" | "TEXT" | "BATCH";

let activeFeedTab: FeedTab = "latest";
let roomAccessMode: RoomAccessMode = "choose";
let roomDemoId = "";
let roomDemoMemo = "";
let roomLoginError = "";
let roomZecAmount = "CALCULATING...";
let roomZecRateStatus = "";
let roomBackendStatus: "local" | "connecting" | "connected" | "offline" = "local";
let roomBackendId = "";
let roomAccountUsername = "";
let roomAccountAccessLevel: AccountAccessLevel = "read_only";
let roomAccountRecoveryCode = "";
let roomPaymentIntentId = "";
let roomPayment: PaymentIntentResponse | undefined;
let roomVerificationRequested = false;
let activeRoomChannel: RoomChannel = "general";
let roomProfileOpen = false;
let roomChannelNotice = "";
let roomPostComposerOpen = false;
let roomPostText = "";
let roomPostError = "";
let roomPostSubmitting = false;
let roomPosts: RoomPost[] = [];
let roomPostsLoadedChannel: RoomChannel | undefined;
let roomPostsRequest: Promise<void> | undefined;
let activeReportTarget: ReportTarget | undefined;
let roomReportReason: ReportReason = "spam";
let roomReportDetails = "";
let roomReportFeedback = "";
let roomReportNotice = "";
let roomReportSubmitting = false;
let adminReportToken = "";
let adminReports: AdminReportsResponse | undefined;
let adminReportFilter: ReportStatus | "all" = "all";
let adminReportError = "";
let adminReportLoading = false;
let hiddenModerationTargets = new Set<string>();
let moderationVisibilityRequest: Promise<void> | undefined;
let moderationVisibilityReady = false;
let homeStreamTimer: number | undefined;
let homeReceivingTimer: number | undefined;
let homeInviteTimer: number | undefined;
let homeHeadlineTimer: number | undefined;
let homeHeadlineCursorTimer: number | undefined;
let homeHeadlineHasRun = false;
let visitorClockTimer: number | undefined;
let roomEntryTimer: number | undefined;
let roomEntryTransitionActive = false;
let roomEntryTransitionKind: RoomEntryTransitionKind = "first";
let activeTextSelection: SelectedTextItem | undefined;
let selectedTextBatch: SelectedTextItem[] = [];
let textSelectionInteractionsBound = false;
let textSelectionRoot: ParentNode | undefined;

interface AnonymousReply {
  text: string;
  time: string;
}

interface TransmissionView {
  id?: string;
  reference?: string;
  text: string;
  time: string;
  category?: string;
  reactions?: number;
}

interface SelectedTextItem {
  text: string;
  id: string;
  label: string;
  kind: "thread" | "reply" | "text";
  category: string;
  time: string;
}

interface ReportTarget {
  targetType: ReportTargetType;
  targetId: string;
  targetExcerpt: string;
  label: string;
}

const roomChannelOptions: Array<{
  key: RoomChannel;
  label: string;
  description: string;
  categories?: MockCategory[];
}> = [
  { key: "general", label: "GENERAL", description: "all signals" },
  { key: "love", label: "LOVE", description: "what stays unsaid", categories: ["RELATIONSHIPS", "JOY"] },
  { key: "privacy", label: "PRIVACY", description: "the hidden layer", categories: ["IDENTITY", "LONELINESS"] },
  { key: "politics", label: "POLITICS", description: "power / public life", categories: ["UNCERTAINTY", "MONEY"] },
  { key: "family", label: "FAMILY", description: "the rooms we inherit", categories: ["FAMILY", "RELATIONSHIPS"] },
  { key: "work", label: "WORK", description: "survival / ambition", categories: ["CAREER", "AMBITION", "MONEY"] },
];

interface HomeAmbientAudioSession {
  audio: HTMLAudioElement;
  graph: HomeAudioGraph;
  resumeAudio: () => void;
  gestureHandler: (event: PointerEvent) => void;
}

interface HomeAudioGraph {
  context: AudioContext;
  stringSource: AudioBufferSourceNode;
  oscillators: OscillatorNode[];
}

const HOME_STREAM_LIMIT = 4;
const HOME_AUDIO_SRC = "/audio/hidn-recording-source.m4a";
const HOME_AUDIO_SOURCE_VOLUME = 0.55;
const HOME_AUDIO_MASTER_GAIN = 0.036;
const HOME_AUDIO_TEMPO = 54;
const HOME_AUDIO_BEATS_PER_LOOP = 16;
const HOME_AUDIO_PREFERENCE_KEY = "hidn:audio:enabled";
const HOME_HEADLINE_LINES = ["SAY WHAT YOU", "CAN'T SAY", "PUBLICLY."] as const;
const ROOM_HANDLE_PATTERN = /^HIDN-[A-Z0-9]{1,20}$/i;
const CIPHERSCAN_CACHE_DURATION_MS = 60_000;
const MODERATION_GATE_MIN_DURATION_MS = 800;

function completeRoomHandle(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized.startsWith("HIDN-") ? normalized : `HIDN-${normalized}`;
}
let homeStreamItems: TransmissionView[] = MOCK_CONFESSIONS.slice(0, HOME_STREAM_LIMIT)
  .reverse()
  .map((confession) => ({
    text: confession.text,
    time: confession.time,
    category: confession.category,
  }));
let homeStreamCursor = 0;
let homeAmbientAudioSession: HomeAmbientAudioSession | undefined;
let cachedCipherScanHeight: number | undefined;
let cachedCipherScanAt = 0;
let cipherScanRequest: Promise<number> | undefined;
let roomActivityTimer: number | undefined;
let roomActivityIndex = 0;

const ROOM_ACCESS_ACTIVITY = [
  { actor: "ANONYMOUS / SIGNAL 0417", action: "JUST POSTED", subject: "A THOUGHT" },
  { actor: "ANONYMOUS / SIGNAL 0418", action: "JUST COMMENTED", subject: "ON A THREAD" },
  { actor: "ANONYMOUS / SIGNAL 0419", action: "JUST CREATED", subject: "A ROOM" },
  { actor: "ANONYMOUS / SIGNAL 0420", action: "JUST LIKED", subject: "A POST" },
  { actor: "ANONYMOUS / SIGNAL 0421", action: "JUST CREATED", subject: "A THREAD" },
  { actor: "ANONYMOUS / SIGNAL 0422", action: "JUST CROSSED", subject: "THE THRESHOLD" },
  { actor: "ANONYMOUS / SIGNAL 0423", action: "JUST RETURNED", subject: "TO THE ROOM" },
  { actor: "ANONYMOUS / SIGNAL 0424", action: "JUST OPENED", subject: "A ROOM KEY" },
] as const;
const roomThreadReplies = new Map<string, AnonymousReply[]>([
  [
    "00417",
    [
      { text: "You can miss an old version of yourself without wanting to go back.", time: "8 MIN AGO" },
      { text: "The room understands this one.", time: "4 MIN AGO" },
    ],
  ],
  [
    "00416",
    [{ text: "Choosing slowly is still choosing. You do not owe the room a performance.", time: "11 MIN AGO" }],
  ],
]);
const roomLikeCounts = new Map<string, number>();
const roomLikedIds = new Set<string>();

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
    id: confession.id,
    reference: confession.reference,
    text: confession.text,
    time: confession.time,
    category: confession.category,
    reactions: confession.reactions,
  };
}

function transmissionViewFromRoomPost(post: RoomPost): TransmissionView {
  return {
    id: post.id,
    reference: post.reference,
    text: post.text,
    time: post.time,
    category: post.category,
    reactions: post.reactions,
  };
}

function repliesForThread(id: string): AnonymousReply[] {
  const replies = roomThreadReplies.get(id);
  if (replies) {
    return replies;
  }

  const emptyReplies: AnonymousReply[] = [];
  roomThreadReplies.set(id, emptyReplies);
  return emptyReplies;
}

function moderationTargetKey(targetType: ModerationTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

function isModerationHidden(targetType: ModerationTargetType, targetId: string): boolean {
  return hiddenModerationTargets.has(moderationTargetKey(targetType, targetId));
}

function isModerationSurfacePath(path: string): boolean {
  return path === "/room" || path === "/explore" || path.startsWith("/c/");
}

async function refreshModerationVisibility(): Promise<void> {
  if (moderationVisibilityRequest) {
    return moderationVisibilityRequest;
  }

  const wasReady = moderationVisibilityReady;
  const startedAt = Date.now();
  const holdGateOpen = async (): Promise<void> => {
    const remaining = MODERATION_GATE_MIN_DURATION_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
    }
  };
  moderationVisibilityRequest = fetchModerationVisibility()
    .then(async (response) => {
      await holdGateOpen();
      const nextTargets = new Set(
        response.hiddenTargets
          .filter((target) => (target.targetType === "thread" || target.targetType === "reply") && Boolean(target.targetId))
          .map((target) => moderationTargetKey(target.targetType, target.targetId)),
      );
      const previousKeys = Array.from(hiddenModerationTargets).sort().join("|");
      const nextKeys = Array.from(nextTargets).sort().join("|");
      hiddenModerationTargets = nextTargets;
      moderationVisibilityReady = true;
      if ((!wasReady || previousKeys !== nextKeys) && isModerationSurfacePath(normalizePath(window.location.pathname))) {
        rerenderProductRoute();
      }
    })
    .catch(async () => {
      await holdGateOpen();
      // The demo remains usable when the optional moderation visibility endpoint is unavailable.
      moderationVisibilityReady = true;
      if (!wasReady && isModerationSurfacePath(normalizePath(window.location.pathname))) {
        rerenderProductRoute();
      }
    })
    .finally(() => {
      moderationVisibilityRequest = undefined;
    });

  return moderationVisibilityRequest;
}

function reactionCountForThread(id: string, fallback = 0): number {
  return roomLikeCounts.get(id) ?? fallback;
}

const REPORT_REASON_OPTIONS: Array<{ value: ReportReason; label: string }> = [
  { value: "spam", label: "Spam or flooding" },
  { value: "harassment", label: "Harassment" },
  { value: "threats", label: "Threats or violence" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "personal_data", label: "Private information" },
  { value: "self_harm", label: "Self-harm concern" },
  { value: "other", label: "Other" },
];

function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? "Other";
}

function renderReportDialog(): string {
  if (!activeReportTarget) {
    return "";
  }

  return `<section class="hidn-report-dialog" role="dialog" aria-modal="true" aria-labelledby="hidn-report-title">
    <button class="hidn-report-dialog__backdrop" type="button" data-action="report-close" aria-label="Close report dialog"></button>
    <form class="hidn-report-dialog__panel" novalidate>
      <header class="hidn-report-dialog__header">
        <div>
          ${TerminalLabel("MODERATION / PRIVATE REPORT")}
          <h2 id="hidn-report-title">REPORT THIS SURFACE.</h2>
        </div>
        <button class="hidn-report-dialog__close" type="button" data-action="report-close" aria-label="Close report dialog">×</button>
      </header>
      <p class="hidn-report-dialog__target"><span>${escapeHtml(activeReportTarget.label)}</span><br />“${escapeHtml(activeReportTarget.targetExcerpt || "NO CONTENT SNAPSHOT")}"</p>
      <label class="ui-field" for="hidn-report-reason">
        <span class="ui-field__label">REASON</span>
        <select id="hidn-report-reason">
          ${REPORT_REASON_OPTIONS.map((option) => `<option value="${option.value}"${option.value === roomReportReason ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>
      <label class="ui-field" for="hidn-report-details">
        <span class="ui-field__label">DETAILS / OPTIONAL</span>
        <textarea id="hidn-report-details" rows="4" maxlength="2000" placeholder="Add context for the moderator...">${escapeHtml(roomReportDetails)}</textarea>
      </label>
      <p class="hidn-report-dialog__note">Your report is tied to your pseudonymous HIDN account for abuse prevention. It is not displayed publicly.</p>
      ${roomReportFeedback ? `<p class="hidn-report-dialog__feedback" role="status">${escapeHtml(roomReportFeedback)}</p>` : ""}
      <div class="hidn-report-dialog__actions">
        ${GhostButton({ label: "CANCEL", dataAction: "report-close" })}
        ${PrimaryButton({ label: roomReportSubmitting ? "SENDING..." : "SEND REPORT →", disabled: roomReportSubmitting, dataAction: "report-submit" })}
      </div>
    </form>
  </section>`;
}

function renderTransmissionRow(
  transmission: TransmissionView,
  options: { href?: string; incoming?: boolean } = {},
): string {
  const className = options.incoming ? " transmission-row--incoming motion-transmission-arrival" : "";
  const category = transmission.category
    ? `<span class="transmission-row__category">${escapeHtml(transmission.category)}</span>`
    : "";
  const threadId = transmission.id;
  const shareTextAttributes = threadId
    ? `data-share-text data-share-id="${escapeHtml(threadId)}" data-share-kind="thread" data-share-label="${escapeHtml(transmission.reference ?? "ANONYMOUS THREAD")}" data-share-category="${escapeHtml(transmission.category ?? "IDENTITY")}" data-share-time="${escapeHtml(transmission.time)}"`
    : "";
  const action = options.href && threadId
    ? `<div class="transmission-row__actions">
        <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(threadId)}" aria-pressed="${roomLikedIds.has(threadId)}"${hasFullRoomAccess() ? "" : " disabled"}>♡ ${reactionCountForThread(threadId, transmission.reactions)}</button>
        <a class="room-message__action" href="${escapeHtml(options.href)}">COMMENTS ${repliesForThread(threadId).length}</a>
        <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(threadId)}">SAVE IMAGE</button>
        <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(threadId)}">SHARE IMAGE</button>
        <a class="transmission-row__view" href="${escapeHtml(options.href)}">OPEN <span aria-hidden="true">→</span></a>
        <span class="thread-share-status" data-share-status="${escapeHtml(threadId)}" role="status" aria-live="polite"></span>
      </div>`
    : options.href
      ? `<a class="transmission-row__view" href="${escapeHtml(options.href)}">OPEN <span aria-hidden="true">→</span></a>`
      : "";

  return `<article class="transmission-row${className}">
    <div class="transmission-row__meta">
      <span>${escapeHtml(transmission.reference ?? "ANONYMOUS MESSAGE")}</span>
      <time>${escapeHtml(formatTransmissionTime(transmission.time))}</time>
    </div>
    <p class="transmission-row__thought" ${shareTextAttributes}>“${escapeHtml(transmission.text)}”</p>
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

function renderHomeRoomCards(limit?: number): string {
  const cards: TransmissionView[] = [
    ...MOCK_CONFESSIONS.slice(0, 7).map(transmissionViewFromConfession),
    ...MOCK_INCOMING_TRANSMISSIONS.slice(0, 5).map((transmission) => ({
      text: transmission.text,
      time: transmission.time,
      category: "INCOMING",
    })),
  ];
  const positions = [
    ["5%", "19%", "-8deg", "0.8", "-1s", "17s", "-0.85rem"],
    ["80%", "14%", "7deg", "0.76", "-7s", "21s", "0.85rem"],
    ["11%", "48%", "5deg", "0.7", "-11s", "19s", "-0.65rem"],
    ["82%", "45%", "-6deg", "0.72", "-4s", "23s", "0.7rem"],
    ["2%", "73%", "-4deg", "0.67", "-15s", "20s", "-0.5rem"],
    ["78%", "73%", "8deg", "0.7", "-8s", "18s", "0.65rem"],
    ["29%", "13%", "-3deg", "0.62", "-2s", "24s", "-0.35rem"],
    ["63%", "8%", "4deg", "0.58", "-17s", "22s", "0.4rem"],
    ["30%", "76%", "6deg", "0.58", "-10s", "26s", "-0.5rem"],
    ["61%", "77%", "-5deg", "0.62", "-20s", "19s", "0.6rem"],
    ["15%", "4%", "-7deg", "0.5", "-13s", "27s", "-0.25rem"],
    ["87%", "27%", "5deg", "0.5", "-18s", "25s", "0.35rem"],
  ] as const;

  return cards.slice(0, limit ?? cards.length)
    .map((transmission, index) => {
      const [left, top, rotation, scale, delay, duration, driftX] = positions[index % positions.length];
      const category = transmission.category ?? "ROOM";

      return `<article class="home-room-card" style="--card-left:${left};--card-top:${top};--card-rotation:${rotation};--card-scale:${scale};--card-delay:${delay};--card-duration:${duration};--card-drift-x:${driftX};">
        <span class="home-room-card__meta">ANONYMOUS / ${escapeHtml(category)}</span>
        <p>“${escapeHtml(transmission.text)}”</p>
        <footer><span>PRIVATE ROOM</span><time>${escapeHtml(formatTransmissionTime(transmission.time))}</time></footer>
      </article>`;
    })
    .join("");
}

function renderPointerSpotlight(): string {
  return `<div class="hidn-pointer-spotlight" aria-hidden="true"></div>`;
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

function getCipherScanMainnetTip(): Promise<number> {
  if (cachedCipherScanHeight !== undefined && Date.now() - cachedCipherScanAt < CIPHERSCAN_CACHE_DURATION_MS) {
    return Promise.resolve(cachedCipherScanHeight);
  }

  if (!cipherScanRequest) {
    cipherScanRequest = fetchCipherScanMainnetTip()
      .then((height) => {
        cachedCipherScanHeight = height;
        cachedCipherScanAt = Date.now();
        return height;
      })
      .finally(() => {
        cipherScanRequest = undefined;
      });
  }

  return cipherScanRequest;
}

async function refreshZcashNetworkStatus(root: ParentNode): Promise<void> {
  const statuses = Array.from(root.querySelectorAll<HTMLElement>(".ui-nav-shell__status, [data-zcash-status]")).filter(
    (status) => status.textContent?.trim() === "BUILT ON ZCASH",
  );
  if (!statuses.length) {
    return;
  }

  statuses.forEach((status) => {
    status.setAttribute("aria-live", "polite");
    status.title = "Checking the current Zcash mainnet block with CipherScan.";
  });

  try {
    const height = await getCipherScanMainnetTip();
    const formattedHeight = new Intl.NumberFormat("en-US").format(height);
    statuses.forEach((status) => {
      if (!status.isConnected) {
        return;
      }

      status.textContent = `BUILT ON ZCASH / BLOCK #${formattedHeight}`;
      status.dataset.zcashState = "live";
      status.title = `Zcash mainnet block #${formattedHeight} from CipherScan.`;
    });
  } catch {
    statuses.forEach((status) => {
      if (!status.isConnected) {
        return;
      }

      status.dataset.zcashState = "unavailable";
      status.title = "CipherScan could not provide the current Zcash mainnet block.";
    });
  }
}

async function refreshRoomConfig(root: ParentNode): Promise<void> {
  const amount = root.querySelector<HTMLElement>("[data-room-zec-amount]");
  const status = root.querySelector<HTMLElement>("[data-room-rate-status]");
  if (!amount) {
    return;
  }

  amount.textContent = roomZecAmount;
  if (status) {
    status.textContent = roomZecRateStatus;
  }

  try {
    const config = await fetchRoomConfig();
    roomZecAmount = `${config.zecAmount} ZEC`;
    roomZecRateStatus = `LIVE USD/ZEC RATE / ${config.source.toUpperCase()}`;
  } catch {
    roomZecAmount = "BACKEND OFFLINE";
    roomZecRateStatus = "CONNECT CLOUDFLARE WORKER TO CALCULATE";
  }

  if (!amount.isConnected) {
    return;
  }

  amount.textContent = roomZecAmount;
  if (status) {
    status.textContent = roomZecRateStatus;
  }
}

function roomBackendStatusLabel(): string {
  switch (roomBackendStatus) {
    case "connecting":
      return "SYNCING WORKER";
    case "connected":
      return "BACKEND READY";
    case "offline":
      return "LOCAL DEMO / BACKEND OFFLINE";
    default:
      return "LOCAL DEMO";
  }
}

async function registerRoomBackend(): Promise<void> {
  try {
    const response = await createRoomSession({
      memoReference: roomDemoMemo,
      returnAddress: "",
    });
    if (!response.accessCode) {
      throw new Error("The Worker did not return an access code.");
    }

    roomDemoId = response.accessCode;
    roomBackendId = response.roomId;
    roomBackendStatus = "connected";
    roomLoginError = "";
    sessionStorage.setItem("hidn:room:secret", roomDemoId);
    sessionStorage.setItem("hidn:room:backend-id", roomBackendId);
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not issue an access code.";
  }

  if (normalizePath(window.location.pathname) === "/room/access" && roomAccessMode === "create") {
    rerenderProductRoute();
  }
}

async function verifyRoomBackend(): Promise<void> {
  if (!roomBackendId) {
    return;
  }

  try {
    const response = await verifyRoomDemoPayment(roomBackendId, roomDemoId);
    if (response.status !== "verified") {
      throw new Error("The Worker did not verify this access code.");
    }

    roomBackendStatus = "connected";
    roomLoginError = "";
    roomAccessMode = "ready";
    sessionStorage.setItem("hidn:room:verified", "true");
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not verify this access code.";
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

async function syncRoomLogin(accessCode: string): Promise<void> {
  try {
    const response = await loginRoomSession(accessCode);
    if (response.status !== "verified") {
      throw new Error("This access code is not verified yet.");
    }

    roomDemoId = accessCode.trim();
    roomBackendId = response.roomId;
    roomBackendStatus = "connected";
    roomLoginError = "";
    roomAccessMode = "ready";
    sessionStorage.setItem("hidn:room:secret", roomDemoId);
    sessionStorage.setItem("hidn:room:backend-id", roomBackendId);
    sessionStorage.setItem("hidn:room:verified", "true");
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not verify this access code.";
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
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

function stopHomeInvite(): void {
  if (homeInviteTimer !== undefined) {
    window.clearTimeout(homeInviteTimer);
    homeInviteTimer = undefined;
  }
}

function scheduleHomeInvite(root: ParentNode, delayMs: number): void {
  stopHomeInvite();

  const invite = root.querySelector<HTMLElement>("[data-home-invite]");
  if (!invite) {
    return;
  }

  homeInviteTimer = window.setTimeout(() => {
    invite.hidden = false;
    invite.dataset.state = "visible";
    homeInviteTimer = undefined;
  }, delayMs);
}

function startHomeInvite(root: ParentNode): void {
  scheduleHomeInvite(root, 20000);
}

function readHomeAudioPreference(): boolean {
  try {
    return window.localStorage.getItem(HOME_AUDIO_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

function hasHomeAudioPreference(): boolean {
  try {
    return window.localStorage.getItem(HOME_AUDIO_PREFERENCE_KEY) !== null;
  } catch {
    return false;
  }
}

function writeHomeAudioPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(HOME_AUDIO_PREFERENCE_KEY, String(enabled));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function createHomeAudioSaturationCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(2048 * Float32Array.BYTES_PER_ELEMENT)) as Float32Array<ArrayBuffer>;
  const drive = 1.35;
  const normalization = Math.tanh(drive);

  for (let index = 0; index < curve.length; index += 1) {
    const sample = (index * 2) / (curve.length - 1) - 1;
    curve[index] = Math.tanh(sample * drive) / normalization;
  }

  return curve;
}

function createHomeAudioStringBuffer(context: AudioContext): AudioBuffer {
  const beatFrames = Math.round(context.sampleRate * (60 / HOME_AUDIO_TEMPO));
  const frameCount = beatFrames * HOME_AUDIO_BEATS_PER_LOOP;
  const duration = frameCount / context.sampleRate;
  const buffer = context.createBuffer(2, frameCount, context.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const addBowedNote = (
    startBeat: number,
    lengthBeats: number,
    frequency: number,
    gain: number,
    phaseOffset: number,
  ): void => {
    const startFrame = startBeat * beatFrames;
    const length = Math.min(Math.floor(lengthBeats * beatFrames), frameCount - startFrame);
    const noteDuration = length / context.sampleRate;
    const cycles = Math.round(frequency * noteDuration);

    for (let offset = 0; offset < length; offset += 1) {
      const time = offset / context.sampleRate;
      const remaining = noteDuration - time;
      const attack = 1 - Math.exp(-time * 7);
      const release = Math.min(1, remaining * 7);
      const envelope = attack * release;
      const vibrato = Math.sin((Math.PI * 2 * time * 0.32) + phaseOffset) * 0.035;
      const phase = ((Math.PI * 2 * cycles * time) / noteDuration) + vibrato + phaseOffset;
      const bowedShape = (Math.sin(phase) * 0.58)
        + (Math.sin(phase * 2) * 0.25)
        + (Math.sin(phase * 3) * 0.1)
        + (Math.sin(phase * 4) * 0.045)
        + (Math.sin(phase * 5) * 0.02);
      const weight = bowedShape * envelope * gain;
      left[startFrame + offset] += weight * 1.02;
      right[startFrame + offset] += weight * 0.98;
    }
  };

  const padVoices = [
    { frequency: 55, gain: 0.11, phaseOffset: 0 },
    { frequency: 65.41, gain: 0.07, phaseOffset: 1.7 },
    { frequency: 77.78, gain: 0.05, phaseOffset: 3.2 },
  ];
  for (const voice of padVoices) {
    const cycles = Math.round(voice.frequency * duration);
    let phase = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = frame / context.sampleRate;
      const swell = 0.44 + (0.2 * Math.sin((Math.PI * 2 * time / duration) - Math.PI / 2));
      phase = (Math.PI * 2 * cycles * time) / duration;
      const bowedShape = (Math.sin(phase + voice.phaseOffset) * 0.62)
        + (Math.sin((phase + voice.phaseOffset) * 2) * 0.22)
        + (Math.sin((phase + voice.phaseOffset) * 3) * 0.08);
      const weight = bowedShape * swell * voice.gain;
      left[frame] += weight * 1.02;
      right[frame] += weight * 0.98;
    }
  }

  const phrase = [164.81, 146.83, 123.47, 98, 123.47, 110, 92.5, 82.41];
  phrase.forEach((frequency, index) => {
    addBowedNote(index * 2, 1.15, frequency, 0.06, index * 0.7);
    addBowedNote(index * 2 + 1, 0.58, frequency * 2, 0.016, index * 0.7 + 0.4);
  });

  return buffer;
}

function createHomeAudioGraph(audio: HTMLAudioElement): HomeAudioGraph | undefined {
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return undefined;
  }

  try {
    const context = new AudioContextConstructor();
    const mixBus = context.createGain();
    const highPass = context.createBiquadFilter();
    const warmth = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const presenceCut = context.createBiquadFilter();
    const saturation = context.createWaveShaper();
    const compressor = context.createDynamicsCompressor();
    const dryGain = context.createGain();
    const roomDelay = context.createDelay(0.8);
    const roomFeedback = context.createGain();
    const roomWetGain = context.createGain();
    const longEchoDelay = context.createDelay(1);
    const longEchoFeedback = context.createGain();
    const longEchoWetGain = context.createGain();
    const stringTone = context.createBiquadFilter();
    const sourceGain = context.createGain();
    const stringGain = context.createGain();
    const outputGain = context.createGain();
    const stringSource = context.createBufferSource();
    const wowOscillator = context.createOscillator();
    const wowDepth = context.createGain();
    const flutterOscillator = context.createOscillator();
    const flutterDepth = context.createGain();

    highPass.type = "highpass";
    highPass.frequency.value = 42;
    highPass.Q.value = 0.45;

    warmth.type = "lowshelf";
    warmth.frequency.value = 135;
    warmth.gain.value = 1.8;

    lowPass.type = "lowpass";
    lowPass.frequency.value = 2700;
    lowPass.Q.value = 0.55;

    presenceCut.type = "peaking";
    presenceCut.frequency.value = 1500;
    presenceCut.Q.value = 0.75;
    presenceCut.gain.value = -3.2;

    stringTone.type = "peaking";
    stringTone.frequency.value = 520;
    stringTone.Q.value = 0.7;
    stringTone.gain.value = 2.8;

    saturation.curve = createHomeAudioSaturationCurve();
    saturation.oversample = "2x";

    compressor.threshold.value = -26;
    compressor.knee.value = 18;
    compressor.ratio.value = 1.8;
    compressor.attack.value = 0.08;
    compressor.release.value = 0.55;

    mixBus.gain.value = 1;
    sourceGain.gain.value = 0.62;
    stringGain.gain.value = 0.32;
    dryGain.gain.value = 0.68;
    roomDelay.delayTime.value = 0.3;
    roomFeedback.gain.value = 0.16;
    roomWetGain.gain.value = 0.22;
    longEchoDelay.delayTime.value = 0.7;
    longEchoFeedback.gain.value = 0.08;
    longEchoWetGain.gain.value = 0.12;
    outputGain.gain.value = HOME_AUDIO_MASTER_GAIN;

    wowOscillator.frequency.value = 0.12;
    wowDepth.gain.value = 8;
    flutterOscillator.frequency.value = 3.7;
    flutterDepth.gain.value = 0.7;
    stringSource.buffer = createHomeAudioStringBuffer(context);
    stringSource.loop = true;

    const source = context.createMediaElementSource(audio);
    source.connect(sourceGain);
    sourceGain.connect(mixBus);
    stringSource.connect(stringTone);
    stringTone.connect(stringGain);
    stringGain.connect(mixBus);

    mixBus.connect(highPass);
    highPass.connect(warmth);
    warmth.connect(lowPass);
    lowPass.connect(presenceCut);
    presenceCut.connect(saturation);
    saturation.connect(compressor);
    compressor.connect(dryGain);
    compressor.connect(roomDelay);
    roomDelay.connect(roomFeedback);
    roomFeedback.connect(roomDelay);
    roomDelay.connect(roomWetGain);
    compressor.connect(longEchoDelay);
    longEchoDelay.connect(longEchoFeedback);
    longEchoFeedback.connect(longEchoDelay);
    longEchoDelay.connect(longEchoWetGain);
    dryGain.connect(outputGain);
    roomWetGain.connect(outputGain);
    longEchoWetGain.connect(outputGain);
    outputGain.connect(context.destination);

    wowOscillator.connect(wowDepth);
    wowDepth.connect(lowPass.detune);
    flutterOscillator.connect(flutterDepth);
    flutterDepth.connect(lowPass.detune);
    const oscillators = [wowOscillator, flutterOscillator];
    stringSource.start();
    oscillators.forEach((oscillator) => oscillator.start());

    return { context, stringSource, oscillators };
  } catch {
    return undefined;
  }
}

function setHomeAudioState(root: ParentNode, enabled: boolean): void {
  const button = root.querySelector<HTMLButtonElement>("#home-audio-toggle");
  const label = root.querySelector<HTMLElement>("[data-home-audio-label]");
  if (!button) {
    return;
  }

  button.setAttribute("aria-pressed", String(enabled));
  button.dataset.state = enabled ? "on" : "off";
  button.setAttribute("aria-label", enabled ? "Turn off analog room signal" : "Turn on analog room signal");
  if (label) {
    label.textContent = enabled ? "ON" : "OFF";
  }
}

function renderAmbientAudioToggle(): string {
  const remembered = readHomeAudioPreference();
  return `<button class="home-room-audio-toggle" id="home-audio-toggle" type="button" aria-pressed="${remembered}" data-state="${remembered ? "on" : "off"}" aria-label="${remembered ? "Turn off analog room signal" : "Turn on analog room signal"}">
    <span class="home-room-audio-toggle__label">SIGNAL</span>
    <span data-home-audio-label>${remembered ? "ON" : "OFF"}</span>
  </button>`;
}

function renderAmbientAudioControl(): string {
  return `<div class="hidn-audio-control">
    ${renderAmbientAudioToggle()}
  </div>`;
}

function setHomeAudioUnavailable(root: ParentNode): void {
  const button = root.querySelector<HTMLButtonElement>("#home-audio-toggle");
  const label = root.querySelector<HTMLElement>("[data-home-audio-label]");
  if (!button) {
    return;
  }

  button.disabled = true;
  button.dataset.state = "unavailable";
  button.setAttribute("aria-label", "Ambient room sound unavailable in this browser");
  if (label) {
    label.textContent = "N/A";
  }
}

function setHomeAudioAwaitingGesture(root: ParentNode): void {
  const button = root.querySelector<HTMLButtonElement>("#home-audio-toggle");
  const label = root.querySelector<HTMLElement>("[data-home-audio-label]");
  if (!button) {
    return;
  }

  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", "Tap to enable analog room signal");
  button.dataset.state = "blocked";
  if (label) {
    label.textContent = "TAP";
  }
}

async function attemptHomeAudioPlayback(root: ParentNode): Promise<void> {
  try {
    const session = homeAmbientAudioSession;
    if (!session) {
      setHomeAudioUnavailable(root);
      return;
    }

    const graph = session.graph;
    if (graph.context.state !== "running") {
      await graph.context.resume();
    }
    if (graph.context.state !== "running") {
      throw new Error("Ambient signal context is not running");
    }
    await session.audio.play();
    setHomeAudioState(root, true);
  } catch {
    setHomeAudioAwaitingGesture(root);
  }
}

function startHomeAudio(root: ParentNode): void {
  if (homeAmbientAudioSession) {
    void attemptHomeAudioPlayback(root);
    return;
  }

  const audio = new window.Audio(HOME_AUDIO_SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = HOME_AUDIO_SOURCE_VOLUME;
  const graph = createHomeAudioGraph(audio);
  if (!graph) {
    setHomeAudioUnavailable(root);
    return;
  }

  const resumeAudio = (): void => {
    if (document.visibilityState !== "visible" || (graph.context.state === "running" && !audio.paused)) {
      return;
    }

    void attemptHomeAudioPlayback(root);
  };
  const gestureHandler = (event: PointerEvent): void => {
    if (event.target instanceof Element && event.target.closest("#home-audio-toggle")) {
      return;
    }

    if (graph.context.state === "running" && !audio.paused) {
      document.removeEventListener("pointerdown", gestureHandler);
      return;
    }

    void attemptHomeAudioPlayback(root);
  };
  document.addEventListener("visibilitychange", resumeAudio);
  document.addEventListener("pointerdown", gestureHandler, { passive: true });
  homeAmbientAudioSession = { audio, graph, resumeAudio, gestureHandler };
  void attemptHomeAudioPlayback(root);
}

function stopHomeAudio(root?: ParentNode, rememberChoice = false): void {
  if (rememberChoice) {
    writeHomeAudioPreference(false);
  }

  if (homeAmbientAudioSession) {
    const session = homeAmbientAudioSession;
    homeAmbientAudioSession = undefined;
    document.removeEventListener("visibilitychange", session.resumeAudio);
    document.removeEventListener("pointerdown", session.gestureHandler);
    session.audio.pause();
    session.audio.currentTime = 0;
    session.audio.removeAttribute("src");
    session.audio.load();
    try {
      session.graph.stringSource.stop();
    } catch {
      // The string bed may already be stopped during route teardown.
    }
    try {
      session.graph.oscillators.forEach((oscillator) => oscillator.stop());
    } catch {
      // Oscillators may already be stopped during route teardown.
    }
    void session.graph.context.close();
    if (root) {
      setHomeAudioState(root, false);
    }
    return;
  }

  if (root) {
    setHomeAudioState(root, false);
  }
}

function toggleHomeAudio(root: ParentNode): void {
  if (homeAmbientAudioSession) {
    if (homeAmbientAudioSession.audio.paused) {
      writeHomeAudioPreference(true);
      void attemptHomeAudioPlayback(root);
    } else {
      stopHomeAudio(root, true);
    }
    return;
  }

  writeHomeAudioPreference(true);
  startHomeAudio(root);
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

function formatVisitorLocalTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        break;
      }
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.length > 0) {
    const lastIndex = lines.length - 1;
    let last = lines[lastIndex];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1).trim();
    }
    lines[lastIndex] = `${last}…`;
  }

  return lines;
}

function drawCanvasRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.lineTo(x + width - corner, y);
  ctx.arcTo(x + width, y, x + width, y + corner, corner);
  ctx.lineTo(x + width, y + height - corner);
  ctx.arcTo(x + width, y + height, x + width - corner, y + height, corner);
  ctx.lineTo(x + corner, y + height);
  ctx.arcTo(x, y + height, x, y + height - corner, corner);
  ctx.lineTo(x, y + corner);
  ctx.arcTo(x, y, x + corner, y, corner);
  ctx.closePath();
}

interface ThreadImageReply {
  index: number;
  reply: AnonymousReply;
}

async function createThreadImage(
  confession: MockConfession,
  focusReply?: ThreadImageReply,
  cardType: ShareCardType = "THREAD",
  suppliedReplies?: AnonymousReply[],
): Promise<Blob> {
  const compactCard = cardType === "TEXT" || cardType === "REPLY";
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = compactCard ? 1000 : 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas rendering is unavailable.");
  }

  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#030806");
  background.addColorStop(0.45, "#07140d");
  background.addColorStop(1, "#010302");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(900, 220, 20, 900, 220, 720);
  glow.addColorStop(0, "rgba(93, 255, 143, 0.17)");
  glow.addColorStop(1, "rgba(93, 255, 143, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(93, 255, 143, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 48; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 48; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  for (let y = 0; y < canvas.height; y += 6) {
    ctx.fillRect(0, y, canvas.width, 1);
  }

  drawCanvasRoundedRect(ctx, 34, 34, canvas.width - 68, canvas.height - 68, 34);
  ctx.fillStyle = "rgba(3, 10, 6, 0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 255, 143, 0.7)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(93, 255, 143, 0.08)";
  drawCanvasRoundedRect(ctx, 35, 35, canvas.width - 70, 176, 32);
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 255, 143, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 210);
  ctx.lineTo(canvas.width - 72, 210);
  ctx.stroke();

  const logo = await new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(undefined);
    image.src = "/brand/hidn-symbol.png";
  });
  ctx.fillStyle = "#020504";
  drawCanvasRoundedRect(ctx, 74, 74, 92, 92, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 255, 143, 0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (logo) {
    ctx.drawImage(logo, 84, 84, 72, 72);
  } else {
    ctx.fillStyle = "#5dff8f";
    ctx.font = "700 30px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("H", 105, 124);
  }

  ctx.font = "700 31px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#5dff8f";
  ctx.fillText("HIDN", 194, 111);
  ctx.fillStyle = "#a1bca7";
  ctx.font = "17px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("THE ROOM / PRIVATE SIGNALS", 194, 143);

  ctx.fillStyle = "rgba(217, 245, 222, 0.75)";
  ctx.textAlign = "right";
  ctx.font = "600 16px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("NO NAME / NO PROFILE", canvas.width - 74, 91);
  ctx.fillStyle = "#5dff8f";
  ctx.font = "700 19px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`${formatTransmissionTime(confession.time)} / ${focusReply ? "REPLY" : cardType}`, canvas.width - 74, 126);
  ctx.fillStyle = "#a1bca7";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("LOCAL IMAGE / HIDN", canvas.width - 74, 158);
  ctx.textAlign = "left";

  const allReplies = suppliedReplies ?? repliesForThread(confession.id);
  const replyCount = allReplies.length;
  const replies = allReplies.slice(0, 2);
  const contentX = 82;
  const contentWidth = canvas.width - 164;
  let cursorY = 258;

  const drawChatBubble = (label: string, text: string, accent: boolean, fontSize: number, maxLines: number): number => {
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const lineHeight = Math.round(fontSize * 1.35);
    const lines = wrapCanvasText(ctx, `“${text}”`, contentWidth - 64, maxLines);
    const height = 66 + lines.length * lineHeight + 28;
    drawCanvasRoundedRect(ctx, contentX, cursorY, contentWidth, height, 24);
    ctx.fillStyle = accent ? "rgba(93, 255, 143, 0.13)" : "rgba(161, 188, 167, 0.07)";
    ctx.fill();
    ctx.strokeStyle = accent ? "rgba(93, 255, 143, 0.7)" : "rgba(161, 188, 167, 0.28)";
    ctx.lineWidth = accent ? 3 : 2;
    ctx.stroke();
    ctx.fillStyle = accent ? "#5dff8f" : "#a1bca7";
    ctx.font = "600 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(label, contentX + 32, cursorY + 34);
    ctx.fillStyle = "#f0f4e9";
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    lines.forEach((line, index) => ctx.fillText(line, contentX + 32, cursorY + 78 + index * lineHeight));
    cursorY += height + 22;
    return height;
  };

  ctx.fillStyle = "#5dff8f";
  ctx.font = "700 16px ui-monospace, SFMono-Regular, Menlo, monospace";
  const cardHeading = focusReply
    ? `REPLY / ${String(focusReply.index + 1).padStart(2, "0")}`
    : cardType === "TEXT"
      ? "SELECTED TEXT"
      : cardType === "BATCH"
        ? "SELECTED TEXT / BATCH"
        : cardType === "REPLY"
          ? "SELECTED REPLY"
          : `THREAD / ${confession.reference.replace("// ", "")}`;
  ctx.fillText(cardHeading, contentX, cursorY);
  ctx.fillStyle = "#a1bca7";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${confession.category} / ${replyCount} COMMENTS`, canvas.width - contentX, cursorY);
  ctx.textAlign = "left";
  cursorY += 30;

  if (focusReply) {
    drawChatBubble("ORIGINAL SIGNAL / CONTEXT", confession.text, false, 23, 3);
    drawChatBubble(`ANONYMOUS / REPLY ${String(focusReply.index + 1).padStart(2, "0")}`, focusReply.reply.text, true, 42, 6);
  } else {
    drawChatBubble(
      cardType === "TEXT" ? "SELECTED / EXACT TEXT" : cardType === "REPLY" ? "SELECTED / REPLY" : cardType === "BATCH" ? "SELECTED / 01" : "ANONYMOUS / ORIGINAL SIGNAL",
      confession.text,
      true,
      42,
      compactCard ? 4 : 5,
    );
  }

  ctx.fillStyle = "#5dff8f";
  ctx.font = "700 15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`REPLIES / ${String(replyCount).padStart(2, "0")}`, contentX, cursorY);
  cursorY += 28;
  replies.forEach((reply, index) => {
    if (focusReply) {
      return;
    }
    drawChatBubble(cardType === "BATCH" ? `SELECTED / ${String(index + 2).padStart(2, "0")}` : `ANONYMOUS / ${String(index + 1).padStart(2, "0")}`, reply.text, false, 23, 3);
  });

  const signalY = compactCard ? Math.max(500, cursorY + 18) : 1110;
  ctx.fillStyle = "rgba(93, 255, 143, 0.09)";
  drawCanvasRoundedRect(ctx, contentX, signalY, contentWidth, 104, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 255, 143, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#a1bca7";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("THREAD SIGNAL", contentX + 26, signalY + 34);
  ctx.fillStyle = "#f0f4e9";
  ctx.font = "700 24px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`♡ ${reactionCountForThread(confession.id, confession.reactions)}`, contentX + 26, signalY + 72);
  ctx.fillStyle = "#a1bca7";
  ctx.font = "17px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${replyCount} COMMENTS`, canvas.width - contentX - 26, signalY + 63);
  ctx.textAlign = "left";

  const code = `${confession.id}${focusReply ? `R${focusReply.index}` : "T"}`;
  ctx.fillStyle = "#5dff8f";
  let barX = canvas.width - contentX - 190;
  for (let index = 0; index < 24; index += 1) {
    const height = 17 + (code.charCodeAt(index % code.length) % 22);
    ctx.fillRect(barX, signalY + 127 - height, 3 + (index % 2), height);
    barX += 7;
  }

  const footerLineY = signalY + (compactCard ? 150 : 166);
  ctx.strokeStyle = "rgba(93, 255, 143, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(contentX, footerLineY);
  ctx.lineTo(canvas.width - contentX, footerLineY);
  ctx.stroke();
  ctx.fillStyle = "#5dff8f";
  ctx.font = "700 26px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("PRIVATE ROOMS WITHOUT NAMES.", contentX, footerLineY + (compactCard ? 50 : 54));
  ctx.fillStyle = "#a1bca7";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("NO HANDLE / NO PROFILE / NO TRAIL", contentX, footerLineY + (compactCard ? 86 : 96));
  ctx.textAlign = "right";
  ctx.fillStyle = "#5dff8f";
  const cardFooter = focusReply
    ? "HIDN / REPLY CARD"
    : cardType === "TEXT"
      ? "HIDN / TEXT CARD"
      : cardType === "REPLY"
        ? "HIDN / REPLY CARD"
        : cardType === "BATCH"
          ? "HIDN / BATCH CARD"
          : "HIDN / THREAD CARD";
  ctx.fillText(cardFooter, canvas.width - contentX, footerLineY + (compactCard ? 86 : 96));
  ctx.textAlign = "left";

  const footerDotY = footerLineY + (compactCard ? 123 : 134);
  ctx.fillStyle = "rgba(93, 255, 143, 0.5)";
  ctx.fillRect(contentX, footerDotY, 8, 8);
  ctx.fillRect(contentX + 16, footerDotY, 8, 8);
  ctx.fillRect(contentX + 32, footerDotY, 8, 8);
  ctx.fillStyle = "#5dff8f";
  ctx.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("HIDN://THE_ROOM", contentX + 58, footerLineY + (compactCard ? 133 : 144));

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The thread image could not be created."));
      }
    }, "image/png");
  });
}

function downloadThreadImage(blob: Blob, confession: MockConfession, filename = `hidn-thread-${confession.id}.png`): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function setThreadShareStatus(root: ParentNode, id: string, message: string): void {
  root.querySelectorAll<HTMLElement>('[data-share-status]').forEach((status) => {
    if (status.dataset.shareStatus === id) {
      status.textContent = message;
    }
  });
}

function selectionConfession(item: SelectedTextItem, index: number): MockConfession {
  return {
    id: `selected-${index}-${Date.now().toString(36)}`,
    reference: "// SELECTED",
    text: item.text,
    category: isMockCategory(item.category) ? item.category : "IDENTITY",
    relativeTime: "SELECTED TEXT",
    reactions: 0,
    time: item.time || new Date().toISOString(),
  };
}

function setSelectionStatus(root: ParentNode, message: string): void {
  const status = root.querySelector<HTMLElement>("[data-selection-status]");
  if (status) {
    status.textContent = message;
  }
}

async function shareSelectedTexts(root: ParentNode, items: SelectedTextItem[], mode: "save" | "share"): Promise<void> {
  if (!items.length) {
    return;
  }

  setSelectionStatus(root, "BUILDING TEXT CARD...");
  try {
    const confession = selectionConfession(items[0], items.length);
    const suppliedReplies = items.slice(1).map((item) => ({ text: item.text, time: item.time || "SELECTED" }));
    const cardType: ShareCardType = items.length > 1 ? "BATCH" : items[0].kind === "reply" ? "REPLY" : "TEXT";
    const blob = await createThreadImage(confession, undefined, cardType, suppliedReplies);
    const filename = items.length > 1 ? "hidn-selected-text-batch.png" : "hidn-selected-text.png";
    const file = new File([blob], filename, { type: "image/png" });

    if (mode === "save") {
      downloadThreadImage(blob, confession, filename);
      setSelectionStatus(root, "TEXT CARD SAVED TO DEVICE");
      return;
    }

    const canShareImage =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (canShareImage) {
      try {
        await navigator.share({
          files: [file],
          title: items.length > 1 ? "HIDN / selected text batch" : "HIDN / selected text",
          text: "A selected text card from HIDN / THE ROOM.",
        });
        setSelectionStatus(root, "SHARE SHEET READY");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setSelectionStatus(root, "SHARE CANCELLED");
          return;
        }
      }
    }

    downloadThreadImage(blob, confession, filename);
    const xText = items.map((item) => `“${item.text}”`).join(" ");
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${xText} — HIDN / THE ROOM`)}`;
    const composer = window.open(xUrl, "_blank", "noopener,noreferrer");
    setSelectionStatus(root, composer ? "TEXT CARD SAVED / X COMPOSER OPEN" : "TEXT CARD SAVED / OPEN X TO ATTACH");
  } catch {
    setSelectionStatus(root, "TEXT CARD UNAVAILABLE");
  }
}

function replyIndexFromButton(button: HTMLButtonElement): number | undefined {
  const rawIndex = button.dataset.replyIndex;
  if (rawIndex === undefined) {
    return undefined;
  }

  const index = Number(rawIndex);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

async function shareThreadImage(root: ParentNode, id: string, mode: "save" | "share" | "x", replyIndex?: number): Promise<void> {
  const confession = getMockConfession(id);
  if (!confession) {
    return;
  }

  const reply = replyIndex === undefined ? undefined : repliesForThread(id)[replyIndex];
  const focusReply = reply && replyIndex !== undefined ? { index: replyIndex, reply } : undefined;
  const shareKey = focusReply ? `${id}:reply:${focusReply.index}` : id;
  setThreadShareStatus(root, shareKey, "RENDERING IMAGE...");

  try {
    const cardConfession = focusReply
      ? { ...confession, reference: `// REPLY ${String(focusReply.index + 1).padStart(2, "0")}`, text: focusReply.reply.text, time: focusReply.reply.time }
      : confession;
    const blob = await createThreadImage(cardConfession, undefined, focusReply ? "REPLY" : "TEXT", []);
    const filename = focusReply
      ? `hidn-reply-${confession.id}-${focusReply.index + 1}.png`
      : `hidn-thread-${confession.id}.png`;
    const file = new File([blob], filename, { type: "image/png" });

    if (mode === "save") {
      downloadThreadImage(blob, confession, filename);
      setThreadShareStatus(root, shareKey, "IMAGE SAVED TO DEVICE");
      return;
    }

    const canShareImage =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (mode === "share" && canShareImage) {
      try {
        await navigator.share({
          files: [file],
          title: focusReply ? "HIDN / anonymous reply" : "HIDN / anonymous thread",
          text: focusReply ? "An anonymous reply from HIDN / THE ROOM." : "An anonymous thread from HIDN / THE ROOM.",
        });
        setThreadShareStatus(root, shareKey, "SHARE SHEET READY");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setThreadShareStatus(root, shareKey, "SHARE CANCELLED");
          return;
        }
      }
    }

    downloadThreadImage(blob, confession, filename);
    const xText = `“${focusReply?.reply.text ?? confession.text}” — HIDN / THE ROOM`;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`;
    const composer = window.open(xUrl, "_blank", "noopener,noreferrer");
    setThreadShareStatus(
      root,
      shareKey,
      composer ? "IMAGE SAVED / X COMPOSER OPEN" : "IMAGE SAVED / OPEN X TO ATTACH",
    );
  } catch {
    setThreadShareStatus(root, shareKey, "IMAGE SHARE UNAVAILABLE");
  }
}

function selectionHostFromNode(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLElement>("[data-share-text]") ?? null;
}

function hideSelectionTools(root: ParentNode): void {
  const tools = root.querySelector<HTMLElement>("#hidn-selection-tools");
  if (tools) {
    tools.hidden = true;
  }
}

function updateSelectionBatch(root: ParentNode): void {
  const batch = root.querySelector<HTMLElement>("[data-selection-batch]");
  const count = root.querySelector<HTMLElement>("[data-selection-batch-count]");
  if (!batch || !count) {
    return;
  }

  batch.hidden = selectedTextBatch.length === 0;
  count.textContent = `${selectedTextBatch.length} SELECTED`;
}

function showSelectionTools(root: ParentNode, selection: Selection, item: SelectedTextItem): void {
  const tools = root.querySelector<HTMLElement>("#hidn-selection-tools");
  const preview = root.querySelector<HTMLElement>("[data-selection-preview]");
  const label = root.querySelector<HTMLElement>("[data-selection-tool-label]");
  if (!tools || !preview || !label) {
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const width = 326;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
  const top = Math.max(12, Math.min(window.innerHeight - 188, rect.bottom + 12));
  label.textContent = `${item.kind === "reply" ? "REPLY" : item.kind === "thread" ? "THREAD" : "TEXT"} SIGNAL SELECTED`;
  preview.textContent = `“${item.text}”`;
  tools.style.left = `${left}px`;
  tools.style.top = `${top}px`;
  tools.hidden = false;
  updateSelectionBatch(root);
}

function updateTextSelection(root: ParentNode): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }

  const range = selection.getRangeAt(0);
  const startHost = selectionHostFromNode(range.startContainer);
  const endHost = selectionHostFromNode(range.endContainer);
  const text = selection.toString().replace(/\s+/g, " ").trim().replace(/^“|”$/g, "");
  if (!startHost || startHost !== endHost || text.length < 2) {
    hideSelectionTools(root);
    return;
  }

  activeTextSelection = {
    text,
    id: startHost.dataset.shareId ?? "selected",
    label: startHost.dataset.shareLabel ?? "SELECTED TEXT",
    kind: startHost.dataset.shareKind === "reply" ? "reply" : startHost.dataset.shareKind === "thread" ? "thread" : "text",
    category: startHost.dataset.shareCategory ?? "IDENTITY",
    time: startHost.dataset.shareTime ?? new Date().toISOString(),
  };
  showSelectionTools(root, selection, activeTextSelection);
}

function bindTextSelectionInteractions(root: ParentNode): void {
  textSelectionRoot = root;
  if (textSelectionInteractionsBound) {
    updateSelectionBatch(root);
    return;
  }

  textSelectionInteractionsBound = true;
  document.addEventListener("selectionchange", () => {
    if (document.activeElement?.closest("#hidn-selection-tools")) {
      return;
    }

    updateTextSelection(textSelectionRoot ?? document);
  });
  document.addEventListener("mouseup", () => {
    window.setTimeout(() => updateTextSelection(textSelectionRoot ?? document), 0);
  });
  document.addEventListener("touchend", () => {
    window.setTimeout(() => updateTextSelection(textSelectionRoot ?? document), 0);
  });
  window.addEventListener("resize", () => {
    if (activeTextSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        showSelectionTools(textSelectionRoot ?? document, selection, activeTextSelection);
      }
    }
  });
  updateSelectionBatch(root);
}

function renderVisitorTimeSignal(className: string): string {
  return `<span class="${escapeHtml(className)} hidn-local-time-signal" title="Visitor local time, 24-hour format">
    <span class="hidn-local-time-signal__dot" aria-hidden="true"></span>
    <span data-visitor-local-time>${formatVisitorLocalTime()}</span>
  </span>`;
}

function startVisitorClock(root: ParentNode): void {
  if (visitorClockTimer !== undefined) {
    window.clearInterval(visitorClockTimer);
  }

  const update = (): void => {
    const time = formatVisitorLocalTime();
    root.querySelectorAll<HTMLElement>("[data-visitor-local-time]").forEach((element) => {
      element.textContent = time;
    });
  };

  update();
  visitorClockTimer = window.setInterval(update, 1000);
}

function renderRoomAccessActivityItem(activity: (typeof ROOM_ACCESS_ACTIVITY)[number]): string {
  return `<span class="room-access-activity__actor">${escapeHtml(activity.actor)}</span> <span class="room-access-activity__action">${escapeHtml(activity.action)}</span> <span class="room-access-activity__subject">${escapeHtml(activity.subject)}</span>`;
}

function renderRoomAccessActivity(): string {
  const activity = ROOM_ACCESS_ACTIVITY[roomActivityIndex % ROOM_ACCESS_ACTIVITY.length];

  return `<section class="room-access-activity" aria-label="Local anonymous activity">
    <div class="room-access-activity__header">
      <span><i aria-hidden="true"></i> LOCAL SIGNALS</span>
      <span>ROTATING DEMO / NO LIVE USERS</span>
    </div>
    <p data-room-activity-message role="status" aria-live="polite">${renderRoomAccessActivityItem(activity)}</p>
  </section>`;
}

function stopRoomAccessActivity(): void {
  if (roomActivityTimer !== undefined) {
    window.clearInterval(roomActivityTimer);
    roomActivityTimer = undefined;
  }
}

function startRoomAccessActivity(root: ParentNode): void {
  stopRoomAccessActivity();

  const message = root.querySelector<HTMLElement>("[data-room-activity-message]");
  if (!message) {
    return;
  }

  const update = (): void => {
    roomActivityIndex = (roomActivityIndex + 1) % ROOM_ACCESS_ACTIVITY.length;
    message.dataset.state = "receiving";
    message.innerHTML = renderRoomAccessActivityItem(ROOM_ACCESS_ACTIVITY[roomActivityIndex]);
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  roomActivityTimer = window.setInterval(update, 4200);
}

function publicNavigation(path: string): string {
  const normalizedPath = normalizePath(path);
  const links = (normalizedPath === "/" || normalizedPath === "/room" || normalizedPath === "/room/access" || normalizedPath === "/how-it-works"
    ? []
    : [
        { label: "THE ROOM", href: "/room" },
        { label: "HOW IT WORKS", href: "/how-it-works" },
        { label: "MANIFESTO", href: "/manifesto" },
      ]
  ).map((link) => ({ ...link, current: normalizedPath === link.href }));

  return NavigationShell({
    centerContent: normalizedPath === "/room/access" ? renderRoomAccessActivity() : "",
    descriptor: normalizedPath === "/" ? "ANONYMOUS INTERNET NOIR" : "",
    showIdentity: normalizedPath !== "/room/access",
    showStatus: normalizedPath !== "/room/access",
    status: normalizedPath === "/" ? "PRIVATE ROOM" : "BUILT ON ZCASH",
    links,
  });
}

function renderRoomMenu(): string {
  const profileName = roomAccountUsername || "HIDN-LOCAL";
  const profileVerified = roomAccountAccessLevel === "full";
  const profileStatus = profileVerified ? "VERIFIED / FULL ACCESS" : "NOT VERIFIED / READ ONLY";
  const profileCopy = profileVerified
    ? "The payment watcher confirmed the exact ZEC amount. Full room actions are available to this profile."
    : "This profile can read the room. Exact ZEC payment is required before replies, reactions, and other full actions unlock.";

  return `<div class="room-menu" data-room-menu>
    <button class="room-menu__toggle" type="button" data-action="room-menu-toggle" aria-expanded="false" aria-controls="room-channel-menu" aria-label="Open private room menu">
      <span class="room-menu__icon" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="room-menu__label">CHANNELS</span>
    </button>
    <div class="room-menu__panel" id="room-channel-menu" hidden>
      <div class="room-menu__panel-head">
        <span>PRIVATE ROOM / INDEX</span>
        <span class="room-menu__signal"><i aria-hidden="true"></i> LOCAL</span>
      </div>
      <button class="room-menu__profile" type="button" data-action="room-profile-toggle" aria-expanded="${roomProfileOpen}" aria-controls="room-profile-status">
        <span class="room-menu__profile-mark" aria-hidden="true">◎</span>
        <span class="room-menu__profile-copy">
          <strong>PROFILE</strong>
          <small>${escapeHtml(profileName)}</small>
        </span>
        <span class="room-menu__profile-state">${escapeHtml(profileVerified ? "VERIFIED" : "NOT VERIFIED")}</span>
      </button>
      <div class="room-menu__profile-panel" id="room-profile-status" role="status"${roomProfileOpen ? "" : " hidden"}>
        <div class="room-menu__profile-panel-header">
          <span>PROFILE STATUS</span>
          <strong>${escapeHtml(profileStatus)}</strong>
        </div>
        <p>${escapeHtml(profileCopy)}</p>
        ${profileVerified ? "" : SecondaryButton({ label: "VERIFY PROFILE →", dataAction: "room-open-verification" })}
      </div>
      <nav aria-label="Private room channels">
        <a href="/how-it-works"><span>01</span> HOW IT WORKS <b aria-hidden="true">↗</b></a>
        <a href="/"><span>02</span> HOME <b aria-hidden="true">↗</b></a>
      </nav>
      <a class="room-menu__leave" href="/" data-room-logout>LEAVE ROOM <span aria-hidden="true">↗</span></a>
    </div>
  </div>`;
}

function publicWindowTitle(path: string): string {
  const normalizedPath = normalizePath(path);
  if (normalizedPath.startsWith("/c/")) {
    return "THREAD_ROOM";
  }

  if (normalizedPath === "/room" || normalizedPath === "/explore") {
    return "THE_ROOM";
  }

  if (normalizedPath === "/") {
    return "PRIVATE_ROOM";
  }

  return normalizedPath.slice(1).replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

function publicWindowChrome(path: string, showRoomMenu = false, showZcashStatus = false): string {
  const normalizedPath = normalizePath(path);

  return `<div class="public-page__window-chrome">
    <div class="public-page__window-bar">
      <div class="public-page__window-controls" aria-hidden="true">
        <span class="public-page__window-control public-page__window-control--close"></span>
        <span class="public-page__window-control public-page__window-control--minimize"></span>
        <span class="public-page__window-control public-page__window-control--maximize"></span>
      </div>
      <span class="public-page__window-title" aria-label="HIDN ${publicWindowTitle(path)}">HIDN://${publicWindowTitle(path)}</span>
      <div class="public-page__window-actions">
        ${showZcashStatus ? `<span class="public-page__window-zcash-status" data-zcash-status>BUILT ON ZCASH</span>` : ""}
        ${renderAmbientAudioControl()}
        ${renderVisitorTimeSignal("public-page__window-meta")}
      </div>
      ${showRoomMenu ? renderRoomMenu() : ""}
    </div>
  </div>`;
}

function renderSelectionTools(): string {
  return `<aside class="hidn-selection-tools" id="hidn-selection-tools" hidden aria-label="Selected text actions">
    <header class="hidn-selection-tools__header">
      <span data-selection-tool-label>TEXT SIGNAL SELECTED</span>
      <button class="hidn-selection-tools__close" type="button" data-action="selection-close" aria-label="Close text actions">×</button>
    </header>
    <p class="hidn-selection-tools__preview" data-selection-preview></p>
    <div class="hidn-selection-tools__actions">
      <button type="button" data-action="selection-save">SAVE TEXT CARD</button>
      <button type="button" data-action="selection-share">SHARE TEXT</button>
      <button type="button" data-action="selection-add">ADD TO BATCH</button>
    </div>
    <div class="hidn-selection-tools__batch" data-selection-batch hidden>
      <span data-selection-batch-count>0 SELECTED</span>
      <button type="button" data-action="selection-batch-share">SHARE BATCH</button>
      <button type="button" data-action="selection-batch-clear">CLEAR</button>
    </div>
    <p class="hidn-selection-tools__status" data-selection-status role="status" aria-live="polite"></p>
  </aside>`;
}

function publicFrame(path: string, main: string, pageClass = ""): string {
  const normalizedPath = normalizePath(path);
  const isHome = normalizedPath === "/";
  const isRoomCreation = normalizedPath === "/room/access";
  const isHowItWorks = normalizedPath === "/how-it-works";
  const isAdminPage = normalizedPath.startsWith("/admin/");
  const isRoomSurface = normalizedPath === "/room" || normalizedPath === "/explore" || normalizedPath.startsWith("/c/");
  const isPointerSurface = !isHome && !isRoomCreation && !isRoomSurface && !isAdminPage;
  const footerLinks = isAdminPage
    ? []
    : isHome || isRoomCreation
    ? [{ label: "HOW IT WORKS", href: "/how-it-works" }]
    : isHowItWorks
      ? [{ label: "HOME", href: "/" }]
    : isRoomSurface
      ? [
          { label: "HOW IT WORKS", href: "/how-it-works" },
          { label: "LEAVE ROOM", href: "/" },
        ]
    : [
        { label: "THE ROOM", href: "/room" },
        { label: "HOW IT WORKS", href: "/how-it-works" },
        { label: "MANIFESTO", href: "/manifesto" },
        { label: "PRIVACY", href: "/privacy" },
      ];

  return `<div class="public-page ${pageClass} fx-grain fx-vignette${isPointerSurface ? " hidn-pointer-surface" : ""}"${isPointerSurface ? " data-pointer-surface" : ""}>
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${isPointerSurface ? renderPointerSpotlight() : ""}
    ${isHome ? "" : publicWindowChrome(path, isRoomSurface, normalizedPath === "/room" || normalizedPath === "/explore")}
    ${isRoomSurface || isAdminPage ? "" : publicNavigation(path)}
    ${main}
    ${isRoomSurface ? renderSelectionTools() : ""}
    ${isRoomSurface || isAdminPage ? "" : FooterShell({
      links: footerLinks,
      identity: isRoomCreation || isHowItWorks ? "" : "ANONYMOUS BY DESIGN.",
    })}
  </div>`;
}

function roomChannelOption(key: RoomChannel): (typeof roomChannelOptions)[number] {
  return roomChannelOptions.find((channel) => channel.key === key) ?? roomChannelOptions[0];
}

function feedForRoomChannel(confessions: MockConfession[]): MockConfession[] {
  const channel = roomChannelOption(activeRoomChannel);
  const visibleConfessions = confessions.filter((confession) => !isModerationHidden("thread", confession.id));
  if (!channel.categories) {
    return visibleConfessions;
  }

  return visibleConfessions.filter((confession) => channel.categories?.includes(confession.category));
}

function feedForTab(tab: FeedTab): MockConfession[] {
  let confessions: MockConfession[];
  if (tab === "felt") {
    confessions = [...MOCK_CONFESSIONS].sort((left, right) => right.reactions - left.reactions);
  } else if (tab === "random") {
    confessions = [...MOCK_CONFESSIONS.slice(4), ...MOCK_CONFESSIONS.slice(0, 4)];
  } else {
    confessions = MOCK_CONFESSIONS;
  }

  return feedForRoomChannel(confessions);
}

function renderTransmissionRows(tab: FeedTab): string {
  const mockRows = feedForTab(tab).map(transmissionViewFromConfession);
  const persistedRows = tab === "latest"
    ? roomPosts
        .filter((post) => post.channel === activeRoomChannel)
        .map(transmissionViewFromRoomPost)
    : [];
  const rows = [...persistedRows, ...mockRows];
  if (!rows.length) {
    return EmptyState("NO TRANSMISSIONS", "Nothing is visible here yet.");
  }

  return rows
    .map((transmission) => renderTransmissionRow(transmission, { href: transmission.id?.startsWith("THR-") ? undefined : `/c/${transmission.id}` }))
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

async function refreshRoomPosts(): Promise<void> {
  if (!hasRoomSession() || roomPostsRequest || roomPostsLoadedChannel === activeRoomChannel) {
    return;
  }

  const requestedChannel = activeRoomChannel;
  roomPostsRequest = fetchRoomPosts(requestedChannel)
    .then((response) => {
      roomPosts = response.posts;
      roomPostsLoadedChannel = requestedChannel;
      roomPostError = "";
      if (normalizePath(window.location.pathname) === "/room") {
        rerenderProductRoute();
      }
    })
    .catch((error) => {
      roomPostsLoadedChannel = requestedChannel;
      roomPostError = error instanceof Error ? error.message : "Room posts could not be loaded.";
    })
    .finally(() => {
      roomPostsRequest = undefined;
    });

  return roomPostsRequest;
}

async function submitRoomPost(): Promise<void> {
  const content = roomPostText.trim();
  if (!content) {
    roomPostError = "Write something before posting.";
    rerenderProductRoute();
    return;
  }
  if (!hasFullRoomAccess()) {
    roomPostError = "FULL ACCESS REQUIRED / VERIFY YOUR ROOM ACCESS BEFORE POSTING";
    rerenderProductRoute();
    return;
  }

  roomPostSubmitting = true;
  roomPostError = "";
  roomChannelNotice = "TRANSMITTING / PRIVATE ROOM";
  rerenderProductRoute();

  try {
    const response = await createRoomPost({
      content,
      channel: activeRoomChannel,
      category: "IDENTITY",
    });
    roomPosts = [response.post, ...roomPosts.filter((post) => post.id !== response.post.id)];
    roomPostsLoadedChannel = activeRoomChannel;
    roomPostComposerOpen = false;
    roomPostText = "";
    roomChannelNotice = `${response.post.reference} POSTED / ANONYMOUS`;
  } catch (error) {
    roomPostError = error instanceof Error ? error.message : "The post could not be created.";
    roomChannelNotice = "";
  } finally {
    roomPostSubmitting = false;
    rerenderProductRoute();
  }
}

function renderRoomDirectory(): string {
  const activeChannel = roomChannelOption(activeRoomChannel);
  const folderGroups: Array<{ key: string; label: string; channels: typeof roomChannelOptions; open: boolean }> = [
    {
      key: "discussion",
      label: "DISCUSSION ROOMS",
      channels: roomChannelOptions.filter((channel) => channel.key !== "general"),
      open: true,
    },
    {
      key: "system",
      label: "SYSTEM CHANNELS",
      channels: roomChannelOptions.filter((channel) => channel.key === "general"),
      open: activeRoomChannel === "general",
    },
  ];

  return `<aside class="room-directory" aria-label="Discussion rooms">
    <div class="room-directory__header">
      ${TerminalLabel("ROOM INDEX / OPEN CHANNELS")}
      <span class="room-directory__count">${roomChannelOptions.length} ROOMS</span>
    </div>
    <h2>Find your room.</h2>
    <p class="room-directory__intro">Every channel is a shared wall. No handles, no member list, no public identity.</p>
    <div class="room-directory__tree" role="tree" aria-label="Room folders">
      ${folderGroups
        .map(
          (folder) => `<section class="room-directory__folder${folder.open ? " room-directory__folder--open" : ""}">
            <button class="room-directory__folder-toggle" type="button" data-room-folder-toggle="${folder.key}" aria-expanded="${folder.open}" aria-controls="room-folder-${folder.key}">
              <span class="room-directory__folder-caret" aria-hidden="true">${folder.open ? "▾" : "▸"}</span>
              <span class="room-directory__folder-icon" aria-hidden="true"></span>
              <strong>${folder.label}</strong>
              <small>${String(folder.channels.length).padStart(2, "0")}</small>
            </button>
            <div class="room-directory__folder-children" id="room-folder-${folder.key}" role="group"${folder.open ? "" : " hidden"}>
              ${folder.channels
                .map((channel, index) => `<button class="room-directory__room${activeRoomChannel === channel.key ? " room-directory__room--active" : ""}" type="button" data-room-channel="${channel.key}" aria-pressed="${activeRoomChannel === channel.key}">
                  <span class="room-directory__room-number">${String(index + 1).padStart(2, "0")}</span>
                  <span class="room-directory__room-copy"><strong>${channel.label}</strong><small>${channel.description}</small></span>
                  <span class="room-directory__room-arrow" aria-hidden="true">↗</span>
                </button>`)
                .join("")}
            </div>
          </section>`,
        )
        .join("")}
    </div>
    <div class="room-directory__footer">
      <span>ACTIVE CHANNEL</span><strong>// ${activeChannel.label}</strong>
      ${roomChannelNotice ? `<p role="status">${escapeHtml(roomChannelNotice)}</p>` : ""}
      ${roomPostError ? `<p class="room-post-composer__error" role="alert">${escapeHtml(roomPostError)}</p>` : ""}
      ${roomPostComposerOpen
        ? `<form class="room-post-composer" novalidate>
            <label class="ui-field room-post-composer__field" for="room-post-content">
              <span class="ui-field__label">POST WITHOUT A NAME / ${escapeHtml(activeChannel.label)}</span>
              <textarea id="room-post-content" rows="5" maxlength="2000" placeholder="Leave a thought in the room...">${escapeHtml(roomPostText)}</textarea>
            </label>
            <p class="room-post-composer__note">${hasFullRoomAccess() ? "Your post is stored without a public name." : "Full access is required before you can transmit a post."}</p>
            <div class="room-post-composer__actions">
              ${GhostButton({ label: "CANCEL", dataAction: "room-post-cancel" })}
              ${PrimaryButton({ label: roomPostSubmitting ? "TRANSMITTING..." : "POST ANONYMOUSLY →", disabled: roomPostSubmitting, dataAction: "room-post-submit" })}
            </div>
          </form>`
        : SecondaryButton({ label: "CREATE POST →", dataAction: "room-create-post" })}
    </div>
  </aside>`;
}

function adminReportStatusLabel(status: ReportStatus): string {
  switch (status) {
    case "reviewed":
      return "REVIEWED";
    case "dismissed":
      return "DISMISSED";
    case "actioned":
      return "ACTIONED";
    default:
      return "OPEN";
  }
}

function renderAdminReportCard(report: AdminReportsResponse["reports"][number]): string {
  return `<article class="admin-report-card" data-admin-report-id="${escapeHtml(report.reportId)}">
    <header class="admin-report-card__header">
      <div>
        <span class="admin-report-card__id">${escapeHtml(report.reportId)}</span>
        <h2>${escapeHtml(reportReasonLabel(report.reason))}</h2>
      </div>
      <span class="admin-report-card__status admin-report-card__status--${escapeHtml(report.status)}">${escapeHtml(adminReportStatusLabel(report.status))}</span>
    </header>
    <dl class="admin-report-card__meta">
      <div><dt>TARGET</dt><dd>${escapeHtml(report.targetType)} / ${escapeHtml(report.targetId)}</dd></div>
      <div><dt>REPORTED BY</dt><dd>${escapeHtml(report.reporterUsername ?? "ACCOUNT REMOVED")}</dd></div>
      <div><dt>CREATED</dt><dd>${escapeHtml(report.createdAt)}</dd></div>
    </dl>
    <blockquote class="admin-report-card__excerpt">“${escapeHtml(report.targetExcerpt || "NO CONTENT SNAPSHOT")}"</blockquote>
    ${report.details ? `<p class="admin-report-card__details"><strong>REPORTER DETAILS</strong>${escapeHtml(report.details)}</p>` : ""}
    <div class="admin-report-card__review">
      <label class="ui-field" for="admin-report-status-${escapeHtml(report.reportId)}">
        <span class="ui-field__label">REVIEW STATUS</span>
        <select id="admin-report-status-${escapeHtml(report.reportId)}" data-admin-report-status>
          ${(["open", "reviewed", "dismissed", "actioned"] as ReportStatus[]).map((status) => `<option value="${status}"${status === report.status ? " selected" : ""}>${adminReportStatusLabel(status)}</option>`).join("")}
        </select>
      </label>
      <label class="ui-field" for="admin-report-note-${escapeHtml(report.reportId)}">
        <span class="ui-field__label">MODERATOR NOTE</span>
        <textarea id="admin-report-note-${escapeHtml(report.reportId)}" data-admin-report-note rows="3" maxlength="2000" placeholder="Internal note...">${escapeHtml(report.reviewerNote)}</textarea>
      </label>
      <button class="ui-button ui-button--secondary" type="button" data-action="admin-report-update" data-report-id="${escapeHtml(report.reportId)}">UPDATE REPORT →</button>
    </div>
    ${report.targetType === "thread" || report.targetType === "reply"
      ? `<div class="admin-report-card__moderation-actions">
        <span class="ui-field__label">CONTENT ACTION</span>
        <button class="ui-button ui-button--danger" type="button" data-action="admin-report-moderate" data-report-id="${escapeHtml(report.reportId)}" data-target-type="${escapeHtml(report.targetType)}" data-target-id="${escapeHtml(report.targetId)}" data-moderation-action="hide" data-moderation-reason="${escapeHtml(reportReasonLabel(report.reason))}">HIDE CONTENT →</button>
        <button class="ui-button ui-button--secondary" type="button" data-action="admin-report-moderate" data-report-id="${escapeHtml(report.reportId)}" data-target-type="${escapeHtml(report.targetType)}" data-target-id="${escapeHtml(report.targetId)}" data-moderation-action="approve" data-moderation-reason="RESTORED BY MODERATOR">RESTORE CONTENT →</button>
      </div>`
      : `<p class="admin-report-card__no-moderation">ACCOUNT REPORT / REVIEW THE ACCOUNT SEPARATELY</p>`}
  </article>`;
}

function renderAdminReports(): RenderedProductRoute {
  const reportRows = adminReports?.reports ?? [];
  const summary = adminReports?.summary ?? [];

  return {
    metadata: {
      kind: "admin",
      title: "HIDN — Report Console",
      description: "Private HIDN moderation report console.",
      canonicalPath: "/admin/reports",
    },
    html: publicFrame(
      "/admin/reports",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--reading admin-reports-page">
          <header class="admin-reports-page__header">
            ${TerminalLabel("HIDN / PRIVATE OPERATOR SURFACE")}
            <h1 class="type-display-lg">REPORT<br /><em>CONSOLE.</em></h1>
            <p>Review user-submitted moderation reports, then hide or restore thread and reply content. This surface is not linked from public navigation and report data is only loaded after Worker-token authorization.</p>
          </header>
          <section class="admin-reports-gate" aria-labelledby="admin-reports-gate-title">
            <div>
              ${TerminalLabel("WORKER AUTHORIZATION")}
              <h2 id="admin-reports-gate-title">OPEN THE PRIVATE QUEUE.</h2>
            </div>
            <label class="ui-field" for="admin-report-token">
              <span class="ui-field__label">REPORT ADMIN TOKEN / MEMORY ONLY</span>
              <input id="admin-report-token" type="password" autocomplete="off" placeholder="Paste the Worker secret" />
            </label>
            <div class="admin-reports-gate__actions">
              ${PrimaryButton({ label: adminReportLoading ? "LOADING REPORTS..." : "LOAD REPORTS →", disabled: adminReportLoading, dataAction: "admin-reports-load" })}
              ${GhostButton({ label: "CLEAR", dataAction: "admin-reports-clear" })}
            </div>
            <p class="admin-reports-gate__status" role="status">${adminReportToken ? "TOKEN PRESENT / NOT STORED" : "NO TOKEN PRESENT"}</p>
          </section>
          ${adminReportError ? AlertMessage("ADMIN RESPONSE", adminReportError, "danger") : ""}
          ${adminReports ? `<section class="admin-reports-results" aria-labelledby="admin-reports-results-title">
            <header class="admin-reports-results__header">
              <div>
                ${TerminalLabel("MODERATION QUEUE")}
                <h2 id="admin-reports-results-title">${adminReports.reports.length} REPORT${adminReports.reports.length === 1 ? "" : "S"} LOADED.</h2>
              </div>
              <label class="ui-field admin-reports-results__filter" for="admin-report-filter">
                <span class="ui-field__label">FILTER</span>
                <select id="admin-report-filter" data-admin-report-filter>
                  <option value="all"${adminReportFilter === "all" ? " selected" : ""}>ALL REPORTS</option>
                  <option value="open"${adminReportFilter === "open" ? " selected" : ""}>OPEN</option>
                  <option value="reviewed"${adminReportFilter === "reviewed" ? " selected" : ""}>REVIEWED</option>
                  <option value="dismissed"${adminReportFilter === "dismissed" ? " selected" : ""}>DISMISSED</option>
                  <option value="actioned"${adminReportFilter === "actioned" ? " selected" : ""}>ACTIONED</option>
                </select>
              </label>
            </header>
            <div class="admin-reports-summary" aria-label="Report totals">
              ${summary.length ? summary.map((item) => `<span><strong>${escapeHtml(String(item.count))}</strong> ${escapeHtml(adminReportStatusLabel(item.status))}</span>`).join("") : "<span>NO REPORTS YET</span>"}
            </div>
            <div class="admin-reports-list">
              ${reportRows.length ? reportRows.map(renderAdminReportCard).join("") : `<p class="admin-reports-empty">No reports match this filter.</p>`}
            </div>
          </section>` : SystemMessage("PRIVATE QUEUE / LOCKED", "Enter the REPORT_ADMIN_TOKEN configured on the HIDN Worker. The token is sent only in the request header and is not saved in this browser.", "INFO")}
        </div>
      </main>`,
      "public-page--admin",
    ),
  };
}

function renderModerationGate(path: string): RenderedProductRoute {
  const normalizedPath = normalizePath(path);
  const metadata: HidnMetadata = normalizedPath.startsWith("/c/")
    ? {
        kind: "anonymous-confession",
        title: "HIDN — Anonymous confession",
        description: "Checking HIDN moderation state before opening this transmission.",
        canonicalPath: path,
      }
    : EXPLORE_METADATA;

  return {
    metadata,
    html: publicFrame(
      path,
      `<main id="main-content" class="public-main explore-main" aria-busy="true">
        ${renderRoomEntryTransition("return")}
      </main>`,
      "public-page--explore",
    ),
  };
}

function renderExplore(path = "/room"): string {
  if (!hasRoomSession()) {
    return publicFrame(
      path,
      `<main id="main-content" class="public-main explore-main room-locked-main">
        <div class="room-locked-page">
          ${TerminalLabel("HIDN / ACCESS REQUIRED")}
          <h1 class="type-display-lg">THE ROOM STAYS<br /><em>BEHIND THE KEY.</em></h1>
          <p>Log in with your HIDN handle and recovery code to read the private room. Full actions unlock after the payment watcher confirms the exact ZEC amount.</p>
          ${actionLink("ENTER THE ROOM", "/room/access", "primary")}
        </div>
      </main>`,
      "public-page--explore",
    );
  }

  return publicFrame(
    path,
    `<main id="main-content" class="public-main explore-main">
      ${roomEntryTransitionActive ? renderRoomEntryTransition() : ""}
      <div class="hidn-container--wide explore-page">
        <header class="explore-header">
          ${TerminalLabel("PRIVATE ROOM / OPEN THREADS")}
          <h1 class="type-display-lg">THE ROOM</h1>
          <p>Thoughts move through the room without names. Follow one thread or leave one behind.</p>
        </header>
        <div class="explore-layout">
          <section class="explore-feed" aria-labelledby="explore-feed-title">
            <div class="explore-feed__heading">
              <div>
                ${TerminalLabel("RECEIVING / ANONYMOUS SIGNAL")}
                <h2 id="explore-feed-title" class="type-heading-2">// ${escapeHtml(roomChannelOption(activeRoomChannel).label)} / THOUGHTS IN MOTION</h2>
              </div>
              ${StatusIndicator("LOCAL THREAD / LIVE FEEL", "warning", true)}
            </div>
            ${renderExploreTabs()}
            <div class="explore-feed__list" id="explore-feed-list" aria-live="polite">${renderTransmissionRows(activeFeedTab)}</div>
          </section>
          ${renderRoomDirectory()}
        </div>
      </div>
    </main>`,
    "public-page--explore",
  );
}

function renderThreadRoom(id: string, quotedText = ""): string {
  const replies = repliesForThread(id);
  const visibleReplies = replies
    .map((reply, index) => ({ reply, index }))
    .filter(({ index }) => !isModerationHidden("reply", `${id}:reply:${index}`));
  const replyCount = visibleReplies.length;
  const fullAccess = hasFullRoomAccess();
  const messages = replyCount
    ? visibleReplies
        .map(
          ({ reply, index }) => `<article class="thread-room__message">
            <header><span>ANONYMOUS / ${String(index + 1).padStart(2, "0")}</span><time>${escapeHtml(reply.time)}</time></header>
            <p data-share-text data-share-id="${escapeHtml(id)}" data-share-kind="reply" data-share-index="${index}" data-share-label="${escapeHtml(`REPLY / ${String(index + 1).padStart(2, "0")}`)}" data-share-category="IDENTITY" data-share-time="${escapeHtml(reply.time)}">${escapeHtml(reply.text)}</p>
            <footer class="thread-room__message-actions">
              <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(id)}" data-reply-index="${index}">SAVE IMAGE</button>
              <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(id)}" data-reply-index="${index}">SHARE IMAGE</button>
              <button class="room-message__action" type="button" data-action="report-open" data-report-target-type="reply" data-report-target-id="${escapeHtml(`${id}:reply:${index}`)}" data-report-target-label="REPLY / ${String(index + 1).padStart(2, "0")}" data-report-target-excerpt="${escapeHtml(reply.text)}">REPORT</button>
              <span class="thread-share-status" data-share-status="${escapeHtml(`${id}:reply:${index}`)}" role="status" aria-live="polite"></span>
            </footer>
          </article>`,
        )
        .join("")
    : `<p class="thread-room__empty">No replies yet. Leave the first signal in the room.</p>`;

  return `<section class="thread-room" data-thread-root="${escapeHtml(id)}" aria-labelledby="thread-room-title">
    <header class="thread-room__header">
      <div>
        ${TerminalLabel("THREAD / WITHOUT NAMES")}
        <h2 id="thread-room-title">KEEP THE THOUGHT MOVING.</h2>
      </div>
      <span class="thread-room__signal"><i aria-hidden="true"></i> ${replyCount ? `RECEIVING / ${replyCount}` : "OPEN CHANNEL"}</span>
    </header>
    ${quotedText ? `<blockquote class="thread-room__quote" data-share-text data-share-id="${escapeHtml(id)}" data-share-kind="thread" data-share-label="ORIGINAL THREAD" data-share-category="IDENTITY" data-share-time="NOW">“${escapeHtml(quotedText)}”</blockquote>` : ""}
    <div class="thread-room__messages" aria-live="polite">${messages}</div>
    <form class="thread-room__composer${fullAccess ? "" : " thread-room__composer--locked"}" novalidate>
      <label class="ui-field thread-room__field" for="thread-reply-${escapeHtml(id)}">
        <span class="ui-field__label">QUOTE / REPLY WITHOUT A NAME</span>
        <textarea id="thread-reply-${escapeHtml(id)}" data-thread-input rows="4" placeholder="${fullAccess ? "Add your thought to the thread..." : "Full access requires a confirmed ZEC payment."}"${fullAccess ? "" : " disabled"}></textarea>
      </label>
      <div class="thread-room__composer-footer">
        <span>${fullAccess ? "NO HANDLE / NO PROFILE / NO TRAIL" : "READ ONLY / PAYMENT REQUIRED"}</span>
        ${PrimaryButton({ label: fullAccess ? "TRANSMIT REPLY →" : "FULL ACCESS REQUIRED", disabled: !fullAccess, dataAction: "thread-reply" })}
      </div>
    </form>
    <p class="thread-room__note">${fullAccess ? "LOCAL DEMO THREAD. A production room would stream anonymous replies from the backend without attaching a public identity." : "This account can read the room. Create a payment intent from Room Access and wait for the signed watcher confirmation before replying."}</p>
  </section>`;
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
            ${actionLink("BACK TO THE ROOM", "/room", "secondary")}
          </div>
        </main>`,
        "public-page--detail",
      ),
    };
  }

  if (isModerationHidden("thread", id)) {
    return {
      metadata,
      html: publicFrame(
        `/c/${id}`,
        `<main id="main-content" class="public-main detail-main">
          <div class="hidn-container--reading detail-page">
            ${TerminalLabel("MODERATION / CONTENT HIDDEN")}
            <h1 class="detail-page__title">TRANSMISSION HIDDEN</h1>
            ${SystemMessage("CONTENT UNAVAILABLE", "This transmission was hidden by a HIDN moderator. If the decision changes, the room will restore it without deleting the audit record.", "INFO")}
            ${actionLink("BACK TO THE ROOM", "/room", "secondary")}
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
            <p id="detail-thought" class="detail-card__thought" data-share-text data-share-id="${escapeHtml(confession.id)}" data-share-kind="thread" data-share-label="${escapeHtml(confession.reference)}" data-share-category="${escapeHtml(confession.category)}" data-share-time="${escapeHtml(confession.time)}">“${escapeHtml(confession.text)}”</p>
            <div class="detail-card__footer">
              ${CategoryTag(confession.category)}
              ${PrivacyBadge("NO IDENTITY")}
            </div>
          </article>
          <div class="detail-meta-grid">
            <div><span>LIKES</span><strong>${escapeHtml(String(reactionCountForThread(confession.id, confession.reactions)))}</strong></div>
            <div><span>COMMENTS</span><strong>${escapeHtml(String(repliesForThread(confession.id).filter((_, index) => !isModerationHidden("reply", `${confession.id}:reply:${index}`)).length))}</strong></div>
            <div><span>POSTED</span><strong>${escapeHtml(confession.relativeTime)}</strong></div>
          </div>
          ${SystemMessage("PROOF STATUS / DEMO ONLY", "The public card contains no proof material. This mock route does not verify a person or connect a network identity.", "DEMO")}
          <div class="detail-actions" aria-label="Confession actions">
            <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(confession.id)}" aria-pressed="${roomLikedIds.has(confession.id)}"${hasFullRoomAccess() ? "" : " disabled"}>♡ ${escapeHtml(String(reactionCountForThread(confession.id, confession.reactions)))}</button>
            <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">COMMENTS ${escapeHtml(String(repliesForThread(confession.id).filter((_, index) => !isModerationHidden("reply", `${confession.id}:reply:${index}`)).length))}</a>
            <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">QUOTE</a>
            <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(confession.id)}">SAVE IMAGE</button>
            <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(confession.id)}">SHARE IMAGE</button>
            <button class="room-message__action" type="button" data-action="thread-x-share" data-thread-id="${escapeHtml(confession.id)}">X / POST</button>
            <button class="room-message__action" type="button" data-action="report-open" data-report-target-type="thread" data-report-target-id="${escapeHtml(confession.id)}" data-report-target-label="${escapeHtml(confession.reference)}" data-report-target-excerpt="${escapeHtml(confession.text)}">REPORT</button>
          </div>
          <p class="thread-share-status thread-share-status--detail" data-share-status="${escapeHtml(confession.id)}" role="status" aria-live="polite"></p>
          ${roomReportNotice ? `<p class="thread-share-status thread-share-status--detail" role="status">${escapeHtml(roomReportNotice)}</p>` : ""}
          ${renderThreadRoom(confession.id, confession.text)}
          <p class="detail-boundary">NO PROFILE / NO AUTHOR PAGE / NO MORE FROM THIS PERSON</p>
          ${actionLink("BACK TO THE ROOM", "/room", "ghost", "detail-back")}
        </div>
        ${renderReportDialog()}
      </main>`,
      "public-page--detail",
    ),
  };
}

function createRoomDemoId(): string {
  const bytes = new Uint8Array(4);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
  }

  return `HIDN-DEMO-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function clearRoomSession(): void {
  if (roomEntryTimer !== undefined) {
    window.clearTimeout(roomEntryTimer);
    roomEntryTimer = undefined;
  }

  roomEntryTransitionActive = false;
  sessionStorage.removeItem("hidn:room:secret");
  sessionStorage.removeItem("hidn:room:backend-id");
  sessionStorage.removeItem("hidn:room:entered");
  sessionStorage.removeItem("hidn:room:verified");
  sessionStorage.removeItem("hidn:account:logged-in");
  sessionStorage.removeItem("hidn:account:user-id");
  sessionStorage.removeItem("hidn:account:username");
  sessionStorage.removeItem("hidn:account:access-level");
  sessionStorage.removeItem("hidn:account:payment-intent");
  sessionStorage.removeItem("hidn:account:verification-requested");
  void logoutAccount().catch(() => undefined);
  roomAccessMode = "choose";
  roomProfileOpen = false;
  roomDemoId = "";
  roomDemoMemo = "";
  roomLoginError = "";
  roomBackendStatus = "local";
  roomBackendId = "";
  roomAccountUsername = "";
  roomAccountAccessLevel = "read_only";
  roomPostComposerOpen = false;
  roomPostText = "";
  roomPostError = "";
  roomPostSubmitting = false;
  roomPosts = [];
  roomPostsLoadedChannel = undefined;
  roomAccountRecoveryCode = "";
  roomPaymentIntentId = "";
  roomPayment = undefined;
  roomVerificationRequested = false;
}

function restoreRoomAccountState(): void {
  if (sessionStorage.getItem("hidn:account:logged-in") !== "true") {
    return;
  }

  roomBackendId = sessionStorage.getItem("hidn:account:user-id") ?? "";
  roomAccountUsername = sessionStorage.getItem("hidn:account:username") ?? "";
  roomAccountAccessLevel = sessionStorage.getItem("hidn:account:access-level") === "full" ? "full" : "read_only";
  roomPaymentIntentId = sessionStorage.getItem("hidn:account:payment-intent") ?? "";
  roomVerificationRequested = sessionStorage.getItem("hidn:account:verification-requested") === "true" || Boolean(roomPaymentIntentId);
  roomBackendStatus = roomBackendId && roomAccountUsername ? "connected" : "offline";
  if (roomBackendStatus === "connected" && roomAccessMode === "choose") {
    roomAccessMode = "ready";
  }
}

function persistAccountSession(account: AccountResponse): void {
  roomBackendId = account.userId;
  roomAccountUsername = account.username;
  roomAccountAccessLevel = account.accessLevel;
  roomBackendStatus = "connected";
  sessionStorage.setItem("hidn:account:logged-in", "true");
  sessionStorage.setItem("hidn:account:user-id", account.userId);
  sessionStorage.setItem("hidn:account:username", account.username);
  sessionStorage.setItem("hidn:account:access-level", account.accessLevel);
}

function hasRoomSession(): boolean {
  return sessionStorage.getItem("hidn:account:logged-in") === "true"
    || (sessionStorage.getItem("hidn:room:verified") === "true" && Boolean(sessionStorage.getItem("hidn:room:secret")));
}

function hasFullRoomAccess(): boolean {
  return sessionStorage.getItem("hidn:account:access-level") === "full"
    || (sessionStorage.getItem("hidn:room:verified") === "true" && Boolean(sessionStorage.getItem("hidn:room:secret")));
}

function formattedZecAmount(zatoshis: number): string {
  return `${(zatoshis / 100_000_000).toFixed(8)} ZEC`;
}

function renderRoomEntryTransition(kind = roomEntryTransitionKind): string {
  const isReturning = kind === "return";
  return `<div class="room-entry-transition room-entry-transition--${isReturning ? "return" : "first"}" role="status" aria-live="polite">
    ${isReturning
      ? `<div class="room-entry-transition__rings" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`
      : `<div class="room-entry-transition__loader" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>`}
    <p class="room-entry-transition__label">${isReturning ? "RECONNECTING / PRIVATE ROOM" : "SEARCHING / PRIVATE ROOM"}<span aria-hidden="true">_</span></p>
    <span class="room-entry-transition__subline">${isReturning ? "ACCESS KEY ACCEPTED / RETURNING" : "ESTABLISHING ANONYMOUS CHANNEL"}</span>
  </div>`;
}

function startRoomEntryTransition(path = "/room", kind: RoomEntryTransitionKind = "return"): void {
  if (roomEntryTimer !== undefined) {
    window.clearTimeout(roomEntryTimer);
  }

  roomEntryTransitionActive = true;
  roomEntryTransitionKind = kind;
  sessionStorage.setItem("hidn:room:entered", "true");
  navigateProductRoute(path);
  roomEntryTimer = window.setTimeout(() => {
    roomEntryTransitionActive = false;
    roomEntryTimer = undefined;
    rerenderProductRoute();
  }, 2500);
}

async function registerRoomAccount(username: string): Promise<void> {
  try {
    const credential = generateZkCredential();
    const account = await signupZkAccount(username, publicKeyToHex(credential.publicKey));
    persistAccountSession(account);
    roomAccountRecoveryCode = credential.recoveryCode;
    roomPaymentIntentId = "";
    roomPayment = undefined;
    sessionStorage.removeItem("hidn:account:payment-intent");
    roomVerificationRequested = false;
    sessionStorage.removeItem("hidn:account:verification-requested");
    roomLoginError = "";
    roomAccessMode = "ready";
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not create this account.";
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

async function syncAccountLogin(username: string, recoveryCode: string): Promise<void> {
  try {
    let account: AccountResponse;
    try {
      const credential = credentialFromRecoveryCode(recoveryCode);
      const challenge = await requestZkChallenge(username);
      const message = buildZkChallengeMessage(username, challenge.challengeId, challenge.challenge);
      const proof = createZkProof(credential.secretKey, message);
      account = await verifyZkLogin({
        username,
        challengeId: challenge.challengeId,
        challenge: challenge.challenge,
        proof,
      });
    } catch (error) {
      // Keep the pre-milestone recovery-code accounts usable while their
      // records are migrated. New accounts always take the proof path above.
      if (recoveryCode.replace(/[\s-]/g, "").length >= 64) {
        throw error;
      }

      account = await loginAccount(username, recoveryCode);
    }
    persistAccountSession(account);
    roomAccountRecoveryCode = "";
    roomPayment = undefined;
    roomVerificationRequested = false;
    sessionStorage.removeItem("hidn:account:verification-requested");
    roomLoginError = "";
    startRoomEntryTransition("/room", "return");
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not log in this account.";
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

async function createRoomPaymentIntent(refundAddress: string): Promise<void> {
  try {
    roomBackendStatus = "connecting";
    roomVerificationRequested = true;
    sessionStorage.setItem("hidn:account:verification-requested", "true");
    roomLoginError = "";
    rerenderProductRoute();
    const payment = await createPaymentIntent(refundAddress);
    roomPayment = payment;
    roomPaymentIntentId = payment.paymentIntentId;
    sessionStorage.setItem("hidn:account:payment-intent", payment.paymentIntentId);
    roomBackendStatus = "connected";
    roomLoginError = "";
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not create a payment request.";
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

async function refreshRoomPayment(): Promise<void> {
  if (!roomPaymentIntentId) {
    return;
  }

  try {
    const payment = await fetchPaymentIntent(roomPaymentIntentId);
    roomPayment = payment;
    if (payment.status === "confirmed") {
      roomAccountAccessLevel = "full";
      sessionStorage.setItem("hidn:account:access-level", "full");
    } else if (payment.status === "reorged" || payment.status === "underpaid" || payment.status === "overpaid") {
      roomAccountAccessLevel = "read_only";
      sessionStorage.setItem("hidn:account:access-level", "read_only");
    }
    roomBackendStatus = "connected";
    roomLoginError = "";
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not read this payment request.";
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

function renderRoomAccessChooser(): string {
  return `<div class="room-access-page">
    <header class="room-access-header">
      ${TerminalLabel("HIDN / ROOM ACCESS")}
      <h1 class="type-display-lg room-access-header__title">CROSS THE<br /><em>THRESHOLD.</em></h1>
    </header>
    <div class="room-access-options">
      <article class="room-access-option">
        <div>
          <h2>BEGIN WITHOUT A NAME</h2>
          <p>Choose an anonymous handle to access the private room.</p>
        </div>
        ${SecondaryButton({ label: "SET UP PRIVATE ACCESS", dataAction: "room-create" })}
      </article>
      <article class="room-access-option">
        <div>
          <h2>CONTINUE WITHOUT A NAME</h2>
          <p>Enter your private handle and recovery key to return.</p>
        </div>
        ${SecondaryButton({ label: "ENTER THE ROOM", dataAction: "room-login" })}
      </article>
    </div>
    ${SystemMessage("ACCOUNT GATE", "Choose a pseudonymous account or return with the recovery key you keep on your side.", "LIVE")}
  </div>`;
}

function renderRoomCreate(): string {
  return `<div class="room-access-page">
    <header class="room-access-header room-access-header--compact">
      ${TerminalLabel("HIDN / CREATE ACCOUNT")}
      <h1 class="type-display-lg room-access-header__title">CHOOSE A<br /><em>HANDLE.</em></h1>
      <p class="room-access-header__copy">Choose HIDN- followed by letters or numbers, such as HIDN-NOIR42. The handle is a private lookup key, not an author name.</p>
    </header>
    <form class="room-login-card room-account-card" novalidate>
      <label class="room-access-field" for="room-account-username">
        <span>HIDN HANDLE / PRIVATE LOOKUP KEY</span>
        <div class="room-handle-input">
          <span class="room-handle-input__prefix" aria-hidden="true">HIDN-</span>
          <input id="room-account-username" type="text" placeholder="NOIR42" autocomplete="username" autocapitalize="characters" spellcheck="false" maxlength="25" pattern="[A-Za-z0-9]+" />
        </div>
      </label>
      <p class="room-payment-card__note">The browser creates a private recovery key and sends only its public commitment to D1. Save the key when it appears; do not use a real name.</p>
    </form>
    ${roomLoginError ? AlertMessage("WORKER RESPONSE", roomLoginError, "danger") : ""}
    <div class="room-access-actions">
      ${GhostButton({ label: "← BACK", dataAction: "room-back" })}
      ${SecondaryButton({ label: roomBackendStatus === "connecting" ? "CREATING ACCOUNT..." : "CREATE ACCOUNT →", disabled: roomBackendStatus === "connecting", dataAction: "room-create-account" })}
    </div>
  </div>`;
}

function renderRoomLogin(): string {
  return `<div class="room-access-page">
    <header class="room-access-header room-access-header--compact">
      ${TerminalLabel("HIDN / ACCOUNT LOGIN")}
      <h1 class="type-display-lg room-access-header__title">RETURN TO<br /><em>THE ROOM.</em></h1>
      <p class="room-access-header__copy">Use your HIDN handle and recovery key. The browser proves you hold it without sending the key to HIDN.</p>
    </header>
    ${roomLoginError ? AlertMessage("ID NEEDED", roomLoginError, "danger") : ""}
    <form class="room-login-card" novalidate>
      <label class="room-access-field" for="room-login-username">
        <span>HIDN HANDLE</span>
        <div class="room-handle-input">
          <span class="room-handle-input__prefix" aria-hidden="true">HIDN-</span>
          <input id="room-login-username" type="text" placeholder="NOIR42" autocomplete="username" autocapitalize="characters" spellcheck="false" maxlength="25" pattern="[A-Za-z0-9]+" />
        </div>
      </label>
      <label class="room-access-field" for="room-login-recovery-code">
        <span>RECOVERY KEY</span>
        <input id="room-login-recovery-code" type="text" placeholder="HIDN-XXXX-..." autocomplete="one-time-code" spellcheck="false" />
      </label>
      <p class="room-payment-card__note">The browser uses the key to answer a one-time Schnorr proof challenge. The recovery key is never sent to the Worker.</p>
      <div class="room-access-actions">
        ${GhostButton({ label: "← BACK", dataAction: "room-back" })}
        ${SecondaryButton({ label: "LOG IN →", dataAction: "room-submit-login" })}
      </div>
    </form>
  </div>`;
}

function roomPaymentStatusLabel(status: PaymentIntentResponse["status"]): string {
  switch (status) {
    case "confirmed":
      return "ZEC CONFIRMED / FULL ACCESS";
    case "detected":
      return "PAYMENT DETECTED / WAITING";
    case "underpaid":
      return "UNDERPAID / MANUAL REVIEW";
    case "overpaid":
      return "OVERPAID / MANUAL REVIEW";
    case "reorged":
      return "REORGED / ACCESS PAUSED";
    case "expired":
      return "INTENT EXPIRED";
    default:
      return "WAITING FOR ZEC";
  }
}

function renderRoomReady(): string {
  const isFull = roomAccountAccessLevel === "full";
  const payment = roomPayment;
  const accountLabel = roomAccountUsername ? `@${roomAccountUsername}` : "ACCOUNT SESSION";
  const showVerification = roomVerificationRequested && !isFull;
  const titleText = isFull ? "THE ROOM IS OPEN." : "THE ROOM IS VISIBLE.";
  const titleSignal = isFull ? "OPEN." : "VISIBLE.";
  const showResetAction = Boolean(roomAccountRecoveryCode || showVerification);
  const accountCopy = isFull
    ? `${accountLabel} is active with full room access.`
    : `${accountLabel} is active. Enter the room to view your channels. Profile verification is available later from the Channels menu.`;

  return `<div class="room-access-page room-access-page--ready">
    <header class="room-access-header room-access-header--compact">
      ${TerminalLabel(isFull ? "HIDN / FULL ACCESS" : "HIDN / READ ONLY")}
      <h1 class="type-display-lg room-access-header__title" aria-label="${escapeHtml(titleText)}">
        THE ROOM IS<br />
        <em>${escapeHtml(titleSignal)}</em>
      </h1>
      <p class="room-access-header__copy">${escapeHtml(accountCopy)}</p>
    </header>
    ${roomAccountRecoveryCode ? `<div class="room-access-key">
      <span class="room-access-key__label">RECOVERY KEY / SAVE THIS ONCE</span>
      <code>${escapeHtml(roomAccountRecoveryCode)}</code>
      <span class="room-access-key__warning">This is the only time HIDN shows the recovery key. D1 stores only a public commitment. HIDN cannot recover the key for you.</span>
    </div>` : ""}
    ${showVerification && payment ? `<section class="room-payment-card" aria-labelledby="room-payment-title">
      <div class="room-payment-card__header">
        <span class="room-payment-card__eyebrow">PAYMENT INTENT / MAINNET</span>
        <span class="room-payment-card__status"><span aria-hidden="true"></span>${escapeHtml(roomPaymentStatusLabel(payment.status))}</span>
      </div>
      <h2 id="room-payment-title">SEND THE EXACT AMOUNT</h2>
      <p class="room-payment-card__explainer">Use the receiving address and one-time reference below. HIDN grants full access only after the signed watcher reports the exact zatoshi amount with the required confirmations.</p>
      <code class="room-payment-card__address">${escapeHtml(payment.receivingAddress ?? "PAYMENT ADDRESS NOT CONFIGURED")}</code>
      <div class="room-payment-card__details">
        <div><span>EXACT AMOUNT</span><strong>${escapeHtml(formattedZecAmount(payment.expectedAmountZat))}</strong></div>
        <div><span>CONFIRMATIONS</span><strong>${escapeHtml(String(payment.confirmations))} / ${escapeHtml(String(payment.minimumConfirmations))}</strong></div>
      </div>
      <p class="room-payment-card__memo"><strong>MEMO REFERENCE</strong> <code>${escapeHtml(payment.paymentReference)}</code><br />Include this one-time reference in the wallet memo so the watcher can match the payment to your account. It is not a password.</p>
      <p class="room-payment-card__note">Refund address stored: ${payment.refundAddressStored ? "YES / ENCRYPTED" : "NO / AUTOMATIC REFUND NOT AVAILABLE"}. Wrong amounts and missing references are held for manual review and do not unlock the account.</p>
      ${PrimaryButton({ label: "CHECK PAYMENT STATUS →", dataAction: "room-check-payment" })}
    </section>` : showVerification ? `<form class="room-login-card room-payment-request-card" novalidate>
      <label class="room-access-field" for="room-refund-address">
        <span>REFUND ADDRESS / OPTIONAL BUT RECOMMENDED</span>
        <input id="room-refund-address" type="text" placeholder="zs1..." autocomplete="off" spellcheck="false" maxlength="240" />
      </label>
      <p class="room-payment-card__note">If a payment is underpaid, overpaid, or cannot be matched, a refund address lets an authorized payout process contact you. It is encrypted before D1 storage. No automatic refund is promised until a payout signer is configured.</p>
      ${PrimaryButton({ label: roomBackendStatus === "connecting" ? "CREATING PAYMENT REQUEST..." : "CREATE PAYMENT REQUEST →", disabled: roomBackendStatus === "connecting", dataAction: "room-create-payment-intent" })}
    </form>` : ""}
    <div class="room-access-actions">
      ${showResetAction ? GhostButton({ label: "START OVER", dataAction: "room-back" }) : ""}
      ${PrimaryButton({ label: "ENTER ROOM →", dataAction: "room-enter" })}
    </div>
  </div>`;
}

function renderRoomAccess(): RenderedProductRoute {
  restoreRoomAccountState();
  const content =
    roomAccessMode === "create"
      ? renderRoomCreate()
      : roomAccessMode === "login"
        ? renderRoomLogin()
        : roomAccessMode === "ready"
          ? renderRoomReady()
          : renderRoomAccessChooser();

  return {
    metadata: ROOM_METADATA,
    html: publicFrame(
      "/room/access",
      `<main id="main-content" class="public-main room-main room-access-main hidn-pointer-surface" data-pointer-surface>
        ${roomEntryTransitionActive ? renderRoomEntryTransition() : ""}
        <div class="room-access-atmosphere" aria-hidden="true">
          ${renderPointerSpotlight()}
          <div class="room-access-atmosphere__cards">${renderHomeRoomCards(6)}</div>
        </div>
        ${content}
      </main>`,
      "public-page--room",
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
      `public-page--placeholder${path === "/how-it-works" ? " public-page--how-it-works" : ""}`,
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
        <section class="home-room-stage hidn-pointer-surface" data-pointer-surface aria-labelledby="home-room-title">
          <div class="home-room-stars" aria-hidden="true"></div>
          <div class="home-room-noise" aria-hidden="true"></div>
          ${renderPointerSpotlight()}
          <div class="home-room-window">
            <div class="home-room-window__bar">
              <div class="home-room-window__controls">
                <span class="home-room-window__control home-room-window__control--close"></span>
                <span class="home-room-window__control home-room-window__control--minimize"></span>
                <span class="home-room-window__control home-room-window__control--maximize"></span>
              </div>
              <span class="home-room-window__title">HIDN://PRIVATE_ROOM</span>
              <div class="home-room-window__right">
                ${renderAmbientAudioControl()}
                ${renderVisitorTimeSignal("home-room-window__meta")}
              </div>
            </div>
          </div>
          <div class="home-room-card-field" aria-hidden="true">
            ${renderHomeRoomCards()}
          </div>
          <div class="home-room-core">
            <p class="home-room-core__eyebrow">${TerminalLabel("HIDN / PRIVATE ROOM")}</p>
            <h1 id="home-room-title">A ROOM<br />WITHOUT <em>NAMES.</em></h1>
            <p class="home-room-core__copy">A room for anonymous thoughts and unnamed conversations.</p>
            <a class="ui-button ui-button--primary home-room-enter" href="/room/access" data-room-enter data-glitch-text="> ENTER ROOM" aria-label="ENTER ROOM">
              <span class="home-room-enter__prompt" aria-hidden="true">&gt;</span><span>ENTER ROOM</span><span class="home-room-enter__cursor" aria-hidden="true">_</span>
            </a>
            <p class="home-room-core__status">WRITE FREELY / STAY UNKNOWN</p>
          </div>
          <aside class="home-room-invite" data-home-invite hidden aria-label="Private room invitation">
            <button class="home-room-invite__close" type="button" data-action="home-invite-close" aria-label="Dismiss room invitation">×</button>
            <span class="home-room-invite__eyebrow">SIGNAL DETECTED / ROOM OPEN</span>
            <p>What are you waiting for?</p>
            <span class="home-room-invite__copy">The room is already receiving.</span>
            <a class="home-room-invite__enter" href="/room/access" data-room-enter>ENTER ROOM <span aria-hidden="true">→</span></a>
          </aside>
        </section>
      </main>`,
      "public-page--home",
    ),
  };
}

export function renderProductRoute(path: string): RenderedProductRoute {
  const normalizedPath = normalizePath(path);

  if (isModerationSurfacePath(normalizedPath) && !moderationVisibilityReady) {
    return renderModerationGate(path);
  }

  if (normalizedPath === "/") {
    return renderHome();
  }

  if (normalizedPath === "/room") {
    return { metadata: EXPLORE_METADATA, html: renderExplore("/room") };
  }

  if (normalizedPath === "/room/access") {
    return renderRoomAccess();
  }

  if (normalizedPath === "/admin/reports") {
    return renderAdminReports();
  }

  if (normalizedPath === "/explore") {
    window.history.replaceState({}, "", "/room");
    return { metadata: EXPLORE_METADATA, html: renderExplore("/room") };
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
  bindRoomLikeInteractions(list);
}

function bindRoomLikeInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-action="room-like"]').forEach((button) => {
    button.addEventListener("click", () => {
      if (!hasFullRoomAccess()) {
        return;
      }

      const threadId = button.dataset.threadId;
      if (!threadId) {
        return;
      }

      const liked = roomLikedIds.has(threadId);
      const displayedCount = Number(button.textContent?.match(/\d+/)?.[0] ?? "0");
      const currentCount = reactionCountForThread(threadId, displayedCount);
      const nextCount = currentCount + (liked ? -1 : 1);
      if (liked) {
        roomLikedIds.delete(threadId);
      } else {
        roomLikedIds.add(threadId);
      }
      roomLikeCounts.set(threadId, Math.max(0, nextCount));

      if (normalizePath(window.location.pathname) === "/room" || normalizePath(window.location.pathname) === "/explore") {
        renderExploreFeed(root, activeFeedTab);
      } else {
        rerenderProductRoute();
      }
    });
  });
}

function bindRoomChannelInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>("[data-room-channel]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.roomChannel as RoomChannel | undefined;
      if (!key || !roomChannelOptions.some((channel) => channel.key === key)) {
        return;
      }

      activeRoomChannel = key;
      roomChannelNotice = "";
      roomPostComposerOpen = false;
      roomPostText = "";
      roomPostError = "";
      rerenderProductRoute();
    });
  });
}

function bindRoomFolderInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>("[data-room-folder-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const panelId = button.getAttribute("aria-controls");
      const panel = panelId ? root.querySelector<HTMLElement>(`#${panelId}`) : null;
      if (!panel) {
        return;
      }

      const isOpen = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isOpen));
      panel.hidden = isOpen;
      button.closest<HTMLElement>(".room-directory__folder")?.classList.toggle("room-directory__folder--open", !isOpen);
      const caret = button.querySelector<HTMLElement>(".room-directory__folder-caret");
      if (caret) {
        caret.textContent = isOpen ? "▸" : "▾";
      }
    });
  });
}

async function submitActiveReport(): Promise<void> {
  const target = activeReportTarget;
  if (!target || roomReportSubmitting) {
    return;
  }

  const reason = roomReportReason;
  const details = roomReportDetails;
  roomReportSubmitting = true;
  roomReportFeedback = "TRANSMITTING REPORT...";
  rerenderProductRoute();

  try {
    await submitReport({
      targetType: target.targetType,
      targetId: target.targetId,
      targetExcerpt: target.targetExcerpt,
      reason,
      details,
    });
    activeReportTarget = undefined;
    roomReportFeedback = "";
    roomReportDetails = "";
    roomReportNotice = "REPORT RECEIVED / MODERATION QUEUE UPDATED";
  } catch (error) {
    roomReportFeedback = error instanceof Error ? error.message : "The report could not be submitted.";
  } finally {
    roomReportSubmitting = false;
  }

  if (normalizePath(window.location.pathname).startsWith("/c/")) {
    rerenderProductRoute();
  }
}

async function loadAdminReports(): Promise<void> {
  if (!adminReportToken) {
    adminReportError = "Paste the REPORT_ADMIN_TOKEN before loading the queue.";
    adminReports = undefined;
    rerenderProductRoute();
    return;
  }

  adminReportLoading = true;
  adminReportError = "";
  rerenderProductRoute();
  try {
    adminReports = await fetchAdminReports(adminReportToken, adminReportFilter);
  } catch (error) {
    adminReports = undefined;
    adminReportError = error instanceof Error ? error.message : "Reports could not be loaded.";
  } finally {
    adminReportLoading = false;
  }

  if (normalizePath(window.location.pathname) === "/admin/reports") {
    rerenderProductRoute();
  }
}

async function updateAdminReportFromRoot(button: HTMLButtonElement): Promise<void> {
  const reportId = button.dataset.reportId;
  const card = button.closest<HTMLElement>("[data-admin-report-id]");
  const status = card?.querySelector<HTMLSelectElement>("[data-admin-report-status]")?.value as ReportStatus | undefined;
  const reviewerNote = card?.querySelector<HTMLTextAreaElement>("[data-admin-report-note]")?.value.trim() ?? "";
  if (!reportId || !status || !adminReportToken) {
    adminReportError = "Load the private report queue before updating a report.";
    rerenderProductRoute();
    return;
  }

  button.disabled = true;
  try {
    await updateAdminReport(adminReportToken, reportId, status, reviewerNote);
    adminReports = await fetchAdminReports(adminReportToken, adminReportFilter);
    adminReportError = "REPORT UPDATED / QUEUE REFRESHED";
  } catch (error) {
    adminReportError = error instanceof Error ? error.message : "The report could not be updated.";
  }

  if (normalizePath(window.location.pathname) === "/admin/reports") {
    rerenderProductRoute();
  }
}

async function moderateAdminContentFromRoot(button: HTMLButtonElement): Promise<void> {
  const reportId = button.dataset.reportId;
  const targetType = button.dataset.targetType;
  const targetId = button.dataset.targetId?.trim();
  const action = button.dataset.moderationAction;
  const reason = button.dataset.moderationReason?.trim() || "ADMIN ACTION";
  if (
    !reportId ||
    (targetType !== "thread" && targetType !== "reply") ||
    !targetId ||
    (action !== "approve" && action !== "hide" && action !== "reject") ||
    !adminReportToken
  ) {
    adminReportError = "Load the private report queue before changing content visibility.";
    rerenderProductRoute();
    return;
  }

  button.disabled = true;
  try {
    const result = await moderateAdminContent(adminReportToken, {
      targetType,
      targetId,
      action,
      reason,
      reportId,
    });
    await refreshModerationVisibility();
    adminReports = await fetchAdminReports(adminReportToken, adminReportFilter);
    const actionLabel = action === "approve" ? "RESTORED" : action === "reject" ? "REJECTED" : "HIDDEN";
    adminReportError = `${actionLabel} / MODERATION EVENT RECORDED${result.persistedContentRow ? "" : " / DEMO EVENT"}`;
  } catch (error) {
    adminReportError = error instanceof Error ? error.message : "The moderation action could not be recorded.";
  }

  if (normalizePath(window.location.pathname) === "/admin/reports") {
    rerenderProductRoute();
  }
}

function bindPointerSpotlightInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-pointer-surface]").forEach((surface) => {
    const updatePointer = (event: PointerEvent): void => {
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return;
      }

      const x = ((event.clientX - bounds.left) / bounds.width) * 100;
      const y = ((event.clientY - bounds.top) / bounds.height) * 100;
      surface.style.setProperty("--pointer-x", `${Math.max(0, Math.min(100, x))}%`);
      surface.style.setProperty("--pointer-y", `${Math.max(0, Math.min(100, y))}%`);
      surface.dataset.pointerActive = "true";
    };

    const resetPointer = (): void => {
      surface.dataset.pointerActive = "false";
    };

    surface.addEventListener("pointerenter", updatePointer, { passive: true });
    surface.addEventListener("pointermove", updatePointer, { passive: true });
    surface.addEventListener("pointerleave", resetPointer, { passive: true });
    surface.addEventListener("pointercancel", resetPointer, { passive: true });
  });
}

export function bindProductRoute(root: ParentNode = document): void {
  bindComponentInteractions(root);
  bindRoomLikeInteractions(root);
  bindRoomChannelInteractions(root);
  bindRoomFolderInteractions(root);
  bindPointerSpotlightInteractions(root);
  void refreshZcashNetworkStatus(root);
  startVisitorClock(root);
  const isRoomAccessPath = normalizePath(window.location.pathname) === "/room/access";
  if (isRoomAccessPath) {
    startRoomAccessActivity(root);
  } else {
    stopRoomAccessActivity();
  }
  if (isRoomAccessPath && roomAccessMode === "create") {
    void refreshRoomConfig(root);
  }
  if (isRoomAccessPath && roomPaymentIntentId && !roomPayment) {
    void refreshRoomPayment();
  }
  root.querySelectorAll<HTMLAnchorElement>('a[href="/"]').forEach((link) => {
    if (link.matches("[data-room-logout]") || link.textContent?.trim() === "LOG OUT" || link.textContent?.trim() === "LEAVE ROOM") {
      link.addEventListener("click", clearRoomSession);
    }
  });

  root.querySelectorAll<HTMLAnchorElement>("[data-room-enter]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const returning = hasRoomSession();
      startRoomEntryTransition(returning ? "/room" : "/room/access", returning ? "return" : "first");
    });
  });

  const normalizedPath = normalizePath(window.location.pathname);
  if (normalizedPath === "/room" && hasRoomSession()) {
    void refreshRoomPosts();
  }
  if (isModerationSurfacePath(normalizedPath)) {
    void refreshModerationVisibility();
  }
  if (normalizedPath !== "/admin/reports" && (adminReportToken || adminReports || adminReportError)) {
    adminReportToken = "";
    adminReports = undefined;
    adminReportError = "";
    adminReportFilter = "all";
  }
  root.querySelector<HTMLSelectElement>('[data-admin-report-filter]')?.addEventListener("change", (event) => {
    const filter = (event.currentTarget as HTMLSelectElement).value;
    if (filter !== "all" && filter !== "open" && filter !== "reviewed" && filter !== "dismissed" && filter !== "actioned") {
      return;
    }

    adminReportFilter = filter;
    void loadAdminReports();
  });
  const audioToggle = root.querySelector<HTMLButtonElement>("#home-audio-toggle");
  const isAudioSurface = Boolean(audioToggle);
  if (isAudioSurface) {
    if (normalizedPath === "/") {
      startHomeInvite(root);
    } else {
      stopHomeInvite();
      stopHomeStream();
      stopHomeHeadline();
    }
    const audioContextAvailable = typeof window.AudioContext !== "undefined"
      || typeof (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== "undefined";
    if (audioToggle && !audioContextAvailable) {
      setHomeAudioUnavailable(root);
    } else {
      const shouldResumeAudio = readHomeAudioPreference()
        || (normalizedPath === "/" && !hasHomeAudioPreference());
      if (shouldResumeAudio) {
        startHomeAudio(root);
      } else if (homeAmbientAudioSession) {
        setHomeAudioState(root, true);
      }
      audioToggle?.addEventListener("click", () => {
        toggleHomeAudio(root);
      });
    }
  } else {
    stopHomeInvite();
    stopHomeStream();
    stopHomeHeadline();
    stopHomeAudio();
  }

  root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      switch (button.dataset.action) {
        case "report-open": {
          const targetType = button.dataset.reportTargetType;
          if (targetType !== "thread" && targetType !== "reply" && targetType !== "account") {
            break;
          }

          activeReportTarget = {
            targetType,
            targetId: button.dataset.reportTargetId ?? "",
            targetExcerpt: button.dataset.reportTargetExcerpt ?? "",
            label: button.dataset.reportTargetLabel ?? "REPORTED SURFACE",
          };
          roomReportReason = "spam";
          roomReportDetails = "";
          roomReportFeedback = "";
          rerenderProductRoute();
          break;
        }
        case "report-close":
          activeReportTarget = undefined;
          roomReportFeedback = "";
          roomReportDetails = "";
          roomReportSubmitting = false;
          rerenderProductRoute();
          break;
        case "report-submit": {
          const reason = root.querySelector<HTMLSelectElement>("#hidn-report-reason")?.value ?? "";
          const details = root.querySelector<HTMLTextAreaElement>("#hidn-report-details")?.value.trim() ?? "";
          if (!REPORT_REASON_OPTIONS.some((option) => option.value === reason)) {
            roomReportFeedback = "Choose a report reason before sending.";
            rerenderProductRoute();
            break;
          }

          roomReportReason = reason as ReportReason;
          roomReportDetails = details;
          void submitActiveReport();
          break;
        }
        case "admin-reports-load": {
          const token = root.querySelector<HTMLInputElement>("#admin-report-token")?.value.trim() ?? "";
          if (token) {
            adminReportToken = token;
          }
          const filter = root.querySelector<HTMLSelectElement>("#admin-report-filter")?.value ?? adminReportFilter;
          if (filter === "all" || filter === "open" || filter === "reviewed" || filter === "dismissed" || filter === "actioned") {
            adminReportFilter = filter;
          }
          void loadAdminReports();
          break;
        }
        case "admin-reports-clear":
          adminReportToken = "";
          adminReports = undefined;
          adminReportError = "";
          adminReportFilter = "all";
          rerenderProductRoute();
          break;
        case "admin-report-update":
          void updateAdminReportFromRoot(button);
          break;
        case "admin-report-moderate":
          void moderateAdminContentFromRoot(button);
          break;
        case "selection-save":
          void shareSelectedTexts(root, activeTextSelection ? [activeTextSelection] : [], "save");
          break;
        case "selection-share":
          void shareSelectedTexts(root, activeTextSelection ? [activeTextSelection] : [], "share");
          break;
        case "selection-add":
          if (activeTextSelection) {
            const alreadySelected = selectedTextBatch.some(
              (item) => item.id === activeTextSelection?.id && item.text === activeTextSelection.text,
            );
            if (!alreadySelected) {
              selectedTextBatch = [...selectedTextBatch, activeTextSelection];
            }
            updateSelectionBatch(root);
            setSelectionStatus(root, `${selectedTextBatch.length} TEXT SIGNAL${selectedTextBatch.length === 1 ? "" : "S"} READY`);
          }
          break;
        case "selection-batch-share":
          void shareSelectedTexts(root, selectedTextBatch, "share");
          break;
        case "selection-batch-clear":
          selectedTextBatch = [];
          updateSelectionBatch(root);
          setSelectionStatus(root, "TEXT BATCH CLEARED");
          break;
        case "selection-close":
          activeTextSelection = undefined;
          hideSelectionTools(root);
          break;
        case "home-invite-close": {
          stopHomeInvite();
          const invite = root.querySelector<HTMLElement>("[data-home-invite]");
          if (invite) {
            invite.hidden = true;
            invite.dataset.state = "dismissed";
            scheduleHomeInvite(root, 30000);
          }
          break;
        }
        case "room-menu-toggle": {
          const menu = button.closest<HTMLElement>("[data-room-menu]");
          const panel = menu?.querySelector<HTMLElement>(".room-menu__panel");
          if (!panel) {
            break;
          }

          const isOpen = !panel.hidden;
          panel.hidden = isOpen;
          button.setAttribute("aria-expanded", String(!isOpen));
          button.setAttribute("aria-label", isOpen ? "Open private room menu" : "Close private room menu");
          menu?.classList.toggle("room-menu--open", !isOpen);
          break;
        }
        case "room-profile-toggle":
          roomProfileOpen = !roomProfileOpen;
          button.setAttribute("aria-expanded", String(roomProfileOpen));
          root.querySelector<HTMLElement>("#room-profile-status")?.toggleAttribute("hidden", !roomProfileOpen);
          break;
        case "room-open-verification":
          if (roomAccountAccessLevel === "full") {
            break;
          }

          roomVerificationRequested = true;
          roomAccessMode = "ready";
          sessionStorage.setItem("hidn:account:verification-requested", "true");
          navigateProductRoute("/room/access");
          break;
        case "room-create":
          roomAccessMode = "create";
          roomLoginError = "";
          roomBackendStatus = "local";
          rerenderProductRoute();
          break;
        case "room-login":
          roomAccessMode = "login";
          roomLoginError = "";
          rerenderProductRoute();
          break;
        case "room-back":
          clearRoomSession();
          roomAccessMode = "choose";
          rerenderProductRoute();
          break;
        case "room-create-account": {
          const input = root.querySelector<HTMLInputElement>("#room-account-username");
          const handle = completeRoomHandle(input?.value ?? "");
          if (!ROOM_HANDLE_PATTERN.test(handle)) {
            roomLoginError = "Choose a handle in the format HIDN-NOIR42: HIDN- followed by letters or numbers only.";
            rerenderProductRoute();
            break;
          }

          roomBackendStatus = "connecting";
          roomLoginError = "";
          rerenderProductRoute();
          void registerRoomAccount(handle);
          break;
        }
        case "room-verify-demo":
          if (roomBackendStatus !== "connected" || !roomBackendId || !roomDemoId) {
            roomLoginError = "Wait for the Worker to issue your access code before verifying the demo payment.";
            rerenderProductRoute();
            break;
          }

          roomBackendStatus = "connecting";
          roomLoginError = "";
          rerenderProductRoute();
          void verifyRoomBackend();
          break;
        case "room-submit-login": {
          const usernameInput = root.querySelector<HTMLInputElement>("#room-login-username");
          const recoveryInput = root.querySelector<HTMLInputElement>("#room-login-recovery-code");
          const username = completeRoomHandle(usernameInput?.value ?? "");
          const recoveryCode = recoveryInput?.value.trim() ?? "";
          if (!ROOM_HANDLE_PATTERN.test(username) || !recoveryCode) {
            roomLoginError = "Enter a HIDN handle and your recovery key before continuing.";
            rerenderProductRoute();
            break;
          }

          roomLoginError = "";
          roomBackendStatus = "connecting";
          rerenderProductRoute();
          void syncAccountLogin(username, recoveryCode);
          break;
        }
        case "room-create-payment-intent": {
          const input = root.querySelector<HTMLInputElement>("#room-refund-address");
          const refundAddress = input?.value.trim() ?? "";
          void createRoomPaymentIntent(refundAddress);
          break;
        }
        case "room-check-payment":
          roomBackendStatus = "connecting";
          roomLoginError = "";
          rerenderProductRoute();
          void refreshRoomPayment();
          break;
        case "room-enter":
          startRoomEntryTransition("/room", "return");
          break;
        case "room-create-post":
          roomPostComposerOpen = true;
          roomPostError = "";
          roomChannelNotice = "";
          rerenderProductRoute();
          break;
        case "room-post-cancel":
          roomPostComposerOpen = false;
          roomPostText = "";
          roomPostError = "";
          rerenderProductRoute();
          break;
        case "room-post-submit": {
          roomPostText = root.querySelector<HTMLTextAreaElement>("#room-post-content")?.value ?? roomPostText;
          void submitRoomPost();
          break;
        }
        case "thread-reply": {
          if (!hasFullRoomAccess()) {
            break;
          }

          const threadRoot = button.closest<HTMLElement>("[data-thread-root]");
          const input = threadRoot?.querySelector<HTMLTextAreaElement>("[data-thread-input]");
          const value = input?.value.trim() ?? "";
          if (!threadRoot || !value) {
            input?.focus();
            break;
          }

          const threadId = threadRoot.dataset.threadRoot;
          if (threadId) {
            repliesForThread(threadId).push({ text: value, time: "JUST NOW" });
            rerenderProductRoute();
          }
          break;
        }
        case "thread-save-image":
          void shareThreadImage(root, button.dataset.threadId ?? "", "save", replyIndexFromButton(button));
          break;
        case "thread-share-image":
          void shareThreadImage(root, button.dataset.threadId ?? "", "share", replyIndexFromButton(button));
          break;
        case "thread-x-share":
          void shareThreadImage(root, button.dataset.threadId ?? "", "x", replyIndexFromButton(button));
          break;
        default:
          break;
      }
    });
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

  bindTextSelectionInteractions(root);
}
