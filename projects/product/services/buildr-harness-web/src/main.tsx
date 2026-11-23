import {lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {App as AntdApp,ConfigProvider} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import {softProductTheme} from './index';
import {HarnessApp} from './HarnessApp';
import type {DirectoryReveal} from './features/directory-workbench/HarnessDirectoryWorkbench';
import {desktopNotify,desktopPage,DesktopNavigation,type DesktopTool} from './dsh-desktop';
import './styles.css';

const DirectoryWorkbench=lazy(async()=>({default:(await import('./features/directory-workbench/HarnessDirectoryWorkbench')).HarnessDirectoryWorkbench}));

function ToolPage({workspaceId,module}:{workspaceId:string;module:DesktopTool}) {
  const [reveal,setReveal]=useState<DirectoryReveal>();
  useEffect(()=>{
    const receive=(event:Event)=>{
      const file=(event as CustomEvent).detail?.reveal as DirectoryReveal | undefined;
      if(module==='explorer'&&file?.workspaceId===workspaceId)setReveal(file);
    };
    window.addEventListener('buildr-dsh-host',receive);
    desktopNotify({kind:'tool-ready'});
    return()=>window.removeEventListener('buildr-dsh-host',receive);
  },[workspaceId,module]);
  return <div className="harness-dsh-tool"><Suspense fallback={null}><DirectoryWorkbench workspaceId={workspaceId} module={module} reveal={reveal} onDirectoryAdded={()=>{}}/></Suspense></div>;
}

let mounted: ReturnType<typeof createRoot> | undefined;
async function boot(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  const ticket=fragment.get('ticket');
  const page=desktopPage(fragment.toString());
  const clean=page?'#'+new URLSearchParams(page.kind==='chat'?{dsh:page.kind}:{dsh:page.kind,workspace:page.workspaceId}):'';
  if(ticket){history.replaceState(null,'','/'+clean);const response=await fetch('/session/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket})});if(!response.ok)throw new Error('登录票据已失效，请重新从 Harness 启动器打开；草稿仍保留。');location.reload();return;}
  const root=document.getElementById('root');if(!root)throw new Error('缺少 #root');
  (mounted??=createRoot(root)).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><AntdApp>{page&&<DesktopNavigation/>}{!page||page.kind==='chat'?<HarnessApp desktop={page?.kind==='chat'}/>:<ToolPage workspaceId={page.workspaceId} module={page.kind}/>}</AntdApp></ConfigProvider>);
}
const start=()=>void boot().catch(error=>{const root=document.getElementById('root');if(root)root.textContent=error instanceof Error?error.message:'Harness 网页未就绪。';});
// Reopening an explicit login URL in this tab can be a same-document hash
// navigation. Consume that new one-use ticket too; never replay failed writes.
window.addEventListener('hashchange',()=>{
  const state=new URLSearchParams(location.hash.slice(1));
  if(state.has('ticket')||desktopPage(state.toString()))start();
});
start();
