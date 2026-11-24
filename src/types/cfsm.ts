import type { ThemeColorKey } from "@/lib/theme-colors"

export interface DiskIoMetrics {
  read_bps: number
  write_bps: number
  read_iops: number
  write_iops: number
  await_ms: number
  util: number
}

export type ProbeMetricValue = number | null | false | undefined

export interface LatencyWindowPoint {
  ts: number
  ct?: ProbeMetricValue
  cu?: ProbeMetricValue
  cm?: ProbeMetricValue
  bd?: ProbeMetricValue
  node_1?: ProbeMetricValue
  node_2?: ProbeMetricValue
  node_3?: ProbeMetricValue
  node_4?: ProbeMetricValue
}

export interface GpuDeviceInfo {
  id: string
  name: string
  info: number | null
  mem_used?: number
  mem_total?: number
  sm_clock?: number
  power?: number
}

export interface CfsmLatestReportSample {
  ts?: number
  timestamp?: number
  data?: Partial<CfsmServer>
  payload?: Partial<CfsmServer>
  metrics?: Partial<CfsmServer>
}

export interface CfsmLatestReportUpdate {
  serverId: string
  reportTs?: number
  report_timestamp?: number
  reportAgeMs?: number
  samples: CfsmLatestReportSample[]
  source?: string
  apiIndex?: number
}

export interface CfsmSysConfig {
  show_price?: boolean
  show_expire?: boolean
  show_tf?: boolean
  show_three_net_details?: boolean
  custom_ct_name?: string
  custom_cu_name?: string
  custom_cm_name?: string
  custom_bd_name?: string
  node_1_name?: string
  node_2_name?: string
  node_3_name?: string
  node_4_name?: string
  display_mode?: string
  long_history_points?: number
  latency_window?: {
    points: number
    hours: number
  }
}

export interface CfsmThemeOptions {
  site_desc?: string
  custom_logo?: string
  custom_background_image?: string
  custom_mobile_background_image?: string
  custom_illustration?: string
  custom_links?: Array<{ link: string; name: string }> | string
  force_theme?: "system" | "dark" | "light"
  force_show_services?: boolean
  force_show_map?: boolean
  force_card_inline?: boolean
  group_order?: string
  disable_animated_man?: boolean
  force_use_svg_flag?: boolean
  show_traffic_bar?: boolean
  show_visitor_capsule?: boolean
  visitor_capsule_color?: ThemeColorKey
  show_asset_card?: boolean
  asset_card_color?: ThemeColorKey
  asset_card_default_currency?: string
  force_peak_cut_enabled?: boolean
  fixed_top_server_name?: boolean
  show_net_transfer?: boolean
  hide_ipv4_ipv6_tag?: boolean
  hide_traffic_vol_tag?: boolean
  default_billing_currency?: string
  cny_symbol_style?: "¥" | "CNY"
  server_billing_currency_overrides?: Record<string, string> | string
  traffic_bar_show_percent?: boolean
  traffic_bar_show_reset_day?: boolean
  traffic_bar_show_billing_mode?: boolean
  traffic_reset_day_overrides?: Record<string, number> | string
  [key: string]: unknown
}

export interface CfsmSiteConfig {
  version: string
  last_workers_version?: string | null
  last_agent_version?: string | null
  is_public: boolean
  authorization: boolean
  turnstile_enabled: boolean
  turnstile_login_enabled: boolean
  turnstile_site_key: string
  turnstile_api_index?: number
  has_unauthorized_private?: boolean
  unauthorized_api_index?: number
  custom_ct_name?: string
  custom_cu_name?: string
  custom_cm_name?: string
  custom_bd_name?: string
  node_1_name?: string
  node_2_name?: string
  node_3_name?: string
  node_4_name?: string
  site_title: string
  display_mode?: string
  preferred_theme?: "auto" | "dark" | "light" | string
  default_language?: "auto" | "zh" | "zh-TW" | "en" | "es" | "de" | "ru" | "ta" | string
  theme_options: CfsmThemeOptions
  verified: boolean
  turnstile_verified: string | null
  frontend_ws_timeout_minutes: number
  long_history_points: number
  latency_window?: {
    points: number
    hours: number
  }
}

