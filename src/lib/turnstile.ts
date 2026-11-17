export const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js"

export const STORAGE_KEYS = {
  JWT_TOKEN: "jwt_token",
  TURNSTILE_TOKEN: "turnstile_token",
  TURNSTILE_VERIFIED: "turnstile_verified",
} as const

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          theme?: "light" | "dark" | "auto"
          callback?: (token: string) => void
          "error-callback"?: (error?: unknown) => void
          "expired-callback"?: () => void
        },
      ) => string
      reset?: (widgetId?: string) => void
      remove?: (widgetId?: string) => void
    }
  }
}

let turnstileScriptPromise: Promise<void> | null = null

function resolveTurnstileScope(baseUrl?: string): string {
  const clean = String(baseUrl || "").trim().replace(/\/+$/, "")
  if (clean) return clean
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin
  }
  return "default"
}

function tokenKeyForScope(baseUrl?: string): string {
  return `${STORAGE_KEYS.TURNSTILE_TOKEN}:${resolveTurnstileScope(baseUrl)}`
}

function verifiedKeyForScope(baseUrl?: string): string {
  return `${STORAGE_KEYS.TURNSTILE_VERIFIED}:${resolveTurnstileScope(baseUrl)}`
}

export function getTurnstileToken(baseUrl?: string): string {
  try {
    return localStorage.getItem(tokenKeyForScope(baseUrl)) || ""
  } catch {
    return ""
  }
}

export function setTurnstileToken(token: string, baseUrl?: string): void {
  try {
    if (token) localStorage.setItem(tokenKeyForScope(baseUrl), token)
  } catch {
    // ignore storage errors
  }
}

export function getTurnstileVerified(baseUrl?: string): string {
  try {
    return localStorage.getItem(verifiedKeyForScope(baseUrl)) || ""
  } catch {
    return ""
  }
}

export function setTurnstileVerified(verified: string, baseUrl?: string): void {
  try {
    if (verified) localStorage.setItem(verifiedKeyForScope(baseUrl), verified)
  } catch {
    // ignore storage errors
  }
}

export function clearTurnstileStorage(baseUrl?: string): void {
  try {
    if (baseUrl !== undefined) {
      localStorage.removeItem(tokenKeyForScope(baseUrl))
      localStorage.removeItem(verifiedKeyForScope(baseUrl))
      return
    }
    // Clear legacy unscoped keys and all scoped Turnstile keys when invoked without a target base
    localStorage.removeItem(STORAGE_KEYS.TURNSTILE_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.TURNSTILE_VERIFIED)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (
        k &&
        (k.startsWith(`${STORAGE_KEYS.TURNSTILE_TOKEN}:`) || k.startsWith(`${STORAGE_KEYS.TURNSTILE_VERIFIED}:`))
      ) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    // ignore storage errors
  }
}

export function loadTurnstileScript(): Promise<void> {
  if (typeof window !== "undefined" && window.turnstile) {
    return Promise.resolve()
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener(
        "error",
        (err) => {
          turnstileScriptPromise = null
          reject(err)
        },
        { once: true },
      )
      return
    }

    const script = document.createElement("script")
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = (err) => {
      turnstileScriptPromise = null
      reject(err)
    }
    document.head.appendChild(script)
  })

  return turnstileScriptPromise
}
