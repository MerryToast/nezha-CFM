import { getWorkerStaticAssetUrl } from "@/api/cfsm-client"

interface OsIconConfig {
  name: string
  image: string
  keywords: string[]
}

const OS_CONFIGS: OsIconConfig[] = [
  { name: "AlmaLinux", image: "os-alma.svg", keywords: ["alma", "almalinux"] },
  { name: "Alpine Linux", image: "os-alpine.webp", keywords: ["alpine", "alpine linux"] },
  { name: "CentOS", image: "os-centos.svg", keywords: ["centos", "cent os"] },
  { name: "Debian", image: "os-debian.svg", keywords: ["debian", "debian gnu/linux", "deb"] },
  { name: "Ubuntu", image: "os-ubuntu.svg", keywords: ["ubuntu", "elementary"] },
  { name: "macOS", image: "os-macos.svg", keywords: ["macos", "mac os", "darwin", "os x"] },
  { name: "Windows", image: "os-windows.svg", keywords: ["windows", "win32", "win64", "win10", "win11", "win server", "microsoft"] },
  { name: "Arch Linux", image: "os-arch.svg", keywords: ["arch", "archlinux", "arch linux"] },
  { name: "Kali Linux", image: "os-kail.svg", keywords: ["kail", "kali", "kali linux"] },
  { name: "iStoreOS", image: "os-istore.png", keywords: ["istore", "istoreos", "istore os"] },
  { name: "OpenWrt", image: "os-openwrt.svg", keywords: ["openwrt", "open wrt", "open-wrt", "qwrt", "kwrt"] },
  { name: "ImmortalWrt", image: "os-openwrt.svg", keywords: ["immortalwrt", "immortal", "emmortal"] },
  { name: "NixOS", image: "os-nix.svg", keywords: ["nixos", "nix os", "nix"] },
  { name: "Rocky Linux", image: "os-rocky.svg", keywords: ["rocky", "rocky linux"] },
  { name: "Fedora", image: "os-fedora.svg", keywords: ["fedora"] },
  { name: "openSUSE", image: "os-openSUSE.svg", keywords: ["opensuse", "open suse", "suse"] },
  { name: "Gentoo", image: "os-gentoo.svg", keywords: ["gentoo"] },
  { name: "Red Hat", image: "os-redhat.svg", keywords: ["redhat", "rhel", "red hat"] },
  { name: "Linux Mint", image: "os-mint.svg", keywords: ["mint", "linux mint"] },
  { name: "Manjaro", image: "os-manjaro-.svg", keywords: ["manjaro"] },
  { name: "Armbian", image: "os-armbian.png", keywords: ["armbox", "armbian"] },
  { name: "Synology DSM", image: "os-synology.ico", keywords: ["synology", "dsm", "synology dsm"] },
  { name: "Proxmox VE", image: "os-proxmox.ico", keywords: ["proxmox", "proxmox ve", "pve"] },
  { name: "Alibaba Cloud Linux", image: "os-alibaba.svg", keywords: ["alibaba", "aliyun", "alinux", "anolis", "openanolis", "阿里", "龙蜥"] },
  { name: "OpenCloudOS", image: "os-opencloud.svg", keywords: ["opencloud", "opencloudos", "opencloud os"] },
  { name: "Oracle Linux", image: "os-oracle.svg", keywords: ["oracle", "oracle linux"] },
]

const DEFAULT_OS_CONFIG: OsIconConfig = {
  name: "Unknown",
  image: "os-unknown.svg",
  keywords: ["unknown"],
}

export function findOsConfig(osString?: string): OsIconConfig {
  const normalized = String(osString || "").toLowerCase().trim()
  if (!normalized) return DEFAULT_OS_CONFIG
  for (const cfg of OS_CONFIGS) {
    if (cfg.keywords.some((kw) => normalized.includes(kw))) {
      return cfg
    }
  }
  return DEFAULT_OS_CONFIG
}

export function getCfsmOsIconUrl(osString?: string, apiIndex = 0): string {
  const filename = findOsConfig(osString).image
  return getWorkerStaticAssetUrl(`os-icons/${filename}`, apiIndex)
}
