import { useRef, useState, type ReactNode } from 'react';
import { Alert } from 'antd';
import { ConversationComposer } from './ConversationComposer';
import type { DraftImage } from './ConversationImageInput';
import { imageSelectionError } from './conversation-images';

export type AnswerValue = string | string[] | {text: string; attachmentIds: string[]};
export type AnswerMaterialUpload = (files: File[], accept: (image: DraftImage) => void) => Promise<void>;
export const answerHasContent = (value: AnswerValue | undefined): boolean => Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? Boolean(value.trim()) : Boolean(value && (value.text.trim() || value.attachmentIds.length));

type Props = {label: string; value: string; onChange(text: string, images: DraftImage[]): void; onUpload?: AnswerMaterialUpload; busy: boolean; actions?: ReactNode};
/** Same composition surface as ordinary chat; the caller alone submits the formal answer. */
export function ConversationAnswerInput({label,value,onChange,onUpload,busy,actions}: Props) {
  const [images,setImages] = useState<DraftImage[]>([]), [uploading,setUploading] = useState(false), [error,setError] = useState('');
  const latest = useRef({value,images}); latest.current = {value,images};
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
    <ConversationComposer addLabel="添加回答图片或视频" images={images} materialDisabled={busy||uploading||!onUpload} addDisabled={busy||uploading||!onUpload} uploading={uploading} onAdd={add} onRemove={id=>update(latest.current.images.filter(image=>image.id!==id))} onBlocked={()=>setError('当前正在处理，请稍后再添加图片或视频。')}
      input={{'aria-label':label,placeholder:'输入你的回答',value,autoSize:{minRows:2,maxRows:6},onChange:event=>{latest.current.value=event.target.value;onChange(event.target.value,latest.current.images);}}} access={null} execution={actions}/>
    {error&&<Alert type="error" message={error} showIcon/>}
  </div>;
}
