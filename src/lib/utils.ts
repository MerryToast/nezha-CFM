import {
  TAG_COLORS,
  calcTrafficUsed,
  parseTagMetadata,
} from "@/lib/cfsm-normalizer"
import { NezhaServer } from "@/types/nezha-api"
import { type ClassValue, clsx } from "clsx"
import dayjs from "dayjs"
import { twMerge } from "tailwind-merge"

export { calcTrafficUsed, parseTagMetadata, TAG_COLORS }

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNezhaInfo(now: number, serverInfo: NezhaServer) {
  const lastActiveTime = serverInfo.last_updated || (serverInfo.last_active ? Date.parse(serverInfo.last_active) : 0)
  const onlineFlag =
    lastActiveTime > 0
      ? now - lastActiveTime < 300_000
      : typeof serverInfo.online === "boolean"
        ? serverInfo.online
        : false

  const memTotal = serverInfo.host.mem_total || 0
  const swapTotal = serverInfo.host.swap_total || 0
  const diskTotal = serverInfo.host.disk_total || 0

  return {
    ...serverInfo,
    cpu: serverInfo.state.cpu || 0,
    gpu: serverInfo.state.gpu || [],
    process: serverInfo.state.process_count || 0,
    up: (serverInfo.state.net_out_speed || 0) / 1024 / 1024,
    down: (serverInfo.state.net_in_speed || 0) / 1024 / 1024,
    last_active_time_string: lastActiveTime ? dayjs(lastActiveTime).format("YYYY-MM-DD HH:mm:ss") : "",
    online: onlineFlag,
    uptime: serverInfo.state.uptime || 0,
    version: serverInfo.host.version || null,
    tcp: serverInfo.state.tcp_conn_count || 0,
    udp: serverInfo.state.udp_conn_count || 0,
    mem: memTotal > 0 ? (serverInfo.state.mem_used / memTotal) * 100 : 0,
    swap: swapTotal > 0 ? (serverInfo.state.swap_used / swapTotal) * 100 : 0,
    disk_usage_percent: diskTotal > 0 ? (serverInfo.state.disk_used / diskTotal) * 100 : 0,
    stg: diskTotal > 0 ? (serverInfo.state.disk_used / diskTotal) * 100 : 0,
    country_code: serverInfo.country_code,
    platform: serverInfo.host.platform || "",
    net_out_transfer: serverInfo.state.net_out_transfer || 0,
    net_in_transfer: serverInfo.state.net_in_transfer || 0,
    net_tx_monthly: serverInfo.net_tx_monthly ?? serverInfo.state.net_out_transfer ?? 0,
    net_rx_monthly: serverInfo.net_rx_monthly ?? serverInfo.state.net_in_transfer ?? 0,
    arch: serverInfo.host.arch || "",
    mem_total: memTotal,
    swap_total: swapTotal,
    disk_total: diskTotal,
    boot_time: serverInfo.host.boot_time || 0,
    boot_time_string: serverInfo.host.boot_time ? dayjs(serverInfo.host.boot_time * 1000).format("YYYY-MM-DD HH:mm:ss") : "",
    platform_version: serverInfo.host.platform_version || "",
    cpu_info: serverInfo.host.cpu || [],
    gpu_info: serverInfo.host.gpu || [],
    load_1: (serverInfo.state.load_1 ?? 0).toFixed(2),
    load_5: (serverInfo.state.load_5 ?? 0).toFixed(2),
    load_15: (serverInfo.state.load_15 ?? 0).toFixed(2),
    public_note: serverInfo.public_note || "",
    traffic_limit: serverInfo.traffic_limit || 0,
    traffic_limit_type: serverInfo.traffic_limit_type || "sum",
    traffic_reset_day: serverInfo.traffic_reset_day || 0,
    expired_at: serverInfo.expired_at || "",
  }
}

