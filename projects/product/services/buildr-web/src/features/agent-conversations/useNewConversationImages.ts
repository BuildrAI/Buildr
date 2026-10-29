import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentConversationsClient } from './api/agent-conversations-api';
import { extractVideoFrames } from './conversation-video';
import { attachmentMimeType } from './conversation-images';
import type { DraftImage } from './ConversationImageInput';

const profile = () => document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local';
function draftIdentity() {
  const key = 'buildr.agent-conversation.images:' + profile();
  try {
    const saved = sessionStorage.getItem(key);
    if (saved && /^[a-f0-9-]{36}$/.test(saved)) return saved;
    const id = crypto.randomUUID(); sessionStorage.setItem(key, id); return id;
  } catch { return crypto.randomUUID(); }
}
type Snapshot = Awaited<ReturnType<AgentConversationsClient['draftImages']>>;
/** The same draft slot survives workspace changes and conversation navigation. */
export function useNewConversationImages(api: AgentConversationsClient, active: boolean) {
  const [id] = useState(draftIdentity);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [error, setError] = useState('');
  const version = useRef(0);
  const current = useRef(snapshot); current.current = snapshot;
  const apply = (value: Snapshot) => { current.current = value; setSnapshot(value); };
  const refresh = useCallback(async () => {
    const request = ++version.current;
    try {
      const value = await api.draftImages(id);
      if (request === version.current) { apply(value); setError(''); }
      return value;
    } catch (failure) {
      if (request === version.current) setError(failure instanceof Error ? failure.message : '无法恢复草稿图片。');
      throw failure;
    }
  }, [api, id]);
  useEffect(() => { if (active) void refresh().catch(() => {}); }, [active, refresh]);
  useEffect(() => {
    if (!active || !snapshot) return;
    const controller = new AbortController();
    for (const image of snapshot.images.filter(image=>!image.frame)) if (!files[image.id]) {
      void api.readDraftImage(id, image.id, controller.signal).then(blob => {
        if (!controller.signal.aborted) setFiles(previous => ({ ...previous, [image.id]: new File([blob], image.name, { type: image.mimeType }) }));
      }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '草稿图片读取失败。'); });
    }
    return () => controller.abort();
  }, [active, snapshot, api, id, files]);
  const add = async (selected: File[]) => {
    ++version.current;
    let value = current.current ?? await refresh();
    try {
      // A browser close can leave frame uploads without their parent video. Reclaim only unreferenced frames.
      const referenced=new Set(value.images.flatMap(image=>image.video?.frames.map(frame=>frame.id)??[]));
      for(const frame of value.images.filter(image=>image.frame&&!referenced.has(image.id))){value=await api.removeDraftImage(id,value.revision,frame.id);apply(value);}
      for (const original of selected) {
        const mimeType=attachmentMimeType(original),file=original.type===mimeType?original:new File([original],original.name,{type:mimeType});
        let video:{duration:number;frames:Array<{id:string;time:number}>}|undefined;
        const staged:string[]=[];
        try {
        if(mimeType.startsWith('video/')){
          const extracted=await extractVideoFrames(file);video={duration:extracted.duration,frames:[]};
          for(const frame of extracted.frames){const before=new Set(value.images.map(image=>image.id));value=await api.uploadDraftImage(id,value.revision,frame.file,{frame:true});apply(value);const saved=value.images.find(image=>!before.has(image.id));if(!saved)throw new Error('视频画面保存结果待核对。');staged.push(saved.id);video.frames.push({id:saved.id,time:frame.time});}
        }
        const before = new Set(value.images.map(image => image.id));
        value = await api.uploadDraftImage(id, value.revision, file, {video});
        const added = value.images.find(image => !before.has(image.id));
        if (added) setFiles(previous => ({ ...previous, [added.id]: file }));
        apply(value);
        } catch(failure) { for(const frame of staged){try{value=await api.removeDraftImage(id,value.revision,frame);apply(value);}catch{break;}}throw failure;}
      }
      setError('');
    } catch (failure) { await refresh().catch(() => {}); throw failure; }
  };
  const remove = async (imageId: string) => {
    ++version.current;
    const value = current.current ?? await refresh();
    try { apply(await api.removeDraftImage(id, value.revision, imageId)); setError(''); }
    catch (failure) { await refresh().catch(() => {}); throw failure; }
  };
  const images: DraftImage[] = (snapshot?.images ?? []).filter(image=>!image.frame).map(image => ({ ...image, revision: snapshot!.revision, file: files[image.id] }));
  return { id, revision: snapshot?.revision, images, ready: snapshot !== null, error, add, remove, refresh };
}
