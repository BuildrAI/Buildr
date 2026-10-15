/** Keep edited fields; adopt newer values only for fields the user left unchanged. */
export function rebaseEditedFields<T extends Record<string, string | undefined>>(base: T, draft: T, latest: T): T {
  const result = { ...draft };
  for (const key of Object.keys(latest) as Array<keyof T>) {
    if (draft[key] === base[key]) result[key] = latest[key];
  }
  return result;
}
