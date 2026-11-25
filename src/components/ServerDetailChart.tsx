import { getAdminEntryUrl } from "@/api/cfsm-client"
import { ServerDetailChartLoading } from "@/components/loading/ServerDetailLoading"
import AnimatedCircularProgressBar from "@/components/ui/animated-circular-progress-bar"
import { Card, CardContent } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { useBackground } from "@/hooks/use-background"
import { DETAIL_TIME_OPTIONS } from "@/hooks/use-server-detail"
import {
  isValidDiskIo,
  normalizeTimestampMs,
  parseFiniteNumber,
  parseGpuInfo,
  parseLoadAvg,
  parseMemoryOrDiskToBytes,
} from "@/lib/cfsm-normalizer"
import { formatBytes } from "@/lib/format"
import { cn, formatNezhaInfo, formatTime } from "@/lib/utils"
import { CfsmHistoryRow, DiskIoMetrics, GpuDeviceInfo } from "@/types/cfsm"
import { NezhaServer } from "@/types/nezha-api"
import dayjs from "dayjs"
import { Lock } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

interface ServerDetailChartProps {
  server: NezhaServer | null
  now: number
  history: CfsmHistoryRow[]
  hours: number
  onHoursChange: (hours: number) => void
  historyLoading: boolean
  historyError: string | null
  historyAuthRequired: boolean
}

interface ChartPoint {
  ts: number
  cpu: number | null
  mem: number | null
  swap: number | null
  diskUsage: number | null
  uploadSpeed: number | null
  downloadSpeed: number | null
  tcp: number | null
  udp: number | null
  process: number | null
  load1: number | null
  load5: number | null
  load15: number | null
  diskIo: DiskIoMetrics | null
  gpus: GpuDeviceInfo[]
}

const CHART_SERIES_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

function hasRawMetric(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ""
}

function historyRowToPoint(row: CfsmHistoryRow, fallbackServer: NezhaServer | null): ChartPoint | null {
  const ts = normalizeTimestampMs(row.timestamp ?? row.last_updated ?? row.last_time, 0)
  if (!ts) return null

  const memTotal =
    parseMemoryOrDiskToBytes(row.ram_total) || fallbackServer?.host.mem_total || 0
  const hasMem = hasRawMetric(row.ram_used)
  const memUsed = hasMem ? parseMemoryOrDiskToBytes(row.ram_used) : 0

  const swapTotal =
    parseMemoryOrDiskToBytes(row.swap_total) || fallbackServer?.host.swap_total || 0
  const hasSwap = hasRawMetric(row.swap_used)
  const swapUsed = hasSwap ? parseMemoryOrDiskToBytes(row.swap_used) : 0

  const diskTotal =
    parseMemoryOrDiskToBytes(row.disk_total) || fallbackServer?.host.disk_total || 0
  const hasDisk = hasRawMetric(row.disk_used)
  const diskUsed = hasDisk ? parseMemoryOrDiskToBytes(row.disk_used) : 0

  const rawLoad = row.load_avg ?? row.load
  const hasLoad = hasRawMetric(rawLoad)
  const [load1, load5, load15] = hasLoad ? parseLoadAvg(rawLoad) : [0, 0, 0]
  const diskIo = isValidDiskIo(row.disk) ? row.disk : null
  const gpus = parseGpuInfo(row.gpu_info)

  return {
    ts,
    cpu: hasRawMetric(row.cpu) ? Math.max(0, Math.min(100, parseFiniteNumber(row.cpu, 0))) : null,
    mem: hasMem && memTotal > 0 ? Math.max(0, Math.min(100, (memUsed / memTotal) * 100)) : null,
    swap: hasSwap && swapTotal > 0 ? Math.max(0, Math.min(100, (swapUsed / swapTotal) * 100)) : null,
    diskUsage: hasDisk && diskTotal > 0 ? Math.max(0, Math.min(100, (diskUsed / diskTotal) * 100)) : null,
    uploadSpeed: hasRawMetric(row.net_out_speed) ? Math.max(0, parseFiniteNumber(row.net_out_speed, 0)) : null,
    downloadSpeed: hasRawMetric(row.net_in_speed) ? Math.max(0, parseFiniteNumber(row.net_in_speed, 0)) : null,
    tcp: hasRawMetric(row.tcp_conn) ? Math.max(0, Math.round(parseFiniteNumber(row.tcp_conn, 0))) : null,
    udp: hasRawMetric(row.udp_conn) ? Math.max(0, Math.round(parseFiniteNumber(row.udp_conn, 0))) : null,
    process: hasRawMetric(row.processes) ? Math.max(0, Math.round(parseFiniteNumber(row.processes, 0))) : null,
    load1: hasLoad ? load1 : null,
    load5: hasLoad ? load5 : null,
    load15: hasLoad ? load15 : null,
    diskIo,
    gpus,
  }
}

