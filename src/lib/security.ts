function hasAsciiControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

export interface SanitizeUrlOptions {
  allowRelative?: boolean
  allowHash?: boolean
}

/**
 * Validate and sanitize URLs for href/src attributes.
 * Only permits http(s), safe single-leading-slash relative paths (no // or /\), and optional #anchors.
 */
export function sanitizeSafeUrl(raw: unknown, options: SanitizeUrlOptions = {}): string {
  if (typeof raw !== "string") return ""
  const trimmed = raw.trim()
  if (!trimmed || hasAsciiControlChars(trimmed)) return ""

  const { allowRelative = true, allowHash = true } = options

  if (allowHash && trimmed.startsWith("#")) {
    return trimmed
  }

  if (allowRelative && trimmed.startsWith("/")) {
    if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
      return ""
    }
    try {
      const parsed = new URL(trimmed, "https://placeholder.local")
      if (parsed.origin !== "https://placeholder.local" || parsed.protocol !== "https:") {
        return ""
      }
      return trimmed
    } catch {
      return ""
    }
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return trimmed
    }
    return ""
  } catch {
    return ""
  }
}

/**
 * Validate a background image URL and format it as a safely escaped CSS `url("...")` value.
 */
export function toSafeCssUrlValue(raw: unknown): string | undefined {
  const safeUrl = sanitizeSafeUrl(raw, { allowRelative: true, allowHash: false })
  if (!safeUrl) return undefined
  const escaped = safeUrl
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/</g, "\\3c ")
    .replace(/>/g, "\\3e ")
  return `url("${escaped}")`
}
