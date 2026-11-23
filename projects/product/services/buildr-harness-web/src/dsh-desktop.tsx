import {useEffect,useState} from 'react';
import {Alert,Button} from 'antd';

export type DesktopTool = 'explorer' | 'source-control';
const CHANNEL = 'buildr-harness-desktop/v1:';
export function desktopNotify(data: object) { console.info(CHANNEL+JSON.stringify(data)); }
export function desktopPage(search: string): {kind:'chat'} | {kind:DesktopTool;workspaceId:string} | undefined {
  const query=new URLSearchParams(search), kind=query.get('dsh');
  if(kind==='chat')return {kind};
  const workspaceId=query.get('workspace');
  if((kind==='explorer'||kind==='source-control')&&workspaceId&&workspaceId.length<=1024)return {kind,workspaceId};
}

/** Only app-rendered, opted-in links from real user clicks enter the host bridge. */
export function DesktopNavigation() {
  const [fallback,setFallback]=useState<string>();
  useEffect(()=>{
    const click=(event:MouseEvent)=>{
      if(!event.isTrusted||event.defaultPrevented||event.button!==0||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[data-harness-web-link][href]'):null;
      if(!link||link.hasAttribute('download'))return;
      const url=new URL(link.href);
      if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.origin===location.origin)return;
      event.preventDefault(); setFallback(undefined); desktopNotify({kind:'link',url:url.href});
    };
    const host=(event:Event)=>{
      const value=(event as CustomEvent).detail?.fallback;
      if(typeof value==='string')setFallback(value);
    };
    document.addEventListener('click',click);
    window.addEventListener('buildr-dsh-host',host);
    return()=>{document.removeEventListener('click',click);window.removeEventListener('buildr-dsh-host',host);};
  },[]);
  return fallback ? <Alert className="harness-dsh-link-fallback" type="warning" showIcon closable onClose={()=>setFallback(undefined)}
    message="当前工作空间没有可用的 DSH 浏览器标签"
    action={<><Button size="small" onClick={()=>{desktopNotify({kind:'link',url:fallback,external:true});setFallback(undefined);}}>用默认浏览器打开</Button> <Button size="small" onClick={()=>void navigator.clipboard.writeText(fallback).catch(()=>{})}>复制链接</Button></>} /> : null;
}
