const preferences = new Map<string, string>();
export function readOptionalPreference(key: string) { return preferences.get(key) ?? null; }
export function writeOptionalPreference(key: string, value: string) { preferences.set(key, value); }
