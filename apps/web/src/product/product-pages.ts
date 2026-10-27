import {
  AlertMessage,
  CategoryTag,
  EmptyState,
  ErrorState,
  FooterShell,
  GhostButton,
  HidnPromptLogo,
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
  canonicalAnonymousMessage,
  createAnonymousCircuitInput,
  anonymousIdentityFromRecoveryCode,
  createAnonymousIdentity,
  createAnonymousScope,
  anonymousTargetScope,
  createNotificationCapability,
  deriveLinkInboxKey,
  ANONYMOUS_TREE_DEPTH,
  type AnonymousAction,
  type AnonymousCircuitInput,
  type AnonymousIdentity,
  type AnonymousMerkleWitness,
} from "@hidn/anonymous-zk";
import * as QRCode from "qrcode";
import { renderShareCard, type ShareCardSize } from "./share-card";
import { openShareSheet } from "./share-sheet";
import { terminalWindow } from "./terminal-gate";
import { mountWelcome, renderWelcomeWatcher } from "./welcome";
import { playPortal } from "./portal";
import { openLearningTv } from "./learning-tv";
import { mountTerminalFeed } from "./terminal-feed";
import {
  bindLinkInbox,
  bindLinkSendPage,
  linkSlugFromPath,
  renderLinkInboxBody,
  linkInboxUnreadCount,
  refreshLinkUnread,
  renderLinkSendBody,
  resetLinkInbox,
} from "./link-inbox";
import { setLivePulse } from "./live-pulse";
import {
  bindReadPage,
  bindRoomShareButtons,
  mountHomeTicker,
  readChannelFromPath,
  rememberRoomIntent,
  renderReadBody,
  renderRoomLinkBody,
  roomLinkFromPath,
  takeRoomIntent,
  timeAgo,
} from "./public-feed";
import { mountStandingsStage, mountStandingsTicker, renderStandingsStage, renderStandingsTicker } from "./standings-stage";
import { roomClosedReason, roomLinkByKey, roomNote } from "./room-links";
import { bindMaskPage, MASK_PATH, maskEntry, renderMaskBody } from "./mask";
import {
  KEY_CREDENTIAL_NAME,
  bindKeyReminder,
  bindKeySaveCard,
  canReadSavedKey,
  isKeySaved,
  keyJustSaved,
  readSavedKey,
  renderKeyReminder,
  renderKeySaveCard,
  resetKeyKeeper,
} from "./key-keeper";
import type { MuseumGallery, MuseumPost } from "./room-museum";
import type { MuseumTheme } from "./museum-layout";
import {
  createAnonymousPost,
  createAnonymousReaction,
  createAnonymousReply,
  enrollAnonymousMember,
  fetchAnonymousStatus,
  fetchAnonymousNotifications,
  fetchAnonymousPosts,
  fetchAnonymousThread,
  fetchAdminAudit,
  fetchAdminMetrics,
  type AdminMetrics,
  fetchAdminModerators,
  fetchAdminSession,
  createAdminModerator,
  fetchRoomActivity,
  fetchAdminReports,
  fetchModerationVisibility,
  markAnonymousNotificationsRead,
  moderateAdminContent,
  submitReport,
  updateAdminModerator,
  updateAdminReport,
  type AdminAuditEvent,
  type AdminModerator,
  type AdminRole,
  type AdminReportsResponse,
  type AdminSession,
  type AccountNotification,
  type AccountNotificationsResponse,
  type AnonymousProofEnvelope,
  type ModerationTargetType,
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
type HidnTheme = "quiet" | "signal";
type RoomChannel = "general" | "love" | "ragebait" | "underground" | "wildest" | "students" | "crypto" | "haunted";
type RoomAccessMode = "choose" | "create" | "login" | "ready";
type RoomRecoveryRevealMode = "hidden" | "prompt" | "visible";
type ShareCardType = "THREAD" | "REPLY" | "TEXT" | "BATCH";
type DeviceSignalPost = RoomPost & { status: RoomComment["status"] };



interface DeviceSignalHistory {
  version: 1;
  posts: DeviceSignalPost[];
  comments: RoomComment[];
}

const ROOM_FREE_POST_MAX_LENGTH = 500;
const ROOM_FREE_REPLY_MAX_LENGTH = 500;
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
  return ROOM_FREE_POST_MAX_LENGTH;
}

function roomReplyCharacterLimit(): number {
  return ROOM_FREE_REPLY_MAX_LENGTH;
}

function roomPostLimitCopy(): string {
  return `Posts can be up to ${roomPostCharacterLimit()} characters.`;
}

function roomReplyLimitCopy(): string {
  return `Up to ${roomReplyCharacterLimit()} characters.`;
}

function activeHidnTheme(): HidnTheme {
  // Signal is the single public display theme for this build.
  return "signal";
}

let activeFeedTab: FeedTab = "latest";
let roomAccessMode: RoomAccessMode = "choose";
let roomLoginError = "";
let roomAccountRecoveryCode = "";
let roomAccountWasCreated = false;
let roomAnonymousIdentity: AnonymousIdentity | undefined;
let roomAnonymousWitness: AnonymousMerkleWitness | undefined;
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
let roomRecoveryConfirmations: [boolean, boolean] = [false, false];
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
let roomMuseumPostsByChannel = new Map<RoomChannel, RoomPost[]>();
let roomMuseumLoaded = false;
let roomMuseumRequest: Promise<void> | undefined;
let roomRefreshSubmitting = false;
let roomHallIndex = 0;
let roomHallZoom = 1;
let roomMuseumCleanup: (() => void) | undefined;
let roomMuseumLoadVersion = 0;
const roomThreadDetailRequests = new Map<string, Promise<void>>();
const roomThreadDetailLoaded = new Set<string>();
const roomThreadDetailErrors = new Map<string, string>();
let roomLiveActivityEvents: RoomActivityEvent[] = [];
let roomLiveActivityRequest: Promise<void> | undefined;
let roomLiveActivityTimer: number | undefined;
let roomLiveActivityStatus: "connecting" | "live" | "offline" = "connecting";
let roomSpacePosition = 0;
let roomSpaceSelection = 0;
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
let adminMetrics: AdminMetrics | undefined;
let adminMetricsLoaded = false;
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
  { key: "general", label: "GENERAL", description: "everything people are saying" },
  { key: "underground", label: "THINGS I'VE NEVER TOLD ANYONE", description: "say it here first", categories: ["IDENTITY", "UNCERTAINTY", "JOY"] },
  { key: "love", label: "TALK ABOUT YOUR EX", description: "women and men spill", categories: ["RELATIONSHIPS", "REGRET", "LONELINESS"] },
  { key: "ragebait", label: "RAGEBAIT ME", description: "say the take that starts a fight", categories: ["IDENTITY", "UNCERTAINTY", "JOY"] },
  { key: "wildest", label: "THE WILDEST THING YOU'VE DONE", description: "no names. no judgment. just tell it", categories: ["JOY", "IDENTITY", "UNCERTAINTY"] },
  { key: "students", label: "STUDENT SECRETS", description: "school, uni, everything in between", categories: ["IDENTITY", "FEAR", "UNCERTAINTY"] },
  { key: "crypto", label: "CRYPTO CONFESSIONS", description: "wins, losses, things you'd never tweet", categories: ["REGRET", "JOY", "UNCERTAINTY"] },
  { key: "haunted", label: "THINGS THAT HAUNT ME", description: "halloween only. say what keeps you up at night", categories: ["FEAR", "REGRET", "LONELINESS"] },
];

const ROOM_CHANNEL_KEYS: RoomChannel[] = roomChannelOptions.map((channel) => channel.key);

const museumThemeByChannel: Record<RoomChannel, MuseumTheme> = {
  general: { accent: "#a9e6b4", glow: "#74c88b", trim: "#3d6b4a", wall: "#14241c", floor: "#202b24" },
  love: { accent: "#e6b0a9", glow: "#c77b72", trim: "#704946", wall: "#241817", floor: "#2d2321" },
  ragebait: { accent: "#f0a39a", glow: "#e0574a", trim: "#7a3029", wall: "#251210", floor: "#2e1a17" },
  underground: { accent: "#a5d1d0", glow: "#66a5a1", trim: "#3c6664", wall: "#132021", floor: "#202c2d" },
  wildest: { accent: "#ecc29b", glow: "#d9874a", trim: "#714a31", wall: "#241811", floor: "#2d211a" },
  students: { accent: "#a9c4ec", glow: "#6f95d1", trim: "#3d5274", wall: "#141b26", floor: "#1f2633" },
  crypto: { accent: "#f4d38a", glow: "#d9a63a", trim: "#6e5626", wall: "#211c10", floor: "#2a2416" },
  haunted: { accent: "#f5a54a", glow: "#e3731c", trim: "#6b3a14", wall: "#1c120a", floor: "#241810" },
};

interface HomeAmbientAudioSession {
  audio: HTMLAudioElement;
  graph: HomeAudioGraph;
  resumeAudio: () => void;
  gestureHandler: (event: PointerEvent) => void;
}

interface HomeAudioGraph {
  context: AudioContext;
}

const HOME_STREAM_LIMIT = 4;
// The room sound: a three-minute seamless loop built from the story ad's
// soundtrack (marketing/tools/render-site-ambience.swift). It is the only
// sound the site plays; the earlier recordings are kept in marketing/audio.
const HOME_AUDIO_SRC = "/audio/hidn-room-loop.m4a";
const HOME_AUDIO_SOURCE_VOLUME = 0.55;
const HOME_AUDIO_MASTER_GAIN = 0.6;
const HOME_AUDIO_PREFERENCE_KEY = "hidn:audio:enabled";
const ROOM_DOOR_SOUND_VOLUME = 0.16;
const HOME_HEADLINE_LINES = ["SAY WHAT YOU", "CAN'T SAY", "PUBLICLY."] as const;
const SHIELDEDSCAN_CACHE_DURATION_MS = 60_000;
const ZCASH_STATUS_CAROUSEL_INTERVAL_MS = 4_500;
const MODERATION_GATE_MIN_DURATION_MS = 800;
const ROOM_LIVE_ACTIVITY_REFRESH_MS = 10_000;
const ROOM_NOTIFICATION_REFRESH_MS = 5_000;
const ROOM_RECOVERY_REVEAL_DURATION_MS = 20_000;

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

  const wasmUrl = new URL("/anonymous-zk/v2/hidn_membership.wasm", window.location.origin).toString();
  const zkeyUrl = new URL("/anonymous-zk/v2/hidn_membership_final.zkey", window.location.origin).toString();

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
  fixedScope = "",
): Promise<{ scope: string; proof: AnonymousProofEnvelope }> {
  if (!roomAnonymousIdentity || !roomAnonymousWitness) {
    throw new Error("The anonymous room session is not available. Return with your recovery key first.");
  }

  // A session saved before the member tree grew holds a shorter proof path;
  // fetch a fresh one for the same key before proving.
  if (roomAnonymousWitness.pathElements.length !== ANONYMOUS_TREE_DEPTH) {
    await refreshAnonymousWitness();
  }

  // A fresh scope makes each action unlinkable; a fixed one (likes) makes a
  // repeat on the same target detectable without revealing the member.
  const scope = fixedScope || createAnonymousScope();
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

  return "local";
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

// Each post and reply gets its own notification key, kept only in this
// browser. The server stores just a hash per post, so nothing there groups a
// member's posts together; this list is how this browser reads its own
// notifications.
const ROOM_NOTIFICATION_KEYS_STORAGE = "hidn:notify-keys";
const MAX_NOTIFICATION_KEYS = 80;

function loadNotificationKeys(): string[] {
  try {
    const stored = window.localStorage.getItem(`${ROOM_NOTIFICATION_KEYS_STORAGE}:${deviceSignalHistoryScope()}`);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value)) : [];
  } catch {
    return [];
  }
}

function rememberNotificationKey(key: string): void {
  const keys = [key, ...loadNotificationKeys().filter((existing) => existing !== key)].slice(0, MAX_NOTIFICATION_KEYS);
  try {
    window.localStorage.setItem(`${ROOM_NOTIFICATION_KEYS_STORAGE}:${deviceSignalHistoryScope()}`, JSON.stringify(keys));
  } catch {
    // Without storage this browser simply will not see notifications for it.
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

  const post = findLoadedPost(id);
  if (!post) {
    return undefined;
  }

  return mockConfessionFromRoomPost(post);
}

/** A post from the current room or from the mixed feed. */
function findLoadedPost(id: string): RoomPost | undefined {
  return roomPosts.find((candidate) => candidate.id === id) ?? mixedFeedPosts.find((candidate) => candidate.id === id);
}

function roomTipPost(): RoomPost | undefined {
  return roomTipPostId ? findLoadedPost(roomTipPostId) : undefined;
}

function roomTipPaymentUri(post: RoomPost): string {
  return `zcash:${post.tipAddress}`;
}

// The tip screen types itself in once; copy feedback re-renders it settled.
let roomTipIntroPlayedFor = "";

function renderRoomTipDialog(): string {
  const post = roomTipPost();
  if (!post?.tipAddress) {
    roomTipIntroPlayedFor = "";
    return "";
  }

  const paymentUri = roomTipPaymentUri(post);
  const settled = roomTipIntroPlayedFor === post.id;
  roomTipIntroPlayedFor = post.id;
  return `<div class="room-tip-dialog room-tip-dialog--v2${settled ? " room-tip-dialog--settled" : ""}" role="dialog" aria-modal="true" aria-labelledby="room-tip-dialog-title">
    <button class="room-tip-dialog__backdrop" type="button" data-action="room-tip-close" aria-label="Close"></button>
    <section class="room-tip-dialog__panel">
      <header class="room-tip-dialog__head">
        <h2 id="room-tip-dialog-title">Tip this post</h2>
        <button class="room-tip-dialog__close" type="button" data-action="room-tip-close" aria-label="Close">×</button>
      </header>
      <p class="room-tip-dialog__lead">Send any amount of ZEC from a shielded wallet, straight to whoever wrote this. You pick the amount in your wallet.</p>
      <div class="room-tip-dialog__qr-frame">
        <canvas class="room-tip-dialog__qr" data-tip-qr data-tip-uri="${escapeHtml(paymentUri)}" width="220" height="220" aria-label="QR code to tip this post in Zcash"></canvas>
        <span>Scan with a Zcash wallet</span>
      </div>
      <div class="room-tip-dialog__actions">
        <a class="room-tip-dialog__btn room-tip-dialog__btn--primary" href="${escapeHtml(paymentUri)}">Open in wallet</a>
        <button class="room-tip-dialog__btn" type="button" data-action="room-tip-copy" data-tip-uri="${escapeHtml(paymentUri)}">${escapeHtml(roomTipCopyFeedback || "Copy payment request")}</button>
      </div>
      <p class="room-tip-dialog__hint">No wallet opened? Copy the request and paste it into your Zcash wallet.</p>
      <div class="room-tip-dialog__address-block">
        <span class="room-tip-dialog__label">Their shielded address</span>
        <button class="room-tip-dialog__address" type="button" data-action="room-tip-copy-address" data-tip-address="${escapeHtml(post.tipAddress)}" aria-label="Copy the shielded address">
          <code>${escapeHtml(post.tipAddress)}</code>
          <span>${escapeHtml(roomTipAddressCopyFeedback || "Tap to copy")}</span>
        </button>
      </div>
      <ul class="room-tip-dialog__facts">
        <li>Real ZEC on Zcash mainnet.</li>
        <li>HIDN never holds the money, can't confirm payments and doesn't issue receipts.</li>
        <li>The writer stays anonymous. HIDN never learns who they are.</li>
      </ul>
      <a class="room-tip-dialog__learn" href="/how-it-works#tips" target="_blank" rel="noopener">How tips work →</a>
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
      // Dark modules on phosphor green: on brand, and still scannable.
      dark: "#010301",
      light: "#e8f2e9",
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

  roomTipCopyFeedback = copied ? "Copied" : "Couldn't copy. Select it instead.";
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
  roomTipAddressCopyFeedback = copied ? "Copied" : "Couldn't copy. Select it instead.";
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
  return path === "/room" || path === "/room/rooms" || path === "/explore" || path.startsWith("/c/");
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

  return `<section class="hidn-report-dialog hidn-report-dialog--term" role="dialog" aria-modal="true" aria-labelledby="hidn-report-title">
    <button class="hidn-report-dialog__backdrop" type="button" data-action="report-close" aria-label="Close report dialog"></button>
    <form class="hidn-report-dialog__panel hidn-term hidn-term--report" novalidate>
      <div class="hidn-term__bar"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><span aria-hidden="true">hidn@room: ~/report</span>
        <button class="hidn-report__close-x" type="button" data-action="report-close" aria-label="Close report dialog">×</button>
      </div>
      <div class="hidn-term__body hidn-report">
        <p class="hidn-report__log">hidn@room:~$ ./report --private</p>
        <h2 id="hidn-report-title" class="hidn-report__title" data-text="REPORT THIS SIGNAL.">REPORT THIS SIGNAL.</h2>
        <blockquote class="hidn-report__target"><span>// ${escapeHtml(activeReportTarget.label)}</span>${escapeHtml(activeReportTarget.targetExcerpt || "NO CONTENT SNAPSHOT")}</blockquote>
        <fieldset class="hidn-report__reasons">
          <legend>&gt; SELECT A REASON</legend>
          ${REPORT_REASON_OPTIONS.map((option, index) => `<label class="hidn-report__reason">
            <input type="radio" name="hidn-report-reason" value="${option.value}"${option.value === roomReportReason ? " checked" : ""} />
            <span class="hidn-report__num" aria-hidden="true">[${index + 1}]</span>
            <span>${escapeHtml(option.label.toUpperCase())}</span>
          </label>`).join("")}
        </fieldset>
        <label class="hidn-report__details" for="hidn-report-details">
          <span>&gt; DETAILS / OPTIONAL</span>
          <textarea id="hidn-report-details" rows="3" maxlength="2000" placeholder="add context for the moderator_">${escapeHtml(roomReportDetails)}</textarea>
        </label>
        <p class="hidn-report__note">&gt; Your report carries a membership proof: it shows a member sent it, never which one. It is not shown publicly.</p>
        ${roomReportFeedback ? `<p class="hidn-report__feedback" role="status">!! ${escapeHtml(roomReportFeedback)}</p>` : ""}
        <div class="hidn-report__actions">
          <button class="hidn-report__btn" type="button" data-action="report-close">[ CANCEL ]</button>
          <button class="hidn-report__btn hidn-report__btn--send" type="button" data-action="report-submit"${roomReportSubmitting ? " disabled" : ""}>${roomReportSubmitting ? "[ PROVING &amp; SENDING… ]" : "[ SEND REPORT ]"}</button>
        </div>
      </div>
    </form>
  </section>`;
}

function renderTransmissionRow(
  transmission: TransmissionView,
  options: { href?: string; incoming?: boolean; roomLabel?: string } = {},
): string {
  const className = options.incoming ? " transmission-row--incoming motion-transmission-arrival" : "";
  const category = transmission.category
    ? `<span class="transmission-row__category">${escapeHtml(transmission.category)}</span>`
    : "";
  const threadId = transmission.id;
  const tipAction = threadId && transmission.tipAddress
    ? `<button class="room-message__action room-message__action--tip" type="button" data-action="room-tip" data-thread-id="${escapeHtml(threadId)}">Tip in ZEC</button>`
    : "";
  const shareTextAttributes = threadId
    ? `data-share-text data-share-id="${escapeHtml(threadId)}" data-share-kind="thread" data-share-label="${escapeHtml(transmission.reference ?? "ANONYMOUS THREAD")}" data-share-category="${escapeHtml(transmission.category ?? "IDENTITY")}" data-share-time="${escapeHtml(transmission.time)}"`
    : "";
  const replyCount = threadId ? replyCountForThread(threadId, transmission.replies) : 0;
  const action = options.href && threadId
    ? `<div class="transmission-row__actions">
        <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(threadId)}" aria-pressed="${roomLikedIds.has(threadId)}"${hasRoomSession() ? "" : " disabled"}>♡ ${reactionCountForThread(threadId, transmission.reactions)}</button>
        <a class="room-message__action" href="${escapeHtml(options.href)}">${replyCount ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "Reply"}</a>
        <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(threadId)}">Share</button>
        <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(threadId)}">Save</button>
        ${tipAction}
        <span class="thread-share-status" data-share-status="${escapeHtml(threadId)}" role="status" aria-live="polite"></span>
      </div>`
    : options.href
      ? `<a class="transmission-row__view" href="${escapeHtml(options.href)}">OPEN <span aria-hidden="true">→</span></a>`
      : "";

  // Tapping the post itself opens it (replies and the full actions live there).
  const openAttribute = options.href && threadId ? ` data-open-href="${escapeHtml(options.href)}"` : "";
  const openClass = threadId && threadId === deskOpenThreadId ? " transmission-row--open" : "";
  return `<article class="transmission-row${className}${openClass}"${openAttribute}>
    <div class="transmission-row__meta">
      <span class="transmission-row__room"${options.roomLabel === roomChannelOption("haunted").label ? ` data-room="haunted"` : ""}>${options.roomLabel ? escapeHtml(roomDisplayName(options.roomLabel)) : "Anonymous"}</span>
      <time datetime="${escapeHtml(transmission.time)}">${escapeHtml(threadId ? timeAgo(transmission.time) || formatTransmissionTime(transmission.time) : formatTransmissionTime(transmission.time))}</time>
      <span class="transmission-row__signed" role="img" aria-label="Signed: name withheld"></span>
    </div>
    <p class="transmission-row__thought" ${shareTextAttributes}>${escapeHtml(transmission.text)}</p>
    <footer class="transmission-row__footer">
      ${threadId ? "" : category}
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
      if (statusLabel.textContent !== label) {
        statusLabel.textContent = label;
        // Restart the slide-in for the new figure.
        statusLabel.classList.remove("zcash-status-slide");
        void statusLabel.offsetWidth;
        statusLabel.classList.add("zcash-status-slide");
      }
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

