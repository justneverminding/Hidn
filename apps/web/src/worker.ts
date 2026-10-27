import {
  ANONYMOUS_LEGACY_PROTOCOL_VERSION,
  ANONYMOUS_PROTOCOL_VERSION,
  ANONYMOUS_TREE_DEPTH,
  anonymousBinding,
  anonymousTargetScope,
  canonicalAnonymousMessage,
  createAnonymousMerkleSnapshot,
  parseField,
} from "@hidn/anonymous-zk";
import { verifyAnonymousGroth16Proof } from "@hidn/anonymous-zk/verifier";
import { roomClosedReason, roomLinkByKey, roomLinkBySlug } from "./product/room-links";
import anonymousVerifierWasm from "../../../packages/anonymous-zk/wasm/bn128.wasm";

// Keep the edge verifier bundle fresh when its shared anonymous-zk runtime changes.

const CIPHERSCAN_RECENT_BLOCKS_URL =
  "https://api.mainnet.cipherscan.app/api/blocks?limit=1";
const SHIELDEDSCAN_STATUS_URL = "https://api.shieldedscan.xyz/v1/status";
const SHIELDEDSCAN_SUPPLY_URL = "https://api.shieldedscan.xyz/v1/supply";
const MAIN_ROOM_ID = "HIDN-MAIN-ROOM";
const CANONICAL_ORIGIN = "https://hidnroom.com";
const ROOM_FREE_POST_MAX_LENGTH = 500;
const ROOM_FREE_REPLY_MAX_LENGTH = 500;
const ABUSE_WINDOW_MS = 10 * 60 * 1000;
const ABUSE_REPEAT_WINDOW_MS = 30 * 60 * 1000;
const ABUSE_SIGNAL_TTL_MS = 2 * 60 * 60 * 1000;
const ABUSE_EDGE_BUCKET_MS = 30 * 60 * 1000;
const ABUSE_BURST_THRESHOLD = 5;
const ABUSE_COOLDOWN_RISK_THRESHOLD = 3;
const ABUSE_COOLDOWN_BASE_MS = 30 * 1000;
const ABUSE_COOLDOWN_MAX_MS = 15 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 64 * 1024;
const LIVE_ACTIVITY_LIMIT = 8;
const LIVE_ACTIVITY_RETENTION_MS = 24 * 60 * 60 * 1000;
const ANONYMOUS_NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ANONYMOUS_MAX_MEMBERS = 2 ** ANONYMOUS_TREE_DEPTH;
const AMBIENT_ROOM_THREAD_IDS = new Set([
  "00417",
  "00416",
  "00415",
  "00414",
  "00413",
  "00412",
  "00411",
  "00410",
  "00409",
  "00408",
]);

type RoomChannel = "general" | "love" | "ragebait" | "underground" | "wildest" | "students" | "crypto" | "haunted";
type ActivityAction = "JUST OPENED" | "JUST RETURNED" | "JUST POSTED" | "JUST REPLIED";
type ActivitySubject = "A ROOM KEY" | "TO THE ROOM" | "A THOUGHT" | "A THREAD";
type NotificationEventType = "reaction" | "reply";
type ReportTargetType = "thread" | "reply" | "account";
type ReportReason = "spam" | "harassment" | "threats" | "sexual_content" | "personal_data" | "self_harm" | "other";
type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";
type ModerationAction = "approve" | "hide" | "reject";
interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface RoomDatabase {
  prepare(query: string): D1Statement;
}

/** Notifications never name who acted. */
const ANONYMOUS_ACTOR = "ANONYMOUS";

interface HidnWorkerEnv {
  ASSETS: AssetFetcher;
  ROOM_DB?: RoomDatabase;
  REPORT_ADMIN_TOKEN?: string;
  ALLOW_LEGACY_ADMIN_TOKEN?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  HIDN_SUPER_ADMIN_ACCESS_SUBJECT?: string;
  HIDN_SUPER_ADMIN_EMAIL?: string;
  ANONYMOUS_ZK_ENABLED?: string;
  /** Verification key for the version 1 circuit (private scope). */
  ANONYMOUS_ZK_VERIFICATION_KEY?: string;
  /** Verification key for the version 2 circuit (public scope). */
  ANONYMOUS_ZK_VERIFICATION_KEY_V2?: string;
}

interface ShieldedScanStatusPayload {
  height?: unknown;
  circulatingSupplyZat?: unknown;
  priceUsd?: unknown;
  txCount24h?: unknown;
  asOf?: unknown;
}

interface ShieldedScanSupplyPayload {
  shieldedZat?: unknown;
  asOf?: unknown;
}

interface ShieldedScanStatsResponse {
  blockHeight: number;
  priceUsd: number | null;
  transactions24h: number | null;
  shieldedSupplyZec: number | null;
  marketCapUsd: number | null;
  asOf: number | null;
}

interface AbuseSignalRow {
  signal_key: string;
  window_started_at: string;
  action_count: number;
  risk_score: number;
  last_content_hash: string | null;
  last_content_at: string | null;
  cooldown_until: string | null;
  expires_at: string;
  updated_at: string;
}

interface AbuseSignalObservation {
  actionCount: number;
  riskScore: number;
  cooldownUntil: string | null;
}

interface AdminReportRow {
  report_id: string;
  target_type: ReportTargetType;
  target_id: string;
  target_excerpt: string;
  reason: ReportReason;
  details: string;
  reporter_user_id: string | null;
  reporter_username: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewer_note: string;
}

type AdminRole = "super_admin" | "moderator" | "reviewer";
type AdminStatus = "active" | "disabled";

interface AdminUserRow {
  admin_id: string;
  access_subject_hash: string | null;
  email: string | null;
  display_name: string | null;
  role: AdminRole;
  status: AdminStatus;
  created_at: string;
  last_seen_at: string | null;
}

interface AdminAuditRow {
  event_id: string;
  admin_id: string;
  admin_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  created_at: string;
}

interface CloudflareAccessClaims {
  sub: string;
  email: string | null;
  name: string | null;
  iss: string;
  aud: string | string[];
  exp: number;
  iat?: number;
}

interface AdminActor {
  adminId: string;
  email: string | null;
  displayName: string | null;
  role: AdminRole;
  source: "cloudflare_access" | "legacy_token";
}

interface RoomPostRow {
  thread_id: string;
  content: string;
  category: string;
  channel: RoomChannel;
  created_at: string;
  tip_address?: string | null;
  reactions?: number;
  reply_count?: number;
  liked_by_current_user?: number;
  anonymous_notification_capability_hash?: string | null;
}

interface RoomReplyRow {
  reply_id: string;
  thread_id: string;
  content: string;
  channel: RoomChannel;
  moderation_state: "visible" | "pending" | "hidden" | "rejected";
  created_at: string;
  author_user_id?: string | null;
  submission_id?: string | null;
  anonymous_notification_capability_hash?: string | null;
}

interface AnonymousMembershipRow {
  commitment: string;
  leaf_index: number;
  display_alias: string;
  notification_capability_hash: string;
  created_at: string;
}

interface AnonymousRootRow {
  root: string;
  leaf_count: number;
  created_at: string;
}

interface AnonymousNotificationRow {
  notification_id: string;
  event_type: NotificationEventType;
  actor_alias: string;
  target_type: "thread" | "reply";
  target_id: string;
  thread_id: string | null;
  created_at: string;
  read_at: string | null;
}

interface ActivityEventRow {
  event_id: string;
  signal_ref: string;
  action: ActivityAction;
  subject: ActivitySubject;
  created_at: string;
}

interface ModerationVisibilityRow {
  target_type: "thread" | "reply";
  target_id: string;
}

const REPORT_REASONS: readonly ReportReason[] = [
  "spam",
  "harassment",
  "threats",
  "sexual_content",
  "personal_data",
  "self_harm",
  "other",
];
const ROOM_CHANNELS: readonly RoomChannel[] = ["general", "love", "ragebait", "underground", "wildest", "students", "crypto", "haunted"];
const ROOM_POST_CATEGORIES = new Set([
  "REGRET",
  "CAREER",
  "RELATIONSHIPS",
  "FEAR",
  "LONELINESS",
  "AMBITION",
  "FAMILY",
  "MONEY",
  "IDENTITY",
  "UNCERTAINTY",
  "JOY",
]);
const REPORT_STATUSES: readonly ReportStatus[] = ["open", "reviewed", "dismissed", "actioned"];
const REPORT_MAX_TARGET_ID_LENGTH = 200;
const REPORT_MAX_EXCERPT_LENGTH = 1000;
const REPORT_MAX_DETAILS_LENGTH = 2000;
const MODERATION_MAX_REASON_LENGTH = 2000;

function jsonResponse(
  body: unknown,
  status = 200,
  cacheControl = "no-store",
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
      ...securityHeaders(),
      ...extraHeaders,
    },
  });
}

function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

function htmlSecurityHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    ...securityHeaders(),
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "media-src 'self'",
      "connect-src 'self'",
      "manifest-src 'self'",
    ].join("; "),
  };

  if (new URL(request.url).protocol === "https:") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }

  return headers;
}

function anonymousZkAssetContentType(pathname: string): string | null {
  // Versioned by tree depth: the files are cached as immutable, so a new
  // circuit is published under a new path rather than replacing these.
  if (pathname === "/anonymous-zk/depth20/hidn_membership.wasm" || pathname === "/anonymous-zk/v2/hidn_membership.wasm") {
    return "application/wasm";
  }

  if (pathname === "/anonymous-zk/depth20/hidn_membership_final.zkey" || pathname === "/anonymous-zk/v2/hidn_membership_final.zkey") {
    return "application/octet-stream";
  }

  return null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getShieldedScanStats(): Promise<ShieldedScanStatsResponse> {
  const headers = {
    Accept: "application/json",
    Origin: "https://shieldedscan.xyz",
    Referer: "https://shieldedscan.xyz/",
  };
  const [statusResponse, supplyResponse] = await Promise.all([
    fetch(SHIELDEDSCAN_STATUS_URL, { headers }),
    fetch(SHIELDEDSCAN_SUPPLY_URL, { headers }),
  ]);

  if (!statusResponse.ok || !supplyResponse.ok) {
    throw new Error("ShieldedScan mainnet data is unavailable.");
  }

  const [status, supply] = (await Promise.all([
    statusResponse.json(),
    supplyResponse.json(),
  ])) as [ShieldedScanStatusPayload, ShieldedScanSupplyPayload];
  const blockHeight = finiteNumber(status.height);
  if (blockHeight === null || !Number.isSafeInteger(blockHeight) || blockHeight < 0) {
    throw new Error("ShieldedScan returned an invalid block height.");
  }

  const priceUsd = finiteNumber(status.priceUsd);
  const circulatingSupplyZat = finiteNumber(status.circulatingSupplyZat);
  const shieldedSupplyZat = finiteNumber(supply.shieldedZat);
  const circulatingSupplyZec = circulatingSupplyZat !== null ? circulatingSupplyZat / 100_000_000 : null;

  return {
    blockHeight,
    priceUsd: priceUsd !== null && priceUsd > 0 ? priceUsd : null,
    transactions24h: finiteNumber(status.txCount24h),
    shieldedSupplyZec: shieldedSupplyZat !== null && shieldedSupplyZat >= 0 ? shieldedSupplyZat / 100_000_000 : null,
    marketCapUsd: priceUsd !== null && circulatingSupplyZec !== null ? priceUsd * circulatingSupplyZec : null,
    asOf: Math.max(finiteNumber(status.asOf) ?? 0, finiteNumber(supply.asOf) ?? 0) || null,
  };
}

async function boundedRequestText(request: Request, maxBytes: number): Promise<string | null> {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) {
    return null;
  }

  if (!request.body) {
    const text = await request.text();
    return new TextEncoder().encode(text).byteLength <= maxBytes ? text : null;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      totalBytes += next.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType && contentType !== "application/json") {
    return {};
  }

  try {
    const rawBody = await boundedRequestText(request, MAX_JSON_BODY_BYTES);
    if (rawBody === null) {
      return {};
    }
    const value: unknown = JSON.parse(rawBody);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function databaseUnavailable(env: HidnWorkerEnv): Response | undefined {
  if (env.ROOM_DB) {
    return undefined;
  }

  return jsonResponse(
    { error: "ROOM_DB is not configured. Add the HIDN D1 binding before enabling room persistence." },
    503,
  );
}

function anonymousZkConfigured(env: HidnWorkerEnv): boolean {
  return env.ANONYMOUS_ZK_ENABLED?.trim().toLowerCase() === "true"
    && Boolean(env.ANONYMOUS_ZK_VERIFICATION_KEY_V2?.trim());
}

function anonymousZkUnavailable(env: HidnWorkerEnv): Response | undefined {
  if (anonymousZkConfigured(env)) {
    return undefined;
  }

  return jsonResponse(
    {
      error: "Anonymous ZK participation is not activated on this Worker yet.",
      code: "ANONYMOUS_ZK_NOT_CONFIGURED",
      torRequiredForNetworkPrivacy: true,
    },
    503,
    "no-store",
  );
}

function isValidAnonymousCapability(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function normalizeAnonymousField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return parseField(value.trim()).toString(10);
  } catch {
    return null;
  }
}

function createRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createReportId(): string {
  return `RPT-${createRandomHex(12).toUpperCase()}`;
}

function createModerationEventId(): string {
  return `MOD-${createRandomHex(12).toUpperCase()}`;
}

function createAdminId(): string {
  return `ADM-${createRandomHex(12).toUpperCase()}`;
}

function createAdminAuditEventId(): string {
  return `AUD-${createRandomHex(12).toUpperCase()}`;
}

function createActivityEventId(): string {
  return `ACT-${createRandomHex(12).toUpperCase()}`;
}

function createAnonymousNotificationId(): string {
  return `ANF-${createRandomHex(12).toUpperCase()}`;
}

function createNotificationAlias(): string {
  return `ANON-${createRandomHex(4).toUpperCase()}`;
}

function createActivitySignalRef(): string {
  return `SIGNAL ${createRandomHex(2).toUpperCase()}`;
}

function normalizeMainnetTipAddress(address: string): string {
  return address.trim().toLowerCase();
}

function isValidMainnetTipAddress(address: string): boolean {
  return address.length >= 20
    && address.length <= 500
    && /^(?:u1|zs1)[0-9a-z]+$/.test(address);
}

/** HIDN carries words, not links: no web addresses in posts, replies or
 * link messages, which keeps out shilling, phishing and spam. */
const LINK_PATTERN = new RegExp(
  [
    String.raw`(?:https?|hxxps?):\/\/\S+`,
    String.raw`\bwww\.\S+`,
    String.raw`\bt\.me\/\S+`,
    String.raw`\b[a-z0-9][a-z0-9-]{0,62}\.(?:com|net|org|io|xyz|app|co|me|ly|gg|link|finance|exchange|dev|ai|info|biz|tv|to|sh|so|fi|money|eth|crypto|site|online|store|shop|live|club|top|vip|pro|bio|page|art|nft|dao|cc|us|uk|ng|in|ru|cn|de)\b`,
  ].join("|"),
  "i",
);
const LINK_BLOCKED_ERROR = "Links aren't allowed on HIDN. Say it in words.";
function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text);
}

