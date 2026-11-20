// Session and optional preference storage from the real components stay in memory.
function makeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); },
    clear: () => { data.clear(); },
    key: index => Array.from(data.keys())[index] ?? null,
  };
}
export const sessionStorage = makeStorage();
export const localStorage = makeStorage();
