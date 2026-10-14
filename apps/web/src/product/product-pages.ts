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
import { renderShareCard } from "./share-card";
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
import { bindReadPage, mountHomeTicker, readChannelFromPath, renderReadBody, timeAgo } from "./public-feed";
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
type RoomChannel = "general" | "love" | "redacted" | "blackbox" | "night-shift" | "underground";
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
  return `UP TO ${roomReplyCharacterLimit()} CHARACTERS.`;
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
  { key: "love", label: "LETTING GO", description: "what remains after goodbye", categories: ["RELATIONSHIPS", "REGRET", "LONELINESS"] },
  { key: "blackbox", label: "BLACKBOX", description: "strange ideas, no explanations", categories: ["UNCERTAINTY", "IDENTITY", "FEAR"] },
  { key: "redacted", label: "REDACTED", description: "what you won’t say publicly", categories: ["IDENTITY", "UNCERTAINTY"] },
  { key: "night-shift", label: "NIGHT SHIFT", description: "posts made after midnight", categories: ["LONELINESS", "FEAR", "IDENTITY"] },
  { key: "underground", label: "THE UNDERGROUND", description: "what stays unsaid", categories: ["IDENTITY", "UNCERTAINTY", "JOY"] },
];

const ROOM_CHANNEL_KEYS: RoomChannel[] = roomChannelOptions.map((channel) => channel.key);

