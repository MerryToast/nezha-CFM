import type {
  CfsmSysConfig,
  DiskIoMetrics,
  GpuDeviceInfo,
  LatencyWindowPoint,
  ProbeMetricValue,
} from "./cfsm"

export interface NezhaWebsocketResponse {
  now: number
  servers: NezhaServer[]
}

export interface NezhaServer {
  uuid: string
  id: string
  name: string
  server_group: string
  public_note: string
  last_active: string
  last_updated: number
  country_code: string
  host: NezhaServerHost
  state: NezhaServerStatus
  display_index?: number
  traffic_limit?: number
  traffic_limit_type?: string
  traffic_reset_day?: number
  net_rx_monthly: number
  net_tx_monthly: number
  expired_at?: string
  price?: string
  billing_cycle?: string
  auto_renewal?: string
  currency?: string
  online: boolean
  tags: string
  ip_v4: string
  ip_v6: string
  disk?: DiskIoMetrics
  gpu_devices?: GpuDeviceInfo[]
  ping?: LatencyWindowPoint[]
  loss?: LatencyWindowPoint[]
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
  source?: string
  apiIndex?: number
  sysConfig?: CfsmSysConfig
}

export interface NezhaServerHost {
  platform: string
  platform_version: string
  cpu: string[]
  cpu_cores: number
  gpu: string[]
  mem_total: number
  disk_total: number
  swap_total: number
  arch: string
  boot_time: number
  version: string
}

export interface NezhaServerStatus {
  cpu: number
  mem_used: number
  swap_used: number
  disk_used: number
  net_in_transfer: number
  net_out_transfer: number
  net_in_speed: number
  net_out_speed: number
  uptime: number
  load_1: number
  load_5: number
  load_15: number
  tcp_conn_count: number
  udp_conn_count: number
  process_count: number
  temperatures: Array<{ Name: string; Temperature: number }>
  gpu: number[]
}

export interface ServerGroup {
  group: {
    id: number
    created_at: string
    updated_at: string
    name: string
  }
  servers: string[]
}

export interface ServerGroupResponse {
  success: boolean
  data: ServerGroup[]
}

export interface NezhaMonitor {
  monitor_id: string
  monitor_name: string
  server_id: string
  server_name: string
  created_at: number[]
  avg_delay: Array<number | null>
  packet_loss?: Array<number | null>
  sample_count?: number[]
}

export type ServerMonitorChart = {
  [key: string]: {
    created_at: number
    avg_delay: number | null
    packet_loss?: number | null
    sample_count?: number
  }[]
}
