import { getSiteSysConfigByIndex } from "@/api/cfsm-client"
import ServerFlag from "@/components/ServerFlag"
import ServerUsageBar from "@/components/ServerUsageBar"
import TrafficBar from "@/components/TrafficBar"
import { useBackground } from "@/hooks/use-background"
import { useCfsm } from "@/hooks/use-cfsm"
import { formatBytes } from "@/lib/format"
import { GetOsName, OsIcon } from "@/lib/logo-class"
import { calcTrafficUsed, cn, formatNezhaInfo, parsePublicNote } from "@/lib/utils"
import { NezhaServer } from "@/types/nezha-api"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import PlanInfo from "./PlanInfo"
import BillingInfo from "./billingInfo"
import { Badge } from "./ui/badge"
import { Card } from "./ui/card"

export default function ServerCard({ now, serverInfo }: { now: number; serverInfo: NezhaServer }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { themeOptions } = useCfsm()
  const { hasActiveBackground } = useBackground()
  const {
    name,
    country_code,
    online,
    cpu,
    up,
    down,
    mem,
    stg,
    net_in_transfer,
    net_out_transfer,
    net_rx_monthly,
    net_tx_monthly,
    public_note,
    platform,
    traffic_limit,
    traffic_limit_type,
    traffic_reset_day,
  } = formatNezhaInfo(now, serverInfo)

  const cardClick = () => {
    try {
      sessionStorage.setItem("fromMainPage", "true")
      sessionStorage.setItem("scrollPosition", String(window.scrollY || 0))
    } catch {
      // ignore storage errors
    }
    const query = serverInfo.apiIndex ? `?apiIndex=${serverInfo.apiIndex}` : ""
    navigate(`/server/${encodeURIComponent(serverInfo.id)}${query}`)
  }

  const showFlag = true
  const customBackgroundImage = hasActiveBackground
  const showNetTransfer = themeOptions.show_net_transfer === true
  const fixedTopServerName = themeOptions.fixed_top_server_name === true
  const resolvedShowTf =
    serverInfo.sysConfig?.show_tf ?? getSiteSysConfigByIndex(serverInfo.apiIndex ?? 0)?.show_tf ?? true
  const showTrafficBar =
    resolvedShowTf !== false && themeOptions.show_traffic_bar !== false && traffic_limit > 0

  const parsedData = serverInfo.parsed_note ?? parsePublicNote(public_note)

  return online ? (
    <Card
      className={cn(
        "flex flex-col items-center justify-start gap-3 p-3 md:px-5 cursor-pointer hover:bg-accent/50 transition-colors",
        {
          "flex-col": fixedTopServerName,
          "lg:flex-row": !fixedTopServerName,
        },
        {
          "bg-card/70": customBackgroundImage,
        },
      )}
      onClick={cardClick}
    >
      <section
        className={cn("grid items-center gap-2", {
          "lg:w-40": !fixedTopServerName,
        })}
        style={{ gridTemplateColumns: "auto auto 1fr" }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-green-500 self-center"></span>
        <div className={cn("flex items-center justify-center", showFlag ? "min-w-[17px]" : "min-w-0")}>
          {showFlag ? <ServerFlag country_code={country_code} apiIndex={serverInfo.apiIndex} /> : null}
        </div>
        <div className="relative flex flex-col">
          <p className={cn("break-normal font-bold tracking-tight", showFlag ? "text-xs " : "text-sm")}>{name}</p>
          <div
            className={cn("hidden lg:block", {
              "lg:hidden": fixedTopServerName,
            })}
          >
            {parsedData?.billingDataMod && <BillingInfo parsedData={parsedData} />}
          </div>
        </div>
      </section>
      <div
        className={cn("flex items-center gap-2 -mt-2 lg:hidden", {
          "lg:flex": fixedTopServerName,
        })}
      >
        {parsedData?.billingDataMod && <BillingInfo parsedData={parsedData} />}
      </div>
      <div className="flex flex-col lg:items-start items-center gap-2 w-full lg:w-auto">
        <section
          className={cn("grid grid-cols-5 items-center gap-3 tabular-nums", {
            "lg:grid-cols-6 lg:gap-4": fixedTopServerName,
          })}
        >
          {fixedTopServerName && (
            <div className="hidden col-span-1 items-center lg:flex lg:flex-row gap-2">
              <div className="text-xs font-semibold">
                <OsIcon platform={platform} apiIndex={serverInfo.apiIndex} />
              </div>
              <div className="flex w-14 flex-col">
                <p className="text-xs text-muted-foreground">{t("serverCard.system")}</p>
                <div className="flex items-center text-[10.5px] font-semibold truncate">{GetOsName(platform)}</div>
              </div>
            </div>
          )}
          <div className="flex w-14 flex-col">
            <p className="text-xs text-muted-foreground">CPU</p>
            <div className="flex items-center text-xs font-semibold">{cpu.toFixed(2)}%</div>
            <ServerUsageBar value={cpu} />
          </div>
          <div className="flex w-14 flex-col">
            <p className="text-xs text-muted-foreground">{t("serverCard.mem")}</p>
            <div className="flex items-center text-xs font-semibold">{mem.toFixed(2)}%</div>
            <ServerUsageBar value={mem} />
          </div>
          <div className="flex w-14 flex-col">
            <p className="text-xs text-muted-foreground">{t("serverCard.stg")}</p>
            <div className="flex items-center text-xs font-semibold">{stg.toFixed(2)}%</div>
            <ServerUsageBar value={stg} />
          </div>
          <div className="flex w-14 flex-col">
            <p className="text-xs text-muted-foreground">{t("serverCard.upload")}</p>
            <div className="flex items-center text-xs font-semibold">
              {up >= 1024 ? `${(up / 1024).toFixed(2)}G/s` : up >= 1 ? `${up.toFixed(2)}M/s` : `${(up * 1024).toFixed(2)}K/s`}
            </div>
          </div>
          <div className="flex w-14 flex-col">
            <p className="text-xs text-muted-foreground">{t("serverCard.download")}</p>
            <div className="flex items-center text-xs font-semibold">
              {down >= 1024 ? `${(down / 1024).toFixed(2)}G/s` : down >= 1 ? `${down.toFixed(2)}M/s` : `${(down * 1024).toFixed(2)}K/s`}
            </div>
          </div>
        </section>
        {showTrafficBar && (
          <TrafficBar
            used={calcTrafficUsed(net_tx_monthly, net_rx_monthly, traffic_limit_type)}
            limit={traffic_limit}
            resetDay={traffic_reset_day}
            limitType={traffic_limit_type}
          />
        )}
        {showNetTransfer && (
          <section className="flex items-center w-full justify-between gap-1 tabular-nums">
            <Badge
              variant="secondary"
              className="items-center flex-1 justify-center rounded-[8px] text-nowrap text-[11px] border-muted-50 shadow-md shadow-neutral-200/30 dark:shadow-none"
            >
              {t("serverCard.upload")}:{formatBytes(net_out_transfer)}
            </Badge>
            <Badge
              variant="outline"
              className="items-center flex-1 justify-center rounded-[8px] text-nowrap text-[11px] shadow-md shadow-neutral-200/30 dark:shadow-none"
            >
              {t("serverCard.download")}:{formatBytes(net_in_transfer)}
            </Badge>
          </section>
        )}
        {parsedData?.planDataMod && (
          <PlanInfo
            parsedData={parsedData}
            serverSysConfig={serverInfo.sysConfig}
            apiIndex={serverInfo.apiIndex}
          />
        )}
      </div>
    </Card>
  ) : (
    <Card
      className={cn(
        "flex flex-col items-center justify-start gap-3 sm:gap-0 p-3 md:px-5 cursor-pointer hover:bg-accent/50 transition-colors",
        showNetTransfer ? "lg:min-h-[91px] min-h-[123px]" : "lg:min-h-[61px] min-h-[93px]",
        {
          "flex-col": fixedTopServerName,
          "lg:flex-row": !fixedTopServerName,
        },
        {
          "bg-card/70": customBackgroundImage,
        },
      )}
      onClick={cardClick}
    >
      <section
        className={cn("grid items-center gap-2", {
          "lg:w-40": !fixedTopServerName,
        })}
        style={{ gridTemplateColumns: "auto auto 1fr" }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 self-center"></span>
        <div className={cn("flex items-center justify-center", showFlag ? "min-w-[17px]" : "min-w-0")}>
          {showFlag ? <ServerFlag country_code={country_code} apiIndex={serverInfo.apiIndex} /> : null}
        </div>
        <div className="relative flex flex-col">
          <p className={cn("break-normal font-bold tracking-tight max-w-[108px]", showFlag ? "text-xs" : "text-sm")}>{name}</p>
          <div
            className={cn("hidden lg:block", {
              "lg:hidden": fixedTopServerName,
            })}
          >
            {parsedData?.billingDataMod && <BillingInfo parsedData={parsedData} />}
          </div>
        </div>
      </section>
      <div
        className={cn("flex items-center gap-2 lg:hidden", {
          "lg:flex": fixedTopServerName,
        })}
      >
        {parsedData?.billingDataMod && <BillingInfo parsedData={parsedData} />}
      </div>
      {parsedData?.planDataMod && (
        <PlanInfo
          parsedData={parsedData}
          serverSysConfig={serverInfo.sysConfig}
          apiIndex={serverInfo.apiIndex}
        />
      )}
    </Card>
  )
}
