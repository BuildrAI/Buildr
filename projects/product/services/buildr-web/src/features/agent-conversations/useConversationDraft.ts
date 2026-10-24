import { useEffect, useRef, useState } from 'react';
import { draftKey, readDraft, transferDraftText, writeDraft } from './conversation-state';
const profile = () => document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local';
export function conversationDraftKey(workspaceId: string | null, conversationId: string | null) { return draftKey(profile(), workspaceId, conversationId); }
export function useConversationDraft(workspaceId: string | null, conversationId: string | null) {
  const key = conversationDraftKey(workspaceId, conversationId);
  const memory = useRef(new Map<string,string>());
  const read = (target = key) => {
    let saved = {text:'',available:false};
    try {saved = readDraft(target,sessionStorage);} catch { /* Keep same-page drafts usable. */ }
    return {...saved,text:memory.current.get(target) ?? saved.text};
  };
  const save = (target:string,text:string) => {memory.current.set(target,text);try {return writeDraft(target,text,sessionStorage);}catch {return false;}};
  const [state, setState] = useState(() => ({key,...read()}));
  const value = state.key === key ? state : {key,...read()};
  useEffect(() => { if (state.key !== key) setState({key,...read()}); }, [key, state.key]);
  const setText = (text: string) => {const available=save(key,text);setState({key,text,available});};
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
    setState(previous=>previous.key===target?{key:target,text:'',available}:previous);
  };
  return {text:value.text, available:value.available, setText,transferTo,clearSubmitted};
}
