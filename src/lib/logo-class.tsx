import { getCfsmOsIconUrl } from "@/lib/os-icon"
import { cn } from "@/lib/utils"
import { Server } from "lucide-react"
import type { SVGProps } from "react"
import { useEffect, useState } from "react"

export function GetFontLogoClass(platform: string): string {
  const p = (platform || "").toLowerCase().trim()
  if (p === "darwin" || p.includes("mac os") || p.includes("macos") || p.includes("apple")) return "apple"
  if (p.includes("openwrt") || p.includes("immortalwrt")) return "tux"
  if (p === "amazon" || p.includes("amazon linux")) return "redhat"
  if (p === "arch" || p.includes("arch linux") || p.includes("archlinux")) return "archlinux"
  if (p.includes("opensuse") || p.includes("suse")) return "opensuse"
  if (p.includes("debian")) return "debian"
  if (p.includes("ubuntu")) return "ubuntu"
  if (p.includes("alpine")) return "alpine"
  if (p.includes("centos")) return "centos"
  if (p.includes("rocky")) return "rocky-linux"
  if (p.includes("alma")) return "almalinux"
  if (p.includes("oracle")) return "oracle"
  if (p.includes("rhel") || p.includes("red hat")) return "redhat"
  if (p.includes("fedora")) return "fedora"
  if (p.includes("manjaro")) return "manjaro"
  if (p.includes("kali")) return "kali-linux"
  if (p.includes("mint")) return "linuxmint"
  if (p.includes("nixos")) return "nixos"
  if (p.includes("freebsd")) return "freebsd"
  if (p.includes("openbsd")) return "openbsd"
  if (p.includes("gentoo")) return "gentoo"
  return "tux"
}

export function GetOsName(platform: string): string {
  const p = (platform || "").toLowerCase().trim()
  if (!p) return "Linux"
  if (p === "darwin" || p.includes("mac os") || p.includes("macos") || p.includes("apple")) return "macOS"
  if (p.includes("windows") || p.startsWith("win")) return "Windows"
  if (p.includes("almalinux") || p.includes("alma")) return "AlmaLinux"
  if (p.includes("oracle")) return "Oracle"
  if (p.includes("alibaba") || p.includes("alinux") || p.includes("anolis")) return "Alibaba"
  if (p.includes("opencloud")) return "OpenCloud"
  if (p === "amazon" || p.includes("amazon linux") || p.includes("rhel") || p.includes("red hat")) return "RedHat"
  if (p === "arch" || p.includes("arch linux") || p.includes("archlinux")) return "Arch"
  if (p.includes("opensuse") || p.includes("suse")) return "openSUSE"
  if (p.includes("debian")) return "Debian"
  if (p.includes("ubuntu")) return "Ubuntu"
  if (p.includes("alpine")) return "Alpine"
  if (p.includes("centos")) return "CentOS"
  if (p.includes("rocky")) return "Rocky"
  if (p.includes("fedora")) return "Fedora"
  if (p.includes("manjaro")) return "Manjaro"
  if (p.includes("kali")) return "Kali"
  if (p.includes("mint")) return "Mint"
  if (p.includes("nixos")) return "NixOS"
  if (p.includes("armbian")) return "Armbian"
  if (p.includes("synology") || p.includes("dsm")) return "DSM"
  if (p.includes("proxmox") || p.includes("pve")) return "PVE"
  if (p.includes("raspbian") || p.includes("raspberry")) return "RaspberryPi"
  if (p.includes("freebsd")) return "FreeBSD"
  if (p.includes("openbsd")) return "OpenBSD"
  if (p.includes("gentoo")) return "Gentoo"
  if (p.includes("openwrt") || p.includes("immortalwrt")) return "OpenWrt"
  if (p.includes("linux")) return "Linux"
  return platform.split(/[\s/]/)[0] || "Linux"
}

export function MageMicrosoftWindows(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" {...props}>
      <path
        fill="currentColor"
        d="M2.75 7.189V2.865c0-.102 0-.115.115-.115h8.622c.128 0 .14 0 .14.128V11.5c0 .128 0 .128-.14.128H2.865c-.102 0-.115 0-.115-.116zM7.189 21.25H2.865c-.102 0-.115 0-.115-.116V12.59c0-.128 0-.128.128-.128h8.635c.102 0 .115 0 .115.115v8.57c0 .09 0 .103-.116.103zM21.25 7.189v4.31c0 .116 0 .116-.116.116h-8.557c-.102 0-.128 0-.128-.115V2.865c0-.09 0-.102.115-.102h8.48c.206 0 .206 0 .206.205zm-8.763 9.661v-4.273c0-.09 0-.115.103-.09h8.621c.026 0 0 .09 0 .142v8.518a.06.06 0 0 1-.017.06a.06.06 0 0 1-.06.017H12.54s-.09 0-.077-.09V16.85z"
      />
    </svg>
  )
}

export function OsIcon({ platform, apiIndex = 0, className }: { platform: string; apiIndex?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = getCfsmOsIconUrl(platform, apiIndex)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (failed || !platform) {
    if ((platform || "").toLowerCase().includes("windows")) {
      return <MageMicrosoftWindows className={cn("size-3.5 text-sky-500", className)} />
    }
    return <Server className={cn("size-3.5 text-muted-foreground", className)} />
  }

  return (
    <img
      src={src}
      alt={GetOsName(platform)}
      className={cn("size-3.5 object-contain shrink-0", className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
