import type { CodeLocation } from './api/code-api';
export type CodeTaskEntry = {
  taskId:string; taskTitle:string;
  file?:{gitRepositoryId:string;checkoutId?:string;path:string;commitHash?:string;line?:number};
  from:{pathname:string;search:string;hash:string;state:unknown};
};
export type CodeFileTab = CodeLocation & {key:string;path:string;line?:number;focusRequest?:number;matchQuery?:string};
export const codeLocationKey=(value:CodeLocation)=>JSON.stringify([value.repositoryId,value.checkoutId||'',value.checkoutId?'':value.taskId||'',value.commitHash||'']);
export const codeCheckoutKey=(value:CodeLocation)=>codeLocationKey({...value,commitHash:undefined});
// Tree identifiers stay opaque to the shared browser; requests retain the real repository identity.
export const codeBrowserKey=(value:CodeLocation)=>encodeURIComponent(codeLocationKey(value));
export const codeFileKey=(value:CodeLocation,path:string)=>codeLocationKey(value)+':'+path;
export function relativeCodeLink(file:string,href:string):string|null {
  if(!href||/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(href))return null;
  let target:string;try{target=decodeURIComponent(href.split(/[?#]/)[0]);}catch{return null;}
  if(!target||/[\\\0]/.test(target))return null;
  const parts=file.split('/').slice(0,-1);
  for(const part of target.split('/')){if(part==='..'){if(!parts.length)return null;parts.pop();}else if(part&&part!=='.')parts.push(part);}
  return parts.some(part=>part.toLowerCase()==='.git')?null:parts.join('/');
}
