import { USE_MOCK, buildWsUrl, getMockBatchUpdateSample } from "@/api/cfsm-client"
import { normalizeTimestampMs } from "@/lib/cfsm-normalizer"
import { CfsmServer, CfsmWsMessage } from "@/types/cfsm"

export interface LiveSampleEvent {
  serverId: string
  ts: number
  reportTs: number
  data: Partial<CfsmServer>
}

export interface LiveSocketHandlers {
  onSamples: (serverId: string, samples: LiveSampleEvent[]) => void
  onStatus?: (status: { connected: boolean; reason: string }) => void
  onTimeout?: () => void
  timeoutMinutes?: number
}

export interface LiveSocketController {
  close: () => void
  reconnect: () => void
  isConnected: () => boolean
}

const RECONNECT_INITIAL_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30000
const MAX_RECONNECT_ATTEMPTS = 10

export function createCfsmLiveSocket(
  subscribe: string,
  apiIndex: number,
  serverIds: string[],
  handlers: LiveSocketHandlers,
): LiveSocketController {
  const scope = subscribe || "all"
  const timeoutMinutes = Math.max(0, Math.min(1440, Number(handlers.timeoutMinutes) || 0))
  const maxLifetimeMs = timeoutMinutes * 60 * 1000

  let ws: WebSocket | null = null
  let manualClose = false
  let reconnectTimer: number | null = null
  let lifetimeTimer: number | null = null
  let mockTimer: number | null = null
  let pingTimer: number | null = null
  let reconnectDelay = RECONNECT_INITIAL_DELAY_MS
  let reconnectAttempts = 0
  let connected = false

  const setConnected = (next: boolean, reason: string) => {
    connected = next
    handlers.onStatus?.({ connected: next, reason })
  }

  const clearTimers = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (lifetimeTimer !== null) {
      window.clearTimeout(lifetimeTimer)
      lifetimeTimer = null
    }
    if (mockTimer !== null) {
      window.clearInterval(mockTimer)
      mockTimer = null
    }
    if (pingTimer !== null) {
      window.clearInterval(pingTimer)
      pingTimer = null
    }
  }

  const startLifetimeTimer = () => {
    if (lifetimeTimer !== null) {
      window.clearTimeout(lifetimeTimer)
      lifetimeTimer = null
    }
    if (maxLifetimeMs <= 0) return
    lifetimeTimer = window.setTimeout(() => {
      lifetimeTimer = null
      manualClose = true
      clearTimers()
      if (ws) {
        try {
          ws.close(1000, "connection lifetime exceeded")
        } catch {
          // ignore
        }
        ws = null
      }
      setConnected(false, "timeout")
      handlers.onTimeout?.()
    }, maxLifetimeMs)
  }

  const processBatchUpdate = (msg: CfsmWsMessage) => {
    const msgTs = normalizeTimestampMs(msg.ts, Date.now())
    const updates = Array.isArray(msg.updates) ? msg.updates : []
    for (const upd of updates) {
      if (!upd?.serverId) continue
      const rawSamples = Array.isArray(upd.samples) ? upd.samples : []
      const reportTs = normalizeTimestampMs(upd.reportTs ?? upd.report_timestamp ?? upd.ts, msgTs)
      const events: LiveSampleEvent[] = []
      for (const sample of rawSamples) {
        if (!sample || typeof sample !== "object") continue
        const data = sample.data || sample.payload || sample.metrics
        if (!data || typeof data !== "object") continue
        const ts = normalizeTimestampMs(
          sample.ts ?? sample.timestamp ?? data.sample_timestamp ?? data.last_updated ?? data.timestamp ?? upd.ts,
          reportTs,
        )
        events.push({
          serverId: String(upd.serverId),
          ts,
          reportTs,
          data,
        })
      }
      if (events.length > 0) {
        events.sort((a, b) => a.ts - b.ts)
        handlers.onSamples(String(upd.serverId), events)
      }
    }
  }

  const scheduleReconnect = () => {
    if (manualClose || reconnectTimer !== null) return
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setConnected(false, "max_reconnect_reached")
      return
    }
    const delay = reconnectDelay
    reconnectAttempts += 1
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      if (!manualClose) connect()
    }, delay)
  }

  const connect = () => {
    manualClose = false
    clearTimers()

    if (USE_MOCK) {
      setConnected(true, "mock_connected")
      startLifetimeTimer()
      const targetIds = scope === "all" ? serverIds : [scope]
      mockTimer = window.setInterval(() => {
        if (manualClose) return
        const ts = Date.now()
        for (const id of targetIds) {
          const sample = getMockBatchUpdateSample(id)
          if (sample) {
            handlers.onSamples(id, [{ serverId: id, ts, reportTs: ts, data: sample }])
          }
        }
      }, 2000)
      return
    }

    let socket: WebSocket
    try {
      const wsUrl = buildWsUrl(scope, apiIndex)
      socket = new WebSocket(wsUrl)
      ws = socket
    } catch {
      setConnected(false, "ws_unsupported")
      return
    }

    socket.addEventListener("open", () => {
      if (socket !== ws || manualClose) {
        try {
          socket.close()
        } catch {
          // ignore
        }
        return
      }
      reconnectDelay = RECONNECT_INITIAL_DELAY_MS
      reconnectAttempts = 0

      if (scope === "all") {
        // CFSM spec limits subscribe ids to max 500 items
        const ids = serverIds.filter(Boolean).slice(0, 500)
        try {
          socket.send(JSON.stringify({ type: "subscribe", scope: "all", ids }))
        } catch {
          // ignore
        }
      }

      setConnected(true, "connected")
      startLifetimeTimer()

      pingTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: "ping", ts: Date.now() }))
          } catch {
            // ignore
          }
        }
      }, 25_000)
    })

    socket.addEventListener("message", (ev) => {
      if (socket !== ws) return
      if (typeof ev.data !== "string") return
      try {
        const msg = JSON.parse(ev.data) as CfsmWsMessage
        if (msg.type === "batchUpdate") {
          processBatchUpdate(msg)
        }
      } catch {
        // ignore malformed frames
      }
    })

    socket.addEventListener("close", (ev) => {
      if (socket !== ws) return
      ws = null
      clearTimers()
      setConnected(false, ev.reason || "disconnected")
      // 1008 policy/auth violation should not blindly spin reconnect
      if (!manualClose && ev.code !== 1008) {
        scheduleReconnect()
      }
    })

    socket.addEventListener("error", () => {
      if (socket !== ws) return
      setConnected(false, "error")
      try {
        socket.close()
      } catch {
        // ignore
      }
    })
  }

  connect()

  return {
    close() {
      manualClose = true
      reconnectAttempts = MAX_RECONNECT_ATTEMPTS
      clearTimers()
      if (ws) {
        try {
          ws.close(1000, "client_closed")
        } catch {
          // ignore
        }
        ws = null
      }
      setConnected(false, "closed")
    },
    reconnect() {
      manualClose = false
      reconnectAttempts = 0
      reconnectDelay = RECONNECT_INITIAL_DELAY_MS
      clearTimers()
      if (ws) {
        try {
          ws.close(1000, "client_reconnect")
        } catch {
          // ignore
        }
        ws = null
      }
      connect()
    },
    isConnected() {
      return connected
    },
  }
}
