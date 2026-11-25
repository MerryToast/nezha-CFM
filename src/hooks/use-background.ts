import { safeStorageGet, safeStorageRemove, safeStorageSet } from "@/lib/safe-storage"
import { sanitizeSafeUrl } from "@/lib/security"
import { CfsmThemeOptions } from "@/types/cfsm"
import { useCallback, useEffect, useState } from "react"

declare global {
  interface Window {
    CustomBackgroundImage: string
    CustomMobileBackgroundImage: string
    ForceShowServices: boolean
    ForceCardInline: boolean
    ForceShowMap: boolean
    ForcePeakCutEnabled: boolean
    __cfsmThemeOptions?: CfsmThemeOptions
  }
}

const BACKGROUND_CHANGE_EVENT = "backgroundChange"
const BG_HIDDEN_SESSION_KEY = "cfsm_bg_hidden"

interface BackgroundSnapshot {
  desktopRaw: string
  mobileRaw: string
  hasBodyBg: boolean
  hidden: boolean
}

let cachedSnapshot: BackgroundSnapshot | null = null
let cachedInitialBodyBg: boolean | null = null
const subscribers = new Set<(snap: BackgroundSnapshot) => void>()
let windowListenerBound = false

function detectStaticBodyBackground(): boolean {
  if (cachedInitialBodyBg !== null) return cachedInitialBodyBg
  if (typeof window === "undefined" || typeof document === "undefined" || !document.body) {
    return false
  }
  const hadHideClass = document.documentElement.classList.contains("cfsm-hide-bg")
  if (hadHideClass) {
    document.documentElement.classList.remove("cfsm-hide-bg")
  }
  const bg = window.getComputedStyle(document.body).backgroundImage
  cachedInitialBodyBg = Boolean(bg && bg !== "none")
  if (hadHideClass) {
    document.documentElement.classList.add("cfsm-hide-bg")
  }
  return cachedInitialBodyBg
}

function computeSnapshot(): BackgroundSnapshot {
  if (typeof window === "undefined") {
    return { desktopRaw: "", mobileRaw: "", hasBodyBg: false, hidden: false }
  }

  const hidden = safeStorageGet(BG_HIDDEN_SESSION_KEY, "session") === "1"
  const savedDesktop = sanitizeSafeUrl(safeStorageGet("savedBackgroundImage", "session"), { allowHash: false })

  const opts = window.__cfsmThemeOptions
  const desktopRaw =
    sanitizeSafeUrl(opts?.custom_background_image, { allowHash: false }) ||
    sanitizeSafeUrl(window.CustomBackgroundImage, { allowHash: false }) ||
    savedDesktop
  const mobileRaw =
    sanitizeSafeUrl(opts?.custom_mobile_background_image, { allowHash: false }) ||
    sanitizeSafeUrl(window.CustomMobileBackgroundImage, { allowHash: false })

  const hasBodyBg = detectStaticBodyBackground()

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("cfsm-hide-bg", hidden)
  }
  window.CustomBackgroundImage = hidden ? "" : desktopRaw

  return {
    desktopRaw,
    mobileRaw,
    hasBodyBg,
    hidden,
  }
}

function refreshAndNotify() {
  const next = computeSnapshot()
  cachedSnapshot = next
  subscribers.forEach((fn) => fn(next))
}

function ensureGlobalListener() {
  if (windowListenerBound || typeof window === "undefined") return
  windowListenerBound = true
  window.addEventListener(BACKGROUND_CHANGE_EVENT, refreshAndNotify)
}

function cleanupGlobalListenerIfIdle() {
  if (!windowListenerBound || subscribers.size > 0 || typeof window === "undefined") return
  windowListenerBound = false
  window.removeEventListener(BACKGROUND_CHANGE_EVENT, refreshAndNotify)
}

export function useBackground() {
  const [snapshot, setSnapshot] = useState<BackgroundSnapshot>(() => cachedSnapshot ?? computeSnapshot())

  useEffect(() => {
    subscribers.add(setSnapshot)
    ensureGlobalListener()
    refreshAndNotify()
    return () => {
      subscribers.delete(setSnapshot)
      cleanupGlobalListenerIfIdle()
    }
  }, [])

  const updateBackground = useCallback((newBackground: string | undefined) => {
    const safe = sanitizeSafeUrl(newBackground, { allowHash: false })
    if (safe) {
      safeStorageRemove(BG_HIDDEN_SESSION_KEY, "session")
      safeStorageSet("savedBackgroundImage", safe, "session")
    } else {
      safeStorageSet(BG_HIDDEN_SESSION_KEY, "1", "session")
    }
    window.CustomBackgroundImage = safe
    window.dispatchEvent(new Event(BACKGROUND_CHANGE_EVENT))
  }, [])

  const toggleBackground = useCallback(() => {
    const current = cachedSnapshot ?? computeSnapshot()
    const nextHidden = !current.hidden
    if (nextHidden) {
      if (current.desktopRaw) {
        safeStorageSet("savedBackgroundImage", current.desktopRaw, "session")
      }
      safeStorageSet(BG_HIDDEN_SESSION_KEY, "1", "session")
    } else {
      safeStorageRemove(BG_HIDDEN_SESSION_KEY, "session")
    }
    window.CustomBackgroundImage = nextHidden ? "" : current.desktopRaw
    window.dispatchEvent(new Event(BACKGROUND_CHANGE_EVENT))
  }, [])

  const hasConfiguredBackground = Boolean(snapshot.desktopRaw || snapshot.mobileRaw || snapshot.hasBodyBg)
  const hasActiveBackground = !snapshot.hidden && hasConfiguredBackground

  return {
    backgroundImage: snapshot.hidden ? undefined : snapshot.desktopRaw || undefined,
    mobileBackgroundImage: snapshot.hidden ? undefined : snapshot.mobileRaw || undefined,
    isBackgroundHidden: snapshot.hidden,
    hasConfiguredBackground,
    hasActiveBackground,
    updateBackground,
    toggleBackground,
  }
}
