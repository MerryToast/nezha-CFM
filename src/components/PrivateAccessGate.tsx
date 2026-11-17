import { USE_MOCK, getAdminEntryUrl, hasConfiguredApiBase } from "@/api/cfsm-client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useCfsm } from "@/hooks/use-cfsm"
import { Lock } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

export default function PrivateAccessGate({ siteName, siteDesc }: { siteName: string; siteDesc?: string }) {
  const { t } = useTranslation()
  const { config } = useCfsm()
  const customLogo = ((window as unknown as Record<string, unknown>).CustomLogo as string) || ""
  const adminUrl = getAdminEntryUrl(config?.unauthorized_api_index ?? 0)

  useEffect(() => {
    // On same-origin Worker deployments, immediately redirect unauthenticated visitors to /admin#/admin
    if (!USE_MOCK && !hasConfiguredApiBase()) {
      window.location.replace(adminUrl)
    }
  }, [adminUrl])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-5 rounded-3xl border-neutral-200/70 bg-white/85 p-6 shadow-2xl shadow-black/5 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/80">
        <section className="flex items-center gap-3">
          {customLogo ? (
            <img src={customLogo} alt="site logo" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{siteName || "CF Server Monitor"}</h1>
            <p className="truncate text-xs text-muted-foreground">{siteDesc || t("privateGate.subtitle", "Private Monitor")}</p>
          </div>
        </section>
        <section className="space-y-2">
          <p className="text-sm font-medium">{t("privateGate.title", "该监控站点已开启私密模式")}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("privateGate.desc", "访问监控数据前请先前往后台完成管理员登录。")}
          </p>
        </section>
        <div className="space-y-2">
          <Button asChild className="w-full rounded-full">
            <a href={adminUrl}>{t("privateGate.loginBtn", "前往管理员登录")}</a>
          </Button>
          <Button variant="outline" className="w-full rounded-full" onClick={() => window.location.reload()}>
            {t("privateGate.refreshBtn", "我已登录，刷新页面")}
          </Button>
        </div>
      </Card>
    </div>
  )
}