function isRoomChannel(value: string): value is RoomChannel {
  return ROOM_CHANNELS.includes(value as RoomChannel);
}

function isAmbientRoomThreadId(value: string): boolean {
  return AMBIENT_ROOM_THREAD_IDS.has(value);
}

function isAllowedRoomReactionTarget(targetType: "thread" | "reply", targetId: string): boolean {
  return targetType === "thread"
    ? /^THR-[A-F0-9]{24}$/.test(targetId) || isAmbientRoomThreadId(targetId)
    : /^RPL-[A-F0-9]{24}$/.test(targetId);
}

function createThreadId(): string {
  return `THR-${createRandomHex(12).toUpperCase()}`;
}

function createReplyId(): string {
  return `RPL-${createRandomHex(12).toUpperCase()}`;
}

function isReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.includes(value as ReportReason);
}

function isReportStatus(value: string): value is ReportStatus {
  return REPORT_STATUSES.includes(value as ReportStatus);
}

function isModerationTargetType(value: string): value is "thread" | "reply" {
  return value === "thread" || value === "reply";
}

function isModerationAction(value: string): value is ModerationAction {
  return value === "approve" || value === "hide" || value === "reject";
}

function isAdminRole(value: string): value is AdminRole {
  return value === "super_admin" || value === "moderator" || value === "reviewer";
}

function isAdminStatus(value: string): value is AdminStatus {
  return value === "active" || value === "disabled";
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeAbuseContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "<link>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function abuseCooldownDurationMs(riskScore: number): number {
  const multiplier = Math.max(0, riskScore - ABUSE_COOLDOWN_RISK_THRESHOLD);
  return Math.min(ABUSE_COOLDOWN_MAX_MS, ABUSE_COOLDOWN_BASE_MS * 2 ** multiplier);
}

function abuseCooldownResponse(cooldownUntil: string): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(cooldownUntil) - Date.now()) / 1000));
  const retryLabel = retryAfterSeconds >= 60
    ? `${Math.ceil(retryAfterSeconds / 60)} MINUTE${retryAfterSeconds >= 120 ? "S" : ""}`
    : `${retryAfterSeconds} SECOND${retryAfterSeconds === 1 ? "" : "S"}`;

  return jsonResponse(
    {
      error: `SIGNAL COOLDOWN / TRY AGAIN IN ${retryLabel}.`,
      code: "ABUSE_COOLDOWN",
      retryAfterSeconds,
    },
    429,
    "no-store",
    {
      "Retry-After": String(retryAfterSeconds),
      "X-HIDN-Abuse-Mode": "cooldown",
    },
  );
}

async function abuseSignalKeyForEdge(request: Request, now: number): Promise<string | null> {
  const edgeAddress = request.headers.get("CF-Connecting-IP")?.trim();
  if (!edgeAddress) {
    return null;
  }

  // Keep only a rotating digest of the edge address. The raw address never
  // enters D1 and the digest naturally expires with this short abuse window.
  const bucket = Math.floor(now / ABUSE_EDGE_BUCKET_MS);
  const digest = await hashText(`hidn-abuse-v1:${bucket}:${edgeAddress}`);
  return `edge:${digest}`;
}

interface EdgeRateLimitOptions {
  action: string;
  limit: number;
  windowMs: number;
}

async function enforceEdgeRateLimit(
  request: Request,
  env: HidnWorkerEnv,
  options: EdgeRateLimitOptions,
): Promise<Response | undefined> {
  if (!env.ROOM_DB || options.limit < 1 || options.windowMs < 1) {
    return undefined;
  }

  const edgeAddress = request.headers.get("CF-Connecting-IP")?.trim();
  if (!edgeAddress) {
    // Cloudflare supplies CF-Connecting-IP in production. Do not persist a
    // caller-controlled forwarding header as an identity signal in local or
    // alternate runtimes.
    return undefined;
  }

  const now = Date.now();
  const windowStartedAtMs = Math.floor(now / options.windowMs) * options.windowMs;
  const windowStartedAt = new Date(windowStartedAtMs).toISOString();
  const expiresAt = new Date(windowStartedAtMs + options.windowMs).toISOString();
  const digest = await hashText(
    `hidn-rate-v1:${options.action}:${windowStartedAtMs}:${edgeAddress}`,
  );
  const signalKey = `rate:${options.action}:${digest}`;

  try {
    await env.ROOM_DB.prepare(
      `INSERT INTO hidn_abuse_signals
        (signal_key, window_started_at, action_count, risk_score,
         last_content_hash, last_content_at, cooldown_until, expires_at, updated_at)
       VALUES (?, ?, 1, 0, NULL, NULL, NULL, ?, ?)
       ON CONFLICT(signal_key) DO UPDATE SET
         action_count = hidn_abuse_signals.action_count + 1,
         updated_at = excluded.updated_at`,
    )
      .bind(signalKey, windowStartedAt, expiresAt, new Date(now).toISOString())
      .run();

    const row = await env.ROOM_DB.prepare(
      `SELECT action_count
       FROM hidn_abuse_signals
       WHERE signal_key = ?
       LIMIT 1`,
    )
      .bind(signalKey)
      .first<{ action_count: number }>();
    const actionCount = Number(row?.action_count ?? 0);
    if (actionCount <= options.limit) {
      return undefined;
    }

    return abuseCooldownResponse(expiresAt);
  } catch {
    // Keep the product available during a partial migration. The signal is
    // short-lived and contains only a rotating digest, never the raw address.
    return undefined;
  }
}

async function updateAbuseSignal(
  env: HidnWorkerEnv,
  signalKey: string,
  contentHash: string,
  now: number,
  cooldownRiskThreshold: number,
): Promise<AbuseSignalObservation | null> {
  if (!env.ROOM_DB) {
    return null;
  }

  try {
    const existing = await env.ROOM_DB.prepare(
      `SELECT signal_key, window_started_at, action_count, risk_score,
              last_content_hash, last_content_at, cooldown_until, expires_at, updated_at
       FROM hidn_abuse_signals
       WHERE signal_key = ?
       LIMIT 1`,
    )
      .bind(signalKey)
      .first<AbuseSignalRow>();

    const nowIso = new Date(now).toISOString();
    const active = Boolean(existing && Date.parse(existing.expires_at) > now);
    const cooldownUntil = active && existing?.cooldown_until && Date.parse(existing.cooldown_until) > now
      ? existing.cooldown_until
      : null;

    // Do not extend an active cooldown on every bot retry. The caller gets a
    // stable retry window while the signal remains short-lived in D1.
    if (cooldownUntil && existing) {
      return {
        actionCount: existing.action_count,
        riskScore: existing.risk_score,
        cooldownUntil,
      };
    }

    const withinWindow = Boolean(
      active
      && existing?.window_started_at
      && Date.parse(existing.window_started_at) > now - ABUSE_WINDOW_MS,
    );
    const actionCount = withinWindow ? Number(existing?.action_count ?? 0) + 1 : 1;
    const repeatedContent = Boolean(
      withinWindow
      && existing?.last_content_hash === contentHash
      && existing.last_content_at
      && Date.parse(existing.last_content_at) > now - ABUSE_REPEAT_WINDOW_MS,
    );
    const burstRisk = actionCount > ABUSE_BURST_THRESHOLD ? 1 : 0;
    const riskScore = withinWindow
      ? Number(existing?.risk_score ?? 0) + burstRisk + (repeatedContent ? 2 : 0)
      : 0;
    const nextCooldownUntil = riskScore >= cooldownRiskThreshold
      ? new Date(now + abuseCooldownDurationMs(riskScore)).toISOString()
      : null;
    const windowStartedAt = withinWindow ? existing!.window_started_at : nowIso;
    const expiresAt = new Date(now + ABUSE_SIGNAL_TTL_MS).toISOString();

    await env.ROOM_DB.prepare(
      `INSERT INTO hidn_abuse_signals
        (signal_key, window_started_at, action_count, risk_score,
         last_content_hash, last_content_at, cooldown_until, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(signal_key) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         action_count = excluded.action_count,
         risk_score = excluded.risk_score,
         last_content_hash = excluded.last_content_hash,
         last_content_at = excluded.last_content_at,
         cooldown_until = excluded.cooldown_until,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
    )
      .bind(
        signalKey,
        windowStartedAt,
        actionCount,
        riskScore,
        contentHash,
        nowIso,
        nextCooldownUntil,
        expiresAt,
        nowIso,
      )
      .run();

    return { actionCount, riskScore, cooldownUntil: nextCooldownUntil };
  } catch {
    // Abuse controls must not turn a missing/unapplied migration into a room
    // outage. The migration is fail-open until the next deploy applies it.
    return null;
  }
}

async function recordActivityEvent(
  env: HidnWorkerEnv,
  action: ActivityAction,
  subject: ActivitySubject,
): Promise<void> {
  if (!env.ROOM_DB) {
    return;
  }

  const createdAt = new Date().toISOString();
  try {
    await env.ROOM_DB.prepare(
      `INSERT INTO hidn_activity_events
        (event_id, signal_ref, action, subject, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(createActivityEventId(), createActivitySignalRef(), action, subject, createdAt)
      .run();

    const cutoff = new Date(Date.now() - LIVE_ACTIVITY_RETENTION_MS).toISOString();
    await env.ROOM_DB.prepare("DELETE FROM hidn_activity_events WHERE created_at < ?")
      .bind(cutoff)
      .run();
  } catch {
    // Activity is observational; never fail the underlying account or post action.
  }
}

function serializeActivityEvent(row: ActivityEventRow): Record<string, string> {
  return {
    actor: `ANONYMOUS / ${row.signal_ref}`,
    action: row.action,
    subject: row.subject,
    createdAt: row.created_at,
  };
}

async function listLiveActivity(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? LIVE_ACTIVITY_LIMIT);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), LIVE_ACTIVITY_LIMIT)
    : LIVE_ACTIVITY_LIMIT;
  const cutoff = new Date(Date.now() - LIVE_ACTIVITY_RETENTION_MS).toISOString();
  const result = await env.ROOM_DB!.prepare(
    `SELECT event_id, signal_ref, action, subject, created_at
     FROM hidn_activity_events
     WHERE created_at >= ?
     ORDER BY created_at DESC
     LIMIT ${limit}`,
  )
    .bind(cutoff)
    .all<ActivityEventRow>();

  return jsonResponse(
    { activities: result.results.map(serializeActivityEvent) },
    200,
    "no-store",
  );
}

function serializeRoomPost(row: RoomPostRow): Record<string, unknown> {
  const tipAddress = typeof row.tip_address === "string" ? normalizeMainnetTipAddress(row.tip_address) : "";
  return {
    id: row.thread_id,
    reference: `// ${row.thread_id.replace(/^THR-/, "").slice(0, 8)}`,
    text: row.content,
    category: row.category,
    channel: row.channel,
    time: row.created_at,
    reactions: Number(row.reactions ?? 0),
    replies: Number(row.reply_count ?? 0),
    liked: row.liked_by_current_user === 1,
    ...(tipAddress && isValidMainnetTipAddress(tipAddress) ? { tipAddress } : {}),
  };
}

function serializeRoomComment(row: RoomReplyRow): Record<string, unknown> {
  return {
    id: row.reply_id,
    threadId: row.thread_id,
    text: row.content,
    channel: row.channel,
    time: row.created_at,
    status: row.moderation_state,
  };
}

