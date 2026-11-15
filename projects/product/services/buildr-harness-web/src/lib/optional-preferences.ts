/** Layout preferences are optional; a denied browser store must not interrupt work. */
export function readOptionalPreference(key: string, storage = () => localStorage): string | null {
  try { return storage().getItem(key); } catch { return null; }
}

export function writeOptionalPreference(key: string, value: string, storage = () => localStorage): void {
  try { storage().setItem(key, value); } catch { /* The current in-memory choice remains usable. */ }
}
