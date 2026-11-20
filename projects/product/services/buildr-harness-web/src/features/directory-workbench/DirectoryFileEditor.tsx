import { useRef, useState } from 'react';
import { Alert, Button, Input, Space } from 'antd';
import { normalizeEditorText, preferredLineBreak } from '../../workbench/editor/file-editing-text';
import type { DirectoryRequest, FileObservation } from './api';

export type FileDraft = {observation:FileObservation;content:string;error?:string};

/** Draft lifetime is owned by the directory host, not by the currently visible tab. */
export function DirectoryFileEditor({path, draft, onChange, onSaved, request}: {
  path:string; draft:FileDraft; onChange(next:FileDraft):void; onSaved():void; request:DirectoryRequest;
}) {
  const pending=useRef(false);
  const [saving,setSaving]=useState(false), [composing,setComposing]=useState(false);
  const changed=draft.content!==draft.observation.content;
  const save=async()=>{
    if(!changed||pending.current||composing||!draft.observation.editable)return;
    pending.current=true;setSaving(true);
    try {
      const current=draft.observation;
      const saved=await request<FileObservation>('save',{path,content:draft.content,expectedFileId:current.fileId,expectedRevision:current.revision,expectedSourceRevision:current.sourceRevision});
      onChange({observation:saved,content:saved.content});onSaved();
    } catch(error) { onChange({...draft,error:error instanceof Error?error.message:'保存未确认。请先核对磁盘内容；草稿已保留。'}); }
    finally{pending.current=false;setSaving(false);}
  };
  const checkDisk=async()=>{
    if(pending.current)return;
    pending.current=true;setSaving(true);
    try {
      const latest=await request<FileObservation>('editor',{path});
      // Detect unknown-success without silently accepting an unrelated outside edit as the save base.
      if(latest.fileId===draft.observation.fileId && latest.sourceRevision===draft.observation.sourceRevision && latest.content===draft.content) {
        onChange({observation:latest,content:draft.content});onSaved();
      }else{
        onChange({...draft,error:'磁盘内容与草稿不同。请复制草稿，关闭编辑后核对当前文件；不会用草稿覆盖新版本。'});
      }
    }catch(error){onChange({...draft,error:error instanceof Error?error.message:'磁盘内容暂不可核对。'});}
    finally{pending.current=false;setSaving(false);}
  };
  return <section className="harness-directory-file-editor" aria-label="文件编辑">
    {draft.error&&<Alert type="warning" showIcon message={draft.error} />}
    {!draft.observation.editable&&<Alert type="info" showIcon message={draft.observation.readonlyReason||'文件保持只读。'}/>}
    <Input.TextArea aria-label="文件原文" value={normalizeEditorText(draft.content)} readOnly={saving||!draft.observation.editable} spellCheck={false}
      onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}
      onKeyDown={event=>{if(event.key==='s'&&(event.metaKey||event.ctrlKey)){event.preventDefault();if(!event.nativeEvent.isComposing)void save();}}}
      onChange={event=>{const lineBreak=preferredLineBreak(draft.content);onChange({...draft,content:lineBreak==='\r\n'?event.target.value.replaceAll('\n','\r\n'):event.target.value});}} />
    <Space wrap><Button type="primary" loading={saving} disabled={!changed||composing||!draft.observation.editable} onClick={()=>void save()}>保存文件</Button>
      <Button disabled={saving} onClick={()=>void checkDisk()}>核对磁盘内容</Button>
      <span role="status">{changed?'有未保存改动':'与已观察版本一致'}</span></Space>
  </section>;
}