async function createAnonymousNotification(
  env: HidnWorkerEnv,
  recipientCapabilityHash: string | null | undefined,
  eventType: NotificationEventType,
  actorAlias: string,
  targetType: "thread" | "reply",
  targetId: string,
  threadId: string | null,
): Promise<void> {
  if (!env.ROOM_DB || !recipientCapabilityHash) {
    return;
  }

  try {
    await env.ROOM_DB.prepare(
      `INSERT INTO hidn_anonymous_notifications
        (notification_id, recipient_capability_hash, event_type, actor_alias,
         target_type, target_id, thread_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        createAnonymousNotificationId(),
        recipientCapabilityHash,
        eventType,
        actorAlias,
        targetType,
        targetId,
        threadId,
        new Date().toISOString(),
      )
      .run();
  } catch {
    // A notification must never turn a successful anonymous action into a retry.
  }
}

async function listAnonymousMembers(env: HidnWorkerEnv): Promise<AnonymousMembershipRow[]> {
  const result = await env.ROOM_DB!.prepare(
    `SELECT commitment, leaf_index, display_alias,
            notification_capability_hash, created_at
     FROM hidn_anonymous_members
     ORDER BY leaf_index ASC
     LIMIT ${ANONYMOUS_MAX_MEMBERS}`,
  ).all<AnonymousMembershipRow>();
  return result.results.sort((left, right) => left.leaf_index - right.leaf_index);
}

async function rememberAnonymousRoot(
  env: HidnWorkerEnv,
  root: string,
  leafCount: number,
): Promise<void> {
  await env.ROOM_DB!.prepare(
    `INSERT OR IGNORE INTO hidn_anonymous_roots (root, leaf_count, created_at)
     VALUES (?, ?, ?)`,
  )
    .bind(root, leafCount, new Date().toISOString())
    .run();
}

async function anonymousTreeSnapshot(env: HidnWorkerEnv): Promise<{
  members: AnonymousMembershipRow[];
  tree: ReturnType<typeof createAnonymousMerkleSnapshot>;
}> {
  const members = await listAnonymousMembers(env);
  const tree = createAnonymousMerkleSnapshot(members.map((member) => member.commitment), ANONYMOUS_TREE_DEPTH);
  await rememberAnonymousRoot(env, tree.root.toString(10), members.length);
  return { members, tree };
}

function anonymousProofObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  try {
    if (JSON.stringify(value).length > 24_000) {
      return null;
    }
  } catch {
    return null;
  }
  return value as Record<string, unknown>;
}

interface VerifiedAnonymousAction {
  root: string;
  nullifier: string;
  binding: string;
  scope: string;
}

async function verifyAnonymousAction(
  env: HidnWorkerEnv,
  body: Record<string, unknown>,
  action: "post" | "reply" | "reaction" | "report" | "link",
  targetType: "room" | "thread" | "reply",
  targetId: string,
  content: string,
  tipAddress = "",
): Promise<VerifiedAnonymousAction | Response> {
  const protocol = typeof body.protocol === "string" ? body.protocol.trim() : "";
  const legacy = protocol === ANONYMOUS_LEGACY_PROTOCOL_VERSION;
  if (protocol !== ANONYMOUS_PROTOCOL_VERSION && !legacy) {
    return jsonResponse({ error: "This anonymous proof uses an unsupported protocol version." }, 400);
  }
  // A version 1 proof does not show which scope its nullifier was made with,
  // so it cannot hold a like to one per member per post. Pages loaded before
  // version 2 can still post; they need a reload to like.
  if (legacy && action === "reaction") {
    return jsonResponse({ error: "HIDN updated. Reload the page to like posts.", code: "ANONYMOUS_PROTOCOL_OUTDATED" }, 400);
  }

  const proof = anonymousProofObject(body.proof);
  const publicSignalValues = Array.isArray(body.publicSignals)
    ? body.publicSignals.filter((value): value is string => typeof value === "string").map((value) => value.trim())
    : [];
  if (!proof || publicSignalValues.length !== (legacy ? 3 : 4)) {
    return jsonResponse({ error: "Send a complete anonymous membership proof." }, 400);
  }

  const root = normalizeAnonymousField(publicSignalValues[0]);
  const nullifier = normalizeAnonymousField(publicSignalValues[1]);
  const binding = normalizeAnonymousField(publicSignalValues[2]);
  const scope = normalizeAnonymousField(body.scope);
  if (!root || !nullifier || !binding || !scope) {
    return jsonResponse({ error: "The anonymous proof signals are invalid." }, 400);
  }
  // In version 2 the scope is a proven public signal: it must be the scope
  // the request names, which callers such as likes check against the target.
  if (!legacy && normalizeAnonymousField(publicSignalValues[3]) !== scope) {
    return jsonResponse({ error: "The anonymous proof is not bound to this scope." }, 400);
  }

  const rootRow = await env.ROOM_DB!.prepare(
    `SELECT root, leaf_count, created_at
     FROM hidn_anonymous_roots
     WHERE root = ?
     LIMIT 1`,
  )
    .bind(root)
    .first<AnonymousRootRow>();
  if (!rootRow) {
    return jsonResponse({ error: "That anonymous membership root is no longer accepted." }, 400);
  }

  const message = canonicalAnonymousMessage(action, targetType, targetId, content, tipAddress);
  let expectedBinding: string;
  try {
    expectedBinding = anonymousBinding(nullifier, message);
  } catch {
    return jsonResponse({ error: "The anonymous action message is too large for this circuit." }, 400);
  }
  if (expectedBinding !== binding) {
    return jsonResponse({ error: "The anonymous proof is not bound to this action." }, 400);
  }

  const existingAction = await env.ROOM_DB!.prepare(
    `SELECT nullifier
     FROM hidn_anonymous_actions
     WHERE nullifier = ?
     LIMIT 1`,
  )
    .bind(nullifier)
    .first<{ nullifier: string }>();
  if (existingAction) {
    return jsonResponse(
      { error: "This anonymous action has already been used.", code: "ANONYMOUS_NULLIFIER_USED" },
      409,
    );
  }

  let verificationKey: unknown;
  try {
    verificationKey = JSON.parse((legacy ? env.ANONYMOUS_ZK_VERIFICATION_KEY : env.ANONYMOUS_ZK_VERIFICATION_KEY_V2) ?? "");
  } catch {
    return jsonResponse({ error: "The anonymous verification key is not valid JSON." }, 503);
  }

  const valid = await verifyAnonymousGroth16Proof(
    verificationKey,
    publicSignalValues,
    proof,
    anonymousVerifierWasm,
  );
  if (!valid) {
    return jsonResponse({ error: "The anonymous membership proof could not be verified." }, 400);
  }

  return { root, nullifier, binding, scope };
}

async function reserveAnonymousAction(
  env: HidnWorkerEnv,
  action: VerifiedAnonymousAction,
  actionType: "post" | "reply" | "reaction",
  targetType: "room" | "thread" | "reply",
  targetId: string,
): Promise<Response | undefined> {
  try {
    await env.ROOM_DB!.prepare(
      `INSERT INTO hidn_anonymous_actions
        (nullifier, scope, binding, action_type, target_type, target_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        action.nullifier,
        action.scope,
        action.binding,
        actionType,
        targetType,
        targetId,
        new Date().toISOString(),
      )
      .run();
    return undefined;
  } catch {
    return jsonResponse(
      { error: "This anonymous action has already been used.", code: "ANONYMOUS_NULLIFIER_USED" },
      409,
    );
  }
}

async function assessAnonymousAbuse(
  request: Request,
  env: HidnWorkerEnv,
  content: string,
): Promise<Response | undefined> {
  const now = Date.now();
  const edgeSignalKey = await abuseSignalKeyForEdge(request, now);
  if (!edgeSignalKey) {
    return undefined;
  }

  const contentHash = await hashText(normalizeAbuseContent(content));
  const observation = await updateAbuseSignal(
    env,
    edgeSignalKey,
    contentHash,
    now,
    ABUSE_COOLDOWN_RISK_THRESHOLD,
  );
  return observation?.cooldownUntil ? abuseCooldownResponse(observation.cooldownUntil) : undefined;
}

async function getAnonymousStatus(_request: Request, env: HidnWorkerEnv): Promise<Response> {
  return jsonResponse({
    enabled: anonymousZkConfigured(env),
    protocol: ANONYMOUS_PROTOCOL_VERSION,
    treeDepth: ANONYMOUS_TREE_DEPTH,
    maxMembers: ANONYMOUS_MAX_MEMBERS,
    networkPrivacy: "direct until a relay or Tor transport is added",
  });
}

async function enrollAnonymousMember(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const rateLimit = await enforceEdgeRateLimit(request, env, {
    action: "anonymous-enroll",
    // Fresh recovery keys are generated locally, so legitimate visitors may
    // restart the flow without sharing an account identity. Keep a bounded
    // edge limit for abuse, but leave room for shared networks and retries.
    limit: 20,
    windowMs: 30 * 60 * 1000,
  });
  if (rateLimit) {
    return rateLimit;
  }

  const body = await requestBody(request);
  const commitment = normalizeAnonymousField(body.commitment);
  const notificationCapability = typeof body.notificationCapability === "string"
    ? body.notificationCapability.trim().toLowerCase()
    : "";
  if (!commitment || !isValidAnonymousCapability(notificationCapability)) {
    return jsonResponse({ error: "Send a valid anonymous commitment and notification capability." }, 400);
  }

  let member = await env.ROOM_DB!.prepare(
    `SELECT commitment, leaf_index, display_alias,
            notification_capability_hash, created_at
     FROM hidn_anonymous_members
     WHERE commitment = ?
     LIMIT 1`,
  )
    .bind(commitment)
    .first<AnonymousMembershipRow>();

  if (!member) {
    const nextLeaf = await env.ROOM_DB!.prepare(
      `SELECT COALESCE(MAX(leaf_index), -1) + 1 AS next_leaf
       FROM hidn_anonymous_members`,
    ).first<{ next_leaf: number }>();
    const leafIndex = Number(nextLeaf?.next_leaf ?? 0);
    if (leafIndex >= ANONYMOUS_MAX_MEMBERS) {
      return jsonResponse({ error: "The anonymous membership tree is full for this milestone." }, 503);
    }

    member = {
      commitment,
      leaf_index: leafIndex,
      display_alias: createNotificationAlias(),
      notification_capability_hash: await hashText(notificationCapability),
      created_at: new Date().toISOString(),
    };
    try {
      await env.ROOM_DB!.prepare(
        `INSERT INTO hidn_anonymous_members
          (commitment, leaf_index, display_alias, notification_capability_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          member.commitment,
          member.leaf_index,
          member.display_alias,
          member.notification_capability_hash,
          member.created_at,
        )
        .run();
    } catch {
      return jsonResponse({ error: "That anonymous credential was enrolled concurrently. Try again." }, 409);
    }
  } else {
    // A returning member gets a fresh alias every time they enter, and the
    // old one is overwritten, so no label follows a member between visits.
    const alias = createNotificationAlias();
    await env.ROOM_DB!.prepare("UPDATE hidn_anonymous_members SET display_alias = ? WHERE commitment = ?")
      .bind(alias, commitment)
      .run();
    member = { ...member, display_alias: alias };
  }

  const snapshot = await anonymousTreeSnapshot(env);
  const witness = snapshot.tree.witness(member.leaf_index);
  return jsonResponse({
    protocol: ANONYMOUS_PROTOCOL_VERSION,
    treeDepth: ANONYMOUS_TREE_DEPTH,
    commitment,
    displayAlias: member.display_alias,
    root: witness.root,
    leafIndex: witness.leafIndex,
    pathElements: witness.pathElements,
    pathIndices: witness.pathIndices,
  }, 201, "no-store");
}

function anonymousCapabilityFromBody(body: Record<string, unknown>): string | null {
  const capability = typeof body.notificationCapability === "string"
    ? body.notificationCapability.trim().toLowerCase()
    : "";
  return isValidAnonymousCapability(capability) ? capability : null;
}

async function createAnonymousPost(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const rateLimit = await enforceEdgeRateLimit(request, env, {
    action: "anonymous-post",
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit) {
    return rateLimit;
  }

  const body = await requestBody(request);
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const channel = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "general";
  const category = typeof body.category === "string" ? body.category.trim().toUpperCase() : "IDENTITY";
  const tipAddress = normalizeMainnetTipAddress(typeof body.tipAddress === "string" ? body.tipAddress : "");
  // Each post carries its own one-off notification key; no member alias is
  // stored, so the server cannot group a member's posts together.
  const notificationCapability = anonymousCapabilityFromBody(body);
  if (!content) {
    return jsonResponse({ error: "Write something before creating the anonymous post." }, 400);
  }
  if (content.length > ROOM_FREE_POST_MAX_LENGTH) {
    return jsonResponse({ error: `Anonymous posts must be ${ROOM_FREE_POST_MAX_LENGTH} characters or fewer.` }, 400);
  }
  if (containsLink(content)) {
    return jsonResponse({ error: LINK_BLOCKED_ERROR, code: "LINKS_NOT_ALLOWED" }, 400);
  }
  if (!notificationCapability) {
    return jsonResponse({ error: "This post is missing its notification key." }, 400);
  }
  if (!isRoomChannel(channel)) {
    return jsonResponse({ error: "Choose a valid room channel." }, 400);
  }
  const closedRoom = roomLinkByKey(channel);
  const closedReason = closedRoom ? roomClosedReason(closedRoom) : null;
  if (closedReason) {
    return jsonResponse({ error: closedReason, code: "ROOM_CLOSED" }, 400);
  }
  if (!ROOM_POST_CATEGORIES.has(category)) {
    return jsonResponse({ error: "Choose a valid post category." }, 400);
  }
  if (tipAddress && !isValidMainnetTipAddress(tipAddress)) {
    return jsonResponse(
      { error: "Use a shielded Zcash mainnet address beginning with u1 or zs1. Transparent addresses are not accepted." },
      400,
    );
  }

  const action = await verifyAnonymousAction(
    env,
    body,
    "post",
    "room",
    channel,
    content,
    tipAddress,
  );
  if (action instanceof Response) {
    return action;
  }

  const abuseResponse = await assessAnonymousAbuse(request, env, content);
  if (abuseResponse) {
    return abuseResponse;
  }

  const post: RoomPostRow = {
    thread_id: createThreadId(),
    content,
    category,
    channel,
    created_at: new Date().toISOString(),
    tip_address: tipAddress || null,
  };
  const actionConflict = await reserveAnonymousAction(env, action, "post", "room", post.thread_id);
  if (actionConflict) {
    return actionConflict;
  }

  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_threads
      (thread_id, room_id, content, category, moderation_state, created_at,
       updated_at, hidden_at, channel, author_user_id, anonymous_root,
       anonymous_nullifier, anonymous_binding, anonymous_alias,
       anonymous_notification_capability_hash, tip_address)
     VALUES (?, ?, ?, ?, 'visible', ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      post.thread_id,
      MAIN_ROOM_ID,
      post.content,
      post.category,
      post.created_at,
      post.created_at,
      post.channel,
      action.root,
      action.nullifier,
      action.binding,
      null,
      await hashText(notificationCapability),
      post.tip_address,
    )
    .run();

  await recordActivityEvent(env, "JUST POSTED", "A THOUGHT");
  return jsonResponse(
    { post: serializeRoomPost(post), status: "created" },
    201,
    "no-store",
  );
}

async function createAnonymousReply(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const rateLimit = await enforceEdgeRateLimit(request, env, {
    action: "anonymous-reply",
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit) {
    return rateLimit;
  }

  const body = await requestBody(request);
  const threadId = typeof body.threadId === "string" ? body.threadId.trim().toUpperCase() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const notificationCapability = anonymousCapabilityFromBody(body);
  if (!/^THR-[A-F0-9]{24}$/.test(threadId)) {
    return jsonResponse({ error: "Choose a valid private-room thread." }, 400);
  }
  if (!content) {
    return jsonResponse({ error: "Write something before replying anonymously." }, 400);
  }
  if (content.length > ROOM_FREE_REPLY_MAX_LENGTH) {
    return jsonResponse({ error: `Anonymous replies must be ${ROOM_FREE_REPLY_MAX_LENGTH} characters or fewer.` }, 400);
  }
  if (containsLink(content)) {
    return jsonResponse({ error: LINK_BLOCKED_ERROR, code: "LINKS_NOT_ALLOWED" }, 400);
  }
  if (!notificationCapability) {
    return jsonResponse({ error: "This reply is missing its notification key." }, 400);
  }

  const thread = await env.ROOM_DB!.prepare(
    `SELECT thread_id, channel, author_user_id, anonymous_notification_capability_hash
     FROM hidn_threads
     WHERE thread_id = ? AND room_id = ? AND moderation_state = 'visible'
     LIMIT 1`,
  )
    .bind(threadId, MAIN_ROOM_ID)
    .first<{
      thread_id: string;
      channel: RoomChannel;
      author_user_id: string | null;
      anonymous_notification_capability_hash: string | null;
    }>();
  if (!thread) {
    return jsonResponse({ error: "That thread is no longer available for anonymous replies." }, 404);
  }

  const action = await verifyAnonymousAction(env, body, "reply", "thread", thread.thread_id, content);
  if (action instanceof Response) {
    return action;
  }
  const abuseResponse = await assessAnonymousAbuse(request, env, content);
  if (abuseResponse) {
    return abuseResponse;
  }

  const reply: RoomReplyRow = {
    reply_id: createReplyId(),
    thread_id: thread.thread_id,
    content,
    channel: thread.channel,
    moderation_state: "visible",
    created_at: new Date().toISOString(),
  };
  const actionConflict = await reserveAnonymousAction(env, action, "reply", "thread", reply.reply_id);
  if (actionConflict) {
    return actionConflict;
  }

  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_replies
      (reply_id, thread_id, content, moderation_state, created_at, hidden_at,
       author_user_id, submission_id, anonymous_root, anonymous_nullifier,
       anonymous_binding, anonymous_alias, anonymous_notification_capability_hash)
     VALUES (?, ?, ?, 'visible', ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(
      reply.reply_id,
      reply.thread_id,
      reply.content,
      reply.created_at,
      action.root,
      action.nullifier,
      action.binding,
      null,
      await hashText(notificationCapability),
    )
    .run();

  if (thread.anonymous_notification_capability_hash) {
    await createAnonymousNotification(
      env,
      thread.anonymous_notification_capability_hash,
      "reply",
      ANONYMOUS_ACTOR,
      "thread",
      thread.thread_id,
      thread.thread_id,
    );
  }

  await recordActivityEvent(env, "JUST REPLIED", "A THREAD");
  return jsonResponse(
    { comment: serializeRoomComment(reply), status: "created" },
    201,
    "no-store",
  );
}

async function createAnonymousReaction(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const rateLimit = await enforceEdgeRateLimit(request, env, {
    action: "anonymous-reaction",
    limit: 60,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit) {
    return rateLimit;
  }

  const body = await requestBody(request);
  const targetType = body.targetType === "thread" || body.targetType === "reply" ? body.targetType : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim().toUpperCase() : "";
  if (!targetType || !isAllowedRoomReactionTarget(targetType, targetId) || (targetType === "thread" && isAmbientRoomThreadId(targetId))) {
    return jsonResponse({ error: "Choose a valid live room signal." }, 400);
  }

  const target = targetType === "thread"
    ? await env.ROOM_DB!.prepare(
      `SELECT thread_id AS target_id, thread_id, author_user_id,
              anonymous_notification_capability_hash
       FROM hidn_threads
       WHERE thread_id = ? AND room_id = ? AND moderation_state = 'visible'
       LIMIT 1`,
    )
      .bind(targetId, MAIN_ROOM_ID)
      .first<{
        target_id: string;
        thread_id: string;
        author_user_id: string | null;
        anonymous_notification_capability_hash: string | null;
      }>()
    : await env.ROOM_DB!.prepare(
      `SELECT r.reply_id AS target_id, r.thread_id, r.author_user_id,
              r.anonymous_notification_capability_hash
       FROM hidn_replies r
       JOIN hidn_threads t ON t.thread_id = r.thread_id
       WHERE r.reply_id = ? AND t.room_id = ? AND r.moderation_state = 'visible'
       LIMIT 1`,
    )
      .bind(targetId, MAIN_ROOM_ID)
      .first<{
        target_id: string;
        thread_id: string;
        author_user_id: string | null;
        anonymous_notification_capability_hash: string | null;
      }>();
  if (!target) {
    return jsonResponse({ error: "That live signal is no longer available." }, 404);
  }

  // A like must use the scope fixed to this target. The scope is a public
  // signal of the proof, so the member's nullifier is then the same on a
  // second like of the same post (rejected as already used), but different on
  // every other post, so likes stay unlinkable.
  if (normalizeAnonymousField(body.scope) !== anonymousTargetScope("reaction", targetType, targetId)) {
    return jsonResponse({ error: "This like proof is not scoped to this post." }, 400);
  }
  const action = await verifyAnonymousAction(env, body, "reaction", targetType, targetId, "like");
  if (action instanceof Response) {
    if (action.status === 409) {
      return jsonResponse({ error: "You already liked this.", code: "ALREADY_LIKED" }, 409, "no-store");
    }
    return action;
  }
  const abuseResponse = await assessAnonymousAbuse(request, env, "like");
  if (abuseResponse) {
    return abuseResponse;
  }
  const actionConflict = await reserveAnonymousAction(env, action, "reaction", targetType, targetId);
  if (actionConflict) {
    return jsonResponse({ error: "You already liked this.", code: "ALREADY_LIKED" }, 409, "no-store");
  }

  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_reactions
      (reaction_id, target_type, target_id, reaction_type, actor_user_id,
       anonymous_nullifier, anonymous_alias, created_at)
     VALUES (?, ?, ?, 'like', NULL, ?, ?, ?)`,
  )
    .bind(
      `REA-${createRandomHex(12).toUpperCase()}`,
      targetType,
      targetId,
      action.nullifier,
      null,
      new Date().toISOString(),
    )
    .run();

  const count = await env.ROOM_DB!.prepare(
    `SELECT COUNT(*) AS count
     FROM hidn_reactions
     WHERE target_type = ? AND target_id = ? AND reaction_type = 'like'`,
  )
    .bind(targetType, targetId)
    .first<{ count: number }>();
  if (target.anonymous_notification_capability_hash) {
    await createAnonymousNotification(
      env,
      target.anonymous_notification_capability_hash,
      "reaction",
      ANONYMOUS_ACTOR,
      targetType,
      targetId,
      target.thread_id,
    );
  }

  return jsonResponse({ targetType, targetId, liked: true, reactions: Number(count?.count ?? 0) }, 201, "no-store");
}

async function listAnonymousPosts(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const params = new URL(request.url).searchParams;
  const channel = params.get("channel")?.trim().toLowerCase() ?? "general";
  if (!isRoomChannel(channel)) {
    return jsonResponse({ error: "Choose a valid room channel." }, 400);
  }
  // Paging: posts strictly older than `before`, up to `limit` at a time.
  const beforeParam = Date.parse(params.get("before") ?? "");
  const before = Number.isNaN(beforeParam) ? "9999-12-31T23:59:59.999Z" : new Date(beforeParam).toISOString();
  const requestedLimit = Number(params.get("limit") ?? "100");
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 100;

  const result = await env.ROOM_DB!.prepare(
    `SELECT t.thread_id, t.content, t.category, t.channel, t.created_at, t.tip_address,
            COUNT(r.reaction_id) AS reactions,
            (SELECT COUNT(*)
             FROM hidn_replies reply_count
             WHERE reply_count.thread_id = t.thread_id
               AND reply_count.moderation_state = 'visible') AS reply_count
     FROM hidn_threads t
     LEFT JOIN hidn_reactions r
       ON r.target_type = 'thread'
      AND r.target_id = t.thread_id
      AND r.reaction_type = 'like'
     WHERE t.room_id = ? AND t.channel = ? AND t.moderation_state = 'visible' AND t.created_at < ?
     GROUP BY t.thread_id, t.content, t.category, t.channel, t.created_at, t.tip_address
     ORDER BY t.created_at DESC
     LIMIT ${limit}`,
  )
    .bind(MAIN_ROOM_ID, channel, before)
    .all<RoomPostRow>();

  return jsonResponse({ posts: result.results.map(serializeRoomPost), channel }, 200, "no-store");
}

async function listAnonymousThread(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const threadId = new URL(request.url).searchParams.get("threadId")?.trim().toUpperCase() ?? "";
  if (!/^THR-[A-F0-9]{24}$/.test(threadId)) {
    return jsonResponse({ error: "Choose a valid private-room thread." }, 400);
  }

  const post = await env.ROOM_DB!.prepare(
    `SELECT t.thread_id, t.content, t.category, t.channel, t.created_at, t.tip_address,
            COUNT(r.reaction_id) AS reactions,
            (SELECT COUNT(*)
             FROM hidn_replies reply_count
             WHERE reply_count.thread_id = t.thread_id
               AND reply_count.moderation_state = 'visible') AS reply_count
     FROM hidn_threads t
     LEFT JOIN hidn_reactions r
       ON r.target_type = 'thread'
      AND r.target_id = t.thread_id
      AND r.reaction_type = 'like'
     WHERE t.thread_id = ? AND t.room_id = ? AND t.moderation_state = 'visible'
     GROUP BY t.thread_id, t.content, t.category, t.channel, t.created_at, t.tip_address
     LIMIT 1`,
  )
    .bind(threadId, MAIN_ROOM_ID)
    .first<RoomPostRow>();
  if (!post) {
    return jsonResponse({ error: "That private thread is no longer available." }, 404);
  }

  const replies = await env.ROOM_DB!.prepare(
    `SELECT r.reply_id, r.thread_id, r.content, t.channel,
            r.moderation_state, r.created_at
     FROM hidn_replies r
     JOIN hidn_threads t ON t.thread_id = r.thread_id
     WHERE r.thread_id = ? AND t.room_id = ? AND r.moderation_state = 'visible'
     ORDER BY r.created_at ASC
     LIMIT 200`,
  )
    .bind(threadId, MAIN_ROOM_ID)
    .all<RoomReplyRow>();

  return jsonResponse({ post: serializeRoomPost(post), replies: replies.results.map(serializeRoomComment) }, 200, "no-store");
}

/** The per-post notification keys a member sends to read their notifications.
 * They arrive together but are only hashed for this request, never stored as
 * a group, so the server keeps no record tying a member's posts together. */
const MAX_NOTIFICATION_CAPABILITIES = 80;

async function notificationCapabilityHashes(request: Request): Promise<string[]> {
  const listed = (request.headers.get("X-HIDN-Notification-Capabilities") ?? "").split(",");
  const single = request.headers.get("X-HIDN-Notification-Capability") ?? "";
  const capabilities = [...new Set([...listed, single].map((value) => value.trim().toLowerCase()).filter(isValidAnonymousCapability))]
    .slice(0, MAX_NOTIFICATION_CAPABILITIES);
  return Promise.all(capabilities.map((capability) => hashText(capability)));
}

async function listAnonymousNotifications(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const capabilityHashes = await notificationCapabilityHashes(request);
  if (!capabilityHashes.length) {
    return jsonResponse({ notifications: [], unreadCount: 0 }, 200, "no-store");
  }
  const recipients = capabilityHashes.map(() => "?").join(", ");
  const cutoff = new Date(Date.now() - ANONYMOUS_NOTIFICATION_RETENTION_MS).toISOString();
  await env.ROOM_DB!.prepare(
    `DELETE FROM hidn_anonymous_notifications
     WHERE recipient_capability_hash IN (${recipients}) AND created_at < ?`,
  )
    .bind(...capabilityHashes, cutoff)
    .run();

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "30");
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;
  const [notifications, unread] = await Promise.all([
    env.ROOM_DB!.prepare(
      `SELECT notification_id, event_type, actor_alias, target_type, target_id,
              thread_id, created_at, read_at
       FROM hidn_anonymous_notifications
       WHERE recipient_capability_hash IN (${recipients}) AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT ${limit}`,
    )
      .bind(...capabilityHashes, cutoff)
      .all<AnonymousNotificationRow>(),
    env.ROOM_DB!.prepare(
      `SELECT COUNT(*) AS count
       FROM hidn_anonymous_notifications
       WHERE recipient_capability_hash IN (${recipients}) AND created_at >= ? AND read_at IS NULL`,
    )
      .bind(...capabilityHashes, cutoff)
      .first<{ count: number }>(),
  ]);

  return jsonResponse({
    notifications: notifications.results.map((notification) => ({
      id: notification.notification_id,
      type: notification.event_type,
      actorAlias: ANONYMOUS_ACTOR,
      targetType: notification.target_type,
      targetId: notification.target_id,
      ...(notification.thread_id ? { threadId: notification.thread_id } : {}),
      createdAt: notification.created_at,
      readAt: notification.read_at,
    })),
    unreadCount: Number(unread?.count ?? 0),
  }, 200, "no-store");
}

async function markAnonymousNotificationsRead(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const capabilityHashes = await notificationCapabilityHashes(request);
  if (!capabilityHashes.length) {
    return jsonResponse({ status: "read" });
  }
  const recipients = capabilityHashes.map(() => "?").join(", ");
  const body = await requestBody(request);
  const notificationIds = Array.isArray(body.notificationIds)
    ? body.notificationIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 15)
    : [];
  const readAt = new Date().toISOString();
  if (notificationIds.length) {
    const placeholders = notificationIds.map(() => "?").join(", ");
    await env.ROOM_DB!.prepare(
      `UPDATE hidn_anonymous_notifications
       SET read_at = ?
       WHERE recipient_capability_hash IN (${recipients}) AND read_at IS NULL AND notification_id IN (${placeholders})`,
    )
      .bind(readAt, ...capabilityHashes, ...notificationIds)
      .run();
  } else {
    await env.ROOM_DB!.prepare(
      `UPDATE hidn_anonymous_notifications
       SET read_at = ?
       WHERE recipient_capability_hash IN (${recipients}) AND read_at IS NULL`,
    )
      .bind(readAt, ...capabilityHashes)
      .run();
  }

  return jsonResponse({ status: "read" });
}

async function submitReport(request: Request, env: HidnWorkerEnv): Promise<Response> {
  // Reports come from anonymous members: a membership proof shows the
  // reporter belongs to the room without revealing which member they are.
  const unavailable = databaseUnavailable(env) ?? anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const rateLimit = await enforceEdgeRateLimit(request, env, {
    action: "report-submit",
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit) {
    return rateLimit;
  }

  const body = await requestBody(request);
  const targetType = typeof body.targetType === "string" ? body.targetType.trim().toLowerCase() : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const targetExcerpt = typeof body.targetExcerpt === "string" ? body.targetExcerpt.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().toLowerCase() : "";
  const details = typeof body.details === "string" ? body.details.trim() : "";

  if (targetType !== "thread" && targetType !== "reply") {
    return jsonResponse({ error: "The report target is invalid." }, 400);
  }
  if (!targetId || targetId.length > REPORT_MAX_TARGET_ID_LENGTH) {
    return jsonResponse({ error: "The report target ID is invalid." }, 400);
  }
  if (targetExcerpt.length > REPORT_MAX_EXCERPT_LENGTH) {
    return jsonResponse({ error: "The reported content excerpt is too long." }, 400);
  }
  if (!isReportReason(reason)) {
    return jsonResponse({ error: "Choose a valid report reason." }, 400);
  }
  if (details.length > REPORT_MAX_DETAILS_LENGTH) {
    return jsonResponse({ error: "Report details are too long." }, 400);
  }

  // The proof is bound to this target and reason, so it cannot be replayed
  // against another post; its one-time nullifier cannot be reused at all.
  const action = await verifyAnonymousAction(env, body, "report", targetType, targetId.toUpperCase(), reason);
  if (action instanceof Response) {
    return action;
  }

  const now = new Date();
  const reportId = createReportId();
  try {
    await env.ROOM_DB!.prepare(
      `INSERT INTO hidn_reports
        (report_id, target_type, target_id, target_excerpt, reason, details,
         reporter_nullifier, status, created_at, reviewer_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        reportId,
        targetType,
        targetId,
        targetExcerpt,
        reason,
        details,
        action.nullifier,
        "open",
        now.toISOString(),
        "",
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("constraint")) {
      return jsonResponse({ error: "This report was already received." }, 409);
    }

    throw error;
  }

  return jsonResponse(
    { reportId, status: "open" satisfies ReportStatus, createdAt: now.toISOString() },
    201,
  );
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeJwtJson<T>(segment: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment))) as T;
  } catch {
    return null;
  }
}

function normalizeAccessTeamDomain(value: string): string {
  const candidate = value.trim();
  if (!candidate) {
    return "";
  }

  try {
    return new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`).origin;
  } catch {
    return "";
  }
}

function accessAudienceMatches(audience: string | string[], expected: string): boolean {
  const expectedAudiences = expected
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.isArray(audience)
    ? audience.some((value) => expectedAudiences.includes(value))
    : expectedAudiences.includes(audience);
}

async function validateCloudflareAccessJwt(
  request: Request,
  env: HidnWorkerEnv,
): Promise<CloudflareAccessClaims | null> {
  const teamDomain = normalizeAccessTeamDomain(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN ?? "");
  const expectedAudience = env.CLOUDFLARE_ACCESS_AUD?.trim() ?? "";
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim() ?? "";
  if (!teamDomain || !expectedAudience || !token) {
    return null;
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    return null;
  }

  const header = decodeJwtJson<{ alg?: unknown; kid?: unknown }>(segments[0]);
  const claims = decodeJwtJson<Partial<CloudflareAccessClaims>>(segments[1]);
  if (header?.alg !== "RS256" || typeof header.kid !== "string" || !claims) {
    return null;
  }
  if (
    typeof claims.sub !== "string" ||
    typeof claims.iss !== "string" ||
    (typeof claims.aud !== "string" && !Array.isArray(claims.aud)) ||
    typeof claims.exp !== "number" ||
    claims.exp <= Math.floor(Date.now() / 1000) ||
    normalizeAccessTeamDomain(claims.iss) !== teamDomain ||
    !accessAudienceMatches(claims.aud, expectedAudience)
  ) {
    return null;
  }

  const certificateResponse = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" },
  });
  if (!certificateResponse.ok) {
    throw new Error(`Cloudflare Access certificates returned HTTP ${certificateResponse.status}.`);
  }

  const certificatePayload = (await certificateResponse.json()) as {
    keys?: Array<JsonWebKey & { kid?: string; alg?: string }>;
  };
  const certificate = certificatePayload.keys?.find((key) => key.kid === header.kid);
  if (!certificate) {
    return null;
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    certificate,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    decodeBase64Url(segments[2]),
    new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
  );
  return validSignature ? (claims as CloudflareAccessClaims) : null;
}

