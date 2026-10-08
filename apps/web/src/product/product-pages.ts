import {
  AlertMessage,
  CategoryTag,
  EmptyState,
  ErrorState,
  FooterShell,
  GhostButton,
  HidnDoorLogo,
  ManifestoStatement,
  NavigationShell,
  PrimaryButton,
  PrivacyBadge,
  SecondaryButton,
  StatusDot,
  StatusIndicator,
  SystemMessage,
  TerminalLabel,
  TransmissionDivider,
  LoadingState,
  bindComponentInteractions,
  escapeHtml,
} from "@hidn/ui";
import {
  EXPLORE_METADATA,
  HOME_METADATA,
  PUBLIC_SITE_ORIGIN,
  ROOM_METADATA,
  webPageStructuredData,
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
import { fetchShieldedScanStats, type ShieldedScanStats } from "./shieldedscan";
import {
  buildZkChallengeMessage,
  credentialFromRecoveryCode,
  createZkProof,
  generateZkCredential,
  publicKeyToHex,
} from "@hidn/zk";
import {
  canonicalAnonymousMessage,
  createAnonymousCircuitInput,
  anonymousIdentityFromRecoveryCode,
  createAnonymousIdentity,
  createAnonymousScope,
  type AnonymousAction,
  type AnonymousCircuitInput,
  type AnonymousIdentity,
  type AnonymousMerkleWitness,
} from "@hidn/anonymous-zk";
import * as QRCode from "qrcode";
import {
  createPaymentIntent,
  createAnonymousPost,
  createAnonymousReaction,
  createAnonymousReply,
  createRoomPost,
  createRoomReply,
  createRoomSession,
  enrollAnonymousMember,
  fetchAnonymousStatus,
  fetchAccountNotifications,
  fetchAccountTipAddress,
  fetchAnonymousNotifications,
  fetchAnonymousPosts,
  fetchAnonymousThread,
  fetchAccountSession,
  fetchAdminAudit,
  fetchAdminModerators,
  fetchAdminSession,
  createAdminModerator,
  fetchRoomActivity,
  fetchRoomPosts,
  fetchRoomThread,
  fetchRoomReactionState,
  fetchAdminReports,
  fetchModerationVisibility,
  fetchPaymentIntent,
  fetchRoomConfig,
  loginAccount,
  loginRoomSession,
  logoutAccount,
  markAccountNotificationsRead,
  markAnonymousNotificationsRead,
  moderateAdminContent,
  requestZkChallenge,
  saveAccountTipAddress,
  signupZkAccount,
  submitReport,
  toggleRoomReaction,
  updateAdminModerator,
  updateAdminReport,
  verifyRecoveryQuestions,
  verifyZkLogin,
  verifyRoomDemoPayment,
  type AdminAuditEvent,
  type AdminModerator,
  type AdminRole,
  type AdminReportsResponse,
  type AdminSession,
  type AccountAccessLevel,
  type AccountNotification,
  type AccountNotificationsResponse,
  type AccountResponse,
  type AnonymousStatusResponse,
  type AnonymousProofEnvelope,
  type ModerationTargetType,
  type PaymentIntentResponse,
  type RoomActivityEvent,
  type RoomComment,
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
type RoomChannel = "general" | "love" | "redacted" | "blackbox" | "night-shift" | "underground";
type RoomAccessMode = "choose" | "create" | "login" | "ready";
type RoomRecoveryRevealMode = "hidden" | "prompt" | "visible";
type RoomEntryTransitionKind = "first" | "return";
type ShareCardType = "THREAD" | "REPLY" | "TEXT" | "BATCH";
type DeviceSignalPost = RoomPost & { status: RoomComment["status"] };

interface ShareCardStyle {
  background: [string, string, string];
  signalGlow: [string, string, string];
  scanline: string;
  grid: string;
  frameFill: string;
  border: string;
  accent: string;
  code: string;
  text: string;
  muted: string;
  apertureFill: [string, string, string];
  apertureGlow: string;
}

const SHARE_CARD_STYLE: ShareCardStyle = {
  background: ["#020202", "#101010", "#030303"],
  signalGlow: ["rgba(255, 255, 255, 0.12)", "rgba(190, 190, 190, 0.04)", "rgba(255, 255, 255, 0)"],
  scanline: "rgba(255, 255, 255, 0.055)",
  grid: "rgba(255, 255, 255, 0.035)",
  frameFill: "rgba(13, 13, 13, 0.5)",
  border: "rgba(245, 245, 240, 0.28)",
  accent: "#f2f2ec",
  code: "#d7d7cf",
  text: "#f4f4ee",
  muted: "#b8b8b0",
  apertureFill: ["rgba(18, 18, 18, 0.9)", "rgba(9, 9, 9, 0.76)", "rgba(130, 130, 130, 0.12)"],
  apertureGlow: "rgba(245, 245, 240, 0.16)",
};

interface DeviceSignalHistory {
  version: 1;
  posts: DeviceSignalPost[];
  comments: RoomComment[];
}

const ROOM_FREE_POST_MAX_LENGTH = 500;
const ROOM_FREE_REPLY_MAX_LENGTH = 500;
const ROOM_VERIFIED_POST_MAX_LENGTH = 2000;
const ROOM_VERIFIED_REPLY_MAX_LENGTH = 1200;
const ROOM_ACCOUNT_RECOVERY_KEY_STORAGE = "hidn:account:recovery-key";
const ROOM_ANONYMOUS_SESSION_STORAGE = "hidn:anonymous:session";
const ROOM_SESSION_TTL_MS = 60 * 60 * 1000;
const ROOM_SESSION_EXPIRES_AT_STORAGE = "hidn:room:session-expires-at";
const ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE = "hidn:anonymous:tip-address";
const ROOM_DEVICE_HISTORY_STORAGE = "hidn:signals:device-history";
const ROOM_RECOVERY_CONFIRMATIONS = [
  "Do you understand that this is your recovery key to the private room?",
  "Do you understand that HIDN cannot recover this key if you lose it?",
] as const;

function roomPostCharacterLimit(): number {
  return roomAccountAccessLevel === "full" ? ROOM_VERIFIED_POST_MAX_LENGTH : ROOM_FREE_POST_MAX_LENGTH;
}

function roomReplyCharacterLimit(): number {
  return roomAccountAccessLevel === "full" ? ROOM_VERIFIED_REPLY_MAX_LENGTH : ROOM_FREE_REPLY_MAX_LENGTH;
}

function roomPostLimitCopy(): string {
  return roomAccountAccessLevel === "full"
    ? `Verified access allows posts up to ${roomPostCharacterLimit().toLocaleString()} characters.`
    : `Free access allows posts up to ${roomPostCharacterLimit()} characters. Verify with ZEC for more.`;
}

function roomReplyLimitCopy(): string {
  return roomAccountAccessLevel === "full"
    ? `VERIFIED ACCESS / UP TO ${roomReplyCharacterLimit().toLocaleString()} CHARACTERS.`
    : `FREE ACCESS / UP TO ${roomReplyCharacterLimit()} CHARACTERS. VERIFY WITH ZEC FOR MORE.`;
}

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
let roomAccountWasCreated = false;
let roomSessionValidationRequest: Promise<void> | undefined;
let roomAnonymousIdentity: AnonymousIdentity | undefined;
let roomAnonymousWitness: AnonymousMerkleWitness | undefined;
let roomAnonymousStatus: AnonymousStatusResponse | undefined;
let roomAnonymousSubmitting = false;
let roomLoginSubmitting = false;
let roomDeviceHistory: DeviceSignalHistory | undefined;
let roomDeviceHistoryScope = "";
let roomTipAddress = "";
let roomTipAddressDraft = "";
let roomTipAddressLoaded = false;
let roomTipAddressRequest: Promise<void> | undefined;
let roomTipAddressSaving = false;
let roomTipAddressFeedback = "";
let roomTipAddressError = "";
let roomTipPostId = "";
let roomTipCopyFeedback = "";
let roomTipAddressCopyFeedback = "";
let roomNotifications: AccountNotificationsResponse | undefined;
let roomNotificationsRequest: Promise<void> | undefined;
let roomNotificationsTimer: number | undefined;
let roomNotificationsOpen = false;
let roomNotificationsError = "";
let roomNotificationsMarkingRead = false;
let roomReplySubmitting = false;
let roomLocalComments: RoomComment[] = [];
let roomRecoveryRevealMode: RoomRecoveryRevealMode = "hidden";
let roomRecoveryRevealError = "";
let roomRecoveryRevealTimer: number | undefined;
let roomRecoveryVerificationSubmitting = false;
let roomRecoveryUsernameInput = "";
let roomRecoveryConfirmations: [boolean, boolean] = [false, false];
let roomPaymentIntentId = "";
let roomPayment: PaymentIntentResponse | undefined;
let roomVerificationRequested = false;
let roomVerificationNoticeOpen = false;
let activeRoomChannel: RoomChannel = "general";
let roomChannelNotice = "";
let roomPostComposerOpen = false;
let roomPostText = "";
let roomPostTipsEnabled = false;
let roomPostTipAddressDraft = "";
let roomPostTipAddressEdited = false;
let roomPostError = "";
let roomPostSubmitting = false;
let roomPosts: RoomPost[] = [];
let roomPendingPostIds = new Set<string>();
let roomPostsLoadedChannel: RoomChannel | undefined;
let roomPostsRequest: Promise<void> | undefined;
let roomRefreshSubmitting = false;
const roomThreadDetailRequests = new Map<string, Promise<void>>();
const roomThreadDetailLoaded = new Set<string>();
const roomThreadDetailErrors = new Map<string, string>();
let roomReactionStateKey = "";
let roomReactionStateRequest: Promise<void> | undefined;
let roomLiveActivityEvents: RoomActivityEvent[] = [];
let roomLiveActivityRequest: Promise<void> | undefined;
let roomLiveActivityTimer: number | undefined;
let roomLiveActivityStatus: "connecting" | "live" | "offline" = "connecting";
let activeReportTarget: ReportTarget | undefined;
let roomReportReason: ReportReason = "spam";
let roomReportDetails = "";
let roomReportFeedback = "";
let roomReportNotice = "";
let roomReportSubmitting = false;
let adminReportToken = "";
let adminSession: AdminSession | undefined;
let adminSessionLoaded = false;
let adminReports: AdminReportsResponse | undefined;
let adminModerators: AdminModerator[] | undefined;
let adminModeratorsLoaded = false;
let adminAuditEvents: AdminAuditEvent[] | undefined;
let adminAuditLoaded = false;
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
  replies?: number;
  tipAddress?: string | null;
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
  { key: "love", label: "LETTING GO", description: "what remains after goodbye", categories: ["RELATIONSHIPS", "REGRET", "LONELINESS"] },
  { key: "blackbox", label: "BLACKBOX", description: "strange ideas, no explanations", categories: ["UNCERTAINTY", "IDENTITY", "FEAR"] },
  { key: "redacted", label: "REDACTED", description: "what you won’t say publicly", categories: ["IDENTITY", "UNCERTAINTY"] },
  { key: "night-shift", label: "NIGHT SHIFT", description: "posts made after midnight", categories: ["LONELINESS", "FEAR", "IDENTITY"] },
  { key: "underground", label: "THE UNDERGROUND", description: "what stays unsaid", categories: ["IDENTITY", "UNCERTAINTY", "JOY"] },
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
  voiceTextureSource: AudioBufferSourceNode;
  oscillators: OscillatorNode[];
}

const HOME_STREAM_LIMIT = 4;
const HOME_AUDIO_SRC = "/audio/hidn-recording-source.m4a";
const HOME_AUDIO_SOURCE_VOLUME = 0.55;
const HOME_AUDIO_MASTER_GAIN = 0.50587;
const HOME_AUDIO_TEMPO = 54;
const HOME_AUDIO_BEATS_PER_LOOP = 16;
const HOME_AUDIO_PREFERENCE_KEY = "hidn:audio:enabled";
const ROOM_ENTRY_SIGNAL_VOLUME = 0.16;
const HOME_HEADLINE_LINES = ["SAY WHAT YOU", "CAN'T SAY", "PUBLICLY."] as const;
const ROOM_HANDLE_PATTERN = /^HIDN-[A-Z0-9]{1,20}$/i;
const SHIELDEDSCAN_CACHE_DURATION_MS = 60_000;
const ZCASH_STATUS_CAROUSEL_INTERVAL_MS = 4_500;
const MODERATION_GATE_MIN_DURATION_MS = 800;
const ROOM_LIVE_ACTIVITY_REFRESH_MS = 10_000;
const ROOM_NOTIFICATION_REFRESH_MS = 5_000;
const ROOM_RECOVERY_REVEAL_DURATION_MS = 20_000;

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
let cachedShieldedScanStats: ShieldedScanStats | undefined;
let cachedShieldedScanStatsAt = 0;
let shieldedScanStatsRequest: Promise<ShieldedScanStats> | undefined;
let zcashStatusCarouselTimer: number | undefined;
let zcashStatusCarouselRun = 0;
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

function createAnonymousProofInWorker(input: AnonymousCircuitInput): Promise<AnonymousProofEnvelope> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("This browser cannot generate the anonymous proof locally."));
  }

  const wasmUrl = new URL("/anonymous-zk/hidn_membership_js/hidn_membership.wasm", window.location.origin).toString();
  const zkeyUrl = new URL("/anonymous-zk/hidn_membership_final.zkey", window.location.origin).toString();

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../anonymous-proof-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ type: "proof" | "error"; proof?: AnonymousProofEnvelope; message?: string }>) => {
      worker.terminate();
      if (event.data.type === "proof" && event.data.proof) {
        resolve(event.data.proof);
        return;
      }
      reject(new Error(event.data.message ?? "The anonymous proof could not be generated."));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("The anonymous proof worker could not be started."));
    };
    worker.postMessage({ input, wasmUrl, zkeyUrl });
  });
}

async function createAnonymousRoomProof(
  action: AnonymousAction,
  targetType: "room" | "thread" | "reply",
  targetId: string,
  content: string,
  tipAddress = "",
): Promise<{ scope: string; proof: AnonymousProofEnvelope }> {
  if (!roomAnonymousIdentity || !roomAnonymousWitness) {
    throw new Error("The anonymous room session is not available. Return with your recovery key first.");
  }

  const scope = createAnonymousScope();
  const message = canonicalAnonymousMessage(action, targetType, targetId, content, tipAddress);
  const input = createAnonymousCircuitInput(roomAnonymousIdentity.secret, roomAnonymousWitness, scope, message);
  const proof = await createAnonymousProofInWorker(input);
  return { scope, proof };
}

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

function formatNotificationDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatTransmissionTime(value);
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date).toUpperCase();
  return `${dateLabel} / ${formatTransmissionTime(value)}`;
}

function formatPrivateTotal(value: number | undefined): string {
  return value === undefined ? "--" : String(value).padStart(2, "0");
}

function deviceSignalHistoryScope(): string {
  if (roomAnonymousIdentity?.commitment) {
    return `anonymous:${roomAnonymousIdentity.commitment}`;
  }

  if (roomAccountUsername) {
    return `account:${roomAccountUsername.toLowerCase()}`;
  }

  return roomBackendId ? `account:${roomBackendId}` : "local";
}

function emptyDeviceSignalHistory(): DeviceSignalHistory {
  return { version: 1, posts: [], comments: [] };
}

function loadDeviceSignalHistory(): DeviceSignalHistory {
  const scope = deviceSignalHistoryScope();
  if (roomDeviceHistory && roomDeviceHistoryScope === scope) {
    return roomDeviceHistory;
  }

  const fallback = emptyDeviceSignalHistory();
  try {
    const stored = window.localStorage.getItem(`${ROOM_DEVICE_HISTORY_STORAGE}:${scope}`);
    if (!stored) {
      roomDeviceHistory = fallback;
      roomDeviceHistoryScope = scope;
      return fallback;
    }

    const parsed = JSON.parse(stored) as Partial<DeviceSignalHistory>;
    const history: DeviceSignalHistory = {
      version: 1,
      posts: Array.isArray(parsed.posts) ? parsed.posts as DeviceSignalPost[] : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments as RoomComment[] : [],
    };
    roomDeviceHistory = history;
    roomDeviceHistoryScope = scope;
    return history;
  } catch {
    roomDeviceHistory = fallback;
    roomDeviceHistoryScope = scope;
    return fallback;
  }
}

function saveDeviceSignalHistory(history: DeviceSignalHistory): void {
  roomDeviceHistory = history;
  roomDeviceHistoryScope = deviceSignalHistoryScope();
  try {
    window.localStorage.setItem(
      `${ROOM_DEVICE_HISTORY_STORAGE}:${roomDeviceHistoryScope}`,
      JSON.stringify(history),
    );
  } catch {
    // The current tab still retains the history if browser storage is unavailable.
  }
}

function rememberDeviceSignalPost(post: RoomPost): void {
  const history = loadDeviceSignalHistory();
  const storedPost: DeviceSignalPost = { ...post, status: "visible" };
  saveDeviceSignalHistory({
    ...history,
    posts: [storedPost, ...history.posts.filter((item) => item.id !== storedPost.id)],
  });
}

function refreshDeviceSignalPost(post: RoomPost): void {
  const history = loadDeviceSignalHistory();
  if (!history.posts.some((item) => item.id === post.id)) {
    return;
  }

  saveDeviceSignalHistory({
    ...history,
    posts: history.posts.map((item) => item.id === post.id ? { ...item, ...post, status: item.status } : item),
  });
}

function rememberDeviceSignalComment(comment: RoomComment): void {
  const history = loadDeviceSignalHistory();
  saveDeviceSignalHistory({
    ...history,
    comments: [comment, ...history.comments.filter((item) => item.id !== comment.id)],
  });
}

function deviceSignalStats(history: DeviceSignalHistory): { posts: number; comments: number; likes: number } {
  return {
    posts: history.posts.length,
    comments: history.comments.length,
    likes: history.posts.reduce((total, post) => total + Math.max(0, post.reactions), 0),
  };
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
    replies: post.replies,
    tipAddress: post.tipAddress,
  };
}

function mockConfessionFromRoomPost(post: RoomPost): MockConfession {
  return {
    id: post.id,
    reference: post.reference,
    text: post.text,
    category: isMockCategory(post.category) ? post.category : "IDENTITY",
    channel: post.channel,
    relativeTime: formatTransmissionTime(post.time),
    reactions: post.reactions,
    time: post.time,
  };
}

function shareableConfessionForId(id: string): MockConfession | undefined {
  const mockConfession = getMockConfession(id);
  if (mockConfession) {
    return mockConfession;
  }

  const post = roomPosts.find((candidate) => candidate.id === id);
  if (!post) {
    return undefined;
  }

  return mockConfessionFromRoomPost(post);
}

function roomTipPost(): RoomPost | undefined {
  return roomTipPostId ? roomPosts.find((post) => post.id === roomTipPostId) : undefined;
}

function roomTipPaymentUri(post: RoomPost): string {
  return `zcash:${post.tipAddress}`;
}

function renderRoomTipDialog(): string {
  const post = roomTipPost();
  if (!post?.tipAddress) {
    return "";
  }

  const paymentUri = roomTipPaymentUri(post);
  return `<div class="room-tip-dialog" role="dialog" aria-modal="true" aria-labelledby="room-tip-dialog-title">
    <button class="room-tip-dialog__backdrop" type="button" data-action="room-tip-close" aria-label="Close testnet tip dialog"></button>
    <section class="room-tip-dialog__panel">
      <header class="room-tip-dialog__header">
        <div>
          ${TerminalLabel("TESTNET / DIRECT TIP")}
          <h2 id="room-tip-dialog-title">SUPPORT THIS<br /><em>THOUGHT.</em></h2>
        </div>
        <button class="room-tip-dialog__close" type="button" data-action="room-tip-close" aria-label="Close testnet tip dialog">×</button>
      </header>
      <p class="room-tip-dialog__intro">Send any amount of TAZ directly from your shielded testnet wallet to the post author. Choose the amount in your wallet. HIDN never holds the funds.</p>
      <div class="room-tip-dialog__request">
        <canvas class="room-tip-dialog__qr" data-tip-qr data-tip-uri="${escapeHtml(paymentUri)}" width="220" height="220" aria-label="QR code for a direct Zcash testnet tip"></canvas>
        <div class="room-tip-dialog__details">
          <span class="room-tip-dialog__label">SHIELDED TESTNET DESTINATION</span>
          <button class="room-tip-dialog__address" type="button" data-action="room-tip-copy-address" data-tip-address="${escapeHtml(post.tipAddress)}" aria-label="Copy shielded testnet destination">
            <code>${escapeHtml(post.tipAddress)}</code>
            <span>${roomTipAddressCopyFeedback || "TAP TO COPY ADDRESS"}</span>
          </button>
          <span class="room-tip-dialog__label">PAYMENT REQUEST</span>
          <code class="room-tip-dialog__uri">${escapeHtml(paymentUri)}</code>
        </div>
      </div>
      <div class="room-tip-dialog__actions">
        <a class="ui-button ui-button--primary" href="${escapeHtml(paymentUri)}">OPEN IN WALLET →</a>
        <button class="ui-button ui-button--secondary" type="button" data-action="room-tip-copy" data-tip-uri="${escapeHtml(paymentUri)}">${roomTipCopyFeedback || "COPY PAYMENT REQUEST"}</button>
      </div>
      <p class="room-tip-dialog__wallet-note">If no wallet opens here, copy the payment request and paste it into your testnet wallet.</p>
      <p class="room-tip-dialog__note">TESTNET ONLY / TAZ HAS NO MONETARY VALUE. V1 creates the request; it does not issue a payment receipt or confirm a transaction yet.</p>
    </section>
  </div>`;
}

