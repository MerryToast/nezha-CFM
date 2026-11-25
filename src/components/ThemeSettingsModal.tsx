import { getAdminEntryUrl } from "@/api/cfsm-client"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useCfsm } from "@/hooks/use-cfsm"
import { sanitizeSafeUrl } from "@/lib/security"
import { THEME_COLOR_KEYS, ThemeColorKey } from "@/lib/theme-colors"
import { CfsmThemeOptions } from "@/types/cfsm"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

interface ThemeSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_DRAFT: CfsmThemeOptions = {
  site_desc: "",
  custom_logo: "",
  custom_background_image: "",
  custom_mobile_background_image: "",
  custom_illustration: "",
  custom_links: "",
  force_theme: "system",
  force_show_services: false,
  force_show_map: false,
  force_card_inline: false,
  group_order: "",
  disable_animated_man: true,
  force_use_svg_flag: false,
  show_traffic_bar: true,
  show_visitor_capsule: false,
  visitor_capsule_color: "blue",
  show_asset_card: false,
  asset_card_color: "blue",
  asset_card_default_currency: "CNY",
  force_peak_cut_enabled: false,
  fixed_top_server_name: false,
  show_net_transfer: false,
  hide_ipv4_ipv6_tag: false,
  hide_traffic_vol_tag: false,
  default_billing_currency: "跟随后端",
  cny_symbol_style: "¥",
  server_billing_currency_overrides: "",
  traffic_bar_show_percent: true,
  traffic_bar_show_reset_day: true,
  traffic_bar_show_billing_mode: true,
  traffic_reset_day_overrides: "",
}

const DEFAULT_BILLING_CURRENCIES = [
  "跟随后端",
  "CNY",
  "USD",
  "HKD",
  "EUR",
  "GBP",
  "JPY",
  "KRW",
  "SGD",
  "CAD",
  "AUD",
] as const

function toStringValue(val: unknown): string {
  if (val === null || val === undefined) return ""
  if (typeof val === "string") return val
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}

function isPlainJsonObjectText(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === "") return true
  if (typeof raw === "object" && !Array.isArray(raw)) return true
  if (typeof raw !== "string") return false
  const trimmed = raw.trim()
  if (!trimmed) return true
  try {
    const parsed = JSON.parse(trimmed)
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed))
  } catch {
    return false
  }
}