export interface CfsmServer {
  id: string
  name: string
  server_group?: string
  tags?: string
  price?: string
  billing_cycle?: string
  auto_renewal?: string | number | boolean
  currency?: string
  expire_date?: string
  expire_time?: string
  traffic_limit?: string | number
  traffic_calc_type?: string
  reset_day?: number
  report_interval?: number
  wss_report_interval?: number
  is_hidden?: "0" | "1" | boolean
  sort_order?: number
  cpu?: number
  load_avg?: string
  load?: string
  net_in_speed?: number
  net_out_speed?: number
  net_rx?: number
  net_tx?: number
  net_rx_monthly?: number
  net_tx_monthly?: number
  processes?: number
  tcp_conn?: number
  udp_conn?: number
  ping_ct?: ProbeMetricValue
  ping_cu?: ProbeMetricValue
  ping_cm?: ProbeMetricValue
  ping_bd?: ProbeMetricValue
  ping_node_1?: ProbeMetricValue
  ping_node_2?: ProbeMetricValue
  ping_node_3?: ProbeMetricValue
  ping_node_4?: ProbeMetricValue
  loss_ct?: ProbeMetricValue
  loss_cu?: ProbeMetricValue
  loss_cm?: ProbeMetricValue
  loss_bd?: ProbeMetricValue
  loss_node_1?: ProbeMetricValue
  loss_node_2?: ProbeMetricValue
  loss_node_3?: ProbeMetricValue
  loss_node_4?: ProbeMetricValue
  ping?: LatencyWindowPoint[]
  loss?: LatencyWindowPoint[]
  ram_total?: number | string
  ram_used?: number | string
  swap_total?: number | string
  swap_used?: number | string
  disk_total?: number | string
  disk_used?: number | string
  disk?: DiskIoMetrics
  cpu_cores?: number
  cpu_info?: string
  gpu_info?: GpuDeviceInfo[] | string | null
  arch?: string
  os?: string
  kernel_version?: string
  region?: string
  ip_v4?: "0" | "1" | string
  ip_v6?: "0" | "1" | string
  boot_time?: string | number
  uptime?: number
  version?: string
  agent_version?: string
  last_updated?: number
  last_time?: number
  timestamp?: number
  sample_timestamp?: number
  report_timestamp?: number
  online?: boolean
  is_online?: boolean
  latestReportUpdates?: CfsmLatestReportUpdate[]
  sysConfig?: CfsmSysConfig
  // Client metadata for multi-apiBase & live uptime tracking
  source?: string
  apiIndex?: number
  _uptime_base_sec?: number
  _uptime_base_ts?: number
}

export interface CfsmGlobalStats {
  total: number
  online: number
  offline: number
  globalSpeedIn: number
  globalSpeedOut: number
  globalNetTx: number
  globalNetRx: number
}

export interface CfsmServersResponse {
  servers: CfsmServer[]
  latestReportUpdates?: CfsmLatestReportUpdate[]
  stats: CfsmGlobalStats
  regionStats: Record<string, number>
  sysConfig: CfsmSysConfig
}

export interface CfsmHistoryRow extends Partial<CfsmServer> {
  timestamp: number
  disk?: DiskIoMetrics
}

export interface CfsmWsMessage {
  type: "hello" | "subscribe" | "subscribed" | "ping" | "pong" | "batchUpdate" | "error"
  ts?: number
  subscribed?: string
  scope?: string
  ids?: string[]
  count?: number
  serverId?: string
  error?: string
  code?: number
  updates?: Array<{
    serverId: string
    reportTs?: number
    report_timestamp?: number
    ts?: number
    samples: CfsmLatestReportSample[]
  }>
}
