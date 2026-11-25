import {
  CfsmApiError,
  fetchConfigOnce,
  fetchServersAll,
  getApiBases,
  getApiIndexForBase,
  getSiteConfigByIndex,
  markSiteTurnstileUnverified,
  markSiteUnauthorized,
  refreshSiteConfigByIndex,
  saveThemeOptions as postThemeOptions,
  subscribeAuthEvents,
  verifyTurnstileConfig,
} from "@/api/cfsm-client"
import { LiveSampleEvent, LiveSocketController, createCfsmLiveSocket } from "@/hooks/useCFSMWebSocket"
import { useTheme } from "@/hooks/use-theme"
import {
  cfsmServerToNezhaServer,
  isCfsmServerOnline,
  makeServerUid,
  mergeBatchSampleIntoServer,
  normalizeTimestampMs,
  recomputeStatsFromServers,
} from "@/lib/cfsm-normalizer"
import { sanitizeSafeUrl } from "@/lib/security"
import { setTurnstileToken } from "@/lib/turnstile"
import {
  CfsmGlobalStats,
  CfsmServer,
  CfsmSiteConfig,
  CfsmSysConfig,
  CfsmThemeOptions,
} from "@/types/cfsm"
import { NezhaServer } from "@/types/nezha-api"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { CfsmContext, CfsmContextValue } from "./cfsm-context"

const EMPTY_STATS: CfsmGlobalStats = {
  total: 0,
  online: 0,
  offline: 0,
  globalSpeedIn: 0,
  globalSpeedOut: 0,
  globalNetTx: 0,
  globalNetRx: 0,
}

const DEFAULT_SYS_CONFIG: CfsmSysConfig = {
  show_price: true,
  show_expire: true,
  show_tf: true,
  show_three_net_details: true,
  display_mode: "bar",
}

function mapCfsmLanguageToI18n(lang?: string): string {
  const raw = String(lang || "auto").trim()
  if (raw === "auto") {
    const nav = (typeof navigator !== "undefined" ? navigator.language : "en-US").toLowerCase()
    if (nav === "zh-tw" || nav === "zh-hk" || nav === "zh-hant") return "zh-TW"
    if (nav.startsWith("zh")) return "zh-CN"
    if (nav.startsWith("es")) return "es-ES"
    if (nav.startsWith("de")) return "de-DE"
    if (nav.startsWith("ru")) return "ru-RU"
    if (nav.startsWith("ta")) return "ta-IN"
    return "en-US"
  }
  if (raw === "zh" || raw === "zh-CN") return "zh-CN"
  if (raw === "zh-TW" || raw === "zh-HK") return "zh-TW"
  if (raw === "es" || raw === "es-ES") return "es-ES"
  if (raw === "de" || raw === "de-DE") return "de-DE"
  if (raw === "ru" || raw === "ru-RU") return "ru-RU"
  if (raw === "ta" || raw === "ta-IN") return "ta-IN"
  return "en-US"
}

