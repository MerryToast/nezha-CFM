import { safeStorageGet, safeStorageRemove, safeStorageRemoveByPrefix, safeStorageSet } from "@/lib/safe-storage"

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
  return safeStorageGet(tokenKeyForScope(baseUrl), "local") || ""
}

export function setTurnstileToken(token: string, baseUrl?: string): void {
  if (token) safeStorageSet(tokenKeyForScope(baseUrl), token, "local")
}

export function getTurnstileVerified(baseUrl?: string): string {
  return safeStorageGet(verifiedKeyForScope(baseUrl), "local") || ""
}

export function setTurnstileVerified(verified: string, baseUrl?: string): void {
  if (verified) safeStorageSet(verifiedKeyForScope(baseUrl), verified, "local")
}

export function clearTurnstileStorage(baseUrl?: string): void {
  if (baseUrl !== undefined) {
    safeStorageRemove(tokenKeyForScope(baseUrl), "local")
    safeStorageRemove(verifiedKeyForScope(baseUrl), "local")
    return
  }
  // Clear legacy unscoped keys and all scoped Turnstile keys when invoked without a target base
  safeStorageRemove(STORAGE_KEYS.TURNSTILE_TOKEN, "local")
  safeStorageRemove(STORAGE_KEYS.TURNSTILE_VERIFIED, "local")
  safeStorageRemoveByPrefix(`${STORAGE_KEYS.TURNSTILE_TOKEN}:`, "local")
  safeStorageRemoveByPrefix(`${STORAGE_KEYS.TURNSTILE_VERIFIED}:`, "local")
}

function isTurnstileReady(): boolean {
  return typeof window !== "undefined" && typeof window.turnstile?.render === "function"
}

function waitForTurnstileReady(
  scriptEl: Element,
  onReady: () => void,
  onFail: (err: unknown) => void,
  timeoutMs = 10_000,
): () => void {
  let settled = false
  let pollTimer: number | null = null
  let timeoutTimer: number | null = null

  const cleanup = () => {
    scriptEl.removeEventListener("load", handleLoad)
    scriptEl.removeEventListener("error", handleError)
    if (pollTimer !== null) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
    if (timeoutTimer !== null) {
      window.clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  const succeed = () => {
    if (settled) return
    settled = true
    cleanup()
    onReady()
  }

  const fail = (err: unknown) => {
    if (settled) return
    settled = true
    cleanup()
    onFail(err)
  }

  const handleLoad = () => {
    if (isTurnstileReady()) {
      succeed()
      return
    }
    const deadline = Date.now() + 2_000
    if (pollTimer === null) {
      pollTimer = window.setInterval(() => {
        if (isTurnstileReady()) {
          succeed()
        } else if (Date.now() >= deadline) {
          fail(new Error("Turnstile render API unavailable"))
        }
      }, 50)
    }
  }

  const handleError = (err: Event) => {
    fail(err)
  }

  if (isTurnstileReady()) {
    succeed()
    return cleanup
  }

  scriptEl.addEventListener("load", handleLoad, { once: true })
  scriptEl.addEventListener("error", handleError, { once: true })
  pollTimer = window.setInterval(() => {
    if (isTurnstileReady()) {
      succeed()
    }
  }, 50)
  timeoutTimer = window.setTimeout(() => {
    fail(new Error("Turnstile script load timeout"))
  }, timeoutMs)

  return cleanup
}

export function loadTurnstileScript(): Promise<void> {
  if (isTurnstileReady()) {
    return Promise.resolve()
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)
    if (existing) {
      if (existing.getAttribute("data-cfsm-turnstile-failed") === "1") {
        existing.remove()
      } else {
        waitForTurnstileReady(
          existing,
          () => resolve(),
          (err) => {
            existing.setAttribute("data-cfsm-turnstile-failed", "1")
            existing.remove()
            turnstileScriptPromise = null
            reject(err)
          },
        )
        return
      }
    }

    const script = document.createElement("script")
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.setAttribute("data-cfsm-turnstile", "1")
    waitForTurnstileReady(
      script,
      () => resolve(),
      (err) => {
        script.setAttribute("data-cfsm-turnstile-failed", "1")
        script.remove()
        turnstileScriptPromise = null
        reject(err)
      },
    )
    document.head.appendChild(script)
  })

  return turnstileScriptPromise
}
