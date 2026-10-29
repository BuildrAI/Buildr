import type { AttachmentView, ConversationView } from './types';
import type { DraftImage } from './ConversationImageInput';
import { attachmentMimeType } from './conversation-images';
import { extractVideoFrames } from './conversation-video';

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
    const mimeType=attachmentMimeType(original),file=original.type===mimeType?original:new File([original],original.name,{type:mimeType});
    let video:Video|undefined;
    if(mimeType.startsWith('video/')){
      const extracted=await extractVideoFrames(file);video={duration:extracted.duration,frames:[]};
      for(const frame of extracted.frames){const saved=await save(frame.file);video.frames.push({id:saved.id,time:frame.time});}
    }
    const saved=await save(file,video);accept({...saved,name:file.name,file});
  }
}
