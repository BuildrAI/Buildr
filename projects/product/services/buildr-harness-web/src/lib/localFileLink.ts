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

/** Separate the HTML fragment before decoding a file URL, so %23 stays in the filename. */
export function htmlFileLink(reference: string, literal: boolean): { path: string; fragment?: string } {
  if (literal) return { path: reference };
  if (/^file:/i.test(reference)) {
    const hash = reference.indexOf('#');
    const path = hash >= 0 ? localFilePath(reference.slice(0, hash)) : null;
    if (path && /\.html?$/i.test(path) && hash < reference.length - 1) {
      return { path, fragment: reference.slice(hash) };
    }
    return { path: localFilePath(reference) ?? reference };
  }
  const match = /\.html?(#[^\r\n\0]+)$/i.exec(reference);
  return match ? { path: reference.slice(0, -match[1].length), fragment: match[1] } : { path: reference };
}

export function htmlPreviewAddress(url: string | undefined, fragment?: string): string | undefined {
  return url && fragment ? url.split('#', 1)[0] + fragment : url;
}
