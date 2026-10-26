import { useEffect, useRef, useState } from 'react';
import type { ConversationView } from './types';
import { ImageThumbnail, type DraftImage } from './ConversationImageInput';

type ReadImage = (conversation: ConversationView, id: string, signal?: AbortSignal) => Promise<Blob>;
function StoredImage({ conversation, id, index, read }: { conversation: ConversationView; id: string; index: number; read: ReadImage }) {
  const target = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<Pick<DraftImage, 'name' | 'file'>>();
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true, started = false;
    setImage(undefined); setFailed(false);
    const load = () => {
      if (started) return; started = true;
      void read(conversation, id, controller.signal).then(blob => {
        if (active) setImage({ name: `图片 ${index + 1}`, file: new File([blob], `图片 ${index + 1}`, { type: blob.type }) });
      }).catch(() => { if (active) setFailed(true); });
    };
    const observer: IntersectionObserver | undefined = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: '200px' });
    if (observer && target.current) observer.observe(target.current); else load();
    return () => { active = false; observer?.disconnect(); controller.abort(); };
  }, [conversation.workspaceId, conversation.id, id, index, read, retry]);
  return <div ref={target} className="ac-stored-image">{image ? <ImageThumbnail image={image} /> : failed ? <button type="button" onClick={() => setRetry(value => value + 1)}>重新加载图片</button> : <span>图片 {index + 1}</span>}</div>;
}
export function ConversationMessageImages({ conversation, ids, read }: { conversation: ConversationView; ids: string[]; read: ReadImage }) {
  return <div className="ac-attachments ac-message-images" aria-label="已发送图片">{ids.map((id, index) => <StoredImage key={conversation.id + ':' + id} conversation={conversation} id={id} index={index} read={read} />)}</div>;
}
