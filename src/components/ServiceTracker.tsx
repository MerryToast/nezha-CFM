import { useCfsm } from "@/hooks/use-cfsm"
import { isDisabledProbeMetric, normalizeProbeMetric, normalizeTimestampMs } from "@/lib/cfsm-normalizer"
import { NezhaServer } from "@/types/nezha-api"
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import ServiceTrackerClient, { LatencyBucket } from "./ServiceTrackerClient"

type CarrierKey = "all" | "ct" | "cu" | "cm" | "bd"

export function ServiceTracker({ serverList }: { serverList: NezhaServer[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { sysConfig, config } = useCfsm()
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierKey>("all")

  const carrierLabels = useMemo(
    () => ({
      ct: sysConfig.custom_ct_name || config?.custom_ct_name || "电信",
      cu: sysConfig.custom_cu_name || config?.custom_cu_name || "联通",
      cm: sysConfig.custom_cm_name || config?.custom_cm_name || "移动",
      bd: sysConfig.custom_bd_name || config?.custom_bd_name || "BGP",
    }),
    [config, sysConfig],
  )

  const threeNetCards = useMemo(() => {
    const carrierKeys: Array<"ct" | "cu" | "cm" | "bd"> =
      selectedCarrier === "all" ? ["ct", "cu", "cm", "bd"] : [selectedCarrier]

    return serverList
      .map((server) => {
        const nodeSysCfg = server.sysConfig || sysConfig
        if (nodeSysCfg.show_three_net_details !== true) return null

        const nodeCarrierLabels = {
          ct: nodeSysCfg.custom_ct_name || carrierLabels.ct,
          cu: nodeSysCfg.custom_cu_name || carrierLabels.cu,
          cm: nodeSysCfg.custom_cm_name || carrierLabels.cm,
          bd: nodeSysCfg.custom_bd_name || carrierLabels.bd,
        }

        const pingArr = Array.isArray(server.ping) ? server.ping : []
        const lossArr = Array.isArray(server.loss) ? server.loss : []
        const pointCount = Math.max(pingArr.length, lossArr.length)
        if (pointCount === 0) return null

        const buckets: LatencyBucket[] = []
        const allDelays: number[] = []
        const allLosses: number[] = []
        let hasTimeout = false

        for (let i = 0; i < pointCount; i++) {
          const pPoint = pingArr[i]
          const lPoint = lossArr[i]
          const ts = normalizeTimestampMs(pPoint?.ts ?? lPoint?.ts, 0)
          if (!ts) continue

          const carrierDetails: LatencyBucket["carrierDetails"] = []
          const bucketDelays: number[] = []
          const bucketLosses: number[] = []
          let bucketTimeout = false

          for (const key of carrierKeys) {
            const rawPing = pPoint?.[key]
            const rawLoss = lPoint?.[key]
            // false / undefined means disabled or unsampled -> hide
            if (isDisabledProbeMetric(rawPing) && isDisabledProbeMetric(rawLoss)) continue

            const normPing = normalizeProbeMetric(rawPing)
            const normLoss = normalizeProbeMetric(rawLoss)
            if (normPing === false && normLoss === false) continue

            const latencyVal = typeof normPing === "number" ? normPing : null
            const lossVal = typeof normLoss === "number" ? normLoss : null
            if (normPing === null) {
              bucketTimeout = true
              hasTimeout = true
            }
            if (latencyVal !== null) {
              bucketDelays.push(latencyVal)
              allDelays.push(latencyVal)
            }
            if (lossVal !== null) {
              bucketLosses.push(lossVal)
              allLosses.push(lossVal)
            }

            carrierDetails.push({
              key,
              label: nodeCarrierLabels[key],
              latency: latencyVal,
              loss: lossVal,
            })
          }

          if (carrierDetails.length === 0) continue

          const bucketAvgDelay =
            bucketDelays.length > 0
              ? bucketDelays.reduce((s, v) => s + v, 0) / bucketDelays.length
              : bucketTimeout
                ? null
                : null
          const bucketAvgLoss =
            bucketLosses.length > 0 ? bucketLosses.reduce((s, v) => s + v, 0) / bucketLosses.length : null

          buckets.push({
            ts,
            latency: bucketAvgDelay,
            loss: bucketAvgLoss,
            carrierDetails,
          })
        }

        if (buckets.length === 0) return null

        const avgDelay =
          allDelays.length > 0 ? allDelays.reduce((s, v) => s + v, 0) / allDelays.length : hasTimeout ? null : null
        const avgLoss = allLosses.length > 0 ? allLosses.reduce((s, v) => s + v, 0) / allLosses.length : null

        return {
          server,
          buckets,
          avgDelay,
          avgLoss,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }, [carrierLabels, selectedCarrier, serverList, sysConfig])

  const anyThreeNetEnabled =
    serverList.some((s) => (s.sysConfig || sysConfig).show_three_net_details === true) ||
    sysConfig.show_three_net_details === true

  if (!anyThreeNetEnabled) {
    return (
      <div className="mt-4 text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
        <span>{t("serviceTracker.disabledInBackend", "三网延迟详情未开启，请在 CFSM 管理后台开启「显示三网详情」")}</span>
      </div>
    )
  }

  if (threeNetCards.length === 0) {
    return (
      <div className="mt-4 text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
        <span>{t("serviceTracker.noService")}</span>
      </div>
    )
  }

  const filterButtons: Array<{ key: CarrierKey; label: string }> = [
    { key: "all", label: t("serviceTracker.allLines", "全部线路") },
    { key: "ct", label: carrierLabels.ct },
    { key: "cu", label: carrierLabels.cu },
    { key: "cm", label: carrierLabels.cm },
    { key: "bd", label: carrierLabels.bd },
  ]

  return (
    <div className="mt-4 w-full mx-auto space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("serviceTracker.threeNetWindow", "三网延迟与丢包监测")}（{sysConfig.latency_window?.hours ?? 2}h）
        </p>
        <div className="flex items-center gap-1 rounded-full bg-stone-100 p-0.5 dark:bg-stone-800">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => setSelectedCarrier(btn.key)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                selectedCarrier === btn.key
                  ? "bg-white text-foreground shadow-sm dark:bg-stone-700"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
        {threeNetCards.map(({ server, buckets, avgDelay, avgLoss }) => (
          <ServiceTrackerClient
            key={server.id}
            buckets={buckets}
            title={server.name}
            avgDelay={avgDelay}
            avgLoss={avgLoss}
            windowHours={sysConfig.latency_window?.hours ?? 2}
            onClick={() => {
              const query = server.apiIndex ? `?apiIndex=${server.apiIndex}` : ""
              navigate(`/server/${encodeURIComponent(server.id)}${query}`)
            }}
          />
        ))}
      </section>
    </div>
  )
}

export default ServiceTracker
