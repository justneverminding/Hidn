export interface RoomConfig {
  usdTargetCents: number;
  zecUsdPrice: number;
  zecAmount: string;
  source: string;
}

export interface RoomSessionResponse {
  roomId: string;
  status: "pending" | "verified";
  accessCode?: string;
}

export type AccountAccessLevel = "read_only" | "full";
export type AccountAuthMethod = "recovery_code" | "schnorr";
export type ReportTargetType = "thread" | "reply" | "account";
export type ReportReason = "spam" | "harassment" | "threats" | "sexual_content" | "personal_data" | "self_harm" | "other";
export type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";
export type ModerationTargetType = "thread" | "reply";
export type ModerationAction = "approve" | "hide" | "reject";

export interface AccountResponse {
  userId: string;
  username: string;
  accessLevel: AccountAccessLevel;
  paymentStatus: "not_started" | "pending" | "confirmed";
  authMethod?: AccountAuthMethod;
  recoveryCode?: string;
}

export interface AccountTipAddressResponse {
  network: "testnet";
  tipAddress: string | null;
}

export interface RoomPost {
  id: string;
  reference: string;
  text: string;
  category: string;
  channel: string;
  time: string;
  reactions: number;
  replies: number;
  liked?: boolean;
  tipAddress?: string | null;
}

export type ContentStatus = "visible" | "pending" | "hidden" | "rejected";

export interface AccountHistoryPost extends RoomPost {
  status: ContentStatus;
}

export interface RoomComment {
  id: string;
  threadId: string;
  text: string;
  channel: string;
  time: string;
  status: ContentStatus;
}

export interface AccountHistoryStats {
  posts: number;
  comments: number;
  likes: number;
}

export interface AccountHistoryResponse {
  posts: AccountHistoryPost[];
  comments: RoomComment[];
  stats?: AccountHistoryStats;
}

export type AccountNotificationType = "reaction" | "reply";

export interface AccountNotification {
  id: string;
  type: AccountNotificationType;
  actorAlias: string;
  targetType: "thread" | "reply";
  targetId: string;
  threadId?: string;
  createdAt: string;
  readAt: string | null;
}

export interface AccountNotificationsResponse {
  notifications: AccountNotification[];
  unreadCount: number;
}

export interface AnonymousStatusResponse {
  enabled: boolean;
  protocol: string;
  treeDepth: number;
  maxMembers: number;
  networkPrivacy: string;
}

export interface AnonymousEnrollmentResponse {
  protocol: string;
  treeDepth: number;
  commitment: string;
  displayAlias: string;
  root: string;
  leafIndex: number;
  pathElements: string[];
  pathIndices: number[];
}

export interface AnonymousProofEnvelope {
  protocol: string;
  proof: unknown;
  publicSignals: string[];
}

export interface AnonymousNotificationsResponse {
  notifications: AccountNotification[];
  unreadCount: number;
}

export interface RecoveryQuestionsResponse {
  configured: boolean;
  questions: string[];
}

export interface RoomPostsResponse {
  posts: RoomPost[];
  channel: string;
}

export interface RoomThreadResponse {
  post: RoomPost;
  replies: RoomComment[];
}

export interface RoomReactionState {
  targetId: string;
  reactions: number;
  liked: boolean;
}

export interface RoomReactionStateResponse {
  targetType: "thread" | "reply";
  reactions: RoomReactionState[];
}

export interface RoomActivityEvent {
  actor: string;
  action: string;
  subject: string;
  createdAt: string;
}

export interface RoomActivityResponse {
  activities: RoomActivityEvent[];
}

export interface ZkChallengeResponse {
  protocol: "hidn-schnorr-v1";
  challengeId: string;
  challenge: string;
  expiresAt: string;
}

