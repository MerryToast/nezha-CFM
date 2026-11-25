import { sanitizeSafeUrl } from "@/lib/security"
import {
  STORAGE_KEYS,
  clearTurnstileStorage,
  getTurnstileToken,
  getTurnstileVerified,
  setTurnstileToken,
  setTurnstileVerified,
} from "@/lib/turnstile"
import {
  CfsmHistoryRow,
  CfsmLatestReportUpdate,
  CfsmServer,
  CfsmServersResponse,
  CfsmSiteConfig,
  CfsmSysConfig,
  CfsmThemeOptions,
} from "@/types/cfsm"
import {
  createMockSampleForServer,
  getMockConfig,
  getMockHistory,
  getMockServerDetail,
  getMockServersResponse,
  saveMockThemeOptions,
} from "./cfsm-mock"

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true"
export const ALLOWED_HISTORY_HOURS = [0.167, 0.5, 1, 6, 12, 24, 48, 96, 168] as const

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_SYS_CONFIG: CfsmSysConfig = {
  show_price: true,
  show_expire: true,
  show_tf: true,
  show_three_net_details: true,
  display_mode: "bar",
}

export class CfsmApiError extends Error {
  status: number
  code?: number | string
  baseUrl?: string
  apiIndex?: number

  constructor(message: string, status: number, code?: number | string, baseUrl?: string, apiIndex?: number) {
    super(message)
    this.name = "CfsmApiError"
    this.status = status
    this.code = code
    this.baseUrl = baseUrl
    this.apiIndex = apiIndex
  }
}

function stripTrailingSlash(value: string): string {
  return String(value || "").replace(/\/+$/, "")
}

function normalizeSafeApiOrigin(raw: string): string {
  const trimmed = String(raw || "").trim()
  if (!trimmed || /[\s;"'<>]/.test(trimmed)) return ""
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return ""
    }
    return stripTrailingSlash(parsed.origin)
  } catch {
    return ""
  }
}

let cachedBases: string[] | null = null
let hasExplicitMetaBases = false

export function initApiBases(): string[] {
  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="apiBase"]')?.getAttribute("content")
    if (meta) {
      const parsed = meta
        .split(",")
        .map((s) => normalizeSafeApiOrigin(s))
        .filter(Boolean)
      if (parsed.length > 0) {
        hasExplicitMetaBases = true
        cachedBases = Array.from(new Set(parsed))
        return cachedBases
      }
    }
  }
  hasExplicitMetaBases = false
  const origin = typeof window !== "undefined" ? normalizeSafeApiOrigin(window.location.origin) : ""
  cachedBases = origin ? [origin] : []
  return cachedBases
}

export function getApiBases(): string[] {
  if (!cachedBases) {
    return initApiBases()
  }
  return cachedBases
}

export function hasConfiguredApiBase(): boolean {
  if (!cachedBases) initApiBases()
  return hasExplicitMetaBases
}

export function hasMultipleApiBases(): boolean {
  return getApiBases().length > 1
}

export function getAdminEntryUrl(apiIndex = 0): string {
  const bases = getApiBases()
  if (hasConfiguredApiBase() && bases[apiIndex]) {
    return (
      sanitizeSafeUrl(`${bases[apiIndex]}/admin#/admin`, { allowRelative: true, allowHash: true }) ||
      "/admin#/admin"
    )
  }
  return "/admin#/admin"
}

