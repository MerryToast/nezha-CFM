import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useBackground } from "@/hooks/use-background"
import { cn } from "@/lib/utils"
import React from "react"
import { useTranslation } from "react-i18next"

import { Separator } from "./ui/separator"

export interface LatencyBucket {
  ts: number
  latency: number | null
  loss: number | null
  carrierDetails: Array<{
    key: string
    label: string
    latency: number | null
    loss: number | null
  }>
}

interface ServiceTrackerClientProps {
  buckets: LatencyBucket[]
  className?: string
  title?: string
  avgLoss?: number | null
  avgDelay?: number | null
  windowHours?: number
  onClick?: () => void
}

export const ServiceTrackerClient: React.FC<ServiceTrackerClientProps> = ({
  buckets,
  className,
  title,
  avgLoss,
  avgDelay,
  windowHours = 2,
  onClick,
}) => {
  const { t } = useTranslation()
  const { hasActiveBackground: customBackgroundImage } = useBackground()

  const getLossTextColor = (loss: number | null | undefined) => {
    if (loss === null || loss === undefined) return "text-muted-foreground"
    if (loss <= 1) return "text-emerald-500"
    if (loss < 10) return "text-amber-500"
    return "text-rose-500"
  }

  const getDelayColor = (delay: number | null | undefined) => {
    if (delay === null || delay === undefined) return "text-rose-500"
    if (delay < 80) return "text-emerald-500"
    if (delay < 180) return "text-amber-500"
    return "text-rose-500"
  }

  const getStatusDotColor = (delay: number | null | undefined, loss: number | null | undefined) => {
    if (delay === null || delay === undefined || (loss !== null && loss !== undefined && loss >= 50)) return "bg-rose-500"
    if (delay < 120 && (loss ?? 0) < 5) return "bg-emerald-500"
    return "bg-amber-500"
  }

  const getBucketBarColor = (bucket: LatencyBucket) => {
    if (bucket.latency === null || (bucket.loss !== null && bucket.loss >= 100)) {
      return "bg-gradient-to-b from-red-500/80 to-red-600/90 shadow-[0_1px_2px_theme(colors.red.600/30%)]"
    }
    if (bucket.latency < 100 && (bucket.loss ?? 0) < 5) {
      return "bg-gradient-to-b from-green-500/90 to-green-600 shadow-[0_1px_2px_theme(colors.green.600/30%)]"
    }
    return "bg-gradient-to-b from-amber-400/90 to-amber-500 shadow-[0_1px_2px_theme(colors.amber.500/30%)]"
  }

  const formatTimeShort = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full space-y-3 bg-white px-4 py-4 rounded-lg border bg-card text-card-foreground shadow-lg shadow-neutral-200/40 dark:shadow-none transition-colors",
        onClick && "cursor-pointer hover:bg-accent/40",
        className,
        {
          "bg-card/70": Boolean(customBackgroundImage),
        },
      )}
    >
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("w-2.5 h-2.5 shrink-0 rounded-full transition-colors", getStatusDotColor(avgDelay, avgLoss))} />
          <span className="font-medium text-sm truncate">{title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 tabular-nums">
          <span className={cn("font-medium text-sm transition-colors", getDelayColor(avgDelay))}>
            {avgDelay !== null && avgDelay !== undefined ? `${avgDelay.toFixed(0)}ms` : t("monitor.timeout", "Timeout")}
          </span>
          <Separator className="h-4" orientation="vertical" />
          <span className={cn("font-medium text-sm transition-colors", getLossTextColor(avgLoss))}>
            {avgLoss !== null && avgLoss !== undefined ? `${avgLoss.toFixed(1)}% ${t("monitor.lossShort", "loss")}` : "--"}
          </span>
        </div>
      </div>

      <div className="flex gap-[3px] bg-muted/30 p-1 rounded-lg">
        {buckets.map((bucket, index) => (
          <TooltipProvider delayDuration={50} key={`${bucket.ts}-${index}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "relative flex-1 h-7 rounded-[4px] transition-all duration-200 cursor-help",
                    "before:absolute before:inset-0 before:rounded-[4px] before:opacity-0 hover:before:opacity-100 before:bg-white/10 before:transition-opacity",
                    "after:absolute after:inset-0 after:rounded-[4px] after:shadow-[inset_0_1px_theme(colors.white/10%)]",
                    getBucketBarColor(bucket),
                  )}
                />
              </TooltipTrigger>
              <TooltipContent className="p-0 overflow-hidden">
                <div className="px-3 py-2 bg-popover min-w-[160px]">
                  <p className="font-medium text-xs mb-1.5">{new Date(bucket.ts).toLocaleString()}</p>
                  <div className="space-y-1">
                    {bucket.carrierDetails.map((c) => (
                      <div key={c.key} className="flex items-center justify-between gap-3 text-xs tabular-nums">
                        <span className="text-muted-foreground">{c.label}:</span>
                        <span className={cn("font-medium", getDelayColor(c.latency))}>
                          {c.latency !== null ? `${c.latency.toFixed(1)}ms` : t("monitor.timeout", "Timeout")}
                          {c.loss !== null ? ` (${c.loss.toFixed(0)}%)` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      <div className="flex justify-between text-xs text-stone-500 dark:text-stone-400 tabular-nums">
        <span>
          {buckets.length > 0 ? formatTimeShort(buckets[0].ts) : `${windowHours}h`}
        </span>
        <span>
          {buckets.length > 0 ? formatTimeShort(buckets[buckets.length - 1].ts) : t("serviceTracker.today")}
        </span>
      </div>
    </div>
  )
}

export default ServiceTrackerClient
