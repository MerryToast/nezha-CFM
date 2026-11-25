import { useCfsm } from "@/hooks/use-cfsm"
import { formatBytes } from "@/lib/format"
import { safeStorageGet, safeStorageSet } from "@/lib/safe-storage"
import { ASSET_COLORS, resolveThemeColor } from "@/lib/theme-colors"
import {
  calcTrafficUsed,
  cn,
  formatBillingAmount,
  formatNezhaInfo,
  normalizeBillingCurrency,
  parseBillingAmountNumber,
  parsePublicNote,
  resolveThemeBillingCurrency,
} from "@/lib/utils"
import { NezhaServer } from "@/types/nezha-api"
import dayjs from "dayjs"
import { CircleDollarSign, Heart, HelpCircle, RefreshCw, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

type AssetSummaryWidgetProps = {
  now: number
  servers: NezhaServer[]
}

type BillingData = NonNullable<NonNullable<ReturnType<typeof parsePublicNote>>["billingDataMod"]>
type FormattedServer = ReturnType<typeof formatNezhaInfo>
type ExchangeRates = Record<string, number>
type AssetSort = "weight_asc" | "weight_desc" | "price_asc" | "price_desc"

type AssetItem = {
  uid: string
  id: string
  name: string
  displayIndex: number
  formatted: FormattedServer
  billing?: BillingData
  sourceAmount: number | null
  sourceCurrency: string
  priceCny: number | null
  monthlyCny: number | null
  remainingCny: number | null
  remainingDays: number | null
  isExpired: boolean
  isFree: boolean
  isUsageBased: boolean
  isLongTerm: boolean
  isFreeTagged: boolean
  sourcePriceText: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const LONG_TERM_DAYS = 365 * 100
const DISPLAY_CURRENCIES = ["CNY", "USD", "HKD", "EUR", "GBP", "JPY"] as const
const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  CNY: 1,
  USD: 0.142536,
  HKD: 1.108377,
  EUR: 0.12102,
  GBP: 0.105581,
  JPY: 22.231552,
}
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  HKD: "HK$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
}

function getInitialCurrency(configuredRaw?: unknown): string {
  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {}
  const raw = configuredRaw ?? win.AssetCardDefaultCurrency
  const configured = typeof raw === "string" ? normalizeBillingCurrency(raw) : ""
  if (DISPLAY_CURRENCIES.includes(configured as (typeof DISPLAY_CURRENCIES)[number])) {
    return configured
  }
  return safeStorageGet("asset_card_currency", "local") || "CNY"
}