async function hasValidAdminToken(request: Request, env: HidnWorkerEnv): Promise<boolean> {
  const expected = env.REPORT_ADMIN_TOKEN?.trim() ?? "";
  if (!expected) {
    return false;
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : request.headers.get("X-HIDN-ADMIN-TOKEN")?.trim() ?? "";
  if (!supplied) {
    return false;
  }

  const [suppliedHash, expectedHash] = await Promise.all([hashText(supplied), hashText(expected)]);
  let difference = suppliedHash.length === expectedHash.length ? 0 : 1;
  const length = Math.max(suppliedHash.length, expectedHash.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (suppliedHash.charCodeAt(index) || 0) ^ (expectedHash.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function serializeAdminActor(actor: AdminActor): Record<string, unknown> {
  return {
    adminId: actor.adminId,
    email: actor.email,
    displayName: actor.displayName,
    role: actor.role,
    source: actor.source,
  };
}

async function resolveCloudflareAdminActor(
  claims: CloudflareAccessClaims,
  env: HidnWorkerEnv,
): Promise<AdminActor | null> {
  if (!env.ROOM_DB) {
    return null;
  }

  const email = claims.email?.trim().toLowerCase() || null;
  const subjectHash = await hashText(`hidn-admin-subject:${claims.sub}`);
  let row = await env.ROOM_DB.prepare(
    `SELECT admin_id, access_subject_hash, email, display_name, role, status, created_at, last_seen_at
     FROM hidn_admin_users
     WHERE access_subject_hash = ? OR (? IS NOT NULL AND email = ?)
     LIMIT 1`,
  )
    .bind(subjectHash, email, email)
    .first<AdminUserRow>();

  const configuredSubject = env.HIDN_SUPER_ADMIN_ACCESS_SUBJECT?.trim() ?? "";
  const configuredEmail = env.HIDN_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const isBootstrapIdentity = (configuredSubject && claims.sub === configuredSubject) ||
    (configuredEmail && email === configuredEmail);

  if (!row && isBootstrapIdentity) {
    const now = new Date().toISOString();
    try {
      await env.ROOM_DB.prepare(
        `INSERT INTO hidn_admin_users
          (admin_id, access_subject_hash, email, display_name, role, status, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, 'super_admin', 'active', ?, ?)`,
      )
        .bind(createAdminId(), subjectHash, email, claims.name?.trim() || null, now, now)
        .run();
    } catch {
      // Another first request may have provisioned the configured identity.
    }
    row = await env.ROOM_DB.prepare(
      `SELECT admin_id, access_subject_hash, email, display_name, role, status, created_at, last_seen_at
       FROM hidn_admin_users
       WHERE access_subject_hash = ? OR (? IS NOT NULL AND email = ?)
       LIMIT 1`,
    )
      .bind(subjectHash, email, email)
      .first<AdminUserRow>();
  }

  if (!row || row.status !== "active") {
    return null;
  }

  await env.ROOM_DB.prepare(
    `UPDATE hidn_admin_users
     SET access_subject_hash = COALESCE(access_subject_hash, ?),
         email = COALESCE(email, ?),
         display_name = COALESCE(?, display_name),
         last_seen_at = ?
     WHERE admin_id = ?`,
  )
    .bind(subjectHash, email, claims.name?.trim() || null, new Date().toISOString(), row.admin_id)
    .run();

  return {
    adminId: row.admin_id,
    email: row.email ?? email,
    displayName: row.display_name ?? claims.name ?? null,
    role: row.role,
    source: "cloudflare_access",
  };
}

type AdminAuthorization = { actor: AdminActor } | Response;

async function requireAdminRole(
  request: Request,
  env: HidnWorkerEnv,
  roles: readonly AdminRole[],
): Promise<AdminAuthorization> {
  const teamDomain = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim() ?? "";
  const audience = env.CLOUDFLARE_ACCESS_AUD?.trim() ?? "";
  if (Boolean(teamDomain) !== Boolean(audience)) {
    return jsonResponse({ error: "Cloudflare Access admin settings are incomplete." }, 503);
  }

  if (teamDomain && audience) {
    let claims: CloudflareAccessClaims | null = null;
    try {
      claims = await validateCloudflareAccessJwt(request, env);
    } catch {
      return jsonResponse({ error: "Cloudflare Access identity validation failed." }, 503);
    }
    if (!claims) {
      return jsonResponse(
        { error: "Cloudflare Access login is required." },
        401,
        "no-store",
        { "WWW-Authenticate": "Bearer" },
      );
    }

    const actor = await resolveCloudflareAdminActor(claims, env);
    if (!actor) {
      return jsonResponse({ error: "This Access identity is not an active HIDN administrator." }, 403);
    }
    if (!roles.includes(actor.role)) {
      return jsonResponse({ error: "This HIDN administrator role cannot perform that action." }, 403);
    }
    return { actor };
  }

  const legacyTokenEnabled = env.ALLOW_LEGACY_ADMIN_TOKEN?.trim().toLowerCase() === "true";
  if (legacyTokenEnabled && await hasValidAdminToken(request, env)) {
    const actor: AdminActor = {
      adminId: "legacy-token",
      email: null,
      displayName: "Legacy report token",
      role: "super_admin",
      source: "legacy_token",
    };
    return roles.includes(actor.role) ? { actor } : jsonResponse({ error: "Administrator role required." }, 403);
  }

  if (!legacyTokenEnabled) {
    return jsonResponse(
      { error: "Cloudflare Access is required for administrator routes." },
      503,
      "no-store",
    );
  }

  if (!env.REPORT_ADMIN_TOKEN?.trim()) {
    return jsonResponse({ error: "Admin authentication is not configured." }, 503);
  }
  return jsonResponse(
    { error: "Admin authorization is required." },
    401,
    "no-store",
    { "WWW-Authenticate": "Bearer" },
  );
}

async function recordAdminAuditEvent(
  actor: AdminActor,
  action: string,
  targetType: string,
  targetId: string,
  reason: string | null,
  env: HidnWorkerEnv,
): Promise<void> {
  if (!env.ROOM_DB) {
    return;
  }
  try {
    await env.ROOM_DB.prepare(
      `INSERT INTO hidn_admin_audit_events
        (event_id, admin_id, action, target_type, target_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(createAdminAuditEventId(), actor.adminId, action, targetType, targetId, reason, new Date().toISOString())
      .run();
  } catch {
    // Moderation remains available during a partial migration; the error is not exposed to users.
  }
}

function serializeAdminUser(row: AdminUserRow): Record<string, unknown> {
  return {
    adminId: row.admin_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

async function getAdminSession(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin", "moderator", "reviewer"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  return jsonResponse({ admin: serializeAdminActor(authorization.actor) });
}

async function listAdminUsers(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const result = await env.ROOM_DB!.prepare(
    `SELECT admin_id, access_subject_hash, email, display_name, role, status, created_at, last_seen_at
     FROM hidn_admin_users
     ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, created_at ASC`,
  ).all<AdminUserRow>();
  return jsonResponse({ admins: result.results.map(serializeAdminUser) });
}

async function createAdminUser(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const body = await requestBody(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : "moderator";
  const accessSubject = typeof body.accessSubject === "string" ? body.accessSubject.trim() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return jsonResponse({ error: "Enter a valid administrator email." }, 400);
  }
  if (!isAdminRole(role)) {
    return jsonResponse({ error: "Choose super_admin, moderator, or reviewer." }, 400);
  }
  if (displayName.length > 120 || accessSubject.length > 200) {
    return jsonResponse({ error: "The administrator details are too long." }, 400);
  }

  const now = new Date().toISOString();
  try {
    await env.ROOM_DB!.prepare(
      `INSERT INTO hidn_admin_users
        (admin_id, access_subject_hash, email, display_name, role, status, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, NULL)`,
    )
      .bind(
        createAdminId(),
        accessSubject ? await hashText(`hidn-admin-subject:${accessSubject}`) : null,
        email,
        displayName || null,
        role,
        now,
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("constraint")) {
      return jsonResponse({ error: "That administrator identity is already listed." }, 409);
    }
    throw error;
  }

  await recordAdminAuditEvent(authorization.actor, "admin_created", "admin", email, role, env);
  return jsonResponse({ status: "created", email, role }, 201);
}

async function updateAdminUser(adminId: string, request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const normalizedAdminId = adminId.trim().toUpperCase();
  if (!/^ADM-[A-F0-9]{24}$/.test(normalizedAdminId)) {
    return jsonResponse({ error: "The administrator ID is invalid." }, 400);
  }

  const current = await env.ROOM_DB!.prepare(
    `SELECT admin_id, access_subject_hash, email, display_name, role, status, created_at, last_seen_at
     FROM hidn_admin_users WHERE admin_id = ? LIMIT 1`,
  )
    .bind(normalizedAdminId)
    .first<AdminUserRow>();
  if (!current) {
    return jsonResponse({ error: "Administrator not found." }, 404);
  }

  const body = await requestBody(request);
  const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : current.role;
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : current.status;
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : current.display_name;
  if (!isAdminRole(role) || !isAdminStatus(status)) {
    return jsonResponse({ error: "Choose a valid role and status." }, 400);
  }
  if (typeof displayName === "string" && displayName.length > 120) {
    return jsonResponse({ error: "The display name is too long." }, 400);
  }
  if (current.admin_id === authorization.actor.adminId && (status !== "active" || role !== "super_admin")) {
    return jsonResponse({ error: "You cannot disable or demote your own super-admin account." }, 400);
  }
  if (current.role === "super_admin" && (role !== "super_admin" || status !== "active")) {
    const count = await env.ROOM_DB!.prepare(
      "SELECT COUNT(*) AS count FROM hidn_admin_users WHERE role = 'super_admin' AND status = 'active'",
    ).first<{ count: number }>();
    if (Number(count?.count ?? 0) <= 1) {
      return jsonResponse({ error: "Keep at least one active super-admin account." }, 409);
    }
  }

  await env.ROOM_DB!.prepare(
    `UPDATE hidn_admin_users SET role = ?, status = ?, display_name = ? WHERE admin_id = ?`,
  )
    .bind(role, status, displayName || null, normalizedAdminId)
    .run();
  await recordAdminAuditEvent(authorization.actor, "admin_updated", "admin", normalizedAdminId, `${role}/${status}`, env);
  return jsonResponse({ status: "updated", adminId: normalizedAdminId, role, accountStatus: status });
}

// MARK: Page-view counting (a tally, not tracking)

/** Folds a path into a page group, so private link slugs, post ids and other
 * identifiers in URLs are never stored. Unknown paths are dropped. */
function pageGroup(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "/";
  if (/^\/to\/[a-z2-9]{8}$/.test(path)) return "/to/:link";
  if (/^\/c\/[^/]+$/.test(path)) return "/c/:post";
  const room = path.match(/^\/r\/([a-z0-9-]+)$/);
  if (room) return roomLinkBySlug(room[1]) ? `/r/${room[1]}` : null;
  const read = path.match(/^\/read(?:\/([a-z]+))?$/);
  if (read) return "/read";
  if (["/how-it-works", "/manifesto", "/privacy", "/mask", "/room/access"].includes(path)) return path;
  if (path.startsWith("/room") || path.startsWith("/explore")) return "/room/*";
  return null;
}

/** The referring site's name only (x.com, whatsapp…), never the full link; visits from HIDN itself are "direct". */
function trafficSource(request: Request): string {
  const referer = request.headers.get("Referer") ?? "";
  if (!referer) return "direct";
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "").replace(/^(m|mobile|l|lm)\./, "");
    if (!host || host === "hidnroom.com" || host.endsWith(".hidnroom.com") || host === "localhost") return "direct";
    if (host === "t.co" || host === "twitter.com" || host === "x.com") return "x.com";
    if (host.includes("whatsapp")) return "whatsapp";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("facebook") || host === "fb.com") return "facebook";
    if (host.includes("google.")) return "google";
    if (host.includes("t.me") || host.includes("telegram")) return "telegram";
    if (host.includes("tiktok")) return "tiktok";
    if (host.includes("reddit")) return "reddit";
    if (host.includes("linkedin") || host === "lnkd.in") return "linkedin";
    return host.slice(0, 60);
  } catch {
    return "direct";
  }
}

const BOT_AGENT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|vkshare|headless|lighthouse|monitor|curl|wget|python|node-fetch|axios|go-http/i;

/** Adds one to today's tally for this page, source and country. Real page loads only. */
async function recordPageView(request: Request, url: URL, env: HidnWorkerEnv): Promise<void> {
  if (!env.ROOM_DB || request.method !== "GET") return;
  // Only top-level page loads, never prefetches or embeds.
  const dest = request.headers.get("Sec-Fetch-Dest");
  if (dest && dest !== "document") return;
  if (request.headers.get("Purpose") === "prefetch" || request.headers.get("Sec-Purpose")?.includes("prefetch")) return;
  if (BOT_AGENT.test(request.headers.get("User-Agent") ?? "")) return;
  const page = pageGroup(url.pathname);
  if (!page) return;
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  const country = /^[A-Z]{2}$/.test(cf?.country ?? "") ? cf!.country! : "??";
  const day = new Date().toISOString().slice(0, 10);
  try {
    await env.ROOM_DB.prepare(
      `INSERT INTO hidn_page_views (day, page, source, country, views) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT (day, page, source, country) DO UPDATE SET views = views + 1`,
    ).bind(day, page, trafficSource(request), country).run();
  } catch {
    // Counting must never break a page load.
  }
}

/** Aggregate usage for the private metrics page: counts and daily totals only.
 * Nothing here can tell members apart; posts are zero-knowledge, so there is
 * no per-person activity to read. */
async function getAdminMetrics(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const db = env.ROOM_DB!;
  const days = 30;
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const one = async (sql: string, ...binds: unknown[]): Promise<number> =>
    Number((await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0);
  const daily = async (table: string): Promise<Record<string, number>> => {
    const rows = await db.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM ${table} WHERE substr(created_at, 1, 10) >= ? GROUP BY day`,
    ).bind(since).all<{ day: string; n: number }>();
    return Object.fromEntries(rows.results.map((row) => [row.day, Number(row.n)]));
  };

  const [members, posts, replies, likes, links, linkMessages, tipPosts, tipMessages, reports, hiddenPosts] = await Promise.all([
    one("SELECT COUNT(*) AS n FROM hidn_anonymous_members"),
    one("SELECT COUNT(*) AS n FROM hidn_threads WHERE hidden_at IS NULL"),
    one("SELECT COUNT(*) AS n FROM hidn_replies WHERE hidden_at IS NULL"),
    one("SELECT COUNT(*) AS n FROM hidn_reactions"),
    one("SELECT COUNT(*) AS n FROM hidn_link_inboxes"),
    one("SELECT COUNT(*) AS n FROM hidn_link_messages"),
    one("SELECT COUNT(*) AS n FROM hidn_threads WHERE tip_address IS NOT NULL AND tip_address != ''"),
    one("SELECT COUNT(*) AS n FROM hidn_link_messages WHERE tip_code IS NOT NULL AND tip_code != ''"),
    one("SELECT COUNT(*) AS n FROM hidn_reports"),
    one("SELECT COUNT(*) AS n FROM hidn_threads WHERE hidden_at IS NOT NULL"),
  ]);
  const [postsReplied, linksWithMessages, recentPosts] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM hidn_threads t WHERE t.hidden_at IS NULL AND substr(t.created_at, 1, 10) >= ?
         AND EXISTS (SELECT 1 FROM hidn_replies r WHERE r.thread_id = t.thread_id)`, since),
    one("SELECT COUNT(DISTINCT link_id) AS n FROM hidn_link_messages"),
    one("SELECT COUNT(*) AS n FROM hidn_threads WHERE hidden_at IS NULL AND substr(created_at, 1, 10) >= ?", since),
  ]);
  const roomRows = await db.prepare(
    `SELECT channel, COUNT(*) AS total, SUM(CASE WHEN substr(created_at, 1, 10) >= ? THEN 1 ELSE 0 END) AS recent
     FROM hidn_threads WHERE hidden_at IS NULL GROUP BY channel ORDER BY total DESC`,
  ).bind(since).all<{ channel: string; total: number; recent: number }>();
  const [memberDays, postDays, replyDays, likeDays, messageDays] = await Promise.all([
    daily("hidn_anonymous_members"),
    daily("hidn_threads"),
    daily("hidn_replies"),
    daily("hidn_reactions"),
    daily("hidn_link_messages"),
  ]);
  const series = Array.from({ length: days }, (_, index) => {
    const day = new Date(Date.parse(`${since}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
    return {
      day,
      members: memberDays[day] ?? 0,
      posts: postDays[day] ?? 0,
      replies: replyDays[day] ?? 0,
      likes: likeDays[day] ?? 0,
      messages: messageDays[day] ?? 0,
    };
  });

  // Traffic, from the daily page-view tally (empty until counting has run).
  let traffic: { pages: Array<{ page: string; views: number }>; sources: Array<{ source: string; views: number }>; countries: Array<{ country: string; views: number }>; daily: Record<string, number>; total: number; home: number; access: number } | null = null;
  try {
    const sum = (column: string) => db.prepare(
      `SELECT ${column} AS key, SUM(views) AS n FROM hidn_page_views WHERE day >= ? GROUP BY ${column} ORDER BY n DESC LIMIT 12`,
    ).bind(since).all<{ key: string; n: number }>();
    const [pages, sources, countries, dailyRows] = await Promise.all([
      sum("page"), sum("source"), sum("country"),
      db.prepare("SELECT day AS key, SUM(views) AS n FROM hidn_page_views WHERE day >= ? GROUP BY day").bind(since).all<{ key: string; n: number }>(),
    ]);
    const pageViews = pages.results.map((row) => ({ page: row.key, views: Number(row.n) }));
    traffic = {
      pages: pageViews,
      sources: sources.results.map((row) => ({ source: row.key, views: Number(row.n) })),
      countries: countries.results.map((row) => ({ country: row.key, views: Number(row.n) })),
      daily: Object.fromEntries(dailyRows.results.map((row) => [row.key, Number(row.n)])),
      total: dailyRows.results.reduce((total, row) => total + Number(row.n), 0),
      home: pageViews.find((row) => row.page === "/")?.views ?? 0,
      access: pageViews.find((row) => row.page === "/room/access")?.views ?? 0,
    };
  } catch {
    traffic = null;
  }

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    days,
    traffic,
    recentMembers: series.reduce((total, day) => total + day.members, 0),
    recentPosts,
    totals: { members, posts, replies, likes, links, linkMessages, tipPosts, tipMessages, reports, hiddenPosts },
    rates: {
      repliedShare: recentPosts ? postsReplied / recentPosts : 0,
      linksWithMessagesShare: links ? linksWithMessages / links : 0,
    },
    rooms: roomRows.results.map((row) => ({ room: row.channel, total: Number(row.total), recent: Number(row.recent ?? 0) })),
    series,
  }, 200, "no-store");
}

