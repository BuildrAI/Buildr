/** Layout preferences are optional; a denied browser store must not interrupt work. */
const EVICTABLE_CACHE_PREFIX = 'buildr:source-control-cache:';

export function readOptionalPreference(key: string, storage = () => localStorage): string | null {
  try { return storage().getItem(key); } catch { return null; }
}

export function writeOptionalPreference(key: string, value: string, storage = () => localStorage): void {
  try {
    const store = storage();
    try {
      store.setItem(key, value);
    } catch {
      const evictableKeys: string[] = [];
      for (let index = 0; index < store.length; index += 1) {
        const candidate = store.key(index);
        if (candidate?.startsWith(EVICTABLE_CACHE_PREFIX)) evictableKeys.push(candidate);
      }
      for (const candidate of evictableKeys) store.removeItem(candidate);
      if (evictableKeys.length > 0) store.setItem(key, value);
    }
  } catch { /* The current in-memory choice remains usable. */ }
}
