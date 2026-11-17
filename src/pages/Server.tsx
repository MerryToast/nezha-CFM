import AssetSummaryWidget from "@/components/AssetSummaryWidget"
import GlobalMap from "@/components/GlobalMap"
import GroupSwitch from "@/components/GroupSwitch"
import LiveTimeoutModal from "@/components/LiveTimeoutModal"
import ServerCard from "@/components/ServerCard"
import ServerCardInline from "@/components/ServerCardInline"
import ServerOverview from "@/components/ServerOverview"
import { ServiceTracker } from "@/components/ServiceTracker"
import VisitorCapsuleBar from "@/components/VisitorCapsuleBar"
import { Loader } from "@/components/loading/Loader"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SORT_ORDERS, SORT_TYPES } from "@/context/sort-context"
import { useCfsm } from "@/hooks/use-cfsm"
import { useSort } from "@/hooks/use-sort"
import { useStatus } from "@/hooks/use-status"
import { cn, formatNezhaInfo } from "@/lib/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsUpDownIcon,
  ChartBarSquareIcon,
  MapIcon,
  ViewColumnsIcon,
} from "@heroicons/react/20/solid"
import { useEffect, useMemo, useRef, useState } from "react"

export default function Servers() {
  const { sortType, sortOrder, setSortOrder, setSortType } = useSort()
  const { status } = useStatus()
  const {
    servers,
    now,
    stats,
    dashboardLoading,
    dashboardError,
    themeOptions,
    wsTimedOut,
    wsTimeoutMinutes,
    continueLiveConnection,
    closeLiveConnection,
    mountDashboard,
  } = useCfsm()

  const [showServices, setShowServices] = useState<string>("0")
  const [showMap, setShowMap] = useState<string>("0")
  const [inline, setInline] = useState<string>("0")
  const containerRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
  const [currentGroup, setCurrentGroup] = useState<string>(() => {
    return sessionStorage.getItem("selectedGroup") || "All"
  })

  useEffect(() => {
    return mountDashboard()
  }, [mountDashboard])

  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {}
  const customBackgroundImage =
    Boolean(themeOptions?.custom_background_image) ||
    Boolean(themeOptions?.custom_mobile_background_image) ||
    (typeof win.CustomBackgroundImage === "string" && win.CustomBackgroundImage !== "")

  const showVisitorCapsule =
    themeOptions?.show_visitor_capsule === true || win.ShowVisitorCapsule === true
  const showAssetCard =
    themeOptions?.show_asset_card === true || win.ShowAssetCard === true

  const restoreScrollPosition = () => {
    const savedPosition = sessionStorage.getItem("scrollPosition")
    if (savedPosition && containerRef.current) {
      containerRef.current.scrollTop = Number(savedPosition)
    }
  }

  const handleTagChange = (newGroup: string) => {
    setCurrentGroup(newGroup)
    sessionStorage.setItem("selectedGroup", newGroup)
    sessionStorage.setItem("scrollPosition", String(containerRef.current?.scrollTop || 0))
  }

  useEffect(() => {
    const showServicesState = localStorage.getItem("showServices")
    if (themeOptions?.force_show_services === true || win.ForceShowServices) {
      setShowServices("1")
    } else if (showServicesState !== null) {
      setShowServices(showServicesState)
    }
  }, [themeOptions?.force_show_services, win.ForceShowServices])

  useEffect(() => {
    const checkInlineSettings = () => {
      const isMobile = window.innerWidth < 768
      if (!isMobile) {
        const inlineState = localStorage.getItem("inline")
        if (themeOptions?.force_card_inline === true || win.ForceCardInline) {
          setInline("1")
        } else if (inlineState !== null) {
          setInline(inlineState)
        }
      }
    }

    checkInlineSettings()
    window.addEventListener("resize", checkInlineSettings)
    return () => {
      window.removeEventListener("resize", checkInlineSettings)
    }
  }, [themeOptions?.force_card_inline, win.ForceCardInline])

  useEffect(() => {
    const showMapState = localStorage.getItem("showMap")
    if (themeOptions?.force_show_map === true || win.ForceShowMap) {
      setShowMap("1")
    } else if (showMapState !== null) {
      setShowMap(showMapState)
    }
  }, [themeOptions?.force_show_map, win.ForceShowMap])

  useEffect(() => {
    restoreScrollPosition()
  }, [])

  const groupTabs = useMemo(() => {
    const present = new Set<string>()
    for (const server of servers) {
      const grp = String(server.server_group || "").trim()
      if (grp) present.add(grp)
    }

    const orderSpec = String(themeOptions?.group_order || "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)

    const ordered: string[] = []
    for (const grp of orderSpec) {
      if (present.has(grp) && !ordered.includes(grp)) {
        ordered.push(grp)
      }
    }
    for (const grp of present) {
      if (!ordered.includes(grp)) {
        ordered.push(grp)
      }
    }
    return ["All", ...ordered]
  }, [servers, themeOptions?.group_order])

  useEffect(() => {
    if (currentGroup !== "All" && servers.length > 0 && !groupTabs.includes(currentGroup)) {
      setCurrentGroup("All")
      sessionStorage.setItem("selectedGroup", "All")
    }
  }, [currentGroup, groupTabs, servers.length])

  if (dashboardLoading && servers.length === 0) {
    return (
      <div className="flex flex-col items-center min-h-96 justify-center">
        <div className="font-semibold flex items-center gap-2 text-sm">
          <Loader visible={true} />
        </div>
      </div>
    )
  }

  if (dashboardError && servers.length === 0) {
    return (
      <div className="flex flex-col items-center min-h-72 justify-center gap-3 text-center px-4">
        <p className="font-semibold text-sm text-rose-500">{dashboardError}</p>
      </div>
    )
  }

  const groupFilteredServers = servers.filter((server) => {
    if (currentGroup === "All") return true
    return String(server.server_group || "").trim() === currentGroup
  })

  const isAllGroup = currentGroup === "All"
  const totalServers = isAllGroup ? stats.total : groupFilteredServers.length
  const onlineServers = isAllGroup
    ? stats.online
    : groupFilteredServers.filter((s) => formatNezhaInfo(now, s).online).length
  const offlineServers = isAllGroup ? stats.offline : totalServers - onlineServers
  const up = isAllGroup
    ? stats.globalNetTx
    : groupFilteredServers.reduce((total, s) => total + (s.state?.net_out_transfer ?? 0), 0)
  const down = isAllGroup
    ? stats.globalNetRx
    : groupFilteredServers.reduce((total, s) => total + (s.state?.net_in_transfer ?? 0), 0)
  const upSpeed = isAllGroup
    ? stats.globalSpeedOut
    : groupFilteredServers.reduce(
        (total, s) => (formatNezhaInfo(now, s).online ? total + (s.state?.net_out_speed ?? 0) : total),
        0,
      )
  const downSpeed = isAllGroup
    ? stats.globalSpeedIn
    : groupFilteredServers.reduce(
        (total, s) => (formatNezhaInfo(now, s).online ? total + (s.state?.net_in_speed ?? 0) : total),
        0,
      )

  const filteredServers = groupFilteredServers
    .filter((server) => {
      if (status === "all") return true
      const isOnline = formatNezhaInfo(now, server).online
      return status === "online" ? isOnline : !isOnline
    })
    .slice()
    .sort((a, b) => {
      const serverAInfo = formatNezhaInfo(now, a)
      const serverBInfo = formatNezhaInfo(now, b)

      if (sortType !== "name") {
        if (!serverAInfo.online && serverBInfo.online) return 1
        if (serverAInfo.online && !serverBInfo.online) return -1
        if (!serverAInfo.online && !serverBInfo.online) {
          return (a.display_index ?? 0) - (b.display_index ?? 0)
        }
      }

      let comparison = 0

      switch (sortType) {
        case "name":
          comparison = a.name.localeCompare(b.name)
          break
        case "uptime":
          comparison = (a.state?.uptime ?? 0) - (b.state?.uptime ?? 0)
          break
        case "system":
          comparison = (a.host.platform || "").localeCompare(b.host.platform || "")
          break
        case "cpu":
          comparison = (a.state?.cpu ?? 0) - (b.state?.cpu ?? 0)
          break
        case "mem":
          comparison = serverAInfo.mem - serverBInfo.mem
          break
        case "disk":
          comparison = serverAInfo.disk_usage_percent - serverBInfo.disk_usage_percent
          break
        case "up":
          comparison = (a.state?.net_out_speed ?? 0) - (b.state?.net_out_speed ?? 0)
          break
        case "down":
          comparison = (a.state?.net_in_speed ?? 0) - (b.state?.net_in_speed ?? 0)
          break
        case "up total":
          comparison = (a.state?.net_out_transfer ?? 0) - (b.state?.net_out_transfer ?? 0)
          break
        case "down total":
          comparison = (a.state?.net_in_transfer ?? 0) - (b.state?.net_in_transfer ?? 0)
          break
        default:
          return (a.display_index ?? 0) - (b.display_index ?? 0)
      }

      return sortOrder === "asc" ? comparison : -comparison
    })

  return (
    <div className="mx-auto w-full max-w-5xl px-0">
      <ServerOverview
        total={totalServers}
        online={onlineServers}
        offline={offlineServers}
        up={up}
        down={down}
        upSpeed={upSpeed}
        downSpeed={downSpeed}
      />

      {showVisitorCapsule && <VisitorCapsuleBar />}
      {showAssetCard && <AssetSummaryWidget now={now} servers={groupFilteredServers} />}

      <div className="flex mt-6 items-center justify-between gap-2 server-overview-controls">
        <section className="flex items-center gap-2 w-full overflow-hidden">
          <button
            type="button"
            onClick={() => {
              const next = showMap === "0" ? "1" : "0"
              setShowMap(next)
              localStorage.setItem("showMap", next)
            }}
            className={cn(
              "rounded-[50px] bg-white dark:bg-stone-800 cursor-pointer p-[10px] transition-all border dark:border-none border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
              {
                "shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] !bg-blue-600 hover:!bg-blue-600 border-blue-600 dark:border-blue-600 text-white":
                  showMap === "1",
              },
              {
                "bg-opacity-70 dark:bg-opacity-70": customBackgroundImage,
              },
            )}
          >
            <MapIcon
              className={cn("size-[13px]", {
                "text-white": showMap === "1",
              })}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              const next = showServices === "0" ? "1" : "0"
              setShowServices(next)
              localStorage.setItem("showServices", next)
            }}
            className={cn(
              "rounded-[50px] bg-white dark:bg-stone-800 cursor-pointer p-[10px] transition-all border dark:border-none border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
              {
                "shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] !bg-blue-600 hover:!bg-blue-600 border-blue-600 dark:border-blue-600 text-white":
                  showServices === "1",
              },
              {
                "bg-opacity-70 dark:bg-opacity-70": customBackgroundImage,
              },
            )}
          >
            <ChartBarSquareIcon
              className={cn("size-[13px]", {
                "text-white": showServices === "1",
              })}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              const next = inline === "0" ? "1" : "0"
              setInline(next)
              localStorage.setItem("inline", next)
            }}
            className={cn(
              "rounded-[50px] bg-white dark:bg-stone-800 cursor-pointer p-[10px] transition-all border dark:border-none border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
              {
                "shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] !bg-blue-600 hover:!bg-blue-600 border-blue-600 dark:border-blue-600 text-white":
                  inline === "1",
              },
              {
                "bg-opacity-70 dark:bg-opacity-70": customBackgroundImage,
              },
            )}
          >
            <ViewColumnsIcon
              className={cn("size-[13px]", {
                "text-white": inline === "1",
              })}
            />
          </button>

          <GroupSwitch tabs={groupTabs} currentTab={currentGroup} setCurrentTab={handleTagChange} />
        </section>

        <Popover onOpenChange={setSettingsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "rounded-[50px] flex items-center gap-1 dark:text-white border dark:border-none text-black cursor-pointer dark:[text-shadow:_0_1px_0_rgb(0_0_0_/_20%)] dark:bg-stone-800 bg-white p-[10px] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
                {
                  "shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] dark:bg-stone-700 bg-stone-200": settingsOpen,
                },
                {
                  "dark:bg-stone-800/70 bg-stone-100/70": customBackgroundImage,
                },
              )}
            >
              <p className="text-[10px] font-bold whitespace-nowrap">
                {sortType === "default" ? "Sort" : sortType.toUpperCase()}
              </p>
              {sortOrder === "asc" && sortType !== "default" ? (
                <ArrowUpIcon className="size-[13px]" />
              ) : sortOrder === "desc" && sortType !== "default" ? (
                <ArrowDownIcon className="size-[13px]" />
              ) : (
                <ArrowsUpDownIcon className="size-[13px]" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-4 w-[240px] rounded-lg">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Sort by</Label>
                <Select value={sortType} onValueChange={setSortType}>
                  <SelectTrigger className="w-full text-xs h-8">
                    <SelectValue placeholder="Choose type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-xs">
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Sort order</Label>
                <Select value={sortOrder} onValueChange={setSortOrder} disabled={sortType === "default"}>
                  <SelectTrigger className="w-full text-xs h-8">
                    <SelectValue placeholder="Choose order" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_ORDERS.map((order) => (
                      <SelectItem key={order} value={order} className="text-xs">
                        {order.charAt(0).toUpperCase() + order.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {showMap === "1" && <GlobalMap now={now} serverList={servers} />}
      {showServices === "1" && <ServiceTracker serverList={filteredServers} />}

      {inline === "1" && (
        <section
          ref={containerRef}
          className="flex flex-col gap-2 overflow-x-scroll scrollbar-hidden mt-6 server-inline-list"
        >
          {filteredServers.map((serverInfo) => (
            <ServerCardInline now={now} key={serverInfo.id} serverInfo={serverInfo} />
          ))}
        </section>
      )}

      {inline === "0" && (
        <section
          ref={containerRef}
          className="grid grid-cols-1 gap-2 md:grid-cols-2 mt-6 server-card-list"
        >
          {filteredServers.map((serverInfo) => (
            <ServerCard now={now} key={serverInfo.id} serverInfo={serverInfo} />
          ))}
        </section>
      )}

      <LiveTimeoutModal
        open={wsTimedOut}
        timeoutMinutes={wsTimeoutMinutes}
        onContinue={continueLiveConnection}
        onClose={closeLiveConnection}
      />
    </div>
  )
}
