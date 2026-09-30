import { createHmac } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PAYMENT_REFERENCE_PATTERN = /HIDN-PAY-[A-Z0-9]+/i;
const DEFAULT_POLL_INTERVAL_MS = 15_000;

interface WatcherConfig {
  rpcUrl: string;
  rpcUser: string;
  rpcPassword: string;
  watchAddress: string;
  workerEventsUrl: string;
  watcherSecret: string;
  pollIntervalMs: number;
  stateFile: string;
  forwardUnmatched: boolean;
}

interface RpcError {
  code?: number;
  message?: string;
}

interface RpcResponse<T> {
  result?: T;
  error?: RpcError | null;
}

interface ReceivedNote {
  txid?: unknown;
  pool?: unknown;
  amountZat?: unknown;
  confirmations?: unknown;
  memo?: unknown;
  memoStr?: unknown;
  outindex?: unknown;
  jsoutindex?: unknown;
}

interface PaymentObservation {
  transactionId: string;
  outputIndex: number;
  amountZat: number;
  confirmations: number;
  paymentReference: string;
}

interface DeliveryState {
  transactionId: string;
  outputIndex: number;
  amountZat: number;
  confirmations: number;
  paymentReference: string;
  deliveryStatus: string;
  present: boolean;
}

type WatcherState = Record<string, DeliveryState>;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function loadConfig(): WatcherConfig {
  return {
    rpcUrl: requiredEnvironment("ZCASH_RPC_URL"),
    rpcUser: requiredEnvironment("ZCASH_RPC_USER"),
    rpcPassword: requiredEnvironment("ZCASH_RPC_PASSWORD"),
    watchAddress: requiredEnvironment("ZCASH_WATCH_ADDRESS"),
    workerEventsUrl: requiredEnvironment("HIDN_WORKER_EVENTS_URL"),
    watcherSecret: requiredEnvironment("PAYMENT_WATCHER_SECRET"),
    pollIntervalMs: positiveIntegerEnvironment("WATCHER_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS),
    stateFile: resolve(process.env.WATCHER_STATE_FILE?.trim() || ".hidn-watcher-state.json"),
    forwardUnmatched: process.env.WATCHER_FORWARD_UNMATCHED !== "false",
  };
}

function integerValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function decodeMemoHex(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(value)) {
    return "";
  }

  try {
    const bytes = new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
    return new TextDecoder().decode(bytes).replace(/\0+$/g, "");
  } catch {
    return "";
  }
}

function paymentReferenceFromNote(note: ReceivedNote): string {
  const memo = typeof note.memoStr === "string" ? note.memoStr : decodeMemoHex(note.memo);
  return memo.match(PAYMENT_REFERENCE_PATTERN)?.[0].toUpperCase() ?? "";
}

function normalizeObservation(note: ReceivedNote): PaymentObservation | undefined {
  const transactionId = typeof note.txid === "string" ? note.txid.trim() : "";
  const outputIndex = integerValue(note.outindex ?? note.jsoutindex);
  const amountZat = integerValue(note.amountZat);
  const confirmations = integerValue(note.confirmations);
  if (!transactionId || outputIndex === undefined || amountZat === undefined || amountZat <= 0 || confirmations === undefined) {
    return undefined;
  }

  return {
    transactionId,
    outputIndex,
    amountZat,
    confirmations,
    paymentReference: paymentReferenceFromNote(note),
  };
}

function observationKey(observation: Pick<PaymentObservation, "transactionId" | "outputIndex">): string {
  return `${observation.transactionId}:${observation.outputIndex}`;
}

function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

