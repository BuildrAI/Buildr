export type MarkdownImageContext = { documentDigest: string; sourceIdentity: string };
export type MarkdownImageFailures = { version: string; urls: string[] };

const digest = /^sha256-[0-9a-f]{64}$/;
const forbiddenPath = (value: string) => !value || /[\0\\]/.test(value) || value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value);

/** Validate local image syntax before creating a same-origin request. The server owns the real source boundary. */
export function localMarkdownImagePath(documentPath: string, href: string): string | null {
  const source = documentPath.startsWith('@project/') ? documentPath.slice('@project/'.length) : documentPath;
  if (forbiddenPath(source) || source.startsWith('@') || source.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null;
  const raw = href.trim();
  if (forbiddenPath(raw) || raw.startsWith('@')) return null;
  let relative: string;
  try { relative = decodeURIComponent(raw.split(/[?#]/)[0]); } catch { return null; }
  if (forbiddenPath(relative) || relative.startsWith('@') || !/\.(png|jpe?g|gif|webp)$/i.test(relative)) return null;
  const segments = source.split('/').slice(0, -1);
  for (const segment of relative.split('/')) {
    if (segment === '..') { if (!segments.length) return null; segments.pop(); }
    else if (segment && segment !== '.') segments.push(segment);
  }
  return segments.length ? segments.join('/') : null;
}

/** Both observations are mandatory: equal Markdown bytes do not prove an equal source checkout. */
export function markdownImageQuery(documentPath: string, href: string, context?: MarkdownImageContext | null): URLSearchParams | null {
  if (!context || !digest.test(context.documentDigest) || !digest.test(context.sourceIdentity) || !localMarkdownImagePath(documentPath, href)) return null;
  return new URLSearchParams({ href, expectedDocumentDigest: context.documentDigest, expectedSourceIdentity: context.sourceIdentity });
}

/** Ignore late image events from another document and clear only the image that really recovered. */
export function updateMarkdownImageFailures(current: MarkdownImageFailures, version: string, source: string | null, failed: boolean, resolveImage: (href: string) => { href: string } | null): MarkdownImageFailures {
  if (!source) return current;
  let href: string | null;
  try { href = new URL(source, 'http://buildr.local').searchParams.get('href'); } catch { return current; }
  if (href === null || resolveImage(href)?.href !== source) return current;
  const urls = current.version === version ? current.urls : [];
  const next = failed ? [...new Set([...urls, source])] : urls.filter(url => url !== source);
  return { version, urls: next };
}