const museumThemeByChannel: Record<RoomChannel, MuseumTheme> = {
  general: { accent: "#a9e6b4", glow: "#74c88b", trim: "#3d6b4a", wall: "#14241c", floor: "#202b24" },
  love: { accent: "#e6b0a9", glow: "#c77b72", trim: "#704946", wall: "#241817", floor: "#2d2321" },
  blackbox: { accent: "#bec5d6", glow: "#7d8faa", trim: "#465266", wall: "#171b24", floor: "#242936" },
  redacted: { accent: "#c6b4df", glow: "#9a7dc2", trim: "#58476f", wall: "#1d1725", floor: "#27202e" },
  "night-shift": { accent: "#e8d29b", glow: "#c8a55b", trim: "#725e38", wall: "#241e13", floor: "#2c271c" },
  underground: { accent: "#a5d1d0", glow: "#66a5a1", trim: "#3c6664", wall: "#132021", floor: "#202c2d" },
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

  const wasmUrl = new URL("/anonymous-zk/depth20/hidn_membership.wasm", window.location.origin).toString();
  const zkeyUrl = new URL("/anonymous-zk/depth20/hidn_membership_final.zkey", window.location.origin).toString();

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
  return `<div class="room-tip-dialog room-tip-dialog--term${settled ? " room-tip-dialog--settled" : ""}" role="dialog" aria-modal="true" aria-labelledby="room-tip-dialog-title">
    <button class="room-tip-dialog__backdrop" type="button" data-action="room-tip-close" aria-label="Close mainnet tip dialog"></button>
    <section class="room-tip-dialog__panel hidn-term hidn-term--tip">
      <div class="hidn-term__bar"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><span aria-hidden="true">hidn@room: ~/tip</span>
        <button class="room-tip-dialog__close" type="button" data-action="room-tip-close" aria-label="Close mainnet tip dialog">×</button>
      </div>
      <div class="hidn-term__body hidn-tip">
        <p class="hidn-tip__log">&gt; open tip --network mainnet --shielded</p>
        <p class="hidn-tip__log">&gt; author: <span class="hidn-tip__redact" aria-label="name withheld"></span> · funds never touch hidn</p>
        <h2 id="room-tip-dialog-title" class="hidn-tip__title" data-text="SUPPORT THIS THOUGHT.">SUPPORT THIS THOUGHT.</h2>
        <p class="hidn-tip__line">Send any amount of ZEC from a shielded wallet straight to the author. You choose the amount in your wallet.</p>
        <div class="room-tip-dialog__request">
          <div class="hidn-tip__qr-frame">
            <canvas class="room-tip-dialog__qr" data-tip-qr data-tip-uri="${escapeHtml(paymentUri)}" width="220" height="220" aria-label="QR code for a direct Zcash mainnet tip"></canvas>
            <span>SCAN WITH A ZCASH WALLET</span>
          </div>
          <div class="room-tip-dialog__details">
            <span class="room-tip-dialog__label">&gt; DESTINATION / SHIELDED MAINNET</span>
            <button class="room-tip-dialog__address" type="button" data-action="room-tip-copy-address" data-tip-address="${escapeHtml(post.tipAddress)}" aria-label="Copy shielded mainnet destination">
              <code>${escapeHtml(post.tipAddress)}</code>
              <span>${roomTipAddressCopyFeedback ? `[ ${roomTipAddressCopyFeedback} ]` : "[ TAP TO COPY ADDRESS ]"}</span>
            </button>
            <span class="room-tip-dialog__label">&gt; PAYMENT REQUEST</span>
            <code class="room-tip-dialog__uri">${escapeHtml(paymentUri)}</code>
          </div>
        </div>
        <div class="room-tip-dialog__actions">
          <a class="ui-button ui-button--primary" href="${escapeHtml(paymentUri)}">[ OPEN IN WALLET ↗ ]</a>
          <button class="ui-button ui-button--secondary" type="button" data-action="room-tip-copy" data-tip-uri="${escapeHtml(paymentUri)}">[ ${roomTipCopyFeedback || "COPY PAYMENT REQUEST"} ]</button>
        </div>
        <p class="room-tip-dialog__wallet-note">&gt; No wallet opened? Copy the request and paste it into your Zcash wallet.</p>
        <p class="room-tip-dialog__note">MAINNET · REAL ZEC · HIDN never holds the funds, and does not confirm payments or issue receipts.<span class="hidn-tip__caret" aria-hidden="true">▌</span></p>
      </div>
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
      light: "#7dff9a",
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
    ? `<button class="room-message__action room-message__action--tip" type="button" data-action="room-tip" data-thread-id="${escapeHtml(threadId)}">TIP WITH ZEC</button>`
    : "";
  const shareTextAttributes = threadId
    ? `data-share-text data-share-id="${escapeHtml(threadId)}" data-share-kind="thread" data-share-label="${escapeHtml(transmission.reference ?? "ANONYMOUS THREAD")}" data-share-category="${escapeHtml(transmission.category ?? "IDENTITY")}" data-share-time="${escapeHtml(transmission.time)}"`
    : "";
  const replyCount = threadId ? replyCountForThread(threadId, transmission.replies) : 0;
  const action = options.href && threadId
    ? `<div class="transmission-row__actions">
        <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(threadId)}" aria-pressed="${roomLikedIds.has(threadId)}"${hasRoomSession() ? "" : " disabled"}>♡ ${reactionCountForThread(threadId, transmission.reactions)}</button>
        <a class="room-message__action" href="${escapeHtml(options.href)}">↳ ${replyCount} ${replyCount === 1 ? "REPLY" : "REPLIES"}</a>
        <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(threadId)}">SHARE</button>
        ${tipAction}
        <span class="thread-share-status" data-share-status="${escapeHtml(threadId)}" role="status" aria-live="polite"></span>
      </div>`
    : options.href
      ? `<a class="transmission-row__view" href="${escapeHtml(options.href)}">OPEN <span aria-hidden="true">→</span></a>`
      : "";

  return `<article class="transmission-row${className}">
    <div class="transmission-row__meta">
      <span>ANONYMOUS${options.roomLabel ? ` · IN ${escapeHtml(options.roomLabel)}` : ""}</span>
      <time datetime="${escapeHtml(transmission.time)}">${escapeHtml(threadId ? timeAgo(transmission.time) || formatTransmissionTime(transmission.time) : formatTransmissionTime(transmission.time))}</time>
    </div>
    <p class="transmission-row__thought" ${shareTextAttributes}>“${escapeHtml(transmission.text)}”</p>
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
): Promise<Blob> {
  const replies = focusReply
    ? [focusReply.reply.text]
    : cardType === "BATCH" ? (suppliedReplies ?? []).map((reply) => reply.text) : [];
  const channel = roomChannelOptions.find((room) => room.key === confession.channel);
  return renderShareCard({
    text: confession.text,
    replies,
    room: channel?.label ?? (confession.category || "The room"),
    reference: confession.id,
    mark: String(confession.reference || `// ${confession.id.replace(/^THR-/, "").slice(0, 8)}`).toUpperCase(),
    theme: activeHidnTheme() === "signal" ? "signal" : "quiet",
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
  const profileName = roomAnonymousIdentity?.alias || "ANONYMOUS";
  return `<div class="room-menu" data-room-menu>
    <button class="room-menu__toggle" type="button" data-action="room-menu-toggle" aria-expanded="false" aria-controls="room-channel-menu" aria-label="Open private room menu">
      <span class="room-menu__icon" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="room-menu__label">CHANNELS</span>
    </button>
    <div class="room-menu__panel room-menu__panel--term" id="room-channel-menu" hidden>
      <div class="room-menu__bar" aria-hidden="true"><i></i><i></i><i></i><span>hidn@room: ~/menu</span></div>
      <p class="room-menu__cmd" aria-hidden="true">hidn@room:~$ whoami</p>
      <a class="room-menu__profile" href="/room/profile" aria-label="Open private profile">
        <span class="room-menu__profile-copy"><strong>&gt; PROFILE</strong><small>${escapeHtml(profileName)} · NAMELESS</small></span>
        <b aria-hidden="true">↗</b>
      </a>
      <a class="room-menu__profile" href="/room/inbox" aria-label="Open your anonymous link inbox">
        <span class="room-menu__profile-copy"><strong>&gt; MY LINK / INBOX</strong><small>ANONYMOUS MESSAGES TO YOU</small></span>
        <b aria-hidden="true">↗</b>
      </a>
      <p class="room-menu__cmd" aria-hidden="true">hidn@room:~$ ls</p>
      <nav aria-label="Private room channels">
        <a href="/room/rooms"><span>[1]</span> ROOMS <b aria-hidden="true">↗</b></a>
        <a href="/room/main"><span>[2]</span> 3D MUSEUM <b aria-hidden="true">↗</b></a>
        <a href="/how-it-works"><span>[3]</span> HOW IT WORKS <b aria-hidden="true">↗</b></a>
        <a href="/"><span>[4]</span> HOME <b aria-hidden="true">↗</b></a>
      </nav>
      <a class="room-menu__leave" href="/" data-room-logout><span aria-hidden="true">$ exit</span> LEAVE ROOM</a>
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

function publicWindowChrome(path: string, showRoomMenu = false, showZcashStatus = false): string {
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

function publicFrame(path: string, main: string, pageClass = ""): string {
  const normalizedPath = normalizePath(path);
  const isHome = normalizedPath === "/";
  const isRoomCreation = normalizedPath === "/room/access";
  const isHowItWorks = normalizedPath === "/how-it-works";
  const isAdminPage = normalizedPath === "/admin" || normalizedPath.startsWith("/admin/");
  const isRoomSurface = normalizedPath === "/room/feed" || normalizedPath === "/room" || normalizedPath === "/room/main" || normalizedPath === "/room/library" || normalizedPath === "/room/rooms" || normalizedPath === "/explore" || normalizedPath === "/room/orb" || normalizedPath === "/room/profile" || normalizedPath === "/room/hall" || Boolean(roomChannelSurfaceFromPath(normalizedPath)) || normalizedPath.startsWith("/c/");
  // Reading pages stay fully lit; the flashlight would hide the posts.
  const isPublicRead = normalizedPath === "/read" || normalizedPath.startsWith("/read/") || normalizedPath.startsWith("/to/");
  const isPointerSurface = !isHome && !isRoomCreation && !isRoomSurface && !isAdminPage && !isPublicRead;
  const themeClass = activeHidnTheme() === "signal" ? " public-page--theme-signal" : "";
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
    : [{ label: "HOW IT WORKS", href: "/how-it-works" }];

  return `<div class="public-page${isRoomCreation ? " public-page--room-access" : ""}${themeClass} ${pageClass} fx-grain fx-vignette${isPointerSurface ? " hidn-pointer-surface" : ""}"${isPointerSurface ? " data-pointer-surface" : ""}>
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${isPointerSurface ? renderPointerSpotlight() : ""}
    ${publicWindowChrome(path, isRoomSurface && normalizedPath !== "/room/profile")}
    ${isRoomSurface || isAdminPage || isRoomCreation || isHome ? "" : publicNavigation(path)}
    ${main}
    ${showsRoomBottomNav(normalizedPath) ? renderRoomBottomNav(normalizedPath) : ""}
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
    { key: "mixed", label: "MIXED" },
    { key: "latest", label: "LATEST" },
    { key: "felt", label: "FELT" },
  ];
  return {
    metadata: { ...EXPLORE_METADATA, title: "HIDN — Feed", canonicalPath: MIXED_FEED_PATH },
    html: !hasRoomSession()
      ? publicFrame(MIXED_FEED_PATH, renderConnectionLost(), "public-page--explore")
      : publicFrame(
        MIXED_FEED_PATH,
        `<main id="main-content" class="public-main explore-main">
          <div class="hidn-container--wide explore-page">
            <header class="explore-header">
              ${TerminalLabel("FEED / EVERY ROOM")}
              <h1 class="type-display-lg hidn-glitch-title" data-text="THE FEED">THE FEED</h1>
              <p>Recent posts from every room, shuffled. No names, ever.</p>
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
      <p class="room-post-tips__note">Let readers support this post directly with any amount of mainnet ZEC.</p>
    </fieldset>`;
  }

  return `<fieldset class="room-post-tips room-post-tips--enabled">
    <legend>OPTIONAL / DIRECT TIPS</legend>
    <label class="room-post-tips__toggle">
      <input id="room-post-allow-tips" type="checkbox" checked />
      <span>ALLOW TIPS ON THIS POST</span>
    </label>
    <label class="ui-field room-post-tips__address-field" for="room-post-tip-address">
      <span class="ui-field__label">SHIELDED MAINNET ADDRESS / THIS POST</span>
      <input id="room-post-tip-address" type="text" value="${escapeHtml(roomPostTipAddressDraft)}" placeholder="u1..." autocomplete="off" spellcheck="false" maxlength="500" />
    </label>
    <p class="room-post-tips__note">Use your saved default address or enter a different public shielded mainnet address for this post.</p>
    <p class="room-post-tips__warning" data-warning="REUSING AN ADDRESS MAY MAKE POSTS EASIER TO ASSOCIATE." role="note">Reusing an address may make posts easier to associate.</p>
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
    ${roomPostComposerOpen ? "" : `<div class="room-directory__create">${SecondaryButton({ label: "> SAY IT HERE", dataAction: "room-create-post" })}${renderRoomRefreshControl()}</div>`}
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
                  <span class="ui-field__label">POST WITHOUT A NAME / ${escapeHtml(activeChannel.label)}</span>
                  <textarea id="room-post-content" rows="5" maxlength="${roomPostCharacterLimit()}" placeholder="Leave a thought in the room...">${escapeHtml(roomPostText)}</textarea>
                </label>
                <p class="room-post-composer__note">${roomPostLimitCopy()} Your post is stored without a public name.</p>
                ${renderRoomPostTipControls()}
                <div class="room-post-composer__actions">
                  ${GhostButton({ label: "CANCEL", dataAction: "room-post-cancel" })}
                  ${SecondaryButton({ label: roomPostSubmitting ? "[ TRANSMITTING… ]" : "[ TRANSMIT ]", disabled: roomPostSubmitting, dataAction: "room-post-submit" })}
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

// The composer names the room a post goes to. Inside a room's own feed the
// room is fixed; elsewhere the visitor picks it, so a thought never lands in
// whichever room happened to be open last.
function renderRoomPostChannelPicker(): string {
  const fixed = roomChannelSurfaceFromPath(window.location.pathname);
  if (fixed) {
    return `<p class="room-post-channel room-post-channel--fixed">&gt; POSTING TO /${escapeHtml(roomChannelOption(fixed).label)}</p>`;
  }
  return `<fieldset class="room-post-channel">
    <legend>&gt; SEND TO ROOM</legend>
    <div class="room-post-channel__options">
      ${visibleRoomChannelOptions()
        .map((channel) => `<button type="button" class="room-post-channel__option" data-room-post-channel="${channel.key}" aria-pressed="${channel.key === activeRoomChannel}">/${escapeHtml(channel.label)}</button>`)
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
          <span class="ui-field__label">POST WITHOUT A NAME / ${escapeHtml(activeChannel.label)}</span>
        <textarea id="room-post-content" rows="5" maxlength="${roomPostCharacterLimit()}" placeholder="Leave a thought in the room...">${escapeHtml(roomPostText)}</textarea>
      </label>
        <p class="room-post-composer__note">${roomPostLimitCopy()}</p>
        ${renderRoomPostTipControls()}
        <div class="room-post-composer__actions">
          ${GhostButton({ label: "CANCEL", dataAction: "room-post-cancel" })}
          ${SecondaryButton({ label: roomPostSubmitting ? "[ TRANSMITTING… ]" : "[ TRANSMIT ]", disabled: roomPostSubmitting, dataAction: "room-post-submit" })}
        </div>
      </form>`
    : `<div class="room-mobile-index__create-actions">${SecondaryButton({ label: "> SAY IT HERE", dataAction: "room-create-post" })}${renderRoomRefreshControl()}</div>`;

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

function renderMobileRoomIndex(): string {
  const signalMode = activeHidnTheme() === "signal";
  const rooms = visibleRoomChannelOptions()
    .map((channel) => `<button class="room-mobile-index__room" type="button" data-room-channel="${channel.key}" aria-label="Open ${escapeHtml(channel.label)} room">
      <span class="room-mobile-index__number" aria-hidden="true">ᙇ</span>
      <span class="room-mobile-index__copy"><strong>${escapeHtml(channel.label)}</strong><small>${escapeHtml(channel.description)}</small></span>
      <span class="room-mobile-index__arrow" aria-hidden="true">→</span>
    </button>`)
    .join("");

  return publicFrame(
    "/room/rooms",
    `<main id="main-content" class="public-main room-mobile-index-main">
      <div class="hidn-container--reading explore-page room-mobile-index">
        <header class="room-mobile-index__header">
          ${TerminalLabel(signalMode ? "PRIVATE ROOM / INDEX" : "PRIVATE ROOM")}
          <h1 class="hidn-glitch-title" data-text="CHOOSE A R&nbsp;&nbsp;M.">CHOOSE A R<span class="room-directory-title__double-o">OO${renderRoomEyeWatcher("room-directory-title__watcher")}</span>M.</h1>
          <p>Read quietly or leave a thought without a public name.</p>
          <p class="hidn-feed-log" aria-hidden="true">&gt; ls /rooms · ${visibleRoomChannelOptions().length} open · listening<span class="hidn-feed-log__caret">▌</span></p>
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
  const headerTitle = isChannelRoute ? channel.label : "THE ROOM";
  const headerCopy = isChannelRoute
    ? signalMode
      ? `${channel.description}. Anonymous thoughts and replies stay inside this room.`
      : `${channel.description}. Thoughts and replies stay inside this room, without public names.`
    : "Thoughts move through the room without names. Follow one thread or leave one behind.";

  if (!hasRoomSession()) {
    return publicFrame(
      path,
      renderConnectionLost(),
      "public-page--explore",
    );
  }

  return publicFrame(
    path,
    `<main id="main-content" class="public-main explore-main">
      <div class="hidn-container--wide explore-page">
        <header class="explore-header">
          ${isChannelRoute ? `<a class="room-channel-back" href="/room/rooms">← BACK TO ROOMS</a>` : ""}
          ${TerminalLabel(headerLabel)}
          <h1${isChannelRoute ? ` id="room-channel-title"` : ""} class="type-display-lg hidn-glitch-title" data-text="${escapeHtml(headerTitle)}">${escapeHtml(headerTitle)}</h1>
          <p>${escapeHtml(headerCopy)}</p>
          <p class="hidn-feed-log" aria-hidden="true">&gt; tail -f /rooms/${escapeHtml(channel.key)} · listening<span class="hidn-feed-log__caret">▌</span></p>
          ${renderKeyReminder(roomAccountRecoveryCode)}
          ${isChannelRoute && !signalMode ? `<div class="room-channel-header__signals">${renderRoomZcashStatus()}${renderRoomNotifications()}</div>` : ""}
          ${isRoomMobileViewport() ? renderMobilePostSurface() : ""}
        </header>
        <div class="explore-layout">
          <section class="explore-feed" aria-labelledby="${isChannelRoute ? "room-channel-title" : "explore-feed-title"}">
            ${signalMode || !isChannelRoute ? `<div class="explore-feed__heading">
              <div>
                ${TerminalLabel("CURRENT ROOM / ANONYMOUS THREADS")}
                <h2 id="explore-feed-title" class="type-heading-2">// ${escapeHtml(roomChannelOption(activeRoomChannel).label)} / THOUGHTS IN MOTION</h2>
              </div>
              <div class="explore-feed__signals">${renderRoomZcashStatus()}${renderRoomNotifications()}</div>
            </div>` : ""}
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
        <h2 id="thread-room-title">&gt;&gt; REPLIES</h2>
      </div>
      <span class="thread-room__signal"><i aria-hidden="true"></i> ${replyCount ? `RECEIVING / ${replyCount}` : "OPEN CHANNEL"}</span>
    </header>
    ${quotedText ? `<blockquote class="thread-room__quote" data-share-text data-share-id="${escapeHtml(id)}" data-share-kind="thread" data-share-label="ORIGINAL THREAD" data-share-category="IDENTITY" data-share-time="NOW">“${escapeHtml(quotedText)}”</blockquote>` : ""}
    <div class="thread-room__messages" aria-live="polite">${messages}</div>
    <form class="thread-room__composer${roomAccess ? "" : " thread-room__composer--locked"}" novalidate>
      <label class="ui-field thread-room__field" for="thread-reply-${escapeHtml(id)}">
        <span class="ui-field__label">&gt; REPLY WITHOUT A NAME</span>
        <textarea id="thread-reply-${escapeHtml(id)}" data-thread-input rows="4" maxlength="${roomReplyCharacterLimit()}" placeholder="${roomAccess ? "Add your thought to the thread..." : "Enter the room to reply anonymously."}"${roomAccess ? "" : " disabled"}></textarea>
      </label>
      <div class="thread-room__composer-footer">
        <span>${roomAccess ? "NAMELESS / NO TRAIL" : "ROOM ACCESS REQUIRED"}</span>
        ${SecondaryButton({ label: roomReplySubmitting ? "[ TRANSMITTING… ]" : roomAccess ? "[ TRANSMIT ]" : "[ ENTER THE ROOM FIRST ]", disabled: !roomAccess || roomReplySubmitting, dataAction: "thread-reply" })}
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
            ${livePost ? `<a class="hidn-detail__back" href="/room/channel/${escapeHtml(livePost.channel)}/feed">&lt; cd ..</a>` : ""}
            <p class="hidn-detail__log">hidn@room:~$ cat /rooms/${escapeHtml(livePost?.channel ?? "archive")}/${escapeHtml(confession.reference.replace(/^\/\/\s*/, "").toLowerCase())}.txt</p>
            <h1 class="detail-page__title hidn-detail__title" data-text="ANONYMOUS CONFESSION">ANONYMOUS CONFESSION</h1>
            <div class="detail-header__meta"><span>[rx] ${escapeHtml(confession.reference)}</span><time datetime="${escapeHtml(confession.time)}">${escapeHtml(confession.relativeTime)}</time></div>
          </header>
          <article class="detail-card" aria-labelledby="detail-thought">
            <p class="hidn-detail__signed" aria-label="Signed: name withheld">&gt; SIGNED: <span class="hidn-detail__redact" aria-hidden="true"></span></p>
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
          <div class="detail-actions" aria-label="Confession actions">
            <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(confession.id)}" aria-pressed="${roomLikedIds.has(confession.id)}"${hasRoomSession() ? "" : " disabled"}>♡ ${escapeHtml(String(reactionCountForThread(confession.id, confession.reactions)))}</button>
            <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">COMMENTS ${escapeHtml(String(detailReplyCount))}</a>
            <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">QUOTE</a>
            <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(confession.id)}">SAVE IMAGE</button>
            <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(confession.id)}">SHARE IMAGE</button>
            ${livePost?.tipAddress ? `<button class="room-message__action room-message__action--tip" type="button" data-action="room-tip" data-thread-id="${escapeHtml(confession.id)}">TIP WITH ZEC</button>` : ""}
            <button class="room-message__action" type="button" data-action="thread-x-share" data-thread-id="${escapeHtml(confession.id)}">X / POST</button>
            <button class="room-message__action" type="button" data-action="report-open" data-report-target-type="thread" data-report-target-id="${escapeHtml(confession.id)}" data-report-target-label="${escapeHtml(confession.reference)}" data-report-target-excerpt="${escapeHtml(confession.text)}">REPORT</button>
          </div>
          <p class="thread-share-status thread-share-status--detail" data-share-status="${escapeHtml(confession.id)}" role="status" aria-live="polite"></p>
          ${roomReportNotice ? `<p class="thread-share-status thread-share-status--detail" role="status">${escapeHtml(roomReportNotice)}</p>` : ""}
          ${renderThreadRoom(confession.id)}

          ${actionLink("BACK TO THE ROOM", "/room", "ghost", "detail-back")}
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

/** The phone-style bar along the bottom of the reading pages. The museum
 * pages keep their own walking controls there, so it stays off them. */
function showsRoomBottomNav(path: string): boolean {
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

function renderRoomBottomNav(path: string): string {
  const inboxUnread = linkInboxUnreadCount();
  const meUnread = roomNotifications?.unreadCount ?? 0;
  const badge = (count: number): string => (count > 0 ? `<b class="hidn-bottom-nav__badge" aria-label="${count} new">${count > 99 ? "99+" : count}</b>` : "");
  const item = (href: string, label: string, active: boolean, extra = ""): string =>
    `<a class="hidn-bottom-nav__item${active ? " hidn-bottom-nav__item--active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}><span>${label}</span>${extra}</a>`;
  return `<nav class="hidn-bottom-nav" aria-label="Room" data-bottom-nav>
    ${item(MIXED_FEED_PATH, "FEED", path === MIXED_FEED_PATH || path.startsWith("/c/"))}
    ${item("/room/rooms", "ROOMS", path === "/room/rooms" || Boolean(roomChannelFeedFromPath(path)))}
    ${item("/room/main", "MUSEUM", isMuseumPath(path))}
    ${item("/room/inbox", "INBOX", path === "/room/inbox", badge(inboxUnread))}
    ${item("/room/profile", "ME", path === "/room/profile", badge(meUnread))}
  </nav>`;
}

/** The bar slides out of the way while scrolling down through posts and
 * comes back on the way up, so it never sits on top of what people read. */
let bottomNavScrollWatched = false;
let bottomNavLastY = 0;
let bottomNavHidden = false;
function watchBottomNavScroll(): void {
  const apply = (): void => {
    document.querySelector("[data-bottom-nav]")?.classList.toggle("hidn-bottom-nav--away", bottomNavHidden);
  };
  apply();
  if (bottomNavScrollWatched) return;
  bottomNavScrollWatched = true;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
    const next = y > 120 && y > bottomNavLastY + 6 && !nearBottom ? true : y < bottomNavLastY - 6 || y <= 120 || nearBottom ? false : bottomNavHidden;
    bottomNavLastY = y;
    if (next !== bottomNavHidden) {
      bottomNavHidden = next;
      apply();
    }
  }, { passive: true });
}

/** Where members land: the feed, so reading and posting come first. The 3D
 * museum is one tap away in the bottom bar and the channels menu. */
const ROOM_HOME_PATH = "/room/feed";

function navigateIntoRoom(path = ROOM_HOME_PATH, options: { portal?: boolean } = {}): void {
  sessionStorage.setItem("hidn:room:entered", "true");
  // After creating or recovering access, the visitor falls through a portal.
  if (options.portal) {
    void playPortal().then(() => navigateProductRoute(path));
    return;
  }
  navigateProductRoute(path);
}

function renderRoomAccessChooser(): string {
  return `<div class="hidn-access" data-hidn-type-panel>
    <p class="hidn-access__code" data-hidn-type>/// ACCESS</p>
    <h1 data-hidn-type data-text="CROSS THE THRESHOLD.">CROSS THE THRESHOLD.</h1>
    <p class="hidn-access__line" data-hidn-type>&gt; NO EMAIL. NO USERNAME. ONE TAP AND YOU GET A PRIVATE KEY.</p>
    <p class="hidn-access__line" data-hidn-type>&gt; THAT KEY IS YOUR ACCOUNT. SAVE IT AND YOU CAN ALWAYS COME BACK.</p>
    ${roomLoginError ? `<p class="hidn-access__error" role="alert">!! ${escapeHtml(roomLoginError)}</p>` : ""}
    <div class="hidn-access__actions" data-hidn-type-reveal>
      ${SecondaryButton({ label: roomAnonymousSubmitting ? "[ MAKING YOUR KEY... ]" : "[ GET MY KEY ]", disabled: roomAnonymousSubmitting, dataAction: "room-create-account" })}
      ${SecondaryButton({ label: "[ I HAVE A KEY ]", dataAction: "room-login" })}
    </div>
  </div>`;
}

function renderRoomCreate(): string {
  return `<div class="hidn-access" data-hidn-type-panel>
    <p class="hidn-access__code" data-hidn-type>/// ACCESS / NEW KEY</p>
    <h1 data-hidn-type data-text="KEEP YOUR KEY.">KEEP YOUR KEY.</h1>
    <p class="hidn-access__line" data-hidn-type>&gt; HIDN CREATES A PRIVATE RECOVERY KEY IN THIS BROWSER.</p>
    <p class="hidn-access__line" data-hidn-type>&gt; NO USERNAME. NO HANDLE. NO PUBLIC IDENTITY.</p>
    <p class="hidn-access__line hidn-access__line--warn" data-hidn-type>&gt; SAVE IT WHEN IT APPEARS. HIDN CANNOT RECOVER IT.</p>
    ${roomLoginError ? `<p class="hidn-access__error" role="alert">!! ${escapeHtml(roomLoginError)}</p>` : ""}
    <div class="hidn-access__actions" data-hidn-type-reveal>
      ${GhostButton({ label: "[ ← BACK ]", dataAction: "room-back" })}
      ${SecondaryButton({ label: roomAnonymousSubmitting ? "[ CREATING KEY... ]" : "[ GENERATE RECOVERY KEY ]", disabled: roomAnonymousSubmitting, dataAction: "room-create-account" })}
    </div>
  </div>`;
}

function renderRoomLogin(): string {
  return `<div class="hidn-access" data-hidn-type-panel>
    <p class="hidn-access__code" data-hidn-type>/// ACCESS / RECOVER</p>
    <h1 data-hidn-type data-text="RETURN TO THE ROOM.">RETURN TO THE ROOM.</h1>
    <p class="hidn-access__line" data-hidn-type>&gt; TAP THE BOX: IF YOU SAVED YOUR KEY TO PASSWORDS, IT FILLS ITSELF IN. OR PASTE IT.</p>
    ${roomLoginError ? `<p class="hidn-access__error" role="alert">!! ${escapeHtml(roomLoginError)}</p>` : ""}
    <form class="room-login-card hidn-access__form" data-room-login-form action="/room/access" method="post" autocomplete="on" novalidate>
      <input class="hidn-key__sr" type="text" name="username" autocomplete="username" value="${KEY_CREDENTIAL_NAME}" readonly tabindex="-1" aria-hidden="true" />
      <label class="hidn-access__prompt" for="room-login-recovery-code">
        <span aria-hidden="true">hidn@room:~$</span>
        <span class="hidn-term__sr">Your HIDN key</span>
        <input id="room-login-recovery-code" name="password" type="password" placeholder="HIDN-ANON-XXXX-..." autocomplete="current-password" spellcheck="false" autocapitalize="characters" />
      </label>
      ${canReadSavedKey() ? `<button class="hidn-key__btn" type="button" data-action="room-login-saved">[ USE MY SAVED KEY ]</button>` : ""}
      <div class="hidn-access__actions" data-hidn-type-reveal>
        ${GhostButton({ label: "[ ← BACK ]", dataAction: "room-back" })}
        ${SecondaryButton({ label: roomLoginSubmitting || roomAnonymousSubmitting ? "[ VERIFYING KEY... ]" : "[ ENTER WITH KEY ]", disabled: roomLoginSubmitting || roomAnonymousSubmitting, dataAction: "room-submit-login" })}
      </div>
    </form>
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
  const signalMode = activeHidnTheme() === "signal";
  const titleText = isNewAccount ? "SAVE YOUR KEY." : "THE ROOM IS OPEN.";
  const titlePrefix = isNewAccount ? "SAVE YOUR" : "THE ROOM IS";
  const titleSignal = isNewAccount ? "KEY." : "OPEN.";
  const accountCopy = isNewAccount
    ? "You're in. One last thing before you enter: save your key."
    : "You're signed in. Head into the room to read, post and reply.";
  const keySaved = isKeySaved(roomAccountRecoveryCode);

  return `<div class="room-access-page room-access-page--ready">
    <header class="room-access-header room-access-header--compact">
      ${signalMode ? TerminalLabel("HIDN / YOUR KEY") : ""}
      <h1 class="type-display-lg room-access-header__title" aria-label="${escapeHtml(titleText)}">
        ${escapeHtml(titlePrefix)}<br />
        <em>${escapeHtml(titleSignal)}</em>
      </h1>
      <p class="room-access-header__copy">${escapeHtml(accountCopy)}</p>
    </header>
    ${roomAnonymousIdentity && isNewAccount && roomAccountRecoveryCode ? renderKeySaveCard(roomAccountRecoveryCode, { heading: "THIS KEY IS YOUR WAY BACK IN." }) : roomAnonymousIdentity ? renderRoomRecoveryPanel() : ""}
    <div class="room-access-actions">
      ${isNewAccount && !keySaved
        ? GhostButton({ label: "[ ENTER WITHOUT SAVING ]", className: "room-ready-enter", dataAction: "room-enter" })
        : SecondaryButton({ label: isNewAccount ? "ENTER THE ROOM →" : "GO BACK TO ROOM →", className: "room-ready-enter", dataAction: "room-enter" })}
    </div>
  </div>`;
}

function renderProfileTipAddress(): string {
  if (!roomTipAddressLoaded) {
    return `<section class="room-profile-card room-profile-card--tips" aria-labelledby="room-profile-tips-title" aria-busy="true">
      ${TerminalLabel("ZEC TIPS / OPTIONAL")}
      <h2 id="room-profile-tips-title">DIRECT SUPPORT</h2>
      <p class="room-profile-card__note">READING YOUR MAINNET DESTINATION...</p>
    </section>`;
  }

  return `<section class="room-profile-card room-profile-card--tips" aria-labelledby="room-profile-tips-title">
    ${TerminalLabel("ZEC TIPS / OPTIONAL")}
    <h2 id="room-profile-tips-title">LET THE ROOM SUPPORT YOU.</h2>
    <p class="room-profile-card__note">Want people to be able to tip your posts? Paste a private (shielded) Zcash address from your wallet. Your new posts get a TIP WITH ZEC button, and tips go straight to you. HIDN never holds any money.</p>
    <form class="room-tip-address-form" data-room-tip-address-form novalidate>
      <label class="ui-field" for="room-tip-address">
        <span class="ui-field__label">SHIELDED MAINNET ADDRESS / OPTIONAL</span>
        <input id="room-tip-address" type="text" value="${escapeHtml(roomTipAddressDraft)}" placeholder="u1..." autocomplete="off" spellcheck="false" maxlength="500" />
      </label>
      <p class="room-tip-address-form__hint">Only shielded mainnet addresses beginning with <code>u1</code> or <code>zs1</code> are accepted. Leave it empty to turn tips off for future posts.</p>
      ${roomTipAddressError ? `<p class="room-tip-address-form__feedback room-tip-address-form__feedback--error" role="alert">${escapeHtml(roomTipAddressError)}</p>` : ""}
      ${roomTipAddressFeedback ? `<p class="room-tip-address-form__feedback" role="status">${escapeHtml(roomTipAddressFeedback)}</p>` : ""}
      ${SecondaryButton({ label: roomTipAddressSaving ? "SAVING DESTINATION..." : "SAVE MAINNET DESTINATION →", type: "submit", disabled: roomTipAddressSaving, dataAction: "room-tip-address-save" })}
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
    const repeatInstruction = "VISIBLE FOR 20 SECONDS / REPEAT THE CONFIRMATIONS TO REVEAL IT AGAIN.";
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

  // A terminal handshake that prints, then stalls: verification is not live
  // yet, so the screen says so plainly instead of pretending to work.
  return `<div class="hidn-verification-notice hidn-verification-notice--term" data-zec-verification-notice role="dialog" aria-modal="true" aria-labelledby="hidn-verification-notice-title">
    <button class="hidn-verification-notice__backdrop" type="button" data-action="room-verification-notice-close" aria-label="Close Zcash verification notice"></button>
    <section class="hidn-verification-notice__panel hidn-term hidn-term--verify">
      <div class="hidn-term__bar"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i><span aria-hidden="true">hidn@room: ~/verify</span>
        <button class="hidn-verify__close-x" type="button" data-action="room-verification-notice-close" aria-label="Close Zcash verification notice">×</button>
      </div>
      <div class="hidn-term__body hidn-verify">
        <p class="hidn-verify__log">hidn@room:~$ ./verify --zec --shielded</p>
        <p class="hidn-verify__log"><b>[ OK ]</b> SHIELDED CHANNEL OPEN</p>
        <p class="hidn-verify__log"><b>[ OK ]</b> IDENTITY STAYS WITHHELD</p>
        <p class="hidn-verify__log hidn-verify__log--wait"><b>[WAIT]</b> MAINNET VERIFICATION MODULE</p>
        <div class="hidn-verify__progress" role="img" aria-label="Zcash verification is still being built">
          <span class="hidn-verify__bar"><i></i></span>
          <span class="hidn-verify__pct">BUILDING</span>
        </div>
        <h2 id="hidn-verification-notice-title" class="hidn-verify__title" data-text="HOLD TIGHT, ANON.">HOLD TIGHT, ANON.</h2>
        <p class="hidn-verify__line">&gt; Zcash verification is on its way. Until it lands, your room works as it does now, still without a name.</p>
        <p class="hidn-verify__status"><span class="hidn-verify__dot" aria-hidden="true"></span> STATUS: COMING SOON<span class="hidn-verify__caret" aria-hidden="true">▌</span></p>
        <button class="hidn-verify__close" type="button" data-action="room-verification-notice-close">[ CLOSE ]</button>
      </div>
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
      title: "HIDN — Private profile",
      description: "A private HIDN profile for recovery access and personal room history.",
      canonicalPath: "/room/profile",
    },
    html: publicFrame(
      "/room/profile",
      `<main id="main-content" class="public-main room-main room-profile-main hidn-term-main">
        ${terminalWindow("hidn@room: ~/profile", `<div class="room-profile-page hidn-profile">
          <header class="hidn-access">
            <p class="hidn-access__code">/// PROFILE</p>
            <h1>YOUR CORNER. NOBODY ELSE SEES IT.</h1>
            <p class="hidn-access__line" data-hidn-type>&gt; Only you can see this page. Your key is your account, and nothing here is linked to your name. Your list of past posts is kept on this device only.</p>
          </header>
          <section class="room-profile-card room-profile-card--identity" aria-labelledby="room-profile-status-title">
            <div class="room-profile-card__heading">
              <div>
                ${TerminalLabel("YOU / TODAY'S ANONYMOUS NAME")}
                <h2 id="room-profile-status-title">${escapeHtml(profileLabel)}</h2>
              </div>
              ${StatusIndicator("SIGNED IN · NO NAME", "online", true)}
            </div>
            <p class="room-profile-card__note">This name changes every time you sign in, so nobody can follow you around. You can post, reply and like, up to ${roomPostCharacterLimit()} characters at a time. Your post history below lives on this device only.</p>
            <div class="room-profile-stats" aria-label="Private account totals">
              <div><span>TOTAL POSTS</span><strong>${formatPrivateTotal(profileStats.posts)}</strong></div>
              <div><span>TOTAL COMMENTS</span><strong>${formatPrivateTotal(profileStats.comments)}</strong></div>
              <div><span>LIKES RECEIVED</span><strong>${formatPrivateTotal(profileStats.likes)}</strong></div>
            </div>
            <div class="room-profile-card__actions">
              ${SecondaryButton({ label: "[ VERIFY WITH ZEC ]", dataAction: "room-open-verification" })}
              ${GhostButton({ label: "[ CONTINUE ]", dataAction: "room-profile-back" })}
            </div>
          </section>
          <section class="room-profile-card room-profile-card--link" aria-labelledby="room-profile-link-title">
            ${TerminalLabel("LINK / ANONYMOUS INBOX")}
            <h2 id="room-profile-link-title">LET THEM SAY IT. NO NAMES.</h2>
            <p class="room-profile-card__note">Get one link to share anywhere. Anyone can leave you a message through it without a name, with an optional ZEC tip. Your link never shows your alias or your posts.</p>
            <div class="room-profile-card__actions">
              <a class="ui-button ui-button--secondary" href="/room/inbox">[ OPEN MY LINK / INBOX → ]</a>
            </div>
          </section>
          ${renderProfileTipAddress()}
          ${roomAccountRecoveryCode && (!isKeySaved(roomAccountRecoveryCode) || keyJustSaved()) ? `<div id="key" class="room-profile-card room-profile-card--save-key">${renderKeySaveCard(roomAccountRecoveryCode)}</div>` : ""}
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
            ${GhostButton({ label: "[ ← BACK TO THE ROOM ]", dataAction: "room-profile-back" })}
          </div>
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
      title: "HIDN — Your link",
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
      title: "HIDN — Say it. No names.",
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
      `<main id="main-content" class="public-main room-main room-access-main hidn-term-main">
        ${terminalWindow(`hidn@room: ~/access${roomAccessMode === "create" ? "/new-key" : roomAccessMode === "login" ? "/recover" : roomAccessMode === "ready" ? "/open" : ""}`, content, "hidn-term--access")}
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
      title: "HIDN — 404",
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
  return {
    metadata: HOME_METADATA,
    html: publicFrame("/", `<main id="main-content" class="public-main home-main">
      <section class="room-museum museum-foyer museum-foyer--preface" data-room-museum data-museum-foyer aria-labelledby="hidn-welcome-title">
        <div class="room-museum__stage" data-museum-stage><p class="room-museum__loading" data-museum-loading role="status" hidden>OPENING THE GALLERY…</p></div>
        <aside class="room-museum__reader" data-museum-reader hidden role="dialog" aria-labelledby="foyer-reader-title">
          <div class="room-museum__reader-top"><span id="foyer-reader-title" data-museum-post-category>SAMPLE THOUGHT</span><button type="button" data-museum-reader-close aria-label="Close thought">×</button></div>
          <blockquote data-museum-post-text></blockquote>
          <footer><span>PUBLIC FOYER</span><a href="${enterPath}">ENTER ROOM →</a></footer>
        </aside>
        <div class="hidn-welcome"><div class="hidn-welcome__panel">
          <h1 id="hidn-welcome-title" data-text="WELCOME TO HIDN" data-hidn-type>WELCOME TO HIDN</h1>
          <p class="hidn-welcome__sub" data-hidn-type>SAY THE THING YOU CAN'T SAY OUT LOUD.</p>
          <p class="hidn-welcome__question" data-hidn-type>NOBODY WILL EVER KNOW IT WAS YOU.</p>
          <div class="hidn-welcome__actions" data-hidn-type-reveal>
            <a class="hidn-welcome__enter hidn-welcome__enter--ready" href="${enterPath}">[ ${signedIn ? "RETURN TO ROOM" : "ENTER ROOM"} ]</a>
            <a class="hidn-welcome__enter hidn-welcome__enter--ready hidn-welcome__enter--ghost" href="/read">[ READ FIRST ]</a>
          </div>
          <p class="hidn-welcome__free">PRIVATE · NO NAME · NO USERNAME</p>
        </div>
        <figure class="hidn-welcome__ticker" data-home-ticker hidden aria-live="off">
          <blockquote data-home-ticker-text></blockquote>
          <figcaption data-home-ticker-meta></figcaption>
        </figure></div>
        <p class="hidn-welcome__hint" data-museum-status>DRAG TO LOOK AROUND</p>
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
      ? { ...HOME_METADATA, title: "HIDN — The Private Room", canonicalPath: foyerPath }
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
      metadata: { ...EXPLORE_METADATA, title: "HIDN — Museum Preview", canonicalPath: "/museum-preview" },
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
        title: "HIDN — The Room",
        canonicalPath: "/room",
      },
      html: renderRoomMuseum(),
    };
  }

  if (normalizedPath === "/room/library") {
    return {
      metadata: { ...EXPLORE_METADATA, title: "HIDN — The Library", canonicalPath: normalizedPath },
      html: renderLibraryMuseum(),
    };
  }

  if (normalizedPath === "/room/orb") {
    return {
      metadata: {
        ...EXPLORE_METADATA,
        title: "HIDN — The Room",
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
        title: "HIDN — The Museum",
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
        title: `HIDN — ${roomChannelOption(roomChannelFeed).label} Feed`,
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
        title: `HIDN — ${roomChannelOption(roomChannel).label}`,
        canonicalPath: normalizedPath,
      },
      html: renderRoomChannelMuseum(roomChannel),
    };
  }

  if (normalizedPath === "/room/profile") {
    return renderRoomProfile();
  }

  const readChannel = readChannelFromPath(normalizedPath);
  if (readChannel) {
    return {
      metadata: {
        ...HOME_METADATA,
        title: "HIDN — Read first",
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

  if (normalizedPath === "/explore" || normalizedPath === "/room/rooms") {
    // The social rooms section: every room's feed, without the 3D museum.
    if (normalizedPath === "/explore") window.history.replaceState({}, "", "/room/rooms");
    return {
      metadata: { ...EXPLORE_METADATA, title: "HIDN — Rooms", canonicalPath: "/room/rooms" },
      html: isRoomMobileViewport() ? renderMobileRoomIndex() : renderExplore("/room/rooms"),
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
  bottomNavHidden = false;
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

      if (isRoomMobileViewport()) {
        navigateProductRoute(`/room/channel/${key}/feed`);
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
        const returning = hasRoomSession();
        beginEntry(() => navigateIntoRoom(returning ? ROOM_HOME_PATH : "/room/access"));
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

export function bindProductRoute(root: ParentNode = document): void {
  welcomeCleanup?.();
  welcomeCleanup = mountWelcome(root);
  homeTickerCleanup?.();
  homeTickerCleanup = mountHomeTicker(root);
  bindReadPage(root);
  bindKeySaveCard(root, roomAccountRecoveryCode);
  bindKeyReminder(root);
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
  watchBottomNavScroll();
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
  if (roomAnonymousIdentity && showsRoomBottomNav(normalizePath(window.location.pathname))) {
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
