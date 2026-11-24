import { useCfsm } from "@/hooks/use-cfsm"
import useTooltip from "@/hooks/use-tooltip"
import { geoJsonString } from "@/lib/geo-json-string"
import { countryCoordinates } from "@/lib/geo-limit"
import { cn, formatNezhaInfo } from "@/lib/utils"
import { NezhaServer } from "@/types/nezha-api"
import { geoEquirectangular, geoPath } from "d3-geo"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import MapTooltip from "./MapTooltip"

const MAP_WIDTH = 900
const MAP_HEIGHT = 500

interface RawGeoFeature {
  type: "Feature"
  properties: {
    iso_a2_eh: string
    iso_a3_eh: string
    name: string
    [key: string]: string
  }
  geometry: never
}

interface PreparedFeature {
  iso2: string
  name: string
  d: string
  centroid: [number, number] | null
}

let cachedWorldData: {
  features: PreparedFeature[]
  iso2Set: Set<string>
  projection: ReturnType<typeof geoEquirectangular>
} | null = null

function getPreparedWorldData() {
  if (cachedWorldData) return cachedWorldData

  const projection = geoEquirectangular()
    .scale(140)
    .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2])
    .rotate([-12, 0, 0])

  const path = geoPath().projection(projection)
  const geoJson = JSON.parse(geoJsonString) as { features: RawGeoFeature[] }
  const filtered = geoJson.features.filter((feature) => feature.properties.iso_a3_eh !== "")

  const iso2Set = new Set<string>()
  const features: PreparedFeature[] = filtered.map((feature) => {
    const iso2 = feature.properties.iso_a2_eh
    if (iso2) iso2Set.add(iso2)
    const rawCentroid = path.centroid(feature)
    const centroid: [number, number] | null =
      rawCentroid && Number.isFinite(rawCentroid[0]) && Number.isFinite(rawCentroid[1])
        ? [rawCentroid[0], rawCentroid[1]]
        : null
    return {
      iso2,
      name: feature.properties.name,
      d: path(feature) || "",
      centroid,
    }
  })

  cachedWorldData = { features, iso2Set, projection }
  return cachedWorldData
}

export default function GlobalMap({ serverList, now }: { serverList: NezhaServer[]; now: number }) {
  const { t } = useTranslation()
  const { themeOptions } = useCfsm()

  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {}
  const customBackgroundImage =
    Boolean(themeOptions?.custom_background_image) ||
    Boolean(themeOptions?.custom_mobile_background_image) ||
    (typeof win.CustomBackgroundImage === "string" && win.CustomBackgroundImage !== "")

  const { countryList, serverCounts } = useMemo(() => {
    const list: string[] = []
    const counts: Record<string, number> = {}
    for (const server of serverList) {
      if (server.country_code) {
        const countryCode = server.country_code.trim().toUpperCase()
        if (!countryCode || countryCode === "XX") continue
        if (!list.includes(countryCode)) {
          list.push(countryCode)
        }
        counts[countryCode] = (counts[countryCode] || 0) + 1
      }
    }
    return { countryList: list, serverCounts: counts }
  }, [serverList])

  return (
    <section
      className={cn("flex flex-col gap-4 mt-8", {
        "bg-card/70 rounded-lg  p-4": customBackgroundImage,
      })}
    >
      <p className="text-sm font-medium opacity-40">
        {t("map.Distributions")} {countryList.length} {t("map.Regions")}
      </p>
      <div className="w-full overflow-x-auto">
        <InteractiveMap
          countries={countryList}
          serverCounts={serverCounts}
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          nezhaServerList={serverList}
          now={now}
        />
      </div>
    </section>
  )
}

interface InteractiveMapProps {
  countries: string[]
  serverCounts: Record<string, number>
  width: number
  height: number
  nezhaServerList: NezhaServer[]
  now: number
}

export function InteractiveMap({ countries, serverCounts, width, height, nezhaServerList, now }: InteractiveMapProps) {
  const { setTooltipData } = useTooltip()
  const { features, iso2Set, projection } = useMemo(() => getPreparedWorldData(), [])
  const countrySet = useMemo(() => new Set(countries), [countries])

  return (
    <div className="relative w-full aspect-[2/1]" onMouseLeave={() => setTooltipData(null)}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
        <defs>
          <pattern id="dots" width="2" height="2" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="currentColor" />
          </pattern>
        </defs>
        <g>
          {/* Background rect to handle mouse events in empty areas */}
          <rect x="0" y="0" width={width} height={height} fill="transparent" onMouseEnter={() => setTooltipData(null)} />
          {features.map((feature, index) => {
            const isHighlighted = countrySet.has(feature.iso2)
            const serverCount = serverCounts[feature.iso2] || 0

            return (
              <path
                key={index}
                d={feature.d}
                className={
                  isHighlighted
                    ? "fill-green-700 hover:fill-green-600    dark:fill-green-900 dark:hover:fill-green-700 transition-all cursor-pointer"
                    : "fill-neutral-200/50 dark:fill-neutral-800 stroke-neutral-300/40 dark:stroke-neutral-700 stroke-[0.5]"
                }
                onMouseEnter={() => {
                  if (!isHighlighted) {
                    setTooltipData(null)
                    return
                  }
                  if (feature.centroid) {
                    const countryCode = feature.iso2
                    const countryServers = nezhaServerList
                      .filter((server: NezhaServer) => server.country_code?.toUpperCase() === countryCode)
                      .map((server: NezhaServer) => ({
                        name: server.name,
                        status: formatNezhaInfo(now, server).online,
                      }))
                    setTooltipData({
                      centroid: feature.centroid,
                      country: feature.name,
                      count: serverCount,
                      servers: countryServers,
                    })
                  }
                }}
              />
            )
          })}

          {/* 渲染不在 filteredFeatures 中的国家标记点 */}
          {countries.map((countryCode) => {
            if (iso2Set.has(countryCode)) return null

            const coords = countryCoordinates[countryCode]
            if (!coords) return null

            const [x, y] = projection([coords.lng, coords.lat]) || [0, 0]
            const serverCount = serverCounts[countryCode] || 0

            return (
              <g
                key={countryCode}
                onMouseEnter={() => {
                  const countryServers = nezhaServerList
                    .filter((server: NezhaServer) => server.country_code?.toUpperCase() === countryCode.toUpperCase())
                    .map((server: NezhaServer) => ({
                      name: server.name,
                      status: formatNezhaInfo(now, server).online,
                    }))
                  setTooltipData({
                    centroid: [x, y],
                    country: coords.name,
                    count: serverCount,
                    servers: countryServers,
                  })
                }}
                className="cursor-pointer"
              >
                <circle
                  cx={x}
                  cy={y}
                  r={4}
                  className="fill-sky-700 stroke-white hover:fill-sky-600 dark:fill-sky-900 dark:hover:fill-sky-700 transition-all"
                />
              </g>
            )
          })}
        </g>
      </svg>
      <MapTooltip />
    </div>
  )
}