export function getWorkerStaticAssetUrl(assetPath: string, apiIndex = 0): string {
  const clean = String(assetPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
  if (!clean || clean.includes("..")) return "/"
  const bases = getApiBases()
  const rawUrl = hasConfiguredApiBase() && bases[apiIndex] ? `${bases[apiIndex]}/${clean}` : `/${clean}`
  return sanitizeSafeUrl(rawUrl, { allowRelative: true, allowHash: false }) || "/"
}

function resolveOriginScope(baseUrl?: string): { origin: string; isSameOrigin: boolean } {
  const currentOrigin = typeof window !== "undefined" ? stripTrailingSlash(window.location.origin) : ""
  const clean = stripTrailingSlash(String(baseUrl || "").trim())
  if (!clean) {
    return { origin: currentOrigin || "default", isSameOrigin: true }
  }
  try {
    const parsed = new URL(clean, currentOrigin || "http://localhost")
    const origin = stripTrailingSlash(parsed.origin)
    return {
      origin: origin || currentOrigin || "default",
      isSameOrigin: Boolean(currentOrigin && origin === currentOrigin),
    }
  } catch {
    return {
      origin: clean,
      isSameOrigin: Boolean(currentOrigin && clean === currentOrigin),
    }
  }
}

export function getJwtToken(baseUrl?: string): string {
  try {
    const { origin, isSameOrigin } = resolveOriginScope(baseUrl)
    const scoped = localStorage.getItem(`${STORAGE_KEYS.JWT_TOKEN}:${origin}`)
    if (scoped) return scoped
    // Only fall back to unscoped jwt_token on same-origin deployments (written by /admin login)
    if (isSameOrigin) {
      return localStorage.getItem(STORAGE_KEYS.JWT_TOKEN) || ""
    }
    return ""
  } catch {
    return ""
  }
}

export function clearJwtToken(baseUrl?: string): void {
  try {
    if (baseUrl !== undefined) {
      const { origin, isSameOrigin } = resolveOriginScope(baseUrl)
      localStorage.removeItem(`${STORAGE_KEYS.JWT_TOKEN}:${origin}`)
      if (isSameOrigin) {
        localStorage.removeItem(STORAGE_KEYS.JWT_TOKEN)
      }
      return
    }
    localStorage.removeItem(STORAGE_KEYS.JWT_TOKEN)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`${STORAGE_KEYS.JWT_TOKEN}:`)) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    // ignore
  }
}

export function buildWsUrl(subscribe: string, apiIndex = 0): string {
  const bases = getApiBases()
  const base = bases[apiIndex] || bases[0] || (typeof window !== "undefined" ? window.location.origin : "")
  let url: URL
  try {
    const parsed = new URL(base)
    const wsProto = parsed.protocol === "https:" ? "wss:" : "ws:"
    url = new URL(`${wsProto}//${parsed.host}/api/ws`)
  } catch {
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:"
    const host = typeof window !== "undefined" ? window.location.host : "localhost"
    url = new URL(`${proto}//${host}/api/ws`)
  }

  url.searchParams.set("subscribe", subscribe || "all")

  // Cross-origin WS cannot send same-origin cookies automatically; pass JWT via query param only for private sites over secure transport
  const sameHost = typeof window !== "undefined" && url.host === window.location.host
  const siteCfg = getSiteConfigByIndex(apiIndex)
  if (!sameHost && siteCfg?.is_public !== true) {
    const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (url.protocol === "wss:" || isLocalhost) {
      const token = getJwtToken(base)
      if (token) {
        url.searchParams.set("token", token)
      }
    }
  }
  return url.toString()
}

type AuthEventListener = (event: {
  type: "unauthorized" | "turnstile_failed"
  status: number
  baseUrl: string
}) => void
const authListeners = new Set<AuthEventListener>()

export function subscribeAuthEvents(listener: AuthEventListener): () => void {
  authListeners.add(listener)
  return () => authListeners.delete(listener)
}

function notifyAuthEvent(event: {
  type: "unauthorized" | "turnstile_failed"
  status: number
  baseUrl: string
}) {
  authListeners.forEach((fn) => fn(event))
}

interface FetchOptions {
  method?: "GET" | "POST"
  body?: unknown
  includeAuth?: boolean
  includeTurnstileToken?: boolean
  includeTurnstileVerified?: boolean
  notifyOnAuthError?: boolean
  notifyOnUnauthorized?: boolean
  notifyOnForbidden?: boolean
  clearJwtOn401?: boolean
  baseUrl?: string
  timeoutMs?: number
}

