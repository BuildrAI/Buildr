import { PrototypeFeatureNotes } from './PrototypeFeatureNotes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import { SideReadingPanel } from '../../../components/SideReadingPanel';
import { useSideReading } from '../../../components/useSideReading';
import { prototypeEntries, validPrototypeMessage, type UiPrototypeData } from './prototype-content';
import './prototype-reader.css';
export type { UiPrototypePage, UiPrototypeData } from './prototype-content';
type Props = { active:boolean; workspaceId:string|null; data:UiPrototypeData|null; loading:boolean; error:string|null; onRefresh():void; selectedKey?:string; onSelect?(key:string):void; standalone?:boolean; initialState?:string; onAuxiliaryOpen?():void; closeAuxiliaryToken?:number };
export function PrototypeTab({ active, workspaceId, data, loading, error, onRefresh, selectedKey, onSelect, standalone=false, initialState='', onAuxiliaryOpen, closeAuxiliaryToken }: Props) {
  const entries = useMemo(() => prototypeEntries(data),[data]);
  const [localKey,setLocalKey] = useState(selectedKey || '');
  const selected = entries.find(entry => entry.key === (selectedKey ?? localKey)) || entries[0];
  const [state,setState] = useState(initialState), [position,setPosition] = useState<string>();
  const rootRef = useRef<HTMLElement>(null), frameRef = useRef<HTMLIFrameElement>(null);
  const notes = useSideReading(data?.taskId || '',rootRef,'prototype-notes',standalone);
  const highlighted=useRef<string|undefined>(undefined);
  const nonce = useRef(''), loaded = useRef(false), inbound = useRef('');
  const [selectionNotice,setSelectionNotice] = useState(false);
  const lastKey = useRef<string | undefined>(undefined);
  const fileKey = selected ? `${selected.file.id}:${selected.file.updatedAt}` : '';
  useEffect(() => { if (lastKey.current && !entries.some(entry => entry.key === lastKey.current)) setSelectionNotice(true); lastKey.current = selected?.key; },[entries,selected?.key]);
  useEffect(() => { if (notes.open) onAuxiliaryOpen?.(); },[notes.open]);
  useEffect(() => { if (closeAuxiliaryToken) notes.close(); },[closeAuxiliaryToken]);
  const effectiveState = selected?.scene.states.some(item => item.id === state) ? state : '';
  const send = () => { if (loaded.current && selected) frameRef.current?.contentWindow?.postMessage({type:'buildr:prototype:select',nonce:nonce.current,page:selected.scene.id,state:effectiveState},'*'); };
  const highlight = (position?:string,reveal=false) => {
    highlighted.current=position;setPosition(position);
    if(loaded.current && selected) frameRef.current?.contentWindow?.postMessage({type:'buildr:prototype:highlight',nonce:nonce.current,page:selected.scene.id,state:effectiveState,position:position ?? null,reveal},'*');
  };
  useEffect(() => { if(!notes.open)highlight(); },[notes.open]);
  useEffect(() => { highlighted.current=undefined;setPosition(undefined); },[selected?.key,effectiveState]);
  useEffect(() => {
    const signature=`${selected?.key}:${effectiveState}`;
    // Routing and local state can render separately. Do not echo an intermediate
    // selection back into the frame and reset a user's in-progress interaction.
    if(inbound.current){if(inbound.current===signature)inbound.current='';return;}
    send();
  },[selected?.key,effectiveState]);
  useEffect(() => { loaded.current = false; nonce.current = ''; },[fileKey]);
  useEffect(() => {
    const receive = (event:MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'buildr:prototype:ready') { nonce.current ||= crypto.randomUUID(); loaded.current=true; send(); return; }
      if (!loaded.current || !nonce.current) return;
      const result = validPrototypeMessage(event.data,nonce.current,entries.filter(entry => entry.file.id === selected?.file.id));
      if (!result) return;
      if (result.kind==='rendered') { if(result.entry.key===selected?.key && result.state===effectiveState) highlight(highlighted.current); return; }
      if (result.kind==='highlight') { if(result.entry.key===selected?.key && result.state===effectiveState) { highlighted.current=result.position;setPosition(result.position); } return; }
      const signature=`${result.entry.key}:${result.state}`;
      inbound.current=signature===`${selected?.key}:${effectiveState}`?'':signature;
      setState(result.state); setPosition(result.position);
      if (result.entry.key !== selected?.key) { setLocalKey(result.entry.key); onSelect?.(result.entry.key); }
    };
    window.addEventListener('message',receive); return () => window.removeEventListener('message',receive);
  },[entries,selected?.key,effectiveState,onSelect]);
  const src = selected && workspaceId ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(data?.taskId || '')}/ui-prototypes/${selected.file.id}` : undefined;
  const currentNotes = [...(selected?.scene.notes || []),...(selected?.scene.states.find(item => item.id === effectiveState)?.notes || [])];
  const closeNotes = () => { highlight(); notes.close(); rootRef.current?.querySelector<HTMLButtonElement>('#prototype-notes-toggle')?.focus(); };
  return <section ref={rootRef} id="task-prototype-panel" hidden={!active} className="prototype-reader" data-task-panel="prototype">
    {error && <Alert type="warning" message={error} />}
    {selectionNotice && <Alert type="info" closable onClose={() => setSelectionNotice(false)} message="上次选择的页面已变化，已显示当前可用页面。" />}
    <div className="prototype-toolbar"><h2 id="task-prototype-title">{selected?.scene.title || '界面原型'}</h2><div>
      <Button id="task-prototype-refresh" size="small" type="text" loading={loading} onClick={onRefresh}>刷新</Button>
      {!standalone && selected && <Button id="task-prototype-open-window" size="small" onClick={() => window.open(`/workspaces/${encodeURIComponent(workspaceId || '')}/tasks/${encodeURIComponent(data?.taskId || '')}/prototypes?page=${encodeURIComponent(selected.key)}&state=${encodeURIComponent(effectiveState)}`,'_blank','noopener,noreferrer')}>单独查看</Button>}
      <Button id="prototype-notes-toggle" size="small" aria-expanded={notes.open} aria-controls="prototype-notes-panel" onPointerEnter={event => notes.enter('trigger',event.pointerType)} onPointerLeave={event => notes.exit('trigger',event.pointerType)} onFocus={notes.cancel} onBlur={notes.leave} onClick={notes.toggle} onKeyDown={event => { if(event.key === 'Escape') closeNotes(); }}>功能说明</Button>
    </div></div>
    {selected && <details id="task-prototype-source" className="prototype-source"><summary>来源与范围</summary>{selected.file.project}/{selected.file.change} · {selected.file.path}<p>关键页面的预期效果；模拟操作仅影响本次演示。</p></details>}
    {!!selected?.scene.states.length && <Select aria-label="关键状态" value={effectiveState} onChange={value => { setState(value); setPosition(undefined); }} options={[{value:'',label:'默认状态'},...selected.scene.states.map(item => ({value:item.id,label:item.title}))]} />}
    <div className={`prototype-reading-layout${notes.open && notes.pinned ? ' has-notes' : ''}`}>
      <div className="prototype-canvas">{selected && src ? <div className="prototype-viewport"><iframe key={fileKey} ref={frameRef} id="task-prototype-frame" title={selected.scene.title} sandbox="allow-scripts" referrerPolicy="no-referrer" src={src} onLoad={() => { if(loaded.current)return; nonce.current ||= crypto.randomUUID(); loaded.current = true; send(); }} /></div> : <p id="task-prototype-empty">{loading ? '正在读取原型…' : '暂无可查看的界面原型。'}</p>}</div>
      <SideReadingPanel id="prototype-notes" title="功能说明" open={notes.open} pinned={notes.pinned} canPin={notes.canPin} onTogglePin={notes.togglePin} onClose={closeNotes} onPointerEnter={event => notes.enter('panel',event.pointerType)} onPointerLeave={event => notes.exit('panel',event.pointerType)} onFocusCapture={notes.cancel} onBlurCapture={notes.leave}>
        <PrototypeFeatureNotes notes={currentNotes} activePosition={position} onHighlight={highlight} />
      </SideReadingPanel>
    </div>
    {!!data?.diagnostics.length && <details id="task-prototype-diagnostics"><summary>部分内容读取提示</summary>{data.diagnostics.map((item,i) => <p key={i}>{item.path}：{item.message}</p>)}</details>}
  </section>;
}
