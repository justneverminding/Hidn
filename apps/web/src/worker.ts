import {
  buildZkChallengeMessage,
  isValidZkPublicKey,
  verifyZkProof,
} from "@hidn/zk";

const CIPHERSCAN_RECENT_BLOCKS_URL =
  "https://api.mainnet.cipherscan.app/api/blocks?limit=1";
const SHIELDEDSCAN_STATUS_URL = "https://api.shieldedscan.xyz/v1/status";
const SHIELDEDSCAN_SUPPLY_URL = "https://api.shieldedscan.xyz/v1/supply";
const COINGECKO_ZEC_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd";
const ROOM_USD_TARGET_CENTS = 100;
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAYMENT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const ZK_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const WATCHER_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAIN_ROOM_ID = "HIDN-MAIN-ROOM";
const ROOM_FREE_POST_MAX_LENGTH = 200;
const ROOM_FREE_REPLY_MAX_LENGTH = 100;
const ROOM_VERIFIED_POST_MAX_LENGTH = 2000;
const ROOM_VERIFIED_REPLY_MAX_LENGTH = 1200;
const RECOVERY_CONFIRMATION_QUESTIONS = [
  "Do you understand that this is your recovery key to the private room?",
  "Do you understand that HIDN cannot recover this key if you lose it?",
] as const;
const RECOVERY_CONFIRMATION_ANSWER = "yes";
const ABUSE_WINDOW_MS = 10 * 60 * 1000;
const ABUSE_REPEAT_WINDOW_MS = 30 * 60 * 1000;
const ABUSE_SIGNAL_TTL_MS = 2 * 60 * 60 * 1000;
const ABUSE_EDGE_BUCKET_MS = 30 * 60 * 1000;
const ABUSE_BURST_THRESHOLD = 5;
const ABUSE_COOLDOWN_RISK_THRESHOLD = 3;
const ABUSE_COOLDOWN_BASE_MS = 30 * 1000;
const ABUSE_COOLDOWN_MAX_MS = 15 * 60 * 1000;
const LIVE_ACTIVITY_LIMIT = 8;
const LIVE_ACTIVITY_RETENTION_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
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

// `read_only` is the historical database value for free room access. It no
// longer blocks ordinary posts or replies; `full` is optional verified access.
type AccessLevel = "read_only" | "full";
type AuthMethod = "recovery_code" | "schnorr";
type LegacyRoomStatus = "pending" | "verified";
type RoomChannel = "general" | "love" | "privacy" | "politics" | "family" | "work";
type ActivityAction = "JUST OPENED" | "JUST RETURNED" | "JUST POSTED" | "JUST REPLIED";
type ActivitySubject = "A ROOM KEY" | "TO THE ROOM" | "A THOUGHT" | "A THREAD";
type NotificationEventType = "reaction" | "reply";
type ReportTargetType = "thread" | "reply" | "account";
type ReportReason = "spam" | "harassment" | "threats" | "sexual_content" | "personal_data" | "self_harm" | "other";
type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";
type ModerationAction = "approve" | "hide" | "reject";
type PaymentStatus =
  | "pending"
  | "detected"
  | "confirmed"
  | "underpaid"
  | "overpaid"
  | "expired"
  | "refund_pending"
  | "refunded"
  | "reorged";

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

interface HidnWorkerEnv {
  ASSETS: AssetFetcher;
  ROOM_DB?: RoomDatabase;
  ZEC_USD_PRICE?: string;
  ROOM_SHIELDED_ADDRESS?: string;
  ROOM_PAYMENT_ZATOSHIS?: string;
  PAYMENT_MIN_CONFIRMATIONS?: string;
  PAYMENT_WATCHER_SECRET?: string;
  REFUND_ENCRYPTION_KEY?: string;
  REPORT_ADMIN_TOKEN?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  HIDN_SUPER_ADMIN_ACCESS_SUBJECT?: string;
  HIDN_SUPER_ADMIN_EMAIL?: string;
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

interface AuthenticatedUser {
  userId: string;
  username: string;
  accessLevel: AccessLevel;
}

function roomPostMaxLength(user: AuthenticatedUser): number {
  return user.accessLevel === "full" ? ROOM_VERIFIED_POST_MAX_LENGTH : ROOM_FREE_POST_MAX_LENGTH;
}

function roomReplyMaxLength(user: AuthenticatedUser): number {
  return user.accessLevel === "full" ? ROOM_VERIFIED_REPLY_MAX_LENGTH : ROOM_FREE_REPLY_MAX_LENGTH;
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

interface PaymentIntentRow {
  payment_intent_id: string;
  user_id: string;
  payment_reference: string;
  expected_amount_zat: number;
  receiving_address: string | null;
  refund_address_hash: string | null;
  status: PaymentStatus;
  transaction_id: string | null;
  output_index: number | null;
  observed_amount_zat: number | null;
  confirmations: number;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
}

interface AdminReportRow {
  report_id: string;
  target_type: ReportTargetType;
  target_id: string;
  target_excerpt: string;
  reason: ReportReason;
  details: string;
  reporter_user_id: string;
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
  reactions?: number;
  reply_count?: number;
  liked_by_current_user?: number;
}

interface AccountHistoryPostRow extends RoomPostRow {
  moderation_state: "visible" | "pending" | "hidden" | "rejected";
}

interface AccountHistoryStatsRow {
  post_count: number;
  comment_count: number;
  like_count: number;
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
}

interface RoomNotificationRow {
  notification_id: string;
  event_type: NotificationEventType;
  actor_alias: string | null;
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
const ROOM_CHANNELS: readonly RoomChannel[] = ["general", "love", "privacy", "politics", "family", "work"];
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
const REPORT_MAX_PER_HOUR = 20;
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
      ...extraHeaders,
    },
  });
}

async function getZecUsdPrice(env: HidnWorkerEnv): Promise<{ price: number; source: string }> {
  const configuredPrice = Number(env.ZEC_USD_PRICE);
  if (Number.isFinite(configuredPrice) && configuredPrice > 0) {
    return { price: configuredPrice, source: "WORKER CONFIG" };
  }

  const response = await fetch(COINGECKO_ZEC_PRICE_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "HIDN-room-config/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`ZEC price returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { zcash?: { usd?: unknown } };
  const price = Number(payload.zcash?.usd);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("ZEC price response was invalid.");
  }

  return { price, source: "COINGECKO" };
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

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
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

function createRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createRoomId(): string {
  return `HIDN-${createRandomHex(8).toUpperCase()}`;
}

function createUserId(): string {
  return `USR-${createRandomHex(12).toUpperCase()}`;
}

function createSessionId(): string {
  return `SES-${createRandomHex(12).toUpperCase()}`;
}

function createZkChallengeId(): string {
  return `CHL-${createRandomHex(16).toUpperCase()}`;
}

function createPaymentIntentId(): string {
  return `PAY-${createRandomHex(12).toUpperCase()}`;
}

function createPaymentReference(): string {
  return `HIDN-PAY-${createRandomHex(8).toUpperCase()}`;
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

function createNotificationId(): string {
  return `NTF-${createRandomHex(12).toUpperCase()}`;
}

function createNotificationAlias(): string {
  return `ANON-${createRandomHex(4).toUpperCase()}`;
}

function createActivitySignalRef(): string {
  return `SIGNAL ${createRandomHex(2).toUpperCase()}`;
}

function createAccessCode(): string {
  const rawCharacters: string[] = [];
  const bucketSize = Math.floor(256 / ACCESS_CODE_ALPHABET.length) * ACCESS_CODE_ALPHABET.length;
  while (rawCharacters.length < 20) {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= bucketSize) {
        continue;
      }
      rawCharacters.push(ACCESS_CODE_ALPHABET[byte % ACCESS_CODE_ALPHABET.length]);
      if (rawCharacters.length === 20) {
        break;
      }
    }
  }
  const raw = rawCharacters.join("");
  return `HIDN-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}`;
}

function normalizeAccessCode(accessCode: string): string {
  return accessCode.trim().toUpperCase().replace(/[\s-]/g, "");
}

function normalizeUsername(username: string): string {
  return username.trim().toUpperCase();
}

function isValidUsername(username: string): boolean {
  return /^HIDN-[A-Z0-9]{1,20}$/.test(username);
}

function normalizeRecoveryAnswer(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 200);
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

