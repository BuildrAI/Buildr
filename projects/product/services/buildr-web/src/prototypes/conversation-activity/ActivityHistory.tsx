import { useState } from 'react';
import { ExecutionStats, type ExecutionFilter, type StatsStatus } from './ExecutionStats';
import { Alert, Button, Empty, Input, Select } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { compareConversations, isActive, matchesExecutionFilter, type DemoConversation } from './fixtures';
import { ActivityStatus } from './ActivityStatus';

type Props={statsStatus?:StatsStatus;rows:DemoConversation[];workspace:string;query:string;hidden:boolean;error:boolean;selected:string|null;onWorkspace(value:string):void;onQuery(value:string):void;onHidden():void;onRetry():void;onBack():void;onCreate():void;onOpen(row:DemoConversation):void};
export function ActivityHistory(props:Props) {
  const {workspace,rows,query,hidden,error}=props;
  const [executionFilter,setExecutionFilter]=useState<ExecutionFilter>(null);
  const inScope=rows.filter(row=>workspace==='全部工作空间'||row.workspace===workspace);
  const scoped=inScope.filter(row=>row.title.includes(query)&&matchesExecutionFilter(row,executionFilter));
  const active=scoped.filter(isActive).sort(compareConversations);
  const recent=scoped.filter(row=>!isActive(row)&&Boolean(row.hidden)===hidden).sort(compareConversations);
  const visible=[...active,...recent];
  const rowButton=(row:DemoConversation)=><button key={row.id} data-conversation-id={row.id} className={props.selected===row.id?'is-selected':''} onClick={()=>props.onOpen(row)}>
    <div className="ca-row-heading"><strong title={row.title}>{row.title}</strong><ActivityStatus row={row}/></div>
    <small><span className="ac-history-id" title={row.id}>ID {row.id}</span><span className="ac-history-meta">{workspace==='全部工作空间'?row.workspace+' · ':''}{row.status==='running'?row.agent+' · '+row.model+' · ':''}{row.time>=25?'刚刚':row.time>=19?'1 分钟前':row.time>=15?'8 分钟前':'今天 15:48'} · 普通对话</span></small>
  </button>;
  return <section className="ac-history ca-history" aria-label="对话列表">
    <header className="ac-thread-header"><Button type="text" icon={<ArrowLeftOutlined/>} aria-label="返回工作页面" onClick={props.onBack}/><strong>对话列表</strong><Button type="text" icon={<PlusOutlined/>} aria-label="新建对话" onClick={props.onCreate}/></header>
    <div className="ac-history-body">
      <div className="ac-history-toolbar" data-prototype-position="history-filter">
        <Input allowClear prefix={<SearchOutlined/>} aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={event=>props.onQuery(event.target.value)}/>
        <Select aria-label="对话列表工作空间" value={workspace} options={['全部工作空间','Buildr','业务平台'].map(value=>({value,label:value}))} onChange={value=>{setExecutionFilter(null);props.onWorkspace(value);}}/>
      </div>
      <ExecutionStats rows={inScope} filter={executionFilter} onFilter={setExecutionFilter} status={props.statsStatus??(error?'error':'ready')}/>

      <div data-prototype-position="history-list">
        {error&&<Alert type="warning" showIcon message="暂时无法更新，以下为上次读取的对话。" action={<Button size="small" onClick={props.onRetry}>重试</Button>}/>}
        {active.length>0&&<section className="ca-active-section" aria-label="活动中的对话" data-prototype-position="history-active">
          <div className="ca-group-heading"><strong>活动中的对话</strong><small>{active.length}</small></div><div className="ac-history-list ca-history-list">{active.map(rowButton)}</div>
        </section>}
        <section className="ca-recent-section" aria-label={hidden?'已隐藏的对话':'其他对话'} hidden={Boolean(executionFilter)}>
          <div className="ca-group-heading"><span>{hidden?'已隐藏的对话':'其他对话'}</span><small>{recent.length}</small><Button type="text" size="small" onClick={props.onHidden}>{hidden?'返回最近':'查看隐藏'}</Button></div>
          <div className="ac-history-list ca-history-list">{recent.map(rowButton)}</div>
        </section>
        {!visible.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query||executionFilter?'没有匹配的对话':'这里还没有对话'}>{query&&<Button onClick={()=>props.onQuery('')}>清除搜索</Button>}</Empty>}
      </div>
    </div>
  </section>;
}