export interface PaymentIntentResponse {
  paymentIntentId: string;
  paymentReference: string;
  expectedAmountZat: number;
  receivingAddress: string | null;
  refundAddressStored: boolean;
  status:
    | "pending"
    | "detected"
    | "confirmed"
    | "underpaid"
    | "overpaid"
    | "expired"
    | "refund_pending"
    | "refunded"
    | "reorged";
  transactionId: string | null;
  outputIndex: number | null;
  observedAmountZat: number | null;
  confirmations: number;
  minimumConfirmations: number;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
}

export interface ReportSubmissionResponse {
  reportId: string;
  status: "open";
  createdAt: string;
}

export interface AdminReport {
  reportId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetExcerpt: string;
  reason: ReportReason;
  details: string;
  reporterUserId: string;
  reporterUsername: string | null;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewerNote: string;
}

export interface AdminReportsResponse {
  reports: AdminReport[];
  summary: Array<{ status: ReportStatus; count: number }>;
  filter: ReportStatus | "all";
  limit: number;
}

export type AdminRole = "super_admin" | "moderator" | "reviewer";
export type AdminStatus = "active" | "disabled";

export interface AdminSession {
  adminId: string;
  email: string | null;
  displayName: string | null;
  role: AdminRole;
  source: "cloudflare_access" | "legacy_token";
}

export interface AdminModerator {
  adminId: string;
  email: string | null;
  displayName: string | null;
  role: AdminRole;
  status: AdminStatus;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AdminAuditEvent {
  eventId: string;
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
}

export interface ModerationVisibilityResponse {
  hiddenTargets: Array<{
    targetType: ModerationTargetType;
    targetId: string;
  }>;
}

export async function fetchRoomConfig(): Promise<RoomConfig> {
  const response = await fetch("/api/room/config", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Room config returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    usdTargetCents?: unknown;
    zecUsdPrice?: unknown;
    zecAmount?: unknown;
    source?: unknown;
    zcash?: { usd?: unknown };
  };
  const zecUsdPrice =
    typeof payload.zecUsdPrice === "number" ? payload.zecUsdPrice : Number(payload.zcash?.usd);
  const zecAmount =
    typeof payload.zecAmount === "string" ? payload.zecAmount : Number.isFinite(zecUsdPrice) && zecUsdPrice > 0 ? (1 / zecUsdPrice).toFixed(8) : "";

  if (!Number.isFinite(zecUsdPrice) || zecUsdPrice <= 0 || !zecAmount) {
    throw new Error("Room config returned an invalid ZEC amount.");
  }

  return {
    usdTargetCents: typeof payload.usdTargetCents === "number" ? payload.usdTargetCents : 100,
    zecUsdPrice,
    zecAmount,
    source: typeof payload.source === "string" ? payload.source : "COINGECKO",
  };
}

async function roomRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string"
      ? payload.error
      : response.status === 405 && path.startsWith("/api/account/zk/")
        ? "The deployed Room Worker is older than this local frontend. Apply D1 migration 0004 and deploy the updated Worker before creating a proof account."
        : `Room backend returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function roomGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : `Room backend returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function accountRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return roomRequest<T>(path, body);
}

