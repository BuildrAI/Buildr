import { useEffect, useRef, useState } from 'react';
import type { DraftImage } from './ConversationImageInput';
import type { ConversationView } from './types';
import type { AgentConversationsClient } from './api/agent-conversations-api';

type Images = Record<string, DraftImage[]>;
export function readConversationImages(storage: Pick<Storage, 'getItem'>, key: string): Images {
  try {
    const value = JSON.parse(storage.getItem(key) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, images]) => id && Array.isArray(images) && images.length <= 4 && images.every(image =>
      image && ['id', 'name', 'mimeType', 'revision'].every(field => typeof image[field] === 'string') && typeof image.size === 'number'))) as Images;
  } catch { return {}; }
}
export function writeConversationImages(storage: Pick<Storage, 'setItem'>, key: string, images: Images): boolean {
  try {
    storage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(images).filter(([, values]) => values.length).map(([id, values]) => [id, values.map(({ file: _file, ...image }) => image)]))));
    return true;
  } catch { return false; }
}
/** Existing conversations retain their own membership, while bytes remain private on the host. */
export function useConversationAttachments(api: AgentConversationsClient, chat: ConversationView | null, profile: string) {
  const key = 'buildr.agent-conversation.attachments:' + profile;
  const [attachments, setAttachments] = useState<Images>(() => { try { return readConversationImages(sessionStorage, key); } catch { return {}; } });
  const [available, setAvailable] = useState(true);
  const current = useRef(attachments); current.current = attachments;
  useEffect(() => { try { setAvailable(writeConversationImages(sessionStorage, key, attachments)); } catch { setAvailable(false); } }, [key, attachments]);
  const membership = (chat ? attachments[chat.id] ?? [] : []).map(image => image.id).join(',');
  useEffect(() => {
    if (!chat) return;
    const controller = new AbortController();
    for (const image of current.current[chat.id] ?? []) if (!image.file) {
      void api.readImage(chat, image.id, controller.signal).then(blob => {
        if (!controller.signal.aborted) setAttachments(previous => ({ ...previous, [chat.id]: (previous[chat.id] ?? []).map(value => value.id === image.id ? { ...value, file: new File([blob], image.name, { type: image.mimeType }) } : value) }));
      }).catch(() => { /* Membership stays visible and removable if bytes cannot be read. */ });
    }
    return () => controller.abort();
  }, [api, chat?.workspaceId, chat?.id, membership]);
  return { attachments, setAttachments, available };
}
