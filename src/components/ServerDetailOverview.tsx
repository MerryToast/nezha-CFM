import { getSiteSysConfigByIndex } from "@/api/cfsm-client"
import { BackIcon } from "@/components/Icon"
import ServerFlag from "@/components/ServerFlag"
import TrafficBar from "@/components/TrafficBar"
import { ServerDetailLoading } from "@/components/loading/ServerDetailLoading"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useBackground } from "@/hooks/use-background"
import { useCfsm } from "@/hooks/use-cfsm"
import { calcTrafficUsed, isValidDiskIo } from "@/lib/cfsm-normalizer"
import { formatBytes } from "@/lib/format"
import { cn, formatNezhaInfo } from "@/lib/utils"
import { NezhaServer } from "@/types/nezha-api"
import countries from "i18n-iso-countries"
import enLocale from "i18n-iso-countries/langs/en.json"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

countries.registerLocale(enLocale)

interface ServerDetailOverviewProps {
  server: NezhaServer | null
  now: number
  loading: boolean
}

export default function ServerDetailOverview({ server, now, loading }: ServerDetailOverviewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { themeOptions } = useCfsm()
  const { hasActiveBackground: customBackgroundImage } = useBackground()

  const [hasHistory, setHasHistory] = useState(false)

  useEffect(() => {
    try {
      setHasHistory(sessionStorage.getItem("fromMainPage") === "true")
    } catch {
      setHasHistory(false)
    }
  }, [server?.uid])

  if (loading && !server) {
    return <ServerDetailLoading />
  }

  if (!server) {
    return null
  }

  const linkClick = () => {
    let shouldPop = hasHistory
    try {
      shouldPop = sessionStorage.getItem("fromMainPage") === "true"
      sessionStorage.removeItem("fromMainPage")
    } catch {
      // ignore storage errors
    }
    if (shouldPop && window.history.length > 1) {
      navigate(-1)
    } else {
      navigate("/")
    }
  }

  const {
    name,
    online,
    uptime,
    version,
    arch,
    mem_total,
    disk_total,
    country_code,
    platform,
    platform_version,
    cpu_info,
    load_1,
    load_5,
    load_15,
    net_out_transfer,
    net_in_transfer,
    net_tx_monthly,
    net_rx_monthly,
    traffic_limit,
    traffic_limit_type,
    traffic_reset_day,
    last_active_time_string,
    boot_time_string,
  } = formatNezhaInfo(now, server)

  const resolvedShowTf =
    server.sysConfig?.show_tf ?? getSiteSysConfigByIndex(server.apiIndex ?? 0)?.show_tf ?? true
  const showTrafficBar =
    resolvedShowTf !== false && themeOptions?.show_traffic_bar !== false && traffic_limit > 0
  const monthlyUsed = calcTrafficUsed(net_tx_monthly, net_rx_monthly, traffic_limit_type)
  const resolvedResetDay = traffic_reset_day || 0
  const gpuDevices = Array.isArray(server.gpu_devices) ? server.gpu_devices : []
  const diskIo = isValidDiskIo(server.disk) ? server.disk : null

  return (
    <div
      className={cn({
        "bg-card/70 backdrop-blur-sm p-4 rounded-[10px]": customBackgroundImage,
      })}
    >
      <button
        type="button"
        onClick={linkClick}
        className="flex flex-none cursor-pointer font-semibold leading-none items-center break-all tracking-tight gap-1 text-xl server-name text-left hover:opacity-80 transition-opacity"
      >
        <BackIcon />
        {name}
      </button>

      <section className="flex flex-wrap gap-2 mt-3">
        <Card className="rounded-[10px] bg-transparent border-none shadow-none">
          <CardContent className="px-1.5 py-1">
            <section className="flex flex-col items-start gap-0.5">
              <p className="text-xs text-muted-foreground">{t("serverDetail.status")}</p>
              <Badge
                className={cn("text-[9px] rounded-[6px] w-fit px-1 py-0 -mt-[0.3px] dark:text-white", {
                  "bg-green-800": online,
                  "bg-red-600": !online,
                })}
              >
                {online ? t("serverDetail.online") : t("serverDetail.offline")}
              </Badge>
            </section>
          </CardContent>
        </Card>

        {online && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.uptime")}</p>
                <div className="text-xs tabular-nums">
                  {uptime / 86400 >= 1
                    ? `${Math.floor(uptime / 86400)} ${t("serverDetail.days")} ${Math.floor((uptime % 86400) / 3600)} ${t("serverDetail.hours")}`
                    : `${Math.floor(uptime / 3600)} ${t("serverDetail.hours")}`}
                </div>
              </section>
            </CardContent>
          </Card>
        )}

        {version && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.version")}</p>
                <div className="text-xs">{version}</div>
              </section>
            </CardContent>
          </Card>
        )}

        {arch && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.arch")}</p>
                <div className="text-xs">{arch}</div>
              </section>
            </CardContent>
          </Card>
        )}

        {mem_total > 0 && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.mem")}</p>
                <div className="text-xs tabular-nums">{formatBytes(mem_total)}</div>
              </section>
            </CardContent>
          </Card>
        )}

        {disk_total > 0 && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.disk")}</p>
                <div className="text-xs tabular-nums">{formatBytes(disk_total)}</div>
              </section>
            </CardContent>
          </Card>
        )}

        {country_code && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="rounded-[10px] bg-transparent border-none shadow-none">
                  <CardContent className="px-1.5 py-1">
                    <section className="flex flex-col items-start gap-0.5">
                      <p className="text-xs text-muted-foreground">{t("serverDetail.region")}</p>
                      <section className="flex items-center gap-1">
                        <div className="text-xs text-start">{country_code.toUpperCase()}</div>
                        <ServerFlag
                          className="text-[11px] -mt-[1px]"
                          country_code={country_code}
                          apiIndex={server.apiIndex}
                        />
                      </section>
                    </section>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p>{countries.getName(country_code.toUpperCase(), "en") || country_code.toUpperCase()}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </section>

      <section className="flex flex-wrap gap-2 mt-1">
        {platform && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.system")}</p>
                <div className="text-xs">
                  {platform} {platform_version ? ` - ${platform_version}` : ""}
                </div>
              </section>
            </CardContent>
          </Card>
        )}

        {(cpu_info.length > 0 || (server.host.cpu_cores ?? 0) > 0) && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">CPU</p>
                <div className="text-xs">
                  {cpu_info.length > 0 ? cpu_info.join(", ") : `${server.host.cpu_cores} Cores`}
                  {cpu_info.length > 0 && server.host.cpu_cores ? ` (${server.host.cpu_cores} Cores)` : ""}
                </div>
              </section>
            </CardContent>
          </Card>
        )}

        {gpuDevices.length > 0 && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">GPU</p>
                <div className="text-xs flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                  {gpuDevices.map((gpu) => (
                    <span key={gpu.id}>
                      {gpu.name}
                      {gpu.info !== null && gpu.info !== undefined ? ` (${gpu.info.toFixed(1)}%)` : ""}
                      {gpu.mem_total && gpu.mem_total > 0
                        ? ` · VRAM ${gpu.mem_used ?? 0}/${gpu.mem_total} MB`
                        : ""}
                    </span>
                  ))}
                </div>
              </section>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-wrap gap-2 mt-1">
        <Card className="rounded-[10px] bg-transparent border-none shadow-none">
          <CardContent className="px-1.5 py-1">
            <section className="flex flex-col items-start gap-0.5">
              <p className="text-xs text-muted-foreground">Load</p>
              <div className="text-xs tabular-nums">
                {load_1} / {load_5} / {load_15}
              </div>
            </section>
          </CardContent>
        </Card>

        {net_out_transfer > 0 && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.upload")}</p>
                <div className="text-xs tabular-nums">{formatBytes(net_out_transfer)}</div>
              </section>
            </CardContent>
          </Card>
        )}

        {net_in_transfer > 0 && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.download")}</p>
                <div className="text-xs tabular-nums">{formatBytes(net_in_transfer)}</div>
              </section>
            </CardContent>
          </Card>
        )}

        {(net_tx_monthly > 0 || net_rx_monthly > 0) && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.monthlyTraffic", "本月流量 (↑ / ↓)")}</p>
                <div className="text-xs tabular-nums">
                  ↑ {formatBytes(net_tx_monthly)} / ↓ {formatBytes(net_rx_monthly)}
                </div>
              </section>
            </CardContent>
          </Card>
        )}

        {diskIo && (
          <Card className="rounded-[10px] bg-transparent border-none shadow-none">
            <CardContent className="px-1.5 py-1">
              <section className="flex flex-col items-start gap-0.5">
                <p className="text-xs text-muted-foreground">{t("serverDetail.diskIo", "磁盘 IO")}</p>
                <div className="text-xs tabular-nums">
                  R {formatBytes(diskIo.read_bps)}/s · W {formatBytes(diskIo.write_bps)}/s · Util {diskIo.util.toFixed(1)}%
                </div>
              </section>
            </CardContent>
          </Card>
        )}
      </section>

      {server.state.temperatures && server.state.temperatures.length > 0 && (
        <section className="flex flex-wrap gap-2 mt-1">
          <section className="flex flex-wrap gap-2 ml-1.5">
            <Accordion type="single" collapsible className="w-fit">
              <AccordionItem value="item-1" className="border-none">
                <AccordionTrigger className="text-xs py-0 text-muted-foreground font-normal">
                  {t("serverDetail.temperature")}
                </AccordionTrigger>
                <AccordionContent className="pb-0">
                  <section className="flex items-start flex-wrap gap-2">
                    {server.state.temperatures.map((item, index) => (
                      <div className="text-xs flex items-center tabular-nums" key={index}>
                        <p className="font-semibold">{item.Name}</p>: {item.Temperature.toFixed(2)} °C
                      </div>
                    ))}
                  </section>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
        </section>
      )}

      {showTrafficBar && (
        <div className="mt-2 max-w-md px-1.5">
          <TrafficBar
            used={monthlyUsed}
            limit={traffic_limit}
            resetDay={resolvedResetDay}
            limitType={traffic_limit_type}
          />
        </div>
      )}

      <section className="flex flex-wrap gap-2 mt-1">
        <Card className="rounded-[10px] bg-transparent border-none shadow-none">
          <CardContent className="px-1.5 py-1">
            <section className="flex flex-col items-start gap-0.5">
              <p className="text-xs text-muted-foreground">{t("serverDetail.bootTime")}</p>
              <div className="text-xs tabular-nums">{boot_time_string || "N/A"}</div>
            </section>
          </CardContent>
        </Card>

        <Card className="rounded-[10px] bg-transparent border-none shadow-none">
          <CardContent className="px-1.5 py-1">
            <section className="flex flex-col items-start gap-0.5">
              <p className="text-xs text-muted-foreground">{t("serverDetail.lastActive")}</p>
              <div className="text-xs tabular-nums">{last_active_time_string || "N/A"}</div>
            </section>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
