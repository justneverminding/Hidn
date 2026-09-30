import {
  buildZkChallengeMessage,
  isValidZkPublicKey,
  verifyZkProof,
} from "@hidn/zk";

const CIPHERSCAN_RECENT_BLOCKS_URL =
  "https://api.mainnet.cipherscan.app/api/blocks?limit=1";
const COINGECKO_ZEC_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd";
const ROOM_USD_TARGET_CENTS = 100;
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAYMENT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const ZK_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const WATCHER_CLOCK_SKEW_MS = 5 * 60 * 1000;

type AccessLevel = "read_only" | "full";
type AuthMethod = "recovery_code" | "schnorr";
type LegacyRoomStatus = "pending" | "verified";
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
}

interface AuthenticatedUser {
  userId: string;
  username: string;
  accessLevel: AccessLevel;
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

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

    return env.ASSETS.fetch(request);
  },
};

export default worker;
