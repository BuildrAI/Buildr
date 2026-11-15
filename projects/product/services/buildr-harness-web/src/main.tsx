import {createRoot} from 'react-dom/client';
import {App as AntdApp,ConfigProvider} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {softProductTheme} from '@buildr-ai/buildr-harness-ui';
import {HarnessApp} from './HarnessApp';
import 'antd/dist/reset.css';
import './styles.css';

async function boot(){
  const ticket=new URLSearchParams(location.hash.slice(1)).get('ticket');
  if(ticket){history.replaceState(null,'','/');const response=await fetch('/session/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket})});if(!response.ok)throw new Error('登录票据已失效，请重新从 Harness 启动器打开；草稿仍保留。');location.replace('/');return;}
  const root=document.getElementById('root');if(!root)throw new Error('缺少 #root');
  createRoot(root).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><AntdApp><HarnessApp/></AntdApp></ConfigProvider>);
}
const start=()=>void boot().catch(error=>{const root=document.getElementById('root');if(root)root.textContent=error instanceof Error?error.message:'Harness 网页未就绪。';});
// Reopening an explicit login URL in this tab can be a same-document hash
// navigation. Consume that new one-use ticket too; never replay failed writes.
window.addEventListener('hashchange',()=>{
  if(new URLSearchParams(location.hash.slice(1)).has('ticket'))start();
});
start();
