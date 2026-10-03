import { useState } from 'react';
/** Build-time replacement for this prototype only: no request or persistence. */
export function useWorkbenchPreferences() {
  const [items, setItems] = useState<string[]>([]);
  return {
    has: (kind: string, key: string) => items.includes(kind + ':' + key),
    set: async (kind: string, key: string) => setItems(previous => [...previous, kind + ':' + key]),
    remove: async (kind: string, key: string) => setItems(previous => previous.filter(item => item !== kind + ':' + key)),
  };
}
