import React, { useEffect, useState } from "react"
import { HashRouter as Router, Route, Routes } from "react-router-dom"

import { DashCommand } from "./components/DashCommand"
import ErrorBoundary from "./components/ErrorBoundary"
import Footer from "./components/Footer"
import Header from "./components/Header"
import PrivateAccessGate from "./components/PrivateAccessGate"
import TurnstileGate from "./components/TurnstileGate"
import { Loader } from "./components/loading/Loader"
import { Button } from "./components/ui/button"
import { useBackground } from "./hooks/use-background"
import { useCfsm } from "./hooks/use-cfsm"
import { cn } from "./lib/utils"
import ErrorPage from "./pages/ErrorPage"
import NotFound from "./pages/NotFound"
import Server from "./pages/Server"
import ServerDetail from "./pages/ServerDetail"

const MainApp: React.FC = () => {
  const {
    config,
    configLoading,
    configError,
    turnstileRequired,
    privateRequired,
    retryConfig,
    themeOptions,
  } = useCfsm()
  const { backgroundImage } = useBackground()
  const [hasBodyBackground, setHasBodyBackground] = useState(false)

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return
    const bg = window.getComputedStyle(document.body).backgroundImage
    setHasBodyBackground(Boolean(bg && bg !== "none"))
  }, [config])

  if (configError && !config) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <ErrorPage code={500} message={configError} />
        <Button variant="outline" size="sm" onClick={retryConfig}>
          Retry
        </Button>
      </div>
    )
  }

  if (configLoading && !config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader visible={true} />
      </div>
    )
  }

  if (turnstileRequired) {
    return <TurnstileGate />
  }

  if (privateRequired) {
    return (
      <PrivateAccessGate
        siteName={config?.site_title || "CF Server Monitor"}
        siteDesc={themeOptions?.site_desc}
      />
    )
  }

  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {}
  const customBackgroundImage =
    (typeof themeOptions?.custom_background_image === "string" && themeOptions.custom_background_image) ||
    backgroundImage ||
    (typeof win.CustomBackgroundImage === "string" && win.CustomBackgroundImage) ||
    undefined

  const customMobileBackgroundImage =
    (typeof themeOptions?.custom_mobile_background_image === "string" &&
      themeOptions.custom_mobile_background_image) ||
    (typeof win.CustomMobileBackgroundImage === "string" && win.CustomMobileBackgroundImage) ||
    undefined

  const hasAnyBackground = Boolean(customBackgroundImage || customMobileBackgroundImage || hasBodyBackground)

  return (
    <ErrorBoundary>
      {customBackgroundImage && (
        <div
          className={cn("fixed inset-0 z-0 bg-cover min-h-lvh bg-no-repeat bg-center dark:brightness-75", {
            "hidden sm:block": customMobileBackgroundImage,
          })}
          style={{ backgroundImage: `url(${customBackgroundImage})` }}
        />
      )}
      {customMobileBackgroundImage && (
        <div
          className="fixed inset-0 z-0 bg-cover min-h-lvh bg-no-repeat bg-center sm:hidden dark:brightness-75"
          style={{ backgroundImage: `url(${customMobileBackgroundImage})` }}
        />
      )}
      <div
        className={cn("flex min-h-screen w-full flex-col", {
          "bg-background": !hasAnyBackground,
        })}
      >
        <main className="flex z-20 min-h-[calc(100vh-calc(var(--spacing)*16))] flex-1 flex-col gap-4 p-4 md:p-10 md:pt-8">
          <Header />
          <DashCommand />
          <Routes>
            <Route path="/" element={<Server />} />
            <Route path="/server/:id" element={<ServerDetail />} />
            <Route path="/error" element={<ErrorPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
        </main>
      </div>
    </ErrorBoundary>
  )
}

const App: React.FC = () => {
  return (
    <Router>
      <MainApp />
    </Router>
  )
}

export default App
