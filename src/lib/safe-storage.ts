export type StorageKind = "local" | "session"

function getStorage(kind: StorageKind): Storage | null {
  try {
    if (typeof window === "undefined") return null
    const storage = kind === "local" ? window.localStorage : window.sessionStorage
    return storage ?? null
  } catch {
    return null
  }
}

export function safeStorageGet(key: string, kind: StorageKind = "local"): string | null {
  try {
    const storage = getStorage(kind)
    return storage ? storage.getItem(key) : null
  } catch {
    return null
  }
}

export function safeStorageSet(key: string, value: string, kind: StorageKind = "local"): boolean {
  try {
    const storage = getStorage(kind)
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeStorageRemove(key: string, kind: StorageKind = "local"): void {
  try {
    const storage = getStorage(kind)
    storage?.removeItem(key)
  } catch {
    // ignore storage errors
  }
}

export function safeStorageRemoveByPrefix(prefix: string, kind: StorageKind = "local"): void {
  try {
    const storage = getStorage(kind)
    if (!storage) return
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i)
      if (k && k.startsWith(prefix)) {
        storage.removeItem(k)
      }
    }
  } catch {
    // ignore storage errors
  }
}
