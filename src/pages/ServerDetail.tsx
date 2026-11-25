import LiveTimeoutModal from "@/components/LiveTimeoutModal"
import { NetworkChart } from "@/components/NetworkChart"
import ServerDetailChart from "@/components/ServerDetailChart"
import ServerDetailOverview from "@/components/ServerDetailOverview"
import TabSwitch from "@/components/TabSwitch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useServerDetailData } from "@/hooks/use-server-detail"
import { ArrowLeft } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom"

export default function ServerDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()

  const decodedId = id ? decodeURIComponent(id) : ""
  const apiIndexRaw = Number(searchParams.get("apiIndex") || "0")
  const apiIndex = Number.isFinite(apiIndexRaw) && apiIndexRaw >= 0 ? apiIndexRaw : 0

  const tabs = ["Detail", "Network"]
  const [currentTab, setCurrentTab] = useState(tabs[0])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [decodedId, apiIndex])

  const {
    loading,
    error,
    server,
    now,
    hours,
    changeHours,
    history,
    historyLoading,
    historyError,
    historyAuthRequired,
    wsTimedOut,
    wsTimeoutMinutes,
    continueLiveConnection,
    closeLiveConnection,
  } = useServerDetailData(decodedId, apiIndex)

  if (!decodedId) {
    return <Navigate to="/404" replace />
  }

  if (!loading && !server) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16 flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          {error || t("serverDetail.notFound", "未找到该服务器节点或无权访问")}
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-1.5 size-4" />
          {t("error.backToHome", "回到主页")}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-0 flex flex-col gap-4 server-info">
      <ServerDetailOverview server={server} now={now} loading={loading} />

      <section className="flex items-center my-2 w-full">
        <Separator className="flex-1" />
        <div className="flex justify-center w-full max-w-[200px]">
          <TabSwitch tabs={tabs} currentTab={currentTab} setCurrentTab={setCurrentTab} />
        </div>
        <Separator className="flex-1" />
      </section>

      {currentTab === tabs[0] ? (
        <ServerDetailChart
          server={server}
          now={now}
          history={history}
          hours={hours}
          onHoursChange={changeHours}
          historyLoading={historyLoading}
          historyError={historyError}
          historyAuthRequired={historyAuthRequired}
        />
      ) : (
        <NetworkChart
          server={server}
          history={history}
          hours={hours}
          onHoursChange={changeHours}
          historyLoading={historyLoading}
          historyError={historyError}
          historyAuthRequired={historyAuthRequired}
          show={currentTab === tabs[1]}
        />
      )}

      <LiveTimeoutModal
        open={wsTimedOut}
        timeoutMinutes={wsTimeoutMinutes}
        onContinue={continueLiveConnection}
        onClose={closeLiveConnection}
      />
    </div>
  )
}
