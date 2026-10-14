export type AccountAccessLevel = "read_only" | "full";
export type ReportTargetType = "thread" | "reply" | "account";
export type ReportReason = "spam" | "harassment" | "threats" | "sexual_content" | "personal_data" | "self_harm" | "other";
export type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";
export type ModerationTargetType = "thread" | "reply";
export type ModerationAction = "approve" | "hide" | "reject";

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

export interface RoomComment {
  id: string;
  threadId: string;
  text: string;
  channel: string;
  time: string;
  status: ContentStatus;
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

export interface RoomPostsResponse {
  posts: RoomPost[];
  channel: string;
}

export interface RoomThreadResponse {
  post: RoomPost;
  replies: RoomComment[];
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
  reporterUserId: string | null;
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

async function anonymousRequest<T>(
  path: string,
  body: Record<string, unknown>,
  notificationCapabilities: string[] = [],
): Promise<T> {
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
  if (notificationCapabilities.length) {
    headers.set("X-HIDN-Notification-Capabilities", notificationCapabilities.join(","));
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

async function anonymousGet<T>(path: string, notificationCapabilities: string[] = []): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (notificationCapabilities.length) {
    headers.set("X-HIDN-Notification-Capabilities", notificationCapabilities.join(","));
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

export function fetchAnonymousPosts(channel: string, page: { before?: string; limit?: number } = {}): Promise<RoomPostsResponse> {
  const query = new URLSearchParams({ channel });
  if (page.before) query.set("before", page.before);
  if (page.limit) query.set("limit", String(page.limit));
  return anonymousGet<RoomPostsResponse>(`/api/anonymous/posts?${query}`);
}

export function fetchAnonymousThread(threadId: string): Promise<RoomThreadResponse> {
  return anonymousGet<RoomThreadResponse>(`/api/anonymous/thread?threadId=${encodeURIComponent(threadId)}`);
}

export function createAnonymousPost(input: {
  proof: AnonymousProofEnvelope;
  scope: string;
  notificationCapability: string;
  content: string;
  channel: string;
  category: string;
  tipAddress?: string;
}): Promise<{ post: RoomPost; status: "created" }> {
  return anonymousRequest<{ post: RoomPost; status: "created" }>("/api/anonymous/posts", {
    ...input.proof,
    scope: input.scope,
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
  notificationCapability: string;
  threadId: string;
  content: string;
}): Promise<{ comment: RoomComment; status: "created" }> {
  return anonymousRequest<{ comment: RoomComment; status: "created" }>("/api/anonymous/replies", {
    ...input.proof,
    scope: input.scope,
    notificationCapability: input.notificationCapability,
    threadId: input.threadId,
    content: input.content,
  });
}

export function createAnonymousReaction(input: {
  proof: AnonymousProofEnvelope;
  scope: string;
  targetType: "thread" | "reply";
  targetId: string;
}): Promise<{ targetType: "thread" | "reply"; targetId: string; liked: true; reactions: number }> {
  return anonymousRequest<{ targetType: "thread" | "reply"; targetId: string; liked: true; reactions: number }>("/api/anonymous/reactions", {
    ...input.proof,
    scope: input.scope,
    targetType: input.targetType,
    targetId: input.targetId,
  });
}

/** Notifications are read with the one-off keys of this browser's own posts
 * and replies; the server only matches them for this request. */
export function fetchAnonymousNotifications(notificationCapabilities: string[]): Promise<AnonymousNotificationsResponse> {
  return anonymousGet<AnonymousNotificationsResponse>("/api/anonymous/notifications?limit=30", notificationCapabilities);
}

export function markAnonymousNotificationsRead(
  notificationCapabilities: string[],
  notificationIds: string[] = [],
): Promise<{ status: "read" }> {
  return anonymousRequest<{ status: "read" }>(
    "/api/anonymous/notifications/read",
    { notificationIds },
    notificationCapabilities,
  );
}

export function fetchRoomActivity(): Promise<RoomActivityResponse> {
  return roomGet<RoomActivityResponse>("/api/room/activity?limit=8");
}

/** Reports carry an anonymous membership proof instead of an account. */
export function submitReport(input: {
  proof: AnonymousProofEnvelope;
  scope: string;
  targetType: "thread" | "reply";
  targetId: string;
  targetExcerpt: string;
  reason: ReportReason;
  details: string;
}): Promise<ReportSubmissionResponse> {
  return anonymousRequest<ReportSubmissionResponse>("/api/reports", {
    ...input.proof,
    scope: input.scope,
    targetType: input.targetType,
    targetId: input.targetId,
    targetExcerpt: input.targetExcerpt,
    reason: input.reason,
    details: input.details,
  });
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


// MARK: Personal confession links

export interface LinkInbox {
  slug: string;
  prompt: string;
  tipAddress: string | null;
  status: "open" | "closed";
  createdAt?: string;
}

export interface LinkMessage {
  id: string;
  text: string;
  tipCode: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface LinkInboxResponse {
  link: LinkInbox | null;
  messages: LinkMessage[];
  unreadCount: number;
}

async function linkRequest<T>(path: string, init: RequestInit = {}, inboxKey = ""): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (inboxKey) {
    headers.set("X-HIDN-Link-Key", inboxKey);
  }
  const response = await fetch(path, { ...init, headers, credentials: "omit", cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as (T & { error?: unknown }) | null;
  if (!response.ok || !payload) {
    throw new Error(typeof payload?.error === "string" ? payload.error : `Link service returned HTTP ${response.status}.`);
  }
  return payload;
}

export function fetchMyLinkInbox(inboxKey: string): Promise<LinkInboxResponse> {
  return linkRequest<LinkInboxResponse>("/api/links/mine", {}, inboxKey);
}

export function createMyLinkInbox(inboxKey: string, input: { proof: AnonymousProofEnvelope; scope: string }): Promise<{ link: LinkInbox }> {
  return linkRequest<{ link: LinkInbox }>("/api/links/mine", {
    method: "POST",
    body: JSON.stringify({ ...input.proof, scope: input.scope }),
  }, inboxKey);
}

export function updateMyLinkInbox(
  inboxKey: string,
  input: { prompt?: string; tipAddress?: string; status?: "open" | "closed"; rotate?: boolean },
): Promise<{ link: LinkInbox }> {
  return linkRequest<{ link: LinkInbox }>("/api/links/mine", { method: "PATCH", body: JSON.stringify(input) }, inboxKey);
}

export function markMyLinkMessagesRead(inboxKey: string): Promise<{ status: "read" }> {
  return linkRequest<{ status: "read" }>("/api/links/mine/read", { method: "POST", body: "{}" }, inboxKey);
}

export function deleteMyLinkMessage(inboxKey: string, messageId: string): Promise<{ status: "deleted" }> {
  return linkRequest<{ status: "deleted" }>(`/api/links/mine/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" }, inboxKey);
}

export function fetchPublicLink(slug: string): Promise<{ link: LinkInbox }> {
  return linkRequest<{ link: LinkInbox }>(`/api/links/${encodeURIComponent(slug)}`);
}

export function sendLinkMessage(slug: string, input: { content: string; tipCode?: string }): Promise<{ status: "sent"; createdAt: string }> {
  return linkRequest<{ status: "sent"; createdAt: string }>(`/api/links/${encodeURIComponent(slug)}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
