// Dev utility: generate the preset gradient background library as 1080x1920
// PNGs into public/backgrounds/. Run with: node scripts/generate-backgrounds.mjs
// Pure JS (pngjs) — no native deps. Re-run to regenerate.
import { PNG } from "pngjs"
import { mkdirSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, "../public/backgrounds")
const W = 1080
const H = 1920

const hexToRgb = (h) => {
  const s = h.replace("#", "")
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}
const lerp = (a, b, t) => Math.round(a + (b - a) * t)

function generate(id, c1, c2, angle = "diagonal") {
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)
  const png = new PNG({ width: W, height: H })
  for (let y = 0; y < H; y++) {
    const vy = y / (H - 1)
    // Subtle darkening across the bottom third so burned-in captions stay legible.
    const darken = vy > 0.66 ? ((vy - 0.66) / 0.34) * 0.28 : 0
    for (let x = 0; x < W; x++) {
      const t = angle === "vertical" ? vy : (x / (W - 1) + vy) / 2
      const r = Math.round(lerp(r1, r2, t) * (1 - darken))
      const g = Math.round(lerp(g1, g2, t) * (1 - darken))
      const b = Math.round(lerp(b1, b2, t) * (1 - darken))
      const idx = (W * y + x) << 2
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }
  writeFileSync(resolve(OUT_DIR, `${id}.png`), PNG.sync.write(png))
}

// id, color1 -> color2, angle
const PRESETS = [
  ["grad-purple-pink", "#7c3aed", "#db2777", "diagonal"],
  ["grad-blue-violet", "#2563eb", "#7c3aed", "diagonal"],
  ["grad-pink-orange", "#ec4899", "#f59e0b", "diagonal"],
  ["grad-ocean-teal", "#0891b2", "#1e3a8a", "vertical"],
  ["grad-cyan-indigo", "#06b6d4", "#4338ca", "diagonal"],
  ["grad-deep-sea", "#0f766e", "#0c4a6e", "vertical"],
  ["grad-sunset-red", "#f97316", "#dc2626", "diagonal"],
  ["grad-amber-pink", "#f59e0b", "#db2777", "diagonal"],
  ["grad-golden-hour", "#fbbf24", "#b45309", "vertical"],
  ["grad-charcoal", "#374151", "#111827", "vertical"],
  ["grad-midnight", "#1e293b", "#1e1b4b", "diagonal"],
  ["grad-noir", "#27272a", "#09090b", "vertical"],
  ["grad-forest", "#166534", "#052e16", "vertical"],
  ["grad-emerald", "#059669", "#064e3b", "diagonal"],
  ["grad-mint-teal", "#10b981", "#0f766e", "diagonal"],
  ["grad-aurora", "#22c55e", "#2563eb", "diagonal"],
  ["grad-violet-cyan", "#8b5cf6", "#06b6d4", "diagonal"],
  ["grad-royal-gold", "#d4af37", "#1e3a8a", "vertical"],
  ["grad-crimson", "#b91c1c", "#450a0a", "vertical"],
  ["grad-slate-rose", "#475569", "#9f1239", "diagonal"],
]

mkdirSync(OUT_DIR, { recursive: true })
for (const [id, c1, c2, angle] of PRESETS) {
  generate(id, c1, c2, angle)
  console.log("wrote", id + ".png")
}
console.log(`Done: ${PRESETS.length} backgrounds -> public/backgrounds/`)
