import { CfsmContext, CfsmContextValue } from "@/context/cfsm-context"
import { useContext } from "react"

export function useCfsm(): CfsmContextValue {
  const ctx = useContext(CfsmContext)
  if (!ctx) {
    throw new Error("useCfsm must be used inside CfsmProvider")
  }
  return ctx
}
