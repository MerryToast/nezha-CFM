import {
  ALLOWED_HISTORY_HOURS,
  CfsmApiError,
  fetchServerDetail,
  fetchServerHistory,
  getSiteConfigByIndex,
} from "@/api/cfsm-client"
import { useCfsm } from "@/hooks/use-cfsm"
import { LiveSampleEvent, LiveSocketController, createCfsmLiveSocket } from "@/hooks/useCFSMWebSocket"
import {
  cfsmServerToNezhaServer,
  isCfsmServerOnline,
  mergeBatchSampleIntoServer,
  normalizeTimestampMs,
} from "@/lib/cfsm-normalizer"
import { CfsmHistoryRow, CfsmServer } from "@/types/cfsm"
import { NezhaServer } from "@/types/nezha-api"
import { useCallback, useEffect, useRef, useState } from "react"

export const DETAIL_TIME_OPTIONS = [
  { hours: 0.167, label: "10m" },
  { hours: 0.5, label: "30m" },
  { hours: 1, label: "1h" },
  { hours: 6, label: "6h" },
  { hours: 12, label: "12h" },
  { hours: 24, label: "24h" },
  { hours: 48, label: "2d" },
  { hours: 96, label: "4d" },
  { hours: 168, label: "7d" },
] as const

const MAX_LIVE_HISTORY_POINTS = 500

