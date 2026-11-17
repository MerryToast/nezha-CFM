import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource/inter/700.css"
import ReactDOM from "react-dom/client"
import { Toaster } from "sonner"

import App from "./App"
import { ThemeColorManager } from "./components/ThemeColorManager"
import { ThemeProvider } from "./components/ThemeProvider"
import { MotionProvider } from "./components/motion/motion-provider"
import { CfsmProvider } from "./context/cfsm-provider"
import { CommandProvider } from "./context/command-provider"
import { SortProvider } from "./context/sort-provider"
import { StatusProvider } from "./context/status-provider"
import { TooltipProvider } from "./context/tooltip-provider"
import "./i18n"
import "./index.css"

const rootEl = document.getElementById("root")!
rootEl.classList.add("loaded")
if (
  !document.documentElement.classList.contains("dark") &&
  !document.documentElement.classList.contains("light")
) {
  document.documentElement.classList.add(
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  )
}

ReactDOM.createRoot(rootEl).render(
  <MotionProvider>
    <ThemeProvider storageKey="vite-ui-theme">
      <ThemeColorManager />
      <CfsmProvider>
        <CommandProvider>
          <StatusProvider>
            <SortProvider>
              <TooltipProvider>
                <App />
                <Toaster
                  duration={1500}
                  toastOptions={{
                    classNames: {
                      default:
                        "w-fit rounded-full px-2.5 py-1.5 bg-neutral-100 border border-neutral-200 backdrop-blur-xl shadow-none dark:bg-neutral-900 dark:border-neutral-800",
                    },
                  }}
                  position="top-center"
                  className="flex items-center justify-center"
                />
              </TooltipProvider>
            </SortProvider>
          </StatusProvider>
        </CommandProvider>
      </CfsmProvider>
    </ThemeProvider>
  </MotionProvider>,
)
