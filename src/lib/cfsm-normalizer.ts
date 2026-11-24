import {
  CfsmGlobalStats,
  CfsmServer,
  CfsmSysConfig,
  CfsmThemeOptions,
  DiskIoMetrics,
  GpuDeviceInfo,
  ProbeMetricValue,
} from "@/types/cfsm"
import { BillingData, NezhaServer, PlanData, PublicNoteData } from "@/types/nezha-api"
import dayjs from "dayjs"

export function makeServerUid(apiIndex: number | undefined, id: string): string {
  return `${apiIndex ?? 0}:${id}`
}

export const ONLINE_THRESHOLD_MS = 300_000
export const KB = 1024
export const MB = 1024 * 1024
export const GB = 1024 * 1024 * 1024
export const TB = 1024 * 1024 * 1024 * 1024

const UNIT_MULTIPLIERS: Record<string, number> = {
  b: 1,
  byte: 1,
  bytes: 1,
  k: KB,
  kb: KB,
  kib: KB,
  m: MB,
  mb: MB,
  mib: MB,
  g: GB,
  gb: GB,
  gib: GB,
  t: TB,
  tb: TB,
  tib: TB,
}

/**
 * Parse memory/disk values from CFSM (plain numbers are in MB; strings may include units like "40GB").
 */
export function parseMemoryOrDiskToBytes(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value * MB : 0
  }
  const raw = String(value).trim()
  if (!raw) return 0
  const match = raw.match(/^(-?[\d.,]+)\s*(b|bytes?|k|kb|kib|m|mb|mib|g|gb|gib|t|tb|tib)?$/i)
  if (!match) {
    const fallback = Number.parseFloat(raw)
    return Number.isFinite(fallback) && fallback > 0 ? fallback * MB : 0
  }
  const num = Number.parseFloat(match[1].replace(/,/g, ""))
  if (!Number.isFinite(num) || num <= 0) return 0
  const unit = match[2]?.toLowerCase()
  const multiplier = unit ? UNIT_MULTIPLIERS[unit] || MB : MB
  return num * multiplier
}

/**
 * Parse traffic_limit from CFSM (plain numbers are in GB; strings may include units like "1TB" or "500GB").
 */
export function parseTrafficLimitToBytes(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value * GB : 0
  }
  const raw = String(value).trim()
  if (!raw) return 0
  const match = raw.match(/^(-?[\d.,]+)\s*(b|bytes?|k|kb|kib|m|mb|mib|g|gb|gib|t|tb|tib)?$/i)
  if (!match) {
    const fallback = Number.parseFloat(raw)
    return Number.isFinite(fallback) && fallback > 0 ? fallback * GB : 0
  }
  const num = Number.parseFloat(match[1].replace(/,/g, ""))
  if (!Number.isFinite(num) || num <= 0) return 0
  const unit = match[2]?.toLowerCase()
  const multiplier = unit ? UNIT_MULTIPLIERS[unit] || GB : GB
  return num * multiplier
}

export function parseFiniteNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback
  const num = typeof value === "number" ? value : Number.parseFloat(String(value))
  return Number.isFinite(num) ? num : fallback
}

export function normalizeTimestampMs(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return fallback
    return value < 10_000_000_000 ? value * 1000 : value
  }
  const raw = String(value).trim()
  if (!raw) return fallback
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const num = Number.parseFloat(raw)
    if (!Number.isFinite(num) || num <= 0) return fallback
    return num < 10_000_000_000 ? num * 1000 : num
  }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function parseBootTimeMs(bootTime: unknown): number | null {
  const ms = normalizeTimestampMs(bootTime, 0)
  return ms > 0 ? ms : null
}

export function parseLoadAvg(loadAvg: unknown): [number, number, number] {
  if (!loadAvg) return [0, 0, 0]
  const parts = String(loadAvg).trim().split(/\s+/)
  return [
    parseFiniteNumber(parts[0], 0),
    parseFiniteNumber(parts[1], 0),
    parseFiniteNumber(parts[2], 0),
  ]
}