function isReportTargetType(value: string): value is ReportTargetType {
  return value === "thread" || value === "reply" || value === "account";
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

async function assessRoomAbuse(
  request: Request,
  env: HidnWorkerEnv,
  user: AuthenticatedUser,
  content: string,
): Promise<Response | undefined> {
  const now = Date.now();
  const contentHash = await hashText(normalizeAbuseContent(content));
  const cooldownRiskThreshold = user.accessLevel === "full"
    ? ABUSE_COOLDOWN_RISK_THRESHOLD + 2
    : ABUSE_COOLDOWN_RISK_THRESHOLD;
  const signalKeys = [`account:${user.userId}`];
  const edgeSignalKey = await abuseSignalKeyForEdge(request, now);
  if (edgeSignalKey) {
    signalKeys.push(edgeSignalKey);
  }

  const observations = await Promise.all(
    signalKeys.map((signalKey) => updateAbuseSignal(env, signalKey, contentHash, now, cooldownRiskThreshold)),
  );
  if (env.ROOM_DB) {
    try {
      await env.ROOM_DB.prepare("DELETE FROM hidn_abuse_signals WHERE expires_at <= ?")
        .bind(new Date(now).toISOString())
        .run();
    } catch {
      // Cleanup is best effort; the signal TTL still bounds active enforcement.
    }
  }
  const cooldowns = observations
    .map((observation) => observation?.cooldownUntil)
    .filter((value): value is string => Boolean(value));
  if (!cooldowns.length) {
    return undefined;
  }

  const latestCooldown = cooldowns.reduce((latest, value) => (
    Date.parse(value) > Date.parse(latest) ? value : latest
  ));
  return abuseCooldownResponse(latestCooldown);
}

async function hashAccessCode(accessCode: string): Promise<string> {
  return hashText(normalizeAccessCode(accessCode));
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => Boolean(name && value))
      .map(([name, ...value]) => [name, decodeURIComponent(value.join("="))]),
  );
}

function requestSessionToken(request: Request): string {
  const authorization = request.headers.get("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return parseCookies(request.headers.get("Cookie")).hidn_session ?? "";
}

function sessionCookie(request: Request, token: string, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `hidn_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=${maxAgeSeconds}`;
}

function configuredInteger(value: string | undefined, fallback: number | null): number | null {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function configuredPaymentAmount(env: HidnWorkerEnv): number | null {
  return configuredInteger(env.ROOM_PAYMENT_ZATOSHIS, null);
}

function minimumPaymentConfirmations(env: HidnWorkerEnv): number {
  return configuredInteger(env.PAYMENT_MIN_CONFIRMATIONS, 3) ?? 3;
}

async function issueAccountSession(userId: string, request: Request, env: HidnWorkerEnv): Promise<{ token: string; cookie: string }> {
  const token = createRandomHex(32);
  const sessionHash = await hashText(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ACCOUNT_SESSION_TTL_MS);

  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_sessions
      (session_id, session_hash, user_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      createSessionId(),
      sessionHash,
      userId,
      createdAt.toISOString(),
      expiresAt.toISOString(),
      createdAt.toISOString(),
    )
    .run();

  return { token, cookie: sessionCookie(request, token, ACCOUNT_SESSION_TTL_MS / 1000) };
}

async function getAuthenticatedUser(request: Request, env: HidnWorkerEnv): Promise<AuthenticatedUser | null> {
  if (!env.ROOM_DB) {
    return null;
  }

  const token = requestSessionToken(request);
  if (!token) {
    return null;
  }

  const sessionHash = await hashText(token);
  const row = await env.ROOM_DB.prepare(
    `SELECT s.session_id, s.expires_at, u.user_id, u.username, u.access_level
     FROM hidn_sessions s
     JOIN hidn_users u ON u.user_id = s.user_id
     WHERE s.session_hash = ?
     LIMIT 1`,
  )
    .bind(sessionHash)
    .first<{
      session_id: string;
      expires_at: string;
      user_id: string;
      username: string;
      access_level: AccessLevel;
    }>();

  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    return null;
  }

  await env.ROOM_DB.prepare("UPDATE hidn_sessions SET last_seen_at = ? WHERE session_id = ?")
    .bind(new Date().toISOString(), row.session_id)
    .run();

  return {
    userId: row.user_id,
    username: row.username,
    accessLevel: row.access_level,
  };
}

async function listRecoveryQuestions(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before reading the recovery security check." }, 401);
  }

  return jsonResponse({ configured: true, questions: [...RECOVERY_CONFIRMATION_QUESTIONS] }, 200, "no-store");
}

async function saveRecoveryQuestions(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before setting the recovery security check." }, 401);
  }

  return jsonResponse({ configured: true, questions: [...RECOVERY_CONFIRMATION_QUESTIONS] }, 200, "no-store");
}

async function verifyRecoveryQuestions(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before verifying the recovery security check." }, 401);
  }

  const body = await requestBody(request);
  const username = normalizeUsername(typeof body.username === "string" ? body.username : "");
  const answers = Array.isArray(body.answers)
    ? body.answers.filter((answer): answer is string => typeof answer === "string").map(normalizeRecoveryAnswer)
    : [];
  if (!isValidUsername(username) || username !== normalizeUsername(user.username) || answers.length !== 2 || answers.some((answer) => answer !== RECOVERY_CONFIRMATION_ANSWER)) {
    return jsonResponse({ error: "The handle or recovery confirmations did not match." }, 401);
  }

  return jsonResponse({ verified: true }, 200, "no-store");
}

