export interface RoomConfig {
  usdTargetCents: number;
  zecUsdPrice: number;
  zecAmount: string;
  source: string;
}

export interface RoomSessionResponse {
  roomId: string;
  status: "pending" | "verified";
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
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Room backend returned HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function hashRoomSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createRoomSession(input: {
  credentialHash: string;
  memoReference: string;
  returnAddress: string;
}): Promise<RoomSessionResponse> {
  return roomRequest<RoomSessionResponse>("/api/room/sessions", input);
}

export function verifyRoomDemoPayment(roomId: string): Promise<RoomSessionResponse> {
  return roomRequest<RoomSessionResponse>(`/api/room/sessions/${encodeURIComponent(roomId)}/verify-demo`, {});
}

export function loginRoomSession(credentialHash: string): Promise<RoomSessionResponse> {
  return roomRequest<RoomSessionResponse>("/api/room/login", { credentialHash });
}
