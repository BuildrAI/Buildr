/** Derive only portable identifiers; invalid or incomplete addresses need manual input. */
export function repositoryCodeFromUrl(value: string): string {
  const address = value.trim();
  if (!address) return '';
  let pathname: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(address)) {
    try { pathname = new URL(address).pathname; } catch { return ''; }
  } else {
    const scp = address.match(/^(?:[^@\s/]+@)?[^:\s/]+:(.+)$/);
    if (!scp) return '';
    pathname = scp[1];
  }
  let segment = pathname.replace(/\/+$/, '').split('/').at(-1) || '';
  try { segment = decodeURIComponent(segment); } catch { return ''; }
  segment = segment.replace(/\.git$/i, '');
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) ? segment : '';
}