async function signupAccount(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const username = normalizeUsername(typeof body.username === "string" ? body.username : "");
  if (!isValidUsername(username)) {
    return jsonResponse(
      { error: "Handle must start with HIDN- and contain letters or numbers after the prefix, for example HIDN-NOIR42." },
      400,
    );
  }

  const recoveryCode = createAccessCode();
  const now = new Date().toISOString();

  try {
    const userId = createUserId();
    await env.ROOM_DB!.prepare(
      `INSERT INTO hidn_users
        (user_id, username, username_normalized, recovery_code_hash, access_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userId, username, username, await hashAccessCode(recoveryCode), "read_only", now)
      .run();

    const session = await issueAccountSession(userId, request, env);
    await recordActivityEvent(env, "JUST OPENED", "A ROOM KEY");
    return jsonResponse(
      {
        userId,
        username,
        recoveryCode,
        accessLevel: "read_only" satisfies AccessLevel,
        paymentStatus: "not_started",
        authMethod: "recovery_code" satisfies AuthMethod,
      },
      201,
      "no-store",
      { "Set-Cookie": session.cookie },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("constraint")) {
      return jsonResponse({ error: "That handle is already in use. Choose another HIDN handle." }, 409);
    }

    throw error;
  }
}

async function loginAccount(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const username = normalizeUsername(typeof body.username === "string" ? body.username : "");
  const recoveryCode = typeof body.recoveryCode === "string" ? body.recoveryCode.trim() : "";
  if (!isValidUsername(username) || !recoveryCode) {
    return jsonResponse({ error: "A HIDN handle and recovery code are required." }, 400);
  }

  const recoveryCodeHash = await hashAccessCode(recoveryCode);
  const user = await env.ROOM_DB!.prepare(
    `SELECT user_id, username, access_level
     FROM hidn_users
     WHERE username_normalized = ? AND recovery_code_hash = ?
     LIMIT 1`,
  )
    .bind(username, recoveryCodeHash)
    .first<{ user_id: string; username: string; access_level: AccessLevel }>();
  if (!user) {
    return jsonResponse({ error: "Username or recovery code is invalid." }, 401);
  }

  const now = new Date().toISOString();
  await env.ROOM_DB!.prepare("UPDATE hidn_users SET last_login_at = ? WHERE user_id = ?")
    .bind(now, user.user_id)
    .run();
  const session = await issueAccountSession(user.user_id, request, env);
  await recordActivityEvent(env, "JUST RETURNED", "TO THE ROOM");

  return jsonResponse(
    {
      userId: user.user_id,
      username: user.username,
      accessLevel: user.access_level,
      paymentStatus: user.access_level === "full" ? "confirmed" : "pending",
      authMethod: "recovery_code" satisfies AuthMethod,
    },
    200,
    "no-store",
    { "Set-Cookie": session.cookie },
  );
}

async function getAccountSession(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "No active HIDN account session." }, 401);
  }

  return jsonResponse({ ...user, paymentStatus: user.accessLevel === "full" ? "confirmed" : "pending" });
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
  };
}

function serializeAccountHistoryPost(row: AccountHistoryPostRow): Record<string, unknown> {
  return {
    ...serializeRoomPost(row),
    status: row.moderation_state,
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

function serializeRoomNotification(row: RoomNotificationRow): Record<string, unknown> {
  return {
    id: row.notification_id,
    type: row.event_type,
    actorAlias: row.actor_alias ?? "ANON-SIGNAL",
    targetType: row.target_type,
    targetId: row.target_id,
    ...(row.thread_id ? { threadId: row.thread_id } : {}),
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

async function createAccountNotification(
  env: HidnWorkerEnv,
  recipientUserId: string | null | undefined,
  eventType: NotificationEventType,
  targetType: "thread" | "reply",
  targetId: string,
): Promise<void> {
  if (!env.ROOM_DB || !recipientUserId) {
    return;
  }

  try {
    await env.ROOM_DB.prepare(
      `INSERT INTO hidn_notifications
        (notification_id, recipient_user_id, event_type, actor_alias, target_type, target_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(createNotificationId(), recipientUserId, eventType, createNotificationAlias(), targetType, targetId, new Date().toISOString())
      .run();
  } catch {
    // A notification must never turn a successful post, reply, or reaction into a retry.
  }
}

async function hydrateNotificationAliases(
  env: HidnWorkerEnv,
  notifications: RoomNotificationRow[],
): Promise<RoomNotificationRow[]> {
  const missingAliases = notifications.filter((notification) => !notification.actor_alias);
  if (!missingAliases.length) {
    return notifications;
  }

  const aliases = new Map<string, string>();
  await Promise.all(
    missingAliases.map(async (notification) => {
      const alias = createNotificationAlias();
      aliases.set(notification.notification_id, alias);
      await env.ROOM_DB!
        .prepare(
          `UPDATE hidn_notifications
           SET actor_alias = COALESCE(actor_alias, ?)
           WHERE notification_id = ?`,
        )
        .bind(alias, notification.notification_id)
        .run();
    }),
  );

  return notifications.map((notification) => ({
    ...notification,
    actor_alias: notification.actor_alias ?? aliases.get(notification.notification_id) ?? "ANON-SIGNAL",
  }));
}

async function listAccountNotifications(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before reading private notifications." }, 401);
  }

  const notificationCutoff = new Date(Date.now() - NOTIFICATION_RETENTION_MS).toISOString();
  await env.ROOM_DB!.prepare(
    `DELETE FROM hidn_notifications
     WHERE recipient_user_id = ? AND created_at < ?`,
  )
    .bind(user.userId, notificationCutoff)
    .run();

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "30");
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 30;
  const [notifications, unread] = await Promise.all([
    env.ROOM_DB!.prepare(
      `SELECT notification_id, event_type, actor_alias, target_type, target_id,
              CASE
                WHEN target_type = 'thread' THEN target_id
                ELSE (
                  SELECT reply.thread_id
                  FROM hidn_replies reply
                  WHERE reply.reply_id = hidn_notifications.target_id
                  LIMIT 1
                )
              END AS thread_id,
              created_at, read_at
       FROM hidn_notifications
       WHERE recipient_user_id = ? AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT ${limit}`,
    )
      .bind(user.userId, notificationCutoff)
      .all<RoomNotificationRow>(),
    env.ROOM_DB!.prepare(
      `SELECT COUNT(*) AS count
       FROM hidn_notifications
       WHERE recipient_user_id = ? AND created_at >= ? AND read_at IS NULL`,
    )
      .bind(user.userId, notificationCutoff)
      .first<{ count: number }>(),
  ]);

  const hydratedNotifications = await hydrateNotificationAliases(env, notifications.results);

  return jsonResponse(
    {
      notifications: hydratedNotifications.map(serializeRoomNotification),
      unreadCount: Number(unread?.count ?? 0),
    },
    200,
    "no-store",
  );
}

async function markAccountNotificationsRead(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before updating private notifications." }, 401);
  }

  const body = await requestBody(request);
  const notificationIds = Array.isArray(body.notificationIds)
    ? body.notificationIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 50)
    : [];
  const readAt = new Date().toISOString();
  if (notificationIds.length) {
    const placeholders = notificationIds.map(() => "?").join(", ");
    await env.ROOM_DB!.prepare(
      `UPDATE hidn_notifications
       SET read_at = ?
       WHERE recipient_user_id = ? AND read_at IS NULL AND notification_id IN (${placeholders})`,
    )
      .bind(readAt, user.userId, ...notificationIds)
      .run();
  } else {
    await env.ROOM_DB!.prepare(
      `UPDATE hidn_notifications
       SET read_at = ?
       WHERE recipient_user_id = ? AND read_at IS NULL`,
    )
      .bind(readAt, user.userId)
      .run();
  }

  return jsonResponse({ status: "read" });
}

async function toggleRoomReaction(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before reacting in the room." }, 401);
  }

  const body = await requestBody(request);
  const targetType = body.targetType === "reply" ? "reply" : body.targetType === "thread" ? "thread" : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim().toUpperCase() : "";
  if (!targetType || !isAllowedRoomReactionTarget(targetType, targetId)) {
    return jsonResponse({ error: "Choose a valid room signal." }, 400);
  }

  const target = targetType === "thread" && isAmbientRoomThreadId(targetId)
    ? { target_id: targetId, author_user_id: null }
    : targetType === "thread"
      ? await env.ROOM_DB!.prepare(
        `SELECT thread_id AS target_id, author_user_id
         FROM hidn_threads
         WHERE thread_id = ? AND room_id = ? AND moderation_state = 'visible'
         LIMIT 1`,
      )
        .bind(targetId, MAIN_ROOM_ID)
        .first<{ target_id: string; author_user_id: string | null }>()
      : await env.ROOM_DB!.prepare(
        `SELECT r.reply_id AS target_id, r.author_user_id
         FROM hidn_replies r
         JOIN hidn_threads t ON t.thread_id = r.thread_id
         WHERE r.reply_id = ? AND t.room_id = ? AND r.moderation_state = 'visible'
         LIMIT 1`,
      )
        .bind(targetId, MAIN_ROOM_ID)
        .first<{ target_id: string; author_user_id: string | null }>();
  if (!target) {
    return jsonResponse({ error: "That signal is no longer available." }, 404);
  }

  const existing = await env.ROOM_DB!.prepare(
    `SELECT reaction_id
     FROM hidn_reactions
     WHERE target_type = ? AND target_id = ? AND reaction_type = 'like' AND actor_user_id = ?
     LIMIT 1`,
  )
    .bind(targetType, targetId, user.userId)
    .first<{ reaction_id: string }>();
  const liked = !existing;
  if (existing) {
    await env.ROOM_DB!.prepare("DELETE FROM hidn_reactions WHERE reaction_id = ? AND actor_user_id = ?")
      .bind(existing.reaction_id, user.userId)
      .run();
  } else {
    await env.ROOM_DB!.prepare(
      `INSERT INTO hidn_reactions
        (reaction_id, target_type, target_id, reaction_type, actor_user_id, created_at)
       VALUES (?, ?, ?, 'like', ?, ?)`,
    )
      .bind(`REA-${createRandomHex(12).toUpperCase()}`, targetType, targetId, user.userId, new Date().toISOString())
      .run();
  }

  const count = await env.ROOM_DB!.prepare(
    `SELECT COUNT(*) AS count
     FROM hidn_reactions
     WHERE target_type = ? AND target_id = ? AND reaction_type = 'like'`,
  )
    .bind(targetType, targetId)
    .first<{ count: number }>();
  if (liked && target.author_user_id && target.author_user_id !== user.userId) {
    await createAccountNotification(env, target.author_user_id, "reaction", targetType, targetId);
  }

  return jsonResponse({ targetType, targetId, liked, reactions: Number(count?.count ?? 0) });
}

