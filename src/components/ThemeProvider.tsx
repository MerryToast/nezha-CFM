import { ReactNode, createContext, useCallback, useEffect, useState } from "react"

export type Theme = "dark" | "light" | "system"
export type ForcedTheme = "dark" | "light" | null

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  forcedTheme: ForcedTheme
  defaultThemePreference: Theme
  setTheme: (theme: Theme) => void
  setForcedTheme: (theme: ForcedTheme) => void
  setDefaultThemePreference: (theme: Theme) => void
}

function isValidTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "system"
}

function readStoredTheme(storageKey: string): { theme: Theme; hasStored: boolean } {
  try {
    const raw = localStorage.getItem(storageKey)
    if (isValidTheme(raw)) {
      return { theme: raw, hasStored: true }
    }
  } catch {
    // ignore storage read error
  }
  return { theme: "system", hasStored: false }
}

const initialState: ThemeProviderState = {
  theme: "system",
  forcedTheme: null,
  defaultThemePreference: "system",
  setTheme: () => null,
  setForcedTheme: () => null,
  setDefaultThemePreference: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({ children, storageKey = "vite-ui-theme" }: ThemeProviderProps) {
  const [userThemeState, setUserThemeState] = useState<{ theme: Theme; hasStored: boolean }>(() =>
    readStoredTheme(storageKey),
  )
  const [forcedTheme, setForcedThemeState] = useState<ForcedTheme>(null)
  const [defaultThemePreference, setDefaultThemePreferenceState] = useState<Theme>("system")

  const effectiveTheme: Theme =
    forcedTheme ?? (userThemeState.hasStored ? userThemeState.theme : defaultThemePreference)

  useEffect(() => {
    const root = window.document.documentElement
    const applyResolved = () => {
      root.classList.remove("light", "dark")
      const resolved =
        effectiveTheme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : effectiveTheme
      root.classList.add(resolved)
      const themeColor = resolved === "dark" ? "hsl(30 15% 8%)" : "hsl(0 0% 98%)"
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor)
    }

    applyResolved()

    if (effectiveTheme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)")
      media.addEventListener("change", applyResolved)
      return () => media.removeEventListener("change", applyResolved)
    }
  }, [effectiveTheme])

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      const safeTheme: Theme = isValidTheme(nextTheme) ? nextTheme : "system"
      try {
        localStorage.setItem(storageKey, safeTheme)
      } catch {
        // ignore storage write error
      }
      setUserThemeState({ theme: safeTheme, hasStored: true })
    },
    [storageKey],
  )

  const setForcedTheme = useCallback((nextForced: ForcedTheme) => {
    setForcedThemeState(nextForced === "dark" || nextForced === "light" ? nextForced : null)
  }, [])

  const setDefaultThemePreference = useCallback((nextPref: Theme) => {
    setDefaultThemePreferenceState(isValidTheme(nextPref) ? nextPref : "system")
  }, [])

  return (
    <ThemeProviderContext.Provider
      value={{
        theme: effectiveTheme,
        forcedTheme,
        defaultThemePreference,
        setTheme,
        setForcedTheme,
        setDefaultThemePreference,
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  )
}

export { ThemeProviderContext }
