import type { AttachmentView, ConversationView } from './types.ts';
import type { DraftImage } from './ConversationImageInput.tsx';
import { attachmentMimeType, conversationImageTypes } from './conversation-images.ts';
import { extractVideoFrames } from './conversation-video.ts';

export async function prepareConversationMaterial(original: File) {
  const mimeType = attachmentMimeType(original);
  const file = original.type === mimeType ? original : new File([original], original.name, {type: mimeType});
  if (mimeType.startsWith('video/')) return {file, extractedVideo: await extractVideoFrames(file)};
  if (conversationImageTypes.includes(mimeType)) {
    try {
      const image = await createImageBitmap(file);
      image.close();
    } catch {
      throw new Error(`“${file.name}”无法解码，请重新导出或更换图片。`);
    }
  }
  return {file};
}

type Video = {duration:number;frames:Array<{id:string;time:number}>};
type Upload = (conversation:ConversationView,file:File,video?:Video)=>Promise<AttachmentView>;
/** Existing conversation and question drafts share the exact upload/frame pipeline. Callers own draft state. */
export async function uploadConversationMaterials(conversation:ConversationView,files:File[],upload:Upload,accept:(image:DraftImage)=>void,isCurrent:()=>boolean):Promise<void>{
  let current=conversation;
  const save=async(file:File,video?:Video)=>{
    if(!isCurrent())throw new Error('对话已切换，未发送的材料已保留。');
    const saved=await upload(current,file,video);
    current={...current,revision:saved.revision,attachmentRevision:saved.attachmentRevision};
    return saved;
  };
  for(const original of files){
    const {file, extractedVideo} = await prepareConversationMaterial(original);
    let video:Video|undefined;
    if(extractedVideo){
      video={duration:extractedVideo.duration,frames:[]};
      for(const frame of extractedVideo.frames){const saved=await save(frame.file);video.frames.push({id:saved.id,time:frame.time});}
    }
    const saved=await save(file,video);accept({...saved,name:file.name,file});
  }
}