async function listRoomReactionState(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before reading room reactions." }, 401);
  }

  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType") === "reply" ? "reply" : "thread";
  const targetIds = [...new Set(
    (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => value && isAllowedRoomReactionTarget(targetType, value))
      .slice(0, 100),
  )];
  if (!targetIds.length) {
    return jsonResponse({ targetType, reactions: [] }, 200, "no-store");
  }

  const placeholders = targetIds.map(() => "?").join(", ");
  const result = await env.ROOM_DB!.prepare(
    `SELECT target_id,
            COUNT(*) AS reactions,
            EXISTS (
              SELECT 1
              FROM hidn_reactions current_reaction
              WHERE current_reaction.target_type = ?
                AND current_reaction.target_id = hidn_reactions.target_id
                AND current_reaction.reaction_type = 'like'
                AND current_reaction.actor_user_id = ?
            ) AS liked_by_current_user
     FROM hidn_reactions
     WHERE target_type = ?
       AND reaction_type = 'like'
       AND target_id IN (${placeholders})
     GROUP BY target_id`,
  )
    .bind(targetType, user.userId, targetType, ...targetIds)
    .all<{ target_id: string; reactions: number; liked_by_current_user: number }>();

  return jsonResponse({
    targetType,
    reactions: result.results.map((row) => ({
      targetId: row.target_id,
      reactions: Number(row.reactions ?? 0),
      liked: row.liked_by_current_user === 1,
    })),
  }, 200, "no-store");
}

async function listAccountHistory(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before reading private history." }, 401);
  }

  const [posts, comments, stats] = await Promise.all([
    env.ROOM_DB!.prepare(
      `SELECT thread_id, content, category, channel, created_at, moderation_state,
              (SELECT COUNT(*)
               FROM hidn_replies reply_count
               WHERE reply_count.thread_id = hidn_threads.thread_id
                 AND reply_count.moderation_state = 'visible') AS reply_count
       FROM hidn_threads
       WHERE room_id = ? AND author_user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
      .bind(MAIN_ROOM_ID, user.userId)
      .all<AccountHistoryPostRow>(),
    env.ROOM_DB!.prepare(
      `SELECT r.reply_id, r.thread_id, r.content, t.channel,
              r.moderation_state, r.created_at
       FROM hidn_replies r
       JOIN hidn_threads t ON t.thread_id = r.thread_id
       WHERE t.room_id = ? AND r.author_user_id = ?
       ORDER BY r.created_at DESC
       LIMIT 100`,
    )
      .bind(MAIN_ROOM_ID, user.userId)
      .all<RoomReplyRow>(),
    env.ROOM_DB!.prepare(
      `SELECT
         (SELECT COUNT(*)
          FROM hidn_threads
          WHERE room_id = ? AND author_user_id = ?) AS post_count,
         (SELECT COUNT(*)
          FROM hidn_replies r
          JOIN hidn_threads t ON t.thread_id = r.thread_id
          WHERE t.room_id = ? AND r.author_user_id = ?) AS comment_count,
         (SELECT COUNT(*)
          FROM hidn_reactions reaction
          WHERE reaction.reaction_type = 'like'
            AND (
              EXISTS (
                SELECT 1
                FROM hidn_threads t
                WHERE reaction.target_type = 'thread'
                  AND t.thread_id = reaction.target_id
                  AND t.room_id = ?
                  AND t.author_user_id = ?
              )
              OR EXISTS (
                SELECT 1
                FROM hidn_replies r
                JOIN hidn_threads t ON t.thread_id = r.thread_id
                WHERE reaction.target_type = 'reply'
                  AND r.reply_id = reaction.target_id
                  AND t.room_id = ?
                  AND r.author_user_id = ?
              )
            )) AS like_count`,
    )
      .bind(MAIN_ROOM_ID, user.userId, MAIN_ROOM_ID, user.userId, MAIN_ROOM_ID, user.userId, MAIN_ROOM_ID, user.userId)
      .first<AccountHistoryStatsRow>(),
  ]);

  return jsonResponse({
    posts: posts.results.map(serializeAccountHistoryPost),
    comments: comments.results.map(serializeRoomComment),
    stats: {
      posts: Number(stats?.post_count ?? 0),
      comments: Number(stats?.comment_count ?? 0),
      likes: Number(stats?.like_count ?? 0),
    },
  });
}

async function createRoomReply(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before replying in the room." }, 401);
  }

  const body = await requestBody(request);
  const threadId = typeof body.threadId === "string" ? body.threadId.trim().toUpperCase() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim().toUpperCase() : "";
  if (!/^THR-[A-F0-9]{24}$/.test(threadId)) {
    return jsonResponse({ error: "Choose a valid private-room thread." }, 400);
  }
  if (!content) {
    return jsonResponse({ error: "Write something before replying." }, 400);
  }
  if (submissionId && !/^HIDN-REPLY-[A-F0-9-]{16,80}$/.test(submissionId)) {
    return jsonResponse({ error: "This reply could not be uniquely identified. Try again." }, 400);
  }
  const maxLength = roomReplyMaxLength(user);
  if (content.length > maxLength) {
    return jsonResponse({ error: `Replies must be ${maxLength} characters or fewer.` }, 400);
  }

  const thread = await env.ROOM_DB!.prepare(
    `SELECT thread_id, channel, author_user_id
     FROM hidn_threads
     WHERE thread_id = ? AND room_id = ? AND moderation_state = 'visible'
     LIMIT 1`,
  )
    .bind(threadId, MAIN_ROOM_ID)
    .first<{ thread_id: string; channel: RoomChannel; author_user_id: string | null }>();
  if (!thread) {
    return jsonResponse({ error: "That thread is no longer available for replies." }, 404);
  }

  if (submissionId) {
    const existingSubmission = await env.ROOM_DB!.prepare(
      `SELECT r.reply_id, r.thread_id, r.content, t.channel,
              r.moderation_state, r.created_at
       FROM hidn_replies r
       JOIN hidn_threads t ON t.thread_id = r.thread_id
       WHERE r.author_user_id = ? AND r.submission_id = ?
       LIMIT 1`,
    )
      .bind(user.userId, submissionId)
      .first<RoomReplyRow>();
    if (existingSubmission) {
      return jsonResponse({ comment: serializeRoomComment(existingSubmission), status: "already_saved" }, 200, "no-store");
    }
  }

  const existingContent = await env.ROOM_DB!.prepare(
    `SELECT r.reply_id, r.thread_id, r.content, t.channel,
            r.moderation_state, r.created_at
     FROM hidn_replies r
     JOIN hidn_threads t ON t.thread_id = r.thread_id
     WHERE r.thread_id = ?
       AND r.author_user_id = ?
       AND r.content = ?
       AND r.moderation_state = 'visible'
     ORDER BY r.created_at DESC
     LIMIT 1`,
  )
    .bind(thread.thread_id, user.userId, content)
    .first<RoomReplyRow>();
  if (existingContent) {
    return jsonResponse({ error: "You've said that already in this thread. The reply was not sent twice." }, 409);
  }

  const abuseResponse = await assessRoomAbuse(request, env, user, content);
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
    submission_id: submissionId || null,
  };
  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_replies
      (reply_id, thread_id, content, moderation_state, created_at, hidden_at, author_user_id, submission_id)
     VALUES (?, ?, ?, 'visible', ?, NULL, ?, ?)`,
  )
    .bind(reply.reply_id, reply.thread_id, reply.content, reply.created_at, user.userId, reply.submission_id)
    .run();

  if (thread.author_user_id && thread.author_user_id !== user.userId) {
    await createAccountNotification(env, thread.author_user_id, "reply", "thread", thread.thread_id);
  }

  await recordActivityEvent(env, "JUST REPLIED", "A THREAD");

  return jsonResponse({ comment: serializeRoomComment(reply), status: "created" }, 201);
}

async function listRoomPosts(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before reading room posts." }, 401);
  }

  const channel = new URL(request.url).searchParams.get("channel")?.trim().toLowerCase() ?? "general";
  if (!isRoomChannel(channel)) {
    return jsonResponse({ error: "Choose a valid room channel." }, 400);
  }

  const result = await env.ROOM_DB!.prepare(
    `SELECT t.thread_id, t.content, t.category, t.channel, t.created_at,
            COUNT(r.reaction_id) AS reactions,
            (SELECT COUNT(*)
             FROM hidn_replies reply_count
             WHERE reply_count.thread_id = t.thread_id
               AND reply_count.moderation_state = 'visible') AS reply_count,
            EXISTS (
              SELECT 1
              FROM hidn_reactions current_reaction
              WHERE current_reaction.target_type = 'thread'
                AND current_reaction.target_id = t.thread_id
                AND current_reaction.reaction_type = 'like'
                AND current_reaction.actor_user_id = ?
            ) AS liked_by_current_user
     FROM hidn_threads t
     LEFT JOIN hidn_reactions r
       ON r.target_type = 'thread'
      AND r.target_id = t.thread_id
      AND r.reaction_type = 'like'
     WHERE t.room_id = ? AND t.channel = ? AND t.moderation_state = 'visible'
     GROUP BY t.thread_id, t.content, t.category, t.channel, t.created_at
     ORDER BY t.created_at DESC
     LIMIT 100`,
  )
    .bind(user.userId, MAIN_ROOM_ID, channel)
    .all<RoomPostRow>();

  return jsonResponse({ posts: result.results.map(serializeRoomPost), channel });
}

