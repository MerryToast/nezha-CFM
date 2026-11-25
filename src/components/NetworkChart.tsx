import { getAdminEntryUrl } from "@/api/cfsm-client"
import NetworkChartLoading from "@/components/NetworkChartLoading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useBackground } from "@/hooks/use-background"
import { useCfsm } from "@/hooks/use-cfsm"
import { DETAIL_TIME_OPTIONS } from "@/hooks/use-server-detail"
import { isDisabledProbeMetric, normalizeProbeMetric, normalizeTimestampMs } from "@/lib/cfsm-normalizer"
import { cn, formatTime } from "@/lib/utils"
import { CfsmHistoryRow, ProbeMetricValue } from "@/types/cfsm"
import { NezhaServer } from "@/types/nezha-api"
import dayjs from "dayjs"
import { Lock } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

type ProbeKey = "ct" | "cu" | "cm" | "bd" | "node_1" | "node_2" | "node_3" | "node_4"

const PROBE_KEYS: ProbeKey[] = ["ct", "cu", "cm", "bd", "node_1", "node_2", "node_3", "node_4"]

interface ChannelMeta {
  key: ProbeKey
  label: string
  color: string
  latestPing: ProbeMetricValue
  avgLoss: number | null
}

interface ProbeTimelinePoint {
  created_at: number
  [key: string]: number | string | null
}

interface NetworkChartProps {
  server: NezhaServer | null
  history: CfsmHistoryRow[]
  hours: number
  onHoursChange: (hours: number) => void
  historyLoading: boolean
  historyError: string | null
  historyAuthRequired: boolean
  show?: boolean
}

function getMedian(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function smoothWindowValue(values: number[]): number | null {
  if (values.length === 0) return null
  const median = getMedian(values)
  const deviations = values.map((v) => Math.abs(v - median))
  const mad = getMedian(deviations)
  const q75 = [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.75)]
  const q25 = [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.25)]
  const iqr = q75 - q25
  const threshold = Math.max(mad * 1.4826, iqr * 0.75)

  const validValues = values.filter(
    (v) => Math.abs(v - median) <= 3.0 * threshold && v <= median * 2.5,
  )
  if (validValues.length === 0) return median
  return validValues.reduce((sum, val) => sum + val, 0) / validValues.length
}

function formatAxisLabel(ts: number, hours: number): string {
  if (!ts) return ""
  if (hours <= 24) return dayjs(ts).format("HH:mm")
  return dayjs(ts).format("MM-DD HH:mm")
}

