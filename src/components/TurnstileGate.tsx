import { getApiBases, hasMultipleApiBases } from "@/api/cfsm-client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useCfsm } from "@/hooks/use-cfsm"
import { useTheme } from "@/hooks/use-theme"
import { clearTurnstileStorage, loadTurnstileScript } from "@/lib/turnstile"
import { ShieldCheck } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

export default function TurnstileGate() {
  const { t } = useTranslation()
  const { config, completeTurnstile } = useCfsm()
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "verifying" | "error">("loading")
  const [retrySeq, setRetrySeq] = useState(0)

  const siteKey = config?.turnstile_site_key || ""
  const apiIndex = config?.turnstile_api_index ?? 0
  const targetBaseUrl = getApiBases()[apiIndex] || getApiBases()[0] || ""
  const multiBackend = hasMultipleApiBases()

  const resolvedTheme =
    theme === "dark" || theme === "light"
      ? theme
      : typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    setStatus("loading")

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        containerRef.current.innerHTML = ""
        setStatus("ready")
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: resolvedTheme,
          callback: async (token: string) => {
            if (cancelled) return
            setStatus("verifying")
            const ok = await completeTurnstile(token)
            if (!cancelled && !ok) {
              clearTurnstileStorage(targetBaseUrl)
              setStatus("error")
            }
          },
          "error-callback": () => {
            if (!cancelled) setStatus("error")
          },
          "expired-callback": () => {
            clearTurnstileStorage(targetBaseUrl)
            if (!cancelled) setStatus("error")
          },
        })
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // ignore
        }
        widgetIdRef.current = null
      }
    }
  }, [apiIndex, completeTurnstile, resolvedTheme, retrySeq, siteKey, targetBaseUrl])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-5 rounded-3xl border-neutral-200/70 bg-white/90 p-6 shadow-2xl shadow-black/5 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/85">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{config?.site_title || "Server Monitor"}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {t("turnstile.title", "人机验证")}
              {multiBackend ? ` (#${apiIndex + 1})` : ""}
            </p>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("turnstile.desc", "当前站点已启用 Cloudflare Turnstile 验证，请完成验证后继续访问监控面板。")}
          {multiBackend && targetBaseUrl ? ` (${targetBaseUrl})` : ""}
        </p>
        <div className="flex min-h-[70px] items-center justify-center">
          <div ref={containerRef} />
        </div>
        {status === "verifying" && (
          <p className="text-center text-xs text-muted-foreground">{t("turnstile.verifying", "正在校验凭证...")}</p>
        )}
        {status === "error" && (
          <div className="space-y-2 text-center">
            <p className="text-xs text-red-500">{t("turnstile.failed", "验证失败或已过期，请重试")}</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                clearTurnstileStorage(targetBaseUrl)
                setRetrySeq((v) => v + 1)
              }}
            >
              {t("turnstile.retry", "重新验证")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