function formatMoney(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return "--"
  const digits = currency === "JPY" ? 0 : 2
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `
  return `${symbol}${value.toFixed(digits)}`
}

function amountToCny(amount: number, currency: string, rates: ExchangeRates): number | null {
  const sourceCurrency = normalizeBillingCurrency(currency)
  if (!sourceCurrency) return null
  if (sourceCurrency === "CNY") return amount
  const rate = rates[sourceCurrency]
  return rate ? amount / rate : null
}

function cnyToCurrency(amount: number | null, currency: string, rates: ExchangeRates): number | null {
  if (amount === null) return null
  const rate = rates[currency]
  return rate ? amount * rate : null
}

function parseChineseNumeral(word: string): number | null {
  if (!word) return null
  const map: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  if (Object.prototype.hasOwnProperty.call(map, word)) return map[word]
  const idx = word.indexOf("十")
  if (idx === -1) return null
  const tens = idx === 0 ? 1 : map[word[idx - 1]]
  const ones = idx === word.length - 1 ? 0 : map[word[idx + 1]]
  if (tens == null || ones == null) return null
  return tens * 10 + ones
}

function parseCycleDays(cycle?: string, startDate?: string, endDate?: string): number | null {
  const raw = String(cycle || "").trim().toLowerCase()
  const number = "([0-9]+(?:\\.[0-9]+)?)"

  const dayMatch = raw.match(new RegExp(`^${number}\\s*(d|day|days|天)$`))
  if (dayMatch) return Number(dayMatch[1])

  const monthMatch = raw.match(new RegExp(`^${number}\\s*(m|mo|month|months|月)$`))
  if (monthMatch) return Number(monthMatch[1]) * 30

  const yearMatch = raw.match(new RegExp(`^${number}\\s*(y|yr|year|years|年)$`))
  if (yearMatch) return Number(yearMatch[1]) * 365

  const cnYearMatch = raw.match(/^([零一二两三四五六七八九十]+)\s*年$/)
  if (cnYearMatch) {
    const n = parseChineseNumeral(cnYearMatch[1])
    if (n != null && n > 0) return n * 365
  }
  const cnMonthMatch = raw.match(/^([零一二两三四五六七八九十]+)\s*个?\s*月$/)
  if (cnMonthMatch) {
    const n = parseChineseNumeral(cnMonthMatch[1])
    if (n != null && n > 0) return n * 30
  }
  const cnDayMatch = raw.match(/^([零一二两三四五六七八九十]+)\s*天$/)
  if (cnDayMatch) {
    const n = parseChineseNumeral(cnDayMatch[1])
    if (n != null && n > 0) return n
  }

  if (raw.includes("半") || raw.includes("half") || raw.includes("semi")) return 184
  if (raw.includes("季") || raw.includes("quarter") || raw === "q" || raw === "qr") return 92
  if (raw.includes("年") || raw.includes("annual") || raw === "y" || raw === "yr") return 365
  if (raw.includes("月") || raw.includes("month") || raw === "m" || raw === "mo") return 30
  if (raw.includes("一次") || raw.includes("one-time")) return null

  const start = Date.parse(startDate || "")
  const end = Date.parse(endDate || "")
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    const days = (end - start) / DAY_MS
    return days > 0 && days < 3660 ? days : null
  }
  return null
}

function getRemainingSourceValue(billing: BillingData, amount: number, atDate = new Date()) {
  if (amount <= 0) return { value: 0, days: 0, isExpired: false, isLongTerm: false }
  const endDate = billing.endDate || ""
  if (!endDate) return { value: amount, days: null, isExpired: false, isLongTerm: false }
  if (endDate.startsWith("0000-00-00")) return { value: amount, days: null, isExpired: false, isLongTerm: true }

  const atMs = atDate.getTime()
  let endMs = Date.parse(endDate)
  if (!Number.isFinite(endMs)) return { value: 0, days: null, isExpired: false, isLongTerm: false }
  if ((endMs - atMs) / DAY_MS > LONG_TERM_DAYS) return { value: amount, days: null, isExpired: false, isLongTerm: true }

  const cycleDays = parseCycleDays(billing.cycle, billing.startDate, billing.endDate)
  if (billing.autoRenewal === "1" && cycleDays && endMs < atMs) {
    const cycleMs = cycleDays * DAY_MS
    endMs += Math.ceil((atMs - endMs) / cycleMs) * cycleMs
  }

  const daysLeft = (endMs - atMs) / DAY_MS
  if (daysLeft <= 0) return { value: 0, days: Math.floor(daysLeft), isExpired: true, isLongTerm: false }
  if (!cycleDays) return { value: amount, days: Math.ceil(daysLeft), isExpired: false, isLongTerm: false }

  return {
    value: amount * Math.min(1, daysLeft / cycleDays),
    days: Math.ceil(daysLeft),
    isExpired: false,
    isLongTerm: false,
  }
}

function getSourcePriceText(
  billing: BillingData | undefined,
  currency: string | undefined,
  unsetLabel: string,
  freeLabel: string,
): string {
  if (!billing?.amount || billing.amount === "0") return unsetLabel
  if (billing.amount === "-1") return freeLabel
  const amount = formatBillingAmount(billing.amount, currency || billing.currency)
  return billing.cycle ? `${amount}/${billing.cycle}` : amount
}

function formatEndDate(endDate: string | undefined, longTermLabel: string): string {
  if (!endDate) return "-"
  if (endDate.startsWith("0000-00-00")) return longTermLabel
  const endDay = dayjs(endDate)
  return endDay.isValid() ? endDay.format("YYYY-MM-DD") : "-"
}

function buildAssetItem(
  now: number,
  server: NezhaServer,
  rates: ExchangeRates,
  unsetLabel: string,
  freeLabel: string,
): AssetItem {
  const formatted = formatNezhaInfo(now, server)
  const parsed = server.parsed_note ?? parsePublicNote(formatted.public_note)
  const billing = parsed?.billingDataMod
  const sourceAmount = billing ? parseBillingAmountNumber(billing.amount) : null
  const sourceCurrency = normalizeBillingCurrency(resolveThemeBillingCurrency(server, billing?.currency) || billing?.currency)
  const priceCny = sourceAmount !== null && sourceAmount > 0 ? amountToCny(sourceAmount, sourceCurrency, rates) : sourceAmount === 0 ? 0 : null
  const cycleDays = billing ? parseCycleDays(billing.cycle, billing.startDate, billing.endDate) : null
  const monthlyCny = priceCny !== null && cycleDays ? priceCny / (cycleDays / 30) : null
  const remaining = billing && sourceAmount !== null ? getRemainingSourceValue(billing, sourceAmount) : null
  const remainingCny = remaining && sourceCurrency ? amountToCny(remaining.value, sourceCurrency, rates) : null
  const extra = parsed?.planDataMod?.extra || ""

  return {
    uid: server.uid || String(formatted.id),
    id: String(formatted.id),
    name: formatted.name,
    displayIndex: formatted.display_index || 0,
    formatted,
    billing,
    sourceAmount,
    sourceCurrency,
    priceCny,
    monthlyCny,
    remainingCny,
    remainingDays: remaining?.days ?? null,
    isExpired: remaining?.isExpired || false,
    isFree: !billing?.amount || billing.amount === "-1" || billing.amount === "0" || sourceAmount === 0,
    isUsageBased: false,
    isLongTerm: remaining?.isLongTerm || false,
    isFreeTagged: extra.includes("白嫖"),
    sourcePriceText: getSourcePriceText(billing, sourceCurrency, unsetLabel, freeLabel),
  }
}

function sortAssetItems(items: AssetItem[], sortBy: AssetSort) {
  return [...items].sort((a, b) => {
    if (sortBy === "weight_asc") return a.displayIndex - b.displayIndex
    if (sortBy === "weight_desc") return b.displayIndex - a.displayIndex
    const aPrice = a.priceCny ?? Number.MAX_SAFE_INTEGER
    const bPrice = b.priceCny ?? Number.MAX_SAFE_INTEGER
    return sortBy === "price_asc" ? aPrice - bPrice : bPrice - aPrice
  })
}

function useExchangeRates(refreshKey: number, enabled: boolean) {
  const { t } = useTranslation()
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_EXCHANGE_RATES)
  const [updatedTime, setUpdatedTime] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5000)

    async function fetchRates() {
      // Strictly CSP-whitelisted in CF-Server-Monitor (src/utils/csp.js)
      const apis = ["https://open.er-api.com/v6/latest/CNY", "https://api.frankfurter.app/latest?from=CNY"]
      for (const url of apis) {
        try {
          const res = await fetch(url, { cache: "no-store", signal: controller.signal })
          if (!res.ok) continue
          const data = (await res.json()) as { rates?: Record<string, unknown> }
          if (data.rates && typeof data.rates === "object" && !cancelled) {
            const cleanRates: ExchangeRates = { ...DEFAULT_EXCHANGE_RATES }
            for (const [k, v] of Object.entries(data.rates)) {
              if (typeof v === "number" && Number.isFinite(v) && v > 0) {
                cleanRates[k] = v
              }
            }
            cleanRates.CNY = 1
            setRates(cleanRates)
            setUpdatedTime(new Date().toLocaleTimeString())
            return
          }
        } catch {
          // fallback
        }
      }
      if (!cancelled) {
        setRates(DEFAULT_EXCHANGE_RATES)
        setUpdatedTime(null)
      }
    }

    fetchRates()
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [enabled, refreshKey])

  const status = updatedTime
    ? `${t("assetWidget.rateUpdated", "汇率更新")}: ${updatedTime}`
    : t("assetWidget.defaultRate", "使用默认汇率")

  return { rates, status }
}

function FinanceRow({ label, value, accentClass }: { label: string; value: string; accentClass: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-bold tabular-nums", accentClass)}>{value}</span>
    </div>
  )
}

export default function AssetSummaryWidget({ now, servers }: AssetSummaryWidgetProps) {
  const { t } = useTranslation()
  const { themeOptions } = useCfsm()
  const [open, setOpen] = useState(false)
  const [activated, setActivated] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [targetCurrency, setTargetCurrency] = useState(() =>
    getInitialCurrency(themeOptions?.asset_card_default_currency),
  )
  const [sortBy, setSortBy] = useState<AssetSort>(() => {
    return (safeStorageGet("asset_card_sort", "local") as AssetSort) || "weight_asc"
  })
  const [excludeFree, setExcludeFree] = useState(() => {
    return safeStorageGet("asset_card_exclude_free", "local") !== "false"
  })
  const [tradeItem, setTradeItem] = useState<AssetItem | null>(null)
  const [tradeAmount, setTradeAmount] = useState("")
  const [tradeDate, setTradeDate] = useState(() => dayjs().format("YYYY-MM-DD"))
  const { rates, status } = useExchangeRates(refreshKey, activated)

  useEffect(() => {
    if (!themeOptions?.asset_card_default_currency) return
    const normalized = normalizeBillingCurrency(themeOptions.asset_card_default_currency)
    if (DISPLAY_CURRENCIES.includes(normalized as (typeof DISPLAY_CURRENCIES)[number])) {
      setTargetCurrency(normalized)
    }
  }, [themeOptions?.asset_card_default_currency])

  const palette = useMemo(() => {
    const rawColor =
      themeOptions?.asset_card_color ??
      (window as unknown as Record<string, unknown>).AssetCardColor
    return ASSET_COLORS[resolveThemeColor(rawColor)]
  }, [themeOptions?.asset_card_color])

  const unsetLabel = t("assetWidget.unset", "未设置")
  const freeLabel = t("billingInfo.free", "免费")
  const longTermLabel = t("assetWidget.longTerm", "长期")
  const billingThemeSig = `${themeOptions?.cny_symbol_style ?? ""}|${themeOptions?.default_billing_currency ?? ""}|${JSON.stringify(themeOptions?.server_billing_currency_overrides ?? "")}`

  const items = useMemo(() => {
    void billingThemeSig
    return servers.map((server) => buildAssetItem(now, server, rates, unsetLabel, freeLabel))
  }, [billingThemeSig, freeLabel, now, rates, servers, unsetLabel])
  const visibleItems = useMemo(() => {
    const filtered = excludeFree ? items.filter((item) => !item.isFree && !item.isUsageBased && !item.isFreeTagged) : items
    return sortAssetItems(filtered, sortBy)
  }, [excludeFree, items, sortBy])

  const totals = useMemo(() => {
    return visibleItems.reduce(
      (acc, item) => {
        acc.unresolved += item.sourceAmount !== null && item.priceCny === null && !item.isFree && !item.isUsageBased ? 1 : 0
        acc.total += item.priceCny ?? 0
        acc.monthly += item.monthlyCny ?? 0
        acc.remaining += item.remainingCny ?? 0
        return acc
      },
      { monthly: 0, remaining: 0, total: 0, unresolved: 0 },
    )
  }, [visibleItems])

  const targetRate = rates[targetCurrency] || 1
  const exchangeRows = DISPLAY_CURRENCIES.filter((currency) => currency !== targetCurrency && rates[currency]).map((currency) => ({
    currency,
    value: rates[targetCurrency] / rates[currency],
  }))

  const selectedTradeRemaining = useMemo(() => {
    if (!tradeItem?.billing || tradeItem.sourceAmount === null) return tradeItem?.remainingCny ?? null
    const parsedDay = dayjs(tradeDate).startOf("day")
    const asOf = parsedDay.isValid() ? parsedDay.toDate() : new Date()
    const remaining = getRemainingSourceValue(tradeItem.billing, tradeItem.sourceAmount, asOf)
    return amountToCny(remaining.value, tradeItem.sourceCurrency, rates)
  }, [rates, tradeDate, tradeItem])

  const tradeRemainingValue = cnyToCurrency(selectedTradeRemaining, targetCurrency, rates)
  const tradeAmountValue = Number(tradeAmount)
  const premiumValue =
    Number.isFinite(tradeAmountValue) && tradeAmount !== "" && tradeRemainingValue !== null ? tradeAmountValue - tradeRemainingValue : null
  const premiumRate = premiumValue !== null && tradeRemainingValue && tradeRemainingValue > 0 ? (premiumValue / tradeRemainingValue) * 100 : null

  return (
    <>
      <button
        type="button"
        aria-label={t("assetWidget.openAria", "打开资产统计")}
        className={cn(
          "fixed right-5 top-[70px] z-[1041] flex size-11 items-center justify-center rounded-full border border-border bg-card/85 shadow-lg backdrop-blur-xl transition max-[576px]:right-4",
          palette.triggerText,
          open ? "pointer-events-none scale-0 opacity-0" : "scale-100 opacity-100 hover:scale-105",
        )}
        onClick={() => {
          setActivated(true)
          setOpen(true)
        }}
      >
        <CircleDollarSign className="size-6" />
      </button>

      <section
        className={cn(
          "fixed right-5 top-[70px] z-[1040] flex w-[280px] max-w-[calc(100vw-40px)] flex-col rounded-2xl border border-border bg-card/90 text-card-foreground shadow-2xl backdrop-blur-xl transition max-[576px]:right-5 max-[576px]:w-[calc(100vw-40px)]",
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-4 opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className={cn("flex items-center gap-2 text-sm font-bold", palette.panelTitle)}>
            <CircleDollarSign className="size-4" />
            {t("assetWidget.title", "资产统计")}
          </h3>
          <button
            type="button"
            aria-label={t("assetWidget.closeAria", "关闭资产统计")}
            className={cn("rounded-full p-1 text-muted-foreground transition", palette.hoverPrimary)}
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3">
          <FinanceRow label={t("assetWidget.serverCount", "服务器数量")} value={`${servers.length}`} accentClass={palette.primaryText} />
          <FinanceRow label={t("assetWidget.totalValue", "总价值")} value={formatMoney(totals.total * targetRate, targetCurrency)} accentClass={palette.primaryText} />
          <FinanceRow label={t("assetWidget.monthlyCost", "月均支出")} value={formatMoney(totals.monthly * targetRate, targetCurrency)} accentClass={palette.primaryText} />
          <FinanceRow label={t("assetWidget.annualCost", "年均支出")} value={formatMoney(totals.monthly * 12 * targetRate, targetCurrency)} accentClass={palette.primaryText} />
          <FinanceRow label={t("assetWidget.remainingValue", "剩余总价值")} value={formatMoney(totals.remaining * targetRate, targetCurrency)} accentClass={palette.primaryText} />
          {totals.unresolved > 0 && (
            <div className="flex items-start gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
              <HelpCircle className="mt-0.5 size-3 shrink-0" />
              <span>
                {t("assetWidget.unresolvedHint", {
                  defaultValue: `${totals.unresolved} 台服务器的币种未配置或无法换算，未计入汇总。`,
                  count: totals.unresolved,
                })}
              </span>
            </div>
          )}

          <div className="my-1 h-px bg-border" />

          <div className="max-h-[230px] overflow-y-auto pr-1">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => {
                const convertedValue = cnyToCurrency(item.remainingCny ?? item.priceCny, targetCurrency, rates)
                const title = item.isLongTerm
                  ? t("assetWidget.longTermHint", "长期机器按原价计入剩余价值")
                  : item.isExpired
                    ? t("billingInfo.expired", "已过期")
                    : item.remainingDays !== null
                      ? `${t("billingInfo.remaining", "剩余")} ${item.remainingDays} ${t("billingInfo.days", "天")}`
                      : item.sourcePriceText

                return (
                  <button
                    key={item.uid}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1.5 text-left text-[13px] transition hover:bg-accent"
                    onClick={() => {
                      setTradeDate(dayjs().format("YYYY-MM-DD"))
                      setTradeAmount("")
                      setTradeItem(item)
                    }}
                  >
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={item.name}>
                      {item.name}
                    </span>
                    <span
                      className={cn("flex shrink-0 items-center gap-1 font-semibold tabular-nums", palette.primaryText)}
                      title={`${item.sourcePriceText} · ${title}`}
                    >
                      {formatMoney(convertedValue, targetCurrency)}
                      {(item.isFree || item.isUsageBased || item.isFreeTagged || item.isLongTerm || item.isExpired) && (
                        <HelpCircle className="size-3 text-muted-foreground" />
                      )}
                    </span>
                  </button>
                )
              })
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">{t("assetWidget.empty", "没有可显示的资产项目")}</p>
            )}
          </div>

          <p className="text-right text-[11px] text-muted-foreground">{status}</p>

          <div className="max-h-[120px] overflow-y-auto rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
            {exchangeRows.map((row) => (
              <div key={row.currency} className="flex justify-between gap-3 tabular-nums">
                <span>1 {row.currency}</span>
                <span className={cn("font-medium", palette.primaryText)}>{formatMoney(row.value, targetCurrency)}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <div className="flex gap-2">
              <select
                className="h-7 rounded border border-border bg-card px-1.5 text-[11px] outline-none"
                value={targetCurrency}
                onChange={(event) => {
                  setTargetCurrency(event.target.value)
                  safeStorageSet("asset_card_currency", event.target.value, "local")
                }}
              >
                {DISPLAY_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency} ({CURRENCY_SYMBOLS[currency]})
                  </option>
                ))}
              </select>
              <select
                className="h-7 rounded border border-border bg-card px-1.5 text-[11px] outline-none"
                value={sortBy}
                onChange={(event) => {
                  const nextSort = event.target.value as AssetSort
                  setSortBy(nextSort)
                  safeStorageSet("asset_card_sort", nextSort, "local")
                }}
              >
                <option value="weight_asc">{t("assetWidget.sortWeightAsc", "权重 正序")}</option>
                <option value="weight_desc">{t("assetWidget.sortWeightDesc", "权重 倒序")}</option>
                <option value="price_asc">{t("assetWidget.sortPriceAsc", "价格 正序")}</option>
                <option value="price_desc">{t("assetWidget.sortPriceDesc", "价格 倒序")}</option>
              </select>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label={t("assetWidget.toggleFree", "切换免费资产")}
                className={cn("rounded p-1 text-muted-foreground transition", palette.hoverPrimary, excludeFree && palette.primaryText)}
                onClick={() => {
                  const nextValue = !excludeFree
                  setExcludeFree(nextValue)
                  safeStorageSet("asset_card_exclude_free", String(nextValue), "local")
                }}
                title={excludeFree ? t("assetWidget.excludingFree", "当前：已排除免费/白嫖") : t("assetWidget.includingFree", "当前：包含免费/白嫖")}
              >
                <Heart className="size-4" />
              </button>
              <button
                type="button"
                aria-label={t("assetWidget.refreshRate", "刷新汇率")}
                className={cn("rounded p-1 text-muted-foreground transition", palette.hoverPrimary)}
                onClick={() => setRefreshKey((value) => value + 1)}
                title={t("assetWidget.refreshRate", "刷新汇率")}
              >
                <RefreshCw className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {tradeItem && (
        <div
          className="fixed inset-0 z-[1999] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm"
          onClick={() => setTradeItem(null)}
        >
          <section
            className="max-h-[90vh] w-full max-w-[550px] overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className={cn("flex items-center gap-2 text-sm font-bold", palette.panelTitle)}>
                <CircleDollarSign className="size-4" />
                {t("assetWidget.tradeTitle", "服务器交易")}
              </h3>
              <button
                type="button"
                aria-label={t("assetWidget.closeTrade", "关闭交易计算")}
                className={cn("rounded-full p-1 text-muted-foreground transition", palette.hoverPrimary)}
                onClick={() => setTradeItem(null)}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[calc(90vh-52px)] overflow-y-auto p-4">
              <div className={cn("mb-3 text-sm font-bold", palette.panelTitle)}>{t("assetWidget.serverInfo", "服务器信息")}</div>
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-muted/30 text-[13px]">
                <div className="border-b border-r border-border p-2">
                  <span className="text-muted-foreground">{t("assetWidget.name", "名称")}</span>
                  <p className="font-medium">{tradeItem.name}</p>
                </div>
                <div className="border-b border-border p-2">
                  <span className="text-muted-foreground">CPU</span>
                  <p className="font-medium tabular-nums">{tradeItem.formatted.cpu.toFixed(2)}%</p>
                </div>
                <div className="border-b border-r border-border p-2">
                  <span className="text-muted-foreground">{t("serverDetail.mem", "内存")}</span>
                  <p className="font-medium tabular-nums">{formatBytes(tradeItem.formatted.mem_total)}</p>
                </div>
                <div className="border-b border-border p-2">
                  <span className="text-muted-foreground">{t("serverDetail.disk", "硬盘")}</span>
                  <p className="font-medium tabular-nums">{formatBytes(tradeItem.formatted.disk_total)}</p>
                </div>
                <div className="border-b border-r border-border p-2">
                  <span className="text-muted-foreground">{t("assetWidget.monthlyTraffic", "月流量")}</span>
                  <p className="font-medium tabular-nums">
                    {tradeItem.formatted.traffic_limit > 0
                      ? `${formatBytes(
                          calcTrafficUsed(
                            tradeItem.formatted.net_tx_monthly,
                            tradeItem.formatted.net_rx_monthly,
                            tradeItem.formatted.traffic_limit_type,
                          ),
                        )} / ${formatBytes(tradeItem.formatted.traffic_limit)}`
                      : "-"}
                  </p>
                </div>
                <div className="border-b border-border p-2">
                  <span className="text-muted-foreground">{t("assetWidget.originalPrice", "原价")}</span>
                  <p className="font-medium">{tradeItem.sourcePriceText}</p>
                </div>
                <div className="col-span-2 p-2">
                  <span className="text-muted-foreground">{t("assetWidget.expireDate", "到期时间")}</span>
                  <p className="font-medium">{formatEndDate(tradeItem.billing?.endDate, longTermLabel)}</p>
                </div>
              </div>

              <div className="my-4 h-px bg-border" />
              <div className={cn("mb-3 text-sm font-bold", palette.panelTitle)}>{t("assetWidget.tradeCalc", "交易计算")}</div>
              <div className="grid gap-3">
                <label className="grid gap-1 text-[13px] font-semibold text-muted-foreground">
                  {t("assetWidget.tradeDate", "交易日期")}
                  <input
                    className={cn("h-9 rounded-md border border-border bg-background px-3 text-foreground outline-none focus:ring-2", palette.focusInput)}
                    type="date"
                    value={tradeDate}
                    onChange={(event) => setTradeDate(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-[13px] font-semibold text-muted-foreground">
                  {t("assetWidget.tradeAmount", "交易金额")}
                  <input
                    className={cn(
                      "h-11 rounded-md border-2 border-border bg-background px-3 text-base font-bold outline-none transition focus:ring-2",
                      palette.primaryText,
                      palette.focusInput,
                    )}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("assetWidget.tradeAmountPlaceholder", "请输入交易金额")}
                    value={tradeAmount}
                    onChange={(event) => setTradeAmount(event.target.value)}
                  />
                </label>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-1 text-[13px]">
                  <div className="flex justify-between border-b border-border py-2">
                    <span className="text-muted-foreground">{t("assetWidget.remainingVal", "剩余价值")}</span>
                    <span className={cn("font-semibold tabular-nums", palette.primaryText)}>
                      {formatMoney(tradeRemainingValue, targetCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border py-2">
                    <span className="text-muted-foreground">{t("assetWidget.premiumAmount", "溢价金额")}</span>
                    <span className={cn("font-semibold tabular-nums text-red-600", premiumValue !== null && premiumValue <= 0 && "text-green-600")}>
                      {premiumValue === null ? "-" : formatMoney(premiumValue, targetCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-muted-foreground">{t("assetWidget.premiumRate", "溢价率")}</span>
                    <span className={cn("font-semibold tabular-nums text-red-600", premiumValue !== null && premiumValue <= 0 && "text-green-600")}>
                      {premiumRate === null ? "-" : `${premiumRate > 0 ? "+" : ""}${premiumRate.toFixed(2)}%`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
