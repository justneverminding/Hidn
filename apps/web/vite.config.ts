import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const roomApiTarget = process.env.HIDN_ROOM_API_ORIGIN ?? "https://hidn.justneverminding.workers.dev";
const apiProxy = {
  "/api/account": {
    changeOrigin: true,
    target: roomApiTarget,
  },
  "/api/payments": {
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
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
