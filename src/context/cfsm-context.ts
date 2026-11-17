import { CfsmGlobalStats, CfsmSiteConfig, CfsmSysConfig, CfsmThemeOptions } from "@/types/cfsm"
import { NezhaServer } from "@/types/nezha-api"
import { createContext } from "react"

export interface CfsmContextValue {
  config: CfsmSiteConfig | null
  configLoading: boolean
  configError: string | null
  turnstileRequired: boolean
  privateRequired: boolean
  retryConfig: () => Promise<void>
  completeTurnstile: (token: string) => Promise<boolean>

  // Theme options (from /api/config -> theme_options, persisted via POST /api/theme_options when authorized)
  themeOptions: CfsmThemeOptions
  setLocalThemeOptions: (options: CfsmThemeOptions) => void
  saveRemoteThemeOptions: (options: CfsmThemeOptions) => Promise<CfsmThemeOptions>

  // Dashboard state (only active when subscribed on Dashboard)
  dashboardLoading: boolean
  dashboardError: string | null
  servers: NezhaServer[]
  now: number
  stats: CfsmGlobalStats
  regionStats: Record<string, number>
  sysConfig: CfsmSysConfig
  wsConnected: boolean
  wsTimedOut: boolean
  wsTimeoutMinutes: number
  continueLiveConnection: () => void
  closeLiveConnection: () => void
  mountDashboard: () => () => void
}

export const CfsmContext = createContext<CfsmContextValue | undefined>(undefined)
