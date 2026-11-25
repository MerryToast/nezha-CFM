import react from "@vitejs/plugin-react-swc"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Plugin, UserConfig, defineConfig } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvVars(): Record<string, string> {
  const merged: Record<string, string> = {}
  const envPath = path.resolve(__dirname, ".env")
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      merged[key] = value
    }
  }
  for (const key of [
    "API_BASE",
    "CSP_API",
    "CSP_IMG",
    "CSP_STATIC",
    "TITLE",
    "BACKGROUND_IMAGE",
    "BACKGROUND_IMAGE_MOBILE",
  ]) {
    if (process.env[key]) {
      merged[key] = process.env[key] as string
    }
  }
  return merged
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1"
}

function parseOrigins(raw: string): string[] {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => {
          if (!s || /[\s;"']/.test(s)) return false
          try {
            const u = new URL(s)
            return u.protocol === "https:" || (u.protocol === "http:" && isLoopbackHost(u.hostname))
          } catch {
            return false
          }
        })
        .map((s) => new URL(s).origin),
    ),
  )
}

function extractHttpOriginIfExternal(rawUrl: string): string[] {
  const trimmed = String(rawUrl || "").trim()
  if (!trimmed || trimmed.startsWith("/") || trimmed.startsWith("./")) return []
  try {
    const u = new URL(trimmed)
    if (u.protocol === "https:" || (u.protocol === "http:" && isLoopbackHost(u.hostname))) {
      return [u.origin]
    }
  } catch {
    // ignore invalid URL
  }
  return []
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function isSafeCssUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || hasControlChars(trimmed)) return false
  if (trimmed.startsWith("/")) {
    return !trimmed.startsWith("//") && !trimmed.startsWith("/\\")
  }
  if (trimmed.startsWith("./")) {
    return !trimmed.slice(2).includes(":")
  }
  try {
    const u = new URL(trimmed)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}

function escapeCssUrl(value: string): string {
  const trimmed = String(value || "").trim()
  if (!isSafeCssUrl(trimmed)) return ""
  return trimmed
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/</g, "\\3c ")
    .replace(/>/g, "\\3e ")
    .replace(/[\r\n]/g, "")
}

const TURNSTILE_DOMAIN = "https://challenges.cloudflare.com"
const INSIGHTS_DOMAIN = "https://static.cloudflareinsights.com"
const FONTS_API_DOMAIN = "https://fonts.googleapis.com"
const FONTS_STATIC_DOMAIN = "https://fonts.gstatic.com"
const RAW_GITHUB_DOMAIN = "https://raw.githubusercontent.com"
const DEFAULT_CSP_CONNECT_DOMAINS = [
  "https://api.frankfurter.app",
  "https://open.er-api.com",
  "https://api.ip.sb",
  "https://ipwho.is",
  "https://ipapi.co",
]

function buildApiDomainsWithWs(rawApiDomains: string[]): string[] {
  const out: string[] = []
  for (const origin of rawApiDomains) {
    out.push(origin)
    if (origin.startsWith("https://")) {
      out.push(origin.replace("https://", "wss://"))
    } else if (origin.startsWith("http://")) {
      out.push(origin.replace("http://", "ws://"))
    }
  }
  return Array.from(new Set(out))
}

function collectInlineScriptHashes(html: string): { html: string; hashes: string[] } {
  const hashes: string[] = []
  const normalizedHtml = html.replace(
    /(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_full, openTag: string, body: string, closeTag: string) => {
      const lfBody = body.replace(/\r\n?/g, "\n")
      if (lfBody.trim()) {
        const digest = crypto.createHash("sha256").update(lfBody, "utf8").digest("base64")
        hashes.push(`'sha256-${digest}'`)
      }
      return `${openTag}${lfBody}${closeTag}`
    },
  )
  return { html: normalizedHtml, hashes }
}

function insertAfterCharsetOrHeadStart(html: string, tag: string): string {
  if (/<meta\b[^>]*\bcharset\s*=[^>]*>/i.test(html)) {
    return html.replace(/(<meta\b[^>]*\bcharset\s*=[^>]*>)/i, `$1\n    ${tag}`)
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/(<head\b[^>]*>)/i, `$1\n    ${tag}`)
  }
  return `${tag}\n${html}`
}

function buildStaticCspMetaContent(
  apiDomains: string[],
  cspApiDomains: string[],
  cspImgDomains: string[],
  cspStaticDomains: string[],
  inlineScriptHashes: string[],
): string {
  const unique = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).join(" ")
  const connectApi = buildApiDomainsWithWs([...apiDomains, ...cspApiDomains])
  const imgSrc = [
    "'self'",
    TURNSTILE_DOMAIN,
    RAW_GITHUB_DOMAIN,
    ...cspImgDomains,
    ...cspStaticDomains,
    ...apiDomains,
    "data:",
  ]
  return [
    "default-src 'self'",
    `script-src ${unique(["'self'", ...inlineScriptHashes, TURNSTILE_DOMAIN, INSIGHTS_DOMAIN, ...cspStaticDomains])}`,
    `style-src ${unique(["'self'", "'unsafe-inline'", TURNSTILE_DOMAIN, FONTS_API_DOMAIN, ...cspStaticDomains])}`,
    `img-src ${unique(imgSrc)}`,
    `media-src ${unique(imgSrc)}`,
    `font-src ${unique(["'self'", TURNSTILE_DOMAIN, FONTS_STATIC_DOMAIN, ...cspStaticDomains])}`,
    `connect-src ${unique(["'self'", TURNSTILE_DOMAIN, INSIGHTS_DOMAIN, ...DEFAULT_CSP_CONNECT_DOMAINS, ...connectApi])}`,
    `frame-src ${TURNSTILE_DOMAIN}`,
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join(";")
}

