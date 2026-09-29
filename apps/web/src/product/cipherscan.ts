const CIPHERSCAN_TIP_URL = "/api/zcash-tip";
const CIPHERSCAN_REQUEST_TIMEOUT_MS = 8_000;

interface CipherScanRecentBlocksResponse {
  blocks?: Array<{
    height?: number | string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBlockHeight(payload: unknown): number {
  if (!isRecord(payload) || !Array.isArray(payload.blocks) || payload.blocks.length === 0) {
    throw new Error("CipherScan returned no recent blocks.");
  }

  const block = payload.blocks[0];
  if (!isRecord(block)) {
    throw new Error("CipherScan returned an invalid block.");
  }

  const height = typeof block.height === "number" ? block.height : Number(block.height);
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error("CipherScan returned an invalid block height.");
  }

  return height;
}

export async function fetchCipherScanMainnetTip(): Promise<number> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CIPHERSCAN_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CIPHERSCAN_TIP_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`CipherScan returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error("CipherScan returned a non-JSON response.");
    }

    const payload = (await response.json()) as CipherScanRecentBlocksResponse;
    return parseBlockHeight(payload);
  } finally {
    window.clearTimeout(timeout);
  }
}
