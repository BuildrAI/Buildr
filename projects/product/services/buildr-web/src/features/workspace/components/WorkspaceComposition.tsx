import { useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Select } from 'antd';
import { AppstoreOutlined, BranchesOutlined, FolderOutlined, SearchOutlined } from '@ant-design/icons';
import './workspace-composition.css';
import { compositionWithReferences, type CompositionData } from './composition-data';
export type { CompositionData } from './composition-data';
type Kind = 'project'|'service'|'repository';
type Props = { data:CompositionData;projectId?:string;onOpen(kind:Kind,id:string):void;error?:string;onRetry?():void };
type Edge = { from:string;to:string;path:string;repository:boolean };
export function WorkspaceComposition({data:input,projectId,onOpen,error,onRetry}:Props) {
  const root = useRef<HTMLDivElement>(null), [edges,setEdges] = useState<Edge[]>([]);
  const [query,setQuery] = useState(''),[focusProject,setFocusProject] = useState(''),[hovered,setHovered] = useState<string|null>(null);
  const data=compositionWithReferences(input);
  const scope=projectId || (data.projects.some(p=>p.id===focusProject)?focusProject:'');
  const projects = data.projects.filter(p => !scope || p.id === scope);
  const services = data.services.filter(s => !scope || projects.some(p => p.serviceIds?.includes(s.id)));
  const repositories = data.repositories.filter(r => !scope || services.some(s => s.repositoryId === r.id));
  const columns = [{kind:'project' as const,source:'projects' as const,title:'项目',hint:'业务目标与用途',items:projects,icon:<FolderOutlined />},{kind:'service' as const,source:'services' as const,title:'服务',hint:'承担实现的部分',items:services,icon:<AppstoreOutlined />},{kind:'repository' as const,source:'repositories' as const,title:'代码库',hint:'代码所在的位置',items:repositories,icon:<BranchesOutlined />}];
  const related = (key:string) => {
    const result=new Set([key]);
    const [kind,id]=key.split(':');
    const linkedServices=kind==='project'?services.filter(s=>projects.find(p=>p.id===id)?.serviceIds?.includes(s.id)):kind==='repository'?services.filter(s=>s.repositoryId===id):services.filter(s=>s.id===id);
    for(const service of linkedServices) {
      result.add(`service:${service.id}`);
      if(service.repositoryId)result.add(`repository:${service.repositoryId}`);
      if(kind!=='project')projects.filter(p=>p.serviceIds?.includes(service.id)).forEach(p=>result.add(`project:${p.id}`));
    }
    return result;
  };
  const normalized=query.trim().toLocaleLowerCase();
  const matches=columns.flatMap(c=>c.items.filter(o=>`${o.name} ${o.description || ''} ${o.code}`.toLocaleLowerCase().includes(normalized)).map(o=>`${c.kind}:${o.id}`));
  const emphasis=hovered?related(hovered):normalized?new Set(matches.flatMap(key=>[...related(key)])):null;
  const noMatch=Boolean(normalized&&!matches.length);
  useLayoutEffect(() => {
    const node=root.current; if(!node)return;
    const draw=()=>{
      const bounds=node.getBoundingClientRect();
      const nodes=new Map([...node.querySelectorAll<HTMLElement>('[data-composition-id]')].map(n=>[n.dataset.compositionId!,n]));
      const next:Edge[]=[];
      const connect=(from:string,to:string,repository=false)=>{
        const a=nodes.get(from)?.getBoundingClientRect(),b=nodes.get(to)?.getBoundingClientRect();if(!a||!b)return;
        const x=a.right-bounds.left,y=a.top+a.height/2-bounds.top,u=b.left-bounds.left,v=b.top+b.height/2-bounds.top;
        next.push({from,to,repository,path:`M${x},${y} C${(x+u)/2},${y} ${(x+u)/2},${v} ${u},${v}`});
      };
      projects.forEach(p=>p.serviceIds?.forEach(id=>connect(`project:${p.id}`,`service:${id}`)));
      services.forEach(s=>{if(s.repositoryId)connect(`service:${s.id}`,`repository:${s.repositoryId}`,true);});
      setEdges(next);
    };
    const observer=new ResizeObserver(draw);observer.observe(node);draw();return()=>observer.disconnect();
  },[input,scope,noMatch]);
  return <section className="workspace-composition" id="workspace-composition" data-prototype-position="composition">
    <div className="composition-toolbar" data-prototype-position="composition-filter">
      <Input allowClear prefix={<SearchOutlined />} aria-label="搜索名称或用途" placeholder="搜索名称或用途" value={query} onChange={e=>setQuery(e.target.value)} />
      {!projectId&&<Select aria-label="聚焦项目" value={focusProject} onChange={setFocusProject} options={[{value:'',label:'全部项目'},...data.projects.map(p=>({value:p.id,label:p.name}))]} />}
      {focusProject&&<Button type="text" onClick={()=>setFocusProject('')}>取消聚焦</Button>}
    </div>
    {error && <Alert type="warning" message={error} action={onRetry && <Button onClick={onRetry}>重试</Button>} />}
    {noMatch?<Empty description="没有匹配的内容"><Button onClick={()=>setQuery('')}>清除搜索</Button></Empty>:!projects.length&&!services.length&&!repositories.length&&!error ? <Empty description="还没有登记项目、服务或代码库" /> : <div className="composition-scroll"><div className="composition-grid" ref={root}>
      <svg className="composition-links" aria-hidden="true">{edges.map(edge=><path key={edge.from+edge.to} className={`${edge.repository?'repository-link':''} ${emphasis?(emphasis.has(edge.from)&&emphasis.has(edge.to)?'emphasized':'dim'):''}`} d={edge.path} />)}</svg>
      {columns.map(col=><section className="composition-column" data-prototype-position={`${col.kind}-column`} key={col.kind}>
        <h2>{col.title}<span>{data.sources?.[col.source]&&data.sources[col.source]!=='complete'?'部分已读取':col.items.filter(item=>!item.unavailable).length}</span><small>{col.hint}</small></h2>
        {col.items.map(item=>{
          const key=`${col.kind}:${item.id}`;
          const count=col.kind==='service'?data.projects.filter(p=>p.serviceIds?.includes(item.id)).length:col.kind==='repository'?data.services.filter(s=>s.repositoryId===item.id).length:0;
          const references = col.kind === 'project'
            ? [{ label:'引用服务', names:services.filter(s=>data.projects.find(p=>p.id===item.id)?.serviceIds?.includes(s.id)).map(s=>s.name) }]
            : col.kind === 'service'
              ? [{ label:'被项目引用', names:projects.filter(p=>p.serviceIds?.includes(item.id)).map(p=>p.name) }, { label:'代码库', names:repositories.filter(r=>r.id===data.services.find(s=>s.id===item.id)?.repositoryId).map(r=>r.name) }]
              : [{ label:'被服务引用', names:services.filter(s=>s.repositoryId===item.id).map(s=>s.name) }];
          return <button type="button" className={`composition-node${emphasis&&!emphasis.has(key)?' dim':''}${hovered===key?' selected':''}`} data-composition-id={key} key={item.id}
            onPointerEnter={()=>setHovered(key)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(key)} onBlur={()=>setHovered(null)}
            disabled={item.unavailable} onClick={()=>onOpen(col.kind,item.id)} aria-label={`${item.name}，${col.kind==='project'?'查看项目组成':'查看详情'}`}>
            <span>{col.icon}<strong>{item.name}</strong><span className="composition-open">→</span></span><p>{item.description || item.code}</p>
            <span className="composition-references">{references.filter(r=>r.names.length).map(r=><span key={r.label}><b>{r.label}</b>{r.names.join('、')}</span>)}</span>
            {col.kind==='project'&&<small>查看项目组成</small>}
            {count>1&&<small>{data.sources?.[col.kind==='service'?'projects':'services']&&data.sources[col.kind==='service'?'projects':'services']!=='complete'?'至少 ':''}{count} 个{col.kind==='service'?'项目':'服务'}共用</small>}
            {col.kind==='service'&&!item.unavailable&&count===0&&(!data.sources||data.sources.projects==='complete')&&<small>尚未被项目引用</small>}
          </button>;
        })}
        {!col.items.length&&<p className="composition-empty">{data.sources?.[col.source]&&data.sources[col.source]!=='complete'?'此部分信息尚未完整读取':'暂无登记'}</p>}
      </section>)}
    </div></div>}
    <div className="composition-caption"><span><i />项目引用服务</span><span><i className="repository-link" />服务引用代码库</span><small><span className="composition-desktop-hint">悬停查看关联 · </span>点击进入对象</small></div>
  </section>;
}
