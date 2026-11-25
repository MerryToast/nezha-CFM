import { getAdminEntryUrl } from "@/api/cfsm-client"
import { ModeToggle } from "@/components/ThemeSwitcher"
import ThemeSettingsModal from "@/components/ThemeSettingsModal"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useBackground } from "@/hooks/use-background"
import { useCfsm } from "@/hooks/use-cfsm"
import { sanitizeSafeUrl } from "@/lib/security"
import { cn } from "@/lib/utils"
import NumberFlow, { NumberFlowGroup } from "@number-flow/react"
import { Activity, ImageMinus, LogIn, SlidersHorizontal } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { LanguageSwitcher } from "./LanguageSwitcher"
import { SearchButton } from "./SearchButton"
import { Button } from "./ui/button"

type CustomLink = {
  link: string
  name: string
}

function sanitizeCustomLinkList(items: unknown[]): CustomLink[] {
  const result: CustomLink[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === "string" ? record.name.trim() : ""
    const safeLink = sanitizeSafeUrl(record.link, { allowRelative: true, allowHash: true })
    if (name && safeLink) {
      result.push({ name, link: safeLink })
    }
  }
  return result
}

function parseCustomLinks(raw: unknown): CustomLink[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return sanitizeCustomLinkList(raw)
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return sanitizeCustomLinkList(parsed)
      }
    } catch {
      return []
    }
  }
  return []
}

function Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { config, configLoading, themeOptions } = useCfsm()
  const { hasConfiguredBackground, hasActiveBackground, toggleBackground } = useBackground()
  const [logoError, setLogoError] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  const siteName = config?.site_title || "CF Server Monitor"
  const customLogo = sanitizeSafeUrl(themeOptions.custom_logo, { allowHash: false })
  const customDesc =
    (typeof themeOptions.site_desc === "string" && themeOptions.site_desc.trim()) ||
    "Server Status"
  const customBackgroundImage = hasActiveBackground

  useEffect(() => {
    setLogoError(false)
  }, [customLogo])

  const adminUrl = getAdminEntryUrl()
  const customLinks = useMemo(() => parseCustomLinks(themeOptions.custom_links), [themeOptions.custom_links])

  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="flex items-center justify-between header-top">
        <section
          onClick={() => {
            sessionStorage.removeItem("selectedGroup")
            navigate("/")
          }}
          className="cursor-pointer flex items-center sm:text-base text-sm font-medium min-w-0"
        >
          <div className="mr-2 flex flex-row items-center justify-start header-logo shrink-0">
            {customLogo && !logoError ? (
              <img
                width={24}
                height={24}
                alt="site logo"
                src={customLogo}
                onError={() => setLogoError(true)}
                className="relative m-0! h-6 w-6 rounded-md object-cover object-center"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
                <Activity className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
          {configLoading && !config ? (
            <Skeleton className="h-6 w-24 rounded-[5px] bg-muted-foreground/10 animate-none" />
          ) : (
            <span className="truncate">{siteName}</span>
          )}
          <Separator orientation="vertical" className="mx-2 hidden h-4 w-[1px] md:block" />
          <p className="hidden text-sm font-medium opacity-40 md:block truncate">{customDesc}</p>
        </section>

        <section className="flex items-center gap-2 header-handles shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <Links links={customLinks} />
          </div>
          <SearchButton />
          <LanguageSwitcher />
          <ModeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsModalOpen(true)}
            className={cn("rounded-full px-[9px] bg-white dark:bg-black", {
              "bg-white/70 dark:bg-black/70": customBackgroundImage,
            })}
            title={t("themeSettings.title", "主题设置")}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
          {hasConfiguredBackground && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleBackground}
              className={cn("rounded-full px-[9px] bg-white dark:bg-black", {
                "bg-white/70 dark:bg-black/70": customBackgroundImage,
              })}
              title={t("toggleBackground", "切换背景")}
            >
              <ImageMinus className="w-4 h-4" />
            </Button>
          )}
          <a href={adminUrl} target="_blank" rel="noopener noreferrer">
            <Button
              variant="outline"
              size="sm"
              className={cn("rounded-full px-[9px] bg-white dark:bg-black", {
                "bg-white/70 dark:bg-black/70": customBackgroundImage,
              })}
              title={config?.authorization ? t("dashboard", "管理后台") : t("login", "登录")}
            >
              <LogIn className="w-4 h-4" />
            </Button>
          </a>
        </section>
      </section>

      {customLinks.length > 0 && (
        <div className="w-full flex justify-end sm:hidden mt-2">
          <Links links={customLinks} />
        </div>
      )}

      <Overview />
      <ThemeSettingsModal open={settingsModalOpen} onOpenChange={setSettingsModalOpen} />
    </div>
  )
}

function Links({ links }: { links: CustomLink[] }) {
  if (!links.length) return null

  return (
    <div className="flex items-center gap-2 w-fit">
      {links.map((link, index) => (
        <a
          key={`${link.link}-${index}`}
          href={link.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm font-medium opacity-50 transition-opacity hover:opacity-100"
        >
          {link.name}
        </a>
      ))}
    </div>
  )
}

function getCurrentClock() {
  const d = new Date()
  return {
    hh: d.getHours(),
    mm: d.getMinutes(),
    ss: d.getSeconds(),
  }
}

function Overview() {
  const { t } = useTranslation()
  const [time, setTime] = useState(getCurrentClock)

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(getCurrentClock())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <section className="mt-10 flex flex-col md:mt-16 header-timer">
      <p className="text-base font-semibold">👋 {t("overview")}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium opacity-50">{t("whereTheTimeIs")}</p>
        <NumberFlowGroup>
          <div style={{ fontVariantNumeric: "tabular-nums" }} className="flex text-sm font-medium mt-0.5">
            <NumberFlow trend={1} value={time.hh} format={{ minimumIntegerDigits: 2 }} />
            <NumberFlow prefix=":" trend={1} value={time.mm} digits={{ 1: { max: 5 } }} format={{ minimumIntegerDigits: 2 }} />
            <p className="mt-[0.5px]">:{time.ss.toString().padStart(2, "0")}</p>
          </div>
        </NumberFlowGroup>
      </div>
    </section>
  )
}

export default Header