export function getDaysBetweenDatesWithAutoRenewal({ autoRenewal, cycle, startDate, endDate }: BillingData): {
  days: number
  cycleLabel: string
  remainingPercentage: number
} {
  let months = 1
  let cycleLabel = cycle

  const cycleLower = cycle.toLowerCase()
  const yearsMatch = cycleLower.match(/^(\d+)年$/)

  if (yearsMatch) {
    const y = parseInt(yearsMatch[1], 10)
    cycleLabel = cycle
    months = y * 12
  } else {
    switch (cycleLower) {
      case "月":
      case "m":
      case "mo":
      case "month":
      case "monthly":
        cycleLabel = "月"
        months = 1
        break
      case "年":
      case "y":
      case "yr":
      case "year":
      case "annual":
        cycleLabel = "年"
        months = 12
        break
      case "季":
      case "q":
      case "qr":
      case "quarterly":
        cycleLabel = "季"
        months = 3
        break
      case "半":
      case "半年":
      case "h":
      case "half":
      case "semi-annually":
        cycleLabel = "半年"
        months = 6
        break
      case "一次性":
        cycleLabel = "一次性"
        months = 1
        break
      default:
        cycleLabel = cycle
        break
    }
  }

  const nowTime = Date.now()
  const endTime = dayjs(endDate).valueOf()

  if (autoRenewal !== "1") {
    const days = getDaysBetweenDates(endDate, new Date(nowTime).toISOString())
    const spanDays = startDate ? dayjs(endDate).diff(startDate, "day") : 30 * months
    const denom = spanDays > 0 ? spanDays : 30 * months
    return {
      days,
      cycleLabel,
      remainingPercentage: Math.max(0, Math.min(1, days / denom)),
    }
  }

  if (nowTime < endTime) {
    const days = getDaysBetweenDates(endDate, new Date(nowTime).toISOString())
    return {
      days,
      cycleLabel,
      remainingPercentage: Math.max(0, Math.min(1, days / (30 * months))),
    }
  }

  const nextTime = getNextCycleTime(endTime, months, nowTime)
  const diff = dayjs(nextTime).diff(dayjs(), "day") + 1
  return {
    days: diff,
    cycleLabel,
    remainingPercentage: Math.max(0, Math.min(1, diff / (30 * months))),
  }
}

export function getNextCycleTime(startDate: number, months: number, specifiedDate: number): number {
  const start = dayjs(startDate)
  const checkDate = dayjs(specifiedDate)
  if (!start.isValid() || months <= 0) {
    throw new Error("Invalid cycle parameters")
  }
  let nextDate = start
  let guard = 0
  while (nextDate.valueOf() <= checkDate.valueOf() && guard < 1200) {
    nextDate = nextDate.add(months, "month")
    guard++
  }
  return nextDate.valueOf()
}

