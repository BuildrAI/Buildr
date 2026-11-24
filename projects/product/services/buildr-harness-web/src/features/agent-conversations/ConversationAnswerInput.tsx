import { useRef, useState, type ReactNode } from 'react';
import { Alert } from 'antd';
import { ConversationComposer } from './ConversationComposer.tsx';
import type { DraftImage } from './ConversationImageInput.tsx';
import { imageSelectionError } from './conversation-images.ts';
import { shouldSendOnKey } from './conversation-state.ts';

export type AnswerValue = string | string[] | {text: string; attachmentIds: string[]};
export type AnswerMaterialUpload = (files: File[], accept: (image: DraftImage) => void) => Promise<void>;
export const answerHasContent = (value: AnswerValue | undefined): boolean => Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? Boolean(value.trim()) : Boolean(value && (value.text.trim() || value.attachmentIds.length));

export function handleAnswerKeyDown(
  event: { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number; preventDefault(): void },
  options: { busy: boolean; uploading: boolean; onSubmit?: () => void },
): boolean {
  if (!options.onSubmit) return false;
  if (!shouldSendOnKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.isComposing, keyCode: event.keyCode })) return false;
  event.preventDefault();
  if (!options.busy && !options.uploading) options.onSubmit();
  return true;
}

type Props = {label: string; value: string; onChange(text: string, images: DraftImage[]): void; onUpload?: AnswerMaterialUpload; onSubmit?: () => void; busy: boolean; actions?: ReactNode; note?: ReactNode};
/** Same composition surface as ordinary chat; the caller alone submits the formal answer. */
export function ConversationAnswerInput({label,value,onChange,onUpload,onSubmit,busy,actions,note}: Props) {
  const [images,setImages] = useState<DraftImage[]>([]), [uploading,setUploading] = useState(false), [error,setError] = useState('');
  const latest = useRef({value,images}); latest.current = {value,images};
  const composing = useRef(false);
  const update = (next: DraftImage[]) => { latest.current.images = next; setImages(next); onChange(latest.current.value,next); };
  const adding = useRef(false);
  const add = async(files: File[]) => {
    if (!onUpload || adding.current) return;
    const invalid = imageSelectionError(files,latest.current.images.length);
    if (invalid) {setError(invalid);return;}
    adding.current = true; setUploading(true); setError('');
    try {await onUpload(files,image=>update([...latest.current.images,image]));}
    catch (failure) {setError(failure instanceof Error ? failure.message : '材料添加失败，回答已保留。');}
    finally {adding.current = false; setUploading(false);}
  };
  return <div className="ac-answer-input">
    <ConversationComposer addLabel="添加回答图片、视频或文档" showAdd={Boolean(onUpload)} images={images} materialDisabled={busy||uploading||!onUpload} addDisabled={busy||uploading||!onUpload} uploading={uploading} onAdd={add} onRemove={id=>update(latest.current.images.filter(image=>image.id!==id))} onBlocked={()=>setError('当前正在处理，请稍后再添加图片、视频或文档。')}
      input={{'aria-label':label,placeholder:'输入你的回答',value,autoSize:{minRows:2,maxRows:6},onChange:event=>{latest.current.value=event.target.value;onChange(event.target.value,latest.current.images);},onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;},onKeyDown:event=>{handleAnswerKeyDown({key:event.key,shiftKey:event.shiftKey,isComposing:composing.current||event.nativeEvent.isComposing,keyCode:event.nativeEvent.keyCode,preventDefault:()=>event.preventDefault()},{busy,uploading,onSubmit});}}} access={null} execution={actions}/>
    {(note||onSubmit)&&<div className="ac-answer-meta">{note}{onSubmit&&<small className="ac-location-keys">Enter 发送 · Shift+Enter 换行</small>}</div>}
    {error&&<Alert type="error" message={error} showIcon/>}
  </div>;
}