export function useServerDetailData(serverId: string, apiIndex = 0) {
  const { config, turnstileRequired, privateRequired, themeOptions } = useCfsm()

  const configReady = Boolean(config)
  const configRef = useRef(config)
  configRef.current = config

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [server, setServer] = useState<NezhaServer | null>(null)
  const [rawServer, setRawServer] = useState<CfsmServer | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())

  const [hours, setHoursState] = useState<number>(0.167)
  const [history, setHistory] = useState<CfsmHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyAuthRequired, setHistoryAuthRequired] = useState(false)

  const [wsConnected, setWsConnected] = useState(false)
  const [wsTimedOut, setWsTimedOut] = useState(false)

  const targetKey = `${apiIndex}:${serverId}`
  const activeTargetRef = useRef<string>(targetKey)
  activeTargetRef.current = targetKey
  const prevTargetKeyRef = useRef<string>("")

  const rawServerRef = useRef<CfsmServer | null>(null)
  const renderedOnlineRef = useRef<boolean | null>(null)
  const themeOptionsRef = useRef(themeOptions)
  themeOptionsRef.current = themeOptions
  const hoursRef = useRef<number>(0.167)
  const lastLoadedHoursRef = useRef<number>(0.167)
  const detailReqSeqRef = useRef(0)
  const historyReqSeqRef = useRef(0)
  const socketRef = useRef<LiveSocketController | null>(null)
  const closedByUserRef = useRef(false)
  const wsTimedOutRef = useRef(wsTimedOut)
  wsTimedOutRef.current = wsTimedOut
  const dirtyRef = useRef(false)
  const pendingHistoryRowsRef = useRef<CfsmHistoryRow[]>([])

  const siteTimeoutMinutes =
    getSiteConfigByIndex(apiIndex)?.frontend_ws_timeout_minutes ??
    config?.frontend_ws_timeout_minutes ??
    0

  const syncNormalizedServer = useCallback((srv: CfsmServer) => {
    const ts = Date.now()
    const normalized = cfsmServerToNezhaServer(srv, ts, srv.sysConfig, themeOptionsRef.current)
    rawServerRef.current = srv
    renderedOnlineRef.current = normalized.online
    setRawServer(srv)
    setNow(ts)
    setServer(normalized)
  }, [])

  // Re-normalize in memory when themeOptions changes without restarting WS/REST
  useEffect(() => {
    if (rawServerRef.current) {
      syncNormalizedServer(rawServerRef.current)
    }
  }, [syncNormalizedServer, themeOptions])

  const loadDetailOnce = useCallback(async () => {
    if (!serverId || !configReady || turnstileRequired || privateRequired) return
    const reqId = ++detailReqSeqRef.current
    const reqKey = `${apiIndex}:${serverId}`
    if (!rawServerRef.current) setLoading(true)
    setError(null)
    try {
      const detail = await fetchServerDetail(serverId, apiIndex)
      if (reqId !== detailReqSeqRef.current || activeTargetRef.current !== reqKey) return

      let merged = detail
      if (Array.isArray(detail.latestReportUpdates)) {
        for (const upd of detail.latestReportUpdates) {
          if (String(upd.serverId) !== String(serverId) || !Array.isArray(upd.samples)) continue
          const reportTs = normalizeTimestampMs(upd.reportTs ?? upd.report_timestamp, 0)
          for (const sample of upd.samples) {
            const data = sample.data || sample.payload || sample.metrics
            if (!data) continue
            const sampleTs = normalizeTimestampMs(sample.ts ?? sample.timestamp, reportTs)
            merged = mergeBatchSampleIntoServer(merged, data, sampleTs, reportTs)
          }
        }
      }
      syncNormalizedServer(merged)
    } catch (err) {
      if (reqId !== detailReqSeqRef.current || activeTargetRef.current !== reqKey) return
      if (err instanceof CfsmApiError && (err.status === 401 || err.status === 403)) return
      setError(err instanceof Error ? err.message : "Failed to load server")
    } finally {
      if (reqId === detailReqSeqRef.current && activeTargetRef.current === reqKey) {
        setLoading(false)
      }
    }
  }, [apiIndex, configReady, privateRequired, serverId, syncNormalizedServer, turnstileRequired])

  const loadHistory = useCallback(
    async (targetHours: number, force = false) => {
      if (!serverId || !configReady || turnstileRequired || privateRequired) return
      const validHours = ALLOWED_HISTORY_HOURS.includes(targetHours as (typeof ALLOWED_HISTORY_HOURS)[number])
        ? targetHours
        : 0.167
      const reqId = ++historyReqSeqRef.current
      const reqKey = `${apiIndex}:${serverId}`

      setHistoryLoading(true)
      setHistoryError(null)
      setHistoryAuthRequired(false)
      try {
        const rows = await fetchServerHistory(serverId, validHours, apiIndex, force)
        if (reqId !== historyReqSeqRef.current || activeTargetRef.current !== reqKey) return
        const sorted = [...rows].sort((a, b) => normalizeTimestampMs(a.timestamp, 0) - normalizeTimestampMs(b.timestamp, 0))
        lastLoadedHoursRef.current = validHours
        setHistory(sorted)
      } catch (err) {
        if (reqId !== historyReqSeqRef.current || activeTargetRef.current !== reqKey) return
        if (err instanceof CfsmApiError && err.status === 401) {
          setHistoryAuthRequired(true)
          if (validHours > 24) {
            const fallbackHours = lastLoadedHoursRef.current <= 24 ? lastLoadedHoursRef.current : 0.167
            hoursRef.current = fallbackHours
            setHoursState(fallbackHours)
          }
          return
        }
        setHistoryError(err instanceof Error ? err.message : "Failed to load history")
      } finally {
        if (reqId === historyReqSeqRef.current && activeTargetRef.current === reqKey) {
          setHistoryLoading(false)
        }
      }
    },
    [apiIndex, configReady, privateRequired, serverId, turnstileRequired],
  )

  const changeHours = useCallback(
    (nextHours: number) => {
      hoursRef.current = nextHours
      pendingHistoryRowsRef.current = []
      setHoursState(nextHours)
      void loadHistory(nextHours)
    },
    [loadHistory],
  )

  const stopSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    setWsConnected(false)
  }, [])

  const startSocket = useCallback(() => {
    if (!serverId || !configReady || turnstileRequired || privateRequired) return
    if (closedByUserRef.current || wsTimedOutRef.current) return
    if (typeof document !== "undefined" && document.hidden) {
      stopSocket()
      return
    }
    stopSocket()

    const timeoutMinutes =
      getSiteConfigByIndex(apiIndex)?.frontend_ws_timeout_minutes ??
      configRef.current?.frontend_ws_timeout_minutes ??
      0

    socketRef.current = createCfsmLiveSocket(serverId, apiIndex, [serverId], {
      timeoutMinutes,
      onSamples: (_id, samples: LiveSampleEvent[]) => {
        if (!rawServerRef.current || samples.length === 0) return
        let updated = rawServerRef.current
        for (const s of samples) {
          updated = mergeBatchSampleIntoServer(updated, s.data, s.ts, s.reportTs)
          if (Math.abs(hoursRef.current - 0.167) < 0.001) {
            pendingHistoryRowsRef.current.push({
              ...updated,
              timestamp: s.ts,
            })
          }
        }
        rawServerRef.current = updated
        dirtyRef.current = true
      },
      onStatus: ({ connected }) => setWsConnected(connected),
      onTimeout: () => {
        wsTimedOutRef.current = true
        setWsTimedOut(true)
        stopSocket()
      },
    })
  }, [apiIndex, configReady, privateRequired, serverId, stopSocket, turnstileRequired])

  const continueLiveConnection = useCallback(() => {
    wsTimedOutRef.current = false
    setWsTimedOut(false)
    closedByUserRef.current = false
    startSocket()
  }, [startSocket])

  const closeLiveConnection = useCallback(() => {
    wsTimedOutRef.current = false
    setWsTimedOut(false)
    closedByUserRef.current = true
    stopSocket()
  }, [stopSocket])

  // Reset per-node buffers strictly when target node (${apiIndex}:${serverId}) changes
  useEffect(() => {
    if (prevTargetKeyRef.current !== targetKey) {
      prevTargetKeyRef.current = targetKey
      detailReqSeqRef.current += 1
      historyReqSeqRef.current += 1
      rawServerRef.current = null
      renderedOnlineRef.current = null
      dirtyRef.current = false
      pendingHistoryRowsRef.current = []
      hoursRef.current = 0.167
      lastLoadedHoursRef.current = 0.167
      closedByUserRef.current = false
      wsTimedOutRef.current = false
      setWsTimedOut(false)
      setHoursState(0.167)
      setServer(null)
      setRawServer(null)
      setHistory([])
      setHistoryAuthRequired(false)
    }
  }, [targetKey])

  // Initial load + single-server WS; isolated from config object mutations such as saving themeOptions
  useEffect(() => {
    if (!serverId || !configReady || turnstileRequired || privateRequired) return
    if (!rawServerRef.current) {
      void loadDetailOnce()
      void loadHistory(hoursRef.current)
    }
    startSocket()

    const flushTimer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      if (rawServerRef.current) {
        const expectedOnline = isCfsmServerOnline(rawServerRef.current, Date.now())
        if (dirtyRef.current || renderedOnlineRef.current !== expectedOnline) {
          dirtyRef.current = false
          syncNormalizedServer(rawServerRef.current)
        }
      }
      if (pendingHistoryRowsRef.current.length > 0) {
        const incoming = pendingHistoryRowsRef.current.splice(0)
        const cutoff = Date.now() - hoursRef.current * 3600 * 1000
        setHistory((prev) => {
          const merged = [...prev, ...incoming].filter((r) => normalizeTimestampMs(r.timestamp, 0) >= cutoff)
          return merged.slice(-MAX_LIVE_HISTORY_POINTS)
        })
      }
    }, 1000)

    return () => {
      window.clearInterval(flushTimer)
      stopSocket()
    }
  }, [
    apiIndex,
    configReady,
    loadDetailOnce,
    loadHistory,
    privateRequired,
    serverId,
    startSocket,
    stopSocket,
    syncNormalizedServer,
    turnstileRequired,
  ])

  // Visibility change handling for detail page
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        stopSocket()
      } else if (!wsTimedOutRef.current && !closedByUserRef.current && configReady && !turnstileRequired && !privateRequired) {
        void loadDetailOnce()
        startSocket()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [configReady, loadDetailOnce, privateRequired, startSocket, stopSocket, turnstileRequired])

  return {
    loading,
    error,
    server,
    rawServer,
    now,
    hours,
    changeHours,
    history,
    historyLoading,
    historyError,
    historyAuthRequired,
    wsConnected,
    wsTimedOut,
    wsTimeoutMinutes: siteTimeoutMinutes,
    continueLiveConnection,
    closeLiveConnection,
  }
}