function createHomeAudioGraph(audio: HTMLAudioElement): HomeAudioGraph | undefined {
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return undefined;
  }

  try {
    // The room loop carries its own space and texture, so it plays as it is:
    // no generated layers and no extra effects on top.
    const context = new AudioContextConstructor();
    const outputGain = context.createGain();
    outputGain.gain.value = HOME_AUDIO_MASTER_GAIN;
    context.createMediaElementSource(audio).connect(outputGain);
    outputGain.connect(context.destination);
    return { context };
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
    <svg class="home-room-audio-toggle__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"></path><path class="home-room-audio-toggle__waves" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"></path><path class="home-room-audio-toggle__mute" d="M16 9l5 6M21 9l-5 6"></path></svg>
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

  // Leaving the tab or the app pauses the signal, so the phone doesn't keep
  // showing HIDN as "now playing"; coming back resumes it if it was on.
  let pausedByHiding = false;
  const resumeAudio = (): void => {
    if (document.visibilityState !== "visible") {
      if (!audio.paused) {
        pausedByHiding = true;
        audio.pause();
        void graph.context.suspend().catch(() => undefined);
      }
      return;
    }
    if (!pausedByHiding || (graph.context.state === "running" && !audio.paused)) {
      return;
    }
    pausedByHiding = false;
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

function playMuseumDoorSound(): void {
  // Respect an explicit ambient-sound opt-out while keeping the door sound
  // eligible for a user-triggered interaction.
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
    const creak = context.createOscillator();
    const creakGain = context.createGain();
    const hinge = context.createOscillator();
    const hingeGain = context.createGain();
    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    const roomNoise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const now = context.currentTime;
    const noiseBuffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * 1.15)), context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index++) {
      noiseData[index] = (Math.random() * 2 - 1) * (1 - index / noiseData.length);
    }

    output.gain.value = ROOM_DOOR_SOUND_VOLUME;
    filter.type = "lowpass";
    filter.frequency.value = 1450;
    filter.Q.value = 0.8;
    creak.type = "sawtooth";
    creak.frequency.setValueAtTime(110, now);
    creak.frequency.exponentialRampToValueAtTime(250, now + 0.92);
    creak.detune.setValueAtTime(-7, now);
    creakGain.gain.setValueAtTime(0.0001, now);
    creakGain.gain.linearRampToValueAtTime(0.18, now + 0.16);
    creakGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.02);
    hinge.type = "triangle";
    hinge.frequency.setValueAtTime(245, now);
    hinge.frequency.exponentialRampToValueAtTime(118, now + 0.78);
    hinge.detune.setValueAtTime(5, now);
    hingeGain.gain.setValueAtTime(0.0001, now);
    hingeGain.gain.linearRampToValueAtTime(0.13, now + 0.1);
    hingeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);
    thump.type = "sine";
    thump.frequency.setValueAtTime(78, now + 0.04);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.26);
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.22, now + 0.055);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    roomNoise.buffer = noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 720;
    noiseFilter.Q.value = 0.7;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.07, now + 0.18);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.06);

    creak.connect(creakGain);
    creakGain.connect(filter);
    hinge.connect(hingeGain);
    hingeGain.connect(filter);
    thump.connect(thumpGain);
    thumpGain.connect(filter);
    roomNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(filter);
    filter.connect(output);
    output.connect(context.destination);
    creak.start(now);
    hinge.start(now);
    thump.start(now + 0.04);
    roomNoise.start(now);
    creak.stop(now + 1.08);
    hinge.stop(now + 0.86);
    thump.stop(now + 0.32);
    roomNoise.stop(now + 1.12);
    void context.resume().catch(() => undefined);
    window.setTimeout(() => {
      void context.close();
    }, 1400);
  } catch {
    // The room entry should never be blocked by an unavailable audio API.
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




interface ThreadImageReply {
  index: number;
  reply: AnonymousReply;
}

async function createThreadImage(
  confession: MockConfession,
  focusReply?: ThreadImageReply,
  cardType: ShareCardType = "THREAD",
  suppliedReplies?: AnonymousReply[],
  size: ShareCardSize = "post",
): Promise<Blob> {
  const replies = focusReply
    ? [focusReply.reply.text]
    : cardType === "BATCH" ? (suppliedReplies ?? []).map((reply) => reply.text) : [];
  const channel = roomChannelOptions.find((room) => room.key === confession.channel);
  return renderShareCard({
    text: confession.text,
    replies,
    room: channel ? roomDisplayName(channel.label) : "The room",
    reference: confession.id,
    mark: String(confession.reference || `// ${confession.id.replace(/^THR-/, "").slice(0, 8)}`).toUpperCase(),
    theme: activeHidnTheme() === "signal" ? "signal" : "quiet",
    size,
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
  const filename = `hidn-thread-${confession.id}.png`;

  if (mode === "x") {
    setThreadShareStatus(root, shareKey, "Making the image…");
    try {
      const cardConfession = focusReply
        ? { ...confession, reference: `// REPLY ${String(focusReply.index + 1).padStart(2, "0")}`, text: focusReply.reply.text, time: focusReply.reply.time }
        : confession;
      const blob = await createThreadImage(cardConfession, undefined, focusReply ? "REPLY" : "TEXT", undefined, "wide");
      downloadThreadImage(blob, confession, filename);
      const xText = `“${focusReply?.reply.text ?? confession.text}” — HIDN / THE ROOM`;
      const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`;
      const composer = window.open(xUrl, "_blank", "noopener,noreferrer");
      setThreadShareStatus(root, shareKey, composer ? "Image saved. Attach it to your post on X." : "Image saved. Open X to attach it.");
    } catch {
      setThreadShareStatus(root, shareKey, "The image couldn't be made.");
    }
    return;
  }

  // The sheet lists the thread's visible replies; a reply's own button opens it with that reply ticked.
  const visible = repliesForThread(id)
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !isModerationHidden("reply", `${id}:reply:${index}`));
  const preselect = focusReply ? [visible.findIndex(({ index }) => index === focusReply.index)].filter((index) => index >= 0) : [];

  openShareSheet({
    mode,
    replies: visible.map(({ item }) => item.text),
    preselect,
    render: (size, texts) => createThreadImage(confession, undefined, "BATCH", texts.map((text) => ({ text, time: "" })), size),
    confirm: async (blob, size, action) => {
      const file = new File([blob], size === "post" ? filename : filename.replace(/\.png$/, `-${size}.png`), { type: "image/png" });
      if (action === "share" && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "HIDN", text: "Said in the room with no name. hidn." });
          setThreadShareStatus(root, shareKey, "Shared.");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setThreadShareStatus(root, shareKey, "");
            return;
          }
        }
      }
      downloadThreadImage(blob, confession, file.name);
      setThreadShareStatus(root, shareKey, action === "share" ? "This browser can't share images, so it was saved instead." : "Image saved.");
    },
  });
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
    // Wherever the header says BUILT ON ZCASH, it shows live ShieldedScan
    // figures too (the museum has its own header and stays as it is).
    liveZcashStatus: normalizedPath !== "/",
    links,
  });
}

function renderRoomMenu(): string {
  const profileName = roomAnonymousIdentity?.alias || "ANONYMOUS";
  return `<div class="room-menu" data-room-menu>
    <button class="room-menu__toggle" type="button" data-action="room-menu-toggle" aria-expanded="false" aria-controls="room-channel-menu" aria-label="Open menu">
      <span class="room-menu__icon" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="room-menu__label">Menu</span>
    </button>
    <div class="room-menu__panel room-menu__panel--term" id="room-channel-menu" hidden>
      <p class="room-menu__cmd" aria-hidden="true">hidn://whoami</p>
      <p class="room-menu__whoami"><b>${escapeHtml(profileName)}</b><span>Today's name. It changes every visit.</span></p>
      <nav aria-label="More">
        <a href="/room/main"><span>Lobby <small>walk the 3D museum</small></span> <b aria-hidden="true">→</b></a>
        <a href="/how-it-works"><span>How it works</span> <b aria-hidden="true">→</b></a>
        <a href="/"><span>Home</span> <b aria-hidden="true">→</b></a>
      </nav>
      <a class="room-menu__leave" href="/" data-room-logout>Leave room</a>
    </div>
  </div>`;
}

function publicWindowTitle(path: string): string {
  const normalizedPath = normalizePath(path);
  if (normalizedPath.startsWith("/c/")) {
    return "THREAD_ROOM";
  }

  if (normalizedPath === "/room" || normalizedPath === "/room/rooms" || normalizedPath === "/explore") {
    return "THE_ROOM";
  }

  const roomChannel = roomChannelSurfaceFromPath(normalizedPath);
  if (roomChannel) {
    return `ROOM_${roomChannel.toUpperCase()}`;
  }

  if (normalizedPath === "/") {
    return "PRIVATE_ROOM";
  }

  return normalizedPath.slice(1).replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

function publicWindowChrome(path: string, showRoomMenu = false, showZcashStatus = false, showNotifications = false): string {
  const normalizedPath = normalizePath(path);

  if (activeHidnTheme() === "signal") {
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
          ${showNotifications ? renderRoomNotifications() : ""}
        </div>
        ${showRoomMenu ? renderRoomMenu() : ""}
      </div>
    </div>`;
  }

  return `<div class="public-page__signal-bar">
      <span class="public-page__signal-brand">${HidnPromptLogo({ className: "public-page__signal-logo", label: "HIDN home" })}</span>
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

function isPublicReadPage(path: string): boolean {
  return path === "/read" || path.startsWith("/read/");
}

function publicFrame(path: string, main: string, pageClass = ""): string {
  const normalizedPath = normalizePath(path);
  const isHome = normalizedPath === "/";
  const isRoomCreation = normalizedPath === "/room/access";
  const isHowItWorks = normalizedPath === "/how-it-works";
  const isAdminPage = normalizedPath === "/admin" || normalizedPath.startsWith("/admin/");
  const isRoomSurface = normalizedPath === "/room/feed" || normalizedPath === "/room/inbox" || normalizedPath === "/room" || normalizedPath === "/room/main" || normalizedPath === "/room/library" || normalizedPath === "/room/rooms" || normalizedPath === "/explore" || normalizedPath === "/room/orb" || normalizedPath === "/room/profile" || normalizedPath === "/room/hall" || Boolean(roomChannelSurfaceFromPath(normalizedPath)) || normalizedPath.startsWith("/c/");
  // Reading pages stay fully lit; the flashlight would hide the posts.
  const isPublicRead = normalizedPath === "/read" || normalizedPath.startsWith("/read/") || normalizedPath.startsWith("/to/") || normalizedPath.startsWith("/r/") || normalizedPath === "/mask";
  const isPointerSurface = !isHome && !isRoomCreation && !isRoomSurface && !isAdminPage && !isPublicRead;
  const themeClass = activeHidnTheme() === "signal" ? " public-page--theme-signal" : "";
  const footerLinks = isAdminPage
    ? []
    : isHome || isRoomCreation
    ? [{ label: "HOW IT WORKS", href: "/how-it-works" }]
    : isHowItWorks
      ? [{ label: "BACK TO HOME", href: "/" }]
    : isRoomSurface
      ? [
          { label: "HOW IT WORKS", href: "/how-it-works" },
          { label: "LEAVE ROOM", href: "/" },
        ]
    : [{ label: "HOW IT WORKS", href: "/how-it-works" }];

  // room-v2: the 2026-10 redesign (room-v2.css). Remove to restore the old look.
  const redesignClass = isRoomSurface || isPublicReadPage(normalizedPath) || normalizedPath === "/how-it-works" || normalizedPath.startsWith("/to/") || normalizedPath === "/" || normalizedPath === "/room/access" ? " room-v2" : "";
  return `<div class="public-page${isRoomCreation ? " public-page--room-access" : ""}${themeClass}${redesignClass} ${pageClass} fx-grain fx-vignette${isPointerSurface ? " hidn-pointer-surface" : ""}"${isPointerSurface ? " data-pointer-surface" : ""}>
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${isPointerSurface ? renderPointerSpotlight() : ""}
    ${isHome || isRoomCreation ? "" : publicWindowChrome(path, isRoomSurface && normalizedPath !== "/room/profile", false, isRoomSurface)}
    ${isRoomSurface || isAdminPage || isRoomCreation || isHome ? "" : publicNavigation(path)}
    ${showsRoomTabs(normalizedPath) ? renderRoomTabs(normalizedPath) : ""}
    ${main}
    ${isRoomSurface ? renderRoomTipDialog() : ""}
    ${isRoomSurface ? renderSelectionTools() : ""}
    ${isRoomSurface || isAdminPage || pageClass.includes("public-page--home-museum") ? "" : FooterShell({
      links: footerLinks,
      identity: isRoomCreation || isHowItWorks ? "" : "SHIELD YOUR THOUGHTS.",
    })}
  </div>`;
}

function visibleRoomChannelOptions(): Array<(typeof roomChannelOptions)[number]> {
  return roomChannelOptions;
}

function roomChannelOption(key: RoomChannel): (typeof roomChannelOptions)[number] {
  return roomChannelOptions.find((candidate) => candidate.key === key) ?? roomChannelOptions[0];
}

function roomPostRandomKey(id: string): number {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

// MARK: The mixed feed, /room/feed: recent posts from every room, shuffled.

type MixedFeedTab = "mixed" | "latest" | "felt";
const MIXED_FEED_PATH = "/room/feed";
const FEED_PAGE_SIZE = 20;
const FEED_FETCH_SIZE = 50;
const MIXED_FEED_REFRESH_MS = 60_000;
let mixedFeedPosts: RoomPost[] = [];
let mixedFeedShuffled: RoomPost[] = [];
let mixedFeedLoadedAt = 0;
let mixedFeedRequest: Promise<void> | undefined;
let mixedFeedError = "";
let activeMixedTab: MixedFeedTab = "mixed";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Per room: the oldest post loaded so far, and whether there is more. */
const mixedFeedCursors = new Map<RoomChannel, { oldest: string; done: boolean }>();
let mixedFeedVisible = FEED_PAGE_SIZE;
let mixedFeedLoadingMore = false;

function rememberFeedPosts(posts: RoomPost[]): void {
  for (const post of posts) {
    if (!roomLikeCounts.has(post.id)) roomLikeCounts.set(post.id, post.reactions);
    if (post.liked) roomLikedIds.add(post.id);
  }
}

function updateMixedCursor(channel: RoomChannel, posts: RoomPost[]): void {
  const previous = mixedFeedCursors.get(channel);
  const oldest = posts.length ? posts[posts.length - 1].time : previous?.oldest ?? "";
  mixedFeedCursors.set(channel, { oldest, done: posts.length < FEED_FETCH_SIZE });
}

/** First load, and a quiet refresh every minute that only adds new posts on
 * top, so older pages already loaded stay where the reader left them. */
async function refreshMixedFeed(force = false): Promise<void> {
  if (!hasRoomSession() || mixedFeedRequest) return mixedFeedRequest;
  if (!force && mixedFeedLoadedAt && Date.now() - mixedFeedLoadedAt < MIXED_FEED_REFRESH_MS) return;
  const firstLoad = !mixedFeedLoadedAt;
  mixedFeedRequest = Promise.allSettled(ROOM_CHANNEL_KEYS.map((channel) => fetchAnonymousPosts(channel, { limit: FEED_FETCH_SIZE })))
    .then((results) => {
      if (results.every((result) => result.status === "rejected")) {
        mixedFeedError = "The rooms could not be reached. Try again in a moment.";
        return;
      }
      const fetched: RoomPost[] = [];
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        fetched.push(...result.value.posts);
        if (firstLoad || !mixedFeedCursors.has(ROOM_CHANNEL_KEYS[index])) updateMixedCursor(ROOM_CHANNEL_KEYS[index], result.value.posts);
      });
      const byId = new Map(fetched.map((post) => [post.id, post]));
      const known = new Set(mixedFeedPosts.map((post) => post.id));
      const fresh = fetched.filter((post) => !known.has(post.id)).sort((left, right) => right.time.localeCompare(left.time));
      const refreshed = (post: RoomPost): RoomPost => byId.get(post.id) ?? post;
      mixedFeedPosts = [...fresh, ...mixedFeedPosts.map(refreshed)];
      mixedFeedShuffled = firstLoad ? shuffled(fresh) : [...fresh, ...mixedFeedShuffled.map(refreshed)];
      rememberFeedPosts(fetched);
      mixedFeedError = "";
      mixedFeedLoadedAt = Date.now();
      if (normalizePath(window.location.pathname) === MIXED_FEED_PATH) rerenderProductRoute();
    })
    .finally(() => {
      mixedFeedRequest = undefined;
    });
  return mixedFeedRequest;
}

function mixedFeedHasMore(): boolean {
  return mixedFeedVisible < mixedFeedPosts.length || [...mixedFeedCursors.values()].some((cursor) => !cursor.done);
}

/** Show the next 20; fetch older posts from every room that has more when
 * the loaded ones run out. Older posts join the end of the list. */
async function loadMoreMixedFeed(): Promise<void> {
  if (mixedFeedLoadingMore) return;
  mixedFeedVisible += FEED_PAGE_SIZE;
  if (mixedFeedVisible > mixedFeedPosts.length) {
    const pending = ROOM_CHANNEL_KEYS.filter((channel) => {
      const cursor = mixedFeedCursors.get(channel);
      return cursor && !cursor.done && cursor.oldest;
    });
    if (pending.length) {
      mixedFeedLoadingMore = true;
      rerenderProductRoute();
      const results = await Promise.allSettled(pending.map((channel) => fetchAnonymousPosts(channel, { before: mixedFeedCursors.get(channel)!.oldest, limit: FEED_FETCH_SIZE })));
      const older: RoomPost[] = [];
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        older.push(...result.value.posts);
        updateMixedCursor(pending[index], result.value.posts);
      });
      const known = new Set(mixedFeedPosts.map((post) => post.id));
      const added = older.filter((post) => !known.has(post.id)).sort((left, right) => right.time.localeCompare(left.time));
      mixedFeedPosts = [...mixedFeedPosts, ...added];
      mixedFeedShuffled = [...mixedFeedShuffled, ...shuffled(added)];
      rememberFeedPosts(added);
      mixedFeedLoadingMore = false;
    }
  }
  rerenderProductRoute();
}

function renderLoadMore(action: string, hasMore: boolean, loading: boolean): string {
  if (!hasMore) {
    return `<p class="hidn-feed-end">&gt; that's everything. you've reached the start of the room.</p>`;
  }
  return `<div class="hidn-feed-more"><button class="room-message__action hidn-feed-more__btn" type="button" data-feed-more="${action}"${loading ? " disabled" : ""}>${loading ? "[ LOADING… ]" : "[ LOAD MORE ]"}</button></div>`;
}

function mixedFeedRows(): string {
  if (!mixedFeedLoadedAt) {
    return mixedFeedError
      ? EmptyState("SIGNAL LOST", mixedFeedError)
      : LoadingState("LISTENING TO EVERY ROOM", "Gathering recent posts from all rooms.");
  }
  const visible = (activeMixedTab === "mixed"
    ? mixedFeedShuffled
    : activeMixedTab === "latest"
      ? mixedFeedPosts
      : [...mixedFeedPosts].sort((left, right) => reactionCountForThread(right.id, right.reactions) - reactionCountForThread(left.id, left.reactions) || right.time.localeCompare(left.time))
  ).filter((post) => !isModerationHidden("thread", post.id));
  if (!visible.length) {
    return EmptyState("QUIET FOR NOW", "Nobody has posted yet. Be the first voice in the room.");
  }
  return visible
    .slice(0, mixedFeedVisible)
    .map((post) => renderTransmissionRow(transmissionViewFromRoomPost(post), {
      href: `/c/${encodeURIComponent(post.id)}`,
      roomLabel: roomChannelOption(post.channel as RoomChannel).label,
    }))
    .join("") + renderLoadMore("mixed", mixedFeedHasMore(), mixedFeedLoadingMore);
}

function renderMixedFeed(): RenderedProductRoute {
  const tabs: Array<{ key: MixedFeedTab; label: string }> = [
    { key: "mixed", label: "Mixed" },
    { key: "latest", label: "Latest" },
    { key: "felt", label: "Felt" },
  ];
  return {
    metadata: { ...EXPLORE_METADATA, title: "Every room · HIDN", canonicalPath: MIXED_FEED_PATH },
    html: !hasRoomSession()
      ? publicFrame(MIXED_FEED_PATH, renderConnectionLost(), "public-page--explore")
      : isRoomDesktopViewport()
      ? publicFrame(
        MIXED_FEED_PATH,
        renderDeskRoom(
          "feed",
          `<p class="hidn-desk__label">hidn://feed</p>
            <h1 class="type-display-lg hidn-desk__title">Every room</h1>
            <p>Newest confessions from every room. Tap one to open it.</p>
            ${renderKeyReminder(roomAccountRecoveryCode)}`,
          `<section class="explore-feed" aria-label="Posts from every room">
            <div class="explore-tabs" role="tablist" aria-label="Feed order">
              ${tabs.map((tab) => `<button class="explore-tabs__tab" type="button" role="tab" data-mixed-tab="${tab.key}" aria-selected="${activeMixedTab === tab.key}">${tab.label}</button>`).join("")}
            </div>
            <div class="explore-feed__list" aria-live="polite">${mixedFeedRows()}</div>
          </section>`,
        ),
        "public-page--explore public-page--mixed-feed public-page--desk",
      )
      : publicFrame(
        MIXED_FEED_PATH,
        `<main id="main-content" class="public-main explore-main">
          <div class="hidn-container--wide explore-page">
            <header class="explore-header">
              ${TerminalLabel("hidn://feed")}
              <h1 class="type-display-lg hidn-desk__title">Every room</h1>
              <p>The newest from every room. No names.</p>
              ${roomStandings ? renderStandingsTicker(roomStandings, (channel) => roomDisplayName(roomChannelOption(channel as RoomChannel).label)) : ""}
              <p class="hidn-feed-log" aria-hidden="true">&gt; tail -f /rooms/* · listening<span class="hidn-feed-log__caret">▌</span></p>
              ${renderKeyReminder(roomAccountRecoveryCode)}
              ${isRoomMobileViewport() ? renderMobilePostSurface() : ""}
            </header>
            <div class="explore-layout">
              <section class="explore-feed" aria-label="Posts from every room">
                <div class="explore-tabs" role="tablist" aria-label="Feed order">
                  ${tabs.map((tab) => `<button class="explore-tabs__tab" type="button" role="tab" data-mixed-tab="${tab.key}" aria-selected="${activeMixedTab === tab.key}">${tab.label}</button>`).join("")}
                </div>
                <div class="explore-feed__list" aria-live="polite">${mixedFeedRows()}</div>
              </section>
              ${renderRoomDirectory()}
            </div>
          </div>
        </main>`,
        "public-page--explore public-page--mixed-feed",
      ),
  };
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

let roomFeedVisible = FEED_PAGE_SIZE;
let roomFeedVisibleChannel = "";
let roomFeedLoadingMore = false;
/** Rooms whose oldest post has been reached. */
const roomFeedExhausted = new Set<string>();

function renderTransmissionRows(tab: FeedTab): string {
  if (roomPostsLoadedChannel !== activeRoomChannel) {
    return LoadingState("LISTENING TO LIVE ROOM", "Connecting to the current room feed.");
  }
  if (roomFeedVisibleChannel !== activeRoomChannel) {
    roomFeedVisibleChannel = activeRoomChannel;
    roomFeedVisible = FEED_PAGE_SIZE;
  }

  const posts = liveRoomPostsForTab(tab);
  if (!posts.length) {
    return EmptyState("NO POSTS YET", "Nobody has posted in this room yet. Be the first.");
  }

  const hasMore = roomFeedVisible < posts.length || !roomFeedExhausted.has(activeRoomChannel);
  return posts
    .slice(0, roomFeedVisible)
    .map(transmissionViewFromRoomPost)
    .map((transmission) => renderTransmissionRow(
      transmission,
      { href: transmission.id ? `/c/${encodeURIComponent(transmission.id)}` : undefined },
    ))
    .join("") + renderLoadMore("room", hasMore, roomFeedLoadingMore);
}

async function loadMoreRoomFeed(): Promise<void> {
  if (roomFeedLoadingMore) return;
  const channel = activeRoomChannel;
  roomFeedVisible += FEED_PAGE_SIZE;
  const loaded = roomPosts.filter((post) => post.channel === channel);
  if (roomFeedVisible > loaded.length && !roomFeedExhausted.has(channel) && loaded.length) {
    roomFeedLoadingMore = true;
    rerenderProductRoute();
    try {
      const oldest = loaded.reduce((min, post) => (post.time < min ? post.time : min), loaded[0].time);
      const { posts } = await fetchAnonymousPosts(channel, { before: oldest, limit: FEED_FETCH_SIZE });
      const known = new Set(roomPosts.map((post) => post.id));
      roomPosts = [...roomPosts, ...posts.filter((post) => !known.has(post.id))];
      rememberFeedPosts(posts);
      if (posts.length < FEED_FETCH_SIZE) roomFeedExhausted.add(channel);
    } catch {
      roomFeedVisible -= FEED_PAGE_SIZE;
    } finally {
      roomFeedLoadingMore = false;
    }
  } else if (roomFeedVisible >= loaded.length && loaded.length < 100) {
    // The first load already held the whole room.
    roomFeedExhausted.add(channel);
  }
  rerenderProductRoute();
}

function renderExploreTabs(): string {
  const tabs: Array<{ key: FeedTab; label: string }> = [
    { key: "latest", label: "Latest" },
    { key: "random", label: "Random" },
    { key: "felt", label: "Felt" },
  ];

  return `<div class="explore-tabs" role="tablist" aria-label="Confession order">
    ${tabs
      .map(
        (tab) => `<button class="explore-tabs__tab" type="button" role="tab" data-feed-tab="${tab.key}" aria-selected="${activeFeedTab === tab.key}">${tab.label}</button>`,
      )
      .join("")}
  </div>`;
}

function roomHallTransmissions(): TransmissionView[] {
  const liveTransmissions = roomPostsLoadedChannel === activeRoomChannel
    ? liveRoomPostsForTab("latest").map(transmissionViewFromRoomPost)
    : [];

  return (liveTransmissions.length
    ? liveTransmissions
    : MOCK_CONFESSIONS.slice(0, 12).map(transmissionViewFromConfession))
    .slice(0, 12);
}

function renderRoomHallPanel(transmission: TransmissionView, index: number): string {
  const threadId = transmission.id;
  const threadHref = threadId ? `/c/${encodeURIComponent(threadId)}` : "";
  const tipAction = threadId && transmission.tipAddress
    ? `<button class="room-hall__action room-hall__action--tip" type="button" data-action="room-tip" data-thread-id="${escapeHtml(threadId)}">TIP WITH ZEC</button>`
    : "";
  const shareTextAttributes = threadId
    ? `data-share-text data-share-id="${escapeHtml(threadId)}" data-share-kind="thread" data-share-label="${escapeHtml(transmission.reference ?? "ANONYMOUS WALL")}" data-share-category="${escapeHtml(transmission.category ?? "IDENTITY")}" data-share-time="${escapeHtml(transmission.time)}"`
    : "";

  return `<article class="room-hall__panel" data-room-hall-panel data-room-hall-active="${index === 0}" tabindex="-1">
    <div class="room-hall__panel-topline">
      <span>WALL ${String(index + 1).padStart(2, "0")}</span>
      <time>${escapeHtml(formatTransmissionTime(transmission.time))}</time>
    </div>
    <span class="room-hall__panel-category">// ${escapeHtml(transmission.category ?? "IDENTITY")}</span>
    <p class="room-hall__panel-text" ${shareTextAttributes}>“${escapeHtml(transmission.text)}”</p>
    <footer class="room-hall__panel-footer">
      <span>${escapeHtml(transmission.reference ?? "ANONYMOUS WALL")}</span>
      <div class="room-hall__panel-actions">
        ${threadHref ? `<a class="room-hall__action" href="${escapeHtml(threadHref)}">OPEN THREAD →</a>` : ""}
        ${tipAction}
      </div>
    </footer>
  </article>`;
}

function renderRoomHall(): string {
  const signalMode = activeHidnTheme() === "signal";
  const panels = roomHallTransmissions();
  const safeIndex = panels.length ? Math.min(roomHallIndex, panels.length - 1) : 0;
  roomHallIndex = safeIndex;

  return publicFrame(
    "/room/hall",
    `<main id="main-content" class="public-main room-hall-main">
      <div class="room-hall" data-room-hall tabindex="0" aria-label="Explore the anonymous confession hall">
        <header class="room-hall__header">
          <div>
            <a class="room-hall__back" href="/room">← EXIT HALL</a>
            ${TerminalLabel(signalMode ? "ADVENTURE MODE / PRIVATE ROOM" : "ADVENTURE MODE / ANONYMOUS WALLS")}
            <h1>THE HALL<br /><em>OF UNSAID THOUGHTS.</em></h1>
            <p>Move slowly through anonymous thoughts. Nothing here reveals the person behind the wall.</p>
          </div>
          <div class="room-hall__header-status">${renderRoomZcashStatus()}</div>
        </header>
        <section class="room-hall__gallery" aria-label="Anonymous confession gallery">
          <div class="room-hall__gallery-light" aria-hidden="true"></div>
          <div class="room-hall__viewport" data-room-hall-viewport>
            <div class="room-hall__track" data-room-hall-track style="--room-hall-index: ${safeIndex};">
              ${panels.length ? panels.map(renderRoomHallPanel).join("") : EmptyState("THE HALL IS QUIET", "There are no walls to explore in this room yet.")}
            </div>
          </div>
        </section>
        <footer class="room-hall__controls">
          <button class="room-hall__move" type="button" data-room-hall-step="-1" aria-label="Move to the previous wall">←</button>
          <span class="room-hall__position" data-room-hall-status role="status" aria-live="polite">WALL ${String(safeIndex + 1).padStart(2, "0")} / ${String(Math.max(panels.length, 1)).padStart(2, "0")}</span>
          <button class="room-hall__move" type="button" data-room-hall-step="1" aria-label="Move to the next wall">→</button>
        </footer>
        <div class="room-hall__view-tools" aria-label="Museum view controls">
          <span>VIEW</span>
          <button type="button" data-room-hall-zoom="-1" aria-label="Zoom out">−</button>
          <span data-room-hall-zoom-status>${Math.round(roomHallZoom * 100)}%</span>
          <button type="button" data-room-hall-zoom="1" aria-label="Zoom in">+</button>
          <button type="button" data-room-hall-reset>RESET VIEW</button>
        </div>
        <p class="room-hall__hint">DRAG TO LOOK <span aria-hidden="true">·</span> WHEEL / ARROWS TO MOVE <span aria-hidden="true">·</span> TAP A WALL TO OPEN</p>
      </div>
    </main>`,
    "public-page--explore public-page--room-hall",
  );
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
  roomPostsRequest = fetchAnonymousPosts(requestedChannel)
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
      if (response.posts.length < 100) roomFeedExhausted.add(requestedChannel);
      roomMuseumPostsByChannel.set(requestedChannel, response.posts);
      roomPostError = "";
      const normalizedPath = normalizePath(window.location.pathname);
      if (normalizedPath === "/room" || normalizedPath === "/room/rooms" || normalizedPath === "/room/hall" || Boolean(roomChannelSurfaceFromPath(normalizedPath))) {
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

async function refreshMuseumGalleries(force = false): Promise<void> {
  if (!hasRoomSession() || (!force && roomMuseumLoaded)) return;
  if (roomMuseumRequest) return roomMuseumRequest;

  roomMuseumRequest = Promise.allSettled(
    roomChannelOptions.map(async (room) => ({ key: room.key, response: await fetchAnonymousPosts(room.key) })),
  )
    .then((results) => {
      const next = new Map<RoomChannel, RoomPost[]>();
      results.forEach((result) => {
        if (result.status === "fulfilled") next.set(result.value.key, result.value.response.posts);
      });
      roomMuseumPostsByChannel = next;
      roomMuseumLoaded = true;
      const path = normalizePath(window.location.pathname);
      if (path === "/room" || path === "/room/main") rerenderProductRoute();
    })
    .finally(() => {
      roomMuseumRequest = undefined;
    });

  return roomMuseumRequest;
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

  const sessionMarker = roomAnonymousIdentity?.commitment;
  const request = fetchAnonymousThread(threadId)
    .then((response) => {
      if (!hasRoomSession() || roomAnonymousIdentity?.commitment !== sessionMarker) {
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
      if (roomThreadIdFromPath(normalizePath(window.location.pathname)) === response.post.id || deskOpenThreadId === response.post.id) {
        rerenderProductRoute();
      }
    })
    .catch((error) => {
      roomThreadDetailErrors.set(
        threadId,
        error instanceof Error ? error.message : "The private thread could not be opened.",
      );
      if (roomThreadIdFromPath(normalizePath(window.location.pathname)) === threadId || deskOpenThreadId === threadId) {
        rerenderProductRoute();
      }
    })
    .finally(() => {
      roomThreadDetailRequests.delete(threadId);
    });

  roomThreadDetailRequests.set(threadId, request);
  return request;
}

function isClientMainnetTipAddress(value: string): boolean {
  const address = value.trim().toLowerCase();
  return address.length >= 20
    && address.length <= 500
    && /^(?:u1|zs1)[0-9a-z]+$/.test(address);
}

async function refreshRoomTipAddress(): Promise<void> {
  if (!hasRoomSession() || roomTipAddressRequest || roomTipAddressLoaded) {
    return;
  }

  // Tip destinations for nameless members live only in this browser.
  const storedTipAddress = sessionStorage.getItem(ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE) ?? "";
  roomTipAddress = isClientMainnetTipAddress(storedTipAddress) ? storedTipAddress : "";
  roomTipAddressDraft = roomTipAddress;
  if (!roomPostTipAddressEdited) {
    roomPostTipAddressDraft = roomTipAddress;
  }
  roomTipAddressLoaded = true;
  roomTipAddressError = "";
  if (normalizePath(window.location.pathname) === "/room/profile" || isRoomPostSurface()) {
    rerenderProductRoute();
  }
}

async function saveRoomTipAddressFromRoot(root: ParentNode): Promise<void> {
  if (roomTipAddressSaving) {
    return;
  }

  const input = root.querySelector<HTMLInputElement>("#room-tip-address");
  const draft = input?.value.trim().toLowerCase() ?? roomTipAddressDraft.trim().toLowerCase();
  if (draft && !isClientMainnetTipAddress(draft)) {
    roomTipAddressError = "USE A SHIELDED MAINNET ADDRESS / U1 OR ZS1";
    roomTipAddressFeedback = "";
    rerenderProductRoute();
    return;
  }

  roomTipAddressDraft = draft;
  roomTipAddressSaving = true;
  roomTipAddressError = "";
  roomTipAddressFeedback = "";
  rerenderProductRoute();

  try {
    if (draft) {
      sessionStorage.setItem(ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE, draft);
    } else {
      sessionStorage.removeItem(ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE);
    }
    roomTipAddress = draft;
    roomTipAddressLoaded = true;
    roomTipAddressFeedback = roomTipAddress
      ? "MAINNET DESTINATION SAVED / NEW POSTS CAN RECEIVE TIPS"
      : "MAINNET DESTINATION CLEARED / TIPPING OFF FOR NEW POSTS";
  } catch {
    roomTipAddressError = "THE BROWSER COULD NOT SAVE THIS LOCAL DESTINATION";
  } finally {
    roomTipAddressSaving = false;
    rerenderProductRoute();
  }
}

function isRoomNotificationSurface(path = normalizePath(window.location.pathname)): boolean {
  return path === "/room/feed"
    || path === "/room"
    || path === "/room/orb"
    || path === "/room/hall"
    || path === "/room/profile"
    || path === "/room/library"
    || path === "/room/rooms"
    || Boolean(roomChannelSurfaceFromPath(path))
    || path.startsWith("/c/");
}

function isRoomPostSurface(path = normalizePath(window.location.pathname)): boolean {
  return path === "/room" || path === "/room/feed" || Boolean(roomChannelSurfaceFromPath(path));
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
  const notificationKeys = loadNotificationKeys();
  if (!notificationKeys.length) {
    return;
  }
  roomNotificationsRequest = fetchAnonymousNotifications(notificationKeys)
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
    if (unreadIds.length) {
      // An empty id list marks everything read for these keys.
      await markAnonymousNotificationsRead(loadNotificationKeys(), []);
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
    await markAnonymousNotificationsRead(loadNotificationKeys(), [notificationId]);
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
    roomPostError = `Posts must be ${maxLength} characters or fewer.`;
    rerenderProductRoute();
    return;
  }
  if (!hasRoomSession()) {
    roomPostError = "ENTER THE ROOM BEFORE POSTING / FREE ROOM ACCESS IS AVAILABLE";
    rerenderProductRoute();
    return;
  }
  if (roomPostTipsEnabled && (!selectedTipAddress || !isClientMainnetTipAddress(selectedTipAddress))) {
    roomPostError = "USE A SHIELDED MAINNET ADDRESS / U1 OR ZS1";
    rerenderProductRoute();
    return;
  }

  roomPostSubmitting = true;
  roomPostError = "";
  roomChannelNotice = "TRANSMITTING / PRIVATE ROOM";
  rerenderProductRoute();

  try {
    const { scope, proof } = await createAnonymousRoomProof("post", "room", activeRoomChannel, content, selectedTipAddress);
    const notificationCapability = createNotificationCapability();
    const response = await createAnonymousPost({
      proof,
      scope,
      notificationCapability,
      content,
      channel: activeRoomChannel,
      category: "IDENTITY",
      tipAddress: selectedTipAddress || undefined,
    });
    rememberNotificationKey(notificationCapability);
    roomPendingPostIds.add(response.post.id);
    roomPosts = [response.post, ...roomPosts.filter((post) => post.id !== response.post.id)];
    if (mixedFeedLoadedAt) {
      mixedFeedPosts = [response.post, ...mixedFeedPosts.filter((post) => post.id !== response.post.id)];
      mixedFeedShuffled = [response.post, ...mixedFeedShuffled.filter((post) => post.id !== response.post.id)];
    }
    roomLikeCounts.set(response.post.id, response.post.reactions);
    rememberDeviceSignalPost(response.post);
    roomLikedIds.delete(response.post.id);
    roomPostsLoadedChannel = activeRoomChannel;
    // The new thought hangs in its museum room immediately, and stays there
    // when the visitor moves on through the hallway.
    const museumSnapshot = roomMuseumPostsByChannel.get(activeRoomChannel) ?? [];
    roomMuseumPostsByChannel.set(activeRoomChannel, [response.post, ...museumSnapshot.filter((post) => post.id !== response.post.id)]);
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
    roomPostError = `Replies must be ${maxLength} characters or fewer.`;
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
    repliesForThread(threadId).push({ text: content, time: "just now" });
    roomLocalComments = [localComment, ...roomLocalComments];
    rememberDeviceSignalComment(localComment);
    rerenderProductRoute();
    return;
  }

  roomReplySubmitting = true;
  roomPostError = "";
  roomChannelNotice = "Sending your reply…";
  rerenderProductRoute();

  try {
    const { scope, proof } = await createAnonymousRoomProof("reply", "thread", threadId, content);
    const notificationCapability = createNotificationCapability();
    const response = await createAnonymousReply({
      proof,
      scope,
      notificationCapability,
      threadId,
      content,
    });
    rememberNotificationKey(notificationCapability);
    roomLocalComments = [response.comment, ...roomLocalComments.filter((comment) => comment.id !== response.comment.id)];
    rememberDeviceSignalComment(response.comment);
    if (response.status === "created") {
      repliesForThread(threadId).push({ text: response.comment.text, time: "just now" });
      roomPosts = roomPosts.map((post) => post.id === threadId ? { ...post, replies: post.replies + 1 } : post);
      // A thread opened by direct link can sit outside the loaded room; refreshing would drop it.
      if (roomPosts.find((post) => post.id === threadId)?.channel === activeRoomChannel) {
        roomPostsLoadedChannel = undefined;
        void refreshRoomPosts();
      }
      roomChannelNotice = "Reply sent.";
    } else {
      roomChannelNotice = "You've said that already, so it wasn't sent twice.";
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
      <legend>Tips</legend>
      <label class="room-post-tips__toggle">
        <input id="room-post-allow-tips" type="checkbox" />
        <span>Allow tips on this post</span>
      </label>
      <p class="room-post-tips__note">Readers can send you shielded ZEC, straight to your wallet.</p>
      <a class="room-post-tips__learn" href="/how-it-works#tips" target="_blank" rel="noopener">How tips work →</a>
    </fieldset>`;
  }

  return `<fieldset class="room-post-tips room-post-tips--enabled">
    <legend>Tips</legend>
    <label class="room-post-tips__toggle">
      <input id="room-post-allow-tips" type="checkbox" checked />
      <span>Allow tips on this post</span>
    </label>
    <label class="ui-field room-post-tips__address-field" for="room-post-tip-address">
      <span class="ui-field__label">Your shielded address for this post</span>
      <input id="room-post-tip-address" type="text" value="${escapeHtml(roomPostTipAddressDraft)}" placeholder="u1..." autocomplete="off" spellcheck="false" maxlength="500" />
    </label>
    <p class="room-post-tips__note">Use your saved default address or enter a different public shielded mainnet address for this post.</p>
    <p class="room-post-tips__warning" data-warning="REUSING AN ADDRESS MAY MAKE POSTS EASIER TO ASSOCIATE." role="note">Reusing an address may make posts easier to associate.</p>
    <a class="room-post-tips__learn" href="/how-it-works#tips" target="_blank" rel="noopener">How tips work →</a>
  </fieldset>`;
}

function renderRoomDirectory(options: { showFooter?: boolean } = {}): string {
  const showFooter = options.showFooter ?? true;
  const activeChannel = roomChannelOption(activeRoomChannel);
  const channels = visibleRoomChannelOptions();
  const folderGroups: Array<{ key: string; label: string; channels: typeof roomChannelOptions; open: boolean }> = [
    {
      key: "discussion",
      label: "DISCUSSION ROOMS",
      channels: channels.filter((channel) => channel.key !== "general"),
      open: true,
    },
    {
      key: "system",
      label: "SYSTEM CHANNELS",
      channels: channels.filter((channel) => channel.key === "general"),
      open: activeRoomChannel === "general",
    },
  ];

  return `<aside class="room-directory" aria-label="Discussion rooms">
    <div class="room-directory__header">
    ${TerminalLabel("CHANNELS / PRIVATE ROOMS")}
    <span class="room-directory__count">${channels.length} OPEN</span>
    </div>
    <h2 class="hidn-glitch-title" data-text="CHOOSE A R&nbsp;&nbsp;M.">Choose a r<span class="room-directory-title__double-o">oo${renderRoomEyeWatcher("room-directory-title__watcher")}</span>m.</h2>
    <p class="room-directory__intro">Read quietly or leave a thought without a public name.</p>
    ${roomPostComposerOpen ? "" : `<div class="room-directory__create">${renderSayItButton()}${renderRoomRefreshControl()}${renderRoomShareControl()}</div>`}
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
                .map((channel) => `<button class="room-directory__room${activeRoomChannel === channel.key ? " room-directory__room--active" : ""}" type="button" data-room-channel="${channel.key}" aria-pressed="${activeRoomChannel === channel.key}">
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
                ${renderRoomPostChannelPicker()}
                <label class="ui-field room-post-composer__field" for="room-post-content">
                  <span class="ui-field__label room-post-composer__prompt">hidn@room:~$ <b>say it</b><span class="room-post-composer__room"> · ${escapeHtml(roomDisplayName(activeChannel.label))}</span></span>
                  <textarea id="room-post-content" rows="5" maxlength="${roomPostCharacterLimit()}" placeholder="Say the thing you can't say out loud.">${escapeHtml(roomPostText)}</textarea>
                </label>
                <p class="room-post-composer__note">${roomPostLimitCopy()} Your post is stored without a public name.</p>
                ${renderRoomPostTipControls()}
                <div class="room-post-composer__actions">
                  ${GhostButton({ label: "Cancel", dataAction: "room-post-cancel" })}
                  ${SecondaryButton({ label: roomPostSubmitting ? "Proving and sending…" : "Transmit", disabled: roomPostSubmitting, dataAction: "room-post-submit" })}
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
      <div><dt>REPORTED BY</dt><dd>${escapeHtml(report.reporterUsername ?? "ANONYMOUS MEMBER")}</dd></div>
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
      title: "Report console · HIDN",
      description: "Private HIDN moderation report console.",
      canonicalPath: "/admin/reports",
    },
    html: publicFrame(
      "/admin/reports",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--reading admin-reports-page">
          <header class="admin-reports-page__header">
            ${TerminalLabel("HIDN / PRIVATE OPERATOR SURFACE")}
            <p class="hidn-admin__log">hidn@admin:~$ ./queue --reports</p>
            <h1 class="type-display-lg hidn-admin__title" data-text="REPORT CONSOLE.">REPORT CONSOLE.</h1>
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
      title: "Admin control · HIDN",
      description: "Private HIDN administrator control surface.",
      canonicalPath: "/admin",
    },
    html: publicFrame(
      "/admin",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--reading admin-reports-page">
          <header class="admin-reports-page__header">
            ${TerminalLabel("HIDN / PRIVATE OPERATOR SURFACE")}
            <p class="hidn-admin__log">hidn@admin:~$ ./control --status</p>
            <h1 class="type-display-lg hidn-admin__title" data-text="ADMIN CONTROL.">ADMIN CONTROL.</h1>
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
            ${adminSession?.role === "super_admin" ? `<a class="ui-button ui-button--secondary" href="/admin/moderators">MODERATORS →</a><a class="ui-button ui-button--secondary" href="/admin/audit">AUDIT LOG →</a><a class="ui-button ui-button--secondary" href="/admin/metrics">METRICS →</a>` : ""}
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
      title: "Admin roles · HIDN",
      description: "Private HIDN administrator role control.",
      canonicalPath: "/admin/moderators",
    },
    html: publicFrame(
      "/admin/moderators",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--reading admin-reports-page">
          <header class="admin-reports-page__header">
            ${TerminalLabel("HIDN / SUPER ADMIN ONLY")}
            <p class="hidn-admin__log">hidn@admin:~$ ./roles --list</p>
            <h1 class="type-display-lg hidn-admin__title" data-text="ADMIN ROLES.">ADMIN ROLES.</h1>
            <p>Add or disable moderator and reviewer identities. They must sign in through the Cloudflare Access application with the same email before HIDN grants the role.</p>
            <p><a class="hidn-admin__back" href="/admin">&lt; cd /admin</a></p>
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

/** A small bar chart of one daily series, drawn inline (no chart library, no requests). */
function metricsBars(series: AdminMetrics["series"], pick: (day: AdminMetrics["series"][number]) => number, label: string): string {
  const values = series.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const width = 600, height = 120, gap = 3;
  const bar = (width - gap * (values.length - 1)) / values.length;
  const bars = values.map((value, index) => {
    const h = Math.max(value ? 2 : 0, (value / max) * (height - 4));
    return `<rect x="${(index * (bar + gap)).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${escapeHtml(series[index].day)}: ${value}</title></rect>`;
  }).join("");
  return `<figure class="hidn-metrics__chart">
    <figcaption><span>${escapeHtml(label)}</span><b>${total.toLocaleString()}</b><small>last ${series.length} days${total ? ` · peak ${max.toLocaleString()} a day` : " · none yet"}</small></figcaption>
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)} per day, last ${series.length} days">${bars}</svg>
    <div class="hidn-metrics__axis"><span>${escapeHtml(series[0]?.day ?? "")}</span><span>today</span></div>
  </figure>`;
}

function renderAdminMetrics(): RenderedProductRoute {
  const m = adminMetrics;
  const stat = (label: string, value: number, note = "") => `<div class="hidn-metrics__stat"><span>${escapeHtml(label)}</span><b>${value.toLocaleString()}</b>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const sumOf = (pick: (day: AdminMetrics["series"][number]) => number) => (m ? m.series.reduce((sum, day) => sum + pick(day), 0) : 0);
  const body = !m
    ? `<p class="hidn-metrics__empty">${adminReportError ? "" : "Loading metrics…"}</p>`
    : `<section class="hidn-metrics__stats" aria-label="All-time totals">
        ${stat("Keys created", m.totals.members, `${sumOf((d) => d.members).toLocaleString()} in the last ${m.days} days`)}
        ${stat("Confessions", m.totals.posts, `${sumOf((d) => d.posts).toLocaleString()} in the last ${m.days} days`)}
        ${stat("Replies", m.totals.replies, `${sumOf((d) => d.replies).toLocaleString()} in the last ${m.days} days`)}
        ${stat("Likes", m.totals.likes)}
        ${stat("Private links", m.totals.links, `${pct(m.rates.linksWithMessagesShare)} have received a message`)}
        ${stat("Link messages", m.totals.linkMessages, `${m.totals.tipMessages.toLocaleString()} with a tip`)}
        ${stat("Posts open to tips", m.totals.tipPosts)}
        ${stat("Reports", m.totals.reports, `${m.totals.hiddenPosts.toLocaleString()} posts hidden`)}
      </section>
      <p class="hidn-metrics__rate"><b>${pct(m.rates.repliedShare)}</b> of confessions in the last ${m.days} days got at least one reply.</p>
      <section class="hidn-metrics__charts" aria-label="Daily activity">
        ${metricsBars(m.series, (d) => d.members, "New keys")}
        ${metricsBars(m.series, (d) => d.posts, "Confessions")}
        ${metricsBars(m.series, (d) => d.replies, "Replies")}
        ${metricsBars(m.series, (d) => d.messages, "Private link messages")}
      </section>
      <section class="hidn-metrics__rooms" aria-labelledby="hidn-metrics-rooms">
        <h2 id="hidn-metrics-rooms">Confessions by room</h2>
        <table><thead><tr><th scope="col">Room</th><th scope="col">Last ${m.days} days</th><th scope="col">All time</th></tr></thead>
        <tbody>${m.rooms.map((row) => `<tr><td>${escapeHtml(roomDisplayName(roomChannelOptions.find((option) => option.key === row.room)?.label ?? row.room))}</td><td>${row.recent.toLocaleString()}</td><td>${row.total.toLocaleString()}</td></tr>`).join("")}</tbody></table>
      </section>
      <p class="hidn-metrics__note">Counts only. Posts are zero-knowledge, so HIDN can't tell members apart: there is no per-person activity, daily-active-user count or retention to show. Updated ${escapeHtml(new Date(m.generatedAt).toLocaleString())}.</p>`;
  return {
    metadata: {
      kind: "admin",
      title: "Metrics · HIDN",
      description: "Private HIDN usage metrics.",
      canonicalPath: "/admin/metrics",
    },
    html: publicFrame(
      "/admin/metrics",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--wide hidn-metrics">
          <header class="hidn-metrics__head">
            <p class="hidn-metrics__path">hidn://admin/metrics</p>
            <h1>Metrics</h1>
            <p>How HIDN is being used, from counts the database already keeps. <a href="/admin">Back to admin</a></p>
          </header>
          ${adminReportError ? AlertMessage("METRICS", adminReportError, "danger") : ""}
          ${body}
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
      title: "Admin audit · HIDN",
      description: "Private HIDN administrator audit log.",
      canonicalPath: "/admin/audit",
    },
    html: publicFrame(
      "/admin/audit",
      `<main id="main-content" class="public-main admin-main">
        <div class="hidn-container--reading admin-reports-page">
          <header class="admin-reports-page__header">
            ${TerminalLabel("HIDN / SUPER ADMIN ONLY")}
            <p class="hidn-admin__log">hidn@admin:~$ tail -n 50 /var/log/hidn-admin</p>
            <h1 class="type-display-lg hidn-admin__title" data-text="AUDIT LOG.">AUDIT LOG.</h1>
            <p>Every role change, report update, and content action is recorded here with the acting admin identity.</p>
            <p><a class="hidn-admin__back" href="/admin">&lt; cd /admin</a></p>
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
        title: "An anonymous post · HIDN",
        description: "Checking HIDN moderation state before opening this transmission.",
        canonicalPath: path,
      }
    : EXPLORE_METADATA;

  return {
    metadata,
    html: publicFrame(
      path,
      `<main id="main-content" class="public-main explore-main" aria-busy="true">
        ${LoadingState("OPENING THE ROOM", "Checking the room before displaying its thoughts.")}
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

function roomChannelFeedFromPath(path: string): RoomChannel | undefined {
  const normalizedPath = normalizePath(path);
  const prefix = "/room/channel/";
  const suffix = "/feed";
  if (!normalizedPath.startsWith(prefix) || !normalizedPath.endsWith(suffix)) {
    return undefined;
  }

  const key = normalizedPath.slice(prefix.length, -suffix.length) as RoomChannel;
  return roomChannelOptions.some((channel) => channel.key === key) ? key : undefined;
}

function roomChannelSurfaceFromPath(path: string): RoomChannel | undefined {
  return roomChannelFromPath(path) ?? roomChannelFeedFromPath(path);
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
    || path === "/room/main"
    || path === "/explore"
    || path === "/room/orb"
    || path === "/room/hall"
    || path === "/room/profile"
    || path === "/room/inbox"
    || path === "/room/feed"
    || Boolean(roomChannelSurfaceFromPath(path))
    || Boolean(roomThreadIdFromPath(path));
}

function isRoomMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

/** Wide screens get the three-column room: rooms rail, feed, open post. */
const ROOM_DESKTOP_QUERY = "(min-width: 1100px)";

function isRoomDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(ROOM_DESKTOP_QUERY).matches;
}

/** The post open in the desktop side panel, if any. */
let deskOpenThreadId = "";

// Crossing the desktop width swaps the room between its two layouts.
if (typeof window !== "undefined") {
  window.matchMedia(ROOM_DESKTOP_QUERY).addEventListener("change", () => {
    const path = normalizePath(window.location.pathname);
    if (path === MIXED_FEED_PATH || roomChannelFeedFromPath(path) || roomChannelFromPath(path)) {
      rerenderProductRoute();
    }
  });
}

function openDeskThread(threadId: string): void {
  deskOpenThreadId = threadId;
  void refreshRoomThread(threadId);
  rerenderProductRoute();
}

function renderDeskRail(current: string): string {
  const channels = visibleRoomChannelOptions();
  const lead = roomStandings && roomStandings.rooms[0]?.posts ? roomStandings.rooms[0].channel : "";
  const rank = (key: string) => (key === lead ? `<span class="hidn-desk__rail-rank">1st</span>` : "");
  return `<nav class="hidn-desk__rail" aria-label="Feed and rooms">
    <p class="hidn-desk__label">Rooms</p>
    <a class="hidn-desk__rail-item${current === "feed" ? " hidn-desk__rail-item--active" : ""}" href="${MIXED_FEED_PATH}"${current === "feed" ? ` aria-current="page"` : ""}><span class="hidn-desk__rail-title">Every room</span></a>
    ${channels.map((channel) => `<button class="hidn-desk__rail-item${current === channel.key ? " hidn-desk__rail-item--active" : ""}" type="button" data-room-channel="${channel.key}" title="${escapeHtml(channel.description)}"${current === channel.key ? ` aria-current="page"` : ""}><span class="hidn-desk__rail-title">${escapeHtml(roomDisplayName(channel.label))}</span>${rank(channel.key)}</button>`).join("")}
  </nav>`;
}

function renderDeskWindow(title: string, body: string, options: { close?: boolean; className?: string; label?: string; root?: string } = {}): string {
  return `<section class="hidn-desk__window${options.className ? ` ${options.className}` : ""}"${options.label ? ` aria-label="${escapeHtml(options.label)}"` : ""}${options.root ? ` data-thread-root="${escapeHtml(options.root)}"` : ""}>
    <div class="hidn-desk__window-bar">
      <span class="hidn-desk__window-title">${escapeHtml(title)}<span class="hidn-desk__caret" aria-hidden="true">▌</span></span>
      ${options.close ? `<button class="hidn-desk__window-close" type="button" data-desk-close aria-label="Close this post">×</button>` : ""}
    </div>
    <div class="hidn-desk__window-body">${body}</div>
  </section>`;
}

function renderDeskThread(post: RoomPost): string {
  const replies = repliesForThread(post.id);
  const loading = !roomThreadDetailLoaded.has(post.id) && !roomThreadDetailErrors.has(post.id);
  const error = roomThreadDetailErrors.get(post.id);
  const replyCount = replyCountForThread(post.id, post.replies);
  const reference = post.id.replace(/^THR-/, "").slice(0, 8).toLowerCase();
  const room = roomChannelOption(post.channel as RoomChannel).label;
  const body = `
    <p class="hidn-desk__meta"><span class="hidn-desk__meta-room">${escapeHtml(roomDisplayName(room))}</span> · ${escapeHtml(timeAgo(post.time) || formatTransmissionTime(post.time))} · ♡ ${reactionCountForThread(post.id, post.reactions)}</p>
    <p class="hidn-desk__thread-text">${escapeHtml(post.text)}</p>
    <div class="hidn-desk__replies">
      <p class="hidn-desk__card-title">Replies · ${replyCount}</p>
      ${replies.map((reply) => `<div class="hidn-desk__reply"><span class="hidn-desk__reply-mark" aria-hidden="true">↳</span><div><p>${escapeHtml(reply.text)}</p><span>anonymous · ${escapeHtml(reply.time)}</span></div></div>`).join("")}
      ${loading && !replies.length && replyCount ? `<p class="hidn-desk__muted">Loading replies…</p>` : ""}
      ${error ? `<p class="hidn-desk__muted">!! ${escapeHtml(error)}</p>` : ""}
      ${!replyCount && !loading ? `<p class="hidn-desk__muted">No replies yet. Say something back.</p>` : ""}
    </div>
    <label class="hidn-desk__card-title" for="desk-reply-${escapeHtml(post.id)}">Reply without a name</label>
    <textarea class="hidn-desk__input" id="desk-reply-${escapeHtml(post.id)}" rows="3" maxlength="${roomReplyCharacterLimit()}" placeholder="Say it back." data-thread-input></textarea>
    <div class="hidn-desk__actions">
      ${SecondaryButton({ label: roomReplySubmitting ? "Proving and sending…" : "Reply", disabled: roomReplySubmitting, dataAction: "thread-reply" })}
      <button class="hidn-desk__btn" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(post.id)}">Share</button>
      <a class="hidn-desk__btn hidn-desk__btn--link" href="/c/${encodeURIComponent(post.id)}" title="Quote, save as image or report on the full page">Open full page →</a>
    </div>`;
  return renderDeskWindow(`hidn://thread/${reference}`, body, { close: true, className: "hidn-desk__thread", label: "Open post", root: post.id });
}

function renderDeskPanel(): string {
  const post = deskOpenThreadId ? roomPosts.find((candidate) => candidate.id === deskOpenThreadId) : undefined;
  if (post && !isModerationHidden("thread", post.id)) {
    return `<aside class="hidn-desk__panel" aria-label="Open post">${renderDeskThread(post)}</aside>`;
  }
  return `<aside class="hidn-desk__panel" aria-label="More">
    ${renderDeskWindow("hidn://leaderboard", renderRoomStandings(true), { label: "Loudest rooms this week" })}
    ${renderDeskWindow("hidn://you", `<p class="hidn-desk__card-title">What the room knows about you</p>
      <dl class="hidn-desk__knows">
        <dt>Your name</dt><dd>never asked</dd>
        <dt>Your email</dt><dd>never asked</dd>
        <dt>Your key</dt><dd>on this device</dd>
        <dt>Who posted</dt><dd>a member, not which</dd>
      </dl>
      <a class="hidn-desk__link" href="/how-it-works">How the proof works →</a>`, { label: "What the room knows about you" })}
    ${renderDeskWindow("hidn://private_link", `<p class="hidn-desk__card-title">Your private link</p><p class="hidn-desk__muted">Anyone can message you. Neither side learns who the other is.</p>
      <div class="hidn-desk__actions"><a class="hidn-desk__link hidn-desk__link--strong" href="/room/inbox">Open inbox →</a></div>`, { label: "Your private link" })}
    ${renderDeskWindow("hidn://zcash", `<div class="hidn-desk__zec">${DESK_ART_COIN}${renderRoomZcashStatus()}</div><p class="hidn-desk__muted">Tips go wallet to wallet. HIDN never holds the funds.</p>`, { label: "Zcash" })}
  </aside>`;
}

/** Small drawings for the side cards, so each one shows what it does. */
const DESK_ART_FEED = `<svg class="hidn-desk__art hidn-art-feed" viewBox="0 0 300 92" aria-hidden="true" focusable="false">
  <g class="hidn-art-feed__rows">
    <rect x="8" y="8" width="132" height="20" rx="3" class="hidn-art__row"/><circle cx="20" cy="18" r="3" class="hidn-art__dot"/><rect x="30" y="15" width="92" height="5" rx="2" class="hidn-art__ink"/>
    <rect x="8" y="36" width="132" height="20" rx="3" class="hidn-art__row hidn-art__row--on"/><circle cx="20" cy="46" r="3" class="hidn-art__dot hidn-art__dot--on"/><rect x="30" y="43" width="80" height="5" rx="2" class="hidn-art__ink hidn-art__ink--on"/>
    <rect x="8" y="64" width="132" height="20" rx="3" class="hidn-art__row"/><circle cx="20" cy="74" r="3" class="hidn-art__dot"/><rect x="30" y="71" width="100" height="5" rx="2" class="hidn-art__ink"/>
  </g>
  <circle cx="122" cy="46" r="6" class="hidn-art-feed__tap"/>
  <path d="M142 46 C 160 46, 166 46, 186 46" class="hidn-art-feed__beam"/>
  <rect x="188" y="8" width="104" height="76" rx="5" class="hidn-art__panel"/>
  <rect x="198" y="18" width="70" height="5" rx="2" class="hidn-art__ink hidn-art__ink--on hidn-art-feed__line"/>
  <rect x="198" y="34" width="84" height="4" rx="2" class="hidn-art__ink hidn-art-feed__line hidn-art-feed__line--2"/>
  <rect x="208" y="46" width="64" height="4" rx="2" class="hidn-art__ink hidn-art-feed__line hidn-art-feed__line--3"/>
  <rect x="208" y="58" width="52" height="4" rx="2" class="hidn-art__ink hidn-art-feed__line hidn-art-feed__line--4"/>
  <rect x="198" y="70" width="84" height="8" rx="2" class="hidn-art__row hidn-art-feed__line hidn-art-feed__line--5"/>
</svg>`;

const DESK_ART_LINK = `<svg class="hidn-desk__art hidn-art-link" viewBox="0 0 300 92" aria-hidden="true" focusable="false">
  <rect x="8" y="30" width="128" height="30" rx="15" class="hidn-art__chip"/>
  <path d="M26 45 h10 M30 40 a5 5 0 0 0 0 10 M38 40 a5 5 0 0 1 0 10" class="hidn-art__glyph"/>
  <text x="50" y="50" class="hidn-art__text">/to/•••••</text>
  <path d="M138 45 C 170 10, 196 10, 214 30" class="hidn-art-link__arc"/>
  <g class="hidn-art-link__msg hidn-art-link__msg--1"><rect x="214" y="22" width="56" height="12" rx="6" class="hidn-art__bubble"/></g>
  <g class="hidn-art-link__msg hidn-art-link__msg--2"><rect x="222" y="40" width="48" height="12" rx="6" class="hidn-art__bubble"/></g>
  <g class="hidn-art-link__msg hidn-art-link__msg--3"><rect x="214" y="58" width="62" height="12" rx="6" class="hidn-art__bubble"/></g>
  <path d="M202 52 v28 a6 6 0 0 0 6 6 h76 a6 6 0 0 0 6 -6 v-28" class="hidn-art-link__tray"/>
  <rect x="236" y="74" width="20" height="4" rx="2" class="hidn-art__ink hidn-art__ink--on"/>
</svg>`;

const DESK_ART_COIN = `<svg class="hidn-desk__coin" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <defs><radialGradient id="hidn-coin-face" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#ffe08a"/><stop offset=".55" stop-color="#f4b728"/><stop offset="1" stop-color="#8f6510"/></radialGradient></defs>
  <g class="hidn-desk__coin-spin">
    <circle cx="32" cy="32" r="28" fill="url(#hidn-coin-face)"/>
    <circle cx="32" cy="32" r="22.5" fill="none" stroke="#1b1406" stroke-width="2.5"/>
    <path d="M30.2 15h3.6v5.2h8.4v4.6L28.6 39.6h13.6V44h-8.4v5h-3.6v-5h-8.4v-4.6L35.4 24.8H21.8V20.2h8.4z" fill="#1b1406"/>
  </g>
</svg>`;

/** The desktop room: rooms rail on the left, the feed (header, composer,
 * sort tabs, posts) in the middle, and the open post on the right. */
function renderDeskRoom(current: string, header: string, feed: string): string {
  return `<main id="main-content" class="public-main explore-main hidn-desk">
    <div class="hidn-desk__grid">
      ${renderDeskRail(current)}
      <div class="hidn-desk__center">
        <header class="explore-header hidn-desk__header">${header}${renderMobilePostSurface()}</header>
        ${feed}
      </div>
      ${renderDeskPanel()}
    </div>
  </main>`;
}

function renderRoomZcashStatus(): string {
  return `<span class="ui-status-indicator zcash-status-carousel" data-zcash-status>${StatusDot("online", true)}<span data-zcash-status-label>BUILT ON ZCASH</span></span>`;
}

function sampleMuseumPosts(roomIndex: number, room: (typeof roomChannelOptions)[number]): MuseumPost[] {
  return Array.from({ length: 10 }, (_, index) => {
    const confession = MOCK_CONFESSIONS[(roomIndex * 3 + index) % MOCK_CONFESSIONS.length];
    return {
      text: confession.text,
      category: confession.category,
      time: confession.time,
      roomKey: room.key,
      roomLabel: room.label,
    };
  });
}

function museumLivePostsForChannel(roomKey: RoomChannel): MuseumPost[] {
  // The room's social feed is the source of truth. When it has loaded for
  // this channel (including the visitor's own just-sent posts), use it;
  // otherwise fall back to the hallway's per-room snapshot.
  const source = roomPostsLoadedChannel === roomKey
    ? roomPosts.filter((post) => post.channel === roomKey)
    : roomMuseumPostsByChannel.get(roomKey) ?? [];
  const room = roomChannelOption(roomKey);
  return source.map((post) => ({
    id: post.id,
    text: post.text,
    category: post.category,
    time: post.time,
    roomKey,
    roomLabel: room.label,
  }));
}

function museumGalleryHasLiveData(roomKey: RoomChannel): boolean {
  return roomMuseumLoaded || roomPostsLoadedChannel === roomKey;
}

function roomMuseumGalleries(): MuseumGallery[] {
  return roomChannelOptions.map((room, roomIndex) => {
    const livePosts = museumLivePostsForChannel(room.key);
    const preview = museumDesignPreview();
    const liveData = !preview && museumGalleryHasLiveData(room.key);
    // Real rooms only ever hang real posts from the social feed; sample
    // thoughts exist for the local design preview alone.
    const posts = preview ? sampleMuseumPosts(roomIndex, room) : livePosts;
    return {
      key: room.key,
      roomIndex,
      label: room.label,
      description: room.description,
      theme: museumThemeByChannel[room.key],
      hasNewSignal: liveData && livePosts.length > 0,
      signalCount: livePosts.length,
      posts,
    };
  });
}

function roomMuseumGallery(roomKey: RoomChannel): MuseumGallery {
  const room = roomChannelOption(roomKey);
  const roomIndex = roomChannelOptions.findIndex((candidate) => candidate.key === roomKey);
  const livePosts = museumLivePostsForChannel(roomKey);
  const preview = museumDesignPreview();
  const liveData = !preview && museumGalleryHasLiveData(roomKey);
  return {
    key: room.key,
    roomIndex,
    label: room.label,
    description: room.description,
    theme: museumThemeByChannel[room.key],
    hasNewSignal: liveData && livePosts.length > 0,
    signalCount: livePosts.length,
    posts: preview ? (preview.empty ? [] : sampleMuseumPosts(roomIndex, room)) : livePosts,
  };
}

// Local-only design review: preview the actual scene components without an
// account, writing test posts, or changing production's session boundaries.
function museumDesignPreview(): { view: string; empty: boolean } | undefined {
  if (!import.meta.env.DEV || window.location.pathname !== "/museum-preview") return undefined;
  const params = new URLSearchParams(window.location.search);
  return { view: params.get("view") ?? "main", empty: params.get("empty") === "1" };
}

function museumDesignPreviewHtml(): string {
  const preview = museumDesignPreview()!;
  const channel = roomChannelOptions.find((room) => room.key === preview.view);
  let html = preview.view === "main" ? renderHome(true).html : preview.view === "library" ? renderLibraryMuseum() : channel ? renderRoomChannelMuseum(channel.key) : renderRoomMuseum();
  html = html.replaceAll('href="/room/main"', 'href="/museum-preview?view=main"')
    .replaceAll('href="/room"', 'href="/museum-preview?view=hall"')
    .replaceAll('href="/room/library"', 'href="/museum-preview?view=library"');
  for (const room of roomChannelOptions) {
    html = html.replaceAll(`href="/room/channel/${room.key}"`, `href="/museum-preview?view=${room.key}"`);
  }
  const links = [{ key: "main", label: "Main room" }, { key: "hall", label: "Hallway" }, ...roomChannelOptions, { key: "library", label: "Library" }];
  const controls = `<details class="museum-design-preview"><summary>DESIGN PREVIEW</summary><nav aria-label="Preview museum spaces">${links.map((room) => `<a href="/museum-preview?view=${room.key}"${preview.view === room.key && !preview.empty ? ' aria-current="page"' : ""}>${escapeHtml(room.label)}</a>`).join("")}<a href="/museum-preview?view=general&amp;empty=1"${preview.empty ? ' aria-current="page"' : ""}>Empty room</a></nav><small>LOCAL / SAMPLE THOUGHTS</small></details>`;
  return html.replace("</main>", `${controls}</main>`);
}

function renderMuseumSignal(gallery: MuseumGallery): string {
  const live = gallery.hasNewSignal === true;
  const label = live
    ? `NEW SIGNAL${gallery.signalCount && gallery.signalCount > 1 ? ` / ${gallery.signalCount}` : ""}`
    : museumDesignPreview() ? "SAMPLE WALL" : museumGalleryHasLiveData(gallery.key as RoomChannel) ? "QUIET ROOM" : "LOADING";
  return `<span class="room-museum__room-signal${live ? " room-museum__room-signal--new" : ""}"><i aria-hidden="true"></i>${label}</span>`;
}

function renderMuseumExhibitionIndex(galleries: MuseumGallery[]): string {
  return galleries.map((gallery, index) => `<article>
              <button type="button" data-museum-room="${escapeHtml(gallery.key)}" aria-label="Enter the ${escapeHtml(gallery.label)} gallery">
                <span class="room-museum__room-line"><span>${String(index + 1).padStart(2, "0")} / ${escapeHtml(gallery.label)}</span>${renderMuseumSignal(gallery)}</span>
                <span>${escapeHtml(gallery.description)}</span>
                <small>${gallery.posts.length ? `${gallery.posts.length} THOUGHTS ON THE WALL` : "THE WALLS ARE QUIET"} · ENTER ROOM →</small>
              </button>
            </article>`).join("");
}

function renderMuseumFloorPlan(activeRoomKey?: RoomChannel): string {
  const rooms = roomChannelOptions.map((room, index) => {
    const left = index % 2 === 0;
    const row = Math.floor(index / 2);
    const x = left ? 7 : 70;
    const y = 10 + row * 44;
    const active = room.key === activeRoomKey;
    return `<g class="museum-map-room${active ? " museum-map-room--active" : ""}">
              <rect x="${x}" y="${y}" width="43" height="30" rx="1" data-museum-map-room="${escapeHtml(room.key)}"/>
              <text x="${x + 21.5}" y="${y + 17}" text-anchor="middle">${escapeHtml(room.label)}</text>
              <path d="M${left ? x + 43 : 66} ${y + 15}H${left ? 54 : x}"/>
            </g>`;
  }).join("");

  return `<svg viewBox="0 0 120 150" role="img" aria-label="Floor plan showing all six HIDN rooms and your position">
            <rect class="museum-map-hall" x="54" y="6" width="12" height="138" rx="1"/>
            ${rooms}
            <path class="museum-map-stairs" d="M56 42h8m-8 3h8m-8 3h8m-8 47h8m-8 3h8m-8 3h8"/>
            <text class="museum-map-hall-label" x="60" y="76" text-anchor="middle">HALL</text>
            <path d="M-4 0 0 8 4 0Z" fill="#b8dc68" data-museum-map-heading/>
            <circle r="2.5" fill="#f3efe3" data-museum-map-position/>
          </svg>`;
}

function renderRoomMuseum(): string {
  const galleries = roomMuseumGalleries();
  const demo = !roomMuseumLoaded;
  return publicFrame(
    "/room",
    `<main id="main-content" class="public-main room-museum-main">
      <section class="room-museum room-museum--hall" data-room-museum aria-label="HIDN museum room">
        <div class="room-museum__stage" data-museum-stage>
          <p class="room-museum__loading" data-museum-loading role="status">OPENING THE ROOM…</p>
        </div>
        <header class="room-museum__location">
          ${TerminalLabel("HIDN / THE MUSEUM")}
          <h1>The hallway.</h1>
          <p>ONE HALL. MANY THEMES. THOUGHTS ON EVERY WALL.</p>
          <span class="room-museum__demo">${museumDesignPreview() ? "DESIGN PREVIEW / SAMPLE THOUGHTS" : demo ? "LOADING THE ROOMS…" : `${galleries.length} CONNECTED ROOMS / LIVE WALLS`}</span>
        </header>
        <div class="room-museum__links">
          <a href="/room/main">← MAIN ROOM</a>
          <a href="/room/rooms">SOCIAL ROOMS ↗</a>
        </div>
        <details class="room-museum__exhibition" data-museum-exhibition>
          <summary>ROOM INDEX / ${String(galleries.length).padStart(2, "0")}</summary>
          <div class="room-museum__exhibition-list">
            ${renderMuseumExhibitionIndex(galleries)}
          </div>
        </details>
        <aside class="room-museum__reader" data-museum-reader hidden role="dialog" aria-labelledby="museum-reader-title">
          <div class="room-museum__reader-top"><span id="museum-reader-title" data-museum-post-category>THOUGHT</span><button type="button" data-museum-reader-close aria-label="Close thought">×</button></div>
          <blockquote data-museum-post-text></blockquote>
          <footer><span>WITHOUT A NAME</span><a data-museum-post-link href="/room" hidden>OPEN THREAD →</a></footer>
        </aside>
        <nav class="room-museum__view-controls" aria-label="Museum view controls">
          <button type="button" class="room-museum__compass" data-museum-action="reset" aria-label="Reset museum view"><span data-museum-compass aria-hidden="true">↑</span><small>N</small></button>
          <div class="room-museum__zoom"><button type="button" data-museum-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-museum-action="zoom-out" aria-label="Zoom out">−</button></div>
          <button type="button" data-museum-action="map" aria-expanded="false" aria-controls="museum-map" aria-label="Show room map">⌑</button>
        </nav>
        <div class="room-museum__map" id="museum-map" data-museum-map hidden>
          <span>THE ROOM / FLOOR PLAN</span>
          ${renderMuseumFloorPlan()}
        </div>
        <nav class="room-museum__walk-controls" aria-label="Move through the room">
          <button type="button" data-museum-action="left" aria-label="Look left">↶</button>
          <button type="button" data-museum-action="forward" aria-label="Walk forward">⌃</button>
          <button type="button" data-museum-action="back" aria-label="Walk backward">⌄</button>
          <button type="button" data-museum-action="right" aria-label="Look right">↷</button>
        </nav>
        <p class="room-museum__hint" data-museum-status>DRAG TO LOOK · TAP THE FLOOR TO WALK · TAP A ROOM SIGN TO ENTER</p>
      </section>
    </main>`,
    "public-page--room-museum",
  );
}

// The Library is a museum-only room: no posting channel, only ZecHub
// learning scrolls, live ShieldedScan readings and the wallet kiosk.
const LIBRARY_GALLERY: MuseumGallery = {
  key: "library",
  label: "THE LIBRARY",
  description: "learn zcash, scroll by scroll, from zechub",
  roomIndex: roomChannelOptions.length,
  theme: { accent: "#f0c766", glow: "#d9a640", trim: "#6e5320", wall: "#211b10", floor: "#2a2417" },
  posts: [],
};

function renderLibraryMuseum(): string {
  return publicFrame(
    "/room/library",
    `<main id="main-content" class="public-main room-museum-main room-museum-main--channel">
      <section class="room-museum room-museum--channel" data-room-museum data-museum-library aria-label="HIDN library room">
        <div class="room-museum__stage" data-museum-stage>
          <p class="room-museum__loading" data-museum-loading role="status">OPENING THE LIBRARY…</p>
        </div>
        <header class="room-museum__location">
          ${TerminalLabel("HIDN / THE LIBRARY")}
          <h1>THE LIBRARY</h1>
          <p>LEARN ZCASH. SCROLLS FROM ZECHUB, LIVE FIGURES FROM SHIELDEDSCAN.</p>
        </header>
        <nav class="room-museum__links room-museum__links--channel" aria-label="Library routes">
          <a class="room-museum__hallway-link" href="/room">← BACK TO HALLWAY</a>
          <a href="https://zechub.wiki/start-here" target="_blank" rel="noopener noreferrer">ZECHUB START HERE ↗</a>
        </nav>
        <nav class="room-museum__walk-controls" aria-label="Move through the library">
          <button type="button" data-museum-action="left" aria-label="Look left">↶</button>
          <button type="button" data-museum-action="forward" aria-label="Walk forward">⌃</button>
          <button type="button" data-museum-action="back" aria-label="Walk backward">⌄</button>
          <button type="button" data-museum-action="right" aria-label="Look right">↷</button>
        </nav>
        <button type="button" class="hidn-tv-prompt" data-tv-prompt>[ ▶ WATCH · ZCASH CHANNELS ]</button>
        <p class="room-museum__hint" data-museum-status>DRAG TO LOOK · TAP THE FLOOR TO WALK · READ THE SCROLLS · TAP THE KIOSK FOR WALLETS</p>
      </section>
    </main>`,
    "public-page--room-museum public-page--room-channel-museum",
  );
}

function renderRoomChannelMuseum(roomKey: RoomChannel): string {
  const gallery = roomMuseumGallery(roomKey);
  const roomIndex = roomChannelOptions.findIndex((room) => room.key === roomKey);
  const previous = roomChannelOptions[(roomIndex - 1 + roomChannelOptions.length) % roomChannelOptions.length];
  const next = roomChannelOptions[(roomIndex + 1) % roomChannelOptions.length];
  return publicFrame(
    `/room/channel/${encodeURIComponent(roomKey)}`,
    `<main id="main-content" class="public-main room-museum-main room-museum-main--channel">
      <section class="room-museum room-museum--channel" data-room-museum data-museum-room-key="${escapeHtml(roomKey)}" aria-label="HIDN ${escapeHtml(gallery.label)} room">
        <div class="room-museum__stage" data-museum-stage>
          <p class="room-museum__loading" data-museum-loading role="status">OPENING ${escapeHtml(gallery.label)}…</p>
        </div>
        <header class="room-museum__location">
          ${TerminalLabel(`HIDN / ${gallery.label}`)}
          <h1>${escapeHtml(gallery.label)}</h1>
          <p>${escapeHtml(gallery.description)}. THOUGHTS ON EVERY WALL.</p>
          <span class="room-museum__demo">${renderMuseumSignal(gallery)} <span>${gallery.posts.length} WALLS / ROOM ${String(roomIndex + 1).padStart(2, "0")}</span></span>
        </header>
        <nav class="room-museum__links room-museum__links--channel" aria-label="Room routes">
          <a class="room-museum__hallway-link" href="/room">← BACK TO HALLWAY</a>
          <a href="/room/channel/${encodeURIComponent(roomKey)}/feed">OPEN ROOM FEED ↗</a>
        </nav>
        <nav class="room-museum__room-nav" aria-label="Move between rooms">
          <a href="/room/channel/${encodeURIComponent(previous.key)}">← ${escapeHtml(previous.label)}</a>
          <span>ROOM ${String(roomIndex + 1).padStart(2, "0")} / ${String(roomChannelOptions.length).padStart(2, "0")}</span>
          <a href="/room/channel/${encodeURIComponent(next.key)}">${escapeHtml(next.label)} →</a>
        </nav>
        <aside class="room-museum__reader" data-museum-reader hidden role="dialog" aria-labelledby="museum-reader-title">
          <div class="room-museum__reader-top"><span id="museum-reader-title" data-museum-post-category>THOUGHT</span><button type="button" data-museum-reader-close aria-label="Close thought">×</button></div>
          <blockquote data-museum-post-text></blockquote>
          <footer><span>${escapeHtml(gallery.label)} / WITHOUT A NAME</span><a data-museum-post-link href="/room" hidden>OPEN THREAD →</a></footer>
        </aside>
        <nav class="room-museum__view-controls" aria-label="Museum view controls">
          <button type="button" class="room-museum__compass" data-museum-action="reset" aria-label="Reset room view"><span data-museum-compass aria-hidden="true">↑</span><small>N</small></button>
          <div class="room-museum__zoom"><button type="button" data-museum-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-museum-action="zoom-out" aria-label="Zoom out">−</button></div>
          <button type="button" data-museum-action="map" aria-expanded="false" aria-controls="museum-map" aria-label="Show room map">⌑</button>
        </nav>
        <div class="room-museum__map" id="museum-map" data-museum-map hidden>
          <span>ROOM / FLOOR PLAN</span>
          ${renderMuseumFloorPlan(roomKey)}
        </div>
        <nav class="room-museum__walk-controls" aria-label="Move through the room">
          <button type="button" data-museum-action="left" aria-label="Look left">↶</button>
          <button type="button" data-museum-action="forward" aria-label="Walk forward">⌃</button>
          <button type="button" data-museum-action="back" aria-label="Walk backward">⌄</button>
          <button type="button" data-museum-action="right" aria-label="Look right">↷</button>
        </nav>
        <p class="room-museum__hint" data-museum-status>DRAG TO LOOK · TAP THE FLOOR TO WALK · TAP A FRAME TO READ</p>
      </section>
    </main>`,
    "public-page--room-museum public-page--room-channel-museum",
  );
}

function roomNotificationLabel(notification: AccountNotification): string {
  const alias = notification.actorAlias?.trim() ?? "";
  const actor = alias && alias.toUpperCase() !== "ANONYMOUS" ? alias : "Someone";
  return notification.type === "reaction" ? `${actor} liked your post` : `${actor} replied to your post`;
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
      // A member who has never posted or replied has nothing to be notified about yet.
      : !roomNotifications && loadNotificationKeys().length
        ? `<p class="room-notifications__empty" role="status">Checking for activity…</p>`
        : notifications.length
          ? `<ul class="room-notifications__list">${notifications.map((notification) => `<li class="room-notifications__item${notification.readAt ? "" : " room-notifications__item--unread"}">
            <a href="${escapeHtml(roomNotificationTargetPath(notification))}" class="room-notifications__link" data-room-notification-link data-notification-id="${escapeHtml(notification.id)}" aria-label="Open ${escapeHtml(roomNotificationLabel(notification))}">
              <span class="room-notifications__label">${escapeHtml(roomNotificationLabel(notification))}</span>
              <span class="room-notifications__meta">${escapeHtml(formatNotificationDateTime(notification.createdAt))}</span>
            </a>
          </li>`).join("")}</ul>`
        : `<p class="room-notifications__empty">Nothing yet. When someone likes or replies to your posts, it shows up here.</p>`;

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
      <span class="room-notifications__toggle-copy">Activity</span>
    </button>
    ${roomNotificationsOpen ? `<div class="room-notifications__panel" id="room-notifications-panel">
      <header class="room-notifications__header">
        <span>Your activity</span>
        ${unreadCount ? `<span>${unreadCount} unread</span>` : "<span>All caught up</span>"}
      </header>
      ${content}
      ${unreadCount ? `<div class="room-notifications__actions">${SecondaryButton({ label: roomNotificationsMarkingRead ? "Marking read…" : "Mark all read", disabled: roomNotificationsMarkingRead, dataAction: "room-notifications-read" })}</div>` : ""}
    </div>` : ""}
  </section>`;
}

// The composer names the room a post goes to. Inside a room's own feed the
// room is fixed; elsewhere the visitor picks it, so a thought never lands in
// whichever room happened to be open last.
/** SHARE THIS ROOM, shown beside SAY IT HERE when inside one room. */
function renderRoomShareControl(): string {
  const key = roomChannelSurfaceFromPath(window.location.pathname);
  return key && roomLinkByKey(key)
    ? `<button class="room-channel-share" type="button" data-room-share="${key}" aria-label="Share this room">Share room</button>`
    : "";
}

/** Why a room isn't taking posts right now (a limited room before it opens or after it closes), or null. */
function roomPostingClosed(key: string): string | null {
  const link = roomLinkByKey(key);
  return link ? roomClosedReason(link) : null;
}

/** The say-it button, or a disabled one while the room on screen isn't open for posts. */
function renderSayItButton(): string {
  const fixed = roomChannelSurfaceFromPath(window.location.pathname);
  if (fixed && roomPostingClosed(fixed)) {
    return SecondaryButton({ label: "Closed for new posts", disabled: true, className: "room-say-closed" });
  }
  return SecondaryButton({ label: "Say it here", dataAction: "room-create-post" });
}

function renderRoomPostChannelPicker(): string {
  const fixed = roomChannelSurfaceFromPath(window.location.pathname);
  if (fixed) {
    return `<p class="room-post-channel room-post-channel--fixed">Posting to ${escapeHtml(roomDisplayName(roomChannelOption(fixed).label))}</p>`;
  }
  return `<fieldset class="room-post-channel">
    <legend>Room</legend>
    <div class="room-post-channel__options">
      ${visibleRoomChannelOptions()
        .map((channel) => roomPostingClosed(channel.key)
          ? `<button type="button" class="room-post-channel__option" data-room-post-channel="${channel.key}" aria-pressed="false" disabled title="${escapeHtml(roomPostingClosed(channel.key) ?? "")}">${escapeHtml(roomDisplayName(channel.label))} · closed</button>`
          : `<button type="button" class="room-post-channel__option" data-room-post-channel="${channel.key}" aria-pressed="${channel.key === activeRoomChannel}">${escapeHtml(roomDisplayName(channel.label))}</button>`)
        .join("")}
    </div>
  </fieldset>`;
}

function renderMobilePostSurface(): string {
  const activeChannel = roomChannelOption(activeRoomChannel);
  const content = roomPostComposerOpen && hasRoomSession()
    ? `<form class="room-post-composer room-mobile-index__composer" data-room-post-composer novalidate>
        ${renderRoomPostChannelPicker()}
        <label class="ui-field room-post-composer__field" for="room-post-content">
          <span class="ui-field__label room-post-composer__prompt">hidn@room:~$ <b>say it</b><span class="room-post-composer__room"> · ${escapeHtml(roomDisplayName(activeChannel.label))}</span></span>
        <textarea id="room-post-content" rows="5" maxlength="${roomPostCharacterLimit()}" placeholder="Say the thing you can't say out loud.">${escapeHtml(roomPostText)}</textarea>
      </label>
        <p class="room-post-composer__note">${roomPostLimitCopy()}</p>
        ${renderRoomPostTipControls()}
        <div class="room-post-composer__actions">
          ${GhostButton({ label: "Cancel", dataAction: "room-post-cancel" })}
          ${SecondaryButton({ label: roomPostSubmitting ? "Proving and sending…" : "Transmit", disabled: roomPostSubmitting, dataAction: "room-post-submit" })}
        </div>
      </form>`
    : `<div class="room-mobile-index__create-actions">${renderSayItButton()}${renderRoomRefreshControl()}${renderRoomShareControl()}</div>`;

  return `<div class="room-mobile-index__create">
    ${content}
    ${roomChannelNotice ? `<p class="room-post-composer__error" role="status">${escapeHtml(roomChannelNotice)}</p>` : ""}
    ${roomPostError ? `<p class="room-post-composer__error" role="alert">${escapeHtml(roomPostError)}</p>` : ""}
  </div>`;
}

function renderRoomSpaceFrame(transmission: TransmissionView, index: number): string {
  const category = transmission.category ?? "UNSORTED";
  const horizontalOffset = Math.round((index - 3.5) * 18 * 10) / 10;
  const lane = index % 2 === 0 ? "left" : "right";
  const top = lane === "left" ? 24 : 34;
  return `<button class="room-space__frame${index === roomSpaceSelection ? " room-space__frame--active" : ""}" type="button" data-room-space-frame="${index}" style="--room-space-x: ${horizontalOffset}rem; --room-space-top: ${top}%;" aria-label="Open confession frame ${String(index + 1).padStart(2, "0")}, ${escapeHtml(category)}">
    <span class="room-space__frame-glass" aria-hidden="true"></span>
    <span class="room-space__frame-meta">FRAME ${String(index + 1).padStart(2, "0")} / ${escapeHtml(category)}</span>
    <span class="room-space__frame-title">OPEN<br /><em>SIGNAL</em></span>
    <span class="room-space__frame-cue">TAP TO READ</span>
  </button>`;
}

function renderRoomSpaceDetail(transmission: TransmissionView | undefined, index: number): string {
  if (!transmission) {
    return `<aside class="room-space__detail room-space__detail--empty" data-room-space-detail aria-live="polite">
      <span class="room-space__detail-label">MUSEUM SPACE</span>
      <p>No signals are mounted in this chamber yet.</p>
    </aside>`;
  }

  const threadHref = transmission.id ? `/c/${encodeURIComponent(transmission.id)}` : "";
  return `<aside class="room-space__detail" data-room-space-detail aria-live="polite">
    <div class="room-space__detail-topline">
      <span data-room-space-detail-category>${escapeHtml(transmission.category ?? "UNSORTED")}</span>
      <span data-room-space-detail-position>FRAME ${String(index + 1).padStart(2, "0")}</span>
    </div>
    <span class="room-space__detail-label">ANONYMOUS SIGNAL / ${escapeHtml(transmission.reference ?? "WITHOUT A NAME")}</span>
    <blockquote data-room-space-detail-text>“${escapeHtml(transmission.text)}”</blockquote>
    <div class="room-space__detail-footer">
      <time data-room-space-detail-time>${escapeHtml(formatTransmissionTime(transmission.time))}</time>
      ${threadHref ? `<a href="${escapeHtml(threadHref)}">OPEN THREAD <span aria-hidden="true">→</span></a>` : `<span>LOCAL SIGNAL</span>`}
    </div>
  </aside>`;
}

function renderRoomSpace(): string {
  const signalMode = activeHidnTheme() === "signal";
  const transmissions = roomHallTransmissions().slice(0, 8);
  const safeSelection = transmissions.length ? Math.min(roomSpaceSelection, transmissions.length - 1) : 0;
  roomSpaceSelection = safeSelection;

  return publicFrame(
    "/room",
    `<main id="main-content" class="public-main room-space-main">
      <div class="room-space" data-room-space tabindex="0" aria-label="Explore the HIDN museum space">
        <header class="room-space__header">
          <div>
            <a class="room-space__back" href="/room">← ROOM</a>
            ${TerminalLabel(signalMode ? "HIDN / MUSEUM SPACE" : "PRIVATE ROOM / GALLERY WING")}
            <h1>THE SPACE<br /><em>OF UNSAID THOUGHTS.</em></h1>
            <p>Walk the quiet hall. Frames wait along the walls. The thought is visible; the person stays hidden.</p>
          </div>
          <div class="room-space__header-status">
            ${renderRoomZcashStatus()}
            <span class="room-space__status-line"><i aria-hidden="true"></i> WING OPEN / ${String(Math.max(transmissions.length, 0)).padStart(2, "0")} FRAMES</span>
          </div>
        </header>
        <section class="room-space__experience" aria-label="HIDN museum hall">
          <div class="room-space__atmosphere" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="room-space__world">
            <div class="room-space__ceiling" aria-hidden="true"></div>
            <div class="room-space__wall room-space__wall--left" aria-hidden="true"></div>
            <div class="room-space__wall room-space__wall--right" aria-hidden="true"></div>
            <div class="room-space__floor" aria-hidden="true"></div>
            <div class="room-space__horizon" aria-hidden="true"><span></span></div>
            <a class="room-space__portal" href="/room/channel/general">
              <span>PORTAL / GENERAL ROOM</span>
              <strong>ENTER THE NEXT SPACE <b aria-hidden="true">→</b></strong>
            </a>
            <div class="room-space__frame-rail" data-room-space-rail style="--room-space-shift: ${(3.5 - safeSelection) * 18}rem;">
              ${transmissions.length ? transmissions.map(renderRoomSpaceFrame).join("") : ""}
            </div>
          </div>
          ${renderRoomSpaceDetail(transmissions[safeSelection], safeSelection)}
        </section>
        <footer class="room-space__controls" aria-label="Museum space controls">
          <div class="room-space__control-group">
            <button type="button" data-room-space-step="-1" aria-label="Move backward through the museum">←</button>
            <span data-room-space-status role="status" aria-live="polite">POSITION ${String(safeSelection + 1).padStart(2, "0")} / ${String(Math.max(transmissions.length, 1)).padStart(2, "0")}</span>
            <button type="button" data-room-space-step="1" aria-label="Move forward through the museum">→</button>
            <button type="button" data-room-space-reset>RETURN TO THRESHOLD</button>
          </div>
          <nav class="room-space__routes" aria-label="Museum space routes">
            <a href="/room/channel/general">OPEN LIVE ROOM <span aria-hidden="true">→</span></a>
            <a href="/room">RETURN TO ROOM <span aria-hidden="true">→</span></a>
          </nav>
        </footer>
        <p class="room-space__hint">DRAG OR SWIPE TO MOVE <span aria-hidden="true">·</span> TAP A FRAME TO READ <span aria-hidden="true">·</span> R / RETURN TO THRESHOLD</p>
      </div>
    </main>`,
    "public-page--explore public-page--room-space",
  );
}

// MARK: Room standings: rooms compete, people don't.

interface RoomStanding { channel: string; posts: number }
interface RoomStandings { resetsAt: string; rooms: RoomStanding[]; lastWeekWinner: RoomStanding | null }
let roomStandings: RoomStandings | null = null;
/** Whether the full room list under the desktop leaderboard is open. */
let deskBoardOpen = false;
let roomStandingsFetchedAt = 0;

async function refreshRoomStandings(): Promise<void> {
  if (Date.now() - roomStandingsFetchedAt < 60_000) return;
  roomStandingsFetchedAt = Date.now();
  try {
    const response = await fetch("/api/room/standings", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    roomStandings = (await response.json()) as RoomStandings;
    rerenderProductRoute();
  } catch {
    // The board is a bonus; the rooms work without it.
  }
}

function resetsIn(iso: string): string {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const days = Math.floor(ms / 86_400_000), hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function renderRoomStandings(compact = false): string {
  if (!roomStandings) {
    return compact
      ? `<p class="hidn-desk__muted">counting the room…</p>`
      : `<section class="hidn-standings" aria-label="Loudest rooms this week"><p class="hidn-standings__label">/// LOUDEST ROOMS THIS WEEK</p><p class="hidn-standings__quiet">&gt; counting the room…</p></section>`;
  }
  const rooms = roomStandings.rooms;
  const top = Math.max(1, ...rooms.map((room) => room.posts));
  const quiet = rooms.every((room) => room.posts === 0);
  const winner = roomStandings.lastWeekWinner;
  if (compact) {
    return `<div class="hidn-standings hidn-standings--compact">
      ${renderStandingsStage(roomStandings, (channel) => roomDisplayName(roomChannelOption(channel as RoomChannel).label))}
      <details class="hidn-standings__more" data-standings-more${deskBoardOpen ? " open" : ""}>
      <summary class="hidn-standings__toggle"><span data-when="closed">See all ${rooms.length} rooms ▾</span><span data-when="open">Hide rooms ▴</span></summary>
      <ol class="hidn-standings__list">
        ${rooms.map((room, index) => {
          const option = roomChannelOption(room.channel as RoomChannel);
          const width = Math.round((room.posts / top) * 100);
          return `<li><button class="hidn-standings__row${index === 0 && !quiet ? " hidn-standings__row--lead" : ""}" type="button" data-room-channel="${escapeHtml(room.channel)}" aria-label="${escapeHtml(option.label)}: ${room.posts} confessions this week. Open the room.">
            <span class="hidn-standings__rank">${String(index + 1).padStart(2, "0")}</span>
            <span class="hidn-standings__name">${escapeHtml(roomDisplayName(option.label))}</span>
            <span class="hidn-standings__count" data-standing-count="${escapeHtml(room.channel)}">${room.posts}</span>
            <span class="hidn-standings__bar" aria-hidden="true"><i data-standing-bar="${escapeHtml(room.channel)}" style="width: ${width}%"></i></span>
          </button></li>`;
        }).join("")}
      </ol>
      </details>
      <p class="hidn-desk__muted">rooms compete, people don't. resets in ${escapeHtml(resetsIn(roomStandings.resetsAt))}.</p>
    </div>`;
  }
  // Phone ROOMS page: one card (head, the live stage, the ranking folded away)
  // so the board doesn't push the room list down or repeat every room twice.
  return `<section class="hidn-standings hidn-standings--fold" aria-label="Loudest rooms this week">
    <div class="hidn-standings__head">
      <p class="hidn-standings__label">This week's race</p>
      <p class="hidn-standings__reset">resets in ${escapeHtml(resetsIn(roomStandings.resetsAt))}</p>
    </div>
    ${renderStandingsStage(roomStandings, (channel) => roomDisplayName(roomChannelOption(channel as RoomChannel).label))}
    ${quiet ? `<p class="hidn-standings__quiet">&gt; quiet week so far. put your room on the board.</p>` : ""}
    <details class="hidn-standings__more" data-standings-more${deskBoardOpen ? " open" : ""}>
      <summary class="hidn-standings__toggle"><span data-when="closed">See the ranking ▾</span><span data-when="open">Hide the ranking ▴</span></summary>
      <ol class="hidn-standings__list">
        ${rooms.map((room, index) => {
          const option = roomChannelOption(room.channel as RoomChannel);
          const width = Math.round((room.posts / top) * 100);
          return `<li>
            <button class="hidn-standings__row${index === 0 && !quiet ? " hidn-standings__row--lead" : ""}" type="button" data-room-channel="${escapeHtml(room.channel)}" aria-label="${escapeHtml(option.label)}: ${room.posts} confessions this week. Open the room.">
              <span class="hidn-standings__rank">${String(index + 1).padStart(2, "0")}</span>
              <span class="hidn-standings__name">${escapeHtml(roomDisplayName(option.label))}${index === 0 && !quiet ? ` <b>leading</b>` : ""}</span>
              <span class="hidn-standings__count" data-standing-count="${escapeHtml(room.channel)}">${room.posts}</span>
              <span class="hidn-standings__bar" aria-hidden="true"><i data-standing-bar="${escapeHtml(room.channel)}" style="width: ${width}%"></i></span>
            </button>
          </li>`;
        }).join("")}
      </ol>
      ${winner ? `<p class="hidn-standings__past">last week: <strong>${escapeHtml(roomChannelOption(winner.channel as RoomChannel).label)}</strong> won with ${winner.posts}.</p>` : ""}
    </details>
  </section>`;
}

/** Inside a room: where it stands this week. */
function renderRoomStandingChip(channel: string): string {
  if (!roomStandings) return "";
  const index = roomStandings.rooms.findIndex((room) => room.channel === channel);
  if (index < 0) return "";
  const room = roomStandings.rooms[index];
  const lead = index === 0 && room.posts > 0;
  const ahead = index > 0 ? roomStandings.rooms[index - 1] : undefined;
  const aheadName = ahead ? escapeHtml(roomDisplayName(roomChannelOption(ahead.channel as RoomChannel).label)) : "";
  const status = room.posts === 0
    ? "no confessions yet · be the first"
    : `${room.posts} ${room.posts === 1 ? "confession" : "confessions"}${lead ? " · leading" : ahead && ahead.posts === room.posts ? ` · tied with ${aheadName}` : ahead ? ` · ${ahead.posts - room.posts + 1} more to pass ${aheadName}` : ""}`;
  return `<p class="hidn-standing-chip${lead ? " hidn-standing-chip--lead" : ""}"><a href="/room/rooms">#${index + 1} this week</a> · ${status}</p>`;
}

function renderMobileRoomIndex(): string {
  const signalMode = activeHidnTheme() === "signal";
  const rooms = visibleRoomChannelOptions()
    .map((channel) => `<button class="room-mobile-index__room" type="button" data-room-channel="${channel.key}" aria-label="Open ${escapeHtml(channel.label)} room">
      <span class="room-mobile-index__copy"><strong>${escapeHtml(roomDisplayName(channel.label))}</strong><small>${escapeHtml(channel.description)}</small></span>
      <span class="room-mobile-index__arrow" aria-hidden="true">→</span>
    </button>`)
    .join("");

  return publicFrame(
    "/room/rooms",
    `<main id="main-content" class="public-main room-mobile-index-main">
      <div class="hidn-container--reading explore-page room-mobile-index">
        <header class="room-mobile-index__header">
          <p class="room-v2-path">hidn://rooms</p>
          <h1 class="hidn-glitch-title" data-text="Choose a r&nbsp;&nbsp;m">Choose a r<span class="room-directory-title__double-o">oo${renderRoomEyeWatcher("room-directory-title__watcher")}</span>m</h1>
          <p>Read quietly, or leave a thought without a name.</p>
          <p class="hidn-feed-log" aria-hidden="true">&gt; ls /rooms · ${visibleRoomChannelOptions().length} open · listening<span class="hidn-feed-log__caret">▌</span></p>
          <div class="room-mobile-index__status">${renderRoomZcashStatus()}</div>
          ${renderMobilePostSurface()}
        </header>
        ${isRoomDesktopViewport() ? "" : renderRoomStandings()}
        <section class="room-mobile-index__list" aria-label="Private rooms">
          <a class="room-mobile-index__lobby" href="/room/main">
            <span class="room-mobile-index__lobby-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg></span>
            <span class="room-mobile-index__copy"><strong>Walk the lobby</strong><small>A 3D museum where real posts hang on the walls</small></span>
            <span class="room-mobile-index__arrow" aria-hidden="true">→</span>
          </a>
          ${rooms}
        </section>
      </div>
    </main>`,
    "public-page--explore public-page--room-index",
  );
}

// Signed-out visitors who reach a private surface get a failed terminal
// connection, not a login wall: one way out, back to the homepage.
function renderConnectionLost(): string {
  return `<main id="main-content" class="public-main hidn-term-main hidn-lost-main">
    ${terminalWindow("hidn@room: ~/connect", `<div class="hidn-lost">
      <p class="hidn-lost__log">hidn@room:~$ ./connect --room</p>
      <p class="hidn-lost__log">[ .. ] RESOLVING PRIVATE CHANNEL</p>
      <p class="hidn-lost__log">[ .. ] REQUESTING ACCESS PROOF</p>
      <p class="hidn-lost__log hidn-lost__log--fail">[FAIL] NO KEY PRESENTED. CONNECTION REFUSED.</p>
      <h1 class="hidn-lost__title" data-text="CAN'T CONNECT">CAN'T CONNECT</h1>
      <p class="hidn-lost__line">&gt; THIS ROOM ONLY OPENS FOR THOSE WHO HOLD A KEY.</p>
      <a class="hidn-term__button hidn-lost__connect" href="/">[ CONNECT ]</a>
    </div>`, "hidn-term--lost")}
  </main>`;
}

function renderExplore(path = "/room"): string {
  const channelKey = roomChannelFromPath(path) ?? roomChannelFeedFromPath(path);
  const isChannelRoute = Boolean(channelKey);
  const signalMode = activeHidnTheme() === "signal";
  const channel = roomChannelOption(channelKey ?? activeRoomChannel);
  const headerLabel = signalMode
    ? (isChannelRoute ? `${channel.label} / PRIVATE CHANNEL` : "PRIVATE ROOM / OPEN THREADS")
    : (isChannelRoute ? "CURRENT ROOM / ANONYMOUS THREADS" : "PRIVATE ROOM / OPEN THREADS");
  const headerTitle = isChannelRoute ? roomDisplayName(channel.label) : "The room";
  // Inside a room: just its own line. Everyone already knows there are no names.
  const headerCopy = isChannelRoute
    ? channel.description.charAt(0).toUpperCase() + channel.description.slice(1) + "."
    : "Thoughts move through the room without names. Follow one thread or leave one behind.";

  if (!hasRoomSession()) {
    return publicFrame(
      path,
      renderConnectionLost(),
      "public-page--explore",
    );
  }

  if (isChannelRoute && isRoomDesktopViewport()) {
    const careRoom = channelKey ? roomLinkByKey(channelKey) : undefined;
    const care = careRoom ? roomNote(careRoom) : undefined;
    return publicFrame(
      path,
      renderDeskRoom(
        channel.key,
        `<p class="hidn-desk__label">hidn://rooms/${escapeHtml(roomLinkByKey(channel.key)?.slug ?? channel.key)}</p>
          <h1 id="room-channel-title" class="type-display-lg hidn-desk__title">${escapeHtml(headerTitle)}</h1>
          <p>${escapeHtml(headerCopy)}</p>
          ${renderRoomStandingChip(channel.key)}
          ${care ? `<p class="room-channel-care">${escapeHtml(care)}</p>` : ""}
          ${renderKeyReminder(roomAccountRecoveryCode)}`,
        `<section class="explore-feed" aria-labelledby="room-channel-title">
          ${renderExploreTabs()}
          <div class="explore-feed__list" id="explore-feed-list" aria-live="polite">${renderTransmissionRows(activeFeedTab)}</div>
        </section>`,
      ),
      `public-page--explore public-page--room-channel public-page--desk public-page--room-${channel.key}`,
    );
  }

  return publicFrame(
    path,
    `<main id="main-content" class="public-main explore-main">
      <div class="hidn-container--wide explore-page">
        <header class="explore-header">
          ${isChannelRoute ? `<a class="room-channel-back" href="/room/rooms">← All rooms</a>` : ""}
          ${isChannelRoute ? "" : TerminalLabel(headerLabel)}
          <h1${isChannelRoute ? ` id="room-channel-title"` : ""} class="type-display-lg hidn-desk__title">${escapeHtml(headerTitle)}</h1>
          <p>${escapeHtml(headerCopy)}</p>
          <p class="hidn-feed-log" aria-hidden="true">&gt; tail -f /rooms/${escapeHtml(roomLinkByKey(channel.key)?.slug ?? channel.key)} · listening<span class="hidn-feed-log__caret">▌</span></p>
          ${isChannelRoute ? renderRoomStandingChip(channel.key) : ""}
          ${channelKey && roomLinkByKey(channelKey) && roomNote(roomLinkByKey(channelKey)!) ? `<p class="room-channel-care">${escapeHtml(roomNote(roomLinkByKey(channelKey)!)!)}</p>` : ""}
          ${renderKeyReminder(roomAccountRecoveryCode)}
          ${isChannelRoute && !signalMode ? `<div class="room-channel-header__signals">${renderRoomZcashStatus()}</div>` : ""}
          ${isRoomMobileViewport() ? renderMobilePostSurface() : ""}
        </header>
        <div class="explore-layout">
          <section class="explore-feed" aria-labelledby="${isChannelRoute ? "room-channel-title" : "explore-feed-title"}">
            ${signalMode || !isChannelRoute ? `<div class="explore-feed__heading">
              <div>
                ${TerminalLabel("CURRENT ROOM / ANONYMOUS THREADS")}
                <h2 id="explore-feed-title" class="type-heading-2">// ${escapeHtml(roomChannelOption(activeRoomChannel).label)} / THOUGHTS IN MOTION</h2>
              </div>
              <div class="explore-feed__signals">${renderRoomZcashStatus()}</div>
            </div>` : ""}
            ${renderExploreTabs()}
            <div class="explore-feed__list" id="explore-feed-list" aria-live="polite">${renderTransmissionRows(activeFeedTab)}</div>
          </section>
          ${renderRoomDirectory()}
        </div>
      </div>
    </main>`,
    `public-page--explore${isChannelRoute ? ` public-page--room-channel public-page--room-${activeRoomChannel}` : ""}`,
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
            <header><span>reply ${String(index + 1).padStart(2, "0")}</span><time>${escapeHtml(reply.time)}</time></header>
            <p data-share-text data-share-id="${escapeHtml(id)}" data-share-kind="reply" data-share-index="${index}" data-share-label="${escapeHtml(`REPLY / ${String(index + 1).padStart(2, "0")}`)}" data-share-category="IDENTITY" data-share-time="${escapeHtml(reply.time)}">${escapeHtml(reply.text)}</p>
            <footer class="thread-room__message-actions">
              <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(id)}" data-reply-index="${index}">Save image</button>
              <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(id)}" data-reply-index="${index}">Share image</button>
              <button class="room-message__action" type="button" data-action="report-open" data-report-target-type="reply" data-report-target-id="${escapeHtml(`${id}:reply:${index}`)}" data-report-target-label="REPLY / ${String(index + 1).padStart(2, "0")}" data-report-target-excerpt="${escapeHtml(reply.text)}">Report</button>
              <span class="thread-share-status" data-share-status="${escapeHtml(`${id}:reply:${index}`)}" role="status" aria-live="polite"></span>
            </footer>
          </article>`,
        )
        .join("")
    : `<p class="thread-room__empty">No replies yet. Say something back.</p>`;

  return `<section class="thread-room" data-thread-root="${escapeHtml(id)}" aria-labelledby="thread-room-title">
    <header class="thread-room__header">
      <div>
        <h2 id="thread-room-title">Replies${replyCount ? ` · ${replyCount}` : ""}</h2>
      </div>
    </header>
    ${quotedText ? `<blockquote class="thread-room__quote" data-share-text data-share-id="${escapeHtml(id)}" data-share-kind="thread" data-share-label="ORIGINAL THREAD" data-share-category="IDENTITY" data-share-time="NOW">“${escapeHtml(quotedText)}”</blockquote>` : ""}
    <div class="thread-room__messages" aria-live="polite">${messages}</div>
    <form class="thread-room__composer${roomAccess ? "" : " thread-room__composer--locked"}" novalidate>
      <label class="ui-field thread-room__field" for="thread-reply-${escapeHtml(id)}">
        <span class="ui-field__label">Reply without a name</span>
        <textarea id="thread-reply-${escapeHtml(id)}" data-thread-input rows="4" maxlength="${roomReplyCharacterLimit()}" placeholder="${roomAccess ? "Say it back." : "Enter the room to reply anonymously."}"${roomAccess ? "" : " disabled"}></textarea>
      </label>
      <div class="thread-room__composer-footer">
        <span>${roomAccess ? "no name · no trail" : "room access required"}</span>
        ${SecondaryButton({ label: roomReplySubmitting ? "Proving and sending…" : roomAccess ? "Reply" : "Enter the room first", disabled: !roomAccess || roomReplySubmitting, dataAction: "thread-reply" })}
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
  const detailRoom = roomChannelOptions.find((room) => room.key === (livePost?.channel ?? confession?.channel));
  const detailRoomName = detailRoom ? roomDisplayName(detailRoom.label) : "";
  const metadata: HidnMetadata = {
    kind: "anonymous-confession",
    title: "An anonymous post · HIDN",
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
            ${livePost ? `<a class="hidn-detail__back" href="/room/channel/${escapeHtml(livePost.channel)}/feed">← ${escapeHtml(roomDisplayName(roomChannelOption(livePost.channel as RoomChannel).label))}</a>` : ""}
            <h1 class="hidn-detail__context">An anonymous post${detailRoomName ? ` in <b>${escapeHtml(detailRoomName)}</b>` : ""} <span aria-hidden="true">·</span> <time datetime="${escapeHtml(confession.time)}">${escapeHtml(confession.relativeTime)}</time></h1>
          </header>
          <article class="detail-card" aria-labelledby="detail-thought">
            <p class="hidn-detail__signed" aria-label="Signed: name withheld">signed <span class="hidn-detail__redact" aria-hidden="true"></span> name withheld</p>
            <p id="detail-thought" class="detail-card__thought" data-share-text data-share-id="${escapeHtml(confession.id)}" data-share-kind="thread" data-share-label="${escapeHtml(confession.reference)}" data-share-category="${escapeHtml(confession.category)}" data-share-time="${escapeHtml(confession.time)}">${escapeHtml(confession.text)}</p>
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
          <div class="detail-actions" aria-label="Post actions">
            <button class="room-message__action detail-actions__main" type="button" data-action="room-like" data-thread-id="${escapeHtml(confession.id)}" aria-pressed="${roomLikedIds.has(confession.id)}" aria-label="Like"${hasRoomSession() ? "" : " disabled"}><span aria-hidden="true">♡</span> ${escapeHtml(String(reactionCountForThread(confession.id, confession.reactions)))}</button>
            <a class="room-message__action detail-actions__main" href="#thread-reply-${escapeHtml(confession.id)}">Reply</a>
            <button class="room-message__action detail-actions__main" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(confession.id)}">Share</button>
            ${livePost?.tipAddress ? `<button class="room-message__action room-message__action--tip detail-actions__main" type="button" data-action="room-tip" data-thread-id="${escapeHtml(confession.id)}">Tip in ZEC</button>` : ""}
            <details class="detail-actions__more">
              <summary class="room-message__action detail-actions__main" aria-label="More actions">More</summary>
              <div class="detail-actions__menu">
                <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(confession.id)}">Save as image</button>
                <button class="room-message__action" type="button" data-action="thread-x-share" data-thread-id="${escapeHtml(confession.id)}">Post to X</button>
                <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">Quote in a reply</a>
                <button class="room-message__action detail-actions__report" type="button" data-action="report-open" data-report-target-type="thread" data-report-target-id="${escapeHtml(confession.id)}" data-report-target-label="${escapeHtml(confession.reference)}" data-report-target-excerpt="${escapeHtml(confession.text)}">Report</button>
              </div>
            </details>
          </div>
          <p class="thread-share-status thread-share-status--detail" data-share-status="${escapeHtml(confession.id)}" role="status" aria-live="polite"></p>
          ${roomReportNotice ? `<p class="thread-share-status thread-share-status--detail" role="status">${escapeHtml(roomReportNotice)}</p>` : ""}
          ${renderThreadRoom(confession.id)}

          ${actionLink("Back to the room", "/room", "ghost", "detail-back")}
        </div>
        ${renderReportDialog()}
      </main>`,
      "public-page--detail",
    ),
  };
}

function resetRoomRecoveryReveal(): void {
  if (roomRecoveryRevealTimer !== undefined) {
    window.clearTimeout(roomRecoveryRevealTimer);
    roomRecoveryRevealTimer = undefined;
  }

  roomRecoveryRevealMode = "hidden";
  roomRecoveryRevealError = "";
  roomRecoveryVerificationSubmitting = false;
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
  roomRecoveryConfirmations = [false, false];
  rerenderProductRoute();
}

async function verifyRoomRecoveryCheck(root: ParentNode): Promise<void> {
  if (roomRecoveryVerificationSubmitting) {
    return;
  }

  roomRecoveryConfirmations = [1, 2].map((index) => Boolean(root.querySelector<HTMLInputElement>(`#room-recovery-answer-${index}`)?.checked)) as [boolean, boolean];
  const answers = roomRecoveryConfirmations.map((confirmed) => confirmed ? "yes" : "");
  if (answers.some((answer) => !answer)) {
    roomRecoveryRevealError = "Confirm both recovery statements before revealing the key.";
    rerenderProductRoute();
    return;
  }

  // The key lives on this device, so the reveal is immediate; redraw so the
  // key actually appears.
  revealRoomRecoveryKeyTemporarily();
  rerenderProductRoute();
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
    roomAccountRecoveryCode = roomAnonymousIdentity.recoveryCode;
    return true;
  } catch {
    sessionStorage.removeItem(ROOM_ANONYMOUS_SESSION_STORAGE);
    return false;
  }
}

/** Ask for this member's current proof path. Enrolling an existing
 * commitment returns its place in the tree without adding a new member. */
async function refreshAnonymousWitness(): Promise<void> {
  if (!roomAnonymousIdentity) {
    throw new Error("The anonymous room session is not available. Return with your recovery key first.");
  }
  const enrollment = await enrollAnonymousMember({
    commitment: roomAnonymousIdentity.commitment,
    notificationCapability: roomAnonymousIdentity.notificationCapability,
  });
  roomAnonymousWitness = {
    root: enrollment.root,
    leafIndex: enrollment.leafIndex,
    pathElements: enrollment.pathElements,
    pathIndices: enrollment.pathIndices,
  };
  persistAnonymousSession();
}

async function registerAnonymousRoomAccess(recoveryCode = ""): Promise<void> {
  roomAnonymousSubmitting = true;
  roomLoginError = "";
  try {
    const status = await fetchAnonymousStatus();
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
    roomAccountRecoveryCode = identity.recoveryCode;
    roomAccountWasCreated = !recoveryCode;
    roomLoginError = "";
    persistAnonymousSession();
    if (recoveryCode) {
      navigateIntoRoom(ROOM_HOME_PATH, { portal: true });
    } else {
      roomAccessMode = "ready";
      revealRoomRecoveryKeyTemporarily();
    }
  } catch (error) {
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
  resetLinkInbox();
  resetKeyKeeper();
  profileView = null;
  stopRoomNotificationPolling();
  sessionStorage.removeItem("hidn:room:entered");
  sessionStorage.removeItem(ROOM_ANONYMOUS_SESSION_STORAGE);
  sessionStorage.removeItem(ROOM_SESSION_EXPIRES_AT_STORAGE);
  sessionStorage.removeItem(ROOM_ANONYMOUS_TIP_ADDRESS_STORAGE);
  // Sweep this tab's stored key along with anything an older build left.
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("hidn:account:") || /^hidn:room:(secret|backend-id|verified)$/.test(key)) {
      sessionStorage.removeItem(key);
    }
  }
  roomAccessMode = "choose";
  roomLoginError = "";
  roomLoginSubmitting = false;
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
  roomMuseumPostsByChannel = new Map();
  roomMuseumLoaded = false;
  roomMuseumRequest = undefined;
  roomThreadDetailRequests.clear();
  roomThreadDetailLoaded.clear();
  roomThreadDetailErrors.clear();
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
  roomVerificationNoticeOpen = false;
}

function restoreRoomAccountState(): void {
  restoreAnonymousSession();
}

// The only way in is a nameless key: a member holds their anonymous
// identity and its membership witness in this browser.
function hasRoomSession(): boolean {
  return !roomSessionIsExpired() && Boolean(roomAnonymousIdentity && roomAnonymousWitness);
}

/** The room's tabs, pinned to the top of the page. The bottom of a phone
 * screen belongs to the browser (iOS Safari floats its toolbar there), so
 * the tabs live where nothing covers them. */
function showsRoomTabs(path: string): boolean {
  return hasRoomSession() && (
    path === MIXED_FEED_PATH
    || Boolean(roomChannelSurfaceFromPath(path))
    || path === "/room/rooms"
    || path === "/room/profile"
    || path === "/room/inbox"
    || path === "/room"
    || path === "/room/main"
    || path === "/room/library"
    || path === "/room/orb"
    || path.startsWith("/c/")
  );
}

function isMuseumPath(path: string): boolean {
  return path === "/room" || path === "/room/main" || path === "/room/library" || path === "/room/orb" || Boolean(roomChannelFromPath(path));
}

function renderRoomTabs(path: string): string {
  const inboxUnread = linkInboxUnreadCount();
  const meUnread = roomNotifications?.unreadCount ?? 0;
  const badge = (count: number): string => (count > 0 ? `<b class="hidn-tabs__badge" aria-label="${count} new">${count > 99 ? "99+" : count}</b>` : "");
  const icon = (d: string): string => `<svg class="hidn-tabs__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  const item = (href: string, label: string, active: boolean, d: string, extra = "", className = ""): string =>
    `<a class="hidn-tabs__item${className}${active ? " hidn-tabs__item--active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}>${icon(d)}<span>${label}</span>${extra}</a>`;
  // On phones the tabs become a bottom dock with "say it" in the middle; the
  // lobby moves to the menu and the top of ROOMS there, so its tab is desktop-only.
  return `<nav class="hidn-tabs" aria-label="Room">
    ${item(MIXED_FEED_PATH, "Feed", path === MIXED_FEED_PATH || path.startsWith("/c/"), "M4 6h16M4 12h16M4 18h10")}
    ${item("/room/rooms", "Rooms", path === "/room/rooms" || Boolean(roomChannelFeedFromPath(path)), "M5 3h14v18H5zM15 12h.01")}
    <button class="hidn-tabs__say" type="button" data-action="room-dock-say" aria-label="Say it">&gt;_</button>
    ${item("/room/main", "Lobby", isMuseumPath(path), "M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6", "", " hidn-tabs__item--lobby")}
    ${item("/room/inbox", "Inbox", path === "/room/inbox", "M3 6h18v12H3zM3 7l9 6 9-6", badge(inboxUnread))}
    ${item("/room/profile", "Me", path === "/room/profile", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6", badge(meUnread))}
  </nav>`;
}

/** "THINGS I'VE NEVER TOLD ANYONE" → "Things I've never told anyone". */
function roomDisplayName(label: string): string {
  const lower = label.toLowerCase().replace(/\bi\b/g, "I").replace(/\bzec\b/g, "ZEC");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Where members land: the feed, so reading and posting come first. The 3D
 * museum is one tap away in the bottom bar and the channels menu. */
const ROOM_HOME_PATH = "/room/feed";

/** Set when someone arrives from a shared room link: open its composer. */
let openComposerOnArrival = false;

/** Opens a room's composer, going to the room first if needed. */
function openComposerIn(key: string): void {
  const target = `/room/channel/${key}/feed`;
  if (normalizePath(window.location.pathname) !== target) navigateProductRoute(target);
  document.querySelector<HTMLButtonElement>('[data-action="room-create-post"]')?.click();
  window.setTimeout(() => {
    const composer = document.querySelector<HTMLElement>("[data-room-post-composer]");
    composer?.scrollIntoView({ behavior: "smooth", block: "center" });
    composer?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }, 80);
}

function navigateIntoRoom(path = ROOM_HOME_PATH, options: { portal?: boolean } = {}): void {
  sessionStorage.setItem("hidn:room:entered", "true");
  // Arriving from a shared room link: go to that room and start writing.
  if (path === ROOM_HOME_PATH) {
    const intent = takeRoomIntent();
    if (intent) {
      path = `/room/channel/${intent}/feed`;
      openComposerOnArrival = true;
    }
  }
  // After creating or recovering access, the visitor falls through a portal.
  if (options.portal) {
    void playPortal().then(() => navigateProductRoute(path));
    return;
  }
  navigateProductRoute(path);
}

function renderRoomAccessError(): string {
  return roomLoginError ? `<p class="hidn-auth__error" role="alert">${escapeHtml(roomLoginError)}</p>` : "";
}

function renderRoomAccessChooser(): string {
  return `<div class="hidn-auth" data-hidn-type-panel>
    <span class="hidn-auth__eyes" aria-hidden="true"><i></i><i></i></span>
    <h1 class="hidn-auth__title">Get in without a name.</h1>
    <p class="hidn-auth__lead">No email, no phone number, no username. A private key is your way in.</p>
    ${renderRoomAccessError()}
    <div class="hidn-auth__choices" data-hidn-type-reveal>
      <button class="hidn-auth__choice hidn-auth__choice--new" type="button" data-action="room-create-account"${roomAnonymousSubmitting ? " disabled" : ""}>
        <span class="hidn-auth__choice-head"><b>I'm new here</b><i aria-hidden="true">→</i></span>
        <span class="hidn-auth__choice-copy">Get a private key in one tap. It's made in this browser and stays with you.</span>
        <span class="hidn-auth__choice-cta">${roomAnonymousSubmitting ? "Making your key…" : "Get my key"}</span>
      </button>
      <button class="hidn-auth__choice" type="button" data-action="room-login">
        <span class="hidn-auth__choice-head"><b>I have a key</b><i aria-hidden="true">→</i></span>
        <span class="hidn-auth__choice-copy">Paste it, or let your password manager fill it in.</span>
      </button>
    </div>
    <aside class="hidn-auth__note">
      <p class="hidn-auth__note-label">zero knowledge</p>
      <p>HIDN can check that you're a member. It can never tell which member you are.</p>
      <a href="/how-it-works">How it works →</a>
    </aside>
  </div>`;
}

function renderRoomCreate(): string {
  return `<div class="hidn-auth" data-hidn-type-panel>
    <h1 class="hidn-auth__title">Make your key.</h1>
    <p class="hidn-auth__lead">HIDN makes a private key in this browser. No username, no handle, no public identity. Save it when it appears: nobody can recover it for you.</p>
    ${renderRoomAccessError()}
    <div class="hidn-auth__row" data-hidn-type-reveal>
      ${GhostButton({ label: "Back", dataAction: "room-back" })}
      ${SecondaryButton({ label: roomAnonymousSubmitting ? "Making your key…" : "Make my key", disabled: roomAnonymousSubmitting, dataAction: "room-create-account" })}
    </div>
  </div>`;
}

function renderRoomLogin(): string {
  const busy = roomLoginSubmitting || roomAnonymousSubmitting;
  return `<div class="hidn-auth" data-hidn-type-panel>
    <h1 class="hidn-auth__title">Welcome back.</h1>
    <p class="hidn-auth__lead">Your key opens the room. Nothing else about you is asked.</p>
    ${renderRoomAccessError()}
    <form class="room-login-card hidn-auth__form" data-room-login-form action="/room/access" method="post" autocomplete="on" novalidate>
      <input class="hidn-key__sr" type="text" name="username" autocomplete="username" value="${KEY_CREDENTIAL_NAME}" readonly tabindex="-1" aria-hidden="true" />
      ${canReadSavedKey() ? `<button class="hidn-auth__btn hidn-auth__btn--primary" type="button" data-action="room-login-saved">Use my saved key</button>
      <p class="hidn-auth__hint">Your phone or browser fills it in if you saved it to passwords.</p>
      <p class="hidn-auth__divider"><span>or paste it</span></p>` : ""}
      <label class="hidn-auth__label" for="room-login-recovery-code">Your key</label>
      <div class="hidn-auth__field">
        <input id="room-login-recovery-code" name="password" type="password" placeholder="HIDN-ANON-…" autocomplete="current-password" spellcheck="false" autocapitalize="characters" />
        <button type="button" class="hidn-auth__show" data-key-show aria-pressed="false">Show</button>
      </div>
      <p class="hidn-auth__hint">Tap the box: if you saved your key to passwords, it can fill itself in.</p>
      ${SecondaryButton({ label: busy ? "Checking your key…" : "Enter the room", disabled: busy, dataAction: "room-submit-login", className: "hidn-auth__submit" })}
    </form>
    <aside class="hidn-auth__note">
      <p class="hidn-auth__note-title">Lost your key?</p>
      <p>It can't be recovered. That's what keeps you anonymous. You can start again with a new key.</p>
      <button type="button" class="hidn-auth__link" data-action="room-create-account">Get a new key →</button>
    </aside>
  </div>`;
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
  const label = "RECOVERY KEY / CONFIRM OWNERSHIP";
  const note = "Confirm both statements. The recovery key will be visible for 20 seconds only.";

  return `<form class="${className}" data-room-recovery-form novalidate>
      <span class="room-access-key__label">${label}</span>
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

  return "";
}

function renderRoomReady(): string {
  const isNewAccount = roomAccountWasCreated;
  const keySaved = isKeySaved(roomAccountRecoveryCode);
  if (!isNewAccount) {
    return `<div class="hidn-auth">
      <span class="hidn-auth__eyes" aria-hidden="true"><i></i><i></i></span>
      <h1 class="hidn-auth__title">You're in.</h1>
      <p class="hidn-auth__lead">${roomAnonymousIdentity?.alias ? `Today you're <b class="hidn-auth__alias">${escapeHtml(roomAnonymousIdentity.alias)}</b>. The name changes every visit.` : "Head into the room to read, post and reply."}</p>
      ${roomAnonymousIdentity ? renderRoomRecoveryPanel() : ""}
      ${SecondaryButton({ label: "Go to the room", className: "room-ready-enter hidn-auth__submit", dataAction: "room-enter" })}
    </div>`;
  }

  return `<div class="hidn-auth">
    <p class="hidn-auth__step">step 2 of 2</p>
    <h1 class="hidn-auth__title">This is your key.</h1>
    <p class="hidn-auth__lead">It's your only way back in. There's no email and no reset, so if you lose it, nobody can recover it. Not even us.</p>
    ${roomAnonymousIdentity && roomAccountRecoveryCode ? renderKeySaveCard(roomAccountRecoveryCode) : ""}
    <div class="hidn-auth__enter">
      <label class="hidn-auth__ack">
        <input type="checkbox" data-key-ack${keySaved ? " checked" : ""} />
        <span>I've saved my key somewhere safe</span>
      </label>
      ${SecondaryButton({ label: "Enter the room", className: "room-ready-enter hidn-auth__submit", dataAction: "room-enter", disabled: !keySaved })}
      ${keySaved ? "" : `<button type="button" class="hidn-auth__skip" data-action="room-enter">Skip for now. I understand I could lose access.</button>`}
    </div>
  </div>`;
}

function renderProfileTipAddress(): string {
  if (!roomTipAddressLoaded) {
    return `<section class="room-profile-card room-profile-card--tips" aria-labelledby="room-profile-tips-title" aria-busy="true">
      ${TerminalLabel("zec tips · optional")}
      <h2 id="room-profile-tips-title">Get tipped in ZEC</h2>
      <p class="room-profile-card__note">Reading your tip address…</p>
    </section>`;
  }

  return `<section class="room-profile-card room-profile-card--tips" aria-labelledby="room-profile-tips-title">
    ${TerminalLabel("zec tips · optional")}
    <h2 id="room-profile-tips-title">Get tipped in ZEC</h2>
    <p class="room-profile-card__note">Paste a private (shielded) Zcash address from your wallet. Your new posts get a "Tip in ZEC" button, and tips go straight to you. HIDN never holds any money.</p>
    <form class="room-tip-address-form" data-room-tip-address-form novalidate>
      <label class="ui-field" for="room-tip-address">
        <span class="ui-field__label">Your shielded address (optional)</span>
        <input id="room-tip-address" type="text" value="${escapeHtml(roomTipAddressDraft)}" placeholder="u1..." autocomplete="off" spellcheck="false" maxlength="500" />
      </label>
      <p class="room-tip-address-form__hint">Only shielded mainnet addresses beginning with <code>u1</code> or <code>zs1</code> are accepted. Leave it empty to turn tips off for future posts.</p>
      ${roomTipAddressError ? `<p class="room-tip-address-form__feedback room-tip-address-form__feedback--error" role="alert">${escapeHtml(roomTipAddressError)}</p>` : ""}
      ${roomTipAddressFeedback ? `<p class="room-tip-address-form__feedback" role="status">${escapeHtml(roomTipAddressFeedback)}</p>` : ""}
      ${SecondaryButton({ label: roomTipAddressSaving ? "Saving…" : "Save tip address", type: "submit", disabled: roomTipAddressSaving, dataAction: "room-tip-address-save" })}
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

function renderProfilePost(post: DeviceSignalPost): string {
  return `<article class="room-profile-history__item">
    <header><span>${escapeHtml(roomDisplayName(roomChannelOption(post.channel as RoomChannel).label))}</span><time>${escapeHtml(formatTransmissionTime(post.time))}</time></header>
    <p>${escapeHtml(post.text)}</p>
    <footer><span>post</span><span>${escapeHtml(contentStatusLabel(post.status).toLowerCase())}</span></footer>
  </article>`;
}

function renderProfileComment(comment: RoomComment): string {
  return `<article class="room-profile-history__item">
    <header><span>reply in ${escapeHtml(roomDisplayName(roomChannelOption(comment.channel as RoomChannel).label))}</span><time>${escapeHtml(formatTransmissionTime(comment.time))}</time></header>
    <p>${escapeHtml(comment.text)}</p>
    <footer><span>reply</span><span>${escapeHtml(contentStatusLabel(comment.status).toLowerCase())}</span></footer>
  </article>`;
}

function renderZecVerificationNotice(): string {
  if (!roomVerificationNoticeOpen) {
    return "";
  }

  // Verification is not live yet, so the sheet says so plainly instead of pretending to work.
  return `<div class="hidn-verification-notice hidn-verify-sheet" data-zec-verification-notice role="dialog" aria-modal="true" aria-labelledby="hidn-verification-notice-title">
    <button class="hidn-verification-notice__backdrop" type="button" data-action="room-verification-notice-close" aria-label="Close"></button>
    <section class="hidn-verify-sheet__panel">
      <header class="hidn-verify-sheet__head">
        <span class="hidn-verify-sheet__badge"><i aria-hidden="true"></i>Coming soon</span>
        <button class="hidn-verify-sheet__close" type="button" data-action="room-verification-notice-close" aria-label="Close">×</button>
      </header>
      <span class="hidn-verify-sheet__coin" aria-hidden="true">ⓩ</span>
      <h2 id="hidn-verification-notice-title" class="hidn-verify-sheet__title">Verify with ZEC</h2>
      <p class="hidn-verify-sheet__lead">A private Zcash payment will unlock extra features for your key, without ever attaching a name to it.</p>
      <ul class="hidn-verify-sheet__steps" aria-label="How it will work">
        <li><b>Shielded</b><span>You pay from a shielded Zcash wallet, so the payment stays private.</span></li>
        <li><b>Still anonymous</b><span>Verifying never asks for a name, email or phone number.</span></li>
        <li><b>Nothing changes until then</b><span>Your room works exactly as it does now.</span></li>
      </ul>
      <p class="hidn-verify-sheet__status"><span aria-hidden="true"></span>Being built. It isn't live yet, so nothing can be paid here today.</p>
      <button class="hidn-verify-sheet__btn" type="button" data-action="room-verification-notice-close">Got it</button>
    </section>
  </div>`;
}

// The ME page: who you are today, then one of three tabs at a time.
type ProfileView = "posts" | "key" | "settings";
let profileView: ProfileView | null = null;
let profileHistoryView: "posts" | "comments" = "posts";

function renderProfileKey(): string {
  if (!roomAccountRecoveryCode) {
    return `<section class="hidn-me__panel">
      <p class="hidn-me__label">Your key · not in this session</p>
      <p class="hidn-me__note">Your key isn't stored in this tab. Leave the room and sign back in with the key you saved, and it will show here.</p>
    </section>`;
  }
  // Not saved yet: the save options come first, with the key in view.
  if (!isKeySaved(roomAccountRecoveryCode) || keyJustSaved()) {
    return renderKeySaveCard(roomAccountRecoveryCode);
  }
  if (roomRecoveryRevealMode === "visible") {
    return `<section class="hidn-me__panel hidn-me__panel--key" aria-live="polite">
      <p class="hidn-me__label">Your key · visible for 20 seconds</p>
      <button class="hidn-me__key" type="button" data-action="room-copy-recovery-key" aria-label="Copy your key"><code>${escapeHtml(roomAccountRecoveryCode)}</code><span>tap to copy</span></button>
      <div class="hidn-me__countdown" aria-hidden="true"><i></i></div>
      <p class="hidn-me__note">Make sure nobody is looking at your screen. It hides itself again.</p>
    </section>`;
  }
  return `<section class="hidn-me__panel">
    <p class="hidn-me__label">Your key · hidden</p>
    <p class="hidn-me__note">Your key is your account. Show it only when nobody is looking.</p>
    ${SecondaryButton({ label: "Show my key for 20 seconds", dataAction: "room-key-show" })}
  </section>`;
}

function renderProfileActivity(posts: DeviceSignalPost[], comments: RoomComment[]): string {
  const showPosts = profileHistoryView === "posts";
  const list = showPosts
    ? (posts.length ? posts.map(renderProfilePost).join("") : `<p class="room-profile-history__empty">Nothing posted from this device yet.</p>`)
    : (comments.length ? comments.map(renderProfileComment).join("") : `<p class="room-profile-history__empty">No replies from this device yet.</p>`);
  return `<section class="hidn-me__panel">
    <div class="hidn-me__switch" role="tablist" aria-label="History">
      <button type="button" role="tab" aria-selected="${showPosts}" data-action="profile-history" data-view="posts">Posts (${posts.length})</button>
      <button type="button" role="tab" aria-selected="${!showPosts}" data-action="profile-history" data-view="comments">Replies (${comments.length})</button>
    </div>
    <div class="room-profile-history__list">${list}</div>
    <p class="hidn-me__note">Kept on this device only.</p>
  </section>`;
}

function renderProfilePfp(): string {
  const entry = maskEntry();
  return `<section class="hidn-me__panel hidn-me__pfp">
    <p class="hidn-me__label">Your HIDN profile picture</p>
    <p class="hidn-me__note">Turn your profile picture into a HIDN one: redacted, watcher eyes or terminal glow. Your photo is edited on this device and never uploaded.</p>
    <a class="hidn-me__pfp-link" href="${entry.href}">${escapeHtml(entry.label.charAt(0).toUpperCase() + entry.label.slice(1).toLowerCase())} →</a>
  </section>`;
}

function renderProfileBody(
  profileLabel: string,
  profileStats: ReturnType<typeof deviceSignalStats>,
  posts: DeviceSignalPost[],
  comments: RoomComment[],
): string {
  const keyUnsaved = Boolean(roomAccountRecoveryCode) && !isKeySaved(roomAccountRecoveryCode);
  if (profileView === null) {
    profileView = keyUnsaved || window.location.hash === "#key" ? "key" : "posts";
  }
  const tab = (view: ProfileView, label: string, alert = false): string =>
    `<button class="hidn-me__tab${profileView === view ? " hidn-me__tab--active" : ""}" type="button" role="tab" aria-selected="${profileView === view}" data-action="profile-view" data-view="${view}">${label}${alert ? ` <b aria-label="not saved">●</b>` : ""}</button>`;
  const panel = profileView === "key"
    ? renderProfileKey()
    : profileView === "settings"
      ? `${renderProfileTipAddress()}
        <section class="hidn-me__panel">
          <p class="hidn-me__label">Verify with ZEC</p>
          <p class="hidn-me__note">A private ZEC payment will unlock extra features. Coming soon.</p>
          ${GhostButton({ label: "See how it will work", dataAction: "room-open-verification" })}
        </section>`
      : `${renderProfilePfp()}${renderProfileActivity(posts, comments)}`;
  return `<header class="hidn-me">
      <p class="hidn-access__code">hidn://me</p>
      <div class="hidn-me__who">
        <h1>${escapeHtml(profileLabel)}</h1>
        ${StatusIndicator("Signed in", "online", true)}
      </div>
      <p class="hidn-me__sub">today's name · changes every visit</p>
      <p class="hidn-me__stats">${profileStats.posts} ${profileStats.posts === 1 ? "post" : "posts"} · ${profileStats.comments} ${profileStats.comments === 1 ? "reply" : "replies"} · ${profileStats.likes} ${profileStats.likes === 1 ? "like" : "likes"}</p>
    </header>
    <div class="hidn-me__tabs" role="tablist" aria-label="Me">
      ${tab("posts", "My posts")}
      ${tab("key", "My key", keyUnsaved)}
      ${tab("settings", "Settings")}
    </div>
    ${panel}`;
}

function renderRoomProfile(): RenderedProductRoute {
  restoreRoomAccountState();
  if (!hasRoomSession()) {
    return {
      metadata: ROOM_METADATA,
      html: publicFrame(
        "/room/profile",
        renderConnectionLost(),
        "public-page--room public-page--room-profile",
      ),
    };
  }

  const profileLabel = roomAnonymousIdentity?.alias || "ANONYMOUS ACCESS";
  const deviceHistory = loadDeviceSignalHistory();
  const posts = deviceHistory.posts;
  const comments = deviceHistory.comments;
  const profileStats = deviceSignalStats(deviceHistory);

  return {
    metadata: {
      ...ROOM_METADATA,
      title: "Private profile · HIDN",
      description: "A private HIDN profile for recovery access and personal room history.",
      canonicalPath: "/room/profile",
    },
    html: publicFrame(
      "/room/profile",
      `<main id="main-content" class="public-main room-main room-profile-main hidn-term-main">
        ${terminalWindow("hidn@room: ~/profile", `<div class="room-profile-page hidn-profile">
          ${renderProfileBody(profileLabel, profileStats, posts, comments)}
        </div>`, "hidn-term--access hidn-term--profile")}
        ${renderZecVerificationNotice()}
      </main>`,
      "public-page--room public-page--room-profile",
    ),
  };
}

function renderRoomLinkInbox(): RenderedProductRoute {
  return {
    metadata: {
      ...ROOM_METADATA,
      title: "Your link · HIDN",
      description: "Your anonymous HIDN link and the messages left through it.",
      canonicalPath: "/room/inbox",
    },
    html: publicFrame(
      "/room/inbox",
      `<main id="main-content" class="public-main room-main hidn-term-main">
        ${terminalWindow("hidn@room: ~/inbox", renderLinkInboxBody(), "hidn-term--access hidn-term--link")}
      </main>`,
      "public-page--room public-page--room-profile",
    ),
  };
}

/** The public page behind a member's link: anyone can write, no session. */
function renderLinkSendRoute(path: string, slug: string): RenderedProductRoute {
  return {
    metadata: {
      ...HOME_METADATA,
      title: "Say it. No names. · HIDN",
      description: "Someone opened a room for you. Leave them a message without a name.",
      canonicalPath: path,
    },
    html: publicFrame(
      path,
      `<main id="main-content" class="public-main room-main hidn-term-main">
        ${terminalWindow(`hidn@room: ~/to/${slug}`, renderLinkSendBody(slug), "hidn-term--access hidn-term--link")}
      </main>`,
      "public-page--room public-page--public-read",
    ),
  };
}

function renderMaskRoute(): RenderedProductRoute {
  const description = "Go anonymous: 12 masks for your profile picture, from neon eyes to CCTV. Made on your device; your photo is never uploaded or stored.";
  return {
    metadata: {
      ...HOME_METADATA,
      title: "Go anonymous · HIDN",
      description,
      canonicalPath: MASK_PATH,
      structuredData: webPageStructuredData("Go anonymous · HIDN", description, MASK_PATH),
    },
    html: publicFrame(
      MASK_PATH,
      `<main id="main-content" class="public-main mask-main">${renderMaskBody()}</main>`,
      "public-page--room public-page--public-read",
    ),
  };
}

function renderRoomAccess(): RenderedProductRoute {
  restoreRoomAccountState();
  // "I have a key" on the homepage lands straight on the log-in screen.
  if (roomAccessMode === "choose" && window.location.hash === "#login") {
    roomAccessMode = "login";
  }
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
      `<main id="main-content" class="public-main room-main room-access-main hidn-auth-main">
        <header class="hidn-auth__top">
          <a class="hidn-auth__back" href="/" aria-label="Back to the homepage">←</a>
          <a class="hidn-home__logo" href="/" aria-label="HIDN home">&gt;hidn</a>
          <span class="hidn-auth__sound">${renderAmbientAudioToggle()}</span>
        </header>
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
      body: "HIDN keeps personal identity out of the conversation. Room access uses a nameless recovery key that never leaves your browser; your private history stays on your device. Privacy controls are described concretely rather than as a promise of universal anonymity.",
    };
  }

  return {
    eyebrow: "HIDN / HOW IT WORKS",
    title: "THE PERSON STAYS OUT OF FRAME.",
    copy: "Learn how HIDN supports anonymous thoughts with pseudonymous room access and privacy-first design.",
    body: "The public flow is intentionally small: set up private access or return with a recovery key, enter the room, then read or leave an anonymous thought. Account access and room verification stay separate from the first step into the room.",
  };
}

/** How it works, in plain words: the four steps, the extras, why it is
 * anonymous, and what HIDN can and cannot see. */
function renderHowItWorks(): RenderedProductRoute {
  const description = "How HIDN works: get a key, pick a room, say it with no name. What HIDN never sees.";
  const step = (number: string, title: string, body: string, note = "") => `<li class="hidn-how__step">
      <span class="hidn-how__num" aria-hidden="true">${number}</span>
      <div><h3>${title}</h3><p>${body}</p>${note ? `<p class="hidn-how__note">${note}</p>` : ""}</div>
    </li>`;
  const extra = (title: string, body: string) => `<div class="hidn-how__card"><h3>${title}</h3><p>${body}</p></div>`;
  const rooms = roomChannelOptions.map((channel) => escapeHtml(roomDisplayName(roomLinkByKey(channel.key)?.title ?? channel.label))).join(" · ");
  return {
    metadata: {
      kind: "public-page",
      title: "How it works · HIDN",
      description,
      canonicalPath: "/how-it-works",
      structuredData: webPageStructuredData("How it works · HIDN", description, "/how-it-works"),
    },
    html: publicFrame(
      "/how-it-works",
      `<main id="main-content" class="public-main hidn-how">
        <div class="hidn-how__wrap">
          <header class="hidn-how__head">
            <p class="room-v2-path">hidn://how-it-works</p>
            <h1>Say it. No names.</h1>
            <p class="hidn-how__lead">HIDN is a place to say what you can't say anywhere else. Nobody sees who you are: not other people, and not us.</p>
          </header>

          <section aria-labelledby="hidn-how-steps">
            <h2 id="hidn-how-steps" class="hidn-how__label">In 4 steps</h2>
            <ol class="hidn-how__steps">
              ${step("01", "Get your key", "Tap Enter the room. Your browser makes a key for you. No email, no phone number, no username, no password.", "Save your key. It's the only way back in, and if you lose it, nobody can get it back for you. You stay in for an hour on that tab; after that, paste your key to come back.")}
              ${step("02", "Pick a room", `Read the Feed, which mixes every room, or pick one: ${rooms}.`)}
              ${step("03", "Say it", "Write up to 500 characters and post. No name is attached. Links aren't allowed, so say it in words.")}
              ${step("04", "Talk back", "Reply, like (once per post), or share a post as an image. Everyone stays anonymous, including you.")}
            </ol>
          </section>

          <section aria-labelledby="hidn-how-extras">
            <h2 id="hidn-how-extras" class="hidn-how__label">Also</h2>
            <div class="hidn-how__cards">
              ${extra("Your private link", "Get your own link and share it. Anyone can send you an anonymous message through it, up to 120 a day. You read them in Inbox.")}
              ${extra("Tips in ZEC", `Love a post? Tip it in Zcash, straight from your wallet to theirs. HIDN never touches the money. <a href="#tips">How tips work ↓</a>`)}
              ${extra("The lobby", "Walk a 3D museum where real posts hang on the walls. Open Lobby and look around.")}
            </div>
          </section>

          <section id="tips" class="hidn-how__tips" aria-labelledby="hidn-how-tips">
            <h2 id="hidn-how-tips" class="hidn-how__label">Tips in ZEC</h2>
            <ol class="hidn-how__steps">
              ${step("01", "Turn tips on", "When you post, tick Allow tips on this post and add your shielded Zcash address. You can also save a default address in Me, under Get tipped in ZEC.")}
              ${step("02", "Readers tip from their wallet", "Readers tap Tip in ZEC on your post and pay from their own wallet straight to yours. HIDN never holds, sends or sees the money.")}
              ${step("03", "It stays private", "Use a shielded address (it starts with u1), so the payment stays private on Zcash. Nobody learns who you are from a tip.", "Using the same address on many posts can make those posts easier to link together. A different address per post keeps them apart.")}
              ${step("04", "Tips on your private link", "Your private link can take tips too. Each tipped message shows a code, and the same code arrives in the payment memo, so you know which message it was for.")}
            </ol>
          </section>

          <section aria-labelledby="hidn-how-why">
            <h2 id="hidn-how-why" class="hidn-how__label">How can it be anonymous?</h2>
            <p class="hidn-how__text">When you post, your browser proves you hold a HIDN key without showing which key. This is called a zero-knowledge proof. HIDN can check that a real member posted, but it can't tell which member it was.</p>
            <p class="hidn-how__text">Your posts aren't linked to each other either, and the ANON name on your profile changes every visit. HIDN is built on Zcash, which uses the same kind of proof to keep payments private.</p>
          </section>

          <section aria-labelledby="hidn-how-sees">
            <h2 id="hidn-how-sees" class="hidn-how__label">What HIDN never sees</h2>
            <div class="hidn-how__sees">
              <div class="hidn-how__col hidn-how__col--never">
                <ul>
                  <li>Your name, email or phone number. We never ask.</li>
                  <li>Which member wrote a post.</li>
                  <li>Your key. It stays in your browser.</li>
                </ul>
              </div>
            </div>
          </section>

          <section aria-labelledby="hidn-how-rules">
            <h2 id="hidn-how-rules" class="hidn-how__label">House rules</h2>
            <p class="hidn-how__text">No real names of other people. No links. No threats. Anyone can report a post, and reported posts can be hidden. If you're in danger, please reach a local helpline or someone you trust.</p>
          </section>

          <div class="hidn-how__cta">
            <a class="hidn-how__btn hidn-how__btn--primary" href="/room/access">Enter the room</a>
            <a class="hidn-how__btn" href="/read">Read first</a>
          </div>
        </div>
      </main>`,
      "public-page--placeholder public-page--how-it-works",
    ),
  };
}

function renderPlaceholder(path: string): RenderedProductRoute {
  const page = placeholderForPath(path);
  const title = path === "/manifesto" ? "Manifesto" : path === "/privacy" ? "Privacy" : "How it works";
  return {
    metadata: {
      kind: "public-page",
      title: `${title} · HIDN`,
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
      title: "Not found · HIDN",
      description: "The requested HIDN surface is not available.",
      canonicalPath: "/",
    },
    html: publicFrame(
      "/",
      `<main id="main-content" class="public-main hidn-404">
        <section class="hidn-404__screen" aria-labelledby="hidn-404-title">
          <p class="hidn-404__code">/// 404</p>
          <h1 id="hidn-404-title">THE QUESTION IS: ARE YOU SURE YOU'RE IN THE RIGHT PLACE?</h1>
          <a class="hidn-404__restart" href="/">[ START OVER ]</a>
          <p class="hidn-dotmatrix hidn-404__home" aria-hidden="true">There's no place like<br />HIDN://ROOM</p>
        </section>
      </main>`,
      "public-page--detail public-page--404",
    ),
  };
}

// The private main room hangs the newest real posts from every room, each
// linked to its thread. The public foyer cannot read private rooms, so it
// keeps sample walls and offers the way in instead of a thread link.
function homeMuseumPosts(privateFoyer = false): MuseumPost[] {
  if (privateFoyer && hasRoomSession()) {
    const byId = new Map<string, RoomPost>();
    for (const posts of roomMuseumPostsByChannel.values()) posts.forEach((post) => byId.set(post.id, post));
    roomPosts.forEach((post) => byId.set(post.id, post));
    return [...byId.values()]
      .sort((left, right) => Date.parse(right.time) - Date.parse(left.time))
      .slice(0, 12)
      .map((post) => {
        const room = roomChannelOptions.find((channel) => channel.key === post.channel);
        return { id: post.id, text: post.text, category: post.category, time: post.time, roomKey: room?.key, roomLabel: room?.label };
      });
  }
  return MOCK_CONFESSIONS.slice(0, 8).map((post) => {
    const sample = transmissionViewFromConfession(post);
    return { text: sample.text, category: sample.category, time: sample.time };
  });
}

// The homepage: a short terminal welcome over the live museum. The 3D
// foyer plays in the background as a preface; visitors can still drag to
// look around and tap the floor to walk.
function renderTerminalHomePage(): RenderedProductRoute {
  const signedIn = hasRoomSession();
  const enterPath = signedIn ? ROOM_HOME_PATH : "/room/access";
  const mask = maskEntry();
  return {
    metadata: HOME_METADATA,
    html: publicFrame("/", `<main id="main-content" class="public-main home-main">
      <section class="room-museum museum-foyer museum-foyer--preface" data-room-museum data-museum-foyer aria-labelledby="hidn-welcome-title">
        <div class="room-museum__stage" data-museum-stage><p class="room-museum__loading" data-museum-loading role="status" hidden>Opening the gallery…</p></div>
        <aside class="room-museum__reader" data-museum-reader hidden role="dialog" aria-labelledby="foyer-reader-title">
          <div class="room-museum__reader-top"><span id="foyer-reader-title" data-museum-post-category>Sample thought</span><button type="button" data-museum-reader-close aria-label="Close thought">×</button></div>
          <blockquote data-museum-post-text></blockquote>
          <footer><span>Public foyer</span><a href="${enterPath}">Enter the room →</a></footer>
        </aside>
        <header class="hidn-home__nav">
          <a class="hidn-home__logo" href="/" aria-label="HIDN home">&gt;hidn</a>
          <nav class="hidn-home__links" aria-label="Main">
            ${renderAmbientAudioToggle()}
            <a class="hidn-home__link hidn-home__link--wide" href="/how-it-works">How it works</a>
            <a class="hidn-home__link hidn-home__link--wide" href="/read">Read first</a>
            <a class="hidn-home__link hidn-home__link--wide" href="${mask.href}">Mask your pfp</a>
            ${signedIn ? "" : `<a class="hidn-home__key" href="/room/access#login">I have a key</a>`}
          </nav>
        </header>
        <a class="hidn-home__mask" href="${mask.href}"><b>New</b><span class="hidn-home__mask-long">Make your profile picture anonymous</span><span class="hidn-home__mask-short">Mask your pfp</span><i aria-hidden="true">→</i></a>
        <div class="hidn-welcome hidn-home"><div class="hidn-welcome__panel hidn-home__hero">
          <p class="hidn-home__eyebrow"><span aria-hidden="true"></span>hidn://private_room · built on Zcash</p>
          <h1 id="hidn-welcome-title" class="hidn-home__title">Say what you can't say out loud.</h1>
          <p class="hidn-home__lead">People are confessing things they’ve never told anyone. Your turn.</p>
          <div class="hidn-welcome__actions hidn-home__actions" data-hidn-type-reveal>
            <a class="hidn-home__btn hidn-home__btn--primary" href="${enterPath}">${signedIn ? "Back to the room" : "Enter the room"}</a>
            <a class="hidn-home__btn hidn-home__btn--ghost" href="/read">Read first</a>
          </div>
          <p class="hidn-home__trust">no email · no username · zero knowledge</p>
        </div>
        <figure class="hidn-welcome__ticker hidn-home__said" data-home-ticker hidden aria-live="off">
          <figcaption><span><i aria-hidden="true"></i>said in the room</span><span data-home-ticker-meta></span></figcaption>
          <blockquote data-home-ticker-text></blockquote>
          <span class="hidn-home__signed">signed <i aria-hidden="true"></i> name withheld</span>
        </figure></div>
        <p class="hidn-welcome__hint hidn-home__hint" data-museum-status>drag to look around the museum</p>
        ${renderWelcomeWatcher(enterPath)}
      </section>
    </main>`, "public-page--home public-page--home-museum public-page--welcome"),
  };
}

function renderHome(privateFoyer = false): RenderedProductRoute {
  const foyerPath = privateFoyer ? "/room/main" : "/";
  const entryPath = privateFoyer ? "/room" : "/room/access";
  const entryLabel = privateFoyer ? "OPEN HALLWAY" : "ENTER ROOM";
  return {
    metadata: privateFoyer
      ? { ...HOME_METADATA, title: "The private room · HIDN", canonicalPath: foyerPath }
      : HOME_METADATA,
    html: publicFrame(foyerPath, `<main id="main-content" class="public-main home-main">
      <section class="room-museum museum-foyer" data-room-museum data-museum-foyer${privateFoyer ? " data-museum-private-foyer" : ""} ${privateFoyer ? "aria-label=\"Private room\"" : "aria-labelledby=\"home-room-title\""}>
        <div class="room-museum__stage" data-museum-stage><p class="room-museum__loading" data-museum-loading role="status">OPENING THE GALLERY…</p></div>
        ${privateFoyer ? "" : `<div class="museum-foyer__intro">
          ${TerminalLabel("A MUSEUM OF UNSAID THOUGHTS")}
          <h1 id="home-room-title">A R<span class="home-room-title__double-o">OO${renderRoomEyeWatcher()}</span>M<br />WITHOUT <em>NAMES.</em></h1>
          <p>A private room for anonymous thoughts and unnamed conversations.</p>
        </div>`}
        <aside class="room-museum__reader" data-museum-reader hidden role="dialog" aria-labelledby="foyer-reader-title">
          <div class="room-museum__reader-top"><span id="foyer-reader-title" data-museum-post-category>SAMPLE THOUGHT</span><button type="button" data-museum-reader-close aria-label="Close thought">×</button></div>
          <blockquote data-museum-post-text></blockquote>
          <footer><span>${privateFoyer ? "PRIVATE ROOM" : "PUBLIC FOYER"}</span>${privateFoyer ? "" : `<a href="${entryPath}" data-room-enter>${entryLabel} →</a>`}</footer>
        </aside>
        <nav class="room-museum__walk-controls museum-foyer__walk" aria-label="Explore the museum foyer">
          <button type="button" data-museum-action="left" aria-label="Look left">↶</button>
          <button type="button" data-museum-action="forward" aria-label="Walk forward">⌃</button>
          <button type="button" data-museum-action="back" aria-label="Walk backward">⌄</button>
          <button type="button" data-museum-action="right" aria-label="Look right">↷</button>
          <button type="button" data-museum-action="reset" aria-label="Return to the entrance view">⌂</button>
        </nav>
        ${privateFoyer ? "" : `<div class="museum-foyer__entry"><a href="${entryPath}" data-room-enter data-glitch-text="&gt; ${entryLabel} ↗" aria-label="${entryLabel}"><span aria-hidden="true">&gt;</span> ${entryLabel} <span aria-hidden="true">↗</span></a><p>WRITE FREELY / STAY UNKNOWN</p></div>`}
        ${privateFoyer ? `<button type="button" class="hidn-tv-prompt" data-tv-prompt>[ ▶ WATCH · ZCASH CHANNELS ]</button>` : ""}
        <p class="room-museum__hint museum-foyer__hint" data-museum-status>${privateFoyer ? "PRIVATE ROOM · WALK TO THE HALLWAY SIGN · TAP THE FLOOR TO WALK" : "DRAG TO LOOK · TAP THE FLOOR TO WALK · TAP A FRAME TO READ"}</p>
        <footer class="museum-foyer__footer"><a href="/how-it-works">HOW IT WORKS</a><span>NOBODY KNOWS IT'S YOU</span></footer>
      </section>
    </main>`, "public-page--home public-page--home-museum"),
  };
}

export function renderProductRoute(path: string): RenderedProductRoute {
  const normalizedPath = normalizePath(path);

  if (import.meta.env.DEV && normalizedPath === "/museum-preview") {
    return {
      metadata: { ...EXPLORE_METADATA, title: "Museum preview · HIDN", canonicalPath: "/museum-preview" },
      html: museumDesignPreviewHtml(),
    };
  }

  restoreRoomAccountState();
  if (isProtectedRoomPath(normalizedPath) && !hasRoomSession()) {
    window.history.replaceState({}, "", "/");
    return renderTerminalHomePage();
  }

  if (isModerationSurfacePath(normalizedPath) && !moderationVisibilityReady) {
    return renderModerationGate(path);
  }

  if (normalizedPath === "/") {
    return renderTerminalHomePage();
  }

  if (normalizedPath === "/room/main") {
    return renderHome(true);
  }

  if (normalizedPath === "/room") {
    return {
      metadata: {
        ...EXPLORE_METADATA,
        title: "The room · HIDN",
        canonicalPath: "/room",
      },
      html: renderRoomMuseum(),
    };
  }

  if (normalizedPath === "/room/library") {
    return {
      metadata: { ...EXPLORE_METADATA, title: "The library · HIDN", canonicalPath: normalizedPath },
      html: renderLibraryMuseum(),
    };
  }

  if (normalizedPath === "/room/orb") {
    return {
      metadata: {
        ...EXPLORE_METADATA,
        title: "The room · HIDN",
        canonicalPath: normalizedPath,
      },
      html: renderRoomMuseum(),
    };
  }

  if (normalizedPath === "/room/hall") {
    // The old carousel hall is retired. Keep old bookmarks useful by sending
    // them to the connected 3D museum instead.
    window.history.replaceState({}, "", "/room");
    return {
      metadata: {
        ...EXPLORE_METADATA,
        title: "The museum · HIDN",
        canonicalPath: "/room",
      },
      html: renderRoomMuseum(),
    };
  }

  const roomChannelFeed = roomChannelFeedFromPath(normalizedPath);
  if (roomChannelFeed) {
    activeRoomChannel = roomChannelFeed;
    return {
      metadata: {
        ...EXPLORE_METADATA,
        title: `${roomDisplayName(roomChannelOption(roomChannelFeed).label)} · HIDN`,
        canonicalPath: normalizedPath,
      },
      html: renderExplore(normalizedPath),
    };
  }

  const roomChannel = roomChannelFromPath(normalizedPath);
  if (roomChannel) {
    activeRoomChannel = roomChannel;
    return {
      metadata: {
        ...EXPLORE_METADATA,
        title: `${roomDisplayName(roomChannelOption(roomChannel).label)} · HIDN`,
        canonicalPath: normalizedPath,
      },
      html: renderRoomChannelMuseum(roomChannel),
    };
  }

  if (normalizedPath === "/room/profile") {
    return renderRoomProfile();
  }

  if (normalizedPath.startsWith("/r/")) {
    const room = roomLinkFromPath(normalizedPath);
    if (!room) {
      window.history.replaceState({}, "", "/read");
      return renderProductRoute("/read");
    }
    return {
      metadata: {
        ...HOME_METADATA,
        title: `${room.title} · HIDN`,
        description: `${room.description}. No names, ever.`,
        canonicalPath: normalizedPath,
      },
      html: publicFrame(
        normalizedPath,
        `<main id="main-content" class="public-main room-main hidn-term-main">
          ${terminalWindow(`hidn@room: ~/r/${room.slug}`, renderRoomLinkBody(room, hasRoomSession()), "hidn-term--access hidn-term--read")}
        </main>`,
        "public-page--room public-page--public-read",
      ),
    };
  }

  const readChannel = readChannelFromPath(normalizedPath);
  if (readChannel) {
    return {
      metadata: {
        ...HOME_METADATA,
        title: "Read first · HIDN",
        description: "Real anonymous posts from the room without names. Read before you join.",
        canonicalPath: normalizedPath,
      },
      html: publicFrame(
        normalizedPath,
        `<main id="main-content" class="public-main room-main hidn-term-main">
          ${terminalWindow("hidn@room: ~/read", renderReadBody(readChannel, hasRoomSession()), "hidn-term--access hidn-term--read")}
        </main>`,
        "public-page--room public-page--public-read",
      ),
    };
  }

  if (normalizedPath === "/room/inbox") {
    return renderRoomLinkInbox();
  }

  if (normalizedPath === MIXED_FEED_PATH) {
    return renderMixedFeed();
  }

  const linkSlug = linkSlugFromPath(normalizedPath);
  if (linkSlug) {
    return renderLinkSendRoute(normalizedPath, linkSlug);
  }

  if (normalizedPath === "/room/access") {
    return renderRoomAccess();
  }

  if (normalizedPath === MASK_PATH) {
    return renderMaskRoute();
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

  if (normalizedPath === "/admin/metrics") {
    return renderAdminMetrics();
  }

  if (normalizedPath === "/explore" || normalizedPath === "/room/rooms") {
    // The social rooms section: every room's feed, without the 3D museum.
    if (normalizedPath === "/explore") window.history.replaceState({}, "", "/room/rooms");
    return {
      metadata: { ...EXPLORE_METADATA, title: "Rooms · HIDN", canonicalPath: "/room/rooms" },
      html: renderMobileRoomIndex(),
    };
  }

  if (normalizedPath === "/how-it-works") {
    return renderHowItWorks();
  }

  if (["/manifesto", "/privacy"].includes(normalizedPath)) {
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

  const activeElement = document.activeElement;
  const activeInput = activeElement instanceof HTMLInputElement
    && (Boolean(form?.contains(activeElement)) || activeElement === tipInput)
    ? activeElement
    : undefined;
  const confirmations = [1, 2].map((index) => Boolean(form?.querySelector<HTMLInputElement>(`#room-recovery-answer-${index}`)?.checked)) as [boolean, boolean];
  const tipAddress = tipInput?.value ?? roomTipAddressDraft;
  roomTipAddressDraft = tipAddress;

  return {
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
  window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
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
  list.querySelector<HTMLButtonElement>("[data-feed-more]")?.addEventListener("click", () => void loadMoreRoomFeed());
  // The rows are new elements: give them back their share, save, tip and
  // open-on-tap handlers, not just likes.
  list.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleRoomAction(root, button));
  });
  bindComponentInteractions(list);
  bindRoomLikeInteractions(list);
  bindTransmissionRowOpen(list);
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
      if (normalizedPath === "/room" || normalizedPath === "/room/rooms" || normalizedPath === "/explore" || Boolean(roomChannelSurfaceFromPath(normalizedPath))) {
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
        const { scope, proof } = await createAnonymousRoomProof("reaction", "thread", threadId, "like", "", anonymousTargetScope("reaction", "thread", threadId));
        const response = await createAnonymousReaction({
          proof,
          scope,
          targetType: "thread",
          targetId: threadId,
        });
        roomLikeCounts.set(threadId, response.reactions);
        roomLikedIds.add(threadId);
        roomChannelNotice = "REACTION SAVED / PRIVATE";
      }
      roomPostError = "";
    } catch (error) {
      if (error instanceof Error && /already liked/i.test(error.message)) {
        // One like per member per post: this member has liked it already.
        roomLikedIds.add(threadId);
        roomPostError = "";
        roomChannelNotice = "ALREADY LIKED / PRIVATE";
      } else {
        roomPostError = error instanceof Error ? error.message : "The reaction could not be saved.";
        roomChannelNotice = "";
      }
    } finally {
      delete button.dataset.pending;
    }
  }

  if (normalizedPath === "/room" || normalizedPath === "/room/rooms" || normalizedPath === "/explore" || Boolean(roomChannelSurfaceFromPath(normalizedPath))) {
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
  bindTransmissionRowOpen(root);
  bindRoomChannelButtons(root);
}

function bindTransmissionRowOpen(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".transmission-row[data-open-href]").forEach((row) => {
    row.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const href = row.dataset.openHref;
      const onDesk = Boolean(row.closest(".hidn-desk"));
      // On the desktop room the reply link opens the side panel too.
      const replyLink = target?.closest<HTMLAnchorElement>('a[href^="/c/"]');
      if (onDesk && replyLink && href) {
        event.preventDefault();
        openDeskThread(decodeURIComponent(href.slice("/c/".length)));
        return;
      }
      // Buttons and links in the row keep their own job; a text selection
      // (for quoting) is not a tap.
      if (target?.closest("a, button, input, textarea, label")) return;
      if (window.getSelection()?.toString()) return;
      if (!href) return;
      if (onDesk) openDeskThread(decodeURIComponent(href.slice("/c/".length)));
      else navigateProductRoute(href);
    });
  });
}

function bindRoomChannelButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>("[data-desk-close]").forEach((button) => {
    button.addEventListener("click", () => {
      deskOpenThreadId = "";
      rerenderProductRoute();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-room-post-channel]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.roomPostChannel as RoomChannel | undefined;
      if (!key || !roomChannelOptions.some((channel) => channel.key === key)) return;
      // Keep the draft while the destination changes.
      const draft = root.querySelector<HTMLTextAreaElement>("#room-post-content");
      if (draft) roomPostText = draft.value;
      activeRoomChannel = key;
      roomChannelNotice = "";
      rerenderProductRoute();
      document.querySelector<HTMLButtonElement>(`[data-room-post-channel="${key}"]`)?.focus();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-room-channel]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.roomChannel as RoomChannel | undefined;
      if (!key || !roomChannelOptions.some((channel) => channel.key === key)) {
        return;
      }

      // Rooms are places: tapping one opens it, on phones and desktops alike.
      roomPostComposerOpen = false;
      roomPostText = "";
      roomPostError = "";
      navigateProductRoute(`/room/channel/${key}/feed`);
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
    if (target.targetType === "account") {
      throw new Error("Only posts and replies can be reported.");
    }
    if (!hasRoomSession()) {
      throw new Error("Return with your recovery key to send a report.");
    }
    // The proof shows a member sent this report without saying which one.
    const { scope, proof } = await createAnonymousRoomProof("report", target.targetType, target.targetId, reason);
    await submitReport({
      proof,
      scope,
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

async function loadAdminMetrics(): Promise<void> {
  adminMetricsLoaded = true;
  const hasSession = adminSession ? true : await loadAdminSessionState();
  if (!hasSession || adminSession?.role !== "super_admin") {
    adminReportError = "A super-admin Cloudflare Access session is required for metrics.";
    rerenderProductRoute();
    return;
  }

  try {
    adminMetrics = await fetchAdminMetrics(adminReportToken);
    adminReportError = "";
  } catch (error) {
    adminMetrics = undefined;
    adminReportError = error instanceof Error ? error.message : "Metrics could not be loaded.";
  }
  if (normalizePath(window.location.pathname) === "/admin/metrics") {
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

function bindRoomSpaceInteractions(root: ParentNode): void {
  const space = root.querySelector<HTMLElement>("[data-room-space]");
  const rail = root.querySelector<HTMLElement>("[data-room-space-rail]");
  const experience = root.querySelector<HTMLElement>(".room-space__experience");
  const frames = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-room-space-frame]"));
  if (!space || !rail || !frames.length) {
    return;
  }

  const transmissions = roomHallTransmissions().slice(0, 8);
  const applyScenePosition = (): void => {
    rail.style.setProperty("--room-space-shift", `${(3.5 - roomSpacePosition) * 18}rem`);
    experience?.style.setProperty("--room-space-view", `${Math.max(18, Math.min(82, 50 + roomSpacePosition * 4.5))}%`);
  };
  const applyPosition = (): void => {
    applyScenePosition();
    const status = root.querySelector<HTMLElement>("[data-room-space-status]");
    if (status) {
      status.textContent = `POSITION ${String(roomSpaceSelection + 1).padStart(2, "0")} / ${String(Math.max(frames.length, 1)).padStart(2, "0")}`;
    }
  };

  const selectFrame = (requestedIndex: number): void => {
    const index = Math.max(0, Math.min(frames.length - 1, requestedIndex));
    roomSpaceSelection = index;
    roomSpacePosition = index;
    frames.forEach((frame, frameIndex) => {
      frame.classList.toggle("room-space__frame--active", frameIndex === index);
      frame.setAttribute("aria-pressed", String(frameIndex === index));
    });

    const transmission = transmissions[index];
    if (!transmission) {
      return;
    }

    const category = root.querySelector<HTMLElement>("[data-room-space-detail-category]");
    const position = root.querySelector<HTMLElement>("[data-room-space-detail-position]");
    const text = root.querySelector<HTMLElement>("[data-room-space-detail-text]");
    const time = root.querySelector<HTMLElement>("[data-room-space-detail-time]");
    if (category) category.textContent = transmission.category ?? "UNSORTED";
    if (position) position.textContent = `FRAME ${String(index + 1).padStart(2, "0")}`;
    if (text) text.textContent = `“${transmission.text}”`;
    if (time) time.textContent = formatTransmissionTime(transmission.time);
    applyPosition();
  };

  frames.forEach((frame, index) => {
    frame.setAttribute("aria-pressed", String(index === roomSpaceSelection));
    frame.addEventListener("click", () => {
      selectFrame(index);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-room-space-step]").forEach((button) => {
    button.addEventListener("click", () => {
      selectFrame(roomSpaceSelection + Number(button.dataset.roomSpaceStep ?? "0"));
    });
  });

  root.querySelector<HTMLButtonElement>("[data-room-space-reset]")?.addEventListener("click", () => {
    selectFrame(0);
  });

  space.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectFrame(roomSpaceSelection - 1);
    } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      event.preventDefault();
      selectFrame(roomSpaceSelection + 1);
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      selectFrame(0);
    }
  });

  let pointerStartX: number | undefined;
  let positionStart = 0;
  let pointerMoved = false;
  space.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (event.target instanceof Element && event.target.closest("button, a")) {
      return;
    }
    pointerStartX = event.clientX;
    positionStart = roomSpacePosition;
    pointerMoved = false;
    space.dataset.roomSpaceDragging = "true";
    space.setPointerCapture?.(event.pointerId);
  });

  space.addEventListener("pointermove", (event) => {
    if (pointerStartX === undefined) {
      return;
    }
    const distance = event.clientX - pointerStartX;
    if (Math.abs(distance) > 8) {
      pointerMoved = true;
    }
    const nextPosition = Math.max(0, Math.min(frames.length - 1, positionStart - distance / 120));
    if (nextPosition !== roomSpacePosition) {
      roomSpacePosition = nextPosition;
      applyScenePosition();
    }
  });

  const releaseSpacePointer = (): void => {
    pointerStartX = undefined;
    space.dataset.roomSpaceDragging = "false";
    if (pointerMoved) {
      selectFrame(Math.round(roomSpacePosition));
    }
    pointerMoved = false;
  };
  space.addEventListener("pointerup", releaseSpacePointer);
  space.addEventListener("pointercancel", releaseSpacePointer);
  space.addEventListener("wheel", (event) => {
    if (event.target instanceof Element && event.target.closest("a, button")) {
      return;
    }
    event.preventDefault();
    selectFrame(roomSpaceSelection + ((event.deltaY || event.deltaX) > 0 ? 1 : -1));
  }, { passive: false });

  selectFrame(roomSpaceSelection);
}

export function disposeProductRoute(): void {
  roomMuseumLoadVersion += 1;
  roomMuseumCleanup?.();
  roomMuseumCleanup = undefined;
}

function bindRoomMuseumInteractions(root: ParentNode): void {
  const museum = root.querySelector<HTMLElement>("[data-room-museum]");
  if (!museum) return;
  const version = ++roomMuseumLoadVersion;
  const foyer = museum.hasAttribute("data-museum-foyer");
  const library = museum.hasAttribute("data-museum-library");
  const privateFoyer = museum.hasAttribute("data-museum-private-foyer");
  const currentPath = normalizePath(window.location.pathname);
  const preview = museumDesignPreview();
  const museumHub = currentPath === "/room" || currentPath === "/room/orb" || preview?.view === "hall";
  const channelMuseum = preview ? roomChannelOptions.find((room) => room.key === preview.view)?.key : roomChannelFromPath(currentPath);
  const galleries = foyer
    ? undefined
    : library
      ? [LIBRARY_GALLERY]
    : channelMuseum
      ? [roomMuseumGallery(channelMuseum)]
      : roomMuseumGalleries();
  const posts: MuseumPost[] = foyer ? homeMuseumPosts(privateFoyer && !preview) : (galleries?.flatMap((gallery) => gallery.posts) ?? []);
  const signal = activeHidnTheme() === "signal";
  let foyerActivityTimer: number | undefined;
  const noteFoyerActivity = (): void => {
    if (!foyer) return;
    museum.classList.add("museum-foyer--navigating");
    if (foyerActivityTimer !== undefined) window.clearTimeout(foyerActivityTimer);
    foyerActivityTimer = window.setTimeout(() => {
      museum.classList.remove("museum-foyer--navigating");
      foyerActivityTimer = undefined;
    }, 3000);
  };
  const museumLoadFailureMessage = (error: unknown): string => {
    const detail = error instanceof Error ? error.message : String(error);
    if (/webgl|context|renderer/i.test(detail)) {
      return "3D view is unavailable because this browser could not start WebGL 2. Try Safari or Chrome with hardware acceleration enabled. The exhibition index below is still available.";
    }
    return "The 3D view could not load in this browser. Reload once, or use the exhibition index below.";
  };
  if (library || privateFoyer) {
    // The television plays in the room: tapping it or the prompt opens the
    // in-room viewer instead of sending the visitor elsewhere.
    const openTv = (): void => {
      if (!museum.querySelector(".hidn-tv")) openLearningTv(museum);
    };
    museum.addEventListener("hidn-tv-open", openTv);
    museum.querySelector("[data-tv-prompt]")?.addEventListener("click", openTv);
  }
  void import("./room-museum").then(({ mountRoomMuseum }) => {
    if (version !== roomMuseumLoadVersion || !museum.isConnected) return;
    const cleanup = mountRoomMuseum(museum, posts, signal, {
      foyer,
      privateFoyer,
      roomMode: foyer ? undefined : museumHub ? "hub" : "gallery",
      galleries,
      library,
      ambientLook: foyer && !privateFoyer,
      onLibraryEnter: museumHub ? () => navigateProductRoute(preview ? "/museum-preview?view=library" : "/room/library") : undefined,
      onActivity: noteFoyerActivity,
      onGalleryEnter: (gallery) => {
        if (preview) {
          navigateProductRoute(`/museum-preview?view=${encodeURIComponent(gallery.key)}`);
        } else if (currentPath === "/room" && hasRoomSession()) {
          navigateProductRoute(`/room/channel/${encodeURIComponent(gallery.key)}`);
        }
      },
      onReturnToMain: () => {
        if (preview) navigateProductRoute("/museum-preview?view=hall");
        else if (currentPath !== "/room") navigateProductRoute("/room");
      },
      onEnter: (beginEntry) => {
        playMuseumDoorSound();
        if (preview) {
          beginEntry(() => navigateProductRoute("/museum-preview?view=hall"));
          return;
        }
        // Walking through the hallway door leads into the museum's hallway;
        // the feed is where buttons and sign-in land, not the door.
        const returning = hasRoomSession();
        beginEntry(() => navigateIntoRoom(returning ? "/room" : "/room/access"));
      },
    });
    roomMuseumCleanup = () => {
      if (foyerActivityTimer !== undefined) window.clearTimeout(foyerActivityTimer);
      museum.classList.remove("museum-foyer--navigating");
      cleanup();
    };
  }).catch((error: unknown) => {
    if (!museum.isConnected) return;
    museum.classList.add("room-museum--fallback");
    const loading = museum.querySelector<HTMLElement>("[data-museum-loading]");
    if (loading) {
      loading.textContent = museumLoadFailureMessage(error);
      loading.dataset.museumError = "true";
    }
    const exhibition = museum.querySelector<HTMLDetailsElement>("[data-museum-exhibition]");
    if (exhibition) exhibition.open = true;
    console.warn("[HIDN museum] 3D renderer unavailable", error);
  });
}

function updateRoomHallPosition(root: ParentNode, requestedIndex: number): void {
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-room-hall-panel]"));
  if (!panels.length) {
    return;
  }

  roomHallIndex = Math.max(0, Math.min(panels.length - 1, requestedIndex));
  const track = root.querySelector<HTMLElement>("[data-room-hall-track]");
  track?.style.setProperty("--room-hall-index", String(roomHallIndex));
  track?.style.setProperty("--room-hall-drag", "0px");
  panels.forEach((panel, index) => {
    panel.dataset.roomHallActive = String(index === roomHallIndex);
  });

  const status = root.querySelector<HTMLElement>("[data-room-hall-status]");
  if (status) {
    status.textContent = `WALL ${String(roomHallIndex + 1).padStart(2, "0")} / ${String(panels.length).padStart(2, "0")}`;
  }
}

function updateRoomHallZoom(root: ParentNode, requestedZoom: number): void {
  roomHallZoom = Math.max(0.88, Math.min(1.18, requestedZoom));
  root.querySelector<HTMLElement>("[data-room-hall-track]")?.style.setProperty("--room-hall-zoom", String(roomHallZoom));
  const status = root.querySelector<HTMLElement>("[data-room-hall-zoom-status]");
  if (status) {
    status.textContent = `${Math.round(roomHallZoom * 100)}%`;
  }
}

function resetRoomHallView(root: ParentNode): void {
  updateRoomHallPosition(root, 0);
  updateRoomHallZoom(root, 1);
}

function handleRoomAction(root: ParentNode, button: HTMLButtonElement): void {
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
      const reason = root.querySelector<HTMLInputElement>('input[name="hidn-report-reason"]:checked')?.value ?? "";
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
        roomChannelNotice = "THIS POST DOES NOT HAVE A SHIELDED MAINNET DESTINATION.";
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
    case "profile-view":
      profileView = (button.dataset.view as ProfileView) ?? "posts";
      rerenderProductRoute();
      break;
    case "profile-history":
      profileHistoryView = button.dataset.view === "comments" ? "comments" : "posts";
      rerenderProductRoute();
      break;
    case "room-key-show":
      revealRoomRecoveryKeyTemporarily();
      rerenderProductRoute();
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
      roomLoginError = "";
      rerenderProductRoute();
      void registerAnonymousRoomAccess();
      break;
    }
    case "room-login-saved": {
      void readSavedKey().then((key) => {
        const input = root.querySelector<HTMLInputElement>("#room-login-recovery-code");
        if (!key || !input) {
          roomLoginError = "No saved key found in this browser. Paste the key you kept instead.";
          rerenderProductRoute();
          return;
        }
        input.value = key;
        root.querySelector<HTMLButtonElement>('[data-action="room-submit-login"]')?.click();
      });
      break;
    }
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
      rerenderProductRoute();
      void registerAnonymousRoomAccess(recoveryCode);
      break;
    }
    case "room-enter":
      navigateIntoRoom(ROOM_HOME_PATH, { portal: true });
      break;
    case "room-refresh":
      void refreshActiveRoom();
      break;
    case "room-profile-back":
      navigateProductRoute(ROOM_HOME_PATH);
      break;
    case "room-copy-recovery-key":
      void copyRoomRecoveryKey(button);
      break;
    case "room-dock-say": {
      // Inside a room that isn't open yet, say so instead of opening a box nobody can send.
      const closedHere = roomChannelSurfaceFromPath(window.location.pathname);
      const closedReason = closedHere ? roomPostingClosed(closedHere) : null;
      if (closedReason) {
        roomChannelNotice = closedReason;
        rerenderProductRoute();
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      }
      // The dock's say-it button: open the composer here, or go to the feed and open it there.
      const here = document.querySelector<HTMLButtonElement>('[data-action="room-create-post"]');
      if (here) {
        here.click();
        window.setTimeout(() => document.querySelector<HTMLTextAreaElement>("#room-post-content")?.focus(), 60);
      } else {
        openComposerOnArrival = true;
        navigateProductRoute(MIXED_FEED_PATH);
      }
      break;
    }
    case "room-create-post":
      if (!hasRoomSession()) {
        navigateProductRoute("/room/access");
        break;
      }

      {
        const fixedRoom = roomChannelSurfaceFromPath(window.location.pathname);
        const closedReason = roomPostingClosed(fixedRoom ?? activeRoomChannel);
        if (closedReason && fixedRoom) {
          roomChannelNotice = closedReason;
          rerenderProductRoute();
          break;
        }
        // Elsewhere, a closed room is never the one a new post starts in.
        if (closedReason) {
          activeRoomChannel = "general";
        }
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
}

function bindRoomHallInteractions(root: ParentNode): void {
  const hall = root.querySelector<HTMLElement>("[data-room-hall]");
  if (!hall) {
    return;
  }

  updateRoomHallPosition(root, roomHallIndex);
  updateRoomHallZoom(root, roomHallZoom);

  root.querySelectorAll<HTMLButtonElement>("[data-room-hall-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.roomHallStep ?? "0");
      updateRoomHallPosition(root, roomHallIndex + direction);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-room-hall-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      updateRoomHallZoom(root, roomHallZoom + Number(button.dataset.roomHallZoom ?? "0") * 0.06);
    });
  });

  root.querySelector<HTMLButtonElement>("[data-room-hall-reset]")?.addEventListener("click", () => {
    resetRoomHallView(root);
  });

  hall.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      updateRoomHallPosition(root, roomHallIndex - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      updateRoomHallPosition(root, roomHallIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      updateRoomHallPosition(root, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      updateRoomHallPosition(root, root.querySelectorAll("[data-room-hall-panel]").length - 1);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      updateRoomHallZoom(root, roomHallZoom + 0.06);
    } else if (event.key === "-") {
      event.preventDefault();
      updateRoomHallZoom(root, roomHallZoom - 0.06);
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      resetRoomHallView(root);
    }
  });

  let pointerStartX: number | undefined;
  let isDragging = false;
  let suppressNextClick = false;
  hall.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (event.target instanceof Element && event.target.closest("button, a")) {
      return;
    }

    pointerStartX = event.clientX;
    isDragging = false;
    const track = root.querySelector<HTMLElement>("[data-room-hall-track]");
    if (track) {
      track.dataset.roomHallDragging = "true";
    }
    hall.setPointerCapture?.(event.pointerId);
  });
  hall.addEventListener("pointermove", (event) => {
    if (pointerStartX === undefined) {
      return;
    }

    const distance = event.clientX - pointerStartX;
    if (Math.abs(distance) > 6) {
      isDragging = true;
    }
    root.querySelector<HTMLElement>("[data-room-hall-track]")?.style.setProperty("--room-hall-drag", `${distance}px`);
  });
  hall.addEventListener("pointerup", (event) => {
    if (pointerStartX === undefined) {
      return;
    }

    const distance = event.clientX - pointerStartX;
    pointerStartX = undefined;
    suppressNextClick = isDragging;
    isDragging = false;
    const track = root.querySelector<HTMLElement>("[data-room-hall-track]");
    track?.style.setProperty("--room-hall-drag", "0px");
    if (track) {
      track.dataset.roomHallDragging = "false";
    }
    if (Math.abs(distance) < 32) {
      return;
    }

    updateRoomHallPosition(root, roomHallIndex + (distance < 0 ? 1 : -1));
  });
  hall.addEventListener("pointercancel", () => {
    pointerStartX = undefined;
    isDragging = false;
    const track = root.querySelector<HTMLElement>("[data-room-hall-track]");
    track?.style.setProperty("--room-hall-drag", "0px");
    if (track) {
      track.dataset.roomHallDragging = "false";
    }
  });

  hall.addEventListener("click", (event) => {
    if (!suppressNextClick) {
      return;
    }

    suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  root.querySelector<HTMLElement>("[data-room-hall-viewport]")?.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) < 8 && Math.abs(event.deltaX) < 8) {
      return;
    }

    event.preventDefault();
    updateRoomHallPosition(root, roomHallIndex + ((event.deltaY || event.deltaX) > 0 ? 1 : -1));
  }, { passive: false });
}

