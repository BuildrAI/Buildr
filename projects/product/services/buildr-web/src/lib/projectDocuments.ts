/** Resolve a markdown relative href against the currently viewed project document path. */
export function resolveProjectMarkdownHref(currentDocPath: string, href: string): string | null {
  const value = String(href ?? '').trim();
  if (!value) return null;

  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  let pathEnd = value.length;
  if (hashIndex >= 0) pathEnd = Math.min(pathEnd, hashIndex);
  if (queryIndex >= 0) pathEnd = Math.min(pathEnd, queryIndex);
  const pathPart = value.slice(0, pathEnd);
  if (!pathPart) return null;

  const current = String(currentDocPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const slash = current.lastIndexOf('/');
  const baseDir = slash >= 0 ? current.slice(0, slash + 1) : '';
  let resolved: string;
  try {
    resolved = decodeURIComponent(new URL(pathPart, `https://project.local/${baseDir}`).pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (!resolved || resolved.includes('\0') || /(^|\/)\.\.(\/|$)/.test(resolved)) return null;
  if (!resolved.endsWith('.md')) return null;
  return resolved;
}

export function encodeProjectDocumentPath(docPath: string): string {
  return String(docPath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
