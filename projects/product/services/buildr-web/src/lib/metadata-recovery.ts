/** Keep edited fields; adopt newer values only for fields the user left unchanged. */
export function rebaseEditedFields<T extends Record<string, unknown>>(base: T, draft: T, latest: T): T {
  const unchanged = (a: unknown, b: unknown) => a === b || (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));
  const result = { ...draft };
  for (const key of Object.keys(latest) as Array<keyof T>) {
    if (unchanged(draft[key], base[key])) result[key] = latest[key];
  }
  return result;
}