async function listAdminAudit(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(200, Math.max(1, requestedLimit)) : 100;
  const result = await env.ROOM_DB!.prepare(
    `SELECT a.event_id, a.admin_id, u.email AS admin_email, a.action, a.target_type,
            a.target_id, a.reason, a.created_at
     FROM hidn_admin_audit_events a
     LEFT JOIN hidn_admin_users u ON u.admin_id = a.admin_id
     ORDER BY a.created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<AdminAuditRow>();
  return jsonResponse({ events: result.results.map((row) => ({
    eventId: row.event_id,
    adminId: row.admin_id,
    adminEmail: row.admin_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    createdAt: row.created_at,
  })) });
}

function serializeAdminReport(row: AdminReportRow): Record<string, unknown> {
  return {
    reportId: row.report_id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetExcerpt: row.target_excerpt,
    reason: row.reason,
    details: row.details,
    reporterUserId: row.reporter_user_id,
    reporterUsername: row.reporter_username,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewerNote: row.reviewer_note,
  };
}

const ADMIN_REPORT_SELECT = `
  SELECT r.report_id, r.target_type, r.target_id, r.target_excerpt,
         r.reason, r.details, r.reporter_user_id, u.username AS reporter_username,
         r.status, r.created_at, r.reviewed_at, r.reviewer_note
  FROM hidn_reports r
  LEFT JOIN hidn_users u ON u.user_id = r.reporter_user_id`;

async function listAdminReports(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin", "moderator", "reviewer"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status")?.trim().toLowerCase() ?? "";
  if (requestedStatus && !isReportStatus(requestedStatus)) {
    return jsonResponse({ error: "The report status filter is invalid." }, 400);
  }

  const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(200, Math.max(1, requestedLimit)) : 100;
  const query = requestedStatus
    ? `${ADMIN_REPORT_SELECT} WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ?`
    : `${ADMIN_REPORT_SELECT} ORDER BY r.created_at DESC LIMIT ?`;
  const statement = env.ROOM_DB!.prepare(query);
  const result = requestedStatus
    ? await statement.bind(requestedStatus, limit).all<AdminReportRow>()
    : await statement.bind(limit).all<AdminReportRow>();
  const summary = await env.ROOM_DB!.prepare(
    "SELECT status, COUNT(*) AS count FROM hidn_reports GROUP BY status ORDER BY status",
  ).all<{ status: ReportStatus; count: number }>();

  return jsonResponse({
    reports: result.results.map(serializeAdminReport),
    summary: summary.results.map((row) => ({ status: row.status, count: Number(row.count) })),
    filter: requestedStatus || "all",
    limit,
  });
}

async function updateAdminReport(reportId: string, request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin", "moderator"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const normalizedReportId = reportId.trim().toUpperCase();
  if (!/^RPT-[A-F0-9]{24}$/.test(normalizedReportId)) {
    return jsonResponse({ error: "The report ID is invalid." }, 400);
  }

  const body = await requestBody(request);
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  const reviewerNote = typeof body.reviewerNote === "string" ? body.reviewerNote.trim() : "";
  if (!isReportStatus(status)) {
    return jsonResponse({ error: "Choose a valid report status." }, 400);
  }
  if (reviewerNote.length > REPORT_MAX_DETAILS_LENGTH) {
    return jsonResponse({ error: "The reviewer note is too long." }, 400);
  }

  const reviewedAt = status === "open" ? null : new Date().toISOString();
  const updateResult = await env.ROOM_DB!.prepare(
    `UPDATE hidn_reports
     SET status = ?, reviewed_at = ?, reviewer_note = ?
     WHERE report_id = ?`,
  )
    .bind(status, reviewedAt, reviewerNote, normalizedReportId)
    .run() as { meta?: { changes?: number } };
  if (updateResult.meta?.changes === 0) {
    return jsonResponse({ error: "Report not found." }, 404);
  }

  const row = await env.ROOM_DB!.prepare(`${ADMIN_REPORT_SELECT} WHERE r.report_id = ? LIMIT 1`)
    .bind(normalizedReportId)
    .first<AdminReportRow>();
  if (!row) {
    return jsonResponse({ error: "Report not found." }, 404);
  }

  await recordAdminAuditEvent(authorization.actor, "report_updated", "report", normalizedReportId, `${status}${reviewerNote ? ` / ${reviewerNote}` : ""}`, env);

  return jsonResponse({ report: serializeAdminReport(row) });
}

async function moderateAdminContent(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin", "moderator"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const body = await requestBody(request);
  const targetType = typeof body.targetType === "string" ? body.targetType.trim().toLowerCase() : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "ADMIN ACTION";
  const reportId = typeof body.reportId === "string" ? body.reportId.trim().toUpperCase() : "";

  if (!isModerationTargetType(targetType)) {
    return jsonResponse({ error: "Only thread and reply content can be moderated." }, 400);
  }
  if (!targetId || targetId.length > REPORT_MAX_TARGET_ID_LENGTH) {
    return jsonResponse({ error: "The moderation target ID is invalid." }, 400);
  }
  if (!isModerationAction(action)) {
    return jsonResponse({ error: "Choose approve, hide, or reject." }, 400);
  }
  if (reason.length > MODERATION_MAX_REASON_LENGTH) {
    return jsonResponse({ error: "The moderation reason is too long." }, 400);
  }
  if (reportId && !/^RPT-[A-F0-9]{24}$/.test(reportId)) {
    return jsonResponse({ error: "The linked report ID is invalid." }, 400);
  }

  const now = new Date().toISOString();
  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_moderation_events
      (event_id, target_type, target_id, action, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(createModerationEventId(), targetType, targetId, action, reason, now)
    .run();

  const moderationState = action === "approve" ? "visible" : action === "reject" ? "rejected" : "hidden";
  const contentUpdate = await env.ROOM_DB!.prepare(
    `UPDATE ${targetType === "thread" ? "hidn_threads" : "hidn_replies"}
     SET moderation_state = ?, hidden_at = ?
     WHERE ${targetType === "thread" ? "thread_id" : "reply_id"} = ?`,
  )
    .bind(moderationState, action === "approve" ? null : now, targetId)
    .run() as { meta?: { changes?: number } };

  let linkedReport = false;
  if (reportId) {
    const reportStatus = action === "approve" ? "reviewed" : "actioned";
    const reportUpdate = await env.ROOM_DB!.prepare(
      `UPDATE hidn_reports
       SET status = ?, reviewed_at = ?, reviewer_note = CASE WHEN ? = '' THEN reviewer_note ELSE ? END
       WHERE report_id = ?`,
    )
      .bind(reportStatus, now, reason, reason, reportId)
      .run() as { meta?: { changes?: number } };
    linkedReport = Number(reportUpdate.meta?.changes ?? 0) > 0;
  }

  await recordAdminAuditEvent(authorization.actor, `content_${action}`, targetType, targetId, reason, env);

  return jsonResponse({
    action,
    targetType,
    targetId,
    persistedContentRow: Number(contentUpdate.meta?.changes ?? 0) > 0,
    linkedReport,
    createdAt: now,
  });
}

async function listModerationVisibility(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const authorization = await requireAdminRole(request, env, ["super_admin", "moderator", "reviewer"]);
  if (authorization instanceof Response) {
    return authorization;
  }

  const result = await env.ROOM_DB!.prepare(
    `SELECT target_type, target_id
     FROM (
       SELECT target_type, target_id, action,
              ROW_NUMBER() OVER (
                PARTITION BY target_type, target_id
                ORDER BY created_at DESC, event_id DESC
              ) AS row_number
       FROM hidn_moderation_events
     )
     WHERE row_number = 1 AND action IN ('hide', 'reject')
     ORDER BY target_type, target_id`,
  ).all<ModerationVisibilityRow>();

  return jsonResponse({
    hiddenTargets: result.results.map((row) => ({ targetType: row.target_type, targetId: row.target_id })),
  });
}

// MARK: Live pulse

/** New posts are only announced once they are at least this old, so a
 * confession never pops up on screens the moment someone sends it. */
const PULSE_MIN_AGE_MS = 2 * 60 * 1000;
const PULSE_LOOKBACK_MS = 30 * 60 * 1000;

/** Recent public posts for the live "new confession" line: room, a short
 * opening and the id, nothing else. */
async function listRoomPulse(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }
  const now = Date.now();
  const sinceParam = Date.parse(new URL(request.url).searchParams.get("since") ?? "");
  const since = new Date(Math.max(Number.isNaN(sinceParam) ? 0 : sinceParam, now - PULSE_LOOKBACK_MS)).toISOString();
  const until = new Date(now - PULSE_MIN_AGE_MS).toISOString();
  const result = await env.ROOM_DB!.prepare(
    `SELECT thread_id, channel, substr(content, 1, 90) AS opening, created_at
     FROM hidn_threads
     WHERE room_id = ? AND moderation_state = 'visible' AND created_at > ? AND created_at <= ?
     ORDER BY created_at ASC
     LIMIT 10`,
  )
    .bind(MAIN_ROOM_ID, since, until)
    .all<{ thread_id: string; channel: string; opening: string; created_at: string }>();

  return jsonResponse({
    until,
    posts: result.results.map((row) => ({ id: row.thread_id, channel: row.channel, opening: row.opening, createdAt: row.created_at })),
  }, 200, "public, max-age=15");
}

// MARK: Room standings

/** The week's competition starts Monday 00:00 UTC. */
function weekStartUtc(now: number): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/** Rooms compete, people don't: confession counts per room for this week
 * and last week's winner. Only totals leave the database. */
async function listRoomStandings(env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }
  const now = Date.now();
  const thisWeek = weekStartUtc(now);
  const lastWeek = thisWeek - 7 * 24 * 60 * 60 * 1000;
  const counts = async (from: number, to: number) => {
    const result = await env.ROOM_DB!.prepare(
      `SELECT channel, COUNT(*) AS posts
       FROM hidn_threads
       WHERE room_id = ? AND moderation_state = 'visible' AND created_at >= ? AND created_at < ?
       GROUP BY channel`,
    )
      .bind(MAIN_ROOM_ID, new Date(from).toISOString(), new Date(to).toISOString())
      .all<{ channel: string; posts: number }>();
    const byChannel = new Map(result.results.map((row) => [row.channel, Number(row.posts)]));
    return ROOM_CHANNELS.map((channel) => ({ channel, posts: byChannel.get(channel) ?? 0 }))
      .sort((a, b) => b.posts - a.posts || ROOM_CHANNELS.indexOf(a.channel) - ROOM_CHANNELS.indexOf(b.channel));
  };
  const [current, previous] = await Promise.all([counts(thisWeek, now + 1), counts(lastWeek, thisWeek)]);
  return jsonResponse({
    weekStart: new Date(thisWeek).toISOString(),
    resetsAt: new Date(thisWeek + 7 * 24 * 60 * 60 * 1000).toISOString(),
    rooms: current,
    lastWeekWinner: previous[0] && previous[0].posts > 0 ? previous[0] : null,
  }, 200, "public, max-age=60");
}

// MARK: Personal confession links

const LINK_MESSAGE_MAX_LENGTH = 500;
const LINK_PROMPT_MAX_LENGTH = 120;
const LINK_INBOX_KEEP = 200;
const LINK_INBOX_DAILY_LIMIT = 120;
const LINK_SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

interface LinkInboxRow {
  link_id: string;
  slug: string;
  prompt: string;
  tip_address: string | null;
  status: "open" | "closed";
  created_at: string;
}

interface LinkMessageRow {
  message_id: string;
  content: string;
  tip_code: string | null;
  created_at: string;
  read_at: string | null;
}

function createLinkSlug(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => LINK_SLUG_ALPHABET[byte % LINK_SLUG_ALPHABET.length]).join("");
}

function isLinkSlug(value: string): boolean {
  return /^[a-z2-9]{8}$/.test(value);
}

function serializeLinkInbox(row: LinkInboxRow): Record<string, unknown> {
  return {
    slug: row.slug,
    prompt: row.prompt,
    tipAddress: row.tip_address,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** The owner proves ownership with the inbox key; only its hash is stored. */
async function linkOwnerKeyHash(request: Request): Promise<string | null> {
  const key = (request.headers.get("X-HIDN-Link-Key") ?? "").trim().toLowerCase();
  return isValidAnonymousCapability(key) ? hashText(key) : null;
}

async function linkInboxForOwner(env: HidnWorkerEnv, ownerKeyHash: string): Promise<LinkInboxRow | null> {
  return env.ROOM_DB!.prepare(
    `SELECT link_id, slug, prompt, tip_address, status, created_at
     FROM hidn_link_inboxes
     WHERE owner_key_hash = ?
     LIMIT 1`,
  )
    .bind(ownerKeyHash)
    .first<LinkInboxRow>();
}

async function getMyLinkInbox(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const ownerKeyHash = await linkOwnerKeyHash(request);
  if (!ownerKeyHash) {
    return jsonResponse({ error: "Send a valid inbox key." }, 400);
  }
  const link = await linkInboxForOwner(env, ownerKeyHash);
  if (!link) {
    return jsonResponse({ link: null, messages: [], unreadCount: 0 }, 200, "no-store");
  }

  const [messages, unread] = await Promise.all([
    env.ROOM_DB!.prepare(
      `SELECT message_id, content, tip_code, created_at, read_at
       FROM hidn_link_messages
       WHERE link_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
      .bind(link.link_id)
      .all<LinkMessageRow>(),
    env.ROOM_DB!.prepare(
      `SELECT COUNT(*) AS count FROM hidn_link_messages WHERE link_id = ? AND read_at IS NULL`,
    )
      .bind(link.link_id)
      .first<{ count: number }>(),
  ]);

  return jsonResponse({
    link: serializeLinkInbox(link),
    messages: messages.results.map((message) => ({
      id: message.message_id,
      text: message.content,
      tipCode: message.tip_code,
      createdAt: message.created_at,
      readAt: message.read_at,
    })),
    unreadCount: Number(unread?.count ?? 0),
  }, 200, "no-store");
}