export function getDaysBetweenDates(date1: string, date2: string): number {
  const oneDay = 24 * 60 * 60 * 1000
  const firstDate = new Date(date1)
  const secondDate = new Date(date2)
  return Math.round((firstDate.getTime() - secondDate.getTime()) / oneDay)
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = Math.max(0, now - timestamp)
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (hours > 24) {
    return `${Math.floor(hours / 24)}d`
  } else if (hours > 0) {
    return `${hours}h`
  } else if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export interface BillingData {
  startDate: string
  endDate: string
  autoRenewal: string
  cycle: string
  amount: string
  currency?: string
}

export interface PlanData {
  bandwidth: string
  trafficVol: string
  trafficType: string
  IPv4: string
  IPv6: string
  networkRoute: string
  extra: string
}

export interface PublicNoteData {
  billingDataMod?: BillingData
  planDataMod?: PlanData
}

function getCnyLabel(): string {
  if (typeof window === "undefined") return "¥"
  const style = (window as unknown as Record<string, unknown>).CnySymbolStyle
  const raw = typeof style === "string" ? style.trim().toUpperCase() : ""
  return raw === "CNY" ? "CNY " : "¥"
}

const STATIC_CURRENCY_LABELS: Record<string, string> = {
  JPY: "JPY ",
  USD: "$",
  EUR: "€",
  GBP: "£",
  HKD: "HK$",
  TWD: "NT$",
  KRW: "KRW ",
  SGD: "S$",
  CAD: "CA$",
  AUD: "A$",
  $: "$",
  "€": "€",
  "£": "£",
  "¥": "¥",
  "￥": "￥",
}

function getCurrencyLabel(currency: string): string | undefined {
  if (currency === "CNY") return getCnyLabel()
  return STATIC_CURRENCY_LABELS[currency]
}

export function normalizeBillingCurrency(currency?: unknown): string {
  const raw = typeof currency === "string" ? currency.trim() : ""
  if (!raw) return ""

  const upper = raw.toUpperCase()
  const compact = upper.replace(/\s+/g, "")

  if (["CNY", "RMB", "CN¥", "CN￥"].includes(compact) || raw.includes("人民币")) return "CNY"
  if (["JPY", "JP¥", "JP￥", "¥JPY"].includes(compact) || raw.includes("日元") || raw.includes("円")) return "JPY"
  if (compact === "¥" || compact === "￥") return "CNY"
  if (compact === "$") return "USD"
  if (compact === "€") return "EUR"
  if (compact === "£") return "GBP"
  if (compact === "US$") return "USD"
  if (compact === "HK$") return "HKD"
  if (compact === "NT$") return "TWD"
  if (compact === "S$") return "SGD"
  if (compact === "A$") return "AUD"
  if (compact === "C$" || compact === "CA$") return "CAD"

  return compact || raw
}

export function stripCurrencyMarks(amount: string): string {
  return amount
    .trim()
    .replace(
      /^(?:CNY|RMB|JPY|USD|EUR|GBP|HKD|TWD|KRW|SGD|CAD|AUD|CN¥|CN￥|JP¥|JP￥|US\$|HK\$|NT\$|\$|€|£|¥|￥)\s*/i,
      "",
    )
    .replace(
      /\s*(?:CNY|RMB|JPY|USD|EUR|GBP|HKD|TWD|KRW|SGD|CAD|AUD|CN¥|CN￥|JP¥|JP￥|US\$|HK\$|NT\$|\$|€|£|¥|￥)$/i,
      "",
    )
    .trim()
}

export function parseBillingAmountNumber(amount: string): number | null {
  const rawAmount = String(amount || "").trim()
  if (!rawAmount || rawAmount === "-1") return null
  const normalized = stripCurrencyMarks(rawAmount).replace(/,/g, "")
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function formatBillingAmount(amount: string, currency?: string): string {
  const rawAmount = String(amount || "").trim()
  if (!rawAmount || rawAmount === "0" || rawAmount === "-1") return rawAmount
  const normalizedCurrency = normalizeBillingCurrency(currency)
  if (!normalizedCurrency) return rawAmount
  const label = getCurrencyLabel(normalizedCurrency) || `${normalizedCurrency} `
  const value = stripCurrencyMarks(rawAmount)
  return value ? `${label}${value}` : rawAmount
}

function isFollowBackendCurrency(value?: unknown): boolean {
  const raw = typeof value === "string" ? value.trim() : ""
  const normalized = raw.toLowerCase()
  return (
    raw === "" ||
    ["backend", "follow-backend", "follow backend", "auto", "default", "跟随后端", "使用后端"].includes(normalized)
  )
}

function parseBillingCurrencyOverrides(value: unknown): Record<string, unknown> {
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

function readTagCurrency(server: any): string {
  const tags = typeof server?.tags === "string" ? server.tags : ""
  if (!tags) return ""
  return normalizeBillingCurrency(parseTagMetadata(tags).currency)
}

export function resolveThemeBillingCurrency(server: any, existingCurrency?: string): string {
  const win = typeof window === "undefined" ? {} : ((window as unknown as Record<string, unknown>) || {})
  const overrides = parseBillingCurrencyOverrides(win.ServerBillingCurrencyOverrides)
  const overrideKeys = [server?.uuid, server?.name, server?.id].filter(Boolean).map(String)

  for (const key of overrideKeys) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const override = overrides[key]
      return isFollowBackendCurrency(override)
        ? readTagCurrency(server) || normalizeBillingCurrency(server?.currency) || normalizeBillingCurrency(existingCurrency)
        : normalizeBillingCurrency(override)
    }
  }

  const tagCurrency = readTagCurrency(server)
  if (tagCurrency) return tagCurrency

  const defaultCurrency = win.DefaultBillingCurrency
  if (!isFollowBackendCurrency(defaultCurrency)) {
    return normalizeBillingCurrency(defaultCurrency)
  }

  return normalizeBillingCurrency(server?.currency) || normalizeBillingCurrency(existingCurrency)
}

export function parsePublicNote(publicNote: string): PublicNoteData | null {
  try {
    if (!publicNote) return null
    const data = JSON.parse(publicNote)
    if (!data.billingDataMod && !data.planDataMod) return null
    return {
      billingDataMod: data.billingDataMod
        ? {
            startDate: data.billingDataMod.startDate || "",
            endDate: data.billingDataMod.endDate || "",
            autoRenewal: data.billingDataMod.autoRenewal || "",
            cycle: data.billingDataMod.cycle || "",
            amount: data.billingDataMod.amount || "",
            currency: data.billingDataMod.currency || "",
          }
        : undefined,
      planDataMod: data.planDataMod
        ? {
            bandwidth: data.planDataMod.bandwidth || "",
            trafficVol: data.planDataMod.trafficVol || "",
            trafficType: data.planDataMod.trafficType || "",
            IPv4: data.planDataMod.IPv4 || "",
            IPv6: data.planDataMod.IPv6 || "",
            networkRoute: data.planDataMod.networkRoute || "",
            extra: data.planDataMod.extra || "",
          }
        : undefined,
    }
  } catch {
    return null
  }
}