async function listRoomThread(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before reading a private thread." }, 401);
  }

  const threadId = new URL(request.url).searchParams.get("threadId")?.trim().toUpperCase() ?? "";
  if (!/^THR-[A-F0-9]{24}$/.test(threadId)) {
    return jsonResponse({ error: "Choose a valid private-room thread." }, 400);
  }

  const post = await env.ROOM_DB!.prepare(
    `SELECT t.thread_id, t.content, t.category, t.channel, t.created_at,
            COUNT(r.reaction_id) AS reactions,
            (SELECT COUNT(*)
             FROM hidn_replies reply_count
             WHERE reply_count.thread_id = t.thread_id
               AND reply_count.moderation_state = 'visible') AS reply_count,
            EXISTS (
              SELECT 1
              FROM hidn_reactions current_reaction
              WHERE current_reaction.target_type = 'thread'
                AND current_reaction.target_id = t.thread_id
                AND current_reaction.reaction_type = 'like'
                AND current_reaction.actor_user_id = ?
            ) AS liked_by_current_user
     FROM hidn_threads t
     LEFT JOIN hidn_reactions r
       ON r.target_type = 'thread'
      AND r.target_id = t.thread_id
      AND r.reaction_type = 'like'
     WHERE t.thread_id = ? AND t.room_id = ? AND t.moderation_state = 'visible'
     GROUP BY t.thread_id, t.content, t.category, t.channel, t.created_at
     LIMIT 1`,
  )
    .bind(user.userId, threadId, MAIN_ROOM_ID)
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

  return jsonResponse({
    post: serializeRoomPost(post),
    replies: replies.results.map(serializeRoomComment),
  }, 200, "no-store");
}

async function createRoomPost(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before creating a post." }, 401);
  }

  const body = await requestBody(request);
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const channel = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "general";
  const category = typeof body.category === "string" ? body.category.trim().toUpperCase() : "IDENTITY";
  if (!content) {
    return jsonResponse({ error: "Write something before creating the post." }, 400);
  }
  const maxLength = roomPostMaxLength(user);
  if (content.length > maxLength) {
    return jsonResponse({ error: `Posts must be ${maxLength} characters or fewer.` }, 400);
  }
  if (!isRoomChannel(channel)) {
    return jsonResponse({ error: "Choose a valid room channel." }, 400);
  }
  if (!ROOM_POST_CATEGORIES.has(category)) {
    return jsonResponse({ error: "Choose a valid post category." }, 400);
  }

  const abuseResponse = await assessRoomAbuse(request, env, user, content);
  if (abuseResponse) {
    return abuseResponse;
  }

  const post: RoomPostRow = {
    thread_id: createThreadId(),
    content,
    category,
    channel,
    created_at: new Date().toISOString(),
  };
  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_threads
      (thread_id, room_id, content, category, moderation_state, created_at,
       updated_at, hidden_at, channel, author_user_id)
     VALUES (?, ?, ?, ?, 'visible', ?, ?, NULL, ?, ?)`,
  )
    .bind(
      post.thread_id,
      MAIN_ROOM_ID,
      post.content,
      post.category,
      post.created_at,
      post.created_at,
      post.channel,
      user.userId,
    )
    .run();

  await recordActivityEvent(env, "JUST POSTED", "A THOUGHT");

  return jsonResponse({ post: serializeRoomPost(post), status: "created" }, 201);
}

async function signupZkAccount(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const username = normalizeUsername(typeof body.username === "string" ? body.username : "");
  const identityCommitment = typeof body.identityCommitment === "string"
    ? body.identityCommitment.trim().toLowerCase()
    : "";
  if (!isValidUsername(username)) {
    return jsonResponse(
      { error: "Handle must start with HIDN- and contain letters or numbers after the prefix, for example HIDN-NOIR42." },
      400,
    );
  }
  if (!isValidZkPublicKey(identityCommitment)) {
    return jsonResponse({ error: "The browser credential commitment is invalid." }, 400);
  }

  const now = new Date().toISOString();
  try {
    const userId = createUserId();
    await env.ROOM_DB!.prepare(
      `INSERT INTO hidn_users
        (user_id, username, username_normalized, recovery_code_hash,
         auth_method, identity_commitment, access_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        userId,
        username,
        username,
        await hashAccessCode(createAccessCode()),
        "schnorr",
        identityCommitment,
        "read_only",
        now,
      )
      .run();

    const session = await issueAccountSession(userId, request, env);
    await recordActivityEvent(env, "JUST OPENED", "A ROOM KEY");
    return jsonResponse(
      {
        userId,
        username,
        accessLevel: "read_only" satisfies AccessLevel,
        paymentStatus: "not_started",
        authMethod: "schnorr" satisfies AuthMethod,
      },
      201,
      "no-store",
      { "Set-Cookie": session.cookie },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("constraint")) {
      return jsonResponse({ error: "That handle or browser credential is already in use." }, 409);
    }

    throw error;
  }
}

