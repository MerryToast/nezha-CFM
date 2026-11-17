export function formatBytes(bytes: number, decimals: number = 2) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Bytes"
  if (bytes < 1) return `${bytes.toFixed(Math.max(0, decimals))} Bytes`

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]

  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