async function callZcashRpc<T>(config: WatcherConfig, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(config.rpcUser, config.rpcPassword),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "1.0", id: "hidn-payment-watcher", method, params }),
  });
  if (!response.ok) {
    throw new Error(`Zcash RPC returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as RpcResponse<T>;
  if (payload.error) {
    throw new Error(`Zcash RPC ${method} failed (${payload.error.code ?? "unknown"}).`);
  }
  if (payload.result === undefined) {
    throw new Error(`Zcash RPC ${method} returned no result.`);
  }

  return payload.result;
}

async function loadState(stateFile: string): Promise<WatcherState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(stateFile, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as WatcherState) : {};
  } catch {
    return {};
  }
}

async function saveState(stateFile: string, state: WatcherState): Promise<void> {
  const directory = dirname(stateFile);
  await mkdir(directory, { recursive: true });
  const temporaryFile = `${stateFile}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryFile, stateFile);
}

async function forwardObservation(config: WatcherConfig, observation: PaymentObservation): Promise<string> {
  const body = JSON.stringify({
    network: "mainnet",
    paymentReference: observation.paymentReference || undefined,
    transactionId: observation.transactionId,
    outputIndex: observation.outputIndex,
    amountZat: observation.amountZat,
    confirmations: observation.confirmations,
  });
  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", config.watcherSecret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  const response = await fetch(config.workerEventsUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-HIDN-WATCHER-TIMESTAMP": timestamp,
      "X-HIDN-WATCHER-SIGNATURE": `sha256=${signature}`,
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as { status?: unknown; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Worker returned HTTP ${response.status}.`);
  }

  return typeof payload.status === "string" ? payload.status : "accepted";
}

function shouldForward(
  previous: DeliveryState | undefined,
  observation: PaymentObservation,
): boolean {
  if (!previous) {
    return true;
  }

  if (previous.deliveryStatus === "unmatched" && observation.paymentReference) {
    return true;
  }

  return previous.amountZat !== observation.amountZat
    || previous.confirmations !== observation.confirmations
    || previous.paymentReference !== observation.paymentReference;
}

async function pollOnce(config: WatcherConfig, state: WatcherState): Promise<{ observed: number; forwarded: number }> {
  const received = await callZcashRpc<ReceivedNote[]>(config, "z_listreceivedbyaddress", [config.watchAddress, 0]);
  const currentKeys = new Set<string>();
  let forwarded = 0;

  for (const note of received) {
    const observation = normalizeObservation(note);
    if (!observation) {
      continue;
    }

    const key = observationKey(observation);
    currentKeys.add(key);
    const previous = state[key];
    if (shouldForward(previous, observation) && (config.forwardUnmatched || observation.paymentReference)) {
      const deliveryStatus = await forwardObservation(config, observation);
      forwarded += 1;
      state[key] = {
        ...observation,
        deliveryStatus,
        present: true,
      };
    } else {
      state[key] = {
        ...(previous ?? observation),
        ...observation,
        present: true,
      };
    }
  }

  for (const [key, previous] of Object.entries(state)) {
    if (!previous.present || currentKeys.has(key) || previous.confirmations === 0) {
      continue;
    }

    const reorgObservation: PaymentObservation = {
      transactionId: previous.transactionId,
      outputIndex: previous.outputIndex,
      amountZat: previous.amountZat,
      confirmations: 0,
      paymentReference: previous.paymentReference,
    };
    const deliveryStatus = await forwardObservation(config, reorgObservation);
    forwarded += 1;
    state[key] = {
      ...previous,
      confirmations: 0,
      deliveryStatus,
      present: false,
    };
  }

  for (const key of currentKeys) {
    state[key].present = true;
  }

  await saveState(config.stateFile, state);
  return { observed: received.length, forwarded };
}

export async function runWatcher(config = loadConfig()): Promise<void> {
  const state = await loadState(config.stateFile);
  let stopped = false;
  const stop = (): void => {
    stopped = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("[hidn-watcher] started; secrets and memos are not logged.");
  while (!stopped) {
    try {
      const result = await pollOnce(config, state);
      console.log(`[hidn-watcher] observed ${result.observed} wallet outputs; forwarded ${result.forwarded} changes.`);
    } catch (error) {
      console.error(`[hidn-watcher] poll failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    if (!stopped) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, config.pollIntervalMs));
    }
  }

  console.log("[hidn-watcher] stopped.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWatcher().catch((error: unknown) => {
    console.error(`[hidn-watcher] could not start: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
