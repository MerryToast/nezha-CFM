import { getWorkerStaticAssetUrl } from "@/api/cfsm-client"
import { useCfsm } from "@/hooks/use-cfsm"
import { cn } from "@/lib/utils"
import getUnicodeFlagIcon from "country-flag-icons/unicode"
import { useEffect, useState } from "react"

let cachedEmojiFlagSupport: boolean | null = null

function detectEmojiFlagSupport(): boolean {
  if (cachedEmojiFlagSupport !== null) return cachedEmojiFlagSupport
  if (typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      cachedEmojiFlagSupport = false
      return false
    }
    ctx.fillStyle = "#000"
    ctx.textBaseline = "top"
    ctx.font = "32px Arial"
    ctx.fillText("🇺🇸", 0, 0)
    cachedEmojiFlagSupport = ctx.getImageData(16, 16, 1, 1).data[3] !== 0
  } catch {
    cachedEmojiFlagSupport = false
  }
  return cachedEmojiFlagSupport
}

function safeUnicodeFlagIcon(code: string): string | null {
  try {
    const icon = getUnicodeFlagIcon(code)
    return icon || null
  } catch {
    return null
  }
}

export default function ServerFlag({
  country_code,
  apiIndex = 0,
  className,
}: {
  country_code: string
  apiIndex?: number
  className?: string
}) {
  const { themeOptions } = useCfsm()
  const [imgFailed, setImgFailed] = useState(false)

  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {}
  const forceUseSvgFlag = themeOptions?.force_use_svg_flag === true || win.ForceUseSvgFlag === true
  const rawCode = String(country_code || "").trim()
  const code = rawCode.toLowerCase()
  const isIsoAlpha2 = /^[a-z]{2}$/.test(code) && code !== "xx" && code !== "un"

  useEffect(() => {
    setImgFailed(false)
  }, [code])

  if (!code || code === "xx" || code === "un") return null

  if (!isIsoAlpha2) {
    if (!/^[a-z0-9_-]{1,6}$/i.test(rawCode)) return null
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none bg-muted text-muted-foreground",
          className,
        )}
      >
        {rawCode.toUpperCase()}
      </span>
    )
  }

  if (!forceUseSvgFlag && detectEmojiFlagSupport()) {
    const unicodeFlag = safeUnicodeFlagIcon(code)
    if (unicodeFlag) {
      return <span className={cn("text-[12px] text-muted-foreground leading-none", className)}>{unicodeFlag}</span>
    }
  }

  if (imgFailed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none bg-muted text-muted-foreground",
          className,
        )}
      >
        {code.toUpperCase()}
      </span>
    )
  }

  // Uses CFSM built-in /flags/<code>.svg per theme-develop.md spec (no flag assets bundled into theme)
  return (
    <img
      src={getWorkerStaticAssetUrl(`flags/${code}.svg`, apiIndex)}
      alt={code.toUpperCase()}
      className={cn("h-3 w-4 rounded-[2px] object-cover shrink-0", className)}
      loading="lazy"
      onError={() => setImgFailed(true)}
    />
  )
}