let welcomeCleanup: (() => void) | undefined;
let homeTickerCleanup: (() => void) | undefined;

let terminalFeedCleanup: (() => void) | undefined;

let scrolledHashFor = "";

/** Jumps to a section like /how-it-works#tips once per arrival, not on every re-render. */
function scrollToHashOnce(root: ParentNode): void {
  const key = `${window.location.pathname}${window.location.hash}`;
  if (!window.location.hash || scrolledHashFor === key) return;
  const target = root.querySelector<HTMLElement>(window.location.hash.replace(/[^#\w-]/g, ""));
  if (!target) return;
  scrolledHashFor = key;
  window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
}

export function bindProductRoute(root: ParentNode = document): void {
  scrollToHashOnce(root);
  welcomeCleanup?.();
  welcomeCleanup = mountWelcome(root);
  homeTickerCleanup?.();
  homeTickerCleanup = mountHomeTicker(root);
  bindReadPage(root);
  bindRoomShareButtons(root);
  root.querySelectorAll<HTMLButtonElement>("[data-room-say]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.roomSay ?? "general";
      if (hasRoomSession()) {
        openComposerIn(key);
        return;
      }
      rememberRoomIntent(key);
      navigateProductRoute("/room/access");
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-room-open]").forEach((button) => {
    button.addEventListener("click", () => navigateProductRoute(`/c/${encodeURIComponent(button.dataset.roomOpen ?? "")}`));
  });
  // Getting a key from a shared room's prompt lands in that room too.
  const sharedRoom = roomLinkFromPath(normalizePath(window.location.pathname));
  if (sharedRoom) {
    root.querySelectorAll<HTMLAnchorElement>('a[href="/room/access"]').forEach((link) => {
      link.addEventListener("click", () => rememberRoomIntent(sharedRoom.key));
    });
  }
  if (openComposerOnArrival && roomChannelFeedFromPath(normalizePath(window.location.pathname))) {
    openComposerOnArrival = false;
    const key = roomChannelFeedFromPath(normalizePath(window.location.pathname))!;
    window.setTimeout(() => openComposerIn(key), 120);
  } else if (openComposerOnArrival && normalizePath(window.location.pathname) === MIXED_FEED_PATH) {
    openComposerOnArrival = false;
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('[data-action="room-create-post"]')?.click();
      window.setTimeout(() => document.querySelector<HTMLTextAreaElement>("#room-post-content")?.focus(), 60);
    }, 120);
  }
  bindKeySaveCard(root, roomAccountRecoveryCode);
  bindKeyReminder(root);
  // Save-your-key: ticking "I've saved my key" unlocks Enter the room.
  root.querySelector<HTMLInputElement>("[data-key-ack]")?.addEventListener("change", (event) => {
    const enter = root.querySelector<HTMLButtonElement>(".hidn-auth__enter .room-ready-enter");
    if (enter) enter.disabled = !(event.target as HTMLInputElement).checked;
  });
  root.querySelectorAll<HTMLButtonElement>("[data-key-show]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = toggle.parentElement?.querySelector<HTMLInputElement>("input");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.textContent = show ? "Hide" : "Show";
      toggle.setAttribute("aria-pressed", String(show));
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-mixed-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeMixedTab = (button.dataset.mixedTab as MixedFeedTab) ?? "mixed";
      if (activeMixedTab === "mixed") mixedFeedShuffled = shuffled(mixedFeedPosts);
      rerenderProductRoute();
    });
  });
  if (normalizePath(window.location.pathname) === MIXED_FEED_PATH) {
    void refreshMixedFeed();
  }
  {
    const path = normalizePath(window.location.pathname);
    if (path === "/room/rooms" || path === MIXED_FEED_PATH || roomChannelFeedFromPath(path) || roomChannelFromPath(path)) void refreshRoomStandings();
    mountStandingsTicker(root, (channel) => roomDisplayName(roomChannelOption(channel as RoomChannel).label));
    root.querySelector<HTMLDetailsElement>("[data-standings-more]")?.addEventListener("toggle", (event) => {
      deskBoardOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
    if (roomStandings && root.querySelector("[data-standings-stage]")) mountStandingsStage(root, roomStandings, (channel) => roomDisplayName(roomChannelOption(channel as RoomChannel).label));
  }
  root.querySelectorAll<HTMLButtonElement>("[data-feed-more]").forEach((button) => {
    button.addEventListener("click", () => {
      void (button.dataset.feedMore === "mixed" ? loadMoreMixedFeed() : loadMoreRoomFeed());
    });
  });
  // The live "new confession" line runs on the reading pages only.
  const pulsePath = normalizePath(window.location.pathname);
  const memberReading = hasRoomSession() && (pulsePath === MIXED_FEED_PATH || pulsePath === "/room/rooms" || Boolean(roomChannelFeedFromPath(pulsePath)));
  const publicReading = Boolean(readChannelFromPath(pulsePath));
  setLivePulse(memberReading || publicReading ? {
    channelLabel: (key) => roomChannelOption(key as RoomChannel).label,
    isOwn: (id) => loadDeviceSignalHistory().posts.some((post) => post.id === id),
    hrefFor: (id) => (memberReading ? `/c/${encodeURIComponent(id)}` : "/read"),
    feedHref: memberReading ? MIXED_FEED_PATH : "/read",
  } : null);
  if (roomAnonymousIdentity && showsRoomTabs(normalizePath(window.location.pathname))) {
    const secret = roomAnonymousIdentity.secret;
    refreshLinkUnread(() => deriveLinkInboxKey(secret));
  }
  // Enter in the key box signs in; the form exists so password managers
  // recognise it, never to post anywhere.
  root.querySelector<HTMLFormElement>("[data-room-login-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    root.querySelector<HTMLButtonElement>('[data-action="room-submit-login"]')?.click();
  });
  terminalFeedCleanup?.();
  terminalFeedCleanup = mountTerminalFeed(root);
  bindComponentInteractions(root);
  bindRoomLikeInteractions(root);
  bindRoomChannelInteractions(root);
  bindRoomFolderInteractions(root);
  bindPointerSpotlightInteractions(root);
  bindRoomRecoveryInteractions(root);
  bindRoomTipAddressInteractions(root);
  bindRoomPostComposerInteractions(root);
  bindLinkSendPage(root);
  bindMaskPage(root);
  if (normalizePath(window.location.pathname) === "/room/inbox" && roomAnonymousIdentity) {
    const identity = roomAnonymousIdentity;
    bindLinkInbox(root, {
      inboxKey: () => deriveLinkInboxKey(identity.secret),
      prove: (content) => createAnonymousRoomProof("link", "room", "INBOX", content),
    });
  }
  bindRoomMuseumInteractions(root);
  bindRoomSpaceInteractions(root);
  bindRoomHallInteractions(root);
  hydrateRoomTipQr(root);
  void refreshZcashNetworkStatus(root);
  startVisitorClock(root);
  const isRoomAccessPath = normalizePath(window.location.pathname) === "/room/access";
  if (isRoomAccessPath) {
    startLiveRoomActivity();
  } else {
    stopLiveRoomActivity();
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
      const foyerMuseum = root.querySelector<HTMLElement>("[data-museum-foyer]");
      if (foyerMuseum?.querySelector("canvas")) {
        foyerMuseum.dispatchEvent(new Event("museum-enter"));
        return;
      }
      navigateIntoRoom(returning ? ROOM_HOME_PATH : "/room/access");
    });
  });

  const normalizedPath = normalizePath(window.location.pathname);
  root.querySelectorAll<HTMLAnchorElement>("[data-room-notification-link]").forEach((link) => {
    link.addEventListener("click", () => {
      // Close the panel on the way, or it stays open over the post it opened.
      roomNotificationsOpen = false;
      void markRoomNotificationRead(link.dataset.notificationId ?? "");
    });
  });
  if (isRoomNotificationSurface(normalizedPath) && hasRoomSession()) {
    startRoomNotificationPolling();
  } else {
    stopRoomNotificationPolling();
  }
  if ((normalizedPath === "/room" || normalizedPath === "/room/rooms" || normalizedPath === "/room/hall" || Boolean(roomChannelSurfaceFromPath(normalizedPath))) && hasRoomSession()) {
    void refreshRoomPosts();
    if (normalizedPath === "/room") {
      void refreshMuseumGalleries();
    }
  }
  if (normalizedPath === "/room/main" && hasRoomSession()) {
    void refreshMuseumGalleries();
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
  const isAdminPath = ["/admin", "/admin/reports", "/admin/moderators", "/admin/audit", "/admin/metrics"].includes(normalizedPath);
  if (!isAdminPath && (adminReportToken || adminSession || adminReports || adminModerators || adminAuditEvents || adminReportError)) {
    adminReportToken = "";
    adminSession = undefined;
    adminSessionLoaded = false;
    adminReports = undefined;
    adminModerators = undefined;
    adminModeratorsLoaded = false;
    adminAuditEvents = undefined;
    adminAuditLoaded = false;
    adminMetrics = undefined;
    adminMetricsLoaded = false;
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
  if (normalizedPath === "/admin/metrics" && !adminMetricsLoaded) {
    void loadAdminMetrics();
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
    button.addEventListener("click", () => handleRoomAction(root, button));
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
