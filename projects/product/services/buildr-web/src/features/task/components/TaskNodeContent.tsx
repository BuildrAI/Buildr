import { prototypeEntries, prototypeSourceLabel, type UiPrototypeData } from './prototype-content';
import type { ReactNode } from 'react';
import { Alert, Menu, Spin, type MenuProps } from 'antd';
import type { TaskRecord } from '../../../../build/generated/task-dto';
import type { ReviewsResponse, VerificationResponse } from '../../../../build/generated/task-professional-http-dto';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import { reviewRecords, taskDocumentLabel, taskDocumentTarget, type TaskDocumentItem, type TaskNodeStage, type TaskReadTarget } from './taskWorkContent';

type ContentOption = { key: string; label: ReactNode; target: TaskReadTarget; group?: string; path?: string };
export function TaskNodeContent({ selected, record, documents, briefs, briefsLoading = false, reviews, verification, reviewError, verificationError, reviewLoading, verificationLoading, prototypeData, prototypeError, choices, onChoose, renderContent, hasRetrospective, hasCoordination, materialsLoading, materialsError, materialDiagnostics = [] }: {
  selected: TaskNodeStage; record: TaskRecord; documents: TaskDocumentItem[]; briefs: TaskBriefState[]; briefsLoading?: boolean;
  reviews: ReviewsResponse | null; verification: VerificationResponse | null; reviewError: string | null; verificationError: string | null; reviewLoading: boolean; verificationLoading: boolean;
  prototypeData: UiPrototypeData | null; prototypeError: string | null; choices: Record<string, string>; onChoose(key: string, value: string): void;
  hasRetrospective: boolean; hasCoordination: boolean; renderContent(target: TaskReadTarget): ReactNode;
  materialsLoading?: boolean; materialsError?: string | null; materialDiagnostics?: Array<{ code: string; message: string }>;
}) {
  if (selected === 'requirements') return <section id="task-node-content" className="task-node-content" aria-label="所选节点内容"><div className="task-node-reading">{renderContent({ kind: 'brief', title: '任务说明' })}</div></section>;
  const entries = documents.filter(item => item.stage === selected && item.purpose !== 'checklist');
  const auxiliary: ContentOption[] = [];
  const options: ContentOption[] = [];
  entries.forEach(item => {
    const spec = item.title.startsWith('规范 · ');
    const name = spec ? (item.artifact.capability || item.title.slice(5)) : taskDocumentLabel(item,entries);
    const duplicate = entries.filter(peer=>peer.title===item.title).length > 1;
    if (selected === 'design' && item.purpose === 'change-brief') {
      auxiliary.push({key:item.key, group:'关联变更说明', label:<span className="task-directory-label" title={item.title}>{item.changeKey}</span>, path:item.artifact.path, target:taskDocumentTarget(item)});
    } else options.push({key:item.key, group:spec ? '规范' : undefined, label:<span className="task-directory-label" title={taskDocumentLabel(item,entries)}>{name}{(spec && duplicate) && <small>{item.changeKey}</small>}</span>, path:item.artifact.path, target:taskDocumentTarget(item)});
  });
  if (selected === 'design') prototypeEntries(prototypeData).forEach(entry => options.push({key:`prototype:${entry.key}`,group:'界面原型',label:<span className="task-directory-label">{entry.scene.title}{(prototypeData?.prototypes.length || 0) > 1 && <small>{prototypeSourceLabel(entry.file)}</small>}</span>,target:{kind:'prototype',title:entry.scene.title,prototypeKey:entry.key}}));
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
    // 常驻「用户确认」目录项已移除：验收入口由后续真实设计决定，当前收尾只展示交付结果与适用内容。
    options.push({key:'result',label:'交付结果',target:{kind:'result',title:'交付结果'}});
    if (hasCoordination) options.push({key:'coordination',label:'子任务交付',target:{kind:'coordination',title:'子任务交付'}});
    if (hasRetrospective) options.push({key:'retrospective',label:'任务复盘',target:{kind:'retrospective',title:'任务复盘'}});
  }
  options.push(...auxiliary);
  const missingPrototype = selected === 'design' && choices[selected]?.startsWith('prototype:') && !options.some(item => item.key === choices[selected]);
  const active = options.find(item => item.key === choices[selected]) || (missingPrototype ? options.find(item => item.target.kind === 'prototype') : undefined) || (selected === 'closeout' && record.status === 'completed' ? options.find(item => item.key === 'result') : undefined) || (selected === 'implementation' && !entries.length && !reviews?.slots.completion.result && verification?.slot.report ? options.find(item => item.key === 'verification') : undefined) || options[0];
  const items: MenuProps['items'] = [];
  for (const option of options) {
    const item = {key:option.key,label:<span data-task-artifact={option.path} data-task-content={option.key === 'review' || option.key === 'verification' || option.key === 'intent' ? option.key : undefined} data-task-tab={option.target.kind === 'prototype' ? 'prototype' : undefined} data-task-closeout={selected === 'closeout' ? option.key : undefined}>{option.label}</span>};
    if (option.group) {
      let group = items.find(item => item && 'type' in item && item.type === 'group' && item.key === option.group) as {type:'group';key:string;label:string;children:typeof item[]} | undefined;
      if (!group) { group = {type:'group',key:option.group,label:option.group,children:[]}; items.push(group); }
      group.children.push(item);
    } else items.push(item);
  }
  const readingEvidence = choices[selected]?.startsWith('review') || choices[selected] === 'verification' || choices[selected]?.startsWith('prototype:') || ['result', 'coordination', 'retrospective'].includes(choices[selected]);
  const waitingForBriefs = selected === 'design' && !choices[selected] && briefsLoading && !entries.length;
  const waitingForMaterials = materialsLoading && !readingEvidence && !entries.length;
  const loading = waitingForBriefs || waitingForMaterials || (active?.target.kind === 'review' ? reviewLoading && !reviews : active?.target.kind === 'verification' ? verificationLoading && !verification : false);
  const readingMaterial = active?.target.kind === 'material';
  const error = active?.target.kind === 'review' ? reviewError : active?.target.kind === 'verification' ? verificationError : active?.target.kind === 'prototype' ? prototypeError : null;
  const directory = options.length > 1 || selected === 'design' || selected === 'implementation' || selected === 'closeout';
  return <section id="task-node-content" className={`task-node-content${directory ? ' task-node-with-directory' : ''}`} aria-label="所选节点内容">
    {directory && <nav className="task-node-directory" aria-label="节点内容目录"><Menu mode="inline" selectedKeys={active ? [active.key] : []} items={items} onClick={({key}) => onChoose(selected,key)} /></nav>}
    <div className="task-node-reading">
      {missingPrototype && <Alert type="info" message="上次选择的原型页面已变化，已显示当前可用内容。" />}
      {error && <Alert type="warning" message={error} />}
      {materialsError && !readingMaterial && <Alert type="warning" message={`任务材料读取失败：${materialsError}`} description="请刷新任务后重试；未使用旧说明替代当前关联。" />}
      {materialDiagnostics.map((item, index) => <Alert key={`materials:${item.code}:${index}`} type="warning" message={item.message} />)}
      {selected === 'design' && !prototypeData?.prototypes.length && prototypeData?.diagnostics.map((item, index) => <Alert key={`prototype:${index}`} type="warning" message={item.message} />)}
      {selected === 'design' && briefs.map(item => item.kind === 'missing' ? <Alert key={item.key} type="warning" message={item.message} /> : item.kind === 'ready' && !item.change.brief.exists ? <Alert key={item.key} type="warning" message={`${item.key} 的变更说明当前缺失。`} /> : null)}
      {loading ? <div className="task-content-loading"><Spin size="small" /> 正在读取内容…</div> : active ? renderContent(active.target) : <p className="task-node-empty">暂无内容。</p>}
    </div>
  </section>;
}
