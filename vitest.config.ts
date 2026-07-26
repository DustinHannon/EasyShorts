import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Mirror tsconfig.json's `"@/*": ["./*"]` — the alias is repo-root-relative
// (there is no src/), so `@/lib/x` must resolve to `<repo>/lib/x`.
// Normalised to forward slashes so the Windows path doesn't leak backslashes
// into Vite's (posix-normalised) module ids.
const rootDir = fileURLToPath(new URL(".", import.meta.url)).replace(/\\/g, "/")

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: rootDir }],
  },
  test: {
    // Pure functions only — no DOM, no FFmpeg, no browser globals needed.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
