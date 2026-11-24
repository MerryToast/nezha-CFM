import { sanitizeSafeUrl } from "@/lib/security"
import { useEffect, useState } from "react"

declare global {
  interface Window {
    CustomBackgroundImage: string
    CustomMobileBackgroundImage: string
    ForceShowServices: boolean
    ForceCardInline: boolean
    ForceShowMap: boolean
    ForcePeakCutEnabled: boolean
  }
}

const BACKGROUND_CHANGE_EVENT = "backgroundChange"

export function useBackground() {
  const [backgroundImage, setBackgroundImage] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined
    const candidate =
      sanitizeSafeUrl(window.CustomBackgroundImage, { allowHash: false }) ||
      sanitizeSafeUrl(sessionStorage.getItem("savedBackgroundImage"), { allowHash: false })
    return candidate || undefined
  })

  useEffect(() => {
    const syncBackground = () => {
      const winBg = sanitizeSafeUrl(window.CustomBackgroundImage, { allowHash: false })
      if (winBg) {
        setBackgroundImage(winBg)
        return
      }
      const savedImage = sanitizeSafeUrl(sessionStorage.getItem("savedBackgroundImage"), { allowHash: false })
      if (savedImage) {
        window.CustomBackgroundImage = savedImage
        setBackgroundImage(savedImage)
        return
      }
      setBackgroundImage(undefined)
    }

    syncBackground()
    window.addEventListener(BACKGROUND_CHANGE_EVENT, syncBackground)
    return () => {
      window.removeEventListener(BACKGROUND_CHANGE_EVENT, syncBackground)
    }
  }, [])

  const updateBackground = (newBackground: string | undefined) => {
    window.CustomBackgroundImage = sanitizeSafeUrl(newBackground, { allowHash: false })
    window.dispatchEvent(new Event(BACKGROUND_CHANGE_EVENT))
  }

  return { backgroundImage, updateBackground }
}