async function createZkChallenge(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const username = normalizeUsername(typeof body.username === "string" ? body.username : "");
  if (!isValidUsername(username)) {
    return jsonResponse({ error: "A valid HIDN handle is required." }, 400);
  }

  const user = await env.ROOM_DB!.prepare(
    `SELECT user_id, auth_method, identity_commitment
     FROM hidn_users
     WHERE username_normalized = ?
     LIMIT 1`,
  )
    .bind(username)
    .first<{ user_id: string; auth_method: AuthMethod; identity_commitment: string | null }>();
  if (!user || user.auth_method !== "schnorr" || !user.identity_commitment) {
    return jsonResponse({ error: "That HIDN account does not use the browser proof flow." }, 401);
  }

  const challengeId = createZkChallengeId();
  const challenge = createRandomHex(32);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ZK_CHALLENGE_TTL_MS);
  await env.ROOM_DB!.prepare(
    `INSERT INTO hidn_auth_challenges
      (challenge_id, user_id, challenge_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      challengeId,
      user.user_id,
      await hashText(challenge),
      createdAt.toISOString(),
      expiresAt.toISOString(),
    )
    .run();

  return jsonResponse({
    protocol: "hidn-schnorr-v1",
    challengeId,
    challenge,
    expiresAt: expiresAt.toISOString(),
  });
}

async function verifyZkLogin(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const username = normalizeUsername(typeof body.username === "string" ? body.username : "");
  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const challenge = typeof body.challenge === "string" ? body.challenge.trim() : "";
  const proof = typeof body.proof === "string" ? body.proof.trim().toLowerCase() : "";
  if (!isValidUsername(username) || !challengeId || !challenge || !proof) {
    return jsonResponse({ error: "A HIDN handle and proof challenge are required." }, 400);
  }

  const row = await env.ROOM_DB!.prepare(
    `SELECT c.challenge_id, c.challenge_hash, c.expires_at, c.consumed_at,
            u.user_id, u.username, u.access_level, u.auth_method, u.identity_commitment
     FROM hidn_auth_challenges c
     JOIN hidn_users u ON u.user_id = c.user_id
     WHERE c.challenge_id = ? AND u.username_normalized = ?
     LIMIT 1`,
  )
    .bind(challengeId, username)
    .first<{
      challenge_id: string;
      challenge_hash: string;
      expires_at: string;
      consumed_at: string | null;
      user_id: string;
      username: string;
      access_level: AccessLevel;
      auth_method: AuthMethod;
      identity_commitment: string | null;
    }>();

  if (
    !row ||
    row.auth_method !== "schnorr" ||
    !row.identity_commitment ||
    row.consumed_at ||
    Date.parse(row.expires_at) <= Date.now() ||
    (await hashText(challenge)) !== row.challenge_hash
  ) {
    return jsonResponse({ error: "The proof challenge is invalid or expired." }, 401);
  }

  const message = buildZkChallengeMessage(username, challengeId, challenge);
  if (!verifyZkProof(row.identity_commitment, proof, message)) {
    return jsonResponse({ error: "The browser proof could not be verified." }, 401);
  }

  const consumedAt = new Date().toISOString();
  const consumeResult = await env.ROOM_DB!.prepare(
    `UPDATE hidn_auth_challenges
     SET consumed_at = ?
     WHERE challenge_id = ? AND consumed_at IS NULL`,
  )
    .bind(consumedAt, challengeId)
    .run() as { meta?: { changes?: number } };
  if (consumeResult.meta?.changes === 0) {
    return jsonResponse({ error: "The proof challenge has already been used." }, 401);
  }

  await env.ROOM_DB!.prepare("UPDATE hidn_users SET last_login_at = ? WHERE user_id = ?")
    .bind(consumedAt, row.user_id)
    .run();
  const session = await issueAccountSession(row.user_id, request, env);
  await recordActivityEvent(env, "JUST RETURNED", "TO THE ROOM");

  return jsonResponse(
    {
      userId: row.user_id,
      username: row.username,
      accessLevel: row.access_level,
      paymentStatus: row.access_level === "full" ? "confirmed" : "pending",
      authMethod: "schnorr" satisfies AuthMethod,
    },
    200,
    "no-store",
    { "Set-Cookie": session.cookie },
  );
}

async function logoutAccount(request: Request, env: HidnWorkerEnv): Promise<Response> {
  if (env.ROOM_DB) {
    const token = requestSessionToken(request);
    if (token) {
      await env.ROOM_DB.prepare("DELETE FROM hidn_sessions WHERE session_hash = ?")
        .bind(await hashText(token))
        .run();
    }
  }

  return jsonResponse(
    { ok: true },
    200,
    "no-store",
    { "Set-Cookie": sessionCookie(request, "", 0) },
  );
}

async function submitReport(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before submitting a report." }, 401);
  }

  const body = await requestBody(request);
  const targetType = typeof body.targetType === "string" ? body.targetType.trim().toLowerCase() : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const targetExcerpt = typeof body.targetExcerpt === "string" ? body.targetExcerpt.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().toLowerCase() : "";
  const details = typeof body.details === "string" ? body.details.trim() : "";

  if (!isReportTargetType(targetType)) {
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

  const now = new Date();
  const recentWindow = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const recentCount = await env.ROOM_DB!.prepare(
    "SELECT COUNT(*) AS count FROM hidn_reports WHERE reporter_user_id = ? AND created_at >= ?",
  )
    .bind(user.userId, recentWindow)
    .first<{ count: number }>();
  if (Number(recentCount?.count ?? 0) >= REPORT_MAX_PER_HOUR) {
    return jsonResponse({ error: "Report limit reached. Try again later." }, 429);
  }

  const reportId = createReportId();
  try {
    await env.ROOM_DB!.prepare(
      `INSERT INTO hidn_reports
        (report_id, target_type, target_id, target_excerpt, reason, details,
         reporter_user_id, status, created_at, reviewer_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        reportId,
        targetType,
        targetId,
        targetExcerpt,
        reason,
        details,
        user.userId,
        "open",
        now.toISOString(),
        "",
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("constraint")) {
      return jsonResponse({ error: "You already have an open report for this surface." }, 409);
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

  if (await hasValidAdminToken(request, env)) {
    const actor: AdminActor = {
      adminId: "legacy-token",
      email: null,
      displayName: "Legacy report token",
      role: "super_admin",
      source: "legacy_token",
    };
    return roles.includes(actor.role) ? { actor } : jsonResponse({ error: "Administrator role required." }, 403);
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

async function listModerationVisibility(env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
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

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeEncryptionKey(value: string): Uint8Array {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  return decodeBase64(trimmed);
}

async function encryptRefundAddress(address: string, env: HidnWorkerEnv): Promise<string> {
  if (!env.REFUND_ENCRYPTION_KEY) {
    throw new Error("REFUND_ENCRYPTION_KEY is not configured.");
  }

  const keyBytes = decodeEncryptionKey(env.REFUND_ENCRYPTION_KEY);
  if (keyBytes.byteLength !== 32) {
    throw new Error("REFUND_ENCRYPTION_KEY must decode to 32 bytes.");
  }

  const keyBuffer = new ArrayBuffer(32);
  new Uint8Array(keyBuffer).set(keyBytes);
  const key = await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(address),
  );

  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(ciphertext)))}`;
}

async function createPaymentIntent(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before creating a payment intent." }, 401);
  }

  const expectedAmountZat = configuredPaymentAmount(env);
  const receivingAddress = env.ROOM_SHIELDED_ADDRESS?.trim() ?? "";
  if (!expectedAmountZat || !receivingAddress) {
    return jsonResponse(
      {
        error: "Live payment intake is not configured yet. Set ROOM_PAYMENT_ZATOSHIS and ROOM_SHIELDED_ADDRESS on the Worker.",
      },
      503,
    );
  }

  const body = await requestBody(request);
  const refundAddress = typeof body.refundAddress === "string" ? body.refundAddress.trim() : "";
  if (refundAddress.length > 240) {
    return jsonResponse({ error: "Refund address is too long." }, 400);
  }

  let refundAddressCiphertext: string | null = null;
  let refundAddressHash: string | null = null;
  if (refundAddress) {
    try {
      refundAddressCiphertext = await encryptRefundAddress(refundAddress, env);
      refundAddressHash = await hashText(refundAddress);
    } catch {
      return jsonResponse(
        { error: "Refund addresses are temporarily unavailable because encryption is not configured." },
        503,
      );
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_INTENT_TTL_MS);
  const paymentIntentId = createPaymentIntentId();
  const paymentReference = createPaymentReference();

  await env.ROOM_DB!.prepare(
    `INSERT INTO payment_intents
      (payment_intent_id, user_id, payment_reference, expected_amount_zat,
       receiving_address, refund_address_ciphertext, refund_address_hash,
       status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      paymentIntentId,
      user.userId,
      paymentReference,
      expectedAmountZat,
      receivingAddress,
      refundAddressCiphertext,
      refundAddressHash,
      "pending",
      now.toISOString(),
      expiresAt.toISOString(),
    )
    .run();

  return jsonResponse(
    {
      paymentIntentId,
      paymentReference,
      expectedAmountZat,
      receivingAddress,
      minimumConfirmations: minimumPaymentConfirmations(env),
      refundAddressStored: Boolean(refundAddressCiphertext),
      status: "pending" satisfies PaymentStatus,
      expiresAt: expiresAt.toISOString(),
    },
    201,
  );
}

function serializePaymentIntent(row: PaymentIntentRow, env: HidnWorkerEnv): Record<string, unknown> {
  return {
    paymentIntentId: row.payment_intent_id,
    paymentReference: row.payment_reference,
    expectedAmountZat: row.expected_amount_zat,
    receivingAddress: row.receiving_address,
    refundAddressStored: Boolean(row.refund_address_hash),
    status: row.status,
    transactionId: row.transaction_id,
    outputIndex: row.output_index,
    observedAmountZat: row.observed_amount_zat,
    confirmations: row.confirmations,
    minimumConfirmations: minimumPaymentConfirmations(env),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
  };
}

async function getPaymentIntent(paymentIntentId: string, request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return jsonResponse({ error: "Log in before checking a payment intent." }, 401);
  }

  const row = await env.ROOM_DB!.prepare(
    "SELECT * FROM payment_intents WHERE payment_intent_id = ? AND user_id = ? LIMIT 1",
  )
    .bind(paymentIntentId, user.userId)
    .first<PaymentIntentRow>();
  if (!row) {
    return jsonResponse({ error: "Payment intent not found." }, 404);
  }

  if (row.status === "pending" && Date.parse(row.expires_at) <= Date.now()) {
    await env.ROOM_DB!.prepare("UPDATE payment_intents SET status = ? WHERE payment_intent_id = ? AND status = ?")
      .bind("expired", paymentIntentId, "pending")
      .run();
    row.status = "expired";
  }

  return jsonResponse(serializePaymentIntent(row, env));
}