function hydrateRoomTipQr(root: ParentNode): void {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-tip-qr]");
  const paymentUri = canvas?.dataset.tipUri;
  if (!canvas || !paymentUri) {
    return;
  }

  void QRCode.toCanvas(canvas, paymentUri, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#dcecdf",
      light: "#031008",
    },
  }).catch(() => {
    canvas.dataset.state = "unavailable";
  });
}

async function copyRoomTipText(value: string): Promise<boolean> {
  let copied = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      // Use the temporary-input fallback below.
    }
  }

  if (!copied) {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    input.remove();
  }

  return copied;
}

async function copyRoomTipRequest(button: HTMLButtonElement): Promise<void> {
  const paymentUri = button.dataset.tipUri?.trim();
  if (!paymentUri) {
    return;
  }

  const copied = await copyRoomTipText(paymentUri);

  roomTipCopyFeedback = copied ? "PAYMENT REQUEST COPIED" : "COPY FAILED / SELECT THE REQUEST";
  rerenderProductRoute();
  window.setTimeout(() => {
    if (roomTipCopyFeedback) {
      roomTipCopyFeedback = "";
      if (roomTipPostId) {
        rerenderProductRoute();
      }
    }
  }, 1800);
}

async function copyRoomTipAddress(button: HTMLButtonElement): Promise<void> {
  const address = button.dataset.tipAddress?.trim();
  if (!address) {
    return;
  }

  const copied = await copyRoomTipText(address);
  roomTipAddressCopyFeedback = copied ? "ADDRESS COPIED" : "COPY FAILED / SELECT THE ADDRESS";
  rerenderProductRoute();
  window.setTimeout(() => {
    if (roomTipAddressCopyFeedback) {
      roomTipAddressCopyFeedback = "";
      if (roomTipPostId) {
        rerenderProductRoute();
      }
    }
  }, 1800);
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

function replyCountForThread(id: string, fallback = 0): number {
  const persistedPost = roomPosts.find((post) => post.id === id);
  return Math.max(persistedPost?.replies ?? fallback, repliesForThread(id).length);
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

function mockReactionBaseCount(id: string): number {
  return getMockConfession(id)?.reactions ?? 0;
}

function roomReactionTargetIds(path: string): string[] {
  if (path.startsWith("/c/")) {
    try {
      return [decodeURIComponent(path.slice(3).split("/")[0]).trim().toUpperCase()];
    } catch {
      return [];
    }
  }

  if (path !== "/room" && !roomChannelFromPath(path)) {
    return [];
  }

  const persistedIds = roomPosts
    .filter((post) => post.channel === activeRoomChannel && !isModerationHidden("thread", post.id))
    .map((post) => post.id);
  return [...new Set(persistedIds)];
}

function roomReactionStateSignature(path: string): string {
  return roomReactionTargetIds(path).join("|");
}

async function refreshRoomReactionState(path = normalizePath(window.location.pathname)): Promise<void> {
  if (roomAnonymousIdentity) {
    return;
  }

  const targetIds = roomReactionTargetIds(path);
  const signature = targetIds.join("|");
  if (!targetIds.length || signature === roomReactionStateKey) {
    return;
  }

  if (roomReactionStateRequest) {
    await roomReactionStateRequest;
    if (signature === roomReactionStateKey) {
      return;
    }
  }

  const requestedPath = path;
  const request = fetchRoomReactionState("thread", targetIds)
    .then((response) => {
      for (const state of response.reactions) {
        roomLikeCounts.set(state.targetId, mockReactionBaseCount(state.targetId) + state.reactions);
        if (state.liked) {
          roomLikedIds.add(state.targetId);
        } else {
          roomLikedIds.delete(state.targetId);
        }
      }
      roomReactionStateKey = signature;
      if (normalizePath(window.location.pathname) === requestedPath) {
        rerenderProductRoute();
      }
    })
    .catch(() => {
      // Reaction state is additive; the existing local count remains usable if the optional read fails.
    });
  roomReactionStateRequest = request;
  try {
    await request;
  } finally {
    if (roomReactionStateRequest === request) {
      roomReactionStateRequest = undefined;
    }
  }
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
  const tipAction = threadId && transmission.tipAddress
    ? `<button class="room-message__action room-message__action--tip" type="button" data-action="room-tip" data-thread-id="${escapeHtml(threadId)}">TIP WITH TAZ</button>`
    : "";
  const shareTextAttributes = threadId
    ? `data-share-text data-share-id="${escapeHtml(threadId)}" data-share-kind="thread" data-share-label="${escapeHtml(transmission.reference ?? "ANONYMOUS THREAD")}" data-share-category="${escapeHtml(transmission.category ?? "IDENTITY")}" data-share-time="${escapeHtml(transmission.time)}"`
    : "";
  const replyCount = threadId ? replyCountForThread(threadId, transmission.replies) : 0;
  const action = options.href && threadId
    ? `<div class="transmission-row__actions">
        <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(threadId)}" aria-pressed="${roomLikedIds.has(threadId)}"${hasRoomSession() ? "" : " disabled"}>♡ ${reactionCountForThread(threadId, transmission.reactions)}</button>
        <a class="room-message__action" href="${escapeHtml(options.href)}">REPLIES ${replyCount}</a>
        <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(threadId)}">SAVE IMAGE</button>
        <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(threadId)}">SHARE IMAGE</button>
        ${tipAction}
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

type ZcashStatusMetric = "block" | "price" | "transactions" | "shielded" | "market-cap";

const ZCASH_STATUS_METRICS: readonly ZcashStatusMetric[] = [
  "block",
  "price",
  "transactions",
  "shielded",
  "market-cap",
];

function getShieldedScanStats(): Promise<ShieldedScanStats> {
  if (
    cachedShieldedScanStats &&
    Date.now() - cachedShieldedScanStatsAt < SHIELDEDSCAN_CACHE_DURATION_MS
  ) {
    return Promise.resolve(cachedShieldedScanStats);
  }

  if (!shieldedScanStatsRequest) {
    shieldedScanStatsRequest = fetchShieldedScanStats()
      .then((stats) => {
        cachedShieldedScanStats = stats;
        cachedShieldedScanStatsAt = Date.now();
        return stats;
      })
      .finally(() => {
        shieldedScanStatsRequest = undefined;
      });
  }

  return shieldedScanStatsRequest;
}

function stopZcashStatusCarousel(): void {
  if (zcashStatusCarouselTimer !== undefined) {
    window.clearInterval(zcashStatusCarouselTimer);
    zcashStatusCarouselTimer = undefined;
  }
  zcashStatusCarouselRun += 1;
}

function formatZcashUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2,
    style: "currency",
  }).format(value);
}

function formatZcashCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function formatZcashSupply(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value)} ZEC`;
}

function zcashStatusLabel(metric: ZcashStatusMetric, stats: ShieldedScanStats): string {
  switch (metric) {
    case "price":
      return stats.priceUsd === null ? "ZEC PRICE / UNAVAILABLE" : `ZEC PRICE / ${formatZcashUsd(stats.priceUsd)}`;
    case "transactions":
      return stats.transactions24h === null
        ? "TRANSACTIONS 24H / UNAVAILABLE"
        : `TRANSACTIONS 24H / ${new Intl.NumberFormat("en-US").format(stats.transactions24h)}`;
    case "shielded":
      return stats.shieldedSupplyZec === null
        ? "SHIELDED SUPPLY / UNAVAILABLE"
        : `SHIELDED SUPPLY / ${formatZcashSupply(stats.shieldedSupplyZec)}`;
    case "market-cap":
      return stats.marketCapUsd === null
        ? "ZEC MARKET CAP / UNAVAILABLE"
        : `ZEC MARKET CAP / ${formatZcashCompactUsd(stats.marketCapUsd)}`;
    case "block":
    default:
      return `BUILT ON ZCASH / BLOCK #${new Intl.NumberFormat("en-US").format(stats.blockHeight)}`;
  }
}

function zcashStatusTitle(metric: ZcashStatusMetric, stats: ShieldedScanStats): string {
  const label = zcashStatusLabel(metric, stats);
  return `${label} / ShieldedScan mainnet data`;
}

function setZcashStatusMetric(
  statuses: HTMLElement[],
  metric: ZcashStatusMetric,
  stats: ShieldedScanStats,
): void {
  const label = zcashStatusLabel(metric, stats);
  statuses.forEach((status) => {
    if (!status.isConnected) {
      return;
    }

    const statusLabel = status.querySelector<HTMLElement>("[data-zcash-status-label]");
    if (statusLabel) {
      statusLabel.textContent = label;
    } else {
      status.textContent = label;
    }
    status.dataset.zcashMetric = metric;
    status.dataset.zcashState = "live";
    status.title = zcashStatusTitle(metric, stats);
  });
}

async function refreshZcashNetworkStatus(root: ParentNode): Promise<void> {
  stopZcashStatusCarousel();
  const carouselRun = zcashStatusCarouselRun;
  const statuses = Array.from(root.querySelectorAll<HTMLElement>("[data-zcash-status]"));
  if (!statuses.length) {
    return;
  }

  statuses.forEach((status) => {
    status.setAttribute("aria-live", "polite");
    status.dataset.zcashState = "loading";
    status.title = "Loading current Zcash network data from ShieldedScan.";
    status.querySelector<HTMLElement>("[data-zcash-status-label]")?.replaceChildren("LOADING ZCASH DATA...");
  });

  try {
    const stats = await getShieldedScanStats();
    if (carouselRun !== zcashStatusCarouselRun) {
      return;
    }

    let metricIndex = 0;
    setZcashStatusMetric(statuses, ZCASH_STATUS_METRICS[metricIndex], stats);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const carouselTimer = window.setInterval(() => {
      if (carouselRun !== zcashStatusCarouselRun) {
        window.clearInterval(carouselTimer);
        return;
      }

      if (!statuses.some((status) => status.isConnected)) {
        stopZcashStatusCarousel();
        return;
      }

      metricIndex = (metricIndex + 1) % ZCASH_STATUS_METRICS.length;
      setZcashStatusMetric(statuses, ZCASH_STATUS_METRICS[metricIndex], stats);
    }, ZCASH_STATUS_CAROUSEL_INTERVAL_MS);
    zcashStatusCarouselTimer = carouselTimer;
  } catch {
    if (carouselRun !== zcashStatusCarouselRun) {
      return;
    }

    statuses.forEach((status) => {
      if (!status.isConnected) {
        return;
      }

      const statusLabel = status.querySelector<HTMLElement>("[data-zcash-status-label]");
      if (statusLabel) {
        statusLabel.textContent = "ZCASH DATA / UNAVAILABLE";
      }
      status.dataset.zcashState = "unavailable";
      status.title = "ShieldedScan could not provide current Zcash network data.";
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

function createHomeAudioVoiceTextureBuffer(context: AudioContext): AudioBuffer {
  const beatFrames = Math.round(context.sampleRate * (60 / HOME_AUDIO_TEMPO));
  const frameCount = beatFrames * HOME_AUDIO_BEATS_PER_LOOP;
  const buffer = context.createBuffer(2, frameCount, context.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const addVocalTexture = (
    startBeat: number,
    lengthBeats: number,
    fundamental: number,
    gain: number,
    pan: number,
  ): void => {
    const startFrame = Math.max(0, Math.floor(startBeat * beatFrames));
    const length = Math.min(Math.floor(lengthBeats * beatFrames), frameCount - startFrame);
    if (length <= 0) {
      return;
    }

    const duration = length / context.sampleRate;
    const isShortGesture = lengthBeats < 0.5;
    const attackTime = isShortGesture ? 0.016 : 0.45;
    const releaseTime = isShortGesture ? 0.11 : 0.7;
    let phase = 0;

    for (let offset = 0; offset < length; offset += 1) {
      const time = offset / context.sampleRate;
      const remaining = duration - time;
      const attack = 1 - Math.exp(-time / attackTime);
      const release = Math.min(1, remaining / releaseTime);
      const envelope = attack * release;
      const pitchDrift = 1 + (Math.sin((Math.PI * 2 * time * 0.7) + startBeat) * 0.018);
      phase += (Math.PI * 2 * fundamental * pitchDrift) / context.sampleRate;

      // Tonal breath: intentionally nonverbal, like a voice heard through a wall.
      const voiced = (Math.sin(phase) * 0.52)
        + (Math.sin(phase * 2.01 + 0.35) * 0.24)
        + (Math.sin(phase * 3.02 + 1.1) * 0.1)
        + (Math.sin(phase * 4.03 + 1.8) * 0.1)
        + (Math.sin(phase * 5.01 + 2.4) * 0.04);
      const breath = (Math.sin((phase * 4.7) + time * 19) * 0.16)
        + (Math.sin((phase * 7.3) - time * 13) * 0.1);
      const sample = (voiced + breath) * envelope * gain;
      const leftGain = 0.84 - (pan * 0.16);
      const rightGain = 0.84 + (pan * 0.16);
      left[startFrame + offset] += sample * leftGain;
      right[startFrame + offset] += sample * rightGain;
    }
  };

  const addChuckle = (startBeat: number, gain: number, pan: number): void => {
    [0, 0.22, 0.42].forEach((offset, index) => {
      addVocalTexture(startBeat + offset, 0.16 - (index * 0.01), 205 - (index * 24), gain * (1 - index * 0.14), pan);
    });
  };

  addVocalTexture(1.65, 2.25, 148, 0.075, -0.28);
  addVocalTexture(8.8, 2.05, 132, 0.064, 0.3);
  addChuckle(3.8, 0.11, -0.2);
  addChuckle(11.65, 0.09, 0.24);

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
    const voiceTone = context.createBiquadFilter();
    const voiceGain = context.createGain();
    const voiceEchoDelay = context.createDelay(0.9);
    const voiceEchoFeedback = context.createGain();
    const voiceEchoWetGain = context.createGain();
    const stringTone = context.createBiquadFilter();
    const sourceGain = context.createGain();
    const stringGain = context.createGain();
    const outputGain = context.createGain();
    const stringSource = context.createBufferSource();
    const voiceTextureSource = context.createBufferSource();
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
    voiceTone.type = "bandpass";
    voiceTone.frequency.value = 650;
    voiceTone.Q.value = 0.55;
    voiceGain.gain.value = 0.24;
    voiceEchoDelay.delayTime.value = 0.48;
    voiceEchoFeedback.gain.value = 0.2;
    voiceEchoWetGain.gain.value = 0.17;
    outputGain.gain.value = HOME_AUDIO_MASTER_GAIN;

    wowOscillator.frequency.value = 0.12;
    wowDepth.gain.value = 8;
    flutterOscillator.frequency.value = 3.7;
    flutterDepth.gain.value = 0.7;
    stringSource.buffer = createHomeAudioStringBuffer(context);
    stringSource.loop = true;
    voiceTextureSource.buffer = createHomeAudioVoiceTextureBuffer(context);
    voiceTextureSource.loop = true;

    const source = context.createMediaElementSource(audio);
    source.connect(sourceGain);
    sourceGain.connect(mixBus);
    stringSource.connect(stringTone);
    stringTone.connect(stringGain);
    stringGain.connect(mixBus);
    voiceTextureSource.connect(voiceTone);
    voiceTone.connect(voiceGain);
    voiceGain.connect(mixBus);
    voiceGain.connect(voiceEchoDelay);
    voiceEchoDelay.connect(voiceEchoFeedback);
    voiceEchoFeedback.connect(voiceEchoDelay);
    voiceEchoDelay.connect(voiceEchoWetGain);
    voiceEchoWetGain.connect(mixBus);

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
    voiceTextureSource.start();
    oscillators.forEach((oscillator) => oscillator.start());

    return { context, stringSource, voiceTextureSource, oscillators };
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
      session.graph.voiceTextureSource.stop();
    } catch {
      // The voice texture may already be stopped during route teardown.
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

function playRoomEntrySignal(): void {
  // Respect an explicit ambient-sound opt-out while keeping the first visit
  // eligible for a small, user-triggered interface signal.
  if (hasHomeAudioPreference() && !readHomeAudioPreference()) {
    return;
  }

  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  try {
    const context = new AudioContextConstructor();
    const output = context.createGain();
    const filter = context.createBiquadFilter();
    const echo = context.createDelay(0.5);
    const echoGain = context.createGain();
    const toneGain = context.createGain();
    const carrier = context.createOscillator();
    const undertone = context.createOscillator();
    const now = context.currentTime;

    output.gain.value = ROOM_ENTRY_SIGNAL_VOLUME;
    filter.type = "lowpass";
    filter.frequency.value = 1850;
    filter.Q.value = 0.6;
    echo.delayTime.value = 0.18;
    echoGain.gain.value = 0.16;
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.22, now + 0.018);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    carrier.type = "triangle";
    carrier.frequency.setValueAtTime(680, now);
    carrier.frequency.exponentialRampToValueAtTime(255, now + 0.28);
    carrier.detune.setValueAtTime(-4, now);
    undertone.type = "sine";
    undertone.frequency.setValueAtTime(190, now);
    undertone.frequency.exponentialRampToValueAtTime(112, now + 0.3);
    undertone.detune.setValueAtTime(5, now);

    carrier.connect(toneGain);
    undertone.connect(toneGain);
    toneGain.connect(filter);
    filter.connect(output);
    filter.connect(echo);
    echo.connect(echoGain);
    echoGain.connect(output);
    output.connect(context.destination);
    carrier.start(now);
    undertone.start(now);
    carrier.stop(now + 0.38);
    undertone.stop(now + 0.38);
    void context.resume().catch(() => undefined);
    window.setTimeout(() => {
      void context.close();
    }, 850);
  } catch {
    // The room transition should never be blocked by an unavailable audio API.
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
  const expandedWords: string[] = [];

  // Split an unusually long word before measuring lines so a handle, URL, or
  // unbroken sentence can never run outside the rounded card.
  words.forEach((word) => {
    if (ctx.measureText(word).width <= maxWidth) {
      expandedWords.push(word);
      return;
    }

    let chunk = "";
    for (const character of word) {
      const candidate = `${chunk}${character}`;
      if (chunk && ctx.measureText(candidate).width > maxWidth) {
        expandedWords.push(chunk);
        chunk = character;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) {
      expandedWords.push(chunk);
    }
  });

  const allLines: string[] = [];
  let current = "";
  expandedWords.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      allLines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) {
    allLines.push(current);
  }

  const truncated = allLines.length > maxLines;
  const lines = allLines.slice(0, maxLines);
  if (truncated && lines.length) {
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
  const canvas = document.createElement("canvas");
  // Keep the export compact enough to feel like a shareable conversation card,
  // not a poster with a large empty tail.
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas rendering is unavailable.");
  }

  const colors = SHARE_CARD_STYLE;

  const messageItems = focusReply
    ? [confession.text, focusReply.reply.text]
    : [confession.text, ...(cardType === "BATCH" ? (suppliedReplies ?? []).map((reply) => reply.text) : [])];
  const visibleMessageItems = messageItems.filter((text) => text.trim()).slice(0, 3);
  const messageCount = Math.max(visibleMessageItems.length, 1);
  const cardX = 88;
  const cardY = 160;
  const cardWidth = canvas.width - cardX * 2;
  const contentX = cardX + 68;
  const contentRight = cardX + cardWidth - 68;
  const contentWidth = contentRight - contentX;
  const quoteFontSize = messageCount === 1 ? 54 : 42;
  const maxLines = messageCount === 1 ? 8 : Math.max(2, Math.floor(9 / messageCount));
  const measuringContext = ctx;
  measuringContext.font = "700 " + quoteFontSize + "px ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
  const messageLayouts = visibleMessageItems.map((text) => {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    const lines = wrapCanvasText(measuringContext, "“" + normalizedText + "”", contentWidth, maxLines);
    const lineHeight = Math.round(quoteFontSize * 1.16);
    return { lines, lineHeight, blockHeight: lines.length * lineHeight };
  });
  const messageBlockHeight = messageLayouts.reduce(
    (height, layout, index) => height + layout.blockHeight + (index < messageLayouts.length - 1 ? 46 : 0),
    0,
  );
  const quoteStartY = cardY + 150;
  const metadataLineY = quoteStartY + messageBlockHeight + 46;
  const metadataTextY = metadataLineY + 50;
  const footerY = metadataTextY + 104;
  const cardHeight = footerY - cardY + 68;
  canvas.height = Math.max(960, cardY + cardHeight + 120);

  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, colors.background[0]);
  background.addColorStop(0.48, colors.background[1]);
  background.addColorStop(1, colors.background[2]);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const signalGlow = ctx.createRadialGradient(930, 420, 20, 930, 420, 740);
  signalGlow.addColorStop(0, colors.signalGlow[0]);
  signalGlow.addColorStop(0.42, colors.signalGlow[1]);
  signalGlow.addColorStop(1, colors.signalGlow[2]);
  ctx.fillStyle = signalGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = colors.scanline;
  for (let y = 0; y < canvas.height; y += 8) {
    ctx.fillRect(0, y, canvas.width, 1);
  }

  const handleWidth = 96;
  const handleHeight = 10;
  drawCanvasRoundedRect(ctx, (canvas.width - handleWidth) / 2, 22, handleWidth, handleHeight, handleHeight / 2);
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = colors.muted;
  ctx.fill();
  ctx.restore();

  drawCanvasRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 40);
  const apertureFill = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY);
  apertureFill.addColorStop(0, colors.apertureFill[0]);
  apertureFill.addColorStop(0.72, colors.apertureFill[1]);
  apertureFill.addColorStop(1, colors.apertureFill[2]);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = apertureFill;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const apertureGlow = ctx.createLinearGradient(cardX + cardWidth - 300, cardY, cardX + cardWidth, cardY);
  apertureGlow.addColorStop(0, colors.signalGlow[2]);
  apertureGlow.addColorStop(1, colors.apertureGlow);
  ctx.save();
  drawCanvasRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 40);
  ctx.clip();
  ctx.fillStyle = apertureGlow;
  ctx.fillRect(cardX + cardWidth - 300, cardY, 300, cardHeight);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = colors.muted;
  ctx.globalAlpha = 0.2;
  ctx.font = "700 320px Georgia, \"Times New Roman\", serif";
  ctx.textAlign = "start";
  ctx.fillText("“", cardX + 46, cardY + 260);
  ctx.textAlign = "right";
  ctx.fillText("”", cardX + cardWidth - 40, cardY + cardHeight - 48);
  ctx.restore();

  const referenceLabel = String(confession.reference ?? ("// " + confession.id)).toUpperCase();
  ctx.fillStyle = colors.accent;
  ctx.font = "600 22px Satoshi, ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
  ctx.textAlign = "start";
  ctx.fillText("HIDN / THE ROOM", contentX, cardY + 68);

  ctx.fillStyle = colors.code;
  ctx.font = "500 19px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(referenceLabel.slice(0, 26), contentRight, cardY + 68);

  const roomLabel = (confession.category || "GENERAL").toUpperCase();

  let cursorY = quoteStartY;
  ctx.textAlign = "start";
  ctx.font = "500 " + quoteFontSize + "px Satoshi, ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
  messageLayouts.forEach(({ lines, lineHeight, blockHeight }, index) => {
    ctx.fillStyle = index === 0 ? colors.text : colors.muted;
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, contentX, cursorY + lineIndex * lineHeight);
    });
    cursorY += blockHeight + (index < visibleMessageItems.length - 1 ? 46 : 0);
  });

  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX, metadataLineY);
  ctx.lineTo(contentRight, metadataLineY);
  ctx.stroke();

  ctx.fillStyle = colors.muted;
  ctx.font = "500 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "start";
  ctx.fillText(roomLabel, contentX, metadataTextY);

  ctx.fillStyle = colors.muted;
  ctx.font = "600 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "start";
  ctx.fillText("HIDN://THE_ROOM", contentX, footerY);
  ctx.fillStyle = colors.accent;
  ctx.font = "500 19px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText("PRIVATE ROOMS WITHOUT NAMES", contentRight, footerY);

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
    channel: activeRoomChannel,
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

async function shareSelectedTexts(
  root: ParentNode,
  items: SelectedTextItem[],
  mode: "save" | "share",
): Promise<void> {
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

async function shareThreadImage(
  root: ParentNode,
  id: string,
  mode: "save" | "share" | "x",
  replyIndex?: number,
): Promise<void> {
  const confession = shareableConfessionForId(id);
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
    const blob = await createThreadImage(cardConfession, undefined, focusReply ? "REPLY" : "TEXT");
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

function renderLiveRoomActivity(): string {
  const activity = roomLiveActivityEvents[0];
  const statusLabel = roomLiveActivityStatus === "live"
    ? "LIVE FEED"
    : roomLiveActivityStatus === "offline"
      ? "SIGNAL OFFLINE"
      : "LISTENING FOR SIGNAL";
  const message = activity
    ? `<p data-room-activity-message role="status" aria-live="polite"><span class="room-access-activity__actor">${escapeHtml(activity.actor)}</span> <span class="room-access-activity__action">${escapeHtml(activity.action)}</span> <span class="room-access-activity__subject">${escapeHtml(activity.subject)}</span></p>`
    : `<p data-room-activity-message role="status" aria-live="polite">WAITING FOR A LIVE SIGNAL</p>`;

  return `<section class="room-access-activity" aria-label="Live room activity">
    <div class="room-access-activity__header">
      <span><i aria-hidden="true"></i> LIVE ROOM ACTIVITY</span>
      <span>${statusLabel}</span>
    </div>
    ${message}
  </section>`;
}

function updateLiveRoomActivitySurface(): void {
  const surface = document.querySelector<HTMLElement>(".room-access-activity");
  if (!surface) {
    return;
  }

  const statusLabel = roomLiveActivityStatus === "live"
    ? "LIVE FEED"
    : roomLiveActivityStatus === "offline"
      ? "SIGNAL OFFLINE"
      : "LISTENING FOR SIGNAL";
  const status = surface.querySelector<HTMLElement>(".room-access-activity__header span:last-child");
  if (status) {
    status.textContent = statusLabel;
  }

  const message = surface.querySelector<HTMLElement>("[data-room-activity-message]");
  if (!message) {
    return;
  }

  message.replaceChildren();
  const activity = roomLiveActivityEvents[0];
  if (!activity) {
    message.textContent = "WAITING FOR A LIVE SIGNAL";
    return;
  }

  const actor = document.createElement("span");
  actor.className = "room-access-activity__actor";
  actor.textContent = activity.actor;
  const action = document.createElement("span");
  action.className = "room-access-activity__action";
  action.textContent = activity.action;
  const subject = document.createElement("span");
  subject.className = "room-access-activity__subject";
  subject.textContent = activity.subject;
  message.append(actor, " ", action, " ", subject);
}

async function refreshLiveRoomActivity(): Promise<void> {
  if (roomLiveActivityRequest) {
    return roomLiveActivityRequest;
  }

  roomLiveActivityRequest = fetchRoomActivity()
    .then((response) => {
      roomLiveActivityEvents = response.activities;
      roomLiveActivityStatus = "live";
      updateLiveRoomActivitySurface();
    })
    .catch(() => {
      roomLiveActivityStatus = "offline";
      updateLiveRoomActivitySurface();
    })
    .finally(() => {
      roomLiveActivityRequest = undefined;
    });

  return roomLiveActivityRequest;
}

function startLiveRoomActivity(): void {
  if (roomLiveActivityTimer !== undefined) {
    return;
  }

  roomLiveActivityStatus = "connecting";
  void refreshLiveRoomActivity();
  roomLiveActivityTimer = window.setInterval(() => {
    void refreshLiveRoomActivity();
  }, ROOM_LIVE_ACTIVITY_REFRESH_MS);
}

function stopLiveRoomActivity(): void {
  if (roomLiveActivityTimer !== undefined) {
    window.clearInterval(roomLiveActivityTimer);
    roomLiveActivityTimer = undefined;
  }
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
    centerContent: normalizedPath === "/room/access" ? renderLiveRoomActivity() : "",
    descriptor: normalizedPath === "/" ? "ANONYMOUS INTERNET NOIR" : "",
    showIdentity: normalizedPath !== "/room/access",
    showStatus: normalizedPath !== "/room/access",
    status: normalizedPath === "/" ? "PRIVATE ROOM" : "BUILT ON ZCASH",
    links,
  });
}

function renderRoomMenu(): string {
  const profileName = roomAnonymousIdentity ? "ANONYMOUS" : roomAccountUsername || "HIDN-LOCAL";
  const profileVerified = roomAccountAccessLevel === "full";

  return `<div class="room-menu" data-room-menu>
    <button class="room-menu__toggle" type="button" data-action="room-menu-toggle" aria-expanded="false" aria-controls="room-channel-menu" aria-label="Open private room menu">
      <span class="room-menu__icon" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="room-menu__label">CHANNELS</span>
    </button>
    <div class="room-menu__panel" id="room-channel-menu" hidden>
      <div class="room-menu__panel-head">
        <span class="room-menu__signal"><i aria-hidden="true"></i> PRIVATE ROOM</span>
      </div>
      <a class="room-menu__profile" href="/room/profile" aria-label="Open private profile">
        <span class="room-menu__profile-mark" aria-hidden="true">◎</span>
        <span class="room-menu__profile-copy">
          <strong>PROFILE</strong>
          <small>${escapeHtml(profileName)}</small>
        </span>
        <span class="room-menu__profile-state">${escapeHtml(profileVerified ? "VERIFIED" : "NOT VERIFIED")}</span>
      </a>
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

  const roomChannel = roomChannelFromPath(normalizedPath);
  if (roomChannel) {
    return `ROOM_${roomChannel.toUpperCase()}`;
  }

  if (normalizedPath === "/") {
    return "PRIVATE_ROOM";
  }

  return normalizedPath.slice(1).replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

function publicWindowChrome(path: string, showRoomMenu = false, showZcashStatus = false): string {
  const normalizedPath = normalizePath(path);

  return `<div class="public-page__signal-bar">
      <span class="public-page__signal-brand">${HidnDoorLogo({ className: "public-page__signal-logo", label: "HIDN home" })}</span>
      ${normalizedPath.startsWith("/room") || normalizedPath.startsWith("/c/") ? "" : `<span class="public-page__signal-title" aria-label="HIDN ${publicWindowTitle(path)}">HIDN</span>`}
      <div class="public-page__signal-actions">
        ${showZcashStatus ? `<span class="public-page__signal-zcash-status" data-zcash-status>BUILT ON ZCASH</span>` : ""}
        ${renderAmbientAudioControl()}
        ${renderVisitorTimeSignal("public-page__signal-meta")}
      </div>
      ${showRoomMenu ? renderRoomMenu() : ""}
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
  const isRoomSurface = normalizedPath === "/room" || normalizedPath === "/explore" || normalizedPath === "/room/profile" || Boolean(roomChannelFromPath(normalizedPath)) || normalizedPath.startsWith("/c/");
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

  return `<div class="public-page${isRoomCreation ? " public-page--room-access" : ""} ${pageClass} fx-grain fx-vignette${isPointerSurface ? " hidn-pointer-surface" : ""}"${isPointerSurface ? " data-pointer-surface" : ""}>
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${isPointerSurface ? renderPointerSpotlight() : ""}
    ${isHome ? "" : publicWindowChrome(path, isRoomSurface && normalizedPath !== "/room/profile")}
    ${isRoomSurface || isAdminPage || isRoomCreation || isHome ? "" : publicNavigation(path)}
    ${main}
    ${isRoomSurface ? renderRoomTipDialog() : ""}
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

function roomPostRandomKey(id: string): number {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function liveRoomPostsForTab(tab: FeedTab): RoomPost[] {
  const posts = roomPosts.filter(
    (post) => post.channel === activeRoomChannel && !isModerationHidden("thread", post.id),
  );

  if (tab === "felt") {
    return [...posts].sort((left, right) => right.reactions - left.reactions || right.time.localeCompare(left.time));
  }

  if (tab === "random") {
    return [...posts].sort((left, right) => roomPostRandomKey(left.id) - roomPostRandomKey(right.id));
  }

  return posts;
}

function renderTransmissionRows(tab: FeedTab): string {
  if (roomPostsLoadedChannel !== activeRoomChannel) {
    return LoadingState("LISTENING TO LIVE ROOM", "Connecting to the current room feed.");
  }

  const rows = liveRoomPostsForTab(tab).map(transmissionViewFromRoomPost);
  if (!rows.length) {
    return EmptyState("NO LIVE TRANSMISSIONS", "No posts have been published in this room yet.");
  }

  return rows
    .map((transmission) => renderTransmissionRow(
      transmission,
      { href: transmission.id ? `/c/${encodeURIComponent(transmission.id)}` : undefined },
    ))
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

function renderRoomRefreshControl(): string {
  return `<button class="room-refresh-button${roomRefreshSubmitting ? " room-refresh-button--loading" : ""}" type="button" data-action="room-refresh" aria-label="Refresh room posts" title="Refresh room posts" aria-busy="${roomRefreshSubmitting}"${roomRefreshSubmitting ? " disabled" : ""}>
    <span class="room-refresh-button__icon" aria-hidden="true">↻</span>
  </button>`;
}

async function refreshRoomPosts(force = false): Promise<void> {
  if (!hasRoomSession()) {
    return;
  }

  if (roomPostsRequest) {
    return roomPostsRequest;
  }

  if (!force && roomPostsLoadedChannel === activeRoomChannel) {
    return;
  }

  const requestedChannel = activeRoomChannel;
  roomPostsRequest = (roomAnonymousIdentity
    ? fetchAnonymousPosts(requestedChannel)
    : fetchRoomPosts(requestedChannel))
    .then((response) => {
      const pendingPosts = roomPosts.filter(
        (post) => post.channel === requestedChannel && roomPendingPostIds.has(post.id),
      );
      const responseIds = new Set(response.posts.map((post) => post.id));
      roomPosts = [
        ...pendingPosts.filter((post) => !responseIds.has(post.id)),
        ...response.posts,
      ];
      for (const post of response.posts) {
        roomPendingPostIds.delete(post.id);
        roomLikeCounts.set(post.id, post.reactions);
        refreshDeviceSignalPost(post);
        if (post.liked) {
          roomLikedIds.add(post.id);
        } else {
          roomLikedIds.delete(post.id);
        }
      }
      roomPostsLoadedChannel = requestedChannel;
      roomPostError = "";
      const normalizedPath = normalizePath(window.location.pathname);
      if (normalizedPath === "/room" || Boolean(roomChannelFromPath(normalizedPath))) {
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

async function refreshActiveRoom(): Promise<void> {
  if (roomRefreshSubmitting || !hasRoomSession()) {
    return;
  }

  roomRefreshSubmitting = true;
  roomPostsLoadedChannel = undefined;
  roomChannelNotice = "REFRESHING / ROOM FEED";
  rerenderProductRoute();

  try {
    await refreshRoomPosts(true);
    roomChannelNotice = roomPostError ? "REFRESH FAILED / TRY AGAIN" : "ROOM FEED UPDATED / JUST NOW";
  } finally {
    roomRefreshSubmitting = false;
    rerenderProductRoute();
  }
}

async function refreshRoomThread(threadId: string): Promise<void> {
  if (!hasRoomSession() || roomThreadDetailLoaded.has(threadId)) {
    return;
  }

  const existingRequest = roomThreadDetailRequests.get(threadId);
  if (existingRequest) {
    return existingRequest;
  }

  const sessionMarker = roomAnonymousIdentity?.commitment ?? roomAccountUsername;
  const request = (roomAnonymousIdentity
    ? fetchAnonymousThread(threadId)
    : fetchRoomThread(threadId))
    .then((response) => {
      if (!hasRoomSession() || (roomAnonymousIdentity?.commitment ?? roomAccountUsername) !== sessionMarker) {
        return;
      }

      roomPosts = [response.post, ...roomPosts.filter((post) => post.id !== response.post.id)];
      roomPendingPostIds.delete(response.post.id);
      roomLikeCounts.set(response.post.id, response.post.reactions);
      refreshDeviceSignalPost(response.post);
      if (response.post.liked) {
        roomLikedIds.add(response.post.id);
      } else {
        roomLikedIds.delete(response.post.id);
      }
      roomThreadReplies.set(
        response.post.id,
        response.replies.map((reply) => ({
          text: reply.text,
          time: formatTransmissionTime(reply.time),
        })),
      );
      roomThreadDetailLoaded.add(response.post.id);
      roomThreadDetailErrors.delete(response.post.id);
      if (roomThreadIdFromPath(normalizePath(window.location.pathname)) === response.post.id) {
        rerenderProductRoute();
      }
    })
    .catch((error) => {
      roomThreadDetailErrors.set(
        threadId,
        error instanceof Error ? error.message : "The private thread could not be opened.",
      );
      if (roomThreadIdFromPath(normalizePath(window.location.pathname)) === threadId) {
        rerenderProductRoute();
      }
    })
    .finally(() => {
      roomThreadDetailRequests.delete(threadId);
    });

  roomThreadDetailRequests.set(threadId, request);
  return request;
}

function isClientTestnetTipAddress(value: string): boolean {
  const address = value.trim().toLowerCase();
  return address.length >= 20
    && address.length <= 500
    && /^(?:utest1|ztestsapling1)[0-9a-z]+$/.test(address);
}

async function refreshRoomTipAddress(): Promise<void> {
  if (!hasRoomSession() || roomTipAddressRequest || roomTipAddressLoaded) {
    return;
  }

  if (roomAnonymousIdentity) {
    roomTipAddress = sessionStorage.getItem(ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE) ?? "";
    roomTipAddressDraft = roomTipAddress;
    if (!roomPostTipAddressEdited) {
      roomPostTipAddressDraft = roomTipAddress;
    }
    roomTipAddressLoaded = true;
    roomTipAddressError = "";
    if (normalizePath(window.location.pathname) === "/room/profile" || isRoomPostSurface()) {
      rerenderProductRoute();
    }
    return;
  }

  roomTipAddressRequest = fetchAccountTipAddress()
    .then((response) => {
      roomTipAddress = response.tipAddress ?? "";
      roomTipAddressDraft = roomTipAddress;
      if (!roomPostTipAddressEdited) {
        roomPostTipAddressDraft = roomTipAddress;
      }
      roomTipAddressLoaded = true;
      roomTipAddressError = "";
    })
    .catch((error) => {
      roomTipAddressLoaded = true;
      roomTipAddressError = error instanceof Error ? error.message : "The testnet tip address could not be loaded.";
    })
    .finally(() => {
      roomTipAddressRequest = undefined;
      if (normalizePath(window.location.pathname) === "/room/profile" || isRoomPostSurface()) {
        rerenderProductRoute();
      }
    });

  return roomTipAddressRequest;
}

async function saveRoomTipAddressFromRoot(root: ParentNode): Promise<void> {
  if (roomTipAddressSaving) {
    return;
  }

  const input = root.querySelector<HTMLInputElement>("#room-tip-address");
  const draft = input?.value.trim().toLowerCase() ?? roomTipAddressDraft.trim().toLowerCase();
  if (draft && !isClientTestnetTipAddress(draft)) {
    roomTipAddressError = "USE A SHIELDED TESTNET ADDRESS / UTEST1 OR ZTESTSAPLING1";
    roomTipAddressFeedback = "";
    rerenderProductRoute();
    return;
  }

  roomTipAddressDraft = draft;
  roomTipAddressSaving = true;
  roomTipAddressError = "";
  roomTipAddressFeedback = "";
  rerenderProductRoute();

  if (roomAnonymousIdentity) {
    try {
      if (draft) {
        sessionStorage.setItem(ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE, draft);
      } else {
        sessionStorage.removeItem(ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE);
      }
      roomTipAddress = draft;
      roomTipAddressLoaded = true;
      roomTipAddressFeedback = roomTipAddress
        ? "TESTNET DESTINATION SAVED / NEW POSTS CAN RECEIVE TIPS"
        : "TESTNET DESTINATION CLEARED / TIPPING OFF FOR NEW POSTS";
    } catch {
      roomTipAddressError = "THE BROWSER COULD NOT SAVE THIS LOCAL DESTINATION";
    } finally {
      roomTipAddressSaving = false;
      rerenderProductRoute();
    }
    return;
  }

  try {
    const response = await saveAccountTipAddress(draft);
    roomTipAddress = response.tipAddress ?? "";
    roomTipAddressDraft = roomTipAddress;
    roomTipAddressLoaded = true;
    roomTipAddressFeedback = roomTipAddress
      ? "TESTNET DESTINATION SAVED / NEW POSTS CAN RECEIVE TIPS"
      : "TESTNET DESTINATION CLEARED / TIPPING OFF FOR NEW POSTS";
  } catch (error) {
    roomTipAddressError = error instanceof Error ? error.message : "The testnet tip address could not be saved.";
  } finally {
    roomTipAddressSaving = false;
    rerenderProductRoute();
  }
}

function isRoomNotificationSurface(path = normalizePath(window.location.pathname)): boolean {
  return path === "/room"
    || path === "/room/profile"
    || Boolean(roomChannelFromPath(path))
    || path.startsWith("/c/");
}

function isRoomPostSurface(path = normalizePath(window.location.pathname)): boolean {
  return path === "/room" || Boolean(roomChannelFromPath(path));
}

function notificationStateSignature(value: AccountNotificationsResponse | undefined): string {
  if (!value) {
    return "";
  }

  return `${value.unreadCount}|${value.notifications.map((notification) => `${notification.id}:${notification.readAt ?? ""}:${notification.threadId ?? ""}`).join(",")}`;
}

async function refreshAccountNotifications(): Promise<void> {
  if (!hasRoomSession() || roomNotificationsRequest) {
    return;
  }

  const previousSignature = notificationStateSignature(roomNotifications);
  const notificationCapability = roomAnonymousIdentity?.notificationCapability;
  roomNotificationsRequest = (notificationCapability
    ? fetchAnonymousNotifications(notificationCapability)
    : fetchAccountNotifications())
    .then((response) => {
      if (!hasRoomSession()) {
        return;
      }

      roomNotifications = response;
      roomNotificationsError = "";
      if (previousSignature !== notificationStateSignature(response) && isRoomNotificationSurface()) {
        rerenderProductRoute();
      }
    })
    .catch((error) => {
      roomNotificationsError = error instanceof Error ? error.message : "Private notifications could not be loaded.";
      if (roomNotificationsOpen && isRoomNotificationSurface()) {
        rerenderProductRoute();
      }
    })
    .finally(() => {
      roomNotificationsRequest = undefined;
    });

  return roomNotificationsRequest;
}

async function markRoomNotificationsRead(): Promise<void> {
  if (!roomNotifications?.unreadCount || roomNotificationsMarkingRead) {
    return;
  }

  roomNotificationsMarkingRead = true;
  roomNotificationsError = "";
  rerenderProductRoute();
  try {
    const unreadIds = roomNotifications.notifications
      .filter((notification) => !notification.readAt)
      .map((notification) => notification.id);
    if (roomAnonymousIdentity?.notificationCapability) {
      await markAnonymousNotificationsRead(roomAnonymousIdentity.notificationCapability, unreadIds);
    } else {
      await markAccountNotificationsRead(unreadIds);
    }
    const readAt = new Date().toISOString();
    roomNotifications = {
      ...roomNotifications,
      unreadCount: 0,
      notifications: roomNotifications.notifications.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })),
    };
  } catch (error) {
    roomNotificationsError = error instanceof Error ? error.message : "Private notifications could not be updated.";
  } finally {
    roomNotificationsMarkingRead = false;
    if (isRoomNotificationSurface()) {
      rerenderProductRoute();
    }
  }
}

async function markRoomNotificationRead(notificationId: string): Promise<void> {
  if (!notificationId || !roomNotifications?.notifications.some((notification) => notification.id === notificationId)) {
    return;
  }

  try {
    if (roomAnonymousIdentity?.notificationCapability) {
      await markAnonymousNotificationsRead(roomAnonymousIdentity.notificationCapability, [notificationId]);
    } else {
      await markAccountNotificationsRead([notificationId]);
    }
    const readAt = new Date().toISOString();
    if (roomNotifications) {
      const wasUnread = roomNotifications.notifications.some(
        (notification) => notification.id === notificationId && !notification.readAt,
      );
      roomNotifications = {
        ...roomNotifications,
        unreadCount: Math.max(0, roomNotifications.unreadCount - (wasUnread ? 1 : 0)),
        notifications: roomNotifications.notifications.map((notification) => (
          notification.id === notificationId
            ? { ...notification, readAt: notification.readAt ?? readAt }
            : notification
        )),
      };
    }
  } catch {
    // Opening a notification should still navigate if the read receipt cannot be saved.
  }
}

function stopRoomNotificationPolling(): void {
  if (roomNotificationsTimer !== undefined) {
    window.clearInterval(roomNotificationsTimer);
    roomNotificationsTimer = undefined;
  }
}

function startRoomNotificationPolling(): void {
  if (roomNotificationsTimer !== undefined) {
    return;
  }

  void refreshAccountNotifications();
  roomNotificationsTimer = window.setInterval(() => {
    void refreshAccountNotifications();
  }, ROOM_NOTIFICATION_REFRESH_MS);
}

async function submitRoomPost(): Promise<void> {
  const content = roomPostText.trim();
  const selectedTipAddress = roomPostTipsEnabled ? roomPostTipAddressDraft.trim().toLowerCase() : "";
  if (!content) {
    roomPostError = "Write something before posting.";
    rerenderProductRoute();
    return;
  }
  const maxLength = roomPostCharacterLimit();
  if (content.length > maxLength) {
    roomPostError = `Posts must be ${maxLength} characters or fewer${roomAccountAccessLevel === "full" ? "." : ". VERIFY WITH ZEC FOR MORE."}`;
    rerenderProductRoute();
    return;
  }
  if (!hasRoomSession()) {
    roomPostError = "ENTER THE ROOM BEFORE POSTING / FREE ROOM ACCESS IS AVAILABLE";
    rerenderProductRoute();
    return;
  }
  if (roomPostTipsEnabled && (!selectedTipAddress || !isClientTestnetTipAddress(selectedTipAddress))) {
    roomPostError = "USE A SHIELDED TESTNET ADDRESS / UTEST1 OR ZTESTSAPLING1";
    rerenderProductRoute();
    return;
  }

  roomPostSubmitting = true;
  roomPostError = "";
  roomChannelNotice = "TRANSMITTING / PRIVATE ROOM";
  rerenderProductRoute();

  try {
    const response = roomAnonymousIdentity
      ? await (async () => {
        const { scope, proof } = await createAnonymousRoomProof("post", "room", activeRoomChannel, content, selectedTipAddress);
        return createAnonymousPost({
          proof,
          scope,
          alias: roomAnonymousIdentity!.alias,
          notificationCapability: roomAnonymousIdentity!.notificationCapability,
          content,
          channel: activeRoomChannel,
          category: "IDENTITY",
          tipAddress: selectedTipAddress || undefined,
        });
      })()
      : await createRoomPost({
        content,
        channel: activeRoomChannel,
        category: "IDENTITY",
        tipAddress: selectedTipAddress,
      });
    roomPendingPostIds.add(response.post.id);
    roomPosts = [response.post, ...roomPosts.filter((post) => post.id !== response.post.id)];
    roomLikeCounts.set(response.post.id, response.post.reactions);
    rememberDeviceSignalPost(response.post);
    roomLikedIds.delete(response.post.id);
    roomPostsLoadedChannel = activeRoomChannel;
    roomPostComposerOpen = false;
    roomPostText = "";
    roomPostTipsEnabled = false;
    roomPostTipAddressDraft = "";
    roomPostTipAddressEdited = false;
    roomChannelNotice = `${response.post.reference} POSTED / ANONYMOUS`;
  } catch (error) {
    roomPostError = error instanceof Error ? error.message : "The post could not be created.";
    roomChannelNotice = "";
  } finally {
    roomPostSubmitting = false;
    rerenderProductRoute();
  }
}

async function submitRoomReply(threadId: string, content: string): Promise<void> {
  if (roomReplySubmitting || !threadId || !content) {
    return;
  }
  const maxLength = roomReplyCharacterLimit();
  if (content.length > maxLength) {
    roomPostError = `Replies must be ${maxLength} characters or fewer${roomAccountAccessLevel === "full" ? "." : ". VERIFY WITH ZEC FOR MORE."}`;
    rerenderProductRoute();
    return;
  }
  if (!hasRoomSession()) {
    roomPostError = "ENTER THE ROOM BEFORE REPLYING / FREE ROOM ACCESS IS AVAILABLE";
    rerenderProductRoute();
    return;
  }

  if (!threadId.startsWith("THR-")) {
    const localComment: RoomComment = {
      id: `LOCAL-${Date.now()}`,
      threadId,
      text: content,
      channel: activeRoomChannel,
      time: new Date().toISOString(),
      status: "visible",
    };
    repliesForThread(threadId).push({ text: content, time: "JUST NOW" });
    roomLocalComments = [localComment, ...roomLocalComments];
    rememberDeviceSignalComment(localComment);
    rerenderProductRoute();
    return;
  }

  roomReplySubmitting = true;
  roomPostError = "";
  roomChannelNotice = "TRANSMITTING / PRIVATE THREAD";
  rerenderProductRoute();

  try {
    const response = roomAnonymousIdentity
      ? await (async () => {
        const { scope, proof } = await createAnonymousRoomProof("reply", "thread", threadId, content);
        return createAnonymousReply({
          proof,
          scope,
          alias: roomAnonymousIdentity!.alias,
          notificationCapability: roomAnonymousIdentity!.notificationCapability,
          threadId,
          content,
        });
      })()
      : await createRoomReply({ threadId, content, submissionId: createRoomReplySubmissionId() });
    roomLocalComments = [response.comment, ...roomLocalComments.filter((comment) => comment.id !== response.comment.id)];
    rememberDeviceSignalComment(response.comment);
    if (response.status === "created") {
      repliesForThread(threadId).push({ text: response.comment.text, time: "JUST NOW" });
      roomPosts = roomPosts.map((post) => post.id === threadId ? { ...post, replies: post.replies + 1 } : post);
      roomPostsLoadedChannel = undefined;
      void refreshRoomPosts();
      roomChannelNotice = "REPLY SAVED / PRIVATE HISTORY UPDATED";
    } else {
      roomChannelNotice = "YOU'VE SAID THAT ALREADY / REPLY NOT SENT TWICE";
    }
  } catch (error) {
    roomPostError = error instanceof Error ? error.message : "The reply could not be created.";
    roomChannelNotice = "";
  } finally {
    roomReplySubmitting = false;
    rerenderProductRoute();
  }
}

function renderRoomEyeWatcher(extraClass = ""): string {
  return `<span class="home-room-title__watcher${extraClass ? ` ${extraClass}` : ""}" aria-hidden="true"><span class="home-room-invite__glasses home-room-title__glasses"><span class="home-room-invite__lens"><span class="home-room-invite__eye"><span class="home-room-invite__pupil"></span></span></span><span class="home-room-invite__bridge"></span><span class="home-room-invite__lens"><span class="home-room-invite__eye home-room-invite__eye--right"><span class="home-room-invite__pupil"></span></span></span></span></span>`;
}

function renderRoomPostTipControls(): string {
  if (!roomPostTipsEnabled) {
    return `<fieldset class="room-post-tips">
      <legend>OPTIONAL / DIRECT TIPS</legend>
      <label class="room-post-tips__toggle">
        <input id="room-post-allow-tips" type="checkbox" />
        <span>ALLOW TIPS ON THIS POST</span>
      </label>
      <p class="room-post-tips__note">Let readers support this post directly with any amount of testnet TAZ.</p>
    </fieldset>`;
  }

  return `<fieldset class="room-post-tips room-post-tips--enabled">
    <legend>OPTIONAL / DIRECT TIPS</legend>
    <label class="room-post-tips__toggle">
      <input id="room-post-allow-tips" type="checkbox" checked />
      <span>ALLOW TIPS ON THIS POST</span>
    </label>
    <label class="ui-field room-post-tips__address-field" for="room-post-tip-address">
      <span class="ui-field__label">SHIELDED TESTNET ADDRESS / THIS POST</span>
      <input id="room-post-tip-address" type="text" value="${escapeHtml(roomPostTipAddressDraft)}" placeholder="utest1..." autocomplete="off" spellcheck="false" maxlength="500" />
    </label>
    <p class="room-post-tips__note">Use your saved default address or enter a different public shielded testnet address for this post.</p>
    <p class="room-post-tips__warning" data-warning="REUSING AN ADDRESS MAY MAKE POSTS EASIER TO ASSOCIATE." role="note">Reusing an address may make posts easier to associate.</p>
  </fieldset>`;
}

function renderRoomDirectory(options: { showFooter?: boolean } = {}): string {
  const showFooter = options.showFooter ?? true;
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
    ${TerminalLabel("CHANNELS / PRIVATE ROOMS")}
    <span class="room-directory__count">${roomChannelOptions.length} OPEN</span>
    </div>
    <h2>Choose a r<span class="room-directory-title__double-o">oo${renderRoomEyeWatcher("room-directory-title__watcher")}</span>m.</h2>
    <p class="room-directory__intro">Read quietly or leave a thought without a public name.</p>
    ${roomPostComposerOpen ? "" : `<div class="room-directory__create">${SecondaryButton({ label: "CREATE POST →", dataAction: "room-create-post" })}${renderRoomRefreshControl()}</div>`}
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
                  <span class="room-directory__room-number" aria-hidden="true">ᙇ</span>
                  <span class="room-directory__room-copy"><strong>${channel.label}</strong><small>${channel.description}</small></span>
                  <span class="room-directory__room-arrow" aria-hidden="true">↗</span>
                </button>`)
                .join("")}
            </div>
          </section>`,
        )
        .join("")}
    </div>
    ${showFooter
      ? `<div class="room-directory__footer">
          <span>ACTIVE CHANNEL</span><strong>// ${activeChannel.label}</strong>
          ${roomChannelNotice ? `<p role="status">${escapeHtml(roomChannelNotice)}</p>` : ""}
          ${roomPostError ? `<p class="room-post-composer__error" role="alert">${escapeHtml(roomPostError)}</p>` : ""}
          ${roomPostComposerOpen
            ? `<form class="room-post-composer" data-room-post-composer novalidate>
                <label class="ui-field room-post-composer__field" for="room-post-content">
                  <span class="ui-field__label">POST WITHOUT A NAME / ${escapeHtml(activeChannel.label)}</span>
                  <textarea id="room-post-content" rows="5" maxlength="${roomPostCharacterLimit()}" placeholder="Leave a thought in the room...">${escapeHtml(roomPostText)}</textarea>
                </label>
                <p class="room-post-composer__note">${roomPostLimitCopy()} Your post is stored without a public name.</p>
                ${renderRoomPostTipControls()}
                <div class="room-post-composer__actions">
                  ${GhostButton({ label: "CANCEL", dataAction: "room-post-cancel" })}
                  ${SecondaryButton({ label: roomPostSubmitting ? "TRANSMITTING..." : "POST ANONYMOUSLY →", disabled: roomPostSubmitting, dataAction: "room-post-submit" })}
                </div>
              </form>`
            : ""}
        </div>`
      : ""}
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
            <p>Review user-submitted moderation reports, then hide or restore thread and reply content. Cloudflare Access protects this surface before the Worker checks your HIDN administrator role.</p>
          </header>
          <section class="admin-reports-gate" aria-labelledby="admin-reports-gate-title">
            <div>
              ${TerminalLabel("ADMIN AUTHORIZATION")}
              <h2 id="admin-reports-gate-title">OPEN THE PRIVATE QUEUE.</h2>
            </div>
            <label class="ui-field" for="admin-report-token">
              <span class="ui-field__label">LEGACY TOKEN / MIGRATION FALLBACK</span>
              <input id="admin-report-token" type="password" autocomplete="off" placeholder="Optional when Access is enabled" />
            </label>
            <div class="admin-reports-gate__actions">
              ${PrimaryButton({ label: adminReportLoading ? "LOADING REPORTS..." : "LOAD REPORTS →", disabled: adminReportLoading, dataAction: "admin-reports-load" })}
              ${GhostButton({ label: "CLEAR", dataAction: "admin-reports-clear" })}
            </div>
            <p class="admin-reports-gate__status" role="status">${adminSession
              ? `${escapeHtml(adminSession.role.replace("_", " ").toUpperCase())} / ${escapeHtml(adminSession.email ?? "ACCESS IDENTITY")}`
              : adminReportToken
                ? "LEGACY TOKEN PRESENT / NOT STORED"
                : "OPEN THROUGH CLOUDFLARE ACCESS OR USE THE MIGRATION TOKEN"}</p>
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
          </section>` : SystemMessage("PRIVATE QUEUE / LOCKED", "Cloudflare Access should sign you in before the Worker checks your HIDN role. The legacy token remains available only during migration and is not saved in this browser.", "INFO")}
        </div>
      </main>`,
      "public-page--admin",
    ),
  };
}

function renderAdminDashboard(): RenderedProductRoute {
  return {
    metadata: {
      kind: "admin",
      title: "HIDN — Admin Control",
      description: "Private HIDN administrator control surface.",
      canonicalPath: "/admin",
    },
    html: publicFrame(
      "/admin",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--reading admin-reports-page">
          <header class="admin-reports-page__header">
            ${TerminalLabel("HIDN / PRIVATE OPERATOR SURFACE")}
            <h1 class="type-display-lg">ADMIN<br /><em>CONTROL.</em></h1>
            <p>This is the control room for HIDN moderation. Cloudflare Access handles the human login; HIDN applies the role after the Worker verifies the Access identity.</p>
          </header>
          <section class="admin-reports-gate" aria-labelledby="admin-control-session-title">
            ${TerminalLabel("CURRENT SESSION")}
            <h2 id="admin-control-session-title">${adminSession ? escapeHtml((adminSession.displayName || adminSession.email || "ACCESS IDENTITY").toUpperCase()) : "SESSION NOT LOADED."}</h2>
            <p class="admin-reports-gate__status">${adminSession ? `${escapeHtml(adminSession.role.replace("_", " ").toUpperCase())} / ${escapeHtml(adminSession.email ?? "ACCESS IDENTITY")}` : "OPEN THIS PAGE THROUGH CLOUDFLARE ACCESS."}</p>
          </section>
          ${adminReportError ? AlertMessage("ADMIN RESPONSE", adminReportError, "danger") : ""}
          <nav class="admin-reports-summary" aria-label="Admin tools">
            <a class="ui-button ui-button--primary" href="/admin/reports">REPORT QUEUE →</a>
            ${adminSession?.role === "super_admin" ? `<a class="ui-button ui-button--secondary" href="/admin/moderators">MODERATORS →</a><a class="ui-button ui-button--secondary" href="/admin/audit">AUDIT LOG →</a>` : ""}
          </nav>
        </div>
      </main>`,
      "public-page--admin",
    ),
  };
}

