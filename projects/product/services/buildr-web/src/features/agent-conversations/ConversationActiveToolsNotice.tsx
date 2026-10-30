import { useId, useState } from 'react';
import { Button } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { canStopConversationTool } from './conversation-state';
import type { ConversationRun } from './types';

type Props = {
  tools: ConversationRun['tools'];
  diagnostic?: string;
  observing: boolean;
  stopping: boolean;
  onObserve(): void;
  onStop(toolId?: string): void;
};

/** Model output ending is not proof that its commands have exited. */
export function ConversationActiveToolsNotice({tools,diagnostic,observing,stopping,onObserve,onStop}: Props) {
  const active=tools.filter(tool=>tool.status!=='completed');
  const [expanded,setExpanded]=useState(false),detailsId=useId();
  return <section className="ac-active-tools" data-run-status="tools-active" aria-label="尚未结束的命令">
    <div className="ac-active-tools-summary">
      <span className="ac-active-tools-title" role="status"><ClockCircleOutlined aria-hidden/>{active.length?`仍有 ${active.length} 项命令未结束`:'命令结束状态待确认'}</span>
      <div className="ac-active-tools-actions">
        {active.length>0&&<Button type="text" size="small" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(value=>!value)}>{expanded?'收起命令':'查看命令'}</Button>}
        <Button type="text" size="small" loading={observing} disabled={stopping} onClick={onObserve}>核对状态</Button>
        <Button type="text" size="small" aria-label="停止剩余执行" loading={stopping} disabled={stopping} onClick={()=>onStop()}>{stopping?'正在停止…':'停止剩余执行'}</Button>
      </div>
    </div>
    {expanded&&<div id={detailsId} className="ac-active-tools-list">
      {active.map((tool,index)=><article className="ac-active-tool" key={tool.id}>
        <header><strong>命令 {index+1}</strong><small>{tool.status==='unknown'?'状态待确认':'运行中'}</small>
          {canStopConversationTool(tool)?<Button type="text" size="small" loading={stopping} disabled={stopping} onClick={()=>onStop(tool.id)}>停止此命令</Button>:<small className="ac-active-tool-unsupported">不支持单独停止</small>}
        </header>
        <pre>{tool.label}</pre>
      </article>)}
    </div>}
    {diagnostic&&<details className="ac-active-tools-diagnostic"><summary>查看原因</summary><p>{diagnostic}</p></details>}
  </section>;
}