export function applyThemeOptionsToWindow(opts: CfsmThemeOptions, siteDescFallback = "") {
  if (typeof window === "undefined") return
  const win = window as unknown as Record<string, unknown>
  win.__cfsmThemeOptions = opts
  win.CustomBackgroundImage = sanitizeSafeUrl(opts.custom_background_image, { allowHash: false })
  win.CustomMobileBackgroundImage = sanitizeSafeUrl(opts.custom_mobile_background_image, { allowHash: false })
  win.CustomLogo = sanitizeSafeUrl(opts.custom_logo, { allowHash: false })
  win.CustomIllustration = sanitizeSafeUrl(opts.custom_illustration, { allowHash: false })
  win.CustomDesc = typeof opts.site_desc === "string" && opts.site_desc ? opts.site_desc : siteDescFallback
  win.CustomLinks = opts.custom_links ?? ""
  win.ForceTheme = typeof opts.force_theme === "string" ? opts.force_theme : ""
  win.ForceShowServices = opts.force_show_services === true
  win.ForceShowMap = opts.force_show_map === true
  win.ForceCardInline = opts.force_card_inline === true
  win.GroupOrder = typeof opts.group_order === "string" ? opts.group_order : ""
  win.DisableAnimatedMan = opts.disable_animated_man !== false
  win.ForceUseSvgFlag = opts.force_use_svg_flag === true
  win.ShowTrafficBar = opts.show_traffic_bar !== false
  win.ShowVisitorCapsule = opts.show_visitor_capsule === true
  win.VisitorCapsuleColor = typeof opts.visitor_capsule_color === "string" ? opts.visitor_capsule_color : "blue"
  win.ShowAssetCard = opts.show_asset_card === true
  win.AssetCardColor = typeof opts.asset_card_color === "string" ? opts.asset_card_color : "blue"
  win.AssetCardDefaultCurrency =
    typeof opts.asset_card_default_currency === "string" ? opts.asset_card_default_currency : "CNY"
  win.ForcePeakCutEnabled = opts.force_peak_cut_enabled === true
  win.FixedTopServerName = opts.fixed_top_server_name === true
  win.ShowNetTransfer = opts.show_net_transfer === true
  win.HideIPv4IPv6Tag = opts.hide_ipv4_ipv6_tag === true
  win.HideTrafficVolTag = opts.hide_traffic_vol_tag === true
  win.DefaultBillingCurrency =
    typeof opts.default_billing_currency === "string" ? opts.default_billing_currency : "跟随后端"
  win.CnySymbolStyle = opts.cny_symbol_style === "CNY" ? "CNY" : "¥"
  win.ServerBillingCurrencyOverrides = opts.server_billing_currency_overrides ?? ""
  win.TrafficBarShowPercent = opts.traffic_bar_show_percent !== false
  win.TrafficBarShowResetDay = opts.traffic_bar_show_reset_day !== false
  win.TrafficBarShowBillingMode = opts.traffic_bar_show_billing_mode !== false
  win.TrafficResetDayOverrides = opts.traffic_reset_day_overrides ?? ""
  window.dispatchEvent(new Event("backgroundChange"))
}