export function parseGpuInfo(raw: unknown): GpuDeviceInfo[] {
  if (!raw) return []
  let list: unknown[] = []
  if (Array.isArray(raw)) {
    list = raw
  } else if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) list = parsed
    } catch {
      return []
    }
  }
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, idx) => ({
      id: String(item.id ?? idx),
      name: String(item.name || `GPU ${idx}`),
      info: item.info === null || item.info === undefined ? null : parseFiniteNumber(item.info, 0),
      mem_used: item.mem_used !== undefined && item.mem_used !== null ? parseFiniteNumber(item.mem_used, 0) : undefined,
      mem_total: item.mem_total !== undefined && item.mem_total !== null ? parseFiniteNumber(item.mem_total, 0) : undefined,
      sm_clock: item.sm_clock !== undefined && item.sm_clock !== null ? parseFiniteNumber(item.sm_clock, 0) : undefined,
      power: item.power !== undefined && item.power !== null ? parseFiniteNumber(item.power, 0) : undefined,
    }))
}

export function isValidDiskIo(disk: unknown): disk is DiskIoMetrics {
  if (!disk || typeof disk !== "object" || Array.isArray(disk)) return false
  const d = disk as Record<string, unknown>
  const fields = ["read_bps", "write_bps", "read_iops", "write_iops", "await_ms", "util"]
  return fields.some((f) => {
    const val = d[f]
    if (val === null || val === undefined || val === "") return false
    const num = Number(val)
    return Number.isFinite(num) && num !== 0
  })
}

/**
 * Three-state probe normalization per CFSM spec:
 * - false / "false" / undefined => false (not configured / disabled / unsampled -> hidden)
 * - null => null (probe timeout -> show Timeout)
 * - finite number (including 0) => number (valid measurement)
 */
