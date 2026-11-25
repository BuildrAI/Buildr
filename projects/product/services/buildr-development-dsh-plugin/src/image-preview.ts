export type PreviewImage = { source: string; name: string };

export function parsePreviewImage(value: unknown, now: number): PreviewImage | undefined {
  const input = value as { source?: unknown; name?: unknown; expiresAt?: unknown } | undefined;
  if (!input || typeof input.source !== 'string' || input.source.length > 12_000_000) return undefined;
  if (!/^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=]+$/i.test(input.source)) return undefined;
  if (typeof input.expiresAt !== 'number' || !Number.isFinite(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + 1500) {
    return undefined;
  }
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 256) : '图片预览';
  return { source: input.source, name };
}

export function openImagePreview(image: PreviewImage, focusReturn: HTMLElement): () => void {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const dialog = document.createElement('dialog');
  Object.assign(dialog.style, {
    margin: 'auto', padding: '16px', maxWidth: 'min(90vw, 1100px)', maxHeight: '90vh',
    border: 'none', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.94)', color: '#fff',
    display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
  });
  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '13px' });
  const title = document.createElement('span');
  title.textContent = image.name;
  Object.assign(title.style, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '关闭';
  Object.assign(closeButton.style, {
    border: '1px solid rgba(255,255,255,0.28)', borderRadius: '6px', background: 'transparent',
    color: '#fff', padding: '4px 10px', cursor: 'pointer', fontSize: '12px',
  });
  const img = document.createElement('img');
  img.src = image.source;
  img.alt = image.name;
  Object.assign(img.style, { maxWidth: '100%', maxHeight: 'calc(90vh - 80px)', objectFit: 'contain', borderRadius: '6px' });
  header.append(title, closeButton);
  dialog.append(header, img);
  shadow.append(dialog);
  document.body.append(host);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { if (dialog.open) dialog.close(); } catch { /* Already detached cleanly. */ }
    host.remove();
    try { focusReturn.focus(); } catch { /* Guest may already be unmounted. */ }
  };
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  try { dialog.showModal(); } catch { close(); }
  return close;
}
