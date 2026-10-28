import { useEffect, useRef, useState } from 'react';
import { draftKey, readDraft, transferDraftText, writeDraft } from './conversation-state';
const profile = () => document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local';
export function conversationDraftKey(workspaceId: string | null, conversationId: string | null) { return draftKey(profile(), workspaceId, conversationId); }
export function useConversationDraft(workspaceId: string | null, conversationId: string | null) {
  const key = conversationDraftKey(workspaceId, conversationId);
  const memory = useRef(new Map<string,{text:string;taskId?:string;workspaceId?:string}>());
  const read = (target = key) => {
    let saved:{text:string;taskId?:string;workspaceId?:string;available:boolean} = {text:'',taskId:undefined,available:false};
    try {
      saved = readDraft(target,sessionStorage);
      // One bounded migration: preserve other legacy workspace drafts without merging them.
      if(target===key&&!conversationId&&!sessionStorage.getItem(key+':migrated')) {
        if(!sessionStorage.getItem(key)) {
          const legacy=`buildr.agent-conversation.draft:${encodeURIComponent(profile())}:${encodeURIComponent(workspaceId||'unselected')}:new`;
          const old=readDraft(legacy,sessionStorage);
          if(old.text&&writeDraft(key,old.text,sessionStorage,old.taskId,workspaceId||'@default')) {
            saved={...old,workspaceId:workspaceId||'@default'};sessionStorage.removeItem(legacy);
          }
        }
        sessionStorage.setItem(key+':migrated','true');
      }
    } catch { /* Keep same-page drafts usable. */ }
    return {...saved,...(memory.current.get(target)||{})};
  };
  const save = (target:string,text:string,taskId?:string,selectedWorkspace?:string) => {memory.current.set(target,{text,taskId,workspaceId:selectedWorkspace});try {return writeDraft(target,text,sessionStorage,taskId,selectedWorkspace);}catch {return false;}};
  const [state, setState] = useState(() => ({key,...read()}));
  const value = state.key === key ? state : {key,...read()};
  useEffect(() => { if (state.key !== key) setState({key,...read()}); }, [key, state.key]);
  const selectedWorkspace=value.workspaceId||workspaceId||'@default';
  const setText = (text: string) => {const taskId=text?value.taskId:undefined;const selected=!conversationId?selectedWorkspace:undefined;const available=save(key,text,taskId,selected);setState({key,text,taskId,workspaceId:selected,available});};
  const setTaskId = (taskId?: string) => {const selected=!conversationId?selectedWorkspace:undefined;const available=save(key,value.text,taskId,selected);setState({key,text:value.text,taskId,workspaceId:selected,available});};
  const setWorkspace = (workspaceId:string,taskId?:string) => {const available=save(key,value.text,taskId,workspaceId);setState({key,text:value.text,taskId,workspaceId,available});};
  // Creating the real conversation transfers its draft even when browser storage is denied.
  const transferTo = (nextWorkspaceId:string,nextConversationId:string) => {
    const next=conversationDraftKey(nextWorkspaceId,nextConversationId);
    const latest=transferDraftText(key,next,read,save);
    setState({key:next,...latest});
  };
  // A slow accepted response may arrive after the user has already written the next draft.
  const clearSubmitted = (targetWorkspaceId:string,targetConversationId:string,submittedText:string) => {
    const target=conversationDraftKey(targetWorkspaceId,targetConversationId);
    if(read(target).text!==submittedText)return;
    const available=save(target,'');
    setState(previous=>previous.key===target?{key:target,text:'',taskId:undefined,available}:previous);
  };
  const acceptNewSubmitted = (nextWorkspaceId:string,nextConversationId:string,submittedText:string,transferRemainder:boolean) => {
    const source=conversationDraftKey(null,null),target=conversationDraftKey(nextWorkspaceId,nextConversationId),latest=read(source);
    if(latest.text!==submittedText){
      if(!transferRemainder||read(target).text)return;
      if(!save(target,latest.text))return;
    }
    const available=save(source,'',undefined,latest.workspaceId);
    setState(previous=>previous.key===source?{key:source,text:'',workspaceId:latest.workspaceId,taskId:undefined,available}:previous);
  };
  return {text:value.text, taskId:value.taskId, workspaceId:selectedWorkspace, setWorkspace, available:value.available, setText,setTaskId,transferTo,clearSubmitted,acceptNewSubmitted};
}