async function createMyLinkInbox(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = anonymousZkUnavailable(env);
  if (unavailable) {
    return unavailable;
  }
  const rateLimit = await enforceEdgeRateLimit(request, env, { action: "link-create", limit: 10, windowMs: 30 * 60 * 1000 });
  if (rateLimit) {
    return rateLimit;
  }

  const ownerKeyHash = await linkOwnerKeyHash(request);
  if (!ownerKeyHash) {
    return jsonResponse({ error: "Send a valid inbox key." }, 400);
  }
  const existing = await linkInboxForOwner(env, ownerKeyHash);
  if (existing) {
    return jsonResponse({ link: serializeLinkInbox(existing), status: "existing" }, 200, "no-store");
  }

  // Only room members can open a link. The proof is bound to the hash of the
  // inbox key, so it cannot be replayed to open a link for another key.
  const body = await requestBody(request);
  const action = await verifyAnonymousAction(env, body, "link", "room", "INBOX", ownerKeyHash);
  if (action instanceof Response) {
    return action;
  }

  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row: LinkInboxRow = {
      link_id: `LNK-${createRandomHex(12).toUpperCase()}`,
      slug: createLinkSlug(),
      prompt: "",
      tip_address: null,
      status: "open",
      created_at: now,
    };
    try {
      await env.ROOM_DB!.prepare(
        `INSERT INTO hidn_link_inboxes
          (link_id, slug, owner_key_hash, prompt, tip_address, status, created_at, updated_at)
         VALUES (?, ?, ?, '', NULL, 'open', ?, ?)`,
      )
        .bind(row.link_id, row.slug, ownerKeyHash, now, now)
        .run();
      return jsonResponse({ link: serializeLinkInbox(row), status: "created" }, 201, "no-store");
    } catch {
      const raced = await linkInboxForOwner(env, ownerKeyHash);
      if (raced) {
        return jsonResponse({ link: serializeLinkInbox(raced), status: "existing" }, 200, "no-store");
      }
      // Otherwise the slug collided; try another.
    }
  }
  return jsonResponse({ error: "The link could not be created. Try again." }, 500);
}

