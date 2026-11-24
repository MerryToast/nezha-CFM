import { normalizeTrafficCalcType } from "@/lib/cfsm-normalizer"
import { formatBytes } from "@/lib/format"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface TrafficBarProps {
  used: number
  limit: number
  resetDay?: number
  limitType: string
}

const tickSubscribers = new Set<() => void>()
let sharedTickTimer: ReturnType<typeof setInterval> | null = null

function subscribeTrafficBarTick(cb: () => void): () => void {
  tickSubscribers.add(cb)
  if (sharedTickTimer === null) {
    sharedTickTimer = setInterval(() => {
      tickSubscribers.forEach((fn) => fn())
    }, 3000)
  }
  return () => {
    tickSubscribers.delete(cb)
    if (tickSubscribers.size === 0 && sharedTickTimer !== null) {
      clearInterval(sharedTickTimer)
      sharedTickTimer = null
    }
  }
}

function getMonthlyResetDate(now: Date, day: number): Date {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return new Date(now.getFullYear(), now.getMonth(), Math.min(day, lastDay))
}

function calcResetDays(resetDay: number | undefined, dayUnit: string): string {
  if (!resetDay || resetDay < 1 || resetDay > 31) return "N/A"

  const now = new Date()
  let reset = getMonthlyResetDate(now, resetDay)
  if (reset <= now) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    reset = getMonthlyResetDate(nextMonth, resetDay)
  }

  return `${Math.ceil((reset.getTime() - now.getTime()) / 86400000)}${dayUnit}`
}

function getColor(percent: number): string {
  return `hsl(${(100 - percent) * 1.4}, 70%, 50%)`
}

export default function TrafficBar({ used, limit, resetDay, limitType }: TrafficBarProps) {
  const { t } = useTranslation()
  const [infoIndex, setInfoIndex] = useState(0)
  const [fading, setFading] = useState(false)
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const win = window as unknown as Record<string, unknown>
  const showPercent = win.TrafficBarShowPercent !== false
  const showResetDay = win.TrafficBarShowResetDay !== false
  const showBillingMode = win.TrafficBarShowBillingMode !== false

  const safeUsed = Number.isFinite(used) && used > 0 ? used : 0
  const percent = limit > 0 ? Math.max(0, Math.min(100, (safeUsed / limit) * 100)) : 0
  const percentStr = percent.toFixed(2)
  const usedFormatted = formatBytes(safeUsed)
  const limitFormatted = formatBytes(limit)
  const resetDays = calcResetDays(resetDay, t("trafficBar.dayUnit", "日"))

  const getTypeLabel = (type: string): string => {
    switch (normalizeTrafficCalcType(type)) {
      case "max":
        return t("trafficBar.modeMax", "较大值")
      case "min":
        return t("trafficBar.modeMin", "较小值")
      case "up":
        return t("trafficBar.modeUp", "单向(上行)")
      case "down":
        return t("trafficBar.modeDown", "单向(下行)")
      default:
        return t("trafficBar.modeSum", "双向")
    }
  }

  const infoItems: string[] = []
  if (showPercent) infoItems.push(`${percentStr}%`)
  if (showResetDay) infoItems.push(`${t("trafficBar.resetPrefix", "流量重置")}: ${resetDays}`)
  if (showBillingMode) infoItems.push(`${t("trafficBar.billingPrefix", "计费")}: ${getTypeLabel(limitType)}`)

  const shouldCycle = infoItems.length > 1

  useEffect(() => {
    if (!shouldCycle) {
      if (fadeTimeoutRef.current !== null) {
        clearTimeout(fadeTimeoutRef.current)
        fadeTimeoutRef.current = null
      }
      setFading(false)
      return
    }

    const unsubscribe = subscribeTrafficBarTick(() => {
      setFading(true)
      if (fadeTimeoutRef.current !== null) {
        clearTimeout(fadeTimeoutRef.current)
      }
      fadeTimeoutRef.current = setTimeout(() => {
        fadeTimeoutRef.current = null
        setInfoIndex((prev) => prev + 1)
        setFading(false)
      }, 500)
    })

    return () => {
      unsubscribe()
      if (fadeTimeoutRef.current !== null) {
        clearTimeout(fadeTimeoutRef.current)
        fadeTimeoutRef.current = null
      }
    }
  }, [shouldCycle])

  if (limit <= 0) return null

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="text-[10px] font-medium text-neutral-800 dark:text-neutral-200">{usedFormatted}</span>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">/ {limitFormatted}</span>
        </div>
        {infoItems.length > 0 &&
          (shouldCycle ? (
            <div
              className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 transition-opacity duration-500 tabular-nums"
              style={{ opacity: fading ? 0 : 1 }}
            >
              {infoItems[infoIndex % infoItems.length]}
            </div>
          ) : (
            <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 tabular-nums">
              {infoItems[0]}
            </span>
          ))}
      </div>
      <div className="relative h-1.5 w-full">
        <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800 rounded-full" />
        <div
          className="absolute inset-0 rounded-full transition-all duration-300"
          style={{
            width: `${percentStr}%`,
            backgroundColor: getColor(percent),
          }}
        />
      </div>
    </div>
  )
}
