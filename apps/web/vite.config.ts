import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const roomApiTarget = process.env.HIDN_ROOM_API_ORIGIN ?? "https://hidnroom.com";
const shieldedScanStatusUrl = "https://api.shieldedscan.xyz/v1/status";
const shieldedScanSupplyUrl = "https://api.shieldedscan.xyz/v1/supply";

interface ShieldedScanStatusPayload {
  height?: unknown;
  circulatingSupplyZat?: unknown;
  priceUsd?: unknown;
  txCount24h?: unknown;
  asOf?: unknown;
}

interface ShieldedScanSupplyPayload {
  shieldedZat?: unknown;
  asOf?: unknown;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadShieldedScanStats(): Promise<Record<string, number | null>> {
  const headers = {
    Accept: "application/json",
    Origin: "https://shieldedscan.xyz",
    Referer: "https://shieldedscan.xyz/",
  };
  const [statusResponse, supplyResponse] = await Promise.all([
    fetch(shieldedScanStatusUrl, { headers }),
    fetch(shieldedScanSupplyUrl, { headers }),
  ]);

  if (!statusResponse.ok || !supplyResponse.ok) {
    throw new Error("ShieldedScan mainnet data is unavailable.");
  }

  const [status, supply] = (await Promise.all([
    statusResponse.json(),
    supplyResponse.json(),
  ])) as [ShieldedScanStatusPayload, ShieldedScanSupplyPayload];
  const blockHeight = finiteNumber(status.height);
  if (blockHeight === null || !Number.isSafeInteger(blockHeight) || blockHeight < 0) {
    throw new Error("ShieldedScan returned an invalid block height.");
  }

  const priceUsd = finiteNumber(status.priceUsd);
  const circulatingSupplyZat = finiteNumber(status.circulatingSupplyZat);
  const shieldedSupplyZat = finiteNumber(supply.shieldedZat);
  const circulatingSupplyZec = circulatingSupplyZat !== null ? circulatingSupplyZat / 100_000_000 : null;

  return {
    blockHeight,
    priceUsd: priceUsd !== null && priceUsd > 0 ? priceUsd : null,
    transactions24h: finiteNumber(status.txCount24h),
    shieldedSupplyZec: shieldedSupplyZat !== null && shieldedSupplyZat >= 0 ? shieldedSupplyZat / 100_000_000 : null,
    marketCapUsd: priceUsd !== null && circulatingSupplyZec !== null ? priceUsd * circulatingSupplyZec : null,
    asOf: Math.max(finiteNumber(status.asOf) ?? 0, finiteNumber(supply.asOf) ?? 0) || null,
  };
}

async function handleShieldedScanStats(request: { method?: string }, response: {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}): Promise<void> {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  try {
    response.statusCode = 200;
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(await loadShieldedScanStats()));
  } catch {
    response.statusCode = 502;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "ShieldedScan mainnet data is unavailable." }));
  }
}

function shieldedScanStatsPlugin() {
  return {
    name: "hidn-shieldedscan-stats",
    configureServer(server: { middlewares: { use(path: string, handler: (request: { method?: string }, response: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void }) => void): void } }) {
      server.middlewares.use("/api/zcash-stats", (request, response) => {
        void handleShieldedScanStats(request, response);
      });
    },
    configurePreviewServer(server: { middlewares: { use(path: string, handler: (request: { method?: string }, response: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void }) => void): void } }) {
      server.middlewares.use("/api/zcash-stats", (request, response) => {
        void handleShieldedScanStats(request, response);
      });
    },
  };
}

function anonymousZkAssetsPlugin() {
  // Only the setup output in build/v2 is published, never the root of build/,
  // which holds local development keys from `test:proof` runs.
  const sourceRoot = fileURLToPath(new URL("../../packages/anonymous-zk/build/v2", import.meta.url));
  const targetRoot = fileURLToPath(new URL("../../public/anonymous-zk/v2", import.meta.url));
  const assets = [
    ["hidn_membership.wasm", "hidn_membership.wasm"],
    ["hidn_membership_final.zkey", "hidn_membership_final.zkey"],
  ] as const;

  return {
    name: "hidn-anonymous-zk-assets",
    buildStart() {
      for (const [sourceRelativePath, targetRelativePath] of assets) {
        const source = `${sourceRoot}/${sourceRelativePath}`;
        const target = `${targetRoot}/${targetRelativePath}`;
        if (existsSync(source)) {
          mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
          copyFileSync(source, target);
        }
        if (!existsSync(target)) {
          throw new Error(
            `Missing anonymous ZK asset: ${targetRelativePath}. `
              + "Build the circuit or restore the tracked public asset before deploying.",
          );
        }
      }
    },
  };
}

const apiProxy = {
  "/api/anonymous": {
    changeOrigin: true,
    target: roomApiTarget,
  },
  "/api/reports": {
    changeOrigin: true,
    target: roomApiTarget,
  },
  "/api/admin": {
    changeOrigin: true,
    target: roomApiTarget,
  },
  "/admin/api": {
    changeOrigin: true,
    target: roomApiTarget,
  },
  "/api/moderation": {
    changeOrigin: true,
    target: roomApiTarget,
  },
  "/api/room": {
    changeOrigin: true,
    target: roomApiTarget,
  },
  "/api/zcash-tip": {
    changeOrigin: true,
    rewrite: () => "/api/blocks?limit=1",
    target: "https://api.mainnet.cipherscan.app",
  },
};

export default defineConfig({
  // Keep the repository-level /public directory as the single future asset
  // source, including the canonical HIDN brand asset locations.
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
  plugins: [shieldedScanStatsPlugin(), anonymousZkAssetsPlugin()],
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