export default function ThemeSettingsModal({ open, onOpenChange }: ThemeSettingsModalProps) {
  const { t } = useTranslation()
  const { config, themeOptions, setLocalThemeOptions, saveRemoteThemeOptions } = useCfsm()
  const [draft, setDraft] = useState<CfsmThemeOptions>({ ...DEFAULT_DRAFT, ...themeOptions })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft({ ...DEFAULT_DRAFT, ...themeOptions })
    }
  }, [open, themeOptions])

  const isAuthorized = config?.authorization === true

  const updateField = <K extends keyof CfsmThemeOptions>(key: K, value: CfsmThemeOptions[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const validateDraft = (src: CfsmThemeOptions): string | null => {
    const urlFields: Array<[string, unknown]> = [
      [t("themeSettings.customLogo", "自定义 Logo URL"), src.custom_logo],
      [t("themeSettings.desktopBg", "桌面端背景图 URL"), src.custom_background_image],
      [t("themeSettings.mobileBg", "移动端背景图 URL"), src.custom_mobile_background_image],
      [t("themeSettings.illustration", "概览插图 URL"), src.custom_illustration],
    ]
    for (const [label, val] of urlFields) {
      if (typeof val === "string" && val.trim() && !sanitizeSafeUrl(val, { allowRelative: true, allowHash: false })) {
        return `${label}: ${t("themeSettings.invalidUrl", "仅支持 http(s) 或以 / 开头的安全地址")}`
      }
    }

    if (typeof src.custom_links === "string" && src.custom_links.trim()) {
      try {
        const parsed = JSON.parse(src.custom_links.trim())
        if (!Array.isArray(parsed)) {
          return t("themeSettings.invalidCustomLinks", "顶部自定义链接必须是 JSON 数组")
        }
        for (const item of parsed) {
          if (item && typeof item === "object" && "link" in item) {
            const linkVal = (item as Record<string, unknown>).link
            if (typeof linkVal !== "string" || !sanitizeSafeUrl(linkVal, { allowRelative: true, allowHash: true })) {
              return t("themeSettings.invalidCustomLinkUrl", "顶部自定义链接包含不安全或无效的 URL")
            }
          }
        }
      } catch {
        return t("themeSettings.invalidCustomLinks", "顶部自定义链接必须是合法的 JSON 数组")
      }
    }

    if (!isPlainJsonObjectText(src.server_billing_currency_overrides)) {
      return t("themeSettings.invalidCurrencyOverrides", "节点币种覆盖必须是合法的 JSON 对象")
    }
    if (!isPlainJsonObjectText(src.traffic_reset_day_overrides)) {
      return t("themeSettings.invalidResetOverrides", "流量重置日覆盖必须是合法的 JSON 对象")
    }

    return null
  }

  const normalizeForSave = (src: CfsmThemeOptions): CfsmThemeOptions => {
    const cleaned: CfsmThemeOptions = { ...src }

    for (const jsonArrayKey of ["custom_links"] as const) {
      const val = cleaned[jsonArrayKey]
      if (typeof val === "string") {
        const trimmed = val.trim()
        if (!trimmed) {
          delete cleaned[jsonArrayKey]
        } else {
          try {
            const parsed = JSON.parse(trimmed)
            if (Array.isArray(parsed)) cleaned[jsonArrayKey] = parsed
          } catch {
            // keep validated value
          }
        }
      }
    }

    for (const jsonObjKey of ["server_billing_currency_overrides", "traffic_reset_day_overrides"] as const) {
      const val = cleaned[jsonObjKey]
      if (typeof val === "string") {
        const trimmed = val.trim()
        if (!trimmed) {
          delete cleaned[jsonObjKey]
        } else {
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              cleaned[jsonObjKey] = parsed
            }
          } catch {
            // keep validated value
          }
        }
      }
    }

    // Strip redundant empty string fields so theme_options stays compact
    for (const [key, val] of Object.entries(cleaned)) {
      if (typeof val === "string" && val.trim() === "") {
        delete cleaned[key]
      }
    }

    return cleaned
  }

  const handleSave = async () => {
    const validationError = validateDraft(draft)
    if (validationError) {
      toast.error(validationError)
      return
    }

    const normalized = normalizeForSave(draft)
    if (!isAuthorized) {
      setLocalThemeOptions(normalized)
      toast.success(t("themeSettings.previewApplied", "已应用本地临时预览（管理员登录后可保存到服务端）"))
      onOpenChange(false)
      return
    }

    setSaving(true)
    try {
      await saveRemoteThemeOptions(normalized)
      toast.success(t("themeSettings.saved", "主题配置已保存到服务端"))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("themeSettings.saveFailed", "保存失败"))
    } finally {
      setSaving(false)
    }
  }

  const switchItem = (key: keyof CfsmThemeOptions, label: string, checked: boolean) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label className="text-xs font-normal cursor-pointer" htmlFor={`opt-${String(key)}`}>
        {label}
      </Label>
      <Switch
        id={`opt-${String(key)}`}
        checked={checked}
        onCheckedChange={(val) => updateField(key, val as never)}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[540px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("themeSettings.title", "主题外观与功能设置")}</DialogTitle>
          <DialogDescription>
            {isAuthorized
              ? t("themeSettings.adminDesc", "当前已登录管理员，保存后将通过 POST /api/theme_options 持久化到服务端。")
              : t("themeSettings.guestDesc", "当前为访客模式，可临时预览；持久化保存需先登录管理后台。")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-xs font-semibold text-muted-foreground">{t("themeSettings.appearance", "外观设置")}</p>
            <div className="grid gap-2">
              <Label className="text-xs">{t("themeSettings.siteDesc", "页头副标题描述")}</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Server Monitor"
                value={String(draft.site_desc || "")}
                onChange={(e) => updateField("site_desc", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">{t("themeSettings.customLogo", "自定义 Logo URL")}</Label>
              <Input
                className="h-8 text-xs"
                placeholder="https://... 或留空使用默认图标"
                value={String(draft.custom_logo || "")}
                onChange={(e) => updateField("custom_logo", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">{t("themeSettings.desktopBg", "桌面端背景图 URL")}</Label>
              <Input
                className="h-8 text-xs"
                placeholder="https://... 或留空使用默认背景"
                value={String(draft.custom_background_image || "")}
                onChange={(e) => updateField("custom_background_image", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">{t("themeSettings.mobileBg", "移动端背景图 URL")}</Label>
              <Input
                className="h-8 text-xs"
                placeholder="https://... 或留空同步桌面端背景"
                value={String(draft.custom_mobile_background_image || "")}
                onChange={(e) => updateField("custom_mobile_background_image", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">{t("themeSettings.illustration", "概览插图 URL")}</Label>
              <Input
                className="h-8 text-xs"
                placeholder="https://... 或留空使用默认插图"
                value={String(draft.custom_illustration || "")}
                onChange={(e) => updateField("custom_illustration", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">{t("themeSettings.customLinks", "顶部自定义链接 (JSON)")}</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder='[{"name":"Docs","link":"https://example.com"}]'
                value={toStringValue(draft.custom_links)}
                onChange={(e) => updateField("custom_links", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">{t("themeSettings.groupOrder", "分组显示顺序 (逗号分隔)")}</Label>
              <Input
                className="h-8 text-xs"
                placeholder="HK, JP, US"
                value={String(draft.group_order || "")}
                onChange={(e) => updateField("group_order", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("themeSettings.forceTheme", "主题模式覆盖")}</Label>
                <Select
                  value={String(draft.force_theme || "system")}
                  onValueChange={(v) => updateField("force_theme", v as "system" | "dark" | "light")}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system" className="text-xs">
                      {t("themeSettings.followSystemSite", "跟随系统/站点")}
                    </SelectItem>
                    <SelectItem value="light" className="text-xs">Light</SelectItem>
                    <SelectItem value="dark" className="text-xs">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("themeSettings.cnyStyle", "人民币符号风格")}</Label>
                <Select
                  value={String(draft.cny_symbol_style || "¥")}
                  onValueChange={(v) => updateField("cny_symbol_style", v as "¥" | "CNY")}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="¥" className="text-xs">¥</SelectItem>
                    <SelectItem value="CNY" className="text-xs">CNY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t("themeSettings.layout", "卡片与布局")}</p>
            {switchItem("force_show_map", t("themeSettings.forceShowMap", "默认展开全球地图"), draft.force_show_map === true)}
            {switchItem("force_show_services", t("themeSettings.forceShowServices", "默认展开三网延迟面板"), draft.force_show_services === true)}
            {switchItem("force_card_inline", t("themeSettings.forceCardInline", "默认行内紧凑视图"), draft.force_card_inline === true)}
            {switchItem("fixed_top_server_name", t("themeSettings.fixedTopName", "卡片顶部固定节点名称"), draft.fixed_top_server_name === true)}
            {switchItem("show_net_transfer", t("themeSettings.showNetTransfer", "卡片底部显示累计上下行流量"), draft.show_net_transfer === true)}
            {switchItem("hide_ipv4_ipv6_tag", t("themeSettings.hideIpTag", "隐藏 IPv4/IPv6 标签"), draft.hide_ipv4_ipv6_tag === true)}
            {switchItem("hide_traffic_vol_tag", t("themeSettings.hideVolTag", "隐藏流量配额标签"), draft.hide_traffic_vol_tag === true)}
            {switchItem("force_use_svg_flag", t("themeSettings.svgFlag", "强制使用 SVG 国旗"), draft.force_use_svg_flag === true)}
            {switchItem("disable_animated_man", t("themeSettings.disableMan", "隐藏首页概览动画插图"), draft.disable_animated_man !== false)}
            {switchItem("force_peak_cut_enabled", t("themeSettings.peakCut", "默认开启网络延迟图表削峰"), draft.force_peak_cut_enabled === true)}
          </div>

          <div className="space-y-1.5 rounded-xl border p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t("themeSettings.trafficBar", "流量进度条与插件")}</p>
            {switchItem("show_traffic_bar", t("themeSettings.showTrafficBar", "显示内置流量进度条"), draft.show_traffic_bar !== false)}
            {switchItem("traffic_bar_show_percent", t("themeSettings.tbPercent", "进度条显示已用百分比"), draft.traffic_bar_show_percent !== false)}
            {switchItem("traffic_bar_show_reset_day", t("themeSettings.tbReset", "进度条显示流量重置倒计时"), draft.traffic_bar_show_reset_day !== false)}
            {switchItem("traffic_bar_show_billing_mode", t("themeSettings.tbMode", "进度条显示流量计费模式"), draft.traffic_bar_show_billing_mode !== false)}
            {switchItem("show_asset_card", t("themeSettings.showAssetCard", "显示右上角资产统计浮窗"), draft.show_asset_card === true)}
            {switchItem("show_visitor_capsule", t("themeSettings.showVisitorCapsule", "显示底部访客信息胶囊"), draft.show_visitor_capsule === true)}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("themeSettings.assetColor", "资产卡片主色")}</Label>
                <Select
                  value={String(draft.asset_card_color || "blue")}
                  onValueChange={(v) => updateField("asset_card_color", v as ThemeColorKey)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEME_COLOR_KEYS.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("themeSettings.capsuleColor", "访客胶囊主色")}</Label>
                <Select
                  value={String(draft.visitor_capsule_color || "blue")}
                  onValueChange={(v) => updateField("visitor_capsule_color", v as ThemeColorKey)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEME_COLOR_KEYS.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("themeSettings.assetCurrency", "资产默认币种")}</Label>
                <Select
                  value={String(draft.asset_card_default_currency || "CNY")}
                  onValueChange={(v) => updateField("asset_card_default_currency", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["CNY", "USD", "HKD", "EUR", "GBP", "JPY"].map((cur) => (
                      <SelectItem key={cur} value={cur} className="text-xs">
                        {cur}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("themeSettings.defaultBillingCurrency", "节点默认计费币种")}</Label>
                <Select
                  value={String(draft.default_billing_currency || "跟随后端")}
                  onValueChange={(v) => updateField("default_billing_currency", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_BILLING_CURRENCIES.map((cur) => (
                      <SelectItem key={cur} value={cur} className="text-xs">
                        {cur === "跟随后端" ? t("themeSettings.followBackend", "跟随后端") : cur}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Accordion type="single" collapsible className="pt-2">
              <AccordionItem value="advanced-overrides" className="border-none">
                <AccordionTrigger className="py-1.5 text-xs font-medium text-muted-foreground hover:no-underline">
                  {t("themeSettings.advancedOverrides", "高级 JSON 覆盖配置（节点币种 / 重置日）")}
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 pb-0">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">
                      {t("themeSettings.currencyOverrides", "单节点计费币种覆盖 (JSON)")}
                    </Label>
                    <Input
                      className="h-8 text-xs font-mono"
                      placeholder='{"HK-01":"USD","node-uuid":"CNY"}'
                      value={toStringValue(draft.server_billing_currency_overrides)}
                      onChange={(e) => updateField("server_billing_currency_overrides", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">
                      {t("themeSettings.resetDayOverrides", "单节点流量重置日覆盖 (JSON)")}
                    </Label>
                    <Input
                      className="h-8 text-xs font-mono"
                      placeholder='{"HK-01":15,"node-uuid":1}'
                      value={toStringValue(draft.traffic_reset_day_overrides)}
                      onChange={(e) => updateField("traffic_reset_day_overrides", e.target.value)}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
          {!isAuthorized ? (
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <a href={getAdminEntryUrl()}>{t("themeSettings.goAdminLogin", "前往后台登录")}</a>
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("cancel", "取消")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving
                ? t("saving", "保存中...")
                : isAuthorized
                  ? t("themeSettings.saveServer", "保存到服务端")
                  : t("themeSettings.previewOnly", "仅临时预览")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
