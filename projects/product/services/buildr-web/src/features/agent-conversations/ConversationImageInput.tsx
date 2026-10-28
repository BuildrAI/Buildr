import { useEffect, useState, type ReactNode } from 'react';
import { Button, Image } from 'antd';
import { CloseOutlined, FileImageOutlined } from '@ant-design/icons';
import type { AttachmentView } from './types';
import { attachmentMimeType, transferredFiles } from './conversation-images';

export type DraftImage = AttachmentView & { name: string; file?: File };
export function ImageThumbnail({ image, disabled = false, onRemove }: { image: Pick<DraftImage, 'name' | 'file'>; disabled?: boolean; onRemove?(): void }) {
  const [url, setUrl] = useState<string>();
  const video = image.file?.type.startsWith('video/');
  useEffect(() => {
    if (!image.file) return;
    if (video) { const local = URL.createObjectURL(image.file); setUrl(local); return () => URL.revokeObjectURL(local); }
    // The application permits data: images, while blob: remains blocked by its CSP.
    const reader = new FileReader(); setUrl(undefined);
    reader.onload = () => { if (typeof reader.result === 'string') setUrl(reader.result); };
    reader.readAsDataURL(image.file);
    return () => { reader.onload = null; reader.abort(); };
  }, [image.file, video]);
  return <div className={'ac-image-thumbnail'+(video?' ac-video-thumbnail':'')} title={image.name}>
    {url ? video ? <><video src={url} controls preload="metadata" playsInline aria-label={image.name}/><small>视频 · 抽样画面，不含音轨</small></> : <Image src={url} alt={image.name} width={72} height={72} preview={{ mask: <></> }} /> : <FileImageOutlined />}
    {onRemove && <Button type="text" size="small" className="ac-image-remove" icon={<CloseOutlined />} aria-label={(video?'移除视频 ':'移除图片 ') + image.name} disabled={disabled} onClick={onRemove} />}
  </div>;
}

export function ConversationImageInput({ images, disabled, onAdd, onRemove, onBlocked, children }: {
  images: DraftImage[]; disabled: boolean; onAdd(files: File[]): Promise<void>; onRemove(id: string): void; onBlocked(): void; children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  return <div className={'ac-composer' + (dragging ? ' ac-composer-dragging' : '')}
    onPaste={event => {
      const files = transferredFiles(event.clipboardData).filter(file => /^(image|video)\//.test(attachmentMimeType(file)));
      if (!files.length) return;
      event.preventDefault();
      if (disabled) onBlocked(); else void onAdd(files);
    }}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; setDragging(!disabled); } }}
    onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
    onDrop={event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault(); event.stopPropagation(); setDragging(false);
      if (disabled) onBlocked(); else void onAdd(transferredFiles(event.dataTransfer));
    }}>
    {images.length > 0 && <div className="ac-attachments" aria-label="待发送附件">{images.map(image => <ImageThumbnail key={image.id} image={image} disabled={disabled} onRemove={() => onRemove(image.id)} />)}</div>}
    {children}
    {dragging && <div className="ac-image-drop-hint">松开以添加图片或视频</div>}
  </div>;
}