async function updateMyLinkInbox(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const ownerKeyHash = await linkOwnerKeyHash(request);
  if (!ownerKeyHash) {
    return jsonResponse({ error: "Send a valid inbox key." }, 400);
  }
  const link = await linkInboxForOwner(env, ownerKeyHash);
  if (!link) {
    return jsonResponse({ error: "Create your link first." }, 404);
  }

  const body = await requestBody(request);
  const next = { ...link };
  if (typeof body.prompt === "string") {
    const prompt = body.prompt.replace(/\s+/g, " ").trim();
    if (prompt.length > LINK_PROMPT_MAX_LENGTH) {
      return jsonResponse({ error: `Keep the prompt under ${LINK_PROMPT_MAX_LENGTH} characters.` }, 400);
    }
    if (containsLink(prompt)) {
      return jsonResponse({ error: LINK_BLOCKED_ERROR, code: "LINKS_NOT_ALLOWED" }, 400);
    }
    next.prompt = prompt;
  }
  if (typeof body.tipAddress === "string") {
    const tipAddress = normalizeMainnetTipAddress(body.tipAddress);
    if (tipAddress && !isValidMainnetTipAddress(tipAddress)) {
      return jsonResponse({ error: "Use a shielded Zcash mainnet address beginning with u1 or zs1." }, 400);
    }
    next.tip_address = tipAddress || null;
  }
  if (body.status === "open" || body.status === "closed") {
    next.status = body.status;
  }
  // A new address retires the old one at once: anyone holding it gets nothing.
  if (body.rotate === true) {
    next.slug = createLinkSlug();
  }

  try {
    await env.ROOM_DB!.prepare(
      `UPDATE hidn_link_inboxes
       SET slug = ?, prompt = ?, tip_address = ?, status = ?, updated_at = ?
       WHERE link_id = ?`,
    )
      .bind(next.slug, next.prompt, next.tip_address, next.status, new Date().toISOString(), link.link_id)
      .run();
  } catch {
    return jsonResponse({ error: "The link could not be updated. Try again." }, 409);
  }
  return jsonResponse({ link: serializeLinkInbox(next), status: "updated" }, 200, "no-store");
}

async function markMyLinkMessagesRead(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const ownerKeyHash = await linkOwnerKeyHash(request);
  const link = ownerKeyHash ? await linkInboxForOwner(env, ownerKeyHash) : null;
  if (!link) {
    return jsonResponse({ error: "Inbox not found." }, 404);
  }
  await env.ROOM_DB!.prepare(
    `UPDATE hidn_link_messages SET read_at = ? WHERE link_id = ? AND read_at IS NULL`,
  )
    .bind(new Date().toISOString(), link.link_id)
    .run();
  return jsonResponse({ status: "read" });
}

async function deleteMyLinkMessage(messageId: string, request: Request, env: HidnWorkerEnv): Promise<Response> {
  const ownerKeyHash = await linkOwnerKeyHash(request);
  const link = ownerKeyHash ? await linkInboxForOwner(env, ownerKeyHash) : null;
  if (!link) {
    return jsonResponse({ error: "Inbox not found." }, 404);
  }
  await env.ROOM_DB!.prepare(`DELETE FROM hidn_link_messages WHERE message_id = ? AND link_id = ?`)
    .bind(messageId, link.link_id)
    .run();
  return jsonResponse({ status: "deleted" });
}

async function linkInboxBySlug(env: HidnWorkerEnv, slug: string): Promise<LinkInboxRow | null> {
  return env.ROOM_DB!.prepare(
    `SELECT link_id, slug, prompt, tip_address, status, created_at
     FROM hidn_link_inboxes
     WHERE slug = ?
     LIMIT 1`,
  )
    .bind(slug)
    .first<LinkInboxRow>();
}

async function getPublicLink(slug: string, env: HidnWorkerEnv): Promise<Response> {
  const link = await linkInboxBySlug(env, slug);
  if (!link) {
    return jsonResponse({ error: "This link does not exist or was replaced." }, 404);
  }
  return jsonResponse({
    link: { slug: link.slug, prompt: link.prompt, tipAddress: link.tip_address, status: link.status },
  }, 200, "no-store");
}

/** Anyone holding the link may write. Nothing about the sender is stored:
 * abuse limits use only the short-lived edge digest the room already uses. */
async function sendLinkMessage(slug: string, request: Request, env: HidnWorkerEnv): Promise<Response> {
  const rateLimit = await enforceEdgeRateLimit(request, env, { action: "link-send", limit: 8, windowMs: 10 * 60 * 1000 });
  if (rateLimit) {
    return rateLimit;
  }

  const body = await requestBody(request);
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const tipCode = typeof body.tipCode === "string" ? body.tipCode.trim().toUpperCase() : "";
  if (!content) {
    return jsonResponse({ error: "Write something before sending." }, 400);
  }
  if (content.length > LINK_MESSAGE_MAX_LENGTH) {
    return jsonResponse({ error: `Messages must be ${LINK_MESSAGE_MAX_LENGTH} characters or fewer.` }, 400);
  }
  if (containsLink(content)) {
    return jsonResponse({ error: LINK_BLOCKED_ERROR, code: "LINKS_NOT_ALLOWED" }, 400);
  }
  if (tipCode && !/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(tipCode)) {
    return jsonResponse({ error: "That tip code is not valid." }, 400);
  }

  const link = await linkInboxBySlug(env, slug);
  if (!link) {
    return jsonResponse({ error: "This link does not exist or was replaced." }, 404);
  }
  if (link.status !== "open") {
    return jsonResponse({ error: "This link is closed. It is not taking messages right now." }, 403);
  }
  if (tipCode && !link.tip_address) {
    return jsonResponse({ error: "This link does not take ZEC tips." }, 400);
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await env.ROOM_DB!.prepare(
    `SELECT COUNT(*) AS count FROM hidn_link_messages WHERE link_id = ? AND created_at >= ?`,
  )
    .bind(link.link_id, dayAgo)
    .first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= LINK_INBOX_DAILY_LIMIT) {
    return jsonResponse({ error: "This inbox has taken all it can for today. Try again tomorrow." }, 429);
  }

  const abuseResponse = await assessAnonymousAbuse(request, env, content);
  if (abuseResponse) {
    return abuseResponse;
  }

  const createdAt = new Date().toISOString();
  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_link_messages (message_id, link_id, content, tip_code, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  )
    .bind(`MSG-${createRandomHex(12).toUpperCase()}`, link.link_id, content, tipCode || null, createdAt)
    .run();
  // Keep each inbox bounded; the oldest messages fall away first.
  await env.ROOM_DB!.prepare(
    `DELETE FROM hidn_link_messages
     WHERE link_id = ? AND message_id NOT IN (
       SELECT message_id FROM hidn_link_messages WHERE link_id = ? ORDER BY created_at DESC LIMIT ${LINK_INBOX_KEEP}
     )`,
  )
    .bind(link.link_id, link.link_id)
    .run();

  return jsonResponse({ status: "sent", createdAt }, 201, "no-store");
}

async function routeLinkApi(url: URL, request: Request, env: HidnWorkerEnv): Promise<Response | undefined> {
  if (!url.pathname.startsWith("/api/links/")) {
    return undefined;
  }
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }
  const path = url.pathname.slice("/api/links/".length).replace(/\/+$/, "");
  const method = request.method;

  try {
    if (path === "mine") {
      if (method === "GET") return await getMyLinkInbox(request, env);
      if (method === "POST") return await createMyLinkInbox(request, env);
      if (method === "PATCH") return await updateMyLinkInbox(request, env);
      return jsonResponse({ error: "Method not allowed." }, 405);
    }
    if (path === "mine/read") {
      return method === "POST" ? await markMyLinkMessagesRead(request, env) : jsonResponse({ error: "Method not allowed." }, 405);
    }
    const deleteMatch = path.match(/^mine\/messages\/(MSG-[A-F0-9]{24})$/);
    if (deleteMatch) {
      return method === "DELETE" ? await deleteMyLinkMessage(deleteMatch[1], request, env) : jsonResponse({ error: "Method not allowed." }, 405);
    }
    const sendMatch = path.match(/^([a-z2-9]{8})\/messages$/);
    if (sendMatch) {
      return method === "POST" ? await sendLinkMessage(sendMatch[1], request, env) : jsonResponse({ error: "Method not allowed." }, 405);
    }
    if (isLinkSlug(path)) {
      return method === "GET" ? await getPublicLink(path, env) : jsonResponse({ error: "Method not allowed." }, 405);
    }
    return jsonResponse({ error: "Not found." }, 404);
  } catch {
    return jsonResponse({ error: "The link service is unavailable right now." }, 500);
  }
}

