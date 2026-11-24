export type PreviewImage = { source: string; name: string };

export function parsePreviewImage(value: unknown, now: number): PreviewImage | undefined {
  const image = value as Partial<PreviewImage> & { expiresAt?: unknown } | null;
  if (typeof image?.expiresAt !== 'number' || !Number.isFinite(image.expiresAt) || image.expiresAt <= now || image.expiresAt > now + 1500
      || typeof image.source !== 'string' || image.source.length > 12_000_000
      || !/^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[a-z0-9+/]+={0,2}$/i.test(image.source)
      || typeof image.name !== 'string' || image.name.length > 256) return;
  return { source: image.source, name: image.name || '图片' };
}

/** A native modal enters the host top layer rather than a guest stacking context. */
export function openImagePreview(image: PreviewImage, focusReturn: HTMLElement): () => void {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '图片预览');
  Object.assign(dialog.style, { boxSizing: 'border-box', width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none',
    margin: '0', padding: '0', border: '0', background: 'rgba(12, 16, 24, .82)', color: 'white', overflow: 'hidden' });
  const header = document.createElement('header');
  Object.assign(header.style, { position: 'absolute', zIndex: '1', inset: '0 0 auto', padding: '12px 18px', display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(12, 16, 24, .86)' });
  const caption = document.createElement('span'); caption.textContent = image.name;
  Object.assign(caption.style, { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  const zoom = document.createElement('button'); zoom.type = 'button'; zoom.textContent = '实际大小';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭预览'; close.autofocus = true;
  const stage = document.createElement('div');
  Object.assign(stage.style, { position: 'absolute', inset: '56px 0 0', overflow: 'auto', display: 'grid', placeItems: 'center', padding: '16px', boxSizing: 'border-box' });
  const bitmap = document.createElement('img'); bitmap.alt = image.name;
  Object.assign(bitmap.style, { display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', minHeight: '0' });
  bitmap.addEventListener('error', () => { stage.textContent = '图片无法在 DSH 中显示。'; zoom.disabled = true; });
  bitmap.src = image.source;
  let actual = false;
  zoom.onclick = () => {
    actual = !actual; zoom.textContent = actual ? '适应窗口' : '实际大小';
    stage.style.display = actual ? 'block' : 'grid';
    bitmap.style.maxWidth = bitmap.style.maxHeight = actual ? 'none' : '100%';
  };
  close.onclick = () => dialog.close();
  stage.onclick = event => { if (event.target === stage) dialog.close(); };
  dialog.addEventListener('close', () => { dialog.remove(); if (focusReturn.isConnected) focusReturn.focus(); }, { once: true });
  header.append(caption, zoom, close); stage.append(bitmap); dialog.append(header, stage); document.body.append(dialog);
  try { dialog.showModal(); }
  catch (error) { dialog.remove(); throw error; }
  return () => { if (dialog.open) dialog.close(); };
}