function renderAdminModerators(): RenderedProductRoute {
  const admins = adminModerators ?? [];
  return {
    metadata: {
      kind: "admin",
      title: "HIDN — Admin Roles",
      description: "Private HIDN administrator role control.",
      canonicalPath: "/admin/moderators",
    },
    html: publicFrame(
      "/admin/moderators",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--reading admin-reports-page">
          <header class="admin-reports-page__header">
            ${TerminalLabel("HIDN / SUPER ADMIN ONLY")}
            <h1 class="type-display-lg">ADMIN<br /><em>ROLES.</em></h1>
            <p>Add or disable moderator and reviewer identities. They must sign in through the Cloudflare Access application with the same email before HIDN grants the role.</p>
            <p><a href="/admin">← ADMIN CONTROL</a></p>
          </header>
          <section class="admin-reports-gate" aria-labelledby="admin-role-add-title">
            ${TerminalLabel("ADD ADMINISTRATOR")}
            <h2 id="admin-role-add-title">GRANT A ROLE.</h2>
            <label class="ui-field" for="admin-moderator-email"><span class="ui-field__label">ACCESS EMAIL</span><input id="admin-moderator-email" type="email" autocomplete="off" placeholder="moderator@example.com" /></label>
            <label class="ui-field" for="admin-moderator-name"><span class="ui-field__label">DISPLAY NAME / OPTIONAL</span><input id="admin-moderator-name" type="text" autocomplete="off" placeholder="ROOM MODERATOR" /></label>
            <label class="ui-field" for="admin-moderator-role"><span class="ui-field__label">ROLE</span><select id="admin-moderator-role"><option value="moderator">MODERATOR / REPORT ACTIONS</option><option value="reviewer">REVIEWER / READ ONLY</option><option value="super_admin">SUPER ADMIN / FULL CONTROL</option></select></label>
            <div class="admin-reports-gate__actions">${PrimaryButton({ label: "GRANT ROLE →", dataAction: "admin-moderator-create" })}</div>
          </section>
          ${adminReportError ? AlertMessage("ADMIN RESPONSE", adminReportError, "danger") : ""}
          <section class="admin-reports-results" aria-labelledby="admin-role-list-title">
            ${TerminalLabel("CURRENT ADMINISTRATORS")}
            <h2 id="admin-role-list-title">${admins.length} IDENTITY${admins.length === 1 ? "" : "IES"}.</h2>
            <div class="admin-reports-list">
              ${admins.length ? admins.map((admin) => `<article class="admin-report-card">
                <header class="admin-report-card__header"><div><span class="admin-report-card__id">${escapeHtml(admin.adminId)}</span><h2>${escapeHtml(admin.displayName || admin.email || "ACCESS IDENTITY")}</h2></div><span class="admin-report-card__status">${escapeHtml(admin.status.toUpperCase())}</span></header>
                <dl class="admin-report-card__meta"><div><dt>EMAIL</dt><dd>${escapeHtml(admin.email ?? "NOT SET")}</dd></div><div><dt>ROLE</dt><dd>${escapeHtml(admin.role.replace("_", " ").toUpperCase())}</dd></div><div><dt>LAST SEEN</dt><dd>${escapeHtml(admin.lastSeenAt ?? "NOT YET")}</dd></div></dl>
                <div class="admin-report-card__review"><label class="ui-field" for="admin-role-${escapeHtml(admin.adminId)}"><span class="ui-field__label">ROLE</span><select id="admin-role-${escapeHtml(admin.adminId)}" data-admin-role><option value="super_admin"${admin.role === "super_admin" ? " selected" : ""}>SUPER ADMIN</option><option value="moderator"${admin.role === "moderator" ? " selected" : ""}>MODERATOR</option><option value="reviewer"${admin.role === "reviewer" ? " selected" : ""}>REVIEWER</option></select></label><button class="ui-button ui-button--secondary" type="button" data-action="admin-moderator-update" data-admin-id="${escapeHtml(admin.adminId)}" data-admin-status="${escapeHtml(admin.status)}">SAVE ROLE →</button>${admin.status === "active" && admin.adminId !== adminSession?.adminId ? `<button class="ui-button ui-button--danger" type="button" data-action="admin-moderator-disable" data-admin-id="${escapeHtml(admin.adminId)}">DISABLE →</button>` : ""}</div>
              </article>`).join("") : `<p class="admin-reports-empty">No administrator records yet.</p>`}
            </div>
          </section>
        </div>
      </main>`,
      "public-page--admin",
    ),
  };
}

function renderAdminAudit(): RenderedProductRoute {
  const events = adminAuditEvents ?? [];
  return {
    metadata: {
      kind: "admin",
      title: "HIDN — Admin Audit",
      description: "Private HIDN administrator audit log.",
      canonicalPath: "/admin/audit",
    },
    html: publicFrame(
      "/admin/audit",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--reading admin-reports-page">
          <header class="admin-reports-page__header">
            ${TerminalLabel("HIDN / SUPER ADMIN ONLY")}
            <h1 class="type-display-lg">AUDIT<br /><em>LOG.</em></h1>
            <p>Every role change, report update, and content action is recorded here with the acting admin identity.</p>
            <p><a href="/admin">← ADMIN CONTROL</a></p>
          </header>
          <section class="admin-reports-results" aria-labelledby="admin-audit-list-title">
            ${TerminalLabel("RECENT ADMIN ACTIONS")}
            <h2 id="admin-audit-list-title">${events.length} EVENT${events.length === 1 ? "" : "S"}.</h2>
            <div class="admin-reports-list">${events.length ? events.map((event) => `<article class="admin-report-card"><header class="admin-report-card__header"><div><span class="admin-report-card__id">${escapeHtml(event.eventId)}</span><h2>${escapeHtml(event.action.replaceAll("_", " ").toUpperCase())}</h2></div><span class="admin-report-card__status">${escapeHtml(event.createdAt)}</span></header><dl class="admin-report-card__meta"><div><dt>ADMIN</dt><dd>${escapeHtml(event.adminEmail ?? event.adminId)}</dd></div><div><dt>TARGET</dt><dd>${escapeHtml(event.targetType)} / ${escapeHtml(event.targetId)}</dd></div></dl>${event.reason ? `<p class="admin-report-card__details"><strong>NOTE</strong>${escapeHtml(event.reason)}</p>` : ""}</article>`).join("") : `<p class="admin-reports-empty">No audit events yet.</p>`}</div>
          </section>
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

function roomChannelFromPath(path: string): RoomChannel | undefined {
  const normalizedPath = normalizePath(path);
  const prefix = "/room/channel/";
  if (!normalizedPath.startsWith(prefix)) {
    return undefined;
  }

  const key = normalizedPath.slice(prefix.length) as RoomChannel;
  return roomChannelOptions.some((channel) => channel.key === key) ? key : undefined;
}

function roomThreadIdFromPath(path: string): string | undefined {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath.startsWith("/c/")) {
    return undefined;
  }

  try {
    const id = decodeURIComponent(normalizedPath.slice(3).split("/")[0]).trim().toUpperCase();
    return /^THR-[A-F0-9]{24}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

function isProtectedRoomPath(path: string): boolean {
  return path === "/room"
    || path === "/explore"
    || path === "/room/profile"
    || Boolean(roomChannelFromPath(path))
    || Boolean(roomThreadIdFromPath(path));
}

function isRoomMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function renderRoomZcashStatus(): string {
  return `<span class="ui-status-indicator zcash-status-carousel" data-zcash-status>${StatusDot("online", true)}<span data-zcash-status-label>BUILT ON ZCASH</span></span>`;
}

function roomNotificationLabel(notification: AccountNotification): string {
  const actor = notification.actorAlias || "ANON-SIGNAL";
  return notification.type === "reaction" ? `${actor} / LIKED YOUR THREAD` : `${actor} / REPLIED TO YOUR THREAD`;
}

function roomNotificationTargetPath(notification: AccountNotification): string {
  const threadId = notification.threadId
    ?? (notification.targetType === "thread" ? notification.targetId : "");
  return threadId ? `/c/${encodeURIComponent(threadId)}` : "/room/profile";
}

function renderRoomNotifications(): string {
  if (!hasRoomSession()) {
    return "";
  }

  const notifications = roomNotifications?.notifications ?? [];
  const unreadCount = roomNotifications?.unreadCount ?? 0;
  const content = roomNotificationsError
    ? `<p class="room-notifications__empty" role="status">${escapeHtml(roomNotificationsError)}</p>`
      : !roomNotifications
        ? `<p class="room-notifications__empty" role="status">READING PRIVATE ACTIVITY...</p>`
        : notifications.length
          ? `<ul class="room-notifications__list">${notifications.map((notification) => `<li class="room-notifications__item${notification.readAt ? "" : " room-notifications__item--unread"}">
            <a href="${escapeHtml(roomNotificationTargetPath(notification))}" class="room-notifications__link" data-room-notification-link data-notification-id="${escapeHtml(notification.id)}" aria-label="Open ${escapeHtml(roomNotificationLabel(notification))}">
              <span class="room-notifications__label">${escapeHtml(roomNotificationLabel(notification))}</span>
              <span class="room-notifications__meta">PRIVATE ACTIVITY / ${escapeHtml(formatNotificationDateTime(notification.createdAt))}</span>
            </a>
          </li>`).join("")}</ul>`
        : `<p class="room-notifications__empty">NO PRIVATE ACTIVITY YET.</p>`;

  const hasUnreadActivity = unreadCount > 0;
  const notificationLabel = hasUnreadActivity
    ? `${unreadCount} unread private activity notification${unreadCount === 1 ? "" : "s"}`
    : "Open private activity notifications";

  return `<section class="room-notifications${roomNotificationsOpen ? " room-notifications--open" : ""}${hasUnreadActivity ? " room-notifications--unread" : ""}" aria-label="Private activity notifications">
    <button class="room-notifications__toggle" type="button" data-action="room-notifications-toggle" aria-label="${notificationLabel}" aria-expanded="${roomNotificationsOpen}" aria-controls="room-notifications-panel">
      <span class="room-notifications__bell" aria-hidden="true">
        <svg class="room-notifications__bell-icon" viewBox="0 0 24 24" focusable="false">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path>
        </svg>
        ${hasUnreadActivity ? `<span class="room-notifications__badge">${unreadCount > 99 ? "99+" : unreadCount}</span>` : ""}
      </span>
      <span class="room-notifications__toggle-copy">PRIVATE ACTIVITY${unreadCount ? ` / ${unreadCount} NEW` : ""}</span>
    </button>
    ${roomNotificationsOpen ? `<div class="room-notifications__panel" id="room-notifications-panel">
      <header class="room-notifications__header">
        <span>ACCOUNT SIGNALS / PRIVATE</span>
        ${unreadCount ? `<span>${unreadCount.toString().padStart(2, "0")} UNREAD</span>` : "<span>CAUGHT UP</span>"}
      </header>
      ${content}
      ${unreadCount ? `<div class="room-notifications__actions">${SecondaryButton({ label: roomNotificationsMarkingRead ? "MARKING READ..." : "MARK ALL READ", disabled: roomNotificationsMarkingRead, dataAction: "room-notifications-read" })}</div>` : ""}
    </div>` : ""}
  </section>`;
}

function renderMobilePostSurface(): string {
  const activeChannel = roomChannelOption(activeRoomChannel);
  const content = roomPostComposerOpen && hasRoomSession()
    ? `<form class="room-post-composer room-mobile-index__composer" data-room-post-composer novalidate>
        <label class="ui-field room-post-composer__field" for="room-post-content">
          <span class="ui-field__label">POST WITHOUT A NAME / ${escapeHtml(activeChannel.label)}</span>
        <textarea id="room-post-content" rows="5" maxlength="${roomPostCharacterLimit()}" placeholder="Leave a thought in the room...">${escapeHtml(roomPostText)}</textarea>
      </label>
        <p class="room-post-composer__note">${roomPostLimitCopy()}</p>
        ${renderRoomPostTipControls()}
        <div class="room-post-composer__actions">
          ${GhostButton({ label: "CANCEL", dataAction: "room-post-cancel" })}
          ${SecondaryButton({ label: roomPostSubmitting ? "TRANSMITTING..." : "POST ANONYMOUSLY →", disabled: roomPostSubmitting, dataAction: "room-post-submit" })}
        </div>
      </form>`
    : `<div class="room-mobile-index__create-actions">${SecondaryButton({ label: "CREATE POST →", dataAction: "room-create-post" })}${renderRoomRefreshControl()}</div>`;

  return `<div class="room-mobile-index__create">
    ${content}
    ${roomChannelNotice ? `<p class="room-post-composer__error" role="status">${escapeHtml(roomChannelNotice)}</p>` : ""}
    ${roomPostError ? `<p class="room-post-composer__error" role="alert">${escapeHtml(roomPostError)}</p>` : ""}
  </div>`;
}

function renderMobileRoomIndex(): string {
  const rooms = roomChannelOptions
    .map((channel, index) => `<button class="room-mobile-index__room" type="button" data-room-channel="${channel.key}" aria-label="Open ${escapeHtml(channel.label)} room">
      <span class="room-mobile-index__number" aria-hidden="true">ᙇ</span>
      <span class="room-mobile-index__copy"><strong>${escapeHtml(channel.label)}</strong><small>${escapeHtml(channel.description)}</small></span>
      <span class="room-mobile-index__arrow" aria-hidden="true">→</span>
    </button>`)
    .join("");

  return publicFrame(
    "/room",
    `<main id="main-content" class="public-main room-mobile-index-main">
      <div class="hidn-container--reading explore-page room-mobile-index">
        <header class="room-mobile-index__header">
          ${TerminalLabel("PRIVATE ROOM")}
          <h1>CHOOSE A R<span class="room-directory-title__double-o">OO${renderRoomEyeWatcher("room-directory-title__watcher")}</span>M.</h1>
          <p>Read quietly or leave a thought without a public name.</p>
          <div class="room-mobile-index__status">${renderRoomZcashStatus()}${renderRoomNotifications()}</div>
          ${renderMobilePostSurface()}
        </header>
        <section class="room-mobile-index__list" aria-label="Private rooms">
          ${rooms}
        </section>
      </div>
    </main>`,
    "public-page--explore public-page--room-index",
  );
}

function renderExplore(path = "/room"): string {
  const isChannelRoute = Boolean(roomChannelFromPath(path));
  const channel = roomChannelOption(activeRoomChannel);
  const headerLabel = isChannelRoute ? "CURRENT ROOM / ANONYMOUS THREADS" : "PRIVATE ROOM / OPEN THREADS";
  const headerTitle = isChannelRoute ? channel.label : "THE ROOM";
  const headerCopy = isChannelRoute
    ? `${channel.description}. Thoughts and replies stay inside this room, without public names.`
    : "Thoughts move through the room without names. Follow one thread or leave one behind.";

  if (!hasRoomSession()) {
    return publicFrame(
      path,
      `<main id="main-content" class="public-main explore-main room-locked-main">
        <div class="room-locked-page">
          ${TerminalLabel("HIDN / ACCESS REQUIRED")}
          <h1 class="type-display-lg">THE ROOM STAYS<br /><em>BEHIND THE KEY.</em></h1>
          <p>Log in with your HIDN handle and recovery key to enter the private room. Free users can post and reply; optional ZEC verification unlocks advanced privileges.</p>
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
          ${isChannelRoute ? `<a class="room-channel-back" href="/room">← ALL ROOMS</a>` : ""}
          ${TerminalLabel(headerLabel)}
          <h1${isChannelRoute ? ` id="room-channel-title"` : ""} class="type-display-lg">${escapeHtml(headerTitle)}</h1>
          <p>${escapeHtml(headerCopy)}</p>
          ${isChannelRoute ? `<div class="room-channel-header__signals">${renderRoomZcashStatus()}${renderRoomNotifications()}</div>` : ""}
          ${isRoomMobileViewport() ? renderMobilePostSurface() : ""}
        </header>
        <div class="explore-layout">
          <section class="explore-feed" aria-labelledby="${isChannelRoute ? "room-channel-title" : "explore-feed-title"}">
            ${isChannelRoute ? "" : `<div class="explore-feed__heading">
              <div>
                ${TerminalLabel("CURRENT ROOM / ANONYMOUS THREADS")}
                <h2 id="explore-feed-title" class="type-heading-2">// ${escapeHtml(roomChannelOption(activeRoomChannel).label)} / THOUGHTS IN MOTION</h2>
              </div>
              <div class="explore-feed__signals">${renderRoomZcashStatus()}${renderRoomNotifications()}</div>
            </div>`}
            ${renderExploreTabs()}
            <div class="explore-feed__list" id="explore-feed-list" aria-live="polite">${renderTransmissionRows(activeFeedTab)}</div>
          </section>
          ${renderRoomDirectory()}
        </div>
      </div>
    </main>`,
    `public-page--explore${isChannelRoute ? " public-page--room-channel" : ""}`,
  );
}

function renderThreadRoom(id: string, quotedText = ""): string {
  const replies = repliesForThread(id);
  const visibleReplies = replies
    .map((reply, index) => ({ reply, index }))
    .filter(({ index }) => !isModerationHidden("reply", `${id}:reply:${index}`));
  const replyCount = visibleReplies.length;
  const roomAccess = hasRoomSession();
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
    <form class="thread-room__composer${roomAccess ? "" : " thread-room__composer--locked"}" novalidate>
      <label class="ui-field thread-room__field" for="thread-reply-${escapeHtml(id)}">
        <span class="ui-field__label">QUOTE / REPLY WITHOUT A NAME</span>
        <textarea id="thread-reply-${escapeHtml(id)}" data-thread-input rows="4" maxlength="${roomReplyCharacterLimit()}" placeholder="${roomAccess ? "Add your thought to the thread..." : "Enter the room to reply anonymously."}"${roomAccess ? "" : " disabled"}></textarea>
      </label>
      <div class="thread-room__composer-footer">
        <span>${roomAccess ? "FREE ACCESS / NO HANDLE / NO TRAIL" : "ROOM ACCESS REQUIRED"}</span>
        ${SecondaryButton({ label: roomReplySubmitting ? "SAVING REPLY..." : roomAccess ? "TRANSMIT REPLY →" : "ENTER THE ROOM FIRST", disabled: !roomAccess || roomReplySubmitting, dataAction: "thread-reply" })}
      </div>
    </form>
    ${roomChannelNotice ? `<p class="thread-room__feedback" role="status">${escapeHtml(roomChannelNotice)}</p>` : ""}
    ${roomPostError ? `<p class="thread-room__feedback thread-room__feedback--error" role="alert">${escapeHtml(roomPostError)}</p>` : ""}
    <p class="thread-room__note">${roomAccess ? `${roomReplyLimitCopy()} Suspicious bursts or repeated messages may receive a short signal cooldown.` : "Enter the private room to reply without a public name."}</p>
  </section>`;
}

function renderDetail(id: string): RenderedProductRoute {
  const mockConfession = getMockConfession(id);
  const livePost = roomPosts.find((post) => post.id === id);
  const confession = mockConfession ?? (livePost ? mockConfessionFromRoomPost(livePost) : undefined);
  const isLivePost = Boolean(livePost);
  const detailReplyCount = replyCountForThread(id, livePost?.replies);
  const metadata: HidnMetadata = {
    kind: "anonymous-confession",
    title: "HIDN — Anonymous confession",
    description: isLivePost
      ? "An anonymous HIDN room thread. No public identity is attached to the conversation."
      : "An anonymous HIDN confession. No public identity or confession history is attached.",
    canonicalPath: `/c/${encodeURIComponent(id)}`,
  };

  if (!confession && hasRoomSession() && /^THR-[A-F0-9]{24}$/i.test(id)) {
    const threadDetailError = roomThreadDetailErrors.get(id);
    return {
      metadata,
      html: publicFrame(
        `/c/${id}`,
        `<main id="main-content" class="public-main detail-main">
          <div class="hidn-container--reading detail-page">
            ${TerminalLabel(threadDetailError ? "PRIVATE THREAD / UNAVAILABLE" : "PRIVATE THREAD / OPENING")}
            <h1 class="detail-page__title">${threadDetailError ? "THREAD NOT AVAILABLE" : "OPENING THE THREAD."}</h1>
            ${threadDetailError
              ? ErrorState("THREAD NOT AVAILABLE", "This private thread is no longer available in the room feed.")
              : SystemMessage("PRIVATE THREAD", "Reading the exact post and replies for this notification.", "INFO")}
            ${actionLink("BACK TO THE ROOM", "/room", "secondary")}
          </div>
        </main>`,
        "public-page--detail",
      ),
    };
  }

  if (!confession) {
    return {
      metadata,
      html: publicFrame(
        `/c/${id}`,
        `<main id="main-content" class="public-main detail-main">
          <div class="hidn-container--reading detail-page">
            <h1 class="detail-page__title">TRANSMISSION NOT FOUND</h1>
            ${ErrorState("TRANSMISSION NOT FOUND", "This thread is no longer available in the current room feed.")}
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
            <div><span>COMMENTS</span><strong>${escapeHtml(String(detailReplyCount))}</strong></div>
            <div><span>POSTED</span><strong>${escapeHtml(confession.relativeTime)}</strong></div>
          </div>
          ${isLivePost
            ? SystemMessage("ROOM STATUS / LIVE THREAD", "This thread is stored in the private room feed. No public identity is attached to the conversation.", "INFO")
            : SystemMessage("PROOF STATUS / DEMO ONLY", "The public card contains no proof material. This mock route does not verify a person or connect a network identity.", "DEMO")}
          <div class="detail-actions" aria-label="Confession actions">
            <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(confession.id)}" aria-pressed="${roomLikedIds.has(confession.id)}"${hasRoomSession() ? "" : " disabled"}>♡ ${escapeHtml(String(reactionCountForThread(confession.id, confession.reactions)))}</button>
            <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">COMMENTS ${escapeHtml(String(detailReplyCount))}</a>
            <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">QUOTE</a>
            <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(confession.id)}">SAVE IMAGE</button>
            <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(confession.id)}">SHARE IMAGE</button>
            ${livePost?.tipAddress ? `<button class="room-message__action room-message__action--tip" type="button" data-action="room-tip" data-thread-id="${escapeHtml(confession.id)}">TIP WITH TAZ</button>` : ""}
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

function createRoomReplySubmissionId(): string {
  if (window.crypto?.randomUUID) {
    return `HIDN-REPLY-${window.crypto.randomUUID().toUpperCase()}`;
  }

  const bytes = new Uint8Array(16);
  window.crypto?.getRandomValues(bytes);
  return `HIDN-REPLY-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function resetRoomRecoveryReveal(): void {
  if (roomRecoveryRevealTimer !== undefined) {
    window.clearTimeout(roomRecoveryRevealTimer);
    roomRecoveryRevealTimer = undefined;
  }

  roomRecoveryRevealMode = "hidden";
  roomRecoveryRevealError = "";
  roomRecoveryVerificationSubmitting = false;
  roomRecoveryUsernameInput = "";
  roomRecoveryConfirmations = [false, false];
}

function openRoomRecoveryCheck(): void {
  if (!roomAccountRecoveryCode) {
    roomAccessMode = "login";
    roomLoginError = "Enter the recovery key you saved to restore it in this browser session.";
    if (normalizePath(window.location.pathname) === "/room/access") {
      rerenderProductRoute();
    } else {
      navigateProductRoute("/room/access");
    }
    return;
  }

  roomRecoveryRevealMode = "prompt";
  roomRecoveryRevealError = "";
  roomRecoveryUsernameInput = "";
  roomRecoveryConfirmations = [false, false];
  rerenderProductRoute();
}

async function verifyRoomRecoveryCheck(root: ParentNode): Promise<void> {
  if (roomRecoveryVerificationSubmitting) {
    return;
  }

  roomRecoveryConfirmations = [1, 2].map((index) => Boolean(root.querySelector<HTMLInputElement>(`#room-recovery-answer-${index}`)?.checked)) as [boolean, boolean];
  const answers = roomRecoveryConfirmations.map((confirmed) => confirmed ? "yes" : "");
  if (roomAnonymousIdentity) {
    if (answers.some((answer) => !answer)) {
      roomRecoveryRevealError = "Confirm both recovery statements before revealing the key.";
      rerenderProductRoute();
      return;
    }

    revealRoomRecoveryKeyTemporarily();
    return;
  }

  const usernameInput = root.querySelector<HTMLInputElement>("#room-recovery-username");
  roomRecoveryUsernameInput = usernameInput?.value ?? roomRecoveryUsernameInput;
  const username = completeRoomHandle(roomRecoveryUsernameInput);
  if (!ROOM_HANDLE_PATTERN.test(username) || username !== roomAccountUsername || answers.some((answer) => !answer)) {
    roomRecoveryRevealError = "Enter the correct handle and confirm both recovery statements.";
    rerenderProductRoute();
    return;
  }

  roomRecoveryVerificationSubmitting = true;
  roomRecoveryRevealError = "";
  rerenderProductRoute();
  try {
    await verifyRecoveryQuestions(username, answers);
    revealRoomRecoveryKeyTemporarily();
  } catch (error) {
    roomRecoveryRevealError = error instanceof Error ? error.message : "The recovery confirmations did not match.";
  } finally {
    roomRecoveryVerificationSubmitting = false;
    rerenderProductRoute();
  }
}

function revealRoomRecoveryKeyTemporarily(): void {
  if (roomRecoveryRevealTimer !== undefined) {
    window.clearTimeout(roomRecoveryRevealTimer);
  }

  roomRecoveryRevealMode = "visible";
  roomRecoveryRevealError = "";
  roomRecoveryRevealTimer = window.setTimeout(() => {
    roomRecoveryRevealMode = "hidden";
    roomRecoveryRevealTimer = undefined;
    if (["/room/access", "/room/profile"].includes(normalizePath(window.location.pathname))) {
      rerenderProductRoute();
    }
  }, ROOM_RECOVERY_REVEAL_DURATION_MS);
}

async function copyRoomRecoveryKey(button: HTMLButtonElement): Promise<void> {
  const recoveryCode = roomAccountRecoveryCode.trim();
  if (!recoveryCode) {
    return;
  }

  const copyToClipboard = async (): Promise<boolean> => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(recoveryCode);
        return true;
      } catch {
        // Fall through to the temporary-input fallback below.
      }
    }

    const input = document.createElement("textarea");
    input.value = recoveryCode;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    input.remove();
    return copied;
  };

  const copied = await copyToClipboard();
  if (!button.isConnected) {
    return;
  }

  const label = button.closest<HTMLElement>(".room-access-key, .room-profile-card--key")?.querySelector<HTMLElement>("[data-room-recovery-label]");
  button.dataset.state = copied ? "copied" : "failed";
  button.setAttribute("aria-label", copied ? "Recovery key copied" : "Copy failed; select the recovery key manually");
  if (label) {
    label.textContent = copied ? "RECOVERY KEY / COPIED" : "RECOVERY KEY / COPY FAILED";
  }

  window.setTimeout(() => {
    if (!button.isConnected) {
      return;
    }

    delete button.dataset.state;
    button.setAttribute("aria-label", "Copy recovery key");
    if (label) {
      label.textContent = "RECOVERY KEY / SAVE THIS NOW";
    }
  }, 1800);
}

function persistAnonymousSession(): void {
  if (!roomAnonymousIdentity || !roomAnonymousWitness) {
    return;
  }

  sessionStorage.setItem(ROOM_ANONYMOUS_SESSION_STORAGE, JSON.stringify({
    identity: roomAnonymousIdentity,
    witness: roomAnonymousWitness,
  }));
  sessionStorage.setItem(ROOM_SESSION_EXPIRES_AT_STORAGE, String(Date.now() + ROOM_SESSION_TTL_MS));
  sessionStorage.setItem(ROOM_ACCOUNT_RECOVERY_KEY_STORAGE, roomAnonymousIdentity.recoveryCode);
}

function roomSessionIsExpired(): boolean {
  const storedExpiry = sessionStorage.getItem(ROOM_SESSION_EXPIRES_AT_STORAGE);
  if (!storedExpiry) {
    return false;
  }

  const expiresAt = Number(storedExpiry);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

function restoreAnonymousSession(): boolean {
  const stored = sessionStorage.getItem(ROOM_ANONYMOUS_SESSION_STORAGE);
  if (!stored) {
    return false;
  }

  if (roomSessionIsExpired()) {
    clearRoomSession();
    return false;
  }
  if (!sessionStorage.getItem(ROOM_SESSION_EXPIRES_AT_STORAGE)) {
    sessionStorage.setItem(ROOM_SESSION_EXPIRES_AT_STORAGE, String(Date.now() + ROOM_SESSION_TTL_MS));
  }

  try {
    const parsed = JSON.parse(stored) as {
      identity?: AnonymousIdentity;
      witness?: AnonymousMerkleWitness;
    };
    if (!parsed.identity?.secret || !parsed.identity.commitment || !parsed.identity.notificationCapability || !parsed.witness?.root) {
      return false;
    }

    roomAnonymousIdentity = parsed.identity;
    roomAnonymousWitness = parsed.witness;
    roomAccountUsername = "";
    roomAccountRecoveryCode = roomAnonymousIdentity.recoveryCode;
    roomAccountAccessLevel = "read_only";
    roomBackendStatus = "connected";
    if (roomAccessMode === "choose") {
      roomAccessMode = "ready";
    }
    return true;
  } catch {
    sessionStorage.removeItem(ROOM_ANONYMOUS_SESSION_STORAGE);
    return false;
  }
}

async function registerAnonymousRoomAccess(recoveryCode = ""): Promise<void> {
  roomAnonymousSubmitting = true;
  roomBackendStatus = "connecting";
  roomLoginError = "";
  try {
    const status = await fetchAnonymousStatus();
    roomAnonymousStatus = status;
    if (!status.enabled) {
      throw new Error("Anonymous ZK access is not activated on this Worker yet. The username-free entry screen is ready, but the Worker still needs its verification key.");
    }

    const identity = recoveryCode
      ? await anonymousIdentityFromRecoveryCode(recoveryCode)
      : await createAnonymousIdentity();
    const enrollment = await enrollAnonymousMember({
      commitment: identity.commitment,
      notificationCapability: identity.notificationCapability,
    });

    roomAnonymousIdentity = { ...identity, alias: enrollment.displayAlias };
    roomAnonymousWitness = {
      root: enrollment.root,
      leafIndex: enrollment.leafIndex,
      pathElements: enrollment.pathElements,
      pathIndices: enrollment.pathIndices,
    };
    roomAccountUsername = "";
    roomAccountRecoveryCode = identity.recoveryCode;
    roomAccountAccessLevel = "read_only";
    roomAccountWasCreated = !recoveryCode;
    roomBackendStatus = "connected";
    roomPaymentIntentId = "";
    roomPayment = undefined;
    roomVerificationRequested = false;
    roomLoginError = "";
    persistAnonymousSession();
    if (recoveryCode) {
      startRoomEntryTransition("/room", "return");
    } else {
      roomAccessMode = "ready";
      revealRoomRecoveryKeyTemporarily();
    }
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The anonymous room access could not be activated.";
  } finally {
    roomAnonymousSubmitting = false;
    roomLoginSubmitting = false;
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

function clearRoomSession(): void {
  resetRoomRecoveryReveal();
  stopRoomNotificationPolling();
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
  sessionStorage.removeItem(ROOM_ACCOUNT_RECOVERY_KEY_STORAGE);
  sessionStorage.removeItem(ROOM_ANONYMOUS_SESSION_STORAGE);
  sessionStorage.removeItem(ROOM_SESSION_EXPIRES_AT_STORAGE);
  sessionStorage.removeItem(ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE);
  sessionStorage.removeItem("hidn:account:payment-intent");
  sessionStorage.removeItem("hidn:account:verification-requested");
  void logoutAccount().catch(() => undefined);
  roomAccessMode = "choose";
  roomDemoId = "";
  roomDemoMemo = "";
  roomLoginError = "";
  roomLoginSubmitting = false;
  roomBackendStatus = "local";
  roomBackendId = "";
  roomAccountUsername = "";
  roomAccountAccessLevel = "read_only";
  roomTipAddress = "";
  roomTipAddressDraft = "";
  roomTipAddressLoaded = false;
  roomTipAddressRequest = undefined;
  roomTipAddressSaving = false;
  roomTipAddressFeedback = "";
  roomTipAddressError = "";
  roomTipPostId = "";
  roomTipCopyFeedback = "";
  roomTipAddressCopyFeedback = "";
  roomAnonymousIdentity = undefined;
  roomAnonymousWitness = undefined;
  roomAnonymousStatus = undefined;
  roomAnonymousSubmitting = false;
  roomPostComposerOpen = false;
  roomPostText = "";
  roomPostTipsEnabled = false;
  roomPostTipAddressDraft = "";
  roomPostTipAddressEdited = false;
  roomPostError = "";
  roomPostSubmitting = false;
  roomRefreshSubmitting = false;
  roomPosts = [];
  roomPendingPostIds.clear();
  roomPostsLoadedChannel = undefined;
  roomThreadDetailRequests.clear();
  roomThreadDetailLoaded.clear();
  roomThreadDetailErrors.clear();
  roomReactionStateKey = "";
  roomReactionStateRequest = undefined;
  roomLikeCounts.clear();
  roomLikedIds.clear();
  roomAccountRecoveryCode = "";
  roomAccountWasCreated = false;
  roomDeviceHistory = undefined;
  roomDeviceHistoryScope = "";
  roomNotifications = undefined;
  roomNotificationsRequest = undefined;
  roomNotificationsOpen = false;
  roomNotificationsError = "";
  roomNotificationsMarkingRead = false;
  roomLocalComments = [];
  roomReplySubmitting = false;
  roomPaymentIntentId = "";
  roomPayment = undefined;
  roomVerificationRequested = false;
  roomVerificationNoticeOpen = false;
}

function restoreRoomAccountState(): void {
  if (restoreAnonymousSession()) {
    return;
  }

  if (sessionStorage.getItem("hidn:account:logged-in") !== "true") {
    return;
  }

  if (roomSessionIsExpired()) {
    clearRoomSession();
    return;
  }
  if (!sessionStorage.getItem(ROOM_SESSION_EXPIRES_AT_STORAGE)) {
    sessionStorage.setItem(ROOM_SESSION_EXPIRES_AT_STORAGE, String(Date.now() + ROOM_SESSION_TTL_MS));
  }

  roomBackendId = sessionStorage.getItem("hidn:account:user-id") ?? "";
  roomAccountUsername = sessionStorage.getItem("hidn:account:username") ?? "";
  roomAccountAccessLevel = sessionStorage.getItem("hidn:account:access-level") === "full" ? "full" : "read_only";
  roomAccountRecoveryCode = sessionStorage.getItem(ROOM_ACCOUNT_RECOVERY_KEY_STORAGE) ?? "";
  roomPaymentIntentId = sessionStorage.getItem("hidn:account:payment-intent") ?? "";
  roomVerificationRequested = sessionStorage.getItem("hidn:account:verification-requested") === "true" || Boolean(roomPaymentIntentId);
  roomBackendStatus = roomBackendId && roomAccountUsername ? "connected" : "offline";
  if (roomBackendStatus === "connected" && roomAccessMode === "choose") {
    roomAccessMode = "ready";
  }
}

function persistAccountSession(account: AccountResponse, refreshExpiry = true): void {
  roomBackendId = account.userId;
  roomAccountUsername = account.username;
  roomAccountAccessLevel = account.accessLevel;
  roomBackendStatus = "connected";
  roomTipAddress = "";
  roomTipAddressDraft = "";
  roomTipAddressLoaded = false;
  roomTipAddressRequest = undefined;
  roomTipAddressSaving = false;
  roomTipAddressFeedback = "";
  roomTipAddressError = "";
  sessionStorage.setItem("hidn:account:logged-in", "true");
  sessionStorage.setItem("hidn:account:user-id", account.userId);
  sessionStorage.setItem("hidn:account:username", account.username);
  sessionStorage.setItem("hidn:account:access-level", account.accessLevel);
  if (refreshExpiry || !sessionStorage.getItem(ROOM_SESSION_EXPIRES_AT_STORAGE)) {
    sessionStorage.setItem(ROOM_SESSION_EXPIRES_AT_STORAGE, String(Date.now() + ROOM_SESSION_TTL_MS));
  }
}

function hasRoomSession(): boolean {
  return !roomSessionIsExpired() && (Boolean(roomAnonymousIdentity && roomAnonymousWitness)
    || sessionStorage.getItem("hidn:account:logged-in") === "true"
    || (sessionStorage.getItem("hidn:room:verified") === "true" && Boolean(sessionStorage.getItem("hidn:room:secret"))));
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
    <p class="room-entry-transition__label">${isReturning ? "REOPENING / PRIVATE ROOM" : "LOCATING / PRIVATE ROOM"}<span aria-hidden="true">_</span></p>
    <span class="room-entry-transition__subline">${isReturning ? "PRIVATE SIGNAL RECONNECTED" : "ESTABLISHING ANONYMOUS SIGNAL"}</span>
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
  roomAccountRecoveryCode = "";
  roomLocalComments = [];
  resetRoomRecoveryReveal();
  try {
    const credential = generateZkCredential();
    const account = await signupZkAccount(username, publicKeyToHex(credential.publicKey));
    persistAccountSession(account);
    roomAccountRecoveryCode = credential.recoveryCode;
    roomAccountWasCreated = true;
    sessionStorage.setItem(ROOM_ACCOUNT_RECOVERY_KEY_STORAGE, roomAccountRecoveryCode);
    revealRoomRecoveryKeyTemporarily();
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
  } finally {
    roomLoginSubmitting = false;
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

function createZkProofInWorker(secretKey: Uint8Array, message: string): Promise<string> {
  const runOnMainThread = (): Promise<string> => new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try {
        resolve(createZkProof(secretKey, message));
      } catch (error) {
        reject(error);
      }
    }, 0);
  });

  if (typeof Worker === "undefined") {
    return runOnMainThread();
  }

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./zk-proof-worker.ts", import.meta.url), { type: "module" });
    } catch {
      void runOnMainThread().then(resolve, reject);
      return;
    }

    const finish = (): void => {
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<{ type: "proof" | "error"; proof?: string; message?: string }>) => {
      finish();
      if (event.data.type === "proof" && event.data.proof) {
        resolve(event.data.proof);
        return;
      }

      reject(new Error(event.data.message ?? "The browser could not create the proof."));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("The browser could not create the proof."));
    };

    const secretKeyBuffer = Uint8Array.from(secretKey).buffer;
    worker.postMessage({ type: "create-proof", secretKey: secretKeyBuffer, message }, [secretKeyBuffer]);
  });
}

