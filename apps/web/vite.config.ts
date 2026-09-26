import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // Keep the repository-level /public directory as the single future asset
  // source, including the canonical HIDN brand asset locations.
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
});

