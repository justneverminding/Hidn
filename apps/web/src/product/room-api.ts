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

export interface AccountResponse {
  userId: string;
  username: string;
  accessLevel: AccountAccessLevel;
  paymentStatus: "not_started" | "pending" | "confirmed";
  recoveryCode?: string;
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

export function loginAccount(username: string, recoveryCode: string): Promise<AccountResponse> {
  return accountRequest<AccountResponse>("/api/account/login", { username, recoveryCode });
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
