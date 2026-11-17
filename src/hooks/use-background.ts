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
    return window.CustomBackgroundImage || sessionStorage.getItem("savedBackgroundImage") || undefined
  })

  useEffect(() => {
    const syncBackground = () => {
      if (window.CustomBackgroundImage) {
        setBackgroundImage(window.CustomBackgroundImage)
        return
      }
      const savedImage = sessionStorage.getItem("savedBackgroundImage")
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
    window.CustomBackgroundImage = newBackground || ""
    window.dispatchEvent(new Event(BACKGROUND_CHANGE_EVENT))
  }

  return { backgroundImage, updateBackground }
}
