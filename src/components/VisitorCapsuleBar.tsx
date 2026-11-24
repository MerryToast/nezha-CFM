import ServerFlag from "@/components/ServerFlag"
import { CAPSULE_COLORS, resolveThemeColor } from "@/lib/theme-colors"
import { cn } from "@/lib/utils"
import { Globe2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

type VisitorInfo = {
  ip: string
  country: string
  code: string
  org: string
}

const VISITOR_SESSION_KEY = "cfsm_visitor_info"
// Strictly CSP-whitelisted endpoints in CF-Server-Monitor (src/utils/csp.js)
const VISITOR_APIS = ["https://ipapi.co/json/", "https://api.ip.sb/geoip", "https://ipwho.is/"]

function readSessionVisitorInfo(): VisitorInfo | null {
  try {
    const raw = sessionStorage.getItem(VISITOR_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VisitorInfo>
    if (parsed && typeof parsed.ip === "string" && parsed.ip) {
      return {
        ip: parsed.ip,
        country: String(parsed.country || "Global"),
        code: String(parsed.code || "UN"),
        org: String(parsed.org || "Internet"),
      }
    }
  } catch {
    // ignore storage errors
  }
  return null
}

function writeSessionVisitorInfo(info: VisitorInfo): void {
  try {
    sessionStorage.setItem(VISITOR_SESSION_KEY, JSON.stringify(info))
  } catch {
    // ignore storage errors
  }
}

async function fetchWithTimeout(url: string, signal: AbortSignal, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  signal.addEventListener("abort", onParentAbort, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
    signal.removeEventListener("abort", onParentAbort)
  }
}

function normalizeVisitorInfo(data: Record<string, any>): VisitorInfo {
  const ip = data.ip || data.ipAddress || data.query
  if (!ip) {
    throw new Error("Visitor IP is missing")
  }

  return {
    ip: String(ip),
    country: String(data.country_name || data.countryName || data.country || "Global"),
    code: String(data.country_code || data.countryCode || "UN").toUpperCase(),
    org: String(data.org || data.isp || data.asn_organization || data.organization || data.connection?.isp || "Internet"),
  }
}

async function fetchVisitorInfo(outerSignal: AbortSignal): Promise<VisitorInfo> {
  const cached = readSessionVisitorInfo()
  if (cached) return cached

  return new Promise((resolve, reject) => {
    let pending = VISITOR_APIS.length
    let resolved = false
    const controllers = VISITOR_APIS.map(() => new AbortController())

    const abortAll = () => {
      for (const ctrl of controllers) {
        ctrl.abort()
      }
    }

    const onOuterAbort = () => {
      abortAll()
      if (!resolved) {
        resolved = true
        reject(new DOMException("Aborted", "AbortError"))
      }
    }
    outerSignal.addEventListener("abort", onOuterAbort, { once: true })

    VISITOR_APIS.forEach((url, index) => {
      ;(async () => {
        try {
          const res = await fetchWithTimeout(url, controllers[index].signal)
          if (!res.ok) throw new Error("Visitor API failed")
          const data = (await res.json()) as Record<string, any>
          const info = normalizeVisitorInfo(data)
          if (!resolved) {
            resolved = true
            writeSessionVisitorInfo(info)
            controllers.forEach((ctrl, idx) => {
              if (idx !== index) ctrl.abort()
            })
            outerSignal.removeEventListener("abort", onOuterAbort)
            resolve(info)
          }
        } catch (error) {
          pending -= 1
          if (!resolved && pending === 0) {
            outerSignal.removeEventListener("abort", onOuterAbort)
            reject(error)
          }
        }
      })()
    })
  })
}

export default function VisitorCapsuleBar() {
  const { t } = useTranslation()
  const [visitorInfo, setVisitorInfo] = useState<VisitorInfo | null>(() => readSessionVisitorInfo())
  const [hasError, setHasError] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    const showTimer = window.setTimeout(() => setActive(true), 1000)
    const hideTimer = window.setTimeout(() => setActive(false), 12000)

    fetchVisitorInfo(controller.signal)
      .then((info) => {
        if (mounted) setVisitorInfo(info)
      })
      .catch(() => {
        if (mounted && !controller.signal.aborted) setHasError(true)
      })

    return () => {
      mounted = false
      controller.abort()
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  const canShowFlag = visitorInfo?.code && /^[A-Z]{2}$/.test(visitorInfo.code) && visitorInfo.code !== "UN"

  const palette = useMemo(() => {
    const colorKey = resolveThemeColor((window as unknown as Record<string, unknown>).VisitorCapsuleColor)
    return CAPSULE_COLORS[colorKey]
  }, [])

  return (
    <div
      className={cn(
        "fixed bottom-[30px] left-1/2 z-[10001] flex max-w-[95vw] -translate-x-1/2 translate-y-[50px] items-center gap-2 whitespace-nowrap rounded-full border px-5 py-2 text-[13px] font-medium opacity-0 backdrop-blur-xl transition-all duration-700 max-[768px]:bottom-4 max-[768px]:scale-75 max-[768px]:px-3 max-[768px]:py-1.5 max-[768px]:text-xs",
        palette.container,
        active ? "translate-y-0 opacity-100" : "pointer-events-none invisible",
      )}
    >
      <span className={cn("flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border", palette.iconWrap)}>
        {canShowFlag ? <ServerFlag country_code={visitorInfo!.code.toLowerCase()} /> : <Globe2 className="size-4" />}
      </span>
      {visitorInfo ? (
        <span className="flex min-w-0 items-center gap-2">
          <span>
            <span className={cn("font-semibold", palette.ipLabel)}>IP:</span> {visitorInfo.ip}
          </span>
          <span className={cn("h-3 w-px", palette.divider)} />
          <span className="max-[768px]:hidden">{visitorInfo.country}</span>
          <span className="hidden max-[768px]:inline">{visitorInfo.code}</span>
          <span className={cn("h-3 w-px", palette.divider)} />
          <span className="inline-block max-w-[140px] overflow-hidden text-ellipsis align-bottom" title={visitorInfo.org}>
            {visitorInfo.org}
          </span>
        </span>
      ) : hasError ? (
        <span className="flex items-center gap-2">
          <span className={cn("font-semibold", palette.errorAccent)}>Hello!</span>
          <span className={cn("h-3 w-px", palette.divider)} />
          <span>{t("visitorCapsule.welcomeBack", "欢迎回来")}</span>
        </span>
      ) : (
        <span>{t("visitorCapsule.loading", "Loading...")}</span>
      )}
    </div>
  )
}
