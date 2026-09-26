import { Alert, Button, Tag } from 'antd';
import type { TaskDetailResponse } from '../../../../build/generated/task-dto';
import type { TaskWorkContext } from '../../../../build/generated/workbench-dto';
import type { useTaskArtifacts } from '../hooks/useTaskArtifacts';
import type { useTaskEvidence } from '../hooks/useTaskEvidence';
import type { TaskReadTarget } from './taskWorkContent';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { formatDateTime, reviewMethodLabel } from '../../../lib/taskLabels';
import { reviewRecords, sourceLabel, taskStageLabels } from './taskWorkContent';
import { TaskArtifactReader } from './TaskArtifactReader';
import { TaskDocumentPreviewModal } from './TaskDocumentPreviewModal';
import { PrototypeTab } from './PrototypeTab';
import { ParentCoordinationPanel } from './ParentCoordinationPanel';
import { RetrospectiveDocumentCard } from './RetrospectiveDocumentCard';

function TextList({ title, items }: { title: string; items: string[] }) {
  return items.length ? <section className="task-reader-section"><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section> : null;
}
export function TaskReadingPane({ target, task, context, artifacts, evidence, workspaceId, href, onRead, onClose, onRespond, onRelativeLink, refreshTask, embedded = false, inDrawer = false, refreshToken = 0, onPrototypeSelect, onPrototypeNotesOpen, prototypeNotesCloseToken }: {
  onPrototypeSelect?(key:string):void; onPrototypeNotesOpen?():void; prototypeNotesCloseToken?:number;
  inDrawer?: boolean; embedded?: boolean; refreshToken?: number; target: TaskReadTarget | null; task: TaskDetailResponse; context?: TaskWorkContext | null;
  artifacts: ReturnType<typeof useTaskArtifacts>; evidence: ReturnType<typeof useTaskEvidence>; workspaceId: string | null;
  href(path: string): string; onRead(target: TaskReadTarget): void; onClose(): void; onRespond(): void; onRelativeLink(href: string): void; refreshTask(): Promise<void>;
}) {
  if (!target) return null;
  const record = task.record;
  if (target.kind === 'artifact') {
    const source = artifacts.briefs.find(item => item.kind === 'ready' && item.key === target.changeKey);
    if (!source || source.kind !== 'ready') return <Alert type="warning" message="当前材料不可读取，请刷新任务后重试。" />;
    return <div className="task-reader"><TaskArtifactReader embedded={embedded} sourceDescription={sourceLabel(source.provenance)} change={source.change} artifactPath={target.path} onClose={onClose} onProjectDocument={path => void artifacts.openChangeDocument(target.changeKey, path)} onSelect={path => onRead({ ...target, path, title: path.split('/').at(-1) || '文档' })} /></div>;
  }
  if (target.kind === 'document') return <div className="task-reader"><TaskDocumentPreviewModal embedded={inDrawer} reference={target.reference} refreshToken={refreshToken} onClose={onClose} loadDocument={artifacts.loadProjectDocument} /></div>;
  if (target.kind === 'prototype') return <div className="task-reader"><PrototypeTab selectedKey={target.prototypeKey} onSelect={onPrototypeSelect} onAuxiliaryOpen={onPrototypeNotesOpen} closeAuxiliaryToken={prototypeNotesCloseToken} active workspaceId={workspaceId} data={artifacts.prototypeData} error={artifacts.prototypeError} loading={artifacts.prototypeLoading} onRefresh={() => void artifacts.refreshPrototype()} /></div>;
  if (target.kind === 'retrospective') return <RetrospectiveDocumentCard taskId={record.taskId} recordDigest={task.recordDigest} reference={task.retrospectiveDocument} refreshToken={refreshToken} onRecordUpdated={refreshTask} inline />;
  if (target.kind === 'review') {
    const records = reviewRecords(evidence.reviewData?.slots[target.reviewType]);
    const entry = target.digest ? records.find(item => item.resultDigest === target.digest) : records.at(-1);
    if (!entry) return evidence.reviewError ? <Alert type="warning" message={evidence.reviewError} /> : <p className="task-node-empty">暂无审查记录。</p>;
    const result = entry.result;
    const latest = reviewRecords(evidence.reviewData?.slots[target.reviewType]).at(-1)?.resultDigest === entry.resultDigest;
    return <article className="task-reader" id="task-review-result">
      <div className="task-report-title">{!inDrawer && <h2>{target.title} · 第 {records.indexOf(entry) + 1} 次</h2>}<Tag color={result.conclusion.outcome === 'accepted' ? 'success' : 'warning'}>{result.conclusion.outcome === 'accepted' ? '通过' : '需修改'}</Tag></div><p className="task-report-meta">{latest ? '最近一次审查' : '历史审查'} · {formatDateTime(result.completedAt)} · {reviewMethodLabel(result.method)}</p>
      <p className="task-reader-conclusion">{result.conclusion.summary}</p>
      <TextList title="问题与发现" items={result.findings} />
      <TextList title="未覆盖" items={result.uncovered.map(item => `${item.subject}：${item.reason}`)} />
    </article>;
  }
  if (target.kind === 'verification') {
    const slot = evidence.verificationData?.slot;
    const report = slot?.report;
    if (evidence.verificationError) return <Alert type="warning" message={evidence.verificationError} />;
    if (!report) return <p className="task-node-empty">尚未保存验证结果。</p>;
    return <article className="task-reader" id="task-verification-result">
      <div className="task-report-title">{!inDrawer && <h2>开发验证</h2>}<Tag color={report.conclusion.outcome === 'passed' ? 'success' : report.conclusion.outcome === 'not-passed' ? 'error' : 'warning'}>{{ passed: '通过', 'not-passed': '未通过', incomplete: '未完成' }[report.conclusion.outcome]}</Tag></div><p className="task-report-meta">最近一次验证 · {formatDateTime(report.completedAt)}</p>
      <p className="task-reader-conclusion">{report.conclusion.summary}</p>
      {report.checks.length > 0 && <section className="task-report-section"><h3>检查明细</h3><div className="task-verification-checks">{report.checks.map((check,index) => {
        const repeated = report.checks.length === 1 && ((check.outcome === 'passed' && report.conclusion.outcome === 'passed') || (check.outcome === 'failed' && report.conclusion.outcome === 'not-passed'));
        return <section key={`${check.id}:${index}`}><div><strong>{check.targets.length ? check.targets.join('、') : check.testing}</strong>{!repeated && <span className={`task-check-outcome ${check.outcome}`}>{check.outcome === 'passed' ? '通过' : '未通过'}</span>}</div><p>{check.summary}</p>{record.scope.projects.length>1 && <small>{check.project}{check.service ? ` / ${check.service}` : ''}</small>}</section>;
      })}</div></section>}
      <section className="task-report-section task-verification-scope"><h3>范围说明</h3>
        <p>{report.content.summary}</p>
        {slot.applicability?.status !== 'current' && <p className="task-report-applicability">{slot.applicability?.status === 'stale' ? '报告依据已变化，需要重新核对适用范围。' : '当前内容版本尚未核对，请结合验证内容判断适用范围。'}</p>}
        {report.gaps.length > 0 && <div className="task-coverage-gaps"><span>未覆盖</span><ul>{report.gaps.map((gap,index)=><li key={index}>{gap.testing === 'project-testing-map' ? gap.reason.replace(/^Project /,'项目') : `${gap.testing}：${gap.reason}`}</li>)}</ul></div>}
      </section>
    </article>;
  }

  if (target.kind === 'intent') return <article className="task-reader"><h2>目标与说明</h2><MarkdownHost markdown={record.intent} className="markdown-body" options={{ allowRelativeLinks: true, onRelativeLinkClick: onRelativeLink }} /></article>;
  if (target.kind === 'context' || target.kind === 'acceptance') {
    const attention = target.kind === 'acceptance' && context?.attention?.kind !== 'acceptance' ? null : context?.attention;
    return <article className="task-reader"><h2>{target.title}</h2>{target.kind === 'acceptance' && attention && <p className="task-reader-origin">{attention.response ? '答复于' : '提出于'} {formatDateTime(attention.response?.recordedAt || attention.createdAt)}</p>}{target.kind === 'context' && <><p className="task-reader-origin">{context ? `更新于 ${formatDateTime(context.updatedAt)}` : '尚未记录'}</p><h3>当前节点</h3><p>{context?.stage ? taskStageLabels[context.stage].title : '未记录'}</p><h3>最近进展</h3><p>{context?.progress || '暂无进展'}</p><h3>下一步</h3><p>{context?.nextStep || '暂无下一步'}</p></>}{attention ? <section className="task-reader-section"><p>{attention.reason}</p>{attention.response ? <>{target.kind !== 'acceptance' && <p className="task-reader-origin">答复于 {formatDateTime(attention.response.recordedAt)}</p>}<p id="task-attention-response">{attention.response.text}</p></> : <Button id="task-closeout-respond" type="primary" onClick={onRespond}>记录验收意见</Button>}</section> : target.kind === 'acceptance' ? <p>暂无用户确认记录。</p> : null}</article>;
  }
  if (target.kind === 'coordination') return <div className="task-reader"><ParentCoordinationPanel data={evidence.coordinationData} loading={evidence.coordinationLoading} onRefresh={() => void evidence.refreshCoordination()} taskHref={id => href(`/tasks/${encodeURIComponent(id)}`)} /></div>;
  if (target.kind === 'result' || target.kind === 'closeout') return <article className="task-reader task-closeout"><h2>交付结果</h2>{record.result ? <><p className="task-reader-origin">{formatDateTime(record.updatedAt)}</p><MarkdownHost markdown={record.result.summary} className="markdown-body" options={{allowRelativeLinks:true,onRelativeLinkClick:onRelativeLink}} /></> : <p className="task-node-empty">尚未登记交付结果。</p>}{record.resultHistory?.length ? <section><h3>结果更正</h3>{record.resultHistory.map((item,i)=><p key={i}>{formatDateTime(item.correctedAt)} · {item.reason}</p>)}</section> : null}</article>;

  return null;
}