async function syncAccountLogin(username: string, recoveryCode: string): Promise<void> {
  try {
    let account: AccountResponse | undefined;
    let credential: ReturnType<typeof credentialFromRecoveryCode> | undefined;
    try {
      credential = credentialFromRecoveryCode(recoveryCode);
    } catch {
      // Pre-ZK accounts keep using the original recovery-code endpoint.
      account = await loginAccount(username, recoveryCode);
    }

    if (!account) {
      if (!credential) {
        throw new Error("The recovery key could not be read by the browser.");
      }

      const challenge = await requestZkChallenge(username);
      const message = buildZkChallengeMessage(username, challenge.challengeId, challenge.challenge);
      const proof = await createZkProofInWorker(credential.secretKey, message);
      account = await verifyZkLogin({
        username,
        challengeId: challenge.challengeId,
        challenge: challenge.challenge,
        proof,
      });
    }

    persistAccountSession(account);
    roomAccountRecoveryCode = recoveryCode;
    roomAccountWasCreated = false;
    sessionStorage.setItem(ROOM_ACCOUNT_RECOVERY_KEY_STORAGE, roomAccountRecoveryCode);
    resetRoomRecoveryReveal();
    roomLocalComments = [];
    roomPayment = undefined;
    roomVerificationRequested = false;
    sessionStorage.removeItem("hidn:account:verification-requested");
    roomLoginError = "";
    startRoomEntryTransition("/room", "return");
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not log in this account.";
  } finally {
    roomLoginSubmitting = false;
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
      <h1 class="type-display-lg room-access-header__title">CROSS THE<br /><em>THRESHOLD.</em></h1>
    </header>
    <div class="room-access-options">
      <article class="room-access-option">
        <div>
          <h2>BEGIN WITHOUT A NAME</h2>
          <p>Create a private recovery key to access the room. No username is required.</p>
        </div>
        ${SecondaryButton({ label: "SET UP ANONYMOUS ACCESS", dataAction: "room-create" })}
      </article>
      <article class="room-access-option">
        <div>
          <h2>RETURN WITH YOUR KEY</h2>
          <p>Use the recovery key you saved. It is the only return credential.</p>
        </div>
        ${SecondaryButton({ label: "ENTER WITH RECOVERY KEY", dataAction: "room-login" })}
      </article>
    </div>
    ${SystemMessage("PRIVATE ACCESS", "Create anonymous access or return with your recovery key to enter the room.", "LIVE")}
  </div>`;
}

function renderRoomCreate(): string {
  return `<div class="room-access-page">
    <header class="room-access-header room-access-header--compact">
      <h1 class="type-display-lg room-access-header__title">KEEP YOUR<br /><em>KEY.</em></h1>
      <p class="room-access-header__copy">HIDN creates a private recovery key on this device. No username, handle, or public identity is needed.</p>
    </header>
    <form class="room-login-card room-account-card" novalidate>
      <div class="room-access-key room-access-key--pending">
        <span class="room-access-key__label">PRIVATE CREDENTIAL / GENERATED IN YOUR BROWSER</span>
        <p>The browser creates the secret locally and sends only a membership commitment to the Worker. Save the recovery key when it appears; HIDN cannot recover it.</p>
      </div>
    </form>
    ${roomLoginError ? AlertMessage("WORKER RESPONSE", roomLoginError, "danger") : ""}
    <div class="room-access-actions">
      ${GhostButton({ label: "← BACK", dataAction: "room-back" })}
      ${SecondaryButton({ label: roomAnonymousSubmitting ? "CREATING PRIVATE KEY..." : "GENERATE RECOVERY KEY →", disabled: roomAnonymousSubmitting, dataAction: "room-create-account" })}
    </div>
  </div>`;
}

function renderRoomLogin(): string {
  return `<div class="room-access-page">
    <header class="room-access-header room-access-header--compact">
      <h1 class="type-display-lg room-access-header__title">RETURN TO<br /><em>THE ROOM.</em></h1>
      <p class="room-access-header__copy">Use the recovery key you saved. It is the only credential; the browser proves you hold it without sending the key to HIDN.</p>
    </header>
    ${roomLoginError ? AlertMessage("ID NEEDED", roomLoginError, "danger") : ""}
    <form class="room-login-card" novalidate>
      <label class="room-access-field" for="room-login-recovery-code">
        <span>PRIVATE RECOVERY KEY</span>
        <input id="room-login-recovery-code" type="text" placeholder="HIDN-ANON-XXXX-..." autocomplete="one-time-code" spellcheck="false" />
      </label>
      <p class="room-payment-card__note">The browser derives your anonymous membership credential locally. The recovery key is never sent to the Worker.</p>
      <div class="room-access-actions">
        ${GhostButton({ label: "← BACK", dataAction: "room-back" })}
        ${SecondaryButton({ label: roomLoginSubmitting || roomAnonymousSubmitting ? "VERIFYING KEY..." : "ENTER WITH KEY →", disabled: roomLoginSubmitting || roomAnonymousSubmitting, dataAction: "room-submit-login" })}
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

function renderRecoveryConfirmationFields(): string {
  return ROOM_RECOVERY_CONFIRMATIONS.map((question, index) => `<fieldset class="room-recovery-question">
    <legend>CONFIRMATION ${String(index + 1).padStart(2, "0")}</legend>
    <p class="room-recovery-question__prompt">${escapeHtml(question)}</p>
    <label class="room-recovery-confirmation">
      <input id="room-recovery-answer-${index + 1}" type="checkbox" value="yes"${roomRecoveryConfirmations[index] ? " checked" : ""} />
      <span>YES, I UNDERSTAND</span>
    </label>
  </fieldset>`).join("");
}

function renderRecoveryRevealPrompt(className: string): string {
  const isAnonymous = Boolean(roomAnonymousIdentity);
  const handleField = isAnonymous ? "" : `<label class="room-access-field">
        <span>USERNAME / HIDN PRIVATE HANDLE</span>
        <div class="room-handle-input">
          <span class="room-handle-input__prefix" aria-hidden="true">HIDN-</span>
          <input id="room-recovery-username" type="text" value="${escapeHtml(roomRecoveryUsernameInput)}" placeholder="NOIR42" autocomplete="username" autocapitalize="characters" spellcheck="false" maxlength="25" pattern="[A-Za-z0-9]+" />
        </div>
      </label>`;
  const label = isAnonymous ? "RECOVERY KEY / CONFIRM OWNERSHIP" : "RECOVERY KEY / CONFIRM HANDLE";
  const note = "Confirm both statements. The recovery key will be visible for 20 seconds only.";

  return `<form class="${className}" data-room-recovery-form novalidate>
      <span class="room-access-key__label">${label}</span>
      ${handleField}
      ${renderRecoveryConfirmationFields()}
      ${roomRecoveryRevealError ? AlertMessage("KEY NOT REVEALED", roomRecoveryRevealError, "danger") : ""}
      <p class="room-payment-card__note">${note}</p>
      <div class="room-access-actions">
        ${GhostButton({ label: "CANCEL", dataAction: "room-recovery-cancel" })}
        ${SecondaryButton({ type: "submit", label: roomRecoveryVerificationSubmitting ? "CHECKING CONFIRMATIONS..." : "REVEAL RECOVERY KEY →", disabled: roomRecoveryVerificationSubmitting })}
      </div>
    </form>`;
}

function renderRoomRecoveryPanel(): string {
  if (roomAnonymousIdentity) {
    if (roomRecoveryRevealMode === "visible") {
      return `<section class="room-access-key room-recovery-panel room-recovery-panel--visible" aria-live="polite">
        <span class="room-access-key__label" data-room-recovery-label>RECOVERY KEY / SAVE THIS NOW</span>
        <button class="room-access-key__copy" type="button" data-action="room-copy-recovery-key" aria-label="Copy recovery key">
          <code>${escapeHtml(roomAccountRecoveryCode)}</code>
        </button>
        <span class="room-access-key__warning">VISIBLE FOR 20 SECONDS / REPEAT THE CONFIRMATIONS TO REVEAL IT AGAIN.</span>
      </section>`;
    }

    if (roomRecoveryRevealMode === "prompt") {
      return renderRecoveryRevealPrompt("room-login-card room-recovery-panel");
    }

    return `<section class="room-access-key room-recovery-panel room-recovery-panel--hidden">
      <span class="room-access-key__label">RECOVERY KEY / LOCAL ONLY</span>
      <p>This key is the only way back into this anonymous access session. It is not a username and is never sent to HIDN.</p>
      ${SecondaryButton({ label: "RECOVER KEY →", dataAction: "room-recovery-open" })}
    </section>`;
  }

  if (!roomAccountRecoveryCode) {
    return `<section class="room-access-key room-recovery-panel room-recovery-panel--hidden">
      <span class="room-access-key__label">RECOVERY KEY / NOT IN THIS SESSION</span>
      <p>The recovery key cannot be recovered from HIDN. Return with the key you saved to restore it in this browser session.</p>
      ${SecondaryButton({ label: "RETURN WITH SAVED KEY →", dataAction: "room-login" })}
    </section>`;
  }

  if (roomRecoveryRevealMode === "visible") {
    return `<section class="room-access-key room-recovery-panel room-recovery-panel--visible" aria-live="polite">
      <span class="room-access-key__label" data-room-recovery-label>RECOVERY KEY / SAVE THIS NOW</span>
      <button class="room-access-key__copy" type="button" data-action="room-copy-recovery-key" aria-label="Copy recovery key">
        <code>${escapeHtml(roomAccountRecoveryCode)}</code>
      </button>
      <span class="room-access-key__warning">Save it before entering the room. HIDN cannot recover a lost key.</span>
    </section>`;
  }

  if (roomRecoveryRevealMode === "prompt") {
    return renderRecoveryRevealPrompt("room-login-card room-recovery-panel");
  }

  return `<section class="room-access-key room-recovery-panel room-recovery-panel--hidden">
    <span class="room-access-key__label">RECOVERY KEY / HIDDEN</span>
    <p>The recovery key is not displayed automatically. Confirm both recovery statements to reveal it temporarily.</p>
    ${SecondaryButton({ label: "RECOVER KEY →", dataAction: "room-recovery-open" })}
    <span class="room-access-key__warning">The recovery key cannot be recovered from HIDN. So keep it safely; it is your key to the private room.</span>
  </section>`;
}

function renderRoomReady(): string {
  const isFull = roomAccountAccessLevel === "full";
  const isNewAccount = roomAccountWasCreated;
  const payment = roomPayment;
  const accountLabel = roomAnonymousIdentity ? "ANONYMOUS ACCESS" : roomAccountUsername ? `@${roomAccountUsername}` : "ACCOUNT SESSION";
  const showVerification = roomVerificationRequested && !isFull;
  const titleText = isNewAccount ? "SAVE YOUR KEY." : "THE ROOM IS OPEN.";
  const titleSignal = isNewAccount ? "KEY." : "OPEN.";
  const accountCopy = isNewAccount
    ? "The private room is ready. Save the recovery key below, then enter the room."
    : isFull
      ? `${accountLabel} is active with full room access.`
      : `${accountLabel} is active with free room access. Enter the private room to post, reply, and keep your history.`;

  return `<div class="room-access-page room-access-page--ready">
    <header class="room-access-header room-access-header--compact">
      <h1 class="type-display-lg room-access-header__title" aria-label="${escapeHtml(titleText)}">
        THE ROOM IS<br />
        <em>${escapeHtml(titleSignal)}</em>
      </h1>
      <p class="room-access-header__copy">${escapeHtml(accountCopy)}</p>
    </header>
    ${roomAnonymousIdentity || roomAccountUsername ? renderRoomRecoveryPanel() : ""}
    ${showVerification && payment ? `<section class="room-payment-card" aria-labelledby="room-payment-title">
      <div class="room-payment-card__header">
        <span class="room-payment-card__eyebrow">PAYMENT INTENT / MAINNET</span>
        <span class="room-payment-card__status"><span aria-hidden="true"></span>${escapeHtml(roomPaymentStatusLabel(payment.status))}</span>
      </div>
      <h2 id="room-payment-title">SEND THE EXACT AMOUNT</h2>
      <p class="room-payment-card__explainer">Use the receiving address and one-time reference below. Optional ZEC verification unlocks higher room limits and advanced privileges after the signed watcher reports the exact zatoshi amount with the required confirmations.</p>
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
      ${SecondaryButton({ label: roomBackendStatus === "connecting" ? "CREATING PAYMENT REQUEST..." : "CREATE PAYMENT REQUEST →", disabled: roomBackendStatus === "connecting", dataAction: "room-create-payment-intent" })}
    </form>` : ""}
    <div class="room-access-actions">
      ${SecondaryButton({ label: isNewAccount ? "ENTER THE ROOM →" : "GO BACK TO ROOM →", className: "room-ready-enter", dataAction: "room-enter" })}
    </div>
  </div>`;
}

function renderProfileTipAddress(): string {
  if (!roomTipAddressLoaded) {
    return `<section class="room-profile-card room-profile-card--tips" aria-labelledby="room-profile-tips-title" aria-busy="true">
      ${TerminalLabel("TESTNET / TIP DESTINATION")}
      <h2 id="room-profile-tips-title">DIRECT SUPPORT</h2>
      <p class="room-profile-card__note">READING YOUR TESTNET DESTINATION...</p>
    </section>`;
  }

  return `<section class="room-profile-card room-profile-card--tips" aria-labelledby="room-profile-tips-title">
    ${TerminalLabel("TESTNET / TIP DESTINATION")}
    <h2 id="room-profile-tips-title">LET THE ROOM SUPPORT YOU.</h2>
    <p class="room-profile-card__note">Add a shielded Zcash testnet receiving address from your wallet. New room posts will show a direct TIP WITH TAZ action. HIDN stores only this public destination; it never stores a spending key or holds TAZ.</p>
    <form class="room-tip-address-form" data-room-tip-address-form novalidate>
      <label class="ui-field" for="room-tip-address">
        <span class="ui-field__label">SHIELDED TESTNET ADDRESS / OPTIONAL</span>
        <input id="room-tip-address" type="text" value="${escapeHtml(roomTipAddressDraft)}" placeholder="utest1..." autocomplete="off" spellcheck="false" maxlength="500" />
      </label>
      <p class="room-tip-address-form__hint">Only shielded testnet addresses beginning with <code>utest1</code> or <code>ztestsapling1</code> are accepted. Leave it empty to turn tips off for future posts.</p>
      ${roomTipAddressError ? `<p class="room-tip-address-form__feedback room-tip-address-form__feedback--error" role="alert">${escapeHtml(roomTipAddressError)}</p>` : ""}
      ${roomTipAddressFeedback ? `<p class="room-tip-address-form__feedback" role="status">${escapeHtml(roomTipAddressFeedback)}</p>` : ""}
      ${SecondaryButton({ label: roomTipAddressSaving ? "SAVING DESTINATION..." : "SAVE TESTNET DESTINATION →", type: "submit", disabled: roomTipAddressSaving, dataAction: "room-tip-address-save" })}
    </form>
  </section>`;
}

function contentStatusLabel(status: RoomComment["status"]): string {
  switch (status) {
    case "hidden":
      return "HIDDEN";
    case "rejected":
      return "REJECTED";
    case "pending":
      return "PENDING REVIEW";
    default:
      return "VISIBLE";
  }
}

function renderProfileRecoveryKey(): string {
  if (!roomAccountRecoveryCode) {
    return `<section class="room-profile-card room-profile-card--key" aria-labelledby="room-profile-key-title">
      <span class="room-access-key__label" id="room-profile-key-title">RECOVERY KEY / NOT IN THIS SESSION</span>
      <p class="room-profile-card__note">The recovery key cannot be recovered from HIDN. Return to the room with the key you saved to restore it in this browser session.</p>
      ${SecondaryButton({ label: "RECOVER KEY / RETURN TO LOGIN →", dataAction: "room-recovery-open" })}
    </section>`;
  }

  if (roomRecoveryRevealMode === "visible") {
    const repeatInstruction = roomAnonymousIdentity
      ? "VISIBLE FOR 20 SECONDS / REPEAT THE CONFIRMATIONS TO REVEAL IT AGAIN."
      : "VISIBLE FOR 20 SECONDS / REPEAT THE HANDLE CHECK TO REVEAL IT AGAIN.";
    return `<section class="room-profile-card room-profile-card--key room-recovery-panel room-recovery-panel--visible" aria-labelledby="room-profile-key-title" aria-live="polite">
      <span class="room-access-key__label" id="room-profile-key-title" data-room-recovery-label>RECOVERY KEY / SAVE THIS NOW</span>
      <button class="room-access-key__copy" type="button" data-action="room-copy-recovery-key" aria-label="Copy recovery key">
        <code>${escapeHtml(roomAccountRecoveryCode)}</code>
      </button>
      <span class="room-access-key__warning">${repeatInstruction}</span>
    </section>`;
  }

  if (roomRecoveryRevealMode === "prompt") {
    return renderRecoveryRevealPrompt("room-profile-card room-profile-card--key room-login-card room-recovery-panel");
  }

  return `<section class="room-profile-card room-profile-card--key room-recovery-panel room-recovery-panel--hidden" aria-labelledby="room-profile-key-title">
    <span class="room-access-key__label" id="room-profile-key-title">RECOVERY KEY / HIDDEN</span>
    <p class="room-profile-card__note">The recovery key is hidden by default. Confirm both recovery statements to reveal it for 20 seconds.</p>
    ${SecondaryButton({ label: "RECOVER KEY →", dataAction: "room-recovery-open" })}
    <span class="room-access-key__warning">The recovery key cannot be recovered from HIDN. So keep it safely; it is your key to the private room.</span>
  </section>`;
}

function renderProfilePost(post: DeviceSignalPost): string {
  return `<article class="room-profile-history__item">
    <header><span>${escapeHtml(post.reference)} / ${escapeHtml(post.channel.toUpperCase())}</span><time>${escapeHtml(formatTransmissionTime(post.time))}</time></header>
    <p>${escapeHtml(post.text)}</p>
    <footer><span>POST</span><span>${escapeHtml(contentStatusLabel(post.status))}</span></footer>
  </article>`;
}

function renderProfileComment(comment: RoomComment): string {
  return `<article class="room-profile-history__item">
    <header><span>THREAD / ${escapeHtml(comment.threadId.replace(/^THR-/, "").slice(0, 8))}</span><time>${escapeHtml(formatTransmissionTime(comment.time))}</time></header>
    <p>${escapeHtml(comment.text)}</p>
    <footer><span>${escapeHtml(comment.channel.toUpperCase())}</span><span>${escapeHtml(contentStatusLabel(comment.status))}</span></footer>
  </article>`;
}

function renderZecVerificationNotice(): string {
  if (!roomVerificationNoticeOpen) {
    return "";
  }

  return `<div class="hidn-verification-notice" data-zec-verification-notice role="dialog" aria-modal="true" aria-labelledby="hidn-verification-notice-title">
    <button class="hidn-verification-notice__backdrop" type="button" data-action="room-verification-notice-close" aria-label="Close Zcash verification notice"></button>
    <section class="hidn-verification-notice__panel">
      <span class="hidn-verification-notice__signal">ZEC SIGNAL / STANDBY</span>
      <div class="hidn-verification-notice__sky" aria-hidden="true">
        <div class="hidn-verification-notice__flight">
          <span class="hidn-verification-notice__banner">COMING SOON</span>
          <span class="hidn-verification-notice__towline"></span>
          <span class="hidn-verification-notice__plane">✈</span>
        </div>
      </div>
      <h2 id="hidn-verification-notice-title">HOLD TIGHT,<br /><em>ANON.</em></h2>
      <p>Zcash verification is on its way.</p>
      <span class="hidn-verification-notice__subline">ZEC VERIFICATION / IN TRANSIT</span>
      ${GhostButton({ label: "CLOSE →", dataAction: "room-verification-notice-close" })}
    </section>
  </div>`;
}

function renderRoomProfile(): RenderedProductRoute {
  restoreRoomAccountState();
  if (!hasRoomSession()) {
    return {
      metadata: ROOM_METADATA,
      html: publicFrame(
        "/room/profile",
        `<main id="main-content" class="public-main room-main room-profile-main">
          <div class="room-locked-page">
            ${TerminalLabel("HIDN / PROFILE ACCESS REQUIRED")}
            <h1 class="type-display-lg">THE PROFILE STAYS<br /><em>BEHIND THE KEY.</em></h1>
            <p>Enter the private room first. Your profile, recovery key session, and personal history are never public.</p>
            ${actionLink("ENTER THE ROOM", "/room/access", "primary")}
          </div>
        </main>`,
        "public-page--room public-page--room-profile",
      ),
    };
  }

  const isFull = roomAccountAccessLevel === "full";
  const isAnonymous = Boolean(roomAnonymousIdentity);
  const profileLabel = isAnonymous ? "ANONYMOUS ACCESS" : roomAccountUsername;
  const deviceHistory = loadDeviceSignalHistory();
  const posts = deviceHistory.posts;
  const comments = deviceHistory.comments;
  const profileStats = deviceSignalStats(deviceHistory);

  return {
    metadata: {
      ...ROOM_METADATA,
      title: "HIDN — Private profile",
      description: "A private HIDN profile for recovery access and personal room history.",
      canonicalPath: "/room/profile",
    },
    html: publicFrame(
      "/room/profile",
      `<main id="main-content" class="public-main room-main room-profile-main">
        <div class="room-profile-page">
          <header class="room-access-header room-access-header--compact room-profile-page__header">
            <div class="room-profile-signal-lockup">
              <span class="room-profile-signal-icon" aria-hidden="true">
                <span class="room-profile-signal-icon__wave room-profile-signal-icon__wave--outer"></span>
                <span class="room-profile-signal-icon__wave room-profile-signal-icon__wave--inner"></span>
                <span class="room-profile-signal-icon__mast"></span>
              </span>
              ${TerminalLabel("PRIVATE SIGNAL / PROFILE")}
            </div>
            <h1 class="type-display-lg room-access-header__title">YOUR SIGNALS<br /><em>STAY WITH YOU.</em></h1>
            <p class="room-access-header__copy">${isAnonymous ? "This is a private anonymous access surface. Your recovery key stays on this device and is never used as a public name." : `${escapeHtml(roomAccountUsername)} is a private account surface. Your handle is pseudonymous; your recovery key stays behind this session.`} Your signals are stored only in this browser and cannot move to another device.</p>
          </header>
          <section class="room-profile-card room-profile-card--identity" aria-labelledby="room-profile-status-title">
            <div class="room-profile-card__heading">
              <div>
                ${TerminalLabel(isAnonymous ? "ACCESS / ANONYMOUS CREDENTIAL" : "ACCOUNT / PRIVATE HANDLE")}
                <h2 id="room-profile-status-title">${escapeHtml(profileLabel)}</h2>
              </div>
              ${StatusIndicator(isFull ? "VERIFIED ACCESS" : "FREE ACCESS / OPTIONAL ZEC", isFull ? "online" : "warning", true)}
            </div>
            <p class="room-profile-card__note">${isFull ? "Verified access is enabled for this account. Posts allow up to 2,000 characters and replies allow up to 1,200." : "Free access includes anonymous posts, replies, reactions, and private history. Posts allow 500 characters and replies allow 500; optional ZEC verification unlocks higher limits and advanced room privileges."} This history is saved only on this device. It is not synced, exported, or recoverable on another device.</p>
            <div class="room-profile-stats" aria-label="Private account totals">
              <div><span>TOTAL POSTS</span><strong>${formatPrivateTotal(profileStats.posts)}</strong></div>
              <div><span>TOTAL COMMENTS</span><strong>${formatPrivateTotal(profileStats.comments)}</strong></div>
              <div><span>LIKES RECEIVED</span><strong>${formatPrivateTotal(profileStats.likes)}</strong></div>
            </div>
            ${isFull ? "" : `<div class="room-profile-card__actions">
              ${SecondaryButton({ label: "VERIFY WITH ZEC →", dataAction: "room-open-verification" })}
              ${GhostButton({ label: "CONTINUE FREE →", dataAction: "room-profile-back" })}
            </div>`}
          </section>
          ${renderProfileTipAddress()}
          ${renderProfileRecoveryKey()}
          <div class="room-profile-history-grid">
            <section class="room-profile-card room-profile-history" aria-labelledby="room-profile-posts-title">
              <header class="room-profile-history__header">
                <div>
                  ${TerminalLabel("HISTORY / YOUR POSTS")}
                  <h2 id="room-profile-posts-title">POSTS</h2>
                </div>
                <span>${formatPrivateTotal(profileStats.posts)}</span>
              </header>
              <div class="room-profile-history__list">
                ${posts.length ? posts.map(renderProfilePost).join("") : `<p class="room-profile-history__empty">NO POSTS SAVED ON THIS DEVICE YET.</p>`}
              </div>
            </section>
            <section class="room-profile-card room-profile-history" aria-labelledby="room-profile-comments-title">
              <header class="room-profile-history__header">
                <div>
                  ${TerminalLabel("HISTORY / YOUR COMMENTS")}
                  <h2 id="room-profile-comments-title">COMMENTS</h2>
                </div>
                <span>${formatPrivateTotal(profileStats.comments)}</span>
              </header>
              <div class="room-profile-history__list">
                ${comments.length ? comments.map(renderProfileComment).join("") : `<p class="room-profile-history__empty">NO COMMENTS SAVED ON THIS DEVICE YET.</p>`}
              </div>
            </section>
          </div>
          <div class="room-access-actions room-profile-page__actions">
            ${GhostButton({ label: "← BACK TO THE ROOM", dataAction: "room-profile-back" })}
          </div>
        </div>
        ${renderZecVerificationNotice()}
      </main>`,
      "public-page--room public-page--room-profile",
    ),
  };
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
        ${renderLiveRoomActivity()}
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
      copy: "HIDN’s privacy-first approach to anonymous thoughts and unnamed conversations.",
      body: "HIDN treats anonymity as a boundary, not a personality. The message can be seen without requiring a name, a profile, or a trail to follow.",
    };
  }

  if (path === "/privacy") {
    return {
      eyebrow: "HIDN / PRIVACY",
      title: "REVEAL LESS BY DEFAULT.",
      copy: "Concrete privacy principles for anonymous thoughts, private room access, and recovery keys.",
      body: "HIDN keeps personal identity out of the conversation. Room access uses a pseudonymous handle and a recovery key; private account history stays behind the room session. Privacy controls are described concretely rather than as a promise of universal anonymity.",
    };
  }

  return {
    eyebrow: "HIDN / HOW IT WORKS",
    title: "THE PERSON STAYS OUT OF FRAME.",
    copy: "Learn how HIDN supports anonymous thoughts with pseudonymous room access and privacy-first design.",
    body: "The public flow is intentionally small: set up private access or return with a recovery key, enter the room, then read or leave an anonymous thought. Account access and room verification stay separate from the first step into the room.",
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
      structuredData: webPageStructuredData(`HIDN — ${title}`, page.copy, path),
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
          <div class="home-room-signal">
              <span class="home-room-signal__brand">${HidnDoorLogo({ className: "home-room-signal__logo", label: "HIDN home" })}</span>
              <div class="home-room-signal__actions">
                ${renderAmbientAudioControl()}
                ${renderVisitorTimeSignal("home-room-signal__meta")}
              </div>
          </div>
          <div class="home-room-card-field" aria-hidden="true">
            ${renderHomeRoomCards(8)}
          </div>
          <div class="home-room-core">
            <div class="home-room-core__watcher">${renderRoomEyeWatcher()}</div>
            <h1 id="home-room-title">WRITE<br /><em>FREELY.</em><br />STAY PRIVATE.</h1>
            <p class="home-room-core__copy">A private room for thoughts, confessions, and conversations without public names.</p>
            <a class="ui-button ui-button--primary home-room-enter" href="/room/access" data-room-enter data-glitch-text="> ENTER ROOM" aria-label="ENTER ROOM">
              <span class="home-room-enter__prompt" aria-hidden="true">&gt;</span><span>ENTER ROOM</span><span class="home-room-enter__cursor" aria-hidden="true">_</span>
            </a>
            <p class="home-room-core__status">PRIVATE SIGNAL / NO NAME REQUIRED</p>
          </div>
          <aside class="home-room-invite" data-home-invite hidden aria-label="Private room invitation">
            <button class="home-room-invite__close" type="button" data-action="home-invite-close" aria-label="Dismiss room invitation">×</button>
            <div class="home-room-invite__watcher" aria-hidden="true">
              <span class="home-room-invite__glasses">
                <span class="home-room-invite__lens"><span class="home-room-invite__eye"><span class="home-room-invite__pupil"></span></span></span>
                <span class="home-room-invite__bridge"></span>
                <span class="home-room-invite__lens"><span class="home-room-invite__eye home-room-invite__eye--right"><span class="home-room-invite__pupil"></span></span></span>
              </span>
            </div>
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

  restoreRoomAccountState();
  if (isProtectedRoomPath(normalizedPath) && !hasRoomSession()) {
    window.history.replaceState({}, "", "/");
    return renderHome();
  }

  if (normalizedPath === "/room/access" && hasRoomSession()) {
    window.history.replaceState({}, "", "/room");
    return {
      metadata: EXPLORE_METADATA,
      html: isRoomMobileViewport() ? renderMobileRoomIndex() : renderExplore("/room"),
    };
  }

  if (isModerationSurfacePath(normalizedPath) && !moderationVisibilityReady) {
    return renderModerationGate(path);
  }

  if (normalizedPath === "/") {
    return renderHome();
  }

  if (normalizedPath === "/room") {
    return {
      metadata: EXPLORE_METADATA,
      html: isRoomMobileViewport() ? renderMobileRoomIndex() : renderExplore("/room"),
    };
  }

  const roomChannel = roomChannelFromPath(normalizedPath);
  if (roomChannel) {
    activeRoomChannel = roomChannel;
    return {
      metadata: {
        ...EXPLORE_METADATA,
        title: `HIDN — ${roomChannelOption(roomChannel).label}`,
        canonicalPath: normalizedPath,
      },
      html: renderExplore(normalizedPath),
    };
  }

  if (normalizedPath === "/room/profile") {
    return renderRoomProfile();
  }

  if (normalizedPath === "/room/access") {
    return renderRoomAccess();
  }

  if (normalizedPath === "/admin") {
    return renderAdminDashboard();
  }

  if (normalizedPath === "/admin/reports") {
    return renderAdminReports();
  }

  if (normalizedPath === "/admin/moderators") {
    return renderAdminModerators();
  }

  if (normalizedPath === "/admin/audit") {
    return renderAdminAudit();
  }

  if (normalizedPath === "/explore") {
    window.history.replaceState({}, "", "/room");
    return {
      metadata: EXPLORE_METADATA,
      html: isRoomMobileViewport() ? renderMobileRoomIndex() : renderExplore("/room"),
    };
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

interface RoomRecoveryInteractionState {
  username: string;
  confirmations: [boolean, boolean];
  tipAddress: string;
  activeControlId?: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

function captureRoomRecoveryInteractionState(): RoomRecoveryInteractionState | undefined {
  const form = document.querySelector<HTMLFormElement>("[data-room-recovery-form]");
  const tipInput = document.querySelector<HTMLInputElement>("#room-tip-address");
  if (!form && !tipInput) {
    return undefined;
  }

  const usernameInput = form?.querySelector<HTMLInputElement>("#room-recovery-username");
  const activeElement = document.activeElement;
  const activeInput = activeElement instanceof HTMLInputElement
    && (Boolean(form?.contains(activeElement)) || activeElement === tipInput)
    ? activeElement
    : undefined;
  const confirmations = [1, 2].map((index) => Boolean(form?.querySelector<HTMLInputElement>(`#room-recovery-answer-${index}`)?.checked)) as [boolean, boolean];
  const tipAddress = tipInput?.value ?? roomTipAddressDraft;
  roomTipAddressDraft = tipAddress;

  return {
    username: usernameInput?.value ?? roomRecoveryUsernameInput,
    confirmations,
    tipAddress,
    activeControlId: activeInput?.id,
    selectionStart: activeInput?.selectionStart ?? null,
    selectionEnd: activeInput?.selectionEnd ?? null,
  };
}

function restoreRoomRecoveryInteractionState(state: RoomRecoveryInteractionState | undefined): void {
  if (!state) {
    return;
  }

  const form = document.querySelector<HTMLFormElement>("[data-room-recovery-form]");
  const tipInput = document.querySelector<HTMLInputElement>("#room-tip-address");

  const usernameInput = form?.querySelector<HTMLInputElement>("#room-recovery-username");
  if (usernameInput) {
    usernameInput.value = state.username;
  }

  state.confirmations.forEach((checked, index) => {
    const checkbox = form?.querySelector<HTMLInputElement>(`#room-recovery-answer-${index + 1}`);
    if (checkbox) {
      checkbox.checked = checked;
    }
  });

  if (tipInput) {
    tipInput.value = state.tipAddress;
  }

  if (state.activeControlId) {
    const activeInput = document.querySelector<HTMLInputElement>(`#${state.activeControlId}`);
    if (activeInput) {
      activeInput.focus({ preventScroll: true });
      if (activeInput.type !== "checkbox" && state.selectionStart !== null && state.selectionEnd !== null) {
        activeInput.setSelectionRange(state.selectionStart, state.selectionEnd);
      }
    }
  }
}

function rerenderProductRoute(force = false): void {
  if (!force && roomVerificationNoticeOpen && normalizePath(window.location.pathname) === "/room/profile") {
    return;
  }

  const recoveryState = captureRoomRecoveryInteractionState();
  window.dispatchEvent(new CustomEvent("hidn:rerender"));
  restoreRoomRecoveryInteractionState(recoveryState);
}

function navigateProductRoute(path: string): void {
  resetRoomRecoveryReveal();
  roomVerificationNoticeOpen = false;
  roomTipPostId = "";
  roomTipCopyFeedback = "";
  roomTipAddressCopyFeedback = "";
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("popstate"));
}

function validateRestoredRoomSession(path: string): void {
  if (
    !hasRoomSession()
    || roomAnonymousIdentity
    || sessionStorage.getItem("hidn:account:logged-in") !== "true"
    || roomSessionValidationRequest
  ) {
    return;
  }

  const shouldReturnHome = isProtectedRoomPath(path) || path === "/room/access";
  roomSessionValidationRequest = fetchAccountSession()
    .then((account) => {
      persistAccountSession(account, false);
    })
    .catch((error: unknown) => {
      const status = error instanceof Error
        ? (error as Error & { status?: number }).status
        : undefined;
      if (status !== 401) {
        return;
      }

      clearRoomSession();
      if (shouldReturnHome) {
        navigateProductRoute("/");
      }
    })
    .finally(() => {
      roomSessionValidationRequest = undefined;
    });
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

async function toggleRoomLike(root: ParentNode, button: HTMLButtonElement): Promise<void> {
  if (!hasRoomSession() || button.dataset.pending === "true") {
    return;
  }

  const threadId = button.dataset.threadId;
  if (!threadId) {
    return;
  }

  const normalizedPath = normalizePath(window.location.pathname);
  const isPersistedThread = /^THR-[A-F0-9]{24}$/i.test(threadId);
  const canPersistThread = isPersistedThread || Boolean(getMockConfession(threadId));
  if (!canPersistThread) {
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
  } else {
    if (roomAnonymousIdentity && roomLikedIds.has(threadId)) {
      roomChannelNotice = "REACTION ALREADY SAVED / PRIVATE";
      roomPostError = "";
      if (normalizedPath === "/room" || normalizedPath === "/explore" || Boolean(roomChannelFromPath(normalizedPath))) {
        renderExploreFeed(root, activeFeedTab);
      } else {
        rerenderProductRoute();
      }
      return;
    }

    button.dataset.pending = "true";
    button.disabled = true;
    try {
      if (roomAnonymousIdentity) {
        const { scope, proof } = await createAnonymousRoomProof("reaction", "thread", threadId, "like");
        const response = await createAnonymousReaction({
          proof,
          scope,
          alias: roomAnonymousIdentity.alias,
          targetType: "thread",
          targetId: threadId,
        });
        roomLikeCounts.set(threadId, response.reactions);
        roomLikedIds.add(threadId);
        roomChannelNotice = "REACTION SAVED / PRIVATE";
      } else {
        const response = await toggleRoomReaction({ targetType: "thread", targetId: threadId });
        roomLikeCounts.set(threadId, mockReactionBaseCount(threadId) + response.reactions);
        if (response.liked) {
          roomLikedIds.add(threadId);
        } else {
          roomLikedIds.delete(threadId);
        }
        roomChannelNotice = response.liked ? "REACTION SAVED / PRIVATE" : "REACTION REMOVED / PRIVATE";
      }
      roomPostError = "";
    } catch (error) {
      roomPostError = error instanceof Error ? error.message : "The reaction could not be saved.";
      roomChannelNotice = "";
    } finally {
      delete button.dataset.pending;
    }
  }

  if (normalizedPath === "/room" || normalizedPath === "/explore" || Boolean(roomChannelFromPath(normalizedPath))) {
    renderExploreFeed(root, activeFeedTab);
  } else {
    rerenderProductRoute();
  }
}

function bindRoomLikeInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-action="room-like"]').forEach((button) => {
    button.addEventListener("click", () => {
      void toggleRoomLike(root, button);
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

      if (isRoomMobileViewport()) {
        navigateProductRoute(`/room/channel/${key}`);
        return;
      }

      activeRoomChannel = key;
      roomChannelNotice = "";
      roomPostComposerOpen = false;
      roomPostText = "";
      roomPostTipsEnabled = false;
      roomPostTipAddressDraft = "";
      roomPostTipAddressEdited = false;
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

async function loadAdminSessionState(): Promise<boolean> {
  if (adminSessionLoaded) {
    return Boolean(adminSession);
  }
  adminSessionLoaded = true;
  try {
    adminSession = (await fetchAdminSession()).admin;
    return true;
  } catch {
    adminSession = undefined;
    return false;
  }
}

async function loadAdminReports(): Promise<void> {
  const hasSession = adminSession ? true : await loadAdminSessionState();
  if (!adminReportToken && !hasSession) {
    adminReportError = "Open this page through Cloudflare Access, or provide the temporary migration token.";
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

async function loadAdminModerators(): Promise<void> {
  adminModeratorsLoaded = true;
  const hasSession = adminSession ? true : await loadAdminSessionState();
  if (!hasSession || adminSession?.role !== "super_admin") {
    adminReportError = "A super-admin Cloudflare Access session is required for role control.";
    rerenderProductRoute();
    return;
  }

  try {
    adminModerators = (await fetchAdminModerators(adminReportToken)).admins;
    adminReportError = "";
  } catch (error) {
    adminModerators = undefined;
    adminReportError = error instanceof Error ? error.message : "Administrator records could not be loaded.";
  }
  if (normalizePath(window.location.pathname) === "/admin/moderators") {
    rerenderProductRoute();
  }
}

async function loadAdminAudit(): Promise<void> {
  adminAuditLoaded = true;
  const hasSession = adminSession ? true : await loadAdminSessionState();
  if (!hasSession || adminSession?.role !== "super_admin") {
    adminReportError = "A super-admin Cloudflare Access session is required for the audit log.";
    rerenderProductRoute();
    return;
  }

  try {
    adminAuditEvents = (await fetchAdminAudit(adminReportToken)).events;
    adminReportError = "";
  } catch (error) {
    adminAuditEvents = undefined;
    adminReportError = error instanceof Error ? error.message : "The admin audit could not be loaded.";
  }
  if (normalizePath(window.location.pathname) === "/admin/audit") {
    rerenderProductRoute();
  }
}

async function createAdminModeratorFromRoot(root: ParentNode): Promise<void> {
  const email = root.querySelector<HTMLInputElement>("#admin-moderator-email")?.value.trim() ?? "";
  const displayName = root.querySelector<HTMLInputElement>("#admin-moderator-name")?.value.trim() ?? "";
  const role = root.querySelector<HTMLSelectElement>("#admin-moderator-role")?.value ?? "moderator";
  if (!email || (role !== "super_admin" && role !== "moderator" && role !== "reviewer")) {
    adminReportError = "Enter an email and choose a valid administrator role.";
    rerenderProductRoute();
    return;
  }

  try {
    await createAdminModerator(adminReportToken, { email, displayName, role: role as AdminRole });
    adminReportError = "ADMIN ROLE GRANTED / THEY CAN SIGN IN THROUGH ACCESS NOW";
    await loadAdminModerators();
  } catch (error) {
    adminReportError = error instanceof Error ? error.message : "The administrator role could not be granted.";
    rerenderProductRoute();
  }
}

async function updateAdminModeratorFromRoot(button: HTMLButtonElement, disable = false): Promise<void> {
  const adminId = button.dataset.adminId;
  const card = button.closest<HTMLElement>(".admin-report-card");
  const role = card?.querySelector<HTMLSelectElement>("[data-admin-role]")?.value ?? "moderator";
  if (!adminId || (role !== "super_admin" && role !== "moderator" && role !== "reviewer")) {
    return;
  }

  button.disabled = true;
  try {
    await updateAdminModerator(adminReportToken, adminId, {
      role: role as AdminRole,
      status: disable ? "disabled" : "active",
    });
    adminReportError = disable ? "ADMIN DISABLED / AUDIT EVENT RECORDED" : "ADMIN ROLE UPDATED / AUDIT EVENT RECORDED";
    await loadAdminModerators();
  } catch (error) {
    adminReportError = error instanceof Error ? error.message : "The administrator role could not be updated.";
    rerenderProductRoute();
  }
}

async function updateAdminReportFromRoot(button: HTMLButtonElement): Promise<void> {
  const reportId = button.dataset.reportId;
  const card = button.closest<HTMLElement>("[data-admin-report-id]");
  const status = card?.querySelector<HTMLSelectElement>("[data-admin-report-status]")?.value as ReportStatus | undefined;
  const reviewerNote = card?.querySelector<HTMLTextAreaElement>("[data-admin-report-note]")?.value.trim() ?? "";
  if (!reportId || !status || !adminReports) {
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
    !adminReports
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

function bindRoomRecoveryInteractions(root: ParentNode): void {
  const form = root.querySelector<HTMLFormElement>("[data-room-recovery-form]");
  if (!form) {
    return;
  }

  const usernameInput = form.querySelector<HTMLInputElement>("#room-recovery-username");
  usernameInput?.addEventListener("input", () => {
    roomRecoveryUsernameInput = usernameInput.value;
  });

  form.querySelectorAll<HTMLInputElement>("input[id^='room-recovery-answer-']").forEach((checkbox, index) => {
    checkbox.addEventListener("change", () => {
      if (index < roomRecoveryConfirmations.length) {
        roomRecoveryConfirmations[index] = checkbox.checked;
      }
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!roomRecoveryVerificationSubmitting) {
      void verifyRoomRecoveryCheck(root);
    }
  });
}

function bindRoomTipAddressInteractions(root: ParentNode): void {
  const form = root.querySelector<HTMLFormElement>("[data-room-tip-address-form]");
  if (!form) {
    return;
  }

  const input = form.querySelector<HTMLInputElement>("#room-tip-address");
  input?.addEventListener("input", () => {
    roomTipAddressDraft = input.value;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveRoomTipAddressFromRoot(root);
  });
}

function bindRoomPostComposerInteractions(root: ParentNode): void {
  const form = root.querySelector<HTMLFormElement>("[data-room-post-composer]");
  if (!form) {
    return;
  }

  const content = form.querySelector<HTMLTextAreaElement>("#room-post-content");
  content?.addEventListener("input", () => {
    roomPostText = content.value;
  });

  const allowTips = form.querySelector<HTMLInputElement>("#room-post-allow-tips");
  allowTips?.addEventListener("change", () => {
    roomPostTipsEnabled = allowTips.checked;
    if (roomPostTipsEnabled && !roomPostTipAddressEdited && !roomPostTipAddressDraft) {
      roomPostTipAddressDraft = roomTipAddress;
    }
    rerenderProductRoute();
  });

  const tipAddress = form.querySelector<HTMLInputElement>("#room-post-tip-address");
  tipAddress?.addEventListener("input", () => {
    roomPostTipAddressDraft = tipAddress.value;
    roomPostTipAddressEdited = true;
  });
}

export function bindProductRoute(root: ParentNode = document): void {
  bindComponentInteractions(root);
  bindRoomLikeInteractions(root);
  bindRoomChannelInteractions(root);
  bindRoomFolderInteractions(root);
  bindPointerSpotlightInteractions(root);
  bindRoomRecoveryInteractions(root);
  bindRoomTipAddressInteractions(root);
  bindRoomPostComposerInteractions(root);
  hydrateRoomTipQr(root);
  void refreshZcashNetworkStatus(root);
  startVisitorClock(root);
  const isRoomAccessPath = normalizePath(window.location.pathname) === "/room/access";
  if (isRoomAccessPath) {
    startLiveRoomActivity();
  } else {
    stopLiveRoomActivity();
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
      playRoomEntrySignal();
      const returning = hasRoomSession();
      startRoomEntryTransition(returning ? "/room" : "/room/access", returning ? "return" : "first");
    });
  });

  const normalizedPath = normalizePath(window.location.pathname);
  validateRestoredRoomSession(normalizedPath);
  root.querySelectorAll<HTMLAnchorElement>("[data-room-notification-link]").forEach((link) => {
    link.addEventListener("click", () => {
      void markRoomNotificationRead(link.dataset.notificationId ?? "");
    });
  });
  if (isRoomNotificationSurface(normalizedPath) && hasRoomSession()) {
    startRoomNotificationPolling();
  } else {
    stopRoomNotificationPolling();
  }
  if (hasRoomSession() && roomReactionStateSignature(normalizedPath)) {
    void refreshRoomReactionState(normalizedPath);
  }
  if ((normalizedPath === "/room" || Boolean(roomChannelFromPath(normalizedPath))) && hasRoomSession()) {
    void refreshRoomPosts();
  }
  const notificationThreadId = roomThreadIdFromPath(normalizedPath);
  if (notificationThreadId && hasRoomSession()) {
    void refreshRoomThread(notificationThreadId);
  }
  if (normalizedPath === "/room/profile" && hasRoomSession()) {
    void refreshRoomTipAddress();
  }
  if (isRoomPostSurface(normalizedPath) && hasRoomSession()) {
    void refreshRoomTipAddress();
  }
  if (isModerationSurfacePath(normalizedPath)) {
    void refreshModerationVisibility();
  }
  const isAdminPath = ["/admin", "/admin/reports", "/admin/moderators", "/admin/audit"].includes(normalizedPath);
  if (!isAdminPath && (adminReportToken || adminSession || adminReports || adminModerators || adminAuditEvents || adminReportError)) {
    adminReportToken = "";
    adminSession = undefined;
    adminSessionLoaded = false;
    adminReports = undefined;
    adminModerators = undefined;
    adminModeratorsLoaded = false;
    adminAuditEvents = undefined;
    adminAuditLoaded = false;
    adminReportError = "";
    adminReportFilter = "all";
  }
  if (normalizedPath === "/admin") {
    const sessionWasLoaded = adminSessionLoaded;
    void loadAdminSessionState().then(() => {
      if (normalizePath(window.location.pathname) === "/admin" && !sessionWasLoaded) {
        rerenderProductRoute();
      }
    });
  }
  if (normalizedPath === "/admin/moderators" && !adminModeratorsLoaded) {
    void loadAdminModerators();
  }
  if (normalizedPath === "/admin/audit" && !adminAuditLoaded) {
    void loadAdminAudit();
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
        case "admin-moderator-create":
          void createAdminModeratorFromRoot(root);
          break;
        case "admin-moderator-update":
          void updateAdminModeratorFromRoot(button);
          break;
        case "admin-moderator-disable":
          void updateAdminModeratorFromRoot(button, true);
          break;
        case "selection-save":
          if (activeTextSelection) {
            void shareSelectedTexts(root, [activeTextSelection], "save");
          }
          break;
        case "selection-share":
          if (activeTextSelection) {
            void shareSelectedTexts(root, [activeTextSelection], "share");
          }
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
          if (selectedTextBatch.length) {
            void shareSelectedTexts(root, [...selectedTextBatch], "share");
          }
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
        case "room-tip": {
          const threadId = button.dataset.threadId ?? "";
          const post = roomPosts.find((candidate) => candidate.id === threadId);
          if (!post?.tipAddress) {
            roomChannelNotice = "THIS POST DOES NOT HAVE A SHIELDED TESTNET DESTINATION.";
            rerenderProductRoute();
            break;
          }

          roomTipPostId = threadId;
          roomTipCopyFeedback = "";
          roomTipAddressCopyFeedback = "";
          rerenderProductRoute();
          break;
        }
        case "room-tip-close":
          roomTipPostId = "";
          roomTipCopyFeedback = "";
          roomTipAddressCopyFeedback = "";
          rerenderProductRoute();
          break;
        case "room-tip-copy":
          void copyRoomTipRequest(button);
          break;
        case "room-tip-copy-address":
          void copyRoomTipAddress(button);
          break;
        case "room-tip-address-save":
          void saveRoomTipAddressFromRoot(root);
          break;
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
        case "room-notifications-toggle":
          roomNotificationsOpen = !roomNotificationsOpen;
          if (roomNotificationsOpen) {
            void refreshAccountNotifications();
          }
          rerenderProductRoute();
          break;
        case "room-notifications-read":
          void markRoomNotificationsRead();
          break;
        case "room-recovery-open":
          openRoomRecoveryCheck();
          break;
        case "room-recovery-cancel":
          resetRoomRecoveryReveal();
          rerenderProductRoute();
          break;
        case "room-recovery-submit": {
          void verifyRoomRecoveryCheck(root);
          break;
        }
        case "room-open-verification":
          if (roomAccountAccessLevel === "full") {
            break;
          }

          roomVerificationNoticeOpen = true;
          rerenderProductRoute(true);
          break;
        case "room-verification-notice-close":
          roomVerificationNoticeOpen = false;
          rerenderProductRoute();
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
          roomLoginSubmitting = false;
          rerenderProductRoute();
          break;
        case "room-back":
          clearRoomSession();
          roomAccessMode = "choose";
          rerenderProductRoute();
          break;
        case "room-create-account": {
          if (roomAnonymousSubmitting) {
            break;
          }

          roomAnonymousSubmitting = true;
          roomBackendStatus = "connecting";
          roomLoginError = "";
          rerenderProductRoute();
          void registerAnonymousRoomAccess();
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
          if (roomLoginSubmitting || roomAnonymousSubmitting) {
            break;
          }

          const recoveryInput = root.querySelector<HTMLInputElement>("#room-login-recovery-code");
          const recoveryCode = recoveryInput?.value.trim() ?? "";
          if (!/^HIDN-ANON-[A-F0-9-]+$/i.test(recoveryCode)) {
            roomLoginError = "Enter the HIDN-ANON recovery key you saved before continuing.";
            rerenderProductRoute();
            break;
          }

          roomLoginError = "";
          roomLoginSubmitting = true;
          roomAnonymousSubmitting = true;
          roomBackendStatus = "connecting";
          rerenderProductRoute();
          void registerAnonymousRoomAccess(recoveryCode);
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
        case "room-refresh":
          void refreshActiveRoom();
          break;
        case "room-profile-back":
          navigateProductRoute("/room");
          break;
        case "room-copy-recovery-key":
          void copyRoomRecoveryKey(button);
          break;
        case "room-create-post":
          if (!hasRoomSession()) {
            navigateProductRoute("/room/access");
            break;
          }

          roomPostComposerOpen = true;
          roomPostTipsEnabled = false;
          roomPostTipAddressDraft = roomTipAddress;
          roomPostTipAddressEdited = false;
          roomPostError = "";
          roomChannelNotice = "";
          void refreshRoomTipAddress();
          rerenderProductRoute();
          break;
        case "room-post-cancel":
          roomPostComposerOpen = false;
          roomPostText = "";
          roomPostTipsEnabled = false;
          roomPostTipAddressDraft = "";
          roomPostTipAddressEdited = false;
          roomPostError = "";
          rerenderProductRoute();
          break;
        case "room-post-submit": {
          roomPostText = root.querySelector<HTMLTextAreaElement>("#room-post-content")?.value ?? roomPostText;
          roomPostTipsEnabled = root.querySelector<HTMLInputElement>("#room-post-allow-tips")?.checked ?? roomPostTipsEnabled;
          roomPostTipAddressDraft = root.querySelector<HTMLInputElement>("#room-post-tip-address")?.value ?? roomPostTipAddressDraft;
          void submitRoomPost();
          break;
        }
        case "thread-reply": {
          if (!hasRoomSession()) {
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
            void submitRoomReply(threadId, value);
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
