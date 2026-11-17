import { getWorkerStaticAssetUrl } from "@/api/cfsm-client"
import { cn } from "@/lib/utils"
import getUnicodeFlagIcon from "country-flag-icons/unicode"
import { useEffect, useState } from "react"

export default function ServerFlag({
  country_code,
  apiIndex = 0,
  className,
}: {
  country_code: string
  apiIndex?: number
  className?: string
}) {
  const [supportsEmojiFlags, setSupportsEmojiFlags] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const forceUseSvgFlag = (window as unknown as Record<string, unknown>).ForceUseSvgFlag === true
  const code = String(country_code || "").trim().toLowerCase()

  useEffect(() => {
    setImgFailed(false)
  }, [code])

  useEffect(() => {
    if (forceUseSvgFlag) {
      setSupportsEmojiFlags(false)
      return
    }
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "#000"
    ctx.textBaseline = "top"
    ctx.font = "32px Arial"
    ctx.fillText("🇺🇸", 0, 0)
    const support = ctx.getImageData(16, 16, 1, 1).data[3] !== 0
    setSupportsEmojiFlags(support)
  }, [forceUseSvgFlag])

  if (!code || code === "xx") return null

  if (!forceUseSvgFlag && supportsEmojiFlags) {
    return (
      <span className={cn("text-[12px] text-muted-foreground leading-none", className)}>
        {getUnicodeFlagIcon(code)}
      </span>
    )
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