export const CfsmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation()
  const { setForcedTheme, setDefaultThemePreference } = useTheme()

  const [config, setConfig] = useState<CfsmSiteConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [turnstileRequired, setTurnstileRequired] = useState(false)
  const [privateRequired, setPrivateRequired] = useState(false)

  const [themeOptions, setThemeOptionsState] = useState<CfsmThemeOptions>({})
  const themeOptionsRef = useRef<CfsmThemeOptions>({})

  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [servers, setServers] = useState<NezhaServer[]>([])
  const [now, setNow] = useState<number>(() => Date.now())
  const [stats, setStats] = useState<CfsmGlobalStats>(EMPTY_STATS)
  const [regionStats, setRegionStats] = useState<Record<string, number>>({})
  const [sysConfig, setSysConfig] = useState<CfsmSysConfig>(DEFAULT_SYS_CONFIG)
  const [wsConnected, setWsConnected] = useState(false)
  const [wsTimedOut, setWsTimedOut] = useState(false)
  const [wsTimeoutMinutes, setWsTimeoutMinutes] = useState(3)

  const serversMapRef = useRef<Map<string, CfsmServer>>(new Map())
  const renderedOnlineMapRef = useRef<Map<string, boolean>>(new Map())
  const sysConfigRef = useRef<CfsmSysConfig>(DEFAULT_SYS_CONFIG)
  const dirtyRef = useRef(false)
  const dashboardMountedCountRef = useRef(0)
  const dashboardFetchedRef = useRef(false)
  const pendingSyncApiIndicesRef = useRef<Set<number>>(new Set())
  const authEpochRef = useRef(0)
  const dashboardInFlightRef = useRef<{
    promise: Promise<void>
    isFull: boolean
    indices: Set<number>
    authEpoch: number
  } | null>(null)
  const liveSocketsMapRef = useRef<Map<number, LiveSocketController>>(new Map())
  const timedOutApiIndicesRef = useRef<Set<number>>(new Set())
  const pausedByUserApiIndicesRef = useRef<Set<number>>(new Set())
  const closedByUserRef = useRef(false)
  const flushIntervalRef = useRef<number | null>(null)

  const applyConfigEffects = useCallback(
    (cfg: CfsmSiteConfig) => {
      setConfig(cfg)
      const opts = cfg.theme_options && typeof cfg.theme_options === "object" && !Array.isArray(cfg.theme_options) ? cfg.theme_options : {}
      themeOptionsRef.current = opts
      setThemeOptionsState(opts)
      applyThemeOptionsToWindow(opts)

      if (cfg.site_title && typeof document !== "undefined") {
        document.title = cfg.site_title
      }

      // Theme preference: runtime force_theme override > user localStorage > backend preferred_theme
      const forceTheme = opts.force_theme
      setForcedTheme(forceTheme === "dark" || forceTheme === "light" ? forceTheme : null)
      const pref = String(cfg.preferred_theme || "auto").toLowerCase()
      setDefaultThemePreference(pref === "dark" ? "dark" : pref === "light" ? "light" : "system")

      // Language preference: only apply backend default when user hasn't explicitly picked one
      if (!localStorage.getItem("language")) {
        const mapped = mapCfsmLanguageToI18n(cfg.default_language)
        if (i18n.language !== mapped) {
          i18n.changeLanguage(mapped)
        }
      }

      const needsTurnstile = cfg.turnstile_enabled === true && cfg.verified !== true && Boolean(cfg.turnstile_site_key)
      setTurnstileRequired(needsTurnstile)
      setPrivateRequired(cfg.has_unauthorized_private ?? (cfg.is_public === false && cfg.authorization !== true))
    },
    [i18n, setDefaultThemePreference, setForcedTheme],
  )

  const loadInitialConfig = useCallback(
    async (force = false) => {
      setConfigLoading(true)
      setConfigError(null)
      try {
        const cfg = await fetchConfigOnce(force)
        applyConfigEffects(cfg)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load site config"
        setConfigError(message)
      } finally {
        setConfigLoading(false)
      }
    },
    [applyConfigEffects],
  )

  useEffect(() => {
    void loadInitialConfig(false)
  }, [loadInitialConfig])

  useEffect(() => {
    return subscribeAuthEvents((ev) => {
      const idx = getApiIndexForBase(ev.baseUrl)
      if (ev.type === "unauthorized") {
        pendingSyncApiIndicesRef.current.add(idx)
        const updated = markSiteUnauthorized(ev.baseUrl)
        if (updated) {
          applyConfigEffects(updated)
        } else {
          setConfig((prev) =>
            prev ? { ...prev, has_unauthorized_private: true, unauthorized_api_index: idx } : prev,
          )
          setPrivateRequired(true)
        }
      } else if (ev.type === "turnstile_failed") {
        pendingSyncApiIndicesRef.current.add(idx)
        const updated = markSiteTurnstileUnverified(ev.baseUrl)
        if (updated) {
          applyConfigEffects(updated)
        } else {
          void refreshSiteConfigByIndex(idx).then((refreshed) => {
            if (refreshed) {
              const marked = markSiteTurnstileUnverified(ev.baseUrl) ?? refreshed
              applyConfigEffects(marked)
            } else {
              setTurnstileRequired(true)
            }
          })
        }
      }
    })
  }, [applyConfigEffects])

  const completeTurnstile = useCallback(
    async (token: string): Promise<boolean> => {
      const apiIndex = config?.turnstile_api_index ?? 0
      const baseUrl = getApiBases()[apiIndex] || getApiBases()[0] || ""
      setTurnstileToken(token, baseUrl)
      try {
        const updated = await verifyTurnstileConfig(token, apiIndex)
        const siteCfg = getSiteConfigByIndex(apiIndex)
        const thisSiteVerified = siteCfg ? siteCfg.verified === true : updated.verified === true
        if (thisSiteVerified) {
          authEpochRef.current += 1
        }
        applyConfigEffects(updated)
        return thisSiteVerified
      } catch {
        return false
      }
    },
    [applyConfigEffects, config?.turnstile_api_index],
  )

  const setLocalThemeOptions = useCallback(
    (nextOpts: CfsmThemeOptions) => {
      themeOptionsRef.current = nextOpts
      setThemeOptionsState(nextOpts)
      applyThemeOptionsToWindow(nextOpts)
      setForcedTheme(
        nextOpts.force_theme === "dark" || nextOpts.force_theme === "light" ? nextOpts.force_theme : null,
      )
      // Re-normalize existing servers immediately so tag/billing/reset_day overrides take effect
      const ts = Date.now()
      const list = Array.from(serversMapRef.current.values())
      if (list.length > 0) {
        setServers(
          list.map((s) => cfsmServerToNezhaServer(s, ts, s.sysConfig ?? sysConfigRef.current, nextOpts)),
        )
      }
    },
    [setForcedTheme],
  )

  const saveRemoteThemeOptions = useCallback(
    async (nextOpts: CfsmThemeOptions): Promise<CfsmThemeOptions> => {
      const saved = await postThemeOptions(nextOpts, 0)
      setLocalThemeOptions(saved)
      setConfig((prev) => (prev ? { ...prev, theme_options: saved } : prev))
      return saved
    },
    [setLocalThemeOptions],
  )

  const flushServersToState = useCallback((overrideStats?: CfsmGlobalStats, overrideRegionStats?: Record<string, number>) => {
    const ts = Date.now()
    const rawList = Array.from(serversMapRef.current.values())
    const normalized = rawList.map((srv) =>
      cfsmServerToNezhaServer(srv, ts, srv.sysConfig ?? sysConfigRef.current, themeOptionsRef.current),
    )
    const nextOnlineMap = new Map<string, boolean>()
    for (const srv of normalized) {
      nextOnlineMap.set(srv.uid, srv.online)
    }
    renderedOnlineMapRef.current = nextOnlineMap

    setNow(ts)
    setServers(normalized)
    if (overrideStats && overrideRegionStats) {
      setStats(overrideStats)
      setRegionStats(overrideRegionStats)
    } else {
      const computed = recomputeStatsFromServers(rawList, ts)
      setStats(computed.stats)
      setRegionStats(computed.regionStats)
    }
  }, [])

  const configRef = useRef(config)
  configRef.current = config
  const configReady = Boolean(config)
  const turnstileRequiredRef = useRef(turnstileRequired)
  turnstileRequiredRef.current = turnstileRequired
  const privateRequiredRef = useRef(privateRequired)
  privateRequiredRef.current = privateRequired

  const stopDashboardSockets = useCallback((targetIndices?: number[]) => {
    if (targetIndices && targetIndices.length > 0) {
      for (const idx of targetIndices) {
        const ctrl = liveSocketsMapRef.current.get(idx)
        if (ctrl) {
          ctrl.close()
          liveSocketsMapRef.current.delete(idx)
        }
      }
    } else {
      liveSocketsMapRef.current.forEach((ctrl) => ctrl.close())
      liveSocketsMapRef.current.clear()
    }
    const anyConnected = Array.from(liveSocketsMapRef.current.values()).some((c) => c.isConnected())
    setWsConnected(anyConnected)
  }, [])

  const startDashboardSockets = useCallback(
    (targetIndices?: number[]) => {
      if (closedByUserRef.current) return
      if (typeof document !== "undefined" && document.hidden) {
        stopDashboardSockets()
        return
      }

      const list = Array.from(serversMapRef.current.values())
      if (list.length === 0) return

      const bases = getApiBases()
      const idsByApiIndex = new Map<number, string[]>()
      for (const s of list) {
        const idx = s.apiIndex ?? (s.source ? Math.max(0, bases.indexOf(s.source)) : 0)
        if (!idsByApiIndex.has(idx)) idsByApiIndex.set(idx, [])
        idsByApiIndex.get(idx)!.push(s.id)
      }

      const indicesToStart =
        targetIndices && targetIndices.length > 0
          ? targetIndices.filter((idx) => idsByApiIndex.has(idx))
          : Array.from(idsByApiIndex.keys())

      for (const apiIndex of indicesToStart) {
        if (pausedByUserApiIndicesRef.current.has(apiIndex) || timedOutApiIndicesRef.current.has(apiIndex)) {
          continue
        }
        const ids = idsByApiIndex.get(apiIndex)
        if (!ids || ids.length === 0) continue

        const handleBatchSamples = (serverId: string, samples: LiveSampleEvent[]) => {
          const uid = makeServerUid(apiIndex, serverId)
          const existing = serversMapRef.current.get(uid)
          if (!existing || samples.length === 0) return
          let updated = existing
          for (const sample of samples) {
            updated = mergeBatchSampleIntoServer(updated, sample.data, sample.ts, sample.reportTs)
          }
          serversMapRef.current.set(uid, updated)
          dirtyRef.current = true
        }

        const prevCtrl = liveSocketsMapRef.current.get(apiIndex)
        if (prevCtrl) {
          // Keep already active or connecting backend sockets undisturbed during incremental recovery
          if (!targetIndices) {
            continue
          }
          prevCtrl.close()
          liveSocketsMapRef.current.delete(apiIndex)
        }

        const siteTimeoutMinutes =
          getSiteConfigByIndex(apiIndex)?.frontend_ws_timeout_minutes ??
          configRef.current?.frontend_ws_timeout_minutes ??
          0

        const ctrl = createCfsmLiveSocket("all", apiIndex, ids, {
          timeoutMinutes: siteTimeoutMinutes,
          onSamples: handleBatchSamples,
          onStatus: () => {
            const anyConnected = Array.from(liveSocketsMapRef.current.values()).some((c) => c.isConnected())
            setWsConnected(anyConnected)
          },
          onTimeout: () => {
            const currentCtrl = liveSocketsMapRef.current.get(apiIndex)
            if (currentCtrl) {
              currentCtrl.close()
              liveSocketsMapRef.current.delete(apiIndex)
            }
            timedOutApiIndicesRef.current.add(apiIndex)
            const anyConnected = Array.from(liveSocketsMapRef.current.values()).some((c) => c.isConnected())
            setWsConnected(anyConnected)
            setWsTimeoutMinutes(siteTimeoutMinutes)
            setWsTimedOut(true)
          },
        })
        liveSocketsMapRef.current.set(apiIndex, ctrl)
      }
    },
    [stopDashboardSockets],
  )

  const loadDashboardServers = useCallback(
    async (targetIndices?: number[], forceFull = false) => {
      if (turnstileRequiredRef.current || privateRequiredRef.current || !configRef.current) return

      let requestedIndices =
        !forceFull && targetIndices && targetIndices.length > 0
          ? Array.from(new Set(targetIndices))
          : null

      // Coalesce concurrent requests within the same credential epoch; otherwise wait and recompute pending set
      while (dashboardInFlightRef.current) {
        const effectiveReq =
          !forceFull && !requestedIndices && dashboardFetchedRef.current
            ? Array.from(pendingSyncApiIndicesRef.current)
            : requestedIndices
        if (effectiveReq !== null && effectiveReq.length === 0) return

        const current = dashboardInFlightRef.current
        const sameEpoch = current.authEpoch === authEpochRef.current
        const sameTargetRecovery =
          effectiveReq !== null &&
          !current.isFull &&
          effectiveReq.every((idx) => current.indices.has(idx))
        const coveredFull = effectiveReq === null && current.isFull

        if (sameEpoch && (coveredFull || sameTargetRecovery)) {
          return current.promise
        }

        try {
          await current.promise
        } catch {
          // continue and recompute remaining pending sites
        }

        if (!forceFull && dashboardFetchedRef.current) {
          const remaining = (
            requestedIndices ?? Array.from(pendingSyncApiIndicesRef.current)
          ).filter((idx) => pendingSyncApiIndicesRef.current.has(idx))
          if (remaining.length === 0) return
          requestedIndices = remaining
        } else if (requestedIndices) {
          const remaining = requestedIndices.filter((idx) => pendingSyncApiIndicesRef.current.has(idx))
          if (remaining.length === 0) return
          requestedIndices = remaining
        }
      }

      if (!forceFull && dashboardFetchedRef.current) {
        const remaining = (
          requestedIndices ?? Array.from(pendingSyncApiIndicesRef.current)
        ).filter((idx) => pendingSyncApiIndicesRef.current.has(idx))
        if (remaining.length === 0) return
        requestedIndices = remaining
      } else if (requestedIndices) {
        const remaining = requestedIndices.filter((idx) => pendingSyncApiIndicesRef.current.has(idx))
        if (remaining.length === 0) return
        requestedIndices = remaining
      }

      const activeCfg = configRef.current
      if (!activeCfg || turnstileRequiredRef.current || privateRequiredRef.current) return

      const effectiveTargets = requestedIndices ?? undefined
      const isPartial = Boolean(effectiveTargets && effectiveTargets.length > 0)
      const requestEpoch = authEpochRef.current

      const run = async () => {
        if (serversMapRef.current.size === 0) {
          setDashboardLoading(true)
        }
        setDashboardError(null)
        try {
          const res = await fetchServersAll(effectiveTargets)

          if (!isPartial || res.succeededApiIndices.includes(0)) {
            const mergedSysConfig: CfsmSysConfig = {
              ...res.sysConfig,
              custom_ct_name: res.sysConfig.custom_ct_name || activeCfg.custom_ct_name || "电信",
              custom_cu_name: res.sysConfig.custom_cu_name || activeCfg.custom_cu_name || "联通",
              custom_cm_name: res.sysConfig.custom_cm_name || activeCfg.custom_cm_name || "移动",
              custom_bd_name: res.sysConfig.custom_bd_name || activeCfg.custom_bd_name || "BGP",
              node_1_name: res.sysConfig.node_1_name || activeCfg.node_1_name || "Node 1",
              node_2_name: res.sysConfig.node_2_name || activeCfg.node_2_name || "Node 2",
              node_3_name: res.sysConfig.node_3_name || activeCfg.node_3_name || "Node 3",
              node_4_name: res.sysConfig.node_4_name || activeCfg.node_4_name || "Node 4",
              latency_window: res.sysConfig.latency_window || activeCfg.latency_window,
            }
            sysConfigRef.current = mergedSysConfig
            setSysConfig(mergedSysConfig)
          }

          const succeededSet = new Set(res.succeededApiIndices)
          const failedSet = new Set(res.failedApiIndices)
          const nextMap = new Map<string, CfsmServer>()

          // Keep servers belonging to untouched healthy sites; replace servers from updated or failed sites
          serversMapRef.current.forEach((srv, uid) => {
            const idx = srv.apiIndex ?? 0
            if (!succeededSet.has(idx) && !failedSet.has(idx)) {
              nextMap.set(uid, srv)
            }
          })
          for (const srv of res.servers) {
            nextMap.set(makeServerUid(srv.apiIndex, srv.id), srv)
          }

          // Replay cached latestReportUpdates immediately so metrics reflect newest buffered report
          for (const upd of res.latestReportUpdates) {
            const updApiIdx = upd.apiIndex ?? getApiIndexForBase(upd.source || "")
            const uid = makeServerUid(updApiIdx, upd.serverId)
            const existing = nextMap.get(uid)
            if (!existing || !Array.isArray(upd.samples) || upd.samples.length === 0) continue
            let merged = existing
            const reportTs = normalizeTimestampMs(upd.reportTs ?? upd.report_timestamp, 0)
            for (const s of upd.samples) {
              const data = s.data || s.payload || s.metrics
              if (!data) continue
              merged = mergeBatchSampleIntoServer(
                merged,
                data,
                normalizeTimestampMs(s.ts ?? s.timestamp, reportTs),
                reportTs,
              )
            }
            nextMap.set(uid, merged)
          }

          res.succeededApiIndices.forEach((idx) => pendingSyncApiIndicesRef.current.delete(idx))
          res.failedApiIndices.forEach((idx) => pendingSyncApiIndicesRef.current.add(idx))

          serversMapRef.current = nextMap
          if (res.succeededApiIndices.length > 0) {
            dashboardFetchedRef.current = true
          }
          dirtyRef.current = false

          const canUseDirectStats = !isPartial && res.failedApiIndices.length === 0
          flushServersToState(
            canUseDirectStats ? res.stats : undefined,
            canUseDirectStats ? res.regionStats : undefined,
          )

          if (dashboardMountedCountRef.current > 0 && !closedByUserRef.current) {
            stopDashboardSockets(res.succeededApiIndices)
            startDashboardSockets()
          }
        } catch (err) {
          if (err instanceof CfsmApiError && (err.status === 401 || err.status === 403)) {
            if (effectiveTargets && effectiveTargets.length > 0) {
              effectiveTargets.forEach((idx) => pendingSyncApiIndicesRef.current.add(idx))
            } else {
              const targets = getApiBases()
              const allIdx = targets.length > 0 ? targets.map((_, idx) => idx) : [0]
              allIdx.forEach((idx) => pendingSyncApiIndicesRef.current.add(idx))
            }
            return
          }
          const message = err instanceof Error ? err.message : "Failed to load servers"
          setDashboardError(message)
        } finally {
          setDashboardLoading(false)
        }
      }

      const promise = run().finally(() => {
        if (dashboardInFlightRef.current?.promise === promise) {
          dashboardInFlightRef.current = null
        }
      })
      dashboardInFlightRef.current = {
        promise,
        isFull: !isPartial,
        indices: new Set(effectiveTargets ?? []),
        authEpoch: requestEpoch,
      }
      return promise
    },
    [flushServersToState, startDashboardSockets, stopDashboardSockets],
  )

  const wsTimedOutRef = useRef(wsTimedOut)
  wsTimedOutRef.current = wsTimedOut

  const continueLiveConnection = useCallback(() => {
    const timedOutTargets = Array.from(timedOutApiIndicesRef.current)
    timedOutApiIndicesRef.current.clear()
    timedOutTargets.forEach((idx) => pausedByUserApiIndicesRef.current.delete(idx))
    closedByUserRef.current = false
    wsTimedOutRef.current = false
    setWsTimedOut(false)
    if (dashboardMountedCountRef.current > 0) {
      startDashboardSockets(timedOutTargets.length > 0 ? timedOutTargets : undefined)
    }
  }, [startDashboardSockets])

  const closeLiveConnection = useCallback(() => {
    timedOutApiIndicesRef.current.forEach((idx) => {
      pausedByUserApiIndicesRef.current.add(idx)
      stopDashboardSockets([idx])
    })
    timedOutApiIndicesRef.current.clear()
    wsTimedOutRef.current = false
    setWsTimedOut(false)
    if (liveSocketsMapRef.current.size === 0) {
      closedByUserRef.current = true
    }
  }, [stopDashboardSockets])

  const loadDashboardServersRef = useRef(loadDashboardServers)
  loadDashboardServersRef.current = loadDashboardServers
  const startDashboardSocketsRef = useRef(startDashboardSockets)
  startDashboardSocketsRef.current = startDashboardSockets

  const mountDashboard = useCallback(() => {
    dashboardMountedCountRef.current += 1
    const isFirstMount = dashboardMountedCountRef.current === 1

    if (isFirstMount) {
      // Flush WS batchUpdates at most once per second AND check 5-minute online expiry when page is visible
      if (flushIntervalRef.current === null) {
        flushIntervalRef.current = window.setInterval(() => {
          if (typeof document !== "undefined" && document.hidden) return
          if (dirtyRef.current) {
            dirtyRef.current = false
            flushServersToState()
            return
          }
          const ts = Date.now()
          for (const srv of serversMapRef.current.values()) {
            const expectedOnline = isCfsmServerOnline(srv, ts)
            const uid = makeServerUid(srv.apiIndex, srv.id)
            if (renderedOnlineMapRef.current.get(uid) !== expectedOnline) {
              flushServersToState()
              break
            }
          }
        }, 1000)
      }

      if (!dashboardFetchedRef.current) {
        void loadDashboardServersRef.current()
      } else if (pendingSyncApiIndicesRef.current.size > 0) {
        void loadDashboardServersRef.current(Array.from(pendingSyncApiIndicesRef.current))
      } else if (!closedByUserRef.current) {
        startDashboardSocketsRef.current()
      }
    }

    return () => {
      dashboardMountedCountRef.current = Math.max(0, dashboardMountedCountRef.current - 1)
      if (dashboardMountedCountRef.current === 0) {
        stopDashboardSockets()
        if (flushIntervalRef.current !== null) {
          window.clearInterval(flushIntervalRef.current)
          flushIntervalRef.current = null
        }
      }
    }
  }, [flushServersToState, stopDashboardSockets])

  // Initial load OR recovery of pending sites after verification/auth completes
  useEffect(() => {
    if (dashboardMountedCountRef.current <= 0 || !configReady || turnstileRequired || privateRequired) return
    if (!dashboardFetchedRef.current) {
      void loadDashboardServersRef.current()
    } else if (pendingSyncApiIndicesRef.current.size > 0) {
      void loadDashboardServersRef.current(Array.from(pendingSyncApiIndicesRef.current))
    }
  }, [configReady, privateRequired, turnstileRequired])

  // Handle Page Visibility on Dashboard: close WS when hidden, catch up REST + reconnect when visible
  useEffect(() => {
    const onVisibilityChange = () => {
      if (dashboardMountedCountRef.current <= 0) return
      if (document.hidden) {
        stopDashboardSockets()
      } else if (!wsTimedOutRef.current && !closedByUserRef.current && configReady && !turnstileRequired && !privateRequired) {
        void loadDashboardServersRef.current(undefined, true)
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [configReady, privateRequired, stopDashboardSockets, turnstileRequired])

  const value: CfsmContextValue = {
    config,
    configLoading,
    configError,
    turnstileRequired,
    privateRequired,
    retryConfig: () => loadInitialConfig(true),
    completeTurnstile,
    themeOptions,
    setLocalThemeOptions,
    saveRemoteThemeOptions,
    dashboardLoading,
    dashboardError,
    servers,
    now,
    stats,
    regionStats,
    sysConfig,
    wsConnected,
    wsTimedOut,
    wsTimeoutMinutes,
    continueLiveConnection,
    closeLiveConnection,
    mountDashboard,
  }

  return <CfsmContext.Provider value={value}>{children}</CfsmContext.Provider>
}
