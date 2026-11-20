/** Convert a local file URL into the filesystem path consumed by source checks. */
export function localFilePath(value: string): string | null {
  const raw = String(value ?? '').trim();
  if (!/^file:/i.test(raw)) return null;
  let rest = raw.slice(5);
  if (!rest.startsWith('//')) return null;
  rest = rest.slice(2);
  const slash = rest.search(/[\\/]/);
  const authority = slash < 0 ? rest : rest.slice(0, slash);
  if (authority && authority.toLowerCase() !== 'localhost') return null;
  const encoded = slash < 0 ? '' : rest.slice(slash);
  if (!encoded || encoded.includes('?') || /[\0\r\n\\]/.test(encoded)) return null;
  // A file URL is percent-encoded; preview and source checks read real filesystem paths.
  let path: string;
  try { path = decodeURIComponent(encoded); } catch { return null; }
  if (!path || path.includes('?') || /[\0\r\n\\]/.test(path)) return null;
  if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
  if (!/^(?:\/|[a-z]:\/)/i.test(path)) return null;
  return path;
}
