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
  Object.assign(dialog.style, {
    position: 'fixed', inset: '0', boxSizing: 'border-box', width: '100%', height: '100%',
    maxWidth: 'none', maxHeight: 'none', margin: '0', border: '0', overflow: 'hidden',
    padding: 'max(48px, var(--dsh-frame-top-clearance, 0px)) clamp(12px, 3vw, 32px) 16px',
    background: 'rgba(12, 16, 24, .90)', color: '#f5f7fa',
    font: '13px/1.4 system-ui, sans-serif',
    display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: '12px',
  });
  const toolbar = document.createElement('footer');
  Object.assign(toolbar.style, {
    justifySelf: 'center', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
    gap: '8px', maxWidth: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,.16)', background: '#222936',
  });
  const caption = document.createElement('span'); caption.textContent = image.name; caption.title = image.name;
  Object.assign(caption.style, { minWidth: '0', maxWidth: 'min(220px, 42vw)', paddingInline: '6px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e2e7ef' });
  const button = (text: string) => {
    const control = document.createElement('button');
    control.type = 'button'; control.textContent = text;
    Object.assign(control.style, { appearance: 'none', boxSizing: 'border-box', minHeight: '32px',
      border: '1px solid rgba(255,255,255,.2)', borderRadius: '7px', padding: '4px 12px',
      background: '#343e4e', color: '#f5f7fa', font: 'inherit', cursor: 'pointer' });
    return control;
  };
  const zoom = button('实际大小');
  const close = button('关闭预览'); close.autofocus = true;
  const stage = document.createElement('div');
  Object.assign(stage.style, { position: 'relative', minWidth: '0', minHeight: '0', overflow: 'hidden' });
  const bitmap = document.createElement('img'); bitmap.alt = image.name;
  Object.assign(bitmap.style, { position: 'absolute', inset: '0', margin: 'auto', display: 'block',
    width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' });
  bitmap.addEventListener('error', () => { stage.textContent = '图片无法在 DSH 中显示。'; zoom.disabled = true; });
  bitmap.src = image.source;
  let actual = false;
  zoom.onclick = () => {
    actual = !actual; zoom.textContent = actual ? '适应窗口' : '实际大小';
    stage.style.overflow = actual ? 'auto' : 'hidden';
    bitmap.style.position = actual ? 'static' : 'absolute';
    bitmap.style.maxWidth = bitmap.style.maxHeight = actual ? 'none' : '100%';
    stage.scrollTo(0, 0);
  };
  close.onclick = () => dialog.close();
  stage.onclick = event => { if (event.target === stage) dialog.close(); };
  dialog.addEventListener('close', () => { dialog.remove(); if (focusReturn.isConnected) focusReturn.focus(); }, { once: true });
  toolbar.append(caption, zoom, close); stage.append(bitmap); dialog.append(stage, toolbar); document.body.append(dialog);
  try { dialog.showModal(); }
  catch (error) { dialog.remove(); throw error; }
  return () => { if (dialog.open) dialog.close(); };
}