export function NetworkChart({
  server,
  history,
  hours,
  onHoursChange,
  historyLoading,
  historyError,
  historyAuthRequired,
  show = true,
}: NetworkChartProps) {
  const { t } = useTranslation()
  const { config, sysConfig, themeOptions } = useCfsm()
  const { hasActiveBackground: customBackgroundImage } = useBackground()

  const forcePeakCut =
    themeOptions?.force_peak_cut_enabled ??
    (typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>).ForcePeakCutEnabled === true)

  const [activeCharts, setActiveCharts] = useState<ProbeKey[]>([])
  const [isPeakEnabled, setIsPeakEnabled] = useState<boolean>(forcePeakCut)

  useEffect(() => {
    setIsPeakEnabled(forcePeakCut)
  }, [forcePeakCut])

  const serverUid = server?.uid || server?.id || ""

  useEffect(() => {
    setActiveCharts([])
  }, [serverUid])

  const resolvedChannelLabel = useCallback(
    (key: ProbeKey): string => {
      const sCfg = server?.sysConfig || sysConfig || config
      switch (key) {
        case "ct":
          return sCfg?.custom_ct_name || config?.custom_ct_name || t("monitor.ct", "电信")
        case "cu":
          return sCfg?.custom_cu_name || config?.custom_cu_name || t("monitor.cu", "联通")
        case "cm":
          return sCfg?.custom_cm_name || config?.custom_cm_name || t("monitor.cm", "移动")
        case "bd":
          return sCfg?.custom_bd_name || config?.custom_bd_name || t("monitor.bd", "广电")
        case "node_1":
          return sCfg?.node_1_name || config?.node_1_name || t("monitor.node1", "Node 1")
        case "node_2":
          return sCfg?.node_2_name || config?.node_2_name || t("monitor.node2", "Node 2")
        case "node_3":
          return sCfg?.node_3_name || config?.node_3_name || t("monitor.node3", "Node 3")
        case "node_4":
          return sCfg?.node_4_name || config?.node_4_name || t("monitor.node4", "Node 4")
      }
    },
    [server?.sysConfig, sysConfig, config, t],
  )

  const combinedRows = useMemo(() => {
    const byTs = new Map<number, CfsmHistoryRow>()
    const cutoff = Date.now() - hours * 3600_000 - 60_000

    for (const row of history) {
      const ts = normalizeTimestampMs(row.timestamp ?? row.last_updated ?? row.last_time, 0)
      if (ts <= 0) continue
      if (hours > 0 && ts < cutoff) continue
      const hasProbeObservation = PROBE_KEYS.some((key) => {
        const p = normalizeProbeMetric(row[`ping_${key}` as keyof CfsmHistoryRow])
        const l = normalizeProbeMetric(row[`loss_${key}` as keyof CfsmHistoryRow])
        return !isDisabledProbeMetric(p) || !isDisabledProbeMetric(l)
      })
      if (hasProbeObservation) {
        byTs.set(ts, { ...row, timestamp: ts })
      }
    }

    if (byTs.size === 0 && server) {
      const hasServerProbe = PROBE_KEYS.some((key) => {
        const p = normalizeProbeMetric(server[`ping_${key}` as keyof NezhaServer])
        const l = normalizeProbeMetric(server[`loss_${key}` as keyof NezhaServer])
        return !isDisabledProbeMetric(p) || !isDisabledProbeMetric(l)
      })
      if (hasServerProbe) {
        const ts = normalizeTimestampMs(server.last_updated, Date.now())
        byTs.set(ts, {
          timestamp: ts,
          ping_ct: server.ping_ct,
          ping_cu: server.ping_cu,
          ping_cm: server.ping_cm,
          ping_bd: server.ping_bd,
          ping_node_1: server.ping_node_1,
          ping_node_2: server.ping_node_2,
          ping_node_3: server.ping_node_3,
          ping_node_4: server.ping_node_4,
          loss_ct: server.loss_ct,
          loss_cu: server.loss_cu,
          loss_cm: server.loss_cm,
          loss_bd: server.loss_bd,
          loss_node_1: server.loss_node_1,
          loss_node_2: server.loss_node_2,
          loss_node_3: server.loss_node_3,
          loss_node_4: server.loss_node_4,
        })
      }
    }

    const sorted = Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp)
    if (sorted.length > 600) {
      const step = Math.ceil(sorted.length / 600)
      return sorted.filter((_, idx) => idx % step === 0 || idx === sorted.length - 1)
    }
    return sorted
  }, [history, server, hours])

  const channels = useMemo<ChannelMeta[]>(() => {
    const result: ChannelMeta[] = []
    let colorIdx = 0
    const latestRowTs = combinedRows.length > 0 ? combinedRows[combinedRows.length - 1].timestamp : 0

    for (const key of PROBE_KEYS) {
      const pingField = `ping_${key}` as keyof CfsmHistoryRow
      const lossField = `loss_${key}` as keyof CfsmHistoryRow

      // 3-state rule: visible if ANY row or live server has non-false ping metric (number >= 0 or null timeout)
      const serverPing = server ? normalizeProbeMetric(server[pingField as keyof NezhaServer]) : false
      let anyEnabled = !isDisabledProbeMetric(serverPing)
      let latestPing: ProbeMetricValue = !isDisabledProbeMetric(serverPing) ? serverPing : false
      let lossSum = 0
      let lossCount = 0

      for (const row of combinedRows) {
        const p = normalizeProbeMetric(row[pingField])
        if (!isDisabledProbeMetric(p)) {
          anyEnabled = true
          latestPing = p
        }
        // Only finite numeric loss observations (0..100) count toward avgLoss; loss=null means no sample
        const l = normalizeProbeMetric(row[lossField])
        if (typeof l === "number") {
          lossSum += l
          lossCount += 1
        }
      }

      if (!isDisabledProbeMetric(serverPing) && (server?.last_updated ?? 0) >= latestRowTs) {
        latestPing = serverPing
      }

      if (!anyEnabled) continue

      const color = `hsl(var(--chart-${(colorIdx % 10) + 1}))`
      colorIdx += 1

      result.push({
        key,
        label: resolvedChannelLabel(key),
        color,
        latestPing,
        avgLoss: lossCount > 0 ? lossSum / lossCount : null,
      })
    }

    return result
  }, [combinedRows, server, resolvedChannelLabel])

  const formattedPoints = useMemo<ProbeTimelinePoint[]>(() => {
    return combinedRows.map((row) => {
      const item: ProbeTimelinePoint = {
        created_at: row.timestamp,
      }
      for (const ch of channels) {
        const rawPing = normalizeProbeMetric(row[`ping_${ch.key}` as keyof CfsmHistoryRow])
        const rawLoss = normalizeProbeMetric(row[`loss_${ch.key}` as keyof CfsmHistoryRow])

        item[ch.key] = typeof rawPing === "number" ? rawPing : null
        item[`state_${ch.key}`] =
          typeof rawPing === "number" ? "ok" : rawPing === null ? "timeout" : "unsampled"
        item[`loss_${ch.key}`] = typeof rawLoss === "number" ? rawLoss : null
      }
      return item
    })
  }, [combinedRows, channels])

  const processedData = useMemo<ProbeTimelinePoint[]>(() => {
    if (!isPeakEnabled || formattedPoints.length < 3) {
      return formattedPoints
    }
    const windowSize = 11
    const alpha = 0.3
    const ewmaHistory: Record<string, number> = {}

    const keysToProcess = activeCharts.length > 0 ? activeCharts : channels.map((c) => c.key)

    return formattedPoints.map((point, index) => {
      if (index < windowSize - 1) return point
      const windowSlice = formattedPoints.slice(index - windowSize + 1, index + 1)
      const smoothed: ProbeTimelinePoint = { ...point }

      for (const key of keysToProcess) {
        // Keep null timeout gaps untouched rather than interpolating away outages
        if (point[key] === null) continue
        const values = windowSlice
          .map((w) => w[key])
          .filter((v): v is number => typeof v === "number" && v >= 0)
        if (values.length === 0) continue

        const processed = smoothWindowValue(values)
        if (processed !== null) {
          ewmaHistory[key] =
            ewmaHistory[key] === undefined
              ? processed
              : alpha * processed + (1 - alpha) * ewmaHistory[key]
          smoothed[key] = Number(ewmaHistory[key].toFixed(2))
        }
      }
      return smoothed
    })
  }, [isPeakEnabled, formattedPoints, activeCharts, channels])

  const handleButtonClick = useCallback((key: ProbeKey) => {
    setActiveCharts((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    )
  }, [])

  const clearAllSelections = useCallback(() => {
    setActiveCharts([])
  }, [])

  if (!show) return null

  if (!server || (historyLoading && formattedPoints.length === 0)) {
    return <NetworkChartLoading />
  }

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <p className="text-sm font-medium text-muted-foreground">
          {t("monitor.noData", "该服务器未配置延迟检测")}
        </p>
        {historyAuthRequired && (
          <a
            href={getAdminEntryUrl(server.apiIndex)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted transition-colors"
          >
            <Lock className="size-3" />
            <span>{t("serverDetail.loginHistoryPrompt", "登录后台查看完整历史")}</span>
          </a>
        )}
      </div>
    )
  }

  const chartConfig = channels.reduce((acc, ch) => {
    acc[ch.key] = { label: ch.label, color: ch.color }
    return acc
  }, {} as ChartConfig)

  const selectedChannels =
    activeCharts.length > 0
      ? channels.filter((c) => activeCharts.includes(c.key))
      : channels

  const singleSelected = activeCharts.length === 1 ? selectedChannels[0] : null

  return (
    <Card
      className={cn({
        "bg-card/70 backdrop-blur-sm": customBackgroundImage,
      })}
    >
      <CardHeader className="flex flex-col items-stretch space-y-0 p-0 sm:flex-row">
        <div className="flex flex-none flex-col justify-center gap-1 border-b px-6 py-4">
          <CardTitle className="flex flex-none items-center gap-0.5 text-md">{server.name}</CardTitle>
          <CardDescription className="text-xs">
            {channels.length} {t("monitor.monitorCount")}
            {historyError ? ` · ${historyError}` : ""}
          </CardDescription>
          <div className="flex items-center mt-0.5 space-x-3">
            <Select value={String(hours)} onValueChange={(v) => onHoursChange(Number(v))}>
              <SelectTrigger className="w-[78px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DETAIL_TIME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.label} value={String(opt.hours)} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center space-x-2">
              <Switch id="Peak" checked={isPeakEnabled} onCheckedChange={setIsPeakEnabled} />
              <Label className="text-xs" htmlFor="Peak">
                Peak cut
              </Label>
            </div>
          </div>
          {historyAuthRequired && (
            <a
              href={getAdminEntryUrl(server.apiIndex)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Lock className="size-3" />
              <span>{t("serverDetail.loginHistoryPrompt", "登录后台查看完整历史")}</span>
            </a>
          )}
        </div>

        <div className="flex flex-wrap w-full">
          {channels.map((ch) => (
            <button
              key={ch.key}
              type="button"
              data-active={activeCharts.includes(ch.key)}
              className="relative z-30 flex cursor-pointer grow basis-0 flex-col justify-center gap-1 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 text-left data-[active=true]:bg-muted/50 sm:border-l sm:border-t-0 sm:px-6 transition-colors"
              onClick={() => handleButtonClick(ch.key)}
            >
              <span className="whitespace-nowrap text-xs text-muted-foreground flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: ch.color }}
                />
                {ch.label}
              </span>
              <div className="flex flex-col gap-0.5 tabular-nums">
                {ch.latestPing === null ? (
                  <span className="text-md font-bold leading-none sm:text-lg text-rose-500">
                    {t("monitor.timeout", "Timeout")}
                  </span>
                ) : typeof ch.latestPing === "number" ? (
                  <span className="text-md font-bold leading-none sm:text-lg">
                    {ch.latestPing.toFixed(1)}ms
                  </span>
                ) : (
                  <span className="text-md font-bold leading-none sm:text-lg text-muted-foreground">
                    --
                  </span>
                )}
                {ch.avgLoss !== null && (
                  <span className="text-xs text-muted-foreground">
                    {ch.avgLoss.toFixed(2)}% {t("monitor.avgLoss", "avg loss")}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pr-2 pl-0 py-4 sm:pt-6 sm:pb-6 sm:pr-6 sm:pl-2">
        <div className="relative">
          {activeCharts.length > 0 && (
            <button
              type="button"
              className="absolute -top-2 right-1 z-10 text-xs px-2 py-1 bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-sm rounded-[5px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={clearAllSelections}
            >
              {t("monitor.clearSelections", "Clear")} ({activeCharts.length})
            </button>
          )}
          <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
            <ComposedChart accessibilityLayer data={processedData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="created_at"
                tickLine
                tickSize={3}
                axisLine={false}
                tickMargin={8}
                minTickGap={60}
                tickFormatter={(value) => formatAxisLabel(Number(value), hours)}
              />
              <YAxis
                yAxisId="delay"
                tickLine={false}
                axisLine={false}
                tickMargin={15}
                minTickGap={20}
                tickFormatter={(value) => `${value}ms`}
              />
              {singleSelected && (
                <YAxis
                  yAxisId="packet-loss"
                  orientation="right"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={15}
                  minTickGap={20}
                  tickFormatter={(value) => `${value}%`}
                />
              )}
              <ChartTooltip
                isAnimationActive={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as ProbeTimelinePoint
                  return (
                    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm tabular-nums space-y-1">
                      <div className="font-medium text-foreground">{formatTime(row.created_at)}</div>
                      {selectedChannels.map((ch) => {
                        const pingVal = row[ch.key]
                        const pingState = row[`state_${ch.key}`]
                        const lossVal = row[`loss_${ch.key}`]
                        return (
                          <div key={ch.key} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span
                                className="inline-block size-2 rounded-full"
                                style={{ backgroundColor: ch.color }}
                              />
                              {ch.label}
                            </span>
                            <span className="font-medium text-foreground">
                              {pingState === "timeout" ? (
                                <span className="text-rose-500">{t("monitor.timeout", "Timeout")}</span>
                              ) : pingState === "unsampled" || pingVal === null || pingVal === undefined ? (
                                <span className="text-muted-foreground">--</span>
                              ) : (
                                `${Number(pingVal).toFixed(1)}ms`
                              )}
                              {typeof lossVal === "number" ? ` (${Number(lossVal).toFixed(1)}%)` : ""}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                }}
              />
              {singleSelected && (
                <Area
                  isAnimationActive={false}
                  dataKey={`loss_${singleSelected.key}`}
                  stroke="none"
                  fill="hsl(45, 100%, 60%)"
                  fillOpacity={0.3}
                  yAxisId="packet-loss"
                  connectNulls={false}
                />
              )}
              {selectedChannels.map((ch) => (
                <Line
                  key={ch.key}
                  isAnimationActive={false}
                  strokeWidth={1.5}
                  type="linear"
                  dot={false}
                  dataKey={ch.key}
                  stroke={ch.color}
                  name={ch.label}
                  yAxisId="delay"
                  connectNulls={false}
                />
              ))}
              {selectedChannels.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            </ComposedChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}