async function anonymousRequest<T>(
  path: string,
  body: Record<string, unknown>,
  notificationCapability = "",
): Promise<T> {
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
  if (notificationCapability) {
    headers.set("X-HIDN-Notification-Capability", notificationCapability);
  }
  const response = await fetch(path, {
    method: "POST",
    credentials: "omit",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : `Anonymous room backend returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new Error("Anonymous ZK access is not activated on this Worker yet.");
  }
  return payload as T;
}

async function anonymousGet<T>(path: string, notificationCapability = ""): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (notificationCapability) {
    headers.set("X-HIDN-Notification-Capability", notificationCapability);
  }
  const response = await fetch(path, {
    credentials: "omit",
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : `Anonymous room backend returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new Error("Anonymous ZK access is not activated on this Worker yet.");
  }
  return payload as T;
}

export function fetchAnonymousStatus(): Promise<AnonymousStatusResponse> {
  return anonymousGet<AnonymousStatusResponse>("/api/anonymous/status");
}

export function enrollAnonymousMember(input: {
  commitment: string;
  notificationCapability: string;
}): Promise<AnonymousEnrollmentResponse> {
  return anonymousRequest<AnonymousEnrollmentResponse>("/api/anonymous/enroll", input);
}

export function fetchAnonymousPosts(channel: string): Promise<RoomPostsResponse> {
  return anonymousGet<RoomPostsResponse>(`/api/anonymous/posts?channel=${encodeURIComponent(channel)}`);
}

export function fetchAnonymousThread(threadId: string): Promise<RoomThreadResponse> {
  return anonymousGet<RoomThreadResponse>(`/api/anonymous/thread?threadId=${encodeURIComponent(threadId)}`);
}

export function createAnonymousPost(input: {
  proof: AnonymousProofEnvelope;
  scope: string;
  alias: string;
  notificationCapability: string;
  content: string;
  channel: string;
  category: string;
  tipAddress?: string;
}): Promise<{ post: RoomPost; status: "created"; anonymousAlias: string }> {
  return anonymousRequest<{ post: RoomPost; status: "created"; anonymousAlias: string }>("/api/anonymous/posts", {
    ...input.proof,
    scope: input.scope,
    alias: input.alias,
    notificationCapability: input.notificationCapability,
    content: input.content,
    channel: input.channel,
    category: input.category,
    tipAddress: input.tipAddress ?? "",
  });
}

export function createAnonymousReply(input: {
  proof: AnonymousProofEnvelope;
  scope: string;
  alias: string;
  notificationCapability: string;
  threadId: string;
  content: string;
}): Promise<{ comment: RoomComment; status: "created"; anonymousAlias: string }> {
  return anonymousRequest<{ comment: RoomComment; status: "created"; anonymousAlias: string }>("/api/anonymous/replies", {
    ...input.proof,
    scope: input.scope,
    alias: input.alias,
    notificationCapability: input.notificationCapability,
    threadId: input.threadId,
    content: input.content,
  });
}

export function createAnonymousReaction(input: {
  proof: AnonymousProofEnvelope;
  scope: string;
  alias: string;
  targetType: "thread" | "reply";
  targetId: string;
}): Promise<{ targetType: "thread" | "reply"; targetId: string; liked: true; reactions: number }> {
  return anonymousRequest<{ targetType: "thread" | "reply"; targetId: string; liked: true; reactions: number }>("/api/anonymous/reactions", {
    ...input.proof,
    scope: input.scope,
    alias: input.alias,
    targetType: input.targetType,
    targetId: input.targetId,
  });
}

export function fetchAnonymousNotifications(notificationCapability: string): Promise<AnonymousNotificationsResponse> {
  return anonymousGet<AnonymousNotificationsResponse>("/api/anonymous/notifications?limit=30", notificationCapability);
}

export function markAnonymousNotificationsRead(
  notificationCapability: string,
  notificationIds: string[] = [],
): Promise<{ status: "read" }> {
  return anonymousRequest<{ status: "read" }>(
    "/api/anonymous/notifications/read",
    { notificationIds },
    notificationCapability,
  );
}

export function signupAccount(username: string): Promise<AccountResponse> {
  return accountRequest<AccountResponse>("/api/account/signup", { username });
}

export function signupZkAccount(username: string, identityCommitment: string): Promise<AccountResponse> {
  return accountRequest<AccountResponse>("/api/account/zk/signup", { username, identityCommitment });
}

export function loginAccount(username: string, recoveryCode: string): Promise<AccountResponse> {
  return accountRequest<AccountResponse>("/api/account/login", { username, recoveryCode });
}

export function requestZkChallenge(username: string): Promise<ZkChallengeResponse> {
  return accountRequest<ZkChallengeResponse>("/api/account/zk/challenge", { username });
}

export function verifyZkLogin(input: {
  username: string;
  challengeId: string;
  challenge: string;
  proof: string;
}): Promise<AccountResponse> {
  return accountRequest<AccountResponse>("/api/account/zk/verify", input);
}

export async function fetchAccountSession(): Promise<AccountResponse> {
  const response = await fetch("/api/account/session", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : `Account session returned HTTP ${response.status}.`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as AccountResponse;
}

export function logoutAccount(): Promise<{ ok: boolean }> {
  return accountRequest<{ ok: boolean }>("/api/account/logout", {});
}

export function fetchAccountHistory(): Promise<AccountHistoryResponse> {
  return roomGet<AccountHistoryResponse>("/api/account/history");
}

export function fetchAccountNotifications(): Promise<AccountNotificationsResponse> {
  return roomGet<AccountNotificationsResponse>("/api/account/notifications?limit=30");
}

export function fetchAccountTipAddress(): Promise<AccountTipAddressResponse> {
  return roomGet<AccountTipAddressResponse>("/api/account/tip-address");
}

export function saveAccountTipAddress(tipAddress: string): Promise<AccountTipAddressResponse> {
  return accountRequest<AccountTipAddressResponse>("/api/account/tip-address", { tipAddress });
}

export function markAccountNotificationsRead(notificationIds: string[] = []): Promise<{ status: "read" }> {
  return accountRequest<{ status: "read" }>("/api/account/notifications/read", { notificationIds });
}

export function fetchRecoveryQuestions(): Promise<RecoveryQuestionsResponse> {
  return roomGet<RecoveryQuestionsResponse>("/api/account/recovery/questions");
}

export function saveRecoveryQuestions(questions: Array<{ question: string; answer: string }>): Promise<RecoveryQuestionsResponse> {
  return accountRequest<RecoveryQuestionsResponse>("/api/account/recovery/questions", { questions });
}

export function verifyRecoveryQuestions(username: string, answers: string[]): Promise<{ verified: boolean }> {
  return accountRequest<{ verified: boolean }>("/api/account/recovery/verify", { username, answers });
}

export function fetchRoomPosts(channel: string): Promise<RoomPostsResponse> {
  return roomGet<RoomPostsResponse>(`/api/room/posts?channel=${encodeURIComponent(channel)}`);
}

export function fetchRoomThread(threadId: string): Promise<RoomThreadResponse> {
  return roomGet<RoomThreadResponse>(`/api/room/thread?threadId=${encodeURIComponent(threadId)}`);
}

export function fetchRoomReactionState(
  targetType: "thread" | "reply",
  targetIds: string[],
): Promise<RoomReactionStateResponse> {
  const params = new URLSearchParams({ targetType, ids: targetIds.join(",") });
  return roomGet<RoomReactionStateResponse>(`/api/room/reactions?${params.toString()}`);
}

export function fetchRoomActivity(): Promise<RoomActivityResponse> {
  return roomGet<RoomActivityResponse>("/api/room/activity?limit=8");
}

export function createRoomPost(input: {
  content: string;
  channel: string;
  category: string;
  tipAddress?: string | null;
}): Promise<{ post: RoomPost; status: "created" }> {
  return accountRequest<{ post: RoomPost; status: "created" }>("/api/room/posts", input);
}

export function createRoomReply(input: {
  threadId: string;
  content: string;
  submissionId: string;
}): Promise<{ comment: RoomComment; status: "created" | "already_saved" }> {
  return accountRequest<{ comment: RoomComment; status: "created" | "already_saved" }>("/api/room/replies", input);
}

export function toggleRoomReaction(input: {
  targetType: "thread" | "reply";
  targetId: string;
}): Promise<{ targetType: "thread" | "reply"; targetId: string; liked: boolean; reactions: number }> {
  return accountRequest<{ targetType: "thread" | "reply"; targetId: string; liked: boolean; reactions: number }>("/api/room/reactions", input);
}

export function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  targetExcerpt: string;
  reason: ReportReason;
  details: string;
}): Promise<ReportSubmissionResponse> {
  return accountRequest<ReportSubmissionResponse>("/api/reports", input);
}

