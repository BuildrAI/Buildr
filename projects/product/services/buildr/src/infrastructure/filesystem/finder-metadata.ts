/** Finder bookkeeping is not source content; its name must not hide a directory or link. */
export function isFinderMetadata(name: string, stat: { isFile(): boolean }): boolean {
  if (name !== '.DS_Store') return false;
  if (!stat.isFile()) throw new Error('Unsupported Finder metadata: .DS_Store');
  return true;
}
