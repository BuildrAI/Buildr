const imageMime = /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i;

/** Resolve one authored Markdown image destination for the conversation surface. */
export function conversationImageSource(cwd: string | undefined, href: string): { href: string } | null {
  const authored = String(href ?? '').trim();
  if (!authored) return null;
  const value = authored.startsWith('<') && authored.endsWith('>') ? authored.slice(1, -1).trim() : authored;
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return { href: value };
  if (/^blob:/i.test(value)) return { href: value };
  if (imageMime.test(value)) return { href: value };
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const raw = value.split(/[?#]/u, 1)[0] ?? '';
  if (!raw || /[\0\r\n]/u.test(raw)) return null;
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (path.startsWith('//') || path.startsWith('\\\\')) return null;
  if (!/^\//u.test(path) && !/^[a-z]:[\\/]/i.test(path)) {
    if (!cwd) return null;
    path = `${cwd.replace(/[\\/]+$/u, '')}/${path.replace(/^[\\/]+/u, '')}`;
  }
  return { href: `/api/v1/conversation-image?path=${encodeURIComponent(path)}` };
}

/** Ordinary local image links use the same authenticated reader as inline images. */
export function conversationImageLinkSource(cwd: string | undefined, href: string): { href: string } | null {
  const source = conversationImageSource(cwd, href);
  if (!source?.href.startsWith('/api/v1/conversation-image?')) return null;
  const path = new URLSearchParams(source.href.split('?')[1]).get('path') ?? '';
  return /\.(?:png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(path) ? source : null;
}
