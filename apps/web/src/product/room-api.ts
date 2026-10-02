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

export interface RoomPost {
  id: string;
  reference: string;
  text: string;
  category: string;
  channel: string;
  time: string;
  reactions: number;
}

export interface RoomPostsResponse {
  posts: RoomPost[];
  channel: string;
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
    throw new Error(message);
  }

  return (await response.json()) as AccountResponse;
}

export function logoutAccount(): Promise<{ ok: boolean }> {
  return accountRequest<{ ok: boolean }>("/api/account/logout", {});
}

export function fetchRoomPosts(channel: string): Promise<RoomPostsResponse> {
  return roomGet<RoomPostsResponse>(`/api/room/posts?channel=${encodeURIComponent(channel)}`);
}

export function createRoomPost(input: {
  content: string;
  channel: string;
  category: string;
}): Promise<{ post: RoomPost; status: "created" }> {
  return accountRequest<{ post: RoomPost; status: "created" }>("/api/room/posts", input);
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

async function adminRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : `Admin reports returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return (await response.json()) as T;
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