async function verifyWatcherSignature(request: Request, rawBody: string, env: HidnWorkerEnv): Promise<boolean> {
  const secret = env.PAYMENT_WATCHER_SECRET?.trim();
  const timestamp = request.headers.get("X-HIDN-WATCHER-TIMESTAMP") ?? "";
  const signature = request.headers.get("X-HIDN-WATCHER-SIGNATURE") ?? "";
  if (!secret || !timestamp || !signature) {
    return false;
  }

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > WATCHER_CLOCK_SKEW_MS) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const expectedPayload = new TextEncoder().encode(`${timestamp}.${rawBody}`);
  const suppliedSignature = signature.replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/i.test(suppliedSignature)) {
    return false;
  }

  const signatureBytes = new Uint8Array(suppliedSignature.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  return crypto.subtle.verify("HMAC", key, signatureBytes, expectedPayload);
}

function watcherEventType(status: PaymentStatus): "detected" | "confirmed" | "reorged" {
  if (status === "confirmed") {
    return "confirmed";
  }
  if (status === "reorged") {
    return "reorged";
  }
  return "detected";
}

async function refreshUserAccess(userId: string, env: HidnWorkerEnv): Promise<void> {
  const count = await env.ROOM_DB!.prepare(
    "SELECT COUNT(*) AS count FROM payment_intents WHERE user_id = ? AND status = ?",
  )
    .bind(userId, "confirmed")
    .first<{ count: number }>();
  const hasConfirmedPayment = Number(count?.count ?? 0) > 0;
  await env.ROOM_DB!.prepare(
    "UPDATE hidn_users SET access_level = ?, verified_at = CASE WHEN ? = ? THEN COALESCE(verified_at, ?) ELSE NULL END WHERE user_id = ?",
  )
    .bind(
      hasConfirmedPayment ? "full" : "read_only",
      hasConfirmedPayment ? "full" : "read_only",
      "full",
      new Date().toISOString(),
      userId,
    )
    .run();
}