async function fetchCFSM<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const {
    method = "GET",
    body,
    includeAuth = true,
    includeTurnstileToken = true,
    includeTurnstileVerified = true,
    notifyOnAuthError = true,
    notifyOnUnauthorized = notifyOnAuthError,
    notifyOnForbidden = notifyOnAuthError,
    clearJwtOn401 = true,
    baseUrl,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options

  const base = stripTrailingSlash(baseUrl ?? getApiBases()[0] ?? "")
  const { isSameOrigin } = resolveOriginScope(base)
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  const targetSite = getSiteConfigByIndex(getApiIndexForBase(base))
  const isConfigOrWrite = endpoint === "/api/config" || endpoint === "/api/theme_options"
  const isLongHistory = endpoint.startsWith("/api/history/all") && /hours=(48|96|168)\b/.test(endpoint)
  const requiresAuthContext =
    isSameOrigin ||
    isConfigOrWrite ||
    isLongHistory ||
    targetSite?.is_public !== true ||
    targetSite?.authorization === true

  if (includeAuth) {
    const jwt = getJwtToken(base)
    if (jwt && requiresAuthContext) {
      headers["Authorization"] = `Bearer ${jwt}`
    }
  }

  if (includeTurnstileToken) {
    const tsToken = getTurnstileToken(base)
    if (tsToken) {
      headers["X-Turnstile-Token"] = tsToken
    }
  }

  if (includeTurnstileVerified) {
    const tsVerified = getTurnstileVerified(base)
    if (tsVerified) {
      headers["X-Turnstile-Verified"] = tsVerified
    }
  }

  const credentialsMode: RequestCredentials = isSameOrigin
    ? "same-origin"
    : requiresAuthContext
      ? "include"
      : "omit"

  const controller = new AbortController()
  const timer = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const res = await fetch(`${base}${endpoint}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: credentialsMode,
      signal: controller.signal,
    })

    if (res.status === 401) {
      if (clearJwtOn401) {
        clearJwtToken(base)
      }
      if (notifyOnUnauthorized) {
        notifyAuthEvent({ type: "unauthorized", status: 401, baseUrl: base })
      }
      throw new CfsmApiError("Unauthorized", 401, 401, base)
    }

    if (res.status === 403) {
      clearTurnstileStorage(base)
      if (notifyOnForbidden) {
        notifyAuthEvent({ type: "turnstile_failed", status: 403, baseUrl: base })
      }
      throw new CfsmApiError("Turnstile verification failed", 403, 403, base)
    }

    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      let code: number | string = res.status
      try {
        const errJson = (await res.json()) as { error?: string; message?: string; code?: number | string }
        msg = errJson.message || errJson.error || msg
        if (errJson.code !== undefined) code = errJson.code
      } catch {
        // ignore non-json error body
      }
      throw new CfsmApiError(msg, res.status, code, base)
    }

    const data = (await res.json()) as T & { turnstile_verified?: string | null }
    if (data && typeof data === "object" && "turnstile_verified" in data && data.turnstile_verified) {
      setTurnstileVerified(data.turnstile_verified, base)
      try {
        localStorage.removeItem(STORAGE_KEYS.TURNSTILE_TOKEN)
      } catch {
        // ignore
      }
      // Clear single-use token after backend issued reusable verified ticket
      const key = `${STORAGE_KEYS.TURNSTILE_TOKEN}:${base || (typeof window !== "undefined" ? window.location.origin : "default")}`
      try {
        localStorage.removeItem(key)
      } catch {
        // ignore
      }
    }
    return data
  } catch (err) {
    if (err instanceof CfsmApiError) throw err
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new CfsmApiError("Request timeout", 0, "TIMEOUT", base)
    }
    const message = err instanceof Error ? err.message : "Network error"
    throw new CfsmApiError(message, 0, "NETWORK_ERROR", base)
  } finally {
    if (timer !== null) window.clearTimeout(timer)
  }
}

interface SiteConfigEntry {
  apiIndex: number
  baseUrl: string
  config: CfsmSiteConfig
}

const siteConfigsByIndex = new Map<number, SiteConfigEntry>()
const siteSysConfigsByIndex = new Map<number, CfsmSysConfig>()
let cachedSiteConfig: CfsmSiteConfig | null = null
let configInFlight: Promise<CfsmSiteConfig> | null = null

function attachUptimeBase(srv: CfsmServer): CfsmServer {
  const rawUptime = srv.uptime !== undefined && srv.uptime !== null ? Number(srv.uptime) : 0
  if (!Number.isFinite(rawUptime) || rawUptime <= 0) return srv
  const rawTs = srv.last_updated ?? srv.last_time ?? srv.timestamp ?? 0
  const numTs = typeof rawTs === "number" ? rawTs : Number(rawTs)
  const baseTs = Number.isFinite(numTs) && numTs > 0 ? (numTs < 10_000_000_000 ? numTs * 1000 : numTs) : Date.now()
  return {
    ...srv,
    _uptime_base_sec: Math.floor(rawUptime),
    _uptime_base_ts: baseTs,
  }
}

export function getSiteConfigByIndex(apiIndex = 0): CfsmSiteConfig | null {
  return siteConfigsByIndex.get(apiIndex)?.config ?? null
}

export function getSiteSysConfigByIndex(apiIndex = 0): CfsmSysConfig | null {
  return siteSysConfigsByIndex.get(apiIndex) ?? null
}

export function getApiIndexForBase(baseUrl: string): number {
  const normalized = stripTrailingSlash(baseUrl)
  const bases = getApiBases()
  if (!normalized) return 0
  const idx = bases.findIndex((b) => stripTrailingSlash(b) === normalized)
  return idx >= 0 ? idx : 0
}

function mergeSiteConfigs(): CfsmSiteConfig {
  const entries = Array.from(siteConfigsByIndex.values()).sort((a, b) => a.apiIndex - b.apiIndex)
  // Save destination is always apiIndex = 0; only grant authorization/theme_options from site 0 itself
  const primaryTargetEntry = siteConfigsByIndex.get(0)
  const fallbackEntry = primaryTargetEntry ?? entries[0]
  const primary = fallbackEntry.config

  const privateSites = entries.filter((item) => item.config.is_public === false)
  const unauthorizedPrivate = privateSites.find((item) => item.config.authorization !== true)
  const turnstileSites = entries.filter((item) => item.config.turnstile_enabled === true)
  const pendingTurnstile = turnstileSites.find(
    (item) => item.config.verified !== true && Boolean(item.config.turnstile_site_key),
  )

  return {
    ...primary,
    theme_options: primaryTargetEntry?.config.theme_options ?? {},
    is_public: privateSites.length === 0,
    authorization: primaryTargetEntry?.config.authorization === true,
    has_unauthorized_private: Boolean(unauthorizedPrivate),
    unauthorized_api_index: unauthorizedPrivate?.apiIndex,
    turnstile_enabled: turnstileSites.length > 0,
    turnstile_site_key:
      pendingTurnstile?.config.turnstile_site_key ||
      turnstileSites[0]?.config.turnstile_site_key ||
      primary.turnstile_site_key ||
      "",
    turnstile_api_index: pendingTurnstile?.apiIndex ?? turnstileSites[0]?.apiIndex ?? 0,
    verified:
      turnstileSites.length > 0
        ? turnstileSites.every((item) => item.config.verified === true)
        : primary.verified,
  }
}

export function markSiteTurnstileUnverified(baseUrl: string): CfsmSiteConfig | null {
  const normalized = stripTrailingSlash(baseUrl)
  let matched = false
  siteConfigsByIndex.forEach((entry, idx) => {
    if (stripTrailingSlash(entry.baseUrl) === normalized || (!normalized && idx === 0)) {
      siteConfigsByIndex.set(idx, {
        ...entry,
        config: {
          ...entry.config,
          turnstile_enabled: true,
          verified: false,
        },
      })
      matched = true
    }
  })
  if (!matched) {
    return null
  }
  cachedSiteConfig = mergeSiteConfigs()
  return cachedSiteConfig
}

export function markSiteUnauthorized(baseUrl: string): CfsmSiteConfig | null {
  const normalized = stripTrailingSlash(baseUrl)
  let matched = false
  siteConfigsByIndex.forEach((entry, idx) => {
    if (stripTrailingSlash(entry.baseUrl) === normalized || (!normalized && idx === 0)) {
      siteConfigsByIndex.set(idx, {
        ...entry,
        config: {
          ...entry.config,
          is_public: false,
          authorization: false,
        },
      })
      matched = true
    }
  })
  if (!matched) {
    return null
  }
  cachedSiteConfig = mergeSiteConfigs()
  return cachedSiteConfig
}

export async function refreshSiteConfigByIndex(apiIndex: number): Promise<CfsmSiteConfig | null> {
  if (USE_MOCK) return cachedSiteConfig
  const bases = getApiBases()
  const baseUrl = bases[apiIndex] ?? (apiIndex === 0 ? "" : undefined)
  if (baseUrl === undefined) return null
  try {
    const cfg = await fetchConfigForBase(baseUrl)
    siteConfigsByIndex.set(apiIndex, {
      apiIndex,
      baseUrl,
      config: cfg,
    })
    cachedSiteConfig = mergeSiteConfigs()
    return cachedSiteConfig
  } catch {
    return null
  }
}

async function fetchConfigForBase(baseUrl: string): Promise<CfsmSiteConfig> {
  try {
    return await fetchCFSM<CfsmSiteConfig>("/api/config", {
      baseUrl,
      includeAuth: true,
      includeTurnstileToken: true,
      includeTurnstileVerified: true,
      notifyOnAuthError: false,
    })
  } catch (err) {
    // Retry without Turnstile headers on 403/timeout so we can read turnstile_site_key cleanly
    if (err instanceof CfsmApiError && (err.status === 403 || err.status === 0)) {
      clearTurnstileStorage(baseUrl)
      return await fetchCFSM<CfsmSiteConfig>("/api/config", {
        baseUrl,
        includeAuth: true,
        includeTurnstileToken: false,
        includeTurnstileVerified: false,
        notifyOnAuthError: false,
      })
    }
    throw err
  }
}

/**
 * Fetch /api/config once per page lifecycle and cache per-base state in memory.
 */
export async function fetchConfigOnce(forceRefresh = false): Promise<CfsmSiteConfig> {
  if (USE_MOCK) {
    if (!cachedSiteConfig || forceRefresh) {
      const mockCfg = getMockConfig()
      siteConfigsByIndex.clear()
      siteConfigsByIndex.set(0, { apiIndex: 0, baseUrl: "", config: mockCfg })
      cachedSiteConfig = mergeSiteConfigs()
    }
    return cachedSiteConfig
  }

  if (cachedSiteConfig && !forceRefresh) {
    return cachedSiteConfig
  }
  if (configInFlight && !forceRefresh) {
    return configInFlight
  }

  configInFlight = (async () => {
    const rawBases = getApiBases()
    const targets = rawBases.length > 0 ? rawBases : [""]
    const settled = await Promise.allSettled(targets.map((b) => fetchConfigForBase(b)))
    const valid = settled
      .map((res, index) => ({ res, index, baseUrl: targets[index] || "" }))
      .filter(
        (item): item is { res: PromiseFulfilledResult<CfsmSiteConfig>; index: number; baseUrl: string } =>
          item.res.status === "fulfilled",
      )

    if (valid.length === 0) {
      const firstRejected = settled.find((r): r is PromiseRejectedResult => r.status === "rejected")
      throw firstRejected?.reason || new CfsmApiError("Failed to fetch config", 0)
    }

    siteConfigsByIndex.clear()
    for (const item of valid) {
      siteConfigsByIndex.set(item.index, {
        apiIndex: item.index,
        baseUrl: item.baseUrl,
        config: item.res.value,
      })
    }

    cachedSiteConfig = mergeSiteConfigs()
    return cachedSiteConfig
  })()

  try {
    return await configInFlight
  } finally {
    configInFlight = null
  }
}

export function getCachedConfig(): CfsmSiteConfig | null {
  return cachedSiteConfig
}

export async function verifyTurnstileConfig(token: string, apiIndex = 0): Promise<CfsmSiteConfig> {
  if (USE_MOCK) {
    const cfg = getMockConfig()
    siteConfigsByIndex.set(0, { apiIndex: 0, baseUrl: "", config: cfg })
    cachedSiteConfig = mergeSiteConfigs()
    return cachedSiteConfig
  }

  const bases = getApiBases()
  const baseUrl = bases[apiIndex] || bases[0] || ""
  setTurnstileToken(token, baseUrl)

  const data = await fetchCFSM<CfsmSiteConfig>("/api/config", {
    baseUrl,
    includeAuth: true,
    includeTurnstileToken: true,
    includeTurnstileVerified: true,
    notifyOnAuthError: false,
  })

  siteConfigsByIndex.set(apiIndex, {
    apiIndex,
    baseUrl,
    config: data,
  })
  cachedSiteConfig = mergeSiteConfigs()
  return cachedSiteConfig
}

export async function fetchServersAll(targetIndices?: number[]): Promise<{
  servers: CfsmServer[]
  latestReportUpdates: CfsmLatestReportUpdate[]
  stats: CfsmServersResponse["stats"]
  regionStats: Record<string, number>
  sysConfig: CfsmSysConfig
  errors: CfsmApiError[]
  succeededApiIndices: number[]
  failedApiIndices: number[]
}> {
  if (USE_MOCK) {
    const mock = getMockServersResponse()
    const baseSys: CfsmSysConfig = { ...DEFAULT_SYS_CONFIG, ...(mock.sysConfig || {}) }
    siteSysConfigsByIndex.set(0, baseSys)
    return {
      servers: (mock.servers || []).map((srv) => ({ ...srv, apiIndex: 0, sysConfig: baseSys })),
      latestReportUpdates: [],
      stats: mock.stats,
      regionStats: mock.regionStats,
      sysConfig: baseSys,
      errors: [],
      succeededApiIndices: [0],
      failedApiIndices: [],
    }
  }

  const bases = getApiBases()
  const targets = bases.length > 0 ? bases : [""]
  const indices =
    targetIndices && targetIndices.length > 0
      ? Array.from(new Set(targetIndices.filter((i) => Number.isInteger(i) && i >= 0 && i < targets.length)))
      : targets.map((_, idx) => idx)

  const settled = await Promise.allSettled(
    indices.map((idx) => fetchCFSM<CfsmServersResponse>("/api/servers", { baseUrl: targets[idx] })),
  )

  const servers: CfsmServer[] = []
  const latestReportUpdates: CfsmLatestReportUpdate[] = []
  const stats = {
    total: 0,
    online: 0,
    offline: 0,
    globalSpeedIn: 0,
    globalSpeedOut: 0,
    globalNetTx: 0,
    globalNetRx: 0,
  }
  const regionStats: Record<string, number> = {}
  let primarySysConfig: CfsmSysConfig | null = siteSysConfigsByIndex.get(0) ?? null
  const errors: CfsmApiError[] = []
  const succeededApiIndices: number[] = []
  const failedApiIndices: number[] = []
  let hasSuccess = false

  settled.forEach((result, pos) => {
    const idx = indices[pos]
    const base = targets[idx]
    if (result.status === "rejected") {
      const apiErr =
        result.reason instanceof CfsmApiError
          ? new CfsmApiError(result.reason.message, result.reason.status, result.reason.code, result.reason.baseUrl ?? base, idx)
          : new CfsmApiError(String(result.reason || "Request failed"), 0, undefined, base, idx)
      errors.push(apiErr)
      failedApiIndices.push(idx)
      return
    }
    hasSuccess = true
    succeededApiIndices.push(idx)
    const data = result.value
    const siteCfg = getSiteConfigByIndex(idx) || cachedSiteConfig
    const siteSysConfig: CfsmSysConfig = {
      ...DEFAULT_SYS_CONFIG,
      custom_ct_name: siteCfg?.custom_ct_name,
      custom_cu_name: siteCfg?.custom_cu_name,
      custom_cm_name: siteCfg?.custom_cm_name,
      custom_bd_name: siteCfg?.custom_bd_name,
      node_1_name: siteCfg?.node_1_name,
      node_2_name: siteCfg?.node_2_name,
      node_3_name: siteCfg?.node_3_name,
      node_4_name: siteCfg?.node_4_name,
      latency_window: siteCfg?.latency_window,
      ...(data.sysConfig || {}),
    }

    // Cache full per-site sysConfig received from /api/servers
    siteSysConfigsByIndex.set(idx, siteSysConfig)
    if (idx === 0 || !primarySysConfig) {
      primarySysConfig = siteSysConfig
    }

    for (const srv of data.servers || []) {
      servers.push(
        attachUptimeBase({
          ...srv,
          source: base,
          apiIndex: idx,
          sysConfig: siteSysConfig,
        }),
      )
    }
    for (const upd of data.latestReportUpdates || []) {
      latestReportUpdates.push({ ...upd, source: base, apiIndex: idx })
    }
    if (data.stats) {
      stats.total += data.stats.total || 0
      stats.online += data.stats.online || 0
      stats.offline += data.stats.offline || 0
      stats.globalSpeedIn += data.stats.globalSpeedIn || 0
      stats.globalSpeedOut += data.stats.globalSpeedOut || 0
      stats.globalNetTx += data.stats.globalNetTx || 0
      stats.globalNetRx += data.stats.globalNetRx || 0
    }
    if (data.regionStats) {
      for (const [k, v] of Object.entries(data.regionStats)) {
        const code = k.toUpperCase()
        regionStats[code] = (regionStats[code] || 0) + (v || 0)
      }
    }
  })

  if (!hasSuccess && errors.length > 0) {
    throw errors[0]
  }

  return {
    servers,
    latestReportUpdates,
    stats,
    regionStats,
    sysConfig: primarySysConfig || { ...DEFAULT_SYS_CONFIG },
    errors,
    succeededApiIndices,
    failedApiIndices,
  }
}

export async function fetchServerDetail(id: string, apiIndex = 0): Promise<CfsmServer> {
  if (USE_MOCK) {
    const srv = getMockServerDetail(id)
    if (!srv) throw new CfsmApiError("Server not found", 404, 404)
    const cachedSys = siteSysConfigsByIndex.get(apiIndex)
    return cachedSys ? { ...srv, apiIndex, sysConfig: { ...cachedSys, ...(srv.sysConfig || {}) } } : srv
  }
  const bases = getApiBases()
  const baseUrl = bases[apiIndex] || bases[0] || ""
  const data = await fetchCFSM<CfsmServer>(`/api/server?id=${encodeURIComponent(id)}`, { baseUrl })
  const siteCfg = getSiteConfigByIndex(apiIndex) || cachedSiteConfig
  const cachedSiteSysCfg = siteSysConfigsByIndex.get(apiIndex)

  // Only inherit known site-level display switches if /api/servers already populated cachedSiteSysCfg.
  // Never synthesize DEFAULT_SYS_CONFIG true switches into server.sysConfig when omitted by /api/server.
  const mergedSysConfig: CfsmSysConfig = {
    ...(siteCfg
      ? {
          custom_ct_name: siteCfg.custom_ct_name,
          custom_cu_name: siteCfg.custom_cu_name,
          custom_cm_name: siteCfg.custom_cm_name,
          custom_bd_name: siteCfg.custom_bd_name,
          node_1_name: siteCfg.node_1_name,
          node_2_name: siteCfg.node_2_name,
          node_3_name: siteCfg.node_3_name,
          node_4_name: siteCfg.node_4_name,
          latency_window: siteCfg.latency_window,
        }
      : {}),
    ...(cachedSiteSysCfg || {}),
    ...(data.sysConfig || {}),
  }
  return attachUptimeBase({ ...data, source: baseUrl, apiIndex, sysConfig: mergedSysConfig })
}

const historyCache = new Map<string, { ts: number; data: CfsmHistoryRow[] }>()
const HISTORY_CACHE_TTL_MS = 30_000

export async function fetchServerHistory(
  id: string,
  hours = 0.167,
  apiIndex = 0,
  forceRefresh = false,
): Promise<CfsmHistoryRow[]> {
  const safeHours = ALLOWED_HISTORY_HOURS.includes(hours as (typeof ALLOWED_HISTORY_HOURS)[number]) ? hours : 0.167
  const cacheKey = `${apiIndex}:${id}:${safeHours}`

  if (!forceRefresh) {
    const cached = historyCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < HISTORY_CACHE_TTL_MS) {
      return cached.data
    }
  }

  if (USE_MOCK) {
    const rows = getMockHistory(id, safeHours)
    historyCache.set(cacheKey, { ts: Date.now(), data: rows })
    return rows
  }

  const bases = getApiBases()
  const baseUrl = bases[apiIndex] || bases[0] || ""
  const targetSiteCfg = getSiteConfigByIndex(apiIndex) || cachedSiteConfig
  // On public sites, hours > 24 returns 401 by CFSM design; handle locally in detail view without triggering global private lock
  const isPublicSite = targetSiteCfg?.is_public !== false

  const rows = await fetchCFSM<CfsmHistoryRow[]>(
    `/api/history/all?id=${encodeURIComponent(id)}&hours=${safeHours}`,
    {
      baseUrl,
      timeoutMs: 0, // Long history ranges may take longer; avoid aborting
      notifyOnUnauthorized: !isPublicSite,
      notifyOnForbidden: true,
      clearJwtOn401: !isPublicSite,
    },
  )
  const normalized = Array.isArray(rows) ? rows : []
  historyCache.set(cacheKey, { ts: Date.now(), data: normalized })
  return normalized
}

export async function saveThemeOptions(
  themeOptions: CfsmThemeOptions,
  apiIndex = 0,
): Promise<CfsmThemeOptions> {
  if (USE_MOCK) {
    const saved = saveMockThemeOptions(themeOptions)
    if (cachedSiteConfig) {
      cachedSiteConfig = { ...cachedSiteConfig, theme_options: saved }
    }
    return saved
  }

  const bases = getApiBases()
  const baseUrl = bases[apiIndex] || bases[0] || ""
  const targetSiteCfg = getSiteConfigByIndex(apiIndex)
  const isPublicTarget = targetSiteCfg?.is_public !== false

  const res = await fetchCFSM<{ success: boolean; theme_options: CfsmThemeOptions; message: string }>(
    "/api/theme_options",
    {
      method: "POST",
      body: { theme_options: themeOptions },
      baseUrl,
      notifyOnUnauthorized: !isPublicTarget,
    },
  )
  const saved = res.theme_options || themeOptions
  const entry = siteConfigsByIndex.get(apiIndex)
  if (entry) {
    siteConfigsByIndex.set(apiIndex, {
      ...entry,
      config: { ...entry.config, theme_options: saved },
    })
    cachedSiteConfig = mergeSiteConfigs()
  } else if (cachedSiteConfig) {
    cachedSiteConfig = { ...cachedSiteConfig, theme_options: saved }
  }
  return saved
}

export function getMockBatchUpdateSample(serverId: string): Partial<CfsmServer> | null {
  return USE_MOCK ? createMockSampleForServer(serverId) : null
}