export function normalizeProbeMetric(value: unknown): ProbeMetricValue {
  if (value === undefined || value === false || value === "false") return false
  if (value === null || value === "" || value === "null") return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export function isDisabledProbeMetric(value: unknown): boolean {
  return value === undefined || value === false || value === "false"
}

export function isCfsmServerOnline(server: Partial<CfsmServer>, now = Date.now()): boolean {
  const lastUpdated = normalizeTimestampMs(server.last_updated ?? server.last_time ?? server.timestamp, 0)
  if (lastUpdated > 0) {
    return now - lastUpdated < ONLINE_THRESHOLD_MS
  }
  if (typeof server.online === "boolean") return server.online
  if (typeof server.is_online === "boolean") return server.is_online
  return false
}

export function normalizeTrafficCalcType(calcType?: string): string {
  const raw = String(calcType || "total").trim().toLowerCase()
  switch (raw) {
    case "ul":
    case "up":
      return "up"
    case "dl":
    case "down":
      return "down"
    case "max":
      return "max"
    case "min":
      return "min"
    case "total":
    case "sum":
    default:
      return "sum"
  }
}

export function calcTrafficUsed(upBytes: number, downBytes: number, type?: string): number {
  const up = Number.isFinite(upBytes) ? Math.max(0, upBytes) : 0
  const down = Number.isFinite(downBytes) ? Math.max(0, downBytes) : 0
  switch (normalizeTrafficCalcType(type)) {
    case "max":
      return Math.max(up, down)
    case "min":
      return Math.min(up, down)
    case "up":
      return up
    case "down":
      return down
    default:
      return up + down
  }
}

export const TAG_COLORS = [
  "Gray",
  "Gold",
  "Bronze",
  "Brown",
  "Yellow",
  "Amber",
  "Orange",
  "Tomato",
  "Red",
  "Ruby",
  "Crimson",
  "Pink",
  "Plum",
  "Purple",
  "Violet",
  "Iris",
  "Indigo",
  "Blue",
  "Cyan",
  "Teal",
  "Jade",
  "Green",
  "Grass",
  "Lime",
  "Mint",
  "Sky",
]

const TAG_CURRENCIES = ["CNY", "JPY", "USD", "EUR", "GBP", "HKD", "TWD", "KRW", "SGD", "CAD", "AUD"]
const TAG_COLOR_EXTRACT = new RegExp(`<\\s*(${TAG_COLORS.join("|")})\\s*>`, "i")
const TAG_COLOR_REMOVE = new RegExp(`<\\s*(?:${TAG_COLORS.join("|")})\\s*>`, "ig")
const TAG_CURRENCY_EXTRACT = new RegExp(`<\\s*(${TAG_CURRENCIES.join("|")})\\s*>`, "i")
const TAG_CURRENCY_REMOVE = new RegExp(`<\\s*(?:${TAG_CURRENCIES.join("|")})\\s*>`, "ig")
const TAG_TRAFFIC_RESET_EXTRACT = /<\s*TRD\s*:\s*(\d{1,2})\s*>/i
const TAG_TRAFFIC_RESET_REMOVE = /<\s*TRD\s*:\s*\d{1,2}\s*>/gi

function parseResetDayNum(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const day = Number(value)
  if (!Number.isInteger(day) || day < 1 || day > 31) return undefined
  return day
}

/**
 * Parse CFSM & BITJEBE tags: supports both "," and ";" separators,
 * <Color> Radix color syntax, <CURRENCY> overrides, and <TRD:day> overrides.
 */
export function parseTagMetadata(tags: string): {
  text: string
  currency: string
  trafficResetDay?: number
  items: string[]
} {
  if (!tags) return { text: "", currency: "", items: [] }
  let currency = ""
  let trafficResetDay: number | undefined
  const cleanedParts: string[] = []

  // Split on both ";" (BITJEBE style) and "," (CFSM style)
  for (const rawPart of tags.split(/[;,]/)) {
    const part = rawPart.trim()
    if (!part) continue

    if (!currency) {
      const m = part.match(TAG_CURRENCY_EXTRACT)
      if (m) currency = m[1].toUpperCase()
    }

    if (!trafficResetDay) {
      const m = part.match(TAG_TRAFFIC_RESET_EXTRACT)
      const day = m ? parseResetDayNum(m[1]) : undefined
      if (day) trafficResetDay = day
    }

    const colorMatch = part.match(TAG_COLOR_EXTRACT)
    const color = colorMatch ? colorMatch[1] : ""
    const text = part
      .replace(TAG_COLOR_REMOVE, "")
      .replace(TAG_CURRENCY_REMOVE, "")
      .replace(TAG_TRAFFIC_RESET_REMOVE, "")
      .trim()
    if (!text) continue
    cleanedParts.push(color ? `${color}:${text}` : text)
  }

  return {
    text: cleanedParts.join(","),
    currency,
    trafficResetDay,
    items: cleanedParts,
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== "string" || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function resolveTrafficResetDay(server: CfsmServer, themeOptions?: CfsmThemeOptions): number {
  const tagResetDay = parseTagMetadata(server.tags || "").trafficResetDay
  if (tagResetDay) return tagResetDay

  const overrides = parseJsonObject(themeOptions?.traffic_reset_day_overrides)
  for (const key of [server.id, server.name].filter(Boolean)) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const override = parseResetDayNum(overrides[key])
      if (override) return override
    }
  }

  const nativeDay = parseResetDayNum(server.reset_day)
  return nativeDay || 0
}

const BILLING_CYCLE_MONTHS: Record<string, { months: number; label: string }> = {
  month: { months: 1, label: "月" },
  quarter: { months: 3, label: "季" },
  half_year: { months: 6, label: "半年" },
  year: { months: 12, label: "年" },
  two_years: { months: 24, label: "2年" },
  three_years: { months: 36, label: "3年" },
  four_years: { months: 48, label: "4年" },
  five_years: { months: 60, label: "5年" },
}

function normalizeBillingCycleLabel(cycle?: string): { months: number; label: string } {
  const raw = String(cycle || "").trim().toLowerCase()
  if (!raw) return { months: 1, label: "月" }
  if (BILLING_CYCLE_MONTHS[raw]) return BILLING_CYCLE_MONTHS[raw]
  if (/5|five/.test(raw) || raw === "5年" || raw === "五年") return BILLING_CYCLE_MONTHS.five_years
  if (/4|four/.test(raw) || raw === "4年" || raw === "四年") return BILLING_CYCLE_MONTHS.four_years
  if (/3|three/.test(raw) || raw === "3年" || raw === "三年") return BILLING_CYCLE_MONTHS.three_years
  if (/2|two/.test(raw) || raw === "2年" || raw === "两年" || raw === "二年") return BILLING_CYCLE_MONTHS.two_years
  if (/half|semi|半年/.test(raw)) return BILLING_CYCLE_MONTHS.half_year
  if (/quarter|季/.test(raw)) return BILLING_CYCLE_MONTHS.quarter
  if (/year|annual|年/.test(raw)) return BILLING_CYCLE_MONTHS.year
  return BILLING_CYCLE_MONTHS.month
}

function renewExpireDateIfNeeded(
  expireDate: string,
  billingCycle: string,
  autoRenewal: boolean,
  now: number,
): string {
  const raw = expireDate.trim()
  if (!raw || !autoRenewal) return raw
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return raw
  const cycle = normalizeBillingCycleLabel(billingCycle)
  let year = Number(match[1])
  let month = Number(match[2])
  const day = Number(match[3])
  const todayStr = new Date(now).toISOString().slice(0, 10)

  let candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  let guard = 0
  while (candidate <= todayStr && guard < 120) {
    const zeroMonth = month - 1 + cycle.months
    year += Math.floor(zeroMonth / 12)
    month = ((zeroMonth % 12) + 12) % 12 + 1
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const safeDay = Math.min(day, maxDay)
    candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`
    guard++
  }
  return candidate
}

function isEnabledFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true"
}

function normalizeReachabilityFlag(value: unknown): string {
  const text = String(value ?? "").trim().toLowerCase()
  return text && text !== "0" && text !== "false" && text !== "null" ? "1" : "0"
}

export function buildPublicNoteObjectFromCfsm(
  server: CfsmServer,
  sysConfig?: CfsmSysConfig,
  themeOptions?: CfsmThemeOptions,
  now = Date.now(),
): PublicNoteData {
  const showPrice = sysConfig?.show_price !== false
  const showExpire = sysConfig?.show_expire !== false
  const tagMeta = parseTagMetadata(server.tags || "")

  const rawExpire = String(server.expire_date ?? server.expire_time ?? "").trim()
  const autoRenewal = isEnabledFlag(server.auto_renewal)
  const effectiveExpire = rawExpire ? renewExpireDateIfNeeded(rawExpire, server.billing_cycle || "month", autoRenewal, now) : ""

  const rawPrice = server.price !== undefined && server.price !== null ? String(server.price).trim() : ""
  // CFSM: "0" or "-1" means Free; blank string means not configured
  let amount = ""
  if (showPrice && rawPrice) {
    const cleanedPrice = rawPrice
      .replace(/^(?:CNY|RMB|JPY|USD|EUR|GBP|HKD|TWD|KRW|SGD|CAD|AUD|US\$|HK\$|NT\$|\$|€|£|¥|￥)\s*/i, "")
      .replace(/,/g, "")
    const numericPrice = Number.parseFloat(cleanedPrice)
    if (rawPrice === "-1" || numericPrice === -1 || numericPrice === 0) {
      amount = "-1"
    } else if (Number.isFinite(numericPrice) && numericPrice > 0) {
      amount = String(numericPrice)
    }
  }

  const cycleInfo = normalizeBillingCycleLabel(server.billing_cycle)
  const trafficLimitBytes = parseTrafficLimitToBytes(server.traffic_limit)
  const hasBilling = (showExpire && Boolean(effectiveExpire)) || (showPrice && Boolean(amount))

  const billingDataMod: BillingData | undefined = hasBilling
    ? {
        startDate: "",
        endDate: showExpire ? effectiveExpire : "",
        autoRenewal: autoRenewal ? "1" : "0",
        cycle: cycleInfo.label,
        amount,
        currency: tagMeta.currency || server.currency || "",
      }
    : undefined

  const planDataMod: PlanData = {
    bandwidth: "",
    trafficVol: trafficLimitBytes > 0 ? formatTrafficTag(trafficLimitBytes) : "",
    trafficType: server.traffic_calc_type || "",
    IPv4: normalizeReachabilityFlag(server.ip_v4),
    IPv6: normalizeReachabilityFlag(server.ip_v6),
    networkRoute: "",
    extra: tagMeta.text,
  }

  // Keep resetDay resolved cleanly when building server
  void themeOptions
  return { billingDataMod, planDataMod }
}

export function buildPublicNoteFromCfsm(
  server: CfsmServer,
  sysConfig?: CfsmSysConfig,
  themeOptions?: CfsmThemeOptions,
  now = Date.now(),
): string {
  const obj = buildPublicNoteObjectFromCfsm(server, sysConfig, themeOptions, now)
  return JSON.stringify({
    billingDataMod: obj.billingDataMod ?? null,
    planDataMod: obj.planDataMod ?? null,
  })
}

function formatTrafficTag(bytes: number): string {
  if (bytes >= TB) {
    const val = bytes / TB
    return `${Number.isInteger(val) ? val : val.toFixed(1)}TB`
  }
  if (bytes >= GB) {
    const val = bytes / GB
    return `${Number.isInteger(val) ? val : val.toFixed(1)}GB`
  }
  const val = bytes / MB
  return `${Math.round(val)}MB`
}

export function cfsmServerToNezhaServer(
  server: CfsmServer,
  now = Date.now(),
  sysConfig?: CfsmSysConfig,
  themeOptions?: CfsmThemeOptions,
): NezhaServer {
  const lastUpdatedMs = normalizeTimestampMs(server.last_updated ?? server.last_time ?? server.timestamp, 0)
  const bootTimeMs = parseBootTimeMs(server.boot_time)
  const bootTimeSec = bootTimeMs ? Math.floor(bootTimeMs / 1000) : 0
  const online = isCfsmServerOnline(server, now)

  let uptimeSec = 0
  if (online && server._uptime_base_sec !== undefined && server._uptime_base_ts) {
    uptimeSec = server._uptime_base_sec + Math.max(0, Math.floor((now - server._uptime_base_ts) / 1000))
  } else if (server.uptime !== undefined && server.uptime !== null && Number.isFinite(Number(server.uptime)) && Number(server.uptime) > 0) {
    uptimeSec = Math.floor(Number(server.uptime))
  } else if (bootTimeMs) {
    const refTs = online ? now : lastUpdatedMs
    uptimeSec = refTs > bootTimeMs ? Math.floor((refTs - bootTimeMs) / 1000) : 0
  }

  const [load1, load5, load15] = parseLoadAvg(server.load_avg ?? server.load)
  const gpuDevices = parseGpuInfo(server.gpu_info)

  const memTotalBytes = parseMemoryOrDiskToBytes(server.ram_total)
  const memUsedBytes = parseMemoryOrDiskToBytes(server.ram_used)
  const swapTotalBytes = parseMemoryOrDiskToBytes(server.swap_total)
  const swapUsedBytes = parseMemoryOrDiskToBytes(server.swap_used)
  const diskTotalBytes = parseMemoryOrDiskToBytes(server.disk_total)
  const diskUsedBytes = parseMemoryOrDiskToBytes(server.disk_used)

  const netRx = parseFiniteNumber(server.net_rx, 0)
  const netTx = parseFiniteNumber(server.net_tx, 0)
  // Monthly quota must never fall back to cumulative boot traffic (net_rx / net_tx)
  const netRxMonthly =
    server.net_rx_monthly !== undefined && server.net_rx_monthly !== null
      ? parseFiniteNumber(server.net_rx_monthly, 0)
      : 0
  const netTxMonthly =
    server.net_tx_monthly !== undefined && server.net_tx_monthly !== null
      ? parseFiniteNumber(server.net_tx_monthly, 0)
      : 0

  const trafficLimitBytes = parseTrafficLimitToBytes(server.traffic_limit)
  const trafficCalcType = normalizeTrafficCalcType(server.traffic_calc_type)
  const trafficResetDay = resolveTrafficResetDay(server, themeOptions)
  const countryCode = server.region ? String(server.region).trim().toLowerCase() : ""
  const parsedNote = buildPublicNoteObjectFromCfsm(server, sysConfig, themeOptions, now)

  return {
    uid: makeServerUid(server.apiIndex, server.id),
    uuid: server.id,
    id: server.id,
    name: server.name || server.id,
    server_group: server.server_group || "",
    public_note: JSON.stringify({
      billingDataMod: parsedNote.billingDataMod ?? null,
      planDataMod: parsedNote.planDataMod ?? null,
    }),
    parsed_note: parsedNote,
    last_active: lastUpdatedMs ? new Date(lastUpdatedMs).toISOString() : "0000-00-00T00:00:00Z",
    last_updated: lastUpdatedMs,
    country_code: countryCode === "xx" ? "" : countryCode,
    display_index: parseFiniteNumber(server.sort_order, 0),
    traffic_limit: trafficLimitBytes,
    traffic_limit_type: trafficCalcType,
    traffic_reset_day: trafficResetDay,
    net_rx_monthly: netRxMonthly,
    net_tx_monthly: netTxMonthly,
    expired_at: server.expire_date ?? server.expire_time ?? "",
    price: server.price ?? "",
    billing_cycle: server.billing_cycle ?? "month",
    auto_renewal: isEnabledFlag(server.auto_renewal) ? "1" : "0",
    currency: server.currency ?? "",
    online,
    tags: typeof server.tags === "string" ? server.tags : "",
    ip_v4: normalizeReachabilityFlag(server.ip_v4),
    ip_v6: normalizeReachabilityFlag(server.ip_v6),
    disk: isValidDiskIo(server.disk) ? server.disk : undefined,
    gpu_devices: gpuDevices,
    ping: Array.isArray(server.ping) ? server.ping : undefined,
    loss: Array.isArray(server.loss) ? server.loss : undefined,
    ping_ct: normalizeProbeMetric(server.ping_ct),
    ping_cu: normalizeProbeMetric(server.ping_cu),
    ping_cm: normalizeProbeMetric(server.ping_cm),
    ping_bd: normalizeProbeMetric(server.ping_bd),
    ping_node_1: normalizeProbeMetric(server.ping_node_1),
    ping_node_2: normalizeProbeMetric(server.ping_node_2),
    ping_node_3: normalizeProbeMetric(server.ping_node_3),
    ping_node_4: normalizeProbeMetric(server.ping_node_4),
    loss_ct: normalizeProbeMetric(server.loss_ct),
    loss_cu: normalizeProbeMetric(server.loss_cu),
    loss_cm: normalizeProbeMetric(server.loss_cm),
    loss_bd: normalizeProbeMetric(server.loss_bd),
    loss_node_1: normalizeProbeMetric(server.loss_node_1),
    loss_node_2: normalizeProbeMetric(server.loss_node_2),
    loss_node_3: normalizeProbeMetric(server.loss_node_3),
    loss_node_4: normalizeProbeMetric(server.loss_node_4),
    source: server.source,
    apiIndex: server.apiIndex,
    sysConfig,
    host: {
      platform: server.os || "",
      platform_version: server.kernel_version || "",
      cpu: server.cpu_info ? [server.cpu_info] : [],
      cpu_cores: parseFiniteNumber(server.cpu_cores, 0),
      gpu: gpuDevices.map((g) => g.name),
      mem_total: memTotalBytes,
      disk_total: diskTotalBytes,
      swap_total: swapTotalBytes,
      arch: server.arch || "",
      boot_time: bootTimeSec,
      version: server.agent_version || server.version || "",
    },
    state: {
      cpu: parseFiniteNumber(server.cpu, 0),
      mem_used: memUsedBytes,
      swap_used: swapUsedBytes,
      disk_used: diskUsedBytes,
      net_in_transfer: netRx,
      net_out_transfer: netTx,
      net_in_speed: parseFiniteNumber(server.net_in_speed, 0),
      net_out_speed: parseFiniteNumber(server.net_out_speed, 0),
      uptime: uptimeSec,
      load_1: load1,
      load_5: load5,
      load_15: load15,
      tcp_conn_count: parseFiniteNumber(server.tcp_conn, 0),
      udp_conn_count: parseFiniteNumber(server.udp_conn, 0),
      process_count: parseFiniteNumber(server.processes, 0),
      temperatures: [],
      gpu: gpuDevices.map((g) => (g.info ?? 0)),
    },
  }
}

const REPORT_LEVEL_KEYS = [
  "processes",
  "tcp_conn",
  "udp_conn",
  "disk_total",
  "disk_used",
  "load_avg",
  "load",
  "net_rx",
  "net_tx",
  "ping_ct",
  "ping_cu",
  "ping_cm",
  "ping_bd",
] as const

/**
 * Incrementally merge a WebSocket batchUpdate sample into an existing CfsmServer.
 * Undefined keys are skipped so report-level fields (gpu_info, tags, ping, etc.)
 * are preserved across high-frequency samples, while full report frames without
 * disk IO clear stale idle disk metrics.
 */
export function mergeBatchSampleIntoServer(
  prev: CfsmServer,
  sampleData: Partial<CfsmServer>,
  sampleTs: number,
  reportTs: number,
): CfsmServer {
  const next: CfsmServer = { ...prev }
  const rawSample = sampleData as Record<string, unknown>

  for (const [key, value] of Object.entries(rawSample)) {
    if (key === "disk") continue
    if (value !== undefined) {
      ;(next as unknown as Record<string, unknown>)[key] = value
    }
  }

  if ("disk" in rawSample) {
    next.disk = isValidDiskIo(rawSample.disk) ? (rawSample.disk as DiskIoMetrics) : undefined
  } else if (REPORT_LEVEL_KEYS.some((k) => rawSample[k] !== undefined)) {
    next.disk = undefined
  }

  const prevLastUpdated = normalizeTimestampMs(prev.last_updated ?? prev.last_time ?? prev.timestamp, 0)
  const candidateTs = normalizeTimestampMs(
    sampleData.last_updated ?? (reportTs > 0 ? reportTs : sampleTs),
    0,
  )
  const resolvedReportTs = Math.max(prevLastUpdated, candidateTs)
  if (resolvedReportTs > 0) {
    next.last_updated = resolvedReportTs
    next.timestamp = resolvedReportTs
  }
  const resolvedSampleTs = normalizeTimestampMs(sampleTs, resolvedReportTs)
  if (resolvedSampleTs > 0) {
    next.sample_timestamp = resolvedSampleTs
  }

  if (
    sampleData.uptime !== undefined &&
    sampleData.uptime !== null &&
    Number.isFinite(Number(sampleData.uptime)) &&
    Number(sampleData.uptime) > 0
  ) {
    next._uptime_base_sec = Math.floor(Number(sampleData.uptime))
    next._uptime_base_ts = resolvedReportTs > 0 ? resolvedReportTs : Date.now()
  }

  next.online = isCfsmServerOnline(next)
  return next
}

export function recomputeStatsFromServers(servers: CfsmServer[], now = Date.now()): {
  stats: CfsmGlobalStats
  regionStats: Record<string, number>
} {
  let online = 0
  let globalSpeedIn = 0
  let globalSpeedOut = 0
  let globalNetRx = 0
  let globalNetTx = 0
  const regionStats: Record<string, number> = {}

  for (const s of servers) {
    const isOnline = isCfsmServerOnline(s, now)
    if (isOnline) {
      online++
      globalSpeedIn += parseFiniteNumber(s.net_in_speed, 0)
      globalSpeedOut += parseFiniteNumber(s.net_out_speed, 0)
    }
    globalNetRx += parseFiniteNumber(s.net_rx, 0)
    globalNetTx += parseFiniteNumber(s.net_tx, 0)

    const regionCode = String(s.region || "").trim().toUpperCase()
    if (regionCode && regionCode !== "XX") {
      regionStats[regionCode] = (regionStats[regionCode] || 0) + 1
    }
  }

  return {
    stats: {
      total: servers.length,
      online,
      offline: servers.length - online,
      globalSpeedIn,
      globalSpeedOut,
      globalNetTx,
      globalNetRx,
    },
    regionStats,
  }
}

export function formatServerDate(ts: number): string {
  return dayjs(ts).format("YYYY-MM-DD HH:mm:ss")
}
