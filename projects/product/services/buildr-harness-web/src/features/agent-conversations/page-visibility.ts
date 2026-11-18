/** Only presentation observation pauses; this never controls background execution. */
export function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}
export function subscribePageVisibility(notify: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
}
export const modelCatalogRefreshMs = (settings: boolean) => settings ? 5000 : 30_000;