async function adminRequest<T>(path: string, token = "", init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // Keep the browser request under the same Cloudflare Access application as
  // the admin console. A second Access application for the API would trigger
  // a separate OAuth handoff during fetch and surface as a generic network
  // error in the console.
  const scopedPath = path.startsWith("/api/admin") ? `/admin${path}` : path;
  const response = await fetch(scopedPath, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      response.redirected || response.url.includes("cloudflareaccess.com")
        ? "Cloudflare Access sign-in is required before using the admin console."
        : "The admin API returned the application page instead of JSON. Please reload the admin console.",
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : `Admin reports returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function fetchAdminSession(): Promise<{ admin: AdminSession }> {
  return adminRequest<{ admin: AdminSession }>("/api/admin/session");
}

export function fetchAdminReports(token: string, status: ReportStatus | "all" = "all"): Promise<AdminReportsResponse> {
  const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  return adminRequest<AdminReportsResponse>(`/api/admin/reports${query}`, token);
}

export function updateAdminReport(
  token: string,
  reportId: string,
  status: ReportStatus,
  reviewerNote: string,
): Promise<{ report: AdminReport }> {
  return adminRequest<{ report: AdminReport }>(`/api/admin/reports/${encodeURIComponent(reportId)}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, reviewerNote }),
  });
}