async function ingestWatcherPayment(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  if (!env.PAYMENT_WATCHER_SECRET) {
    return jsonResponse({ error: "Payment watcher intake is not configured." }, 503);
  }

  const rawBody = await request.text();
  if (!(await verifyWatcherSignature(request, rawBody, env))) {
    return jsonResponse({ error: "Watcher signature is invalid or expired." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return jsonResponse({ error: "Watcher event body is invalid JSON." }, 400);
  }

  const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
  const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  const outputIndex = typeof body.outputIndex === "number" ? body.outputIndex : Number(body.outputIndex);
  const amountZat = typeof body.amountZat === "number" ? body.amountZat : Number(body.amountZat);
  const confirmations = typeof body.confirmations === "number" ? body.confirmations : Number(body.confirmations);
  const network = typeof body.network === "string" ? body.network.trim().toLowerCase() : "mainnet";

  if (
    !transactionId ||
    !Number.isSafeInteger(outputIndex) ||
    outputIndex < 0 ||
    !Number.isSafeInteger(amountZat) ||
    amountZat <= 0 ||
    !Number.isSafeInteger(confirmations) ||
    confirmations < 0 ||
    network !== "mainnet"
  ) {
    return jsonResponse({ error: "Watcher event fields are invalid." }, 400);
  }

  const intent = await env.ROOM_DB!.prepare(
    "SELECT * FROM payment_intents WHERE payment_reference = ? LIMIT 1",
  )
    .bind(paymentReference)
    .first<PaymentIntentRow>();
  const now = new Date().toISOString();

  if (!intent) {
    try {
      await env.ROOM_DB!.prepare(
        `INSERT INTO unmatched_payments
          (unmatched_payment_id, transaction_id, output_index, amount_zat, payment_reference, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          `UNMATCHED-${createRandomHex(10).toUpperCase()}`,
          transactionId,
          outputIndex,
          amountZat,
          paymentReference || null,
          "UNKNOWN_PAYMENT_REFERENCE",
          now,
        )
        .run();
    } catch {
      // A repeated watcher delivery is still safe; the unique transaction/output
      // key makes the unmatched queue idempotent.
    }

    return jsonResponse({ status: "unmatched", paymentReference, transactionId, outputIndex }, 202);
  }

  if (intent.status !== "confirmed" && Date.parse(intent.expires_at) <= Date.now()) {
    await env.ROOM_DB!.prepare("UPDATE payment_intents SET status = ? WHERE payment_intent_id = ? AND status != ?")
      .bind("expired", intent.payment_intent_id, "confirmed")
      .run();
    try {
      await env.ROOM_DB!.prepare(
        `INSERT INTO unmatched_payments
          (unmatched_payment_id, transaction_id, output_index, amount_zat, payment_reference, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          `UNMATCHED-${createRandomHex(10).toUpperCase()}`,
          transactionId,
          outputIndex,
          amountZat,
          paymentReference || null,
          "EXPIRED_PAYMENT_INTENT",
          now,
        )
        .run();
    } catch {
      // Re-delivery of an expired output is idempotent.
    }

    return jsonResponse({ status: "expired", paymentIntentId: intent.payment_intent_id, paymentReference }, 202);
  }

  const isExactAmount = amountZat === intent.expected_amount_zat;
  let status: PaymentStatus;
  if (!isExactAmount) {
    status = amountZat < intent.expected_amount_zat ? "underpaid" : "overpaid";
  } else if (confirmations >= minimumPaymentConfirmations(env)) {
    status = "confirmed";
  } else if (confirmations === 0 && intent.status === "confirmed") {
    status = "reorged";
  } else {
    status = "detected";
  }

  const eventType = watcherEventType(status);
  try {
    await env.ROOM_DB!.prepare(
      `INSERT INTO payment_events
        (event_id, payment_intent_id, transaction_id, output_index, amount_zat, confirmations, event_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `EVENT-${createRandomHex(10).toUpperCase()}`,
        intent.payment_intent_id,
        transactionId,
        outputIndex,
        amountZat,
        confirmations,
        eventType,
        now,
      )
      .run();
  } catch {
    // Re-delivery of the same transaction/output/event is idempotent.
  }

  try {
    await env.ROOM_DB!.prepare(
      `UPDATE payment_intents
       SET status = ?, transaction_id = ?, output_index = ?, observed_amount_zat = ?, confirmations = ?, confirmed_at = CASE WHEN ? = ? THEN COALESCE(confirmed_at, ?) ELSE NULL END
       WHERE payment_intent_id = ?`,
    )
      .bind(
        status,
        transactionId,
        outputIndex,
        amountZat,
        confirmations,
        status,
        "confirmed",
        now,
        intent.payment_intent_id,
      )
      .run();
  } catch {
    return jsonResponse({ error: "Payment event conflicts with an existing transaction output." }, 409);
  }

  await refreshUserAccess(intent.user_id, env);
  return jsonResponse({
    status,
    paymentIntentId: intent.payment_intent_id,
    paymentReference,
    transactionId,
    outputIndex,
    confirmations,
    accessLevel: status === "confirmed" ? "full" satisfies AccessLevel : "read_only" satisfies AccessLevel,
  });
}

async function createRoomSession(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const memoReference = typeof body.memoReference === "string" ? body.memoReference.trim() : "";
  const returnAddress = typeof body.returnAddress === "string" ? body.returnAddress.trim() : "";
  if (!memoReference) {
    return jsonResponse({ error: "memoReference is required." }, 400);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const accessCode = createAccessCode();
    const credentialHash = await hashAccessCode(accessCode);
    const roomId = createRoomId();

    try {
      await env.ROOM_DB!.prepare(
        `INSERT INTO room_credentials
          (room_id, credential_hash, memo_reference, return_address, amount_usd_cents, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(roomId, credentialHash, memoReference, returnAddress, ROOM_USD_TARGET_CENTS, "pending", new Date().toISOString())
        .run();

      return jsonResponse({ roomId, accessCode, status: "pending" satisfies LegacyRoomStatus }, 201);
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("Could not allocate a unique room access code.");
}

async function verifyRoomDemoPayment(roomId: string, request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const accessCode = typeof body.accessCode === "string" ? body.accessCode.trim() : "";
  if (!accessCode) {
    return jsonResponse({ error: "accessCode is required." }, 400);
  }

  const credentialHash = await hashAccessCode(accessCode);
  const existing = await env.ROOM_DB!.prepare(
    "SELECT room_id, status FROM room_credentials WHERE room_id = ? AND credential_hash = ? LIMIT 1",
  )
    .bind(roomId, credentialHash)
    .first<{ room_id: string; status: LegacyRoomStatus }>();
  if (!existing) {
    return jsonResponse({ error: "Access code does not match this room." }, 401);
  }

  if (existing.status === "pending") {
    await env.ROOM_DB!.prepare(
      `UPDATE room_credentials
       SET status = ?, verified_at = ?
       WHERE room_id = ? AND credential_hash = ?`,
    )
      .bind("verified", new Date().toISOString(), roomId, credentialHash)
      .run();
  }

  const row = await env.ROOM_DB!.prepare("SELECT room_id, status FROM room_credentials WHERE room_id = ? LIMIT 1")
    .bind(roomId)
    .first<{ room_id: string; status: LegacyRoomStatus }>();
  if (!row) {
    return jsonResponse({ error: "Room ID not found." }, 404);
  }

  return jsonResponse({ roomId: row.room_id, status: row.status });
}

async function loginRoom(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const accessCode = typeof body.accessCode === "string" ? body.accessCode.trim() : "";
  if (!accessCode) {
    return jsonResponse({ error: "accessCode is required." }, 400);
  }

  const credentialHash = await hashAccessCode(accessCode);
  const row = await env.ROOM_DB!.prepare(
    "SELECT room_id, status FROM room_credentials WHERE credential_hash = ? LIMIT 1",
  )
    .bind(credentialHash)
    .first<{ room_id: string; status: LegacyRoomStatus }>();
  if (!row || row.status !== "verified") {
    return jsonResponse({ error: "Access code is invalid or not verified." }, 401);
  }

  return jsonResponse({ roomId: row.room_id, status: row.status });
}

const INDEXABLE_PUBLIC_PATHS = new Set(["/", "/how-it-works", "/manifesto", "/privacy"]);

function crawlerPolicyForHtmlPath(pathname: string): string {
  const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return INDEXABLE_PUBLIC_PATHS.has(normalizedPath)
    ? "index, follow"
    : "noindex, nofollow, noarchive, nosnippet";
}

const worker = {
  async fetch(request: Request, env: HidnWorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/room/config") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        const { price, source } = await getZecUsdPrice(env);
        const configuredAmount = configuredPaymentAmount(env);
        return jsonResponse(
          {
            usdTargetCents: ROOM_USD_TARGET_CENTS,
            zecUsdPrice: price,
            zecAmount: (ROOM_USD_TARGET_CENTS / 100 / price).toFixed(8),
            source,
            paymentReady: Boolean(configuredAmount && env.ROOM_SHIELDED_ADDRESS),
            paymentAmountZat: configuredAmount,
            minimumConfirmations: minimumPaymentConfirmations(env),
          },
          200,
          "public, max-age=30, stale-while-revalidate=60",
        );
      } catch {
        return jsonResponse({ error: "ZEC price data is unavailable." }, 502);
      }
    }

    if (url.pathname === "/api/account/signup") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await signupAccount(request, env);
      } catch {
        return jsonResponse({ error: "Account could not be created." }, 500);
      }
    }

    if (url.pathname === "/api/account/login") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await loginAccount(request, env);
      } catch {
        return jsonResponse({ error: "Account login could not be completed." }, 500);
      }
    }

    if (url.pathname === "/api/account/zk/signup") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await signupZkAccount(request, env);
      } catch {
        return jsonResponse({ error: "Proof-based account could not be created." }, 500);
      }
    }

    if (url.pathname === "/api/account/zk/challenge") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await createZkChallenge(request, env);
      } catch {
        return jsonResponse({ error: "Proof challenge could not be created." }, 500);
      }
    }

    if (url.pathname === "/api/account/zk/verify") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await verifyZkLogin(request, env);
      } catch {
        return jsonResponse({ error: "Browser proof could not be verified." }, 500);
      }
    }

    if (url.pathname === "/api/account/session") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await getAccountSession(request, env);
      } catch {
        return jsonResponse({ error: "Account session could not be read." }, 500);
      }
    }

    if (url.pathname === "/api/account/history") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listAccountHistory(request, env);
      } catch {
        return jsonResponse({ error: "Private account history could not be loaded." }, 500);
      }
    }

    if (url.pathname === "/api/account/recovery/questions") {
      if (request.method !== "GET" && request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return request.method === "GET"
          ? await listRecoveryQuestions(request, env)
          : await saveRecoveryQuestions(request, env);
      } catch {
        return jsonResponse({ error: "Recovery confirmations could not be completed." }, 500);
      }
    }

    if (url.pathname === "/api/account/recovery/verify") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await verifyRecoveryQuestions(request, env);
      } catch {
        return jsonResponse({ error: "Recovery security check could not be completed." }, 500);
      }
    }

    if (url.pathname === "/api/account/notifications") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listAccountNotifications(request, env);
      } catch {
        return jsonResponse({ error: "Private notifications could not be loaded." }, 500);
      }
    }

    if (url.pathname === "/api/account/notifications/read") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await markAccountNotificationsRead(request, env);
      } catch {
        return jsonResponse({ error: "Private notifications could not be updated." }, 500);
      }
    }

    if (url.pathname === "/api/account/logout") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await logoutAccount(request, env);
      } catch {
        return jsonResponse({ error: "Account logout could not be completed." }, 500);
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

    if (url.pathname === "/api/room/replies") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await createRoomReply(request, env);
      } catch {
        return jsonResponse({ error: "Reply could not be created." }, 500);
      }
    }

    if (url.pathname === "/api/room/reactions") {
      if (request.method !== "GET" && request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return request.method === "GET"
          ? await listRoomReactionState(request, env)
          : await toggleRoomReaction(request, env);
      } catch {
        return jsonResponse({ error: request.method === "GET" ? "Reactions could not be loaded." : "Reaction could not be saved." }, 500);
      }
    }

    if (url.pathname === "/api/room/posts") {
      if (request.method !== "GET" && request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return request.method === "GET"
          ? await listRoomPosts(request, env)
          : await createRoomPost(request, env);
      } catch {
        return jsonResponse({ error: request.method === "GET" ? "Room posts could not be loaded." : "Post could not be created." }, 500);
      }
    }

    if (url.pathname === "/api/room/thread") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await listRoomThread(request, env);
      } catch {
        return jsonResponse({ error: "Private thread could not be loaded." }, 500);
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
        return await listModerationVisibility(env);
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

    if (url.pathname === "/api/payments/intents") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await createPaymentIntent(request, env);
      } catch {
        return jsonResponse({ error: "Payment intent could not be created." }, 500);
      }
    }

    const paymentIntentMatch = url.pathname.match(/^\/api\/payments\/intents\/([^/]+)$/);
    if (paymentIntentMatch) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await getPaymentIntent(decodeURIComponent(paymentIntentMatch[1]), request, env);
      } catch {
        return jsonResponse({ error: "Payment intent could not be read." }, 500);
      }
    }

    if (url.pathname === "/api/internal/payments/events") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await ingestWatcherPayment(request, env);
      } catch {
        return jsonResponse({ error: "Payment event could not be ingested." }, 500);
      }
    }

    if (url.pathname === "/api/room/sessions") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await createRoomSession(request, env);
      } catch {
        return jsonResponse({ error: "Room session could not be created." }, 500);
      }
    }

    const verifyMatch = url.pathname.match(/^\/api\/room\/sessions\/([^/]+)\/verify-demo$/);
    if (verifyMatch) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await verifyRoomDemoPayment(decodeURIComponent(verifyMatch[1]), request, env);
      } catch {
        return jsonResponse({ error: "Room session could not be verified." }, 500);
      }
    }

    if (url.pathname === "/api/room/login") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      try {
        return await loginRoom(request, env);
      } catch {
        return jsonResponse({ error: "Room login could not be completed." }, 500);
      }
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
    if (!contentType.toLowerCase().includes("text/html")) {
      return assetResponse;
    }

    const headers = new Headers(assetResponse.headers);
    headers.set("X-Robots-Tag", crawlerPolicyForHtmlPath(url.pathname));
    return new Response(assetResponse.body, {
      headers,
      status: assetResponse.status,
      statusText: assetResponse.statusText,
    });
  },
};

export default worker;
