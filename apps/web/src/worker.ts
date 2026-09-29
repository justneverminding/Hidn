const CIPHERSCAN_RECENT_BLOCKS_URL =
  "https://api.mainnet.cipherscan.app/api/blocks?limit=1";
const COINGECKO_ZEC_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd";
const ROOM_USD_TARGET_CENTS = 100;

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface RoomDatabase {
  prepare(query: string): D1Statement;
}

interface HidnWorkerEnv {
  ASSETS: AssetFetcher;
  ROOM_DB?: RoomDatabase;
  ZEC_USD_PRICE?: string;
}

function jsonResponse(body: unknown, status = 200, cacheControl = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
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

function createRoomId(): string {
  return `HIDN-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
}

async function createRoomSession(request: Request, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  const body = await requestBody(request);
  const credentialHash = typeof body.credentialHash === "string" ? body.credentialHash.trim() : "";
  const memoReference = typeof body.memoReference === "string" ? body.memoReference.trim() : "";
  const returnAddress = typeof body.returnAddress === "string" ? body.returnAddress.trim() : "";
  if (!credentialHash || !memoReference) {
    return jsonResponse({ error: "credentialHash and memoReference are required." }, 400);
  }

  const roomId = createRoomId();
  await env.ROOM_DB!.prepare(
    `INSERT INTO room_credentials
      (room_id, credential_hash, memo_reference, return_address, amount_usd_cents, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(roomId, credentialHash, memoReference, returnAddress, ROOM_USD_TARGET_CENTS, "pending", new Date().toISOString())
    .run();

  return jsonResponse({ roomId, status: "pending" }, 201);
}

async function verifyRoomDemoPayment(roomId: string, env: HidnWorkerEnv): Promise<Response> {
  const unavailable = databaseUnavailable(env);
  if (unavailable) {
    return unavailable;
  }

  await env.ROOM_DB!.prepare(
    `UPDATE room_credentials
     SET status = ?, verified_at = ?
     WHERE room_id = ?`,
  )
    .bind("verified", new Date().toISOString(), roomId)
    .run();

  const row = await env.ROOM_DB!.prepare("SELECT room_id, status FROM room_credentials WHERE room_id = ? LIMIT 1")
    .bind(roomId)
    .first<{ room_id: string; status: "pending" | "verified" }>();
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
  const credentialHash = typeof body.credentialHash === "string" ? body.credentialHash.trim() : "";
  if (!credentialHash) {
    return jsonResponse({ error: "credentialHash is required." }, 400);
  }

  const row = await env.ROOM_DB!.prepare(
    "SELECT room_id, status FROM room_credentials WHERE credential_hash = ? LIMIT 1",
  )
    .bind(credentialHash)
    .first<{ room_id: string; status: "pending" | "verified" }>();
  if (!row || row.status !== "verified") {
    return jsonResponse({ error: "Room ID is not verified." }, 401);
  }

  return jsonResponse({ roomId: row.room_id, status: row.status });
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
        return jsonResponse(
          {
            usdTargetCents: ROOM_USD_TARGET_CENTS,
            zecUsdPrice: price,
            zecAmount: (ROOM_USD_TARGET_CENTS / 100 / price).toFixed(8),
            source,
          },
          200,
          "public, max-age=30, stale-while-revalidate=60",
        );
      } catch {
        return jsonResponse({ error: "ZEC price data is unavailable." }, 502);
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
        return await verifyRoomDemoPayment(decodeURIComponent(verifyMatch[1]), env);
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

    return env.ASSETS.fetch(request);
  },
};

export default worker;
