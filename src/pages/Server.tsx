import AssetSummaryWidget from "@/components/AssetSummaryWidget"
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
import { useBackground } from "@/hooks/use-background"
import { useCfsm } from "@/hooks/use-cfsm"
import { useSort } from "@/hooks/use-sort"
import { useStatus } from "@/hooks/use-status"
import { cn } from "@/lib/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsUpDownIcon,
  ChartBarSquareIcon,
  MapIcon,
  ViewColumnsIcon,
} from "@heroicons/react/20/solid"
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"

const GlobalMap = lazy(() => import("@/components/GlobalMap"))

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
  const scrollRestoredRef = useRef(false)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
  const [currentGroup, setCurrentGroup] = useState<string>(() => {
    try {
      return sessionStorage.getItem("selectedGroup") || "All"
    } catch {
      return "All"
    }
  })

  useEffect(() => {
    return mountDashboard()
  }, [mountDashboard])

  const { hasActiveBackground: customBackgroundImage } = useBackground()
  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {}

  const showVisitorCapsule =
    themeOptions?.show_visitor_capsule === true || win.ShowVisitorCapsule === true
  const showAssetCard =
    themeOptions?.show_asset_card === true || win.ShowAssetCard === true

  const handleTagChange = (newGroup: string) => {
    setCurrentGroup(newGroup)
    try {
      sessionStorage.setItem("selectedGroup", newGroup)
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    const showServicesState = localStorage.getItem("showServices")
    if (themeOptions?.force_show_services === true || win.ForceShowServices) {
      setShowServices("1")
    } else if (showServicesState !== null) {
      setShowServices(showServicesState)
    } else {
      setShowServices("0")
    }
  }, [themeOptions?.force_show_services, win.ForceShowServices])

  useEffect(() => {
    const checkInlineSettings = () => {
      const isMobile = window.innerWidth < 768
      if (isMobile) {
        setInline("0")
        return
      }
      const inlineState = localStorage.getItem("inline")
      if (themeOptions?.force_card_inline === true || win.ForceCardInline) {
        setInline("1")
      } else if (inlineState !== null) {
        setInline(inlineState)
      } else {
        setInline("0")
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
    } else {
      setShowMap("0")
    }
  }, [themeOptions?.force_show_map, win.ForceShowMap])

  useEffect(() => {
    if (scrollRestoredRef.current || servers.length === 0) return
    scrollRestoredRef.current = true
    let savedPosition = 0
    try {
      savedPosition = Number(sessionStorage.getItem("scrollPosition") || "0")
    } catch {
      savedPosition = 0
    }
    if (Number.isFinite(savedPosition) && savedPosition > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedPosition, behavior: "instant" })
      })
    }
  }, [servers.length])

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

  const precomputedEntries = useMemo(() => {
    return servers.map((server) => {
      const lastActiveTime =
        server.last_updated || (server.last_active ? Date.parse(server.last_active) : 0)
      const online =
        lastActiveTime > 0
          ? now - lastActiveTime < 300_000
          : typeof server.online === "boolean"
            ? server.online
            : false
      const memTotal = server.host.mem_total || 0
      const diskTotal = server.host.disk_total || 0
      return {
        server,
        online,
        memUsage: memTotal > 0 ? (server.state.mem_used / memTotal) * 100 : 0,
        diskUsage: diskTotal > 0 ? (server.state.disk_used / diskTotal) * 100 : 0,
      }
    })
  }, [now, servers])

  const {
    groupFilteredServers,
    filteredServers,
    totalServers,
    onlineServers,
    offlineServers,
    up,
    down,
    upSpeed,
    downSpeed,
  } = useMemo(() => {
    const groupEntries =
      currentGroup === "All"
        ? precomputedEntries
        : precomputedEntries.filter((e) => String(e.server.server_group || "").trim() === currentGroup)

    const isAllGroup = currentGroup === "All"
    let calcOnline = 0
    let calcNetTx = 0
    let calcNetRx = 0
    let calcSpeedOut = 0
    let calcSpeedIn = 0

    if (!isAllGroup) {
      for (const entry of groupEntries) {
        calcNetTx += entry.server.state?.net_out_transfer ?? 0
        calcNetRx += entry.server.state?.net_in_transfer ?? 0
        if (entry.online) {
          calcOnline += 1
          calcSpeedOut += entry.server.state?.net_out_speed ?? 0
          calcSpeedIn += entry.server.state?.net_in_speed ?? 0
        }
      }
    }

    const totalCount = isAllGroup ? stats.total : groupEntries.length
    const onlineCount = isAllGroup ? stats.online : calcOnline
    const offlineCount = isAllGroup ? stats.offline : totalCount - onlineCount

    const statusEntries =
      status === "all"
        ? groupEntries
        : groupEntries.filter((entry) => (status === "online" ? entry.online : !entry.online))

    const sortedEntries = statusEntries.slice().sort((a, b) => {
      if (sortType !== "name") {
        if (!a.online && b.online) return 1
        if (a.online && !b.online) return -1
        if (!a.online && !b.online) {
          return (a.server.display_index ?? 0) - (b.server.display_index ?? 0)
        }
      }

      let comparison = 0
      switch (sortType) {
        case "name":
          comparison = a.server.name.localeCompare(b.server.name)
          break
        case "uptime":
          comparison = (a.server.state?.uptime ?? 0) - (b.server.state?.uptime ?? 0)
          break
        case "system":
          comparison = (a.server.host.platform || "").localeCompare(b.server.host.platform || "")
          break
        case "cpu":
          comparison = (a.server.state?.cpu ?? 0) - (b.server.state?.cpu ?? 0)
          break
        case "mem":
          comparison = a.memUsage - b.memUsage
          break
        case "disk":
          comparison = a.diskUsage - b.diskUsage
          break
        case "up":
          comparison = (a.server.state?.net_out_speed ?? 0) - (b.server.state?.net_out_speed ?? 0)
          break
        case "down":
          comparison = (a.server.state?.net_in_speed ?? 0) - (b.server.state?.net_in_speed ?? 0)
          break
        case "up total":
          comparison = (a.server.state?.net_out_transfer ?? 0) - (b.server.state?.net_out_transfer ?? 0)
          break
        case "down total":
          comparison = (a.server.state?.net_in_transfer ?? 0) - (b.server.state?.net_in_transfer ?? 0)
          break
        default:
          return (a.server.display_index ?? 0) - (b.server.display_index ?? 0)
      }

      return sortOrder === "asc" ? comparison : -comparison
    })

    return {
      groupFilteredServers: groupEntries.map((e) => e.server),
      filteredServers: sortedEntries.map((e) => e.server),
      totalServers: totalCount,
      onlineServers: onlineCount,
      offlineServers: offlineCount,
      up: isAllGroup ? stats.globalNetTx : calcNetTx,
      down: isAllGroup ? stats.globalNetRx : calcNetRx,
      upSpeed: isAllGroup ? stats.globalSpeedOut : calcSpeedOut,
      downSpeed: isAllGroup ? stats.globalSpeedIn : calcSpeedIn,
    }
  }, [currentGroup, precomputedEntries, sortOrder, sortType, stats, status])

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

      {showMap === "1" && (
        <Suspense
          fallback={
            <div className="mt-8 flex h-48 items-center justify-center">
              <Loader visible={true} />
            </div>
          }
        >
          <GlobalMap now={now} serverList={servers} />
        </Suspense>
      )}
      {showServices === "1" && <ServiceTracker serverList={filteredServers} />}

      {inline === "1" && (
        <section className="flex flex-col gap-2 overflow-x-scroll scrollbar-hidden mt-6 server-inline-list">
          {filteredServers.map((serverInfo) => (
            <ServerCardInline now={now} key={serverInfo.uid || serverInfo.id} serverInfo={serverInfo} />
          ))}
        </section>
      )}

      {inline === "0" && (
        <section className="grid grid-cols-1 gap-2 md:grid-cols-2 mt-6 server-card-list">
          {filteredServers.map((serverInfo) => (
            <ServerCard now={now} key={serverInfo.uid || serverInfo.id} serverInfo={serverInfo} />
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
