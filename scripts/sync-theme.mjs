import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const distDir = path.join(rootDir, "dist")
const themeDir = path.join(rootDir, "theme")

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  throw new Error("Build output dist/index.html not found.")
}

fs.rmSync(themeDir, { recursive: true, force: true })
fs.mkdirSync(themeDir, { recursive: true })

// CF-Server-Monitor third-party theme spec requires ONLY index.html and assets/
fs.copyFileSync(path.join(distDir, "index.html"), path.join(themeDir, "index.html"))

const distAssetsDir = path.join(distDir, "assets")
if (fs.existsSync(distAssetsDir)) {
  fs.cpSync(distAssetsDir, path.join(themeDir, "assets"), { recursive: true })
}

console.log("[sync-theme] Synced index.html and assets/ to theme/")