export function moderateAdminContent(
  token: string,
  input: {
    targetType: ModerationTargetType;
    targetId: string;
    action: ModerationAction;
    reason?: string;
    reportId?: string;
  },
): Promise<{
  action: ModerationAction;
  targetType: ModerationTargetType;
  targetId: string;
  persistedContentRow: boolean;
  linkedReport: boolean;
  createdAt: string;
}> {
  return adminRequest(`/api/admin/moderation`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchAdminModerators(token = ""): Promise<{ admins: AdminModerator[] }> {
  return adminRequest<{ admins: AdminModerator[] }>("/api/admin/moderators", token);
}

export function createAdminModerator(
  token: string,
  input: { email: string; displayName?: string; role: AdminRole; accessSubject?: string },
): Promise<{ status: "created"; email: string; role: AdminRole }> {
  return adminRequest(`/api/admin/moderators`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateAdminModerator(
  token: string,
  adminId: string,
  input: { role?: AdminRole; status?: AdminStatus; displayName?: string },
): Promise<{ status: "updated"; adminId: string; role: AdminRole; accountStatus: AdminStatus }> {
  return adminRequest(`/api/admin/moderators/${encodeURIComponent(adminId)}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchAdminAudit(token = "", limit = 100): Promise<{ events: AdminAuditEvent[] }> {
  return adminRequest<{ events: AdminAuditEvent[] }>(`/api/admin/audit?limit=${encodeURIComponent(String(limit))}`, token);
}

export async function fetchModerationVisibility(): Promise<ModerationVisibilityResponse> {
  const response = await fetch("/api/moderation/visibility", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string"
      ? payload.error
      : `Moderation visibility returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return (await response.json()) as ModerationVisibilityResponse;
}

export function createPaymentIntent(refundAddress: string): Promise<PaymentIntentResponse> {
  return accountRequest<PaymentIntentResponse>("/api/payments/intents", { refundAddress });
}

export async function fetchPaymentIntent(paymentIntentId: string): Promise<PaymentIntentResponse> {
  const response = await fetch(`/api/payments/intents/${encodeURIComponent(paymentIntentId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : `Payment status returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return (await response.json()) as PaymentIntentResponse;
}

export function createRoomSession(input: {
  memoReference: string;
  returnAddress: string;
}): Promise<RoomSessionResponse> {
  return roomRequest<RoomSessionResponse>("/api/room/sessions", input);
}

export function verifyRoomDemoPayment(roomId: string, accessCode: string): Promise<RoomSessionResponse> {
  return roomRequest<RoomSessionResponse>(`/api/room/sessions/${encodeURIComponent(roomId)}/verify-demo`, { accessCode });
}

export function loginRoomSession(accessCode: string): Promise<RoomSessionResponse> {
  return roomRequest<RoomSessionResponse>("/api/room/login", { accessCode });
}
