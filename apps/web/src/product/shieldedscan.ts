const SHIELDEDSCAN_STATS_URL = "/api/zcash-stats";
const SHIELDEDSCAN_REQUEST_TIMEOUT_MS = 8_000;

export interface ShieldedScanStats {
  blockHeight: number;
  priceUsd: number | null;
  transactions24h: number | null;
  shieldedSupplyZec: number | null;
  marketCapUsd: number | null;
  asOf: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseStats(payload: unknown): ShieldedScanStats {
  if (!isRecord(payload)) {
    throw new Error("ShieldedScan returned an invalid stats response.");
  }

  const blockHeight = optionalNumber(payload.blockHeight);
  if (blockHeight === null || !Number.isSafeInteger(blockHeight) || blockHeight < 0) {
    throw new Error("ShieldedScan returned an invalid block height.");
  }

  const priceUsd = optionalNumber(payload.priceUsd);
  const transactions24h = optionalNumber(payload.transactions24h);
  const shieldedSupplyZec = optionalNumber(payload.shieldedSupplyZec);
  const marketCapUsd = optionalNumber(payload.marketCapUsd);
  const asOf = optionalNumber(payload.asOf);

  return {
    blockHeight,
    priceUsd: priceUsd !== null && priceUsd > 0 ? priceUsd : null,
    transactions24h: transactions24h !== null && transactions24h >= 0 ? transactions24h : null,
    shieldedSupplyZec: shieldedSupplyZec !== null && shieldedSupplyZec >= 0 ? shieldedSupplyZec : null,
    marketCapUsd: marketCapUsd !== null && marketCapUsd >= 0 ? marketCapUsd : null,
    asOf: asOf !== null && asOf >= 0 ? asOf : null,
  };
}

export async function fetchShieldedScanStats(): Promise<ShieldedScanStats> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SHIELDEDSCAN_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SHIELDEDSCAN_STATS_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ShieldedScan returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error("ShieldedScan returned a non-JSON response.");
    }

    return parseStats(await response.json());
  } finally {
    window.clearTimeout(timeout);
  }
}