function serverToPoint(now: number, server: NezhaServer): ChartPoint {
  const info = formatNezhaInfo(now, server)
  return {
    ts: server.sample_timestamp || server.last_updated || now || Date.now(),
    cpu: Math.max(0, Math.min(100, info.cpu)),
    mem: Math.max(0, Math.min(100, info.mem)),
    swap: Math.max(0, Math.min(100, info.swap)),
    diskUsage: Math.max(0, Math.min(100, info.disk_usage_percent)),
    uploadSpeed: Math.max(0, server.state.net_out_speed || 0),
    downloadSpeed: Math.max(0, server.state.net_in_speed || 0),
    tcp: info.tcp,
    udp: info.udp,
    process: info.process,
    load1: server.state.load_1 || 0,
    load5: server.state.load_5 || 0,
    load15: server.state.load_15 || 0,
    diskIo: isValidDiskIo(server.disk) ? server.disk : null,
    gpus: Array.isArray(server.gpu_devices) ? server.gpu_devices : [],
  }
}

function formatXAxisTime(ts: number, hours: number): string {
  if (!ts) return ""
  if (hours <= 1) return dayjs(ts).format("HH:mm:ss")
  if (hours <= 24) return dayjs(ts).format("HH:mm")
  return dayjs(ts).format("MM-DD HH:mm")
}