// MARK: Link previews for shared rooms and personal links

interface SharePreview { title: string; description: string; image: string; imageAlt: string }

// Every preview shares one look (public/brand/og) and one title format: "Page · HIDN".
const OG = (name: string): string => `/brand/og/${name}.png`;
const INFO_PAGES: Record<string, SharePreview> = {
  "/": {
    title: "HIDN · Say what you can't say out loud",
    description: "A private room with no names. Say what you can't say out loud, and nobody, not even HIDN, knows it was you.",
    image: OG("home"),
    imageAlt: "HIDN: say what you can't say out loud. A private room with no names.",
  },
  "/read": {
    title: "What people can't say out loud · HIDN",
    description: "Real posts from real people, with no names attached. Read as long as you like, no account needed.",
    image: OG("read"),
    imageAlt: "HIDN: what people can't say out loud. Real posts, no names attached.",
  },
  "/room/access": {
    title: "Get in without a name · HIDN",
    description: "No email, no phone number, no username. A private key made in your browser is your way in.",
    image: OG("access"),
    imageAlt: "HIDN: get in without a name. No email, no phone number, no username.",
  },
  "/how-it-works": {
    title: "How it works · HIDN",
    description: "No account, no email, no name. Your browser proves you're a member without saying which one. Here's how HIDN keeps you anonymous.",
    image: OG("how-it-works"),
    imageAlt: "HIDN: how HIDN keeps you anonymous. Your browser proves you're a member, never which one.",
  },
  "/manifesto": {
    title: "Manifesto · HIDN",
    description: "Why HIDN exists: a place to say what you can't say anywhere else, where nobody, not even us, knows it was you.",
    image: OG("manifesto"),
    imageAlt: "HIDN manifesto: show the thought, hide the person.",
  },
  "/privacy": {
    title: "Privacy · HIDN",
    description: "What HIDN stores, what it never sees, and where its privacy limits are today. Plain answers about posts, links and tips.",
    image: OG("privacy"),
    imageAlt: "HIDN privacy: what HIDN can and can't see.",
  },
};

/** "THINGS I'VE NEVER TOLD ANYONE" reads as "Things I've never told anyone". */
function roomTitle(label: string): string {
  const lower = label.toLowerCase().replace(/\bi\b/g, "I").replace(/\bzec\b/g, "ZEC");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function sentence(text: string): string {
  const trimmed = text.trim().replace(/[.!?]*$/, "");
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

/** Chat apps and social sites read a link's preview from the HTML without
 * running the page, so shared rooms and personal links get theirs here. */
function sharePreviewFor(pathname: string): SharePreview | null {
  const room = pathname.match(/^\/r\/([a-z0-9-]+)\/?$/);
  if (room) {
    const link = roomLinkBySlug(room[1]);
    if (!link) return null;
    return {
      title: `${roomTitle(link.title)} · HIDN`,
      description: `${sentence(link.description)} An anonymous room on HIDN. No names, ever.`,
      image: OG(`room-${link.slug}`),
      imageAlt: `${roomTitle(link.title)} on HIDN: ${sentence(link.description)}`,
    };
  }
  // The public info pages each need their own title, description and
  // canonical, or search engines fold them into the homepage.
  const info = INFO_PAGES[pathname === "/" ? "/" : pathname.replace(/\/+$/, "")] ?? (/^\/read\/[a-z-]+\/?$/.test(pathname) ? INFO_PAGES["/read"] : undefined);
  if (info) return info;
  if (/^\/mask\/?$/.test(pathname)) {
    return {
      title: "Go anonymous · HIDN",
      description: "12 masks for your profile picture that wipe your whole face, not just your eyes. Made on your device; your photo is never uploaded or stored.",
      image: OG("mask"),
      imageAlt: "Go anonymous: six of the twelve profile picture masks, each with the whole face wiped.",
    };
  }
  if (/^\/to\/[a-z2-9]{8}\/?$/.test(pathname)) {
    return {
      title: "Someone shared their private link with you · HIDN",
      description: "Say what you never said to them. No account, no name. They'll never know it was you.",
      image: OG("link"),
      imageAlt: "HIDN: say it. No names. They'll never know it was you.",
    };
  }
  return null;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function withSharePreview(html: string, preview: SharePreview, url: URL): string {
  // Canonical URLs always name the production origin, without a trailing slash.
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  const absoluteUrl = `${CANONICAL_ORIGIN}${path}`;
  const image = `${CANONICAL_ORIGIN}${preview.image}?v=2`;
  const set = (text: string, pattern: RegExp, value: string): string =>
    text.replace(pattern, (_match, before: string, after: string) => `${before}${escapeAttribute(value)}${after}`);
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttribute(preview.title)}</title>`);
  out = set(out, /(<meta\s+name="description"\s+content=")[^"]*(")/, preview.description);
  out = set(out, /(<link rel="canonical" href=")[^"]*(")/, absoluteUrl);
  out = set(out, /(<meta property="og:title" content=")[^"]*(")/, preview.title);
  out = set(out, /(<meta\s+property="og:description"\s+content=")[^"]*(")/, preview.description);
  out = set(out, /(<meta property="og:url" content=")[^"]*(")/, absoluteUrl);
  out = set(out, /(<meta property="og:image" content=")[^"]*(")/, image);
  out = set(out, /(<meta property="og:image:alt" content=")[^"]*(")/, preview.imageAlt);
  out = set(out, /(<meta name="twitter:title" content=")[^"]*(")/, preview.title);
  out = set(out, /(<meta name="twitter:description" content=")[^"]*(")/, preview.description);
  out = set(out, /(<meta name="twitter:image" content=")[^"]*(")/, image);
  out = set(out, /(<meta name="twitter:image:alt" content=")[^"]*(")/, preview.imageAlt);
  return out;
}

const INDEXABLE_PUBLIC_PATHS = new Set(["/", "/how-it-works", "/manifesto", "/privacy", "/mask"]);

function crawlerPolicyForHtmlPath(pathname: string): string {
  const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return INDEXABLE_PUBLIC_PATHS.has(normalizedPath)
    ? "index, follow"
    : "noindex, nofollow, noarchive, nosnippet";
}

const worker = {
  async fetch(request: Request, env: HidnWorkerEnv, ctx?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);

    // hidnroom.com is the address. Page visits to www or the old workers.dev
    // address move there for good, path and all, so shared links keep
    // working. API calls are served where they land, so a page someone
    // already has open does not break mid-post.
    if (
      (url.hostname === "www.hidnroom.com" || url.hostname.endsWith(".workers.dev"))
      && (request.method === "GET" || request.method === "HEAD")
      && !url.pathname.startsWith("/api/")
    ) {
      return Response.redirect(`${CANONICAL_ORIGIN}${url.pathname}${url.search}`, 301);
    }

    if (url.pathname === "/api/anonymous/status") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      return await getAnonymousStatus(request, env);
    }

    if (url.pathname === "/api/anonymous/enroll") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await enrollAnonymousMember(request, env);
      } catch {
        return jsonResponse({ error: "Anonymous membership could not be enrolled." }, 500);
      }
    }

    if (url.pathname === "/api/anonymous/posts") {
      if (request.method !== "GET" && request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return request.method === "GET"
          ? await listAnonymousPosts(request, env)
          : await createAnonymousPost(request, env);
      } catch {
        return jsonResponse({ error: request.method === "GET" ? "Anonymous posts could not be loaded." : "Anonymous post could not be created." }, 500);
      }
    }

    if (url.pathname === "/api/anonymous/thread") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listAnonymousThread(request, env);
      } catch {
        return jsonResponse({ error: "Anonymous thread could not be loaded." }, 500);
      }
    }

    if (url.pathname === "/api/anonymous/replies") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await createAnonymousReply(request, env);
      } catch {
        return jsonResponse({ error: "Anonymous reply could not be created." }, 500);
      }
    }

    if (url.pathname === "/api/anonymous/reactions") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await createAnonymousReaction(request, env);
      } catch {
        return jsonResponse({ error: "Anonymous reaction could not be saved." }, 500);
      }
    }

    if (url.pathname === "/api/anonymous/notifications") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listAnonymousNotifications(request, env);
      } catch {
        return jsonResponse({ error: "Anonymous notifications could not be loaded." }, 500);
      }
    }

    if (url.pathname === "/api/anonymous/notifications/read") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await markAnonymousNotificationsRead(request, env);
      } catch {
        return jsonResponse({ error: "Anonymous notifications could not be updated." }, 500);
      }
    }

    if (url.pathname === "/api/room/activity") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listLiveActivity(request, env);
      } catch {
        return jsonResponse({ error: "Live room activity could not be loaded." }, 500);
      }
    }

    if (url.pathname === "/api/room/standings") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }
      try {
        return await listRoomStandings(env);
      } catch {
        return jsonResponse({ error: "The room standings are unavailable." }, 500);
      }
    }

    if (url.pathname === "/api/room/pulse") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }
      try {
        return await listRoomPulse(request, env);
      } catch {
        return jsonResponse({ error: "The live pulse is unavailable." }, 500);
      }
    }

    if (url.pathname === "/api/reports") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await submitReport(request, env);
      } catch {
        return jsonResponse({ error: "Report could not be submitted." }, 500);
      }
    }

    if (url.pathname === "/api/moderation/visibility") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listModerationVisibility(request, env);
      } catch {
        return jsonResponse({ error: "Moderation visibility could not be loaded." }, 500);
      }
    }

    const adminApiPath = url.pathname.startsWith("/admin/api/admin/")
      ? url.pathname.slice("/admin".length)
      : url.pathname;

    if (adminApiPath === "/api/admin/session") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await getAdminSession(request, env);
      } catch {
        return jsonResponse({ error: "Admin session could not be loaded." }, 500);
      }
    }

    if (adminApiPath === "/api/admin/moderators") {
      try {
        if (request.method === "GET") {
          return await listAdminUsers(request, env);
        }
        if (request.method === "POST") {
          return await createAdminUser(request, env);
        }
        return jsonResponse({ error: "Method not allowed." }, 405);
      } catch {
        return jsonResponse({ error: "Administrator records could not be updated." }, 500);
      }
    }

    const adminUserMatch = adminApiPath.match(/^\/api\/admin\/moderators\/([^/]+)$/);
    if (adminUserMatch) {
      if (request.method !== "PATCH") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await updateAdminUser(decodeURIComponent(adminUserMatch[1]), request, env);
      } catch {
        return jsonResponse({ error: "Administrator record could not be updated." }, 500);
      }
    }

    if (adminApiPath === "/api/admin/metrics") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await getAdminMetrics(request, env);
      } catch {
        return jsonResponse({ error: "Metrics could not be loaded." }, 500);
      }
    }

    if (adminApiPath === "/api/admin/audit") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listAdminAudit(request, env);
      } catch {
        return jsonResponse({ error: "Admin audit could not be loaded." }, 500);
      }
    }

    if (adminApiPath === "/api/admin/reports") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listAdminReports(request, env);
      } catch {
        return jsonResponse({ error: "Reports could not be loaded." }, 500);
      }
    }

    if (adminApiPath === "/api/admin/moderation") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await moderateAdminContent(request, env);
      } catch {
        return jsonResponse({ error: "Moderation action could not be recorded." }, 500);
      }
    }

    const adminReportMatch = adminApiPath.match(/^\/api\/admin\/reports\/([^/]+)$/);
    if (adminReportMatch) {
      if (request.method !== "PATCH") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await updateAdminReport(decodeURIComponent(adminReportMatch[1]), request, env);
      } catch {
        return jsonResponse({ error: "Report could not be updated." }, 500);
      }
    }

    const linkResponse = await routeLinkApi(url, request, env);
    if (linkResponse) {
      return linkResponse;
    }

    if (url.pathname === "/api/zcash-tip") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        const upstream = await fetch(CIPHERSCAN_RECENT_BLOCKS_URL, {
          headers: { Accept: "application/json" },
        });

        if (!upstream.ok) {
          return jsonResponse({ error: "CipherScan mainnet data is unavailable." }, 502);
        }

        const body = await upstream.text();
        return new Response(body, {
          headers: {
            ...securityHeaders(),
            "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
            "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
          },
        });
      } catch {
        return jsonResponse({ error: "CipherScan mainnet data is unavailable." }, 502);
      }
    }

    if (url.pathname === "/api/zcash-stats") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return jsonResponse(
          await getShieldedScanStats(),
          200,
          "public, max-age=60, stale-while-revalidate=300",
        );
      } catch {
        return jsonResponse({ error: "ShieldedScan mainnet data is unavailable." }, 502);
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("content-type") ?? "";

    const anonymousZkContentType = anonymousZkAssetContentType(url.pathname);
    if (anonymousZkContentType) {
      if (!assetResponse.ok || contentType.toLowerCase().includes("text/html")) {
        return new Response("Anonymous proof assets are not available on this deployment.", {
          status: 503,
          headers: {
            ...securityHeaders(),
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      const headers = new Headers(assetResponse.headers);
      for (const [name, value] of Object.entries(securityHeaders())) {
        headers.set(name, value);
      }
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Content-Type", anonymousZkContentType);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(assetResponse.body, {
        headers,
        status: assetResponse.status,
        statusText: assetResponse.statusText,
      });
    }

    if (!contentType.toLowerCase().includes("text/html")) {
      const headers = new Headers(assetResponse.headers);
      for (const [name, value] of Object.entries(securityHeaders())) {
        headers.set(name, value);
      }
      return new Response(assetResponse.body, {
        headers,
        status: assetResponse.status,
        statusText: assetResponse.statusText,
      });
    }

    if (assetResponse.ok) {
      const counted = recordPageView(request, url, env);
      if (ctx) ctx.waitUntil(counted); else void counted;
    }
    const headers = new Headers(assetResponse.headers);
    for (const [name, value] of Object.entries(htmlSecurityHeaders(request))) {
      headers.set(name, value);
    }
    headers.set("X-Robots-Tag", crawlerPolicyForHtmlPath(url.pathname));
    const preview = sharePreviewFor(url.pathname);
    if (preview && assetResponse.ok) {
      headers.delete("Content-Length");
      headers.delete("ETag");
      return new Response(withSharePreview(await assetResponse.text(), preview, url), {
        headers,
        status: assetResponse.status,
        statusText: assetResponse.statusText,
      });
    }
    return new Response(assetResponse.body, {
      headers,
      status: assetResponse.status,
      statusText: assetResponse.statusText,
    });
  },
};

export default worker;