function cfsmStaticEnvPlugin(isStaticBuild: boolean): Plugin {
  const env = isStaticBuild ? loadEnvVars() : {}
  const apiBases = isStaticBuild ? parseOrigins(env.API_BASE || "") : []
  const cspApiDomains = isStaticBuild ? parseOrigins(env.CSP_API || "") : []
  const cspStaticDomains = isStaticBuild ? parseOrigins(env.CSP_STATIC || "") : []
  const title = isStaticBuild ? (env.TITLE || "").trim() : ""
  const bg = isStaticBuild ? (env.BACKGROUND_IMAGE || "").trim() : ""
  const mobileBg = isStaticBuild ? (env.BACKGROUND_IMAGE_MOBILE || "").trim() : ""
  const cspImgDomains = isStaticBuild
    ? Array.from(
        new Set([
          ...parseOrigins(env.CSP_IMG || ""),
          ...extractHttpOriginIfExternal(bg),
          ...extractHttpOriginIfExternal(mobileBg),
        ]),
      )
    : []

  return {
    name: "cfsm-static-env-inject",
    transformIndexHtml: {
      order: "post",
      handler(html: string) {
        let out = html.replace(/<meta\b(?=[^>]*http-equiv=["']Content-Security-Policy["'])[^>]*>\s*/gi, "")
        if (!isStaticBuild) {
          return out
        }
        if (title) {
          const safeTitle = escapeHtmlText(title)
          out = /<title>.*?<\/title>/is.test(out)
            ? out.replace(/<title>.*?<\/title>/is, () => `<title>${safeTitle}</title>`)
            : out.replace(/<\/head>/i, () => `<title>${safeTitle}</title>\n</head>`)
        }
        if (apiBases.length > 0) {
          const meta = `<meta name="apiBase" content="${escapeHtmlAttr(apiBases.join(","))}">`
          if (/<meta\b(?=[^>]*\bname=["']apiBase["'])[^>]*>/i.test(out)) {
            out = out.replace(/<meta\b(?=[^>]*\bname=["']apiBase["'])[^>]*>/i, () => meta)
          } else {
            out = insertAfterCharsetOrHeadStart(out, meta)
          }
        }
        const hashed = collectInlineScriptHashes(out)
        out = hashed.html
        const cspContent = buildStaticCspMetaContent(
          apiBases,
          cspApiDomains,
          cspImgDomains,
          cspStaticDomains,
          hashed.hashes,
        )
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttr(cspContent)}">`
        out = insertAfterCharsetOrHeadStart(out, cspMeta)
        if (bg || mobileBg) {
          const rules: string[] = []
          let mobileUrl = ""
          if (bg) {
            const safe = escapeCssUrl(bg)
            if (safe) {
              rules.push(
                `body{background-image:url('${safe}') !important;background-size:cover !important;background-attachment:fixed !important;background-position:center !important;background-repeat:no-repeat !important;}`,
              )
              mobileUrl = safe
            }
          }
          if (mobileBg) {
            const safeMobile = escapeCssUrl(mobileBg)
            if (safeMobile) {
              mobileUrl = safeMobile
            }
          }
          if (mobileUrl) {
            rules.push(
              `@media (max-width: 767px){body{position:relative;min-height:100vh;background-image:none !important;background-color:transparent !important;background-attachment:scroll !important;}body::after{content:"";position:fixed;top:0;left:0;width:100%;height:100vh;height:100lvh;pointer-events:none;z-index:-1;background-image:url('${mobileUrl}') !important;background-size:cover !important;background-position:center !important;background-repeat:no-repeat !important;}}`,
            )
          }
          if (rules.length > 0) {
            const styleTag = `<style>${rules.join("")}</style>`
            out = out.replace(/<\/head>/i, () => `${styleTag}\n</head>`)
          }
        }
        return out
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const apiTarget = process.env.VITE_API_TARGET || "http://127.0.0.1:8787"
  const isStaticBuild = mode === "github-page" || process.env.CFSM_STATIC_BUILD === "true"

  const baseConfig: UserConfig = {
    base: "./",
    plugins: [react(), cfsmStaticEnvPlugin(isStaticBuild)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name].[hash].js",
          chunkFileNames: "assets/[name].[hash].js",
          assetFileNames: "assets/[name].[hash].[ext]",
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("recharts") || id.includes("d3-")) return "charts"
              if (id.includes("framer-motion") || id.includes("motion-dom")) return "motion"
              if (id.includes("lucide-react") || id.includes("@heroicons")) return "icons"
              return "vendor"
            }
          },
        },
      },
      chunkSizeWarningLimit: 1500,
    },
  }

  if (mode === "development") {
    const allowInsecureProxy = process.env.VITE_PROXY_INSECURE === "true"
    const createProxy = () => ({
      target: apiTarget,
      changeOrigin: true,
      secure: !allowInsecureProxy,
      ws: true,
    })

    baseConfig.server = {
      proxy: {
        "/api": createProxy(),
        "/admin": createProxy(),
        "/flags": createProxy(),
        "/os-icons": createProxy(),
        "/theme": createProxy(),
      },
    }
  }

  return baseConfig
})
