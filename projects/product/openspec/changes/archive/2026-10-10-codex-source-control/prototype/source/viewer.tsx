import {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Alert,App,ConfigProvider,Spin} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {PrototypeTab} from 'buildr-web-source/src/features/task/components/PrototypeTab';
import {PrototypeReaderLayout} from 'buildr-web-source/src/features/task/components/PrototypeReaderLayout';
import {prototypeEntries,type UiPrototypeData} from 'buildr-web-source/src/features/task/components/prototype-content';
import {softProductTheme} from 'buildr-web-source/src/theme';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import 'buildr-web-source/src/styles.css';
declare const __PROTOTYPE_DOCUMENT_GZIP__:string;
declare const __PROTOTYPE_DOCUMENT_BYTES__:number;
declare const __PROTOTYPE_OBSERVED_AT__:string;
function Viewer(){
 const [selectedKey,setSelectedKey]=useState('codex-message:commit-message'),[revision,setRevision]=useState(0);
 const [html,setHtml]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{const bytes=Uint8Array.from(atob(__PROTOTYPE_DOCUMENT_GZIP__),character=>character.charCodeAt(0));void new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(setHtml).catch(()=>setError('原型读取失败，请直接打开原型正文。'));},[]);
 const data=useMemo<UiPrototypeData>(()=>({taskId:'prototype-codex-message',prototypes:[{id:'codex-message',source:'task',project:null,change:null,lifecycle:null,provenance:'task-local',path:'临时讨论原型 · 尚未归入任务',title:'Codex · 生成提交说明',sizeBytes:__PROTOTYPE_DOCUMENT_BYTES__,updatedAt:__PROTOTYPE_OBSERVED_AT__+':'+revision,metadata:{version:1,pages:scenes.pages}}],diagnostics:[]}),[revision]);
 return <PrototypeReaderLayout entries={prototypeEntries(data)} selectedKey={selectedKey} onSelect={setSelectedKey}>{error?<Alert type="error" message={error}/>:html===null?<Spin/>:<PrototypeTab active standalone workspaceId={null} data={data} documentHtml={html} loading={false} error={null} onRefresh={()=>setRevision(value=>value+1)} selectedKey={selectedKey} onSelect={setSelectedKey}/>}</PrototypeReaderLayout>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><Viewer/></App></ConfigProvider>);