export default function ServerDetailChart({
  server,
  now,
  history,
  hours,
  onHoursChange,
  historyLoading,
  historyError,
  historyAuthRequired,
}: ServerDetailChartProps) {
  const { t } = useTranslation()
  const { hasActiveBackground: customBackgroundImage } = useBackground()

  const mergedPoints = useMemo<ChartPoint[]>(() => {
    const byTs = new Map<number, ChartPoint>()

    for (const row of history) {
      const pt = historyRowToPoint(row, server)
      if (pt) byTs.set(pt.ts, pt)
    }

    if (byTs.size === 0 && server) {
      const pt = serverToPoint(now, server)
      byTs.set(pt.ts, pt)
    }

    const cutoff = Date.now() - hours * 3600_000 - 60_000
    const sorted = Array.from(byTs.values())
      .filter((pt) => (hours > 0 ? pt.ts >= cutoff || history.length === 0 : true))
      .sort((a, b) => a.ts - b.ts)

    if (sorted.length > 600) {
      const step = Math.ceil(sorted.length / 600)
      return sorted.filter((_, idx) => idx % step === 0 || idx === sorted.length - 1)
    }
    return sorted
  }, [history, server, now, hours])

  const cpuPoints = useMemo(() => mergedPoints.filter((pt) => pt.cpu !== null), [mergedPoints])
  const memPoints = useMemo(() => mergedPoints.filter((pt) => pt.mem !== null || pt.swap !== null), [mergedPoints])
  const diskPoints = useMemo(() => mergedPoints.filter((pt) => pt.diskUsage !== null), [mergedPoints])
  const netPoints = useMemo(
    () => mergedPoints.filter((pt) => pt.uploadSpeed !== null || pt.downloadSpeed !== null),
    [mergedPoints],
  )
  const connPoints = useMemo(() => mergedPoints.filter((pt) => pt.tcp !== null || pt.udp !== null), [mergedPoints])
  const procPoints = useMemo(() => mergedPoints.filter((pt) => pt.process !== null), [mergedPoints])
  const loadPoints = useMemo(() => mergedPoints.filter((pt) => pt.load1 !== null), [mergedPoints])
  const diskIoPoints = useMemo(
    () =>
      mergedPoints
        .filter((pt) => pt.diskIo !== null)
        .map((pt) => ({
          ...pt,
          readBps: pt.diskIo!.read_bps,
          writeBps: pt.diskIo!.write_bps,
        })),
    [mergedPoints],
  )
  const gpuPoints = useMemo(() => mergedPoints.filter((pt) => pt.gpus.length > 0), [mergedPoints])

  const gpuCatalog = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    const addList = (list: GpuDeviceInfo[]) => {
      list.forEach((gpu, idx) => {
        const key = String(gpu.id ?? idx)
        if (!map.has(key)) {
          map.set(key, { id: key, name: gpu.name || `GPU ${idx}` })
        }
      })
    }
    if (server?.gpu_devices) addList(server.gpu_devices)
    for (const pt of mergedPoints) {
      if (pt.gpus.length > 0) addList(pt.gpus)
    }
    return Array.from(map.values())
  }, [server?.gpu_devices, mergedPoints])

  if (!server) {
    return <ServerDetailChartLoading />
  }

  const currentInfo = formatNezhaInfo(now, server)
  const hasDiskIo = isValidDiskIo(server.disk) || mergedPoints.some((pt) => pt.diskIo !== null)

  const cardBgClass = cn({
    "bg-card/70 backdrop-blur-sm": customBackgroundImage,
  })

  return (
    <div className="space-y-3">
      {/* Time Window Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {DETAIL_TIME_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => onHoursChange(opt.hours)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                hours === opt.hours
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {historyLoading && <span>{t("loading", "加载历史数据中...")}</span>}
          {!historyLoading && historyError && <span className="text-amber-500">{historyError}</span>}
          {historyAuthRequired && (
            <a
              href={getAdminEntryUrl(server.apiIndex)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted transition-colors"
            >
              <Lock className="size-3" />
              <span>{t("serverDetail.loginHistoryPrompt", "登录后台查看完整历史")}</span>
            </a>
          )}
        </div>
      </div>

      <section className="grid md:grid-cols-2 lg:grid-cols-3 grid-cols-1 gap-3 server-charts">
        {/* CPU */}
        <MetricCardWrapper
          className={cardBgClass}
          title="CPU"
          rightContent={
            <section className="flex items-center gap-2">
              <p className="text-xs text-end w-12 font-medium tabular-nums">{currentInfo.cpu.toFixed(2)}%</p>
              <AnimatedCircularProgressBar
                className="size-3 text-[0px]"
                max={100}
                min={0}
                value={currentInfo.cpu}
                primaryColor="hsl(var(--chart-1))"
              />
            </section>
          }
        >
          <ChartContainer config={{ cpu: { label: "CPU" } } satisfies ChartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart accessibilityLayer data={cpuPoints} margin={{ top: 12, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={60}
                tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
              />
              <YAxis tickLine={false} axisLine={false} mirror tickMargin={-15} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const pt = payload[0].payload as ChartPoint
                  return (
                    <TooltipBox title={formatTime(pt.ts)}>
                      <div>CPU: {(pt.cpu ?? 0).toFixed(2)}%</div>
                    </TooltipBox>
                  )
                }}
              />
              <Area isAnimationActive={false} dataKey="cpu" type="monotone" fill="hsl(var(--chart-1))" fillOpacity={0.3} stroke="hsl(var(--chart-1))" />
            </AreaChart>
          </ChartContainer>
        </MetricCardWrapper>

        {/* Mem & Swap */}
        <MetricCardWrapper
          className={cardBgClass}
          title={t("serverDetailChart.mem")}
          rightContent={
            <section className="flex flex-col items-end gap-0.5">
              <section className="flex items-center gap-2">
                <p className="text-xs text-end w-12 font-medium tabular-nums">{currentInfo.mem.toFixed(0)}%</p>
                <AnimatedCircularProgressBar
                  className="size-3 text-[0px]"
                  max={100}
                  min={0}
                  value={currentInfo.mem}
                  primaryColor="hsl(var(--chart-8))"
                />
              </section>
              <div className="flex text-[11px] font-medium items-center gap-2 tabular-nums">
                {formatBytes(server.state.mem_used)} / {formatBytes(server.host.mem_total)}
              </div>
            </section>
          }
        >
          <ChartContainer
            config={{ mem: { label: "Mem" }, swap: { label: "Swap" } } satisfies ChartConfig}
            className="aspect-auto h-[130px] w-full"
          >
            <AreaChart accessibilityLayer data={memPoints} margin={{ top: 12, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={60}
                tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
              />
              <YAxis tickLine={false} axisLine={false} mirror tickMargin={-15} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const pt = payload[0].payload as ChartPoint
                  return (
                    <TooltipBox title={formatTime(pt.ts)}>
                      {pt.mem !== null && <div>RAM: {pt.mem.toFixed(1)}%</div>}
                      {server.host.swap_total > 0 && pt.swap !== null && <div>Swap: {pt.swap.toFixed(1)}%</div>}
                    </TooltipBox>
                  )
                }}
              />
              <Area isAnimationActive={false} dataKey="mem" type="monotone" fill="hsl(var(--chart-8))" fillOpacity={0.3} stroke="hsl(var(--chart-8))" />
              {server.host.swap_total > 0 && (
                <Area isAnimationActive={false} dataKey="swap" type="monotone" fill="hsl(var(--chart-10))" fillOpacity={0.25} stroke="hsl(var(--chart-10))" />
              )}
            </AreaChart>
          </ChartContainer>
        </MetricCardWrapper>

        {/* Disk Usage */}
        <MetricCardWrapper
          className={cardBgClass}
          title={t("serverDetailChart.disk")}
          rightContent={
            <section className="flex flex-col items-end gap-0.5">
              <section className="flex items-center gap-2">
                <p className="text-xs text-end w-12 font-medium tabular-nums">{currentInfo.disk_usage_percent.toFixed(0)}%</p>
                <AnimatedCircularProgressBar
                  className="size-3 text-[0px]"
                  max={100}
                  min={0}
                  value={currentInfo.disk_usage_percent}
                  primaryColor="hsl(var(--chart-5))"
                />
              </section>
              <div className="flex text-[11px] font-medium items-center gap-2 tabular-nums">
                {formatBytes(server.state.disk_used)} / {formatBytes(server.host.disk_total)}
              </div>
            </section>
          }
        >
          <ChartContainer config={{ diskUsage: { label: "Disk" } } satisfies ChartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart accessibilityLayer data={diskPoints} margin={{ top: 12, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={60}
                tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
              />
              <YAxis tickLine={false} axisLine={false} mirror tickMargin={-15} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const pt = payload[0].payload as ChartPoint
                  return (
                    <TooltipBox title={formatTime(pt.ts)}>
                      <div>Disk: {(pt.diskUsage ?? 0).toFixed(1)}%</div>
                    </TooltipBox>
                  )
                }}
              />
              <Area isAnimationActive={false} dataKey="diskUsage" type="monotone" fill="hsl(var(--chart-5))" fillOpacity={0.3} stroke="hsl(var(--chart-5))" />
            </AreaChart>
          </ChartContainer>
        </MetricCardWrapper>

        {/* Network Speed */}
        <MetricCardWrapper
          className={cardBgClass}
          title={t("serverDetailChart.network")}
          rightContent={
            <section className="flex items-start gap-2.5 text-[11px] tabular-nums">
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-muted-foreground">{t("serverDetailChart.upload")}</span>
                <span className="font-medium text-rose-500 dark:text-rose-400">
                  ↑ {formatBytes(server.state.net_out_speed)}/s
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-muted-foreground">{t("serverDetailChart.download")}</span>
                <span className="font-medium text-sky-500 dark:text-sky-400">
                  ↓ {formatBytes(server.state.net_in_speed)}/s
                </span>
              </div>
            </section>
          }
        >
          <ChartContainer
            config={{ uploadSpeed: { label: "Upload" }, downloadSpeed: { label: "Download" } } satisfies ChartConfig}
            className="aspect-auto h-[130px] w-full"
          >
            <LineChart accessibilityLayer data={netPoints} margin={{ top: 12, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={60}
                tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                mirror
                tickMargin={-10}
                tickFormatter={(v) => `${formatBytes(Number(v), 0)}/s`}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const pt = payload[0].payload as ChartPoint
                  return (
                    <TooltipBox title={formatTime(pt.ts)}>
                      <div>↑ {formatBytes(pt.uploadSpeed ?? 0)}/s</div>
                      <div>↓ {formatBytes(pt.downloadSpeed ?? 0)}/s</div>
                    </TooltipBox>
                  )
                }}
              />
              <Line isAnimationActive={false} dataKey="uploadSpeed" type="monotone" stroke="hsl(var(--chart-1))" dot={false} />
              <Line isAnimationActive={false} dataKey="downloadSpeed" type="monotone" stroke="hsl(var(--chart-4))" dot={false} />
            </LineChart>
          </ChartContainer>
        </MetricCardWrapper>

        {/* Connections */}
        <MetricCardWrapper
          className={cardBgClass}
          title={t("serverDetailChart.connect")}
          rightContent={
            <section className="flex items-start gap-2.5 text-[11px] tabular-nums">
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-muted-foreground">TCP</span>
                <span className="font-medium">{currentInfo.tcp}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-muted-foreground">UDP</span>
                <span className="font-medium">{currentInfo.udp}</span>
              </div>
            </section>
          }
        >
          <ChartContainer
            config={{ tcp: { label: "TCP" }, udp: { label: "UDP" } } satisfies ChartConfig}
            className="aspect-auto h-[130px] w-full"
          >
            <LineChart accessibilityLayer data={connPoints} margin={{ top: 12, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={60}
                tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
              />
              <YAxis tickLine={false} axisLine={false} mirror tickMargin={-15} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const pt = payload[0].payload as ChartPoint
                  return (
                    <TooltipBox title={formatTime(pt.ts)}>
                      {pt.tcp !== null && <div>TCP: {pt.tcp}</div>}
                      {pt.udp !== null && <div>UDP: {pt.udp}</div>}
                    </TooltipBox>
                  )
                }}
              />
              <Line isAnimationActive={false} dataKey="tcp" type="monotone" stroke="hsl(var(--chart-1))" dot={false} />
              <Line isAnimationActive={false} dataKey="udp" type="monotone" stroke="hsl(var(--chart-4))" dot={false} />
            </LineChart>
          </ChartContainer>
        </MetricCardWrapper>

        {/* Processes */}
        <MetricCardWrapper
          className={cardBgClass}
          title={t("serverDetailChart.process")}
          rightContent={<p className="text-xs font-medium tabular-nums">{currentInfo.process}</p>}
        >
          <ChartContainer config={{ process: { label: "Process" } } satisfies ChartConfig} className="aspect-auto h-[130px] w-full">
            <AreaChart accessibilityLayer data={procPoints} margin={{ top: 12, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={60}
                tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
              />
              <YAxis tickLine={false} axisLine={false} mirror tickMargin={-15} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const pt = payload[0].payload as ChartPoint
                  return (
                    <TooltipBox title={formatTime(pt.ts)}>
                      <div>{t("serverDetailChart.process")}: {pt.process ?? 0}</div>
                    </TooltipBox>
                  )
                }}
              />
              <Area isAnimationActive={false} dataKey="process" type="monotone" fill="hsl(var(--chart-2))" fillOpacity={0.3} stroke="hsl(var(--chart-2))" />
            </AreaChart>
          </ChartContainer>
        </MetricCardWrapper>

        {/* Load Average */}
        <MetricCardWrapper
          className={cardBgClass}
          title={t("serverDetailChart.load", "系统负载")}
          rightContent={
            <p className="text-xs font-medium tabular-nums">
              {currentInfo.load_1} / {currentInfo.load_5} / {currentInfo.load_15}
            </p>
          }
        >
          <ChartContainer
            config={{ load1: { label: "1m" }, load5: { label: "5m" }, load15: { label: "15m" } } satisfies ChartConfig}
            className="aspect-auto h-[130px] w-full"
          >
            <LineChart accessibilityLayer data={loadPoints} margin={{ top: 12, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={60}
                tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
              />
              <YAxis tickLine={false} axisLine={false} mirror tickMargin={-15} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const pt = payload[0].payload as ChartPoint
                  return (
                    <TooltipBox title={formatTime(pt.ts)}>
                      <div>1m: {(pt.load1 ?? 0).toFixed(2)}</div>
                      <div>5m: {(pt.load5 ?? 0).toFixed(2)}</div>
                      <div>15m: {(pt.load15 ?? 0).toFixed(2)}</div>
                    </TooltipBox>
                  )
                }}
              />
              <Line isAnimationActive={false} dataKey="load1" type="monotone" stroke="hsl(var(--chart-1))" dot={false} />
              <Line isAnimationActive={false} dataKey="load5" type="monotone" stroke="hsl(var(--chart-3))" dot={false} />
              <Line isAnimationActive={false} dataKey="load15" type="monotone" stroke="hsl(var(--chart-5))" dot={false} />
            </LineChart>
          </ChartContainer>
        </MetricCardWrapper>

        {/* Conditional Disk IO Chart */}
        {hasDiskIo && (
          <MetricCardWrapper
            className={cardBgClass}
            title={t("serverDetailChart.diskIo", "磁盘 IO")}
            rightContent={
              server.disk && isValidDiskIo(server.disk) ? (
                <section className="flex items-start gap-2.5 text-[11px] tabular-nums">
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-muted-foreground">R</span>
                    <span className="font-medium">{formatBytes(server.disk.read_bps)}/s</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-muted-foreground">W</span>
                    <span className="font-medium">{formatBytes(server.disk.write_bps)}/s</span>
                  </div>
                </section>
              ) : null
            }
          >
            <ChartContainer
              config={{ readBps: { label: "Read" }, writeBps: { label: "Write" } } satisfies ChartConfig}
              className="aspect-auto h-[130px] w-full"
            >
              <LineChart
                accessibilityLayer
                data={diskIoPoints}
                margin={{ top: 12, left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="ts"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={60}
                  tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  mirror
                  tickMargin={-10}
                  tickFormatter={(v) => `${formatBytes(Number(v), 0)}/s`}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const pt = payload[0].payload as ChartPoint & { readBps: number; writeBps: number }
                    return (
                      <TooltipBox title={formatTime(pt.ts)}>
                        <div>Read: {formatBytes(pt.readBps)}/s</div>
                        <div>Write: {formatBytes(pt.writeBps)}/s</div>
                        {pt.diskIo && <div>Util: {pt.diskIo.util.toFixed(1)}%</div>}
                      </TooltipBox>
                    )
                  }}
                />
                <Line isAnimationActive={false} dataKey="readBps" type="monotone" stroke="hsl(var(--chart-2))" dot={false} />
                <Line isAnimationActive={false} dataKey="writeBps" type="monotone" stroke="hsl(var(--chart-5))" dot={false} />
              </LineChart>
            </ChartContainer>
          </MetricCardWrapper>
        )}

        {/* Conditional GPU Chart */}
        {gpuCatalog.length > 0 && (
          <MetricCardWrapper
            className={cardBgClass}
            title="GPU"
            rightContent={
              <div className="text-[11px] font-medium tabular-nums">
                {server.gpu_devices
                  ?.map((g) => (g.info !== null && g.info !== undefined ? `${g.info.toFixed(0)}%` : "N/A"))
                  .join(" / ") || ""}
              </div>
            }
          >
            <ChartContainer
              config={Object.fromEntries(
                gpuCatalog.map((gpu) => [`gpu_${gpu.id}`, { label: gpu.name }]),
              )}
              className="aspect-auto h-[130px] w-full"
            >
              <LineChart
                accessibilityLayer
                data={gpuPoints.map((pt) => {
                  const row: Record<string, number | null> = { ts: pt.ts }
                  gpuCatalog.forEach((gpu, idx) => {
                    const match = pt.gpus.find((item, itemIdx) => String(item.id ?? itemIdx) === gpu.id)
                    row[`gpu_${gpu.id}`] = match && match.info !== null ? match.info : null
                    void idx
                  })
                  return row
                })}
                margin={{ top: 12, left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="ts"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={60}
                  tickFormatter={(v) => formatXAxisTime(Number(v), hours)}
                />
                <YAxis tickLine={false} axisLine={false} mirror tickMargin={-15} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as Record<string, number | null>
                    return (
                      <TooltipBox title={formatTime(Number(row.ts || 0))}>
                        {gpuCatalog.map((gpu) => (
                          <div key={gpu.id}>
                            {gpu.name}: {row[`gpu_${gpu.id}`] !== null && row[`gpu_${gpu.id}`] !== undefined ? `${Number(row[`gpu_${gpu.id}`]).toFixed(1)}%` : "N/A"}
                          </div>
                        ))}
                      </TooltipBox>
                    )
                  }}
                />
                {gpuCatalog.map((gpu, idx) => (
                  <Line
                    key={gpu.id}
                    isAnimationActive={false}
                    dataKey={`gpu_${gpu.id}`}
                    type="monotone"
                    connectNulls={false}
                    stroke={CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length]}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </MetricCardWrapper>
        )}
      </section>
    </div>
  )
}

function MetricCardWrapper({
  title,
  rightContent,
  className,
  children,
}: {
  title: string
  rightContent?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={className}>
      <CardContent className="px-6 py-3">
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between min-h-[32px]">
            <p className="text-md font-medium">{title}</p>
            {rightContent}
          </div>
          {children}
        </section>
      </CardContent>
    </Card>
  )
}

function TooltipBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/95 px-2.5 py-1.5 text-xs shadow-md backdrop-blur-sm tabular-nums">
      <div className="mb-1 font-medium text-foreground">{title}</div>
      <div className="space-y-0.5 text-muted-foreground">{children}</div>
    </div>
  )
}
