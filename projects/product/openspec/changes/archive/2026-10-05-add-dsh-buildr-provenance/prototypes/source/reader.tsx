import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {App,ConfigProvider} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {PrototypeReaderLayout} from '/Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/buildr-web/src/features/task/components/PrototypeReaderLayout';
import {PrototypeTab} from '/Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/buildr-web/src/features/task/components/PrototypeTab';
import {prototypeEntries} from '/Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/buildr-web/src/features/task/components/prototype-content';
import {softProductTheme} from '/Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/buildr-web/src/theme';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '/Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/buildr-web/src/styles.css';
const sceneHtml=__SCENE_HTML__;
const data:any={taskId:'dsh-buildr-provenance',prototypes:[{id:'discussion',source:'task',project:null,change:null,lifecycle:null,provenance:'local',path:'buildr-source.html',title:'DSH 来源与内容对象',sizeBytes:sceneHtml.length,updatedAt:'discussion',metadata:scenes}],diagnostics:[]};
function Reader(){const entries=prototypeEntries(data),[selected,setSelected]=useState(entries[0]?.key);return <PrototypeReaderLayout entries={entries} selectedKey={selected} onSelect={setSelected}><PrototypeTab active standalone workspaceId="demo" data={data} loading={false} error={null} onRefresh={()=>{}} selectedKey={selected} onSelect={setSelected} documentHtml={sceneHtml}/></PrototypeReaderLayout>;}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><Reader/></App></ConfigProvider>);
