"use client"

import { useTheme } from "@/hooks/use-theme"
import { useEffect } from "react"

export function ThemeColorManager() {
  const { theme } = useTheme()

  useEffect(() => {
    const updateThemeColor = () => {
      const isDark =
        theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

      let meta = document.querySelector('meta[name="theme-color"]')
      if (!meta) {
        const newMeta = document.createElement("meta")
        newMeta.name = "theme-color"
        document.head.appendChild(newMeta)
        meta = newMeta
      }

      const themeColor = isDark ? "hsl(30 15% 8%)" : "hsl(0 0% 98%)"
      meta.setAttribute("content", themeColor)
    }

    updateThemeColor()

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    mediaQuery.addEventListener("change", updateThemeColor)

    return () => mediaQuery.removeEventListener("change", updateThemeColor)
  }, [theme])

  return null
}
