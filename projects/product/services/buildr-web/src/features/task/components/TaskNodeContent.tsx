import type { ReactNode } from 'react';
import { Alert, Menu, Spin, type MenuProps } from 'antd';
import type { TaskRecord } from '../../../../build/generated/task-dto';
import type { ReviewsResponse, VerificationResponse } from '../../../../build/generated/task-professional-http-dto';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import { reviewRecords, taskDocumentLabel, type TaskDocumentItem, type TaskNodeStage, type TaskReadTarget } from './taskWorkContent';

type ContentOption = { key: string; label: ReactNode; target: TaskReadTarget; group?: string; path?: string };
export function TaskNodeContent({ selected, record, documents, briefs, reviews, verification, reviewError, verificationError, reviewLoading, verificationLoading, prototypeCount, prototypeError, choices, onChoose, renderContent, hasRetrospective, hasCoordination }: {
  selected: TaskNodeStage; record: TaskRecord; documents: TaskDocumentItem[]; briefs: TaskBriefState[];
  reviews: ReviewsResponse | null; verification: VerificationResponse | null; reviewError: string | null; verificationError: string | null; reviewLoading: boolean; verificationLoading: boolean;
  prototypeCount: number; prototypeError: string | null; choices: Record<string, string>; onChoose(key: string, value: string): void;
  hasRetrospective: boolean; hasCoordination: boolean; renderContent(target: TaskReadTarget): ReactNode;
}) {
  const entries = documents.filter(item => item.stage === selected && selected !== 'implementation');
  const options: ContentOption[] = entries.map(item => {
    const spec = item.title.startsWith('规范 · ');
    const name = spec ? (item.artifact.capability || item.title.slice(5)) : taskDocumentLabel(item,entries);
    const duplicate = entries.filter(peer=>peer.title===item.title).length > 1;
    return {key:item.key, group:spec ? '规范' : undefined, label:<span className="task-directory-label" title={taskDocumentLabel(item,entries)}>{name}{spec && duplicate && <small>{item.changeKey}</small>}</span>, path:item.artifact.path, target:{kind:'artifact',title:item.title,changeKey:item.changeKey,path:item.artifact.path}};
  });
  if (selected === 'design' && prototypeCount) options.push({key:'prototype',label:'界面原型',target:{kind:'prototype',title:'界面原型'}});
  if (selected === 'design' || selected === 'implementation') {
    const reviewType = selected === 'design' ? 'planning' : 'completion';
    const title = selected === 'design' ? '方案审查' : '实现审查';
    const records = reviewRecords(reviews?.slots[reviewType]);
    if (!records.length) options.push({key:'review',group:title,label:'暂无记录',target:{kind:'review',title,reviewType,digest:''}});
    [...records].reverse().forEach((entry,index) => options.push({
      key:index === 0 ? 'review' : `review:${entry.resultDigest}`, group:title,
      label:<span className="task-review-nav-label"><span>第 {records.length-index} 次<span className={entry.result.conclusion.outcome === 'accepted' ? 'task-review-outcome accepted' : 'task-review-outcome'}>{entry.result.conclusion.outcome === 'accepted' ? '通过' : '需修改'}</span></span><small>{new Date(entry.result.completedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}{index === 0 ? ' · 最新' : ''}</small></span>,
      target:{kind:'review',title,reviewType,digest:entry.resultDigest},
    }));
    if (selected === 'implementation') options.push({key:'verification',label:'开发验证',target:{kind:'verification',title:'开发验证'}});
  }
  if (selected === 'closeout') {
    options.push({key:'acceptance',label:'用户确认',target:{kind:'acceptance',title:'用户确认'}},{key:'result',label:'交付结果',target:{kind:'result',title:'交付结果'}});
    if (hasCoordination) options.push({key:'coordination',label:'子任务交付',target:{kind:'coordination',title:'子任务交付'}});
    if (hasRetrospective) options.push({key:'retrospective',label:'任务复盘',target:{kind:'retrospective',title:'任务复盘'}});
  }
  const active = options.find(item => item.key === choices[selected]) || (selected === 'closeout' && record.status === 'completed' ? options.find(item => item.key === 'result') : undefined) || options[0];
  const items: MenuProps['items'] = [];
  for (const option of options) {
    const item = {key:option.key,label:<span data-task-artifact={option.path} data-task-content={option.key === 'review' || option.key === 'verification' ? option.key : undefined} data-task-tab={option.key === 'prototype' ? 'prototype' : undefined} data-task-closeout={selected === 'closeout' ? option.key : undefined}>{option.label}</span>};
    if (option.group) {
      let group = items.find(item => item && 'type' in item && item.type === 'group' && item.key === option.group) as {type:'group';key:string;label:string;children:typeof item[]} | undefined;
      if (!group) { group = {type:'group',key:option.group,label:option.group,children:[]}; items.push(group); }
      group.children.push(item);
    } else items.push(item);
  }
  const loading = active?.target.kind === 'review' ? reviewLoading && !reviews : active?.target.kind === 'verification' ? verificationLoading && !verification : selected !== 'closeout' && selected !== 'implementation' && record.changes.length > 0 && briefs.length === 0;
  const error = active?.target.kind === 'review' ? reviewError : active?.target.kind === 'verification' ? verificationError : active?.target.kind === 'prototype' ? prototypeError : null;
  const directory = options.length > 1 || selected === 'design' || selected === 'implementation' || selected === 'closeout';
  return <section id="task-node-content" className={`task-node-content${directory ? ' task-node-with-directory' : ''}`} aria-label="所选节点内容">
    {directory && <nav className="task-node-directory" aria-label="节点内容目录"><Menu mode="inline" selectedKeys={active ? [active.key] : []} items={items} onClick={({key}) => onChoose(selected,key)} /></nav>}
    <div className="task-node-reading">
      {error && <Alert type="warning" message={error} />}
      {selected !== 'closeout' && selected !== 'implementation' && briefs.map(item => item.kind === 'missing' ? <Alert key={item.key} type="warning" message={item.message} /> : null)}
      {loading ? <div className="task-content-loading"><Spin size="small" /> 正在读取内容…</div> : active ? renderContent(active.target) : <p className="task-node-empty">{selected === 'requirements' ? '暂无补充需求或说明。' : '暂无内容。'}</p>}
    </div>
  </section>;
}
