import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const roomApiTarget = process.env.HIDN_ROOM_API_ORIGIN ?? "https://hidn.justneverminding.workers.dev";

export default defineConfig({
  // Keep the repository-level /public directory as the single future asset
  // source, including the canonical HIDN brand asset locations.
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
  server: {
    proxy: {
      "/api/room": {
        changeOrigin: true,
        target: roomApiTarget,
      },
      "/api/zcash-tip": {
        changeOrigin: true,
        rewrite: () => "/api/blocks?limit=1",
        target: "https://api.mainnet.cipherscan.app",
      },
    },
  },
});
