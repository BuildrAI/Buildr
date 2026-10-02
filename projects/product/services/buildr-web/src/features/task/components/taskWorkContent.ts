import type { TaskDocumentReference } from '../../../lib/taskDocumentLinks';
import type { TaskRecord } from '../../../../build/generated/task-dto';
import type { ReviewsResponse, VerificationResponse } from '../../../../build/generated/task-professional-http-dto';
import type { TaskWorkContext } from '../../../../build/generated/workbench-dto';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import type { ChangeArtifact } from '../../../components/ChangeBriefPanel';
import { taskMaterialSourceLabel, type TaskMaterialDocument, type TaskMaterialsResult } from '../task-materials.ts';

export type TaskStage = NonNullable<TaskWorkContext['stage']>;
export type TaskNodeStage = 'requirements' | 'design' | 'implementation' | 'closeout';
export type TaskReadingTab = TaskNodeStage | 'changes';
export const taskStageLabels: Record<TaskStage, { title: string; english: string; description: string }> = {
  requirements: { title: '任务说明', english: 'Task Brief', description: '任务说明承载本次任务的问题、需求或缺陷说明；目标由 intent 提供短定位，说明正文优先使用任务关联材料。' },
  design: { title: '方案设计', english: 'Solution Design', description: '提案说明改什么，设计说明怎么做，规范说明应满足的行为。' },
  'planning-review': { title: '方案审查', english: 'Planning Review', description: '每次方案审查的结论与问题，按次保留。' },
  implementation: { title: '开发实现', english: 'Implementation', description: '实施材料、实现审查与开发验证；变更实施清单通过独立入口阅读。' },
  'implementation-review': { title: '实现审查', english: 'Implementation Review', description: '每次针对实际修改的审查结论与问题，按次保留。' },
  verification: { title: '开发验证', english: 'Task Verification', description: '最近一次验证结果，以及修复或再次验证的当前进展。' },
  acceptance: { title: '用户确认', english: 'User Acceptance', description: '需要你确认的成果，以及已经保存的意见。' },
  closeout: { title: '任务收尾', english: 'Task Closeout', description: '已记录的完成摘要、实际交付情况与遗留事项。' },
};

export type TaskDocumentItem = { key: string; changeKey: string; stage: TaskNodeStage; title: string; description: string; file: string; artifact: ChangeArtifact; provenance: string; material?: TaskMaterialDocument; historicalBrief?: boolean; purpose?: 'change-brief' | 'checklist' };
export function taskDocuments(briefs: TaskBriefState[], materials?: TaskMaterialsResult | null): TaskDocumentItem[] {
  const roles: Record<TaskMaterialDocument['role'], TaskNodeStage> = { brief: 'requirements', solution: 'design', implementation: 'implementation', delivery: 'closeout' };
  const explicit = (materials?.materials?.documents || []).some(item => item.role === 'brief');
  const documents: TaskDocumentItem[] = (materials?.materials?.documents || []).map(reference => {
    const document = materials!.documents.find(item => item.id === reference.id) || { ...reference, exists: false, content: null, actualDigest: null, provenance: null, diagnostic: { code: 'task_material_unavailable', message: '关联材料当前不可读取。' } };
    return { key: `material:${document.id}`, changeKey: taskMaterialSourceLabel(document), stage: roles[document.role], title: document.title, description: taskMaterialSourceLabel(document), file: document.source.path.split('/').at(-1) || document.title, artifact: { path: document.source.path, exists: document.exists, content: document.content ?? undefined }, provenance: document.provenance || '', material: document };
  });
  return [...documents, ...briefs.flatMap(item => {
    if (item.kind !== 'ready') return [];
    const { change } = item;
    const entries: Array<{ stage: TaskDocumentItem['stage']; title: string; description: string; artifact: ChangeArtifact; purpose?: TaskDocumentItem['purpose'] }> = [
      { stage: explicit ? 'design' : 'requirements', title: explicit ? `变更说明 · ${item.key}` : '需求或说明', description: explicit ? '具体规范变化的辅助说明' : '历史变更说明，非独立任务说明', artifact: change.brief, purpose: 'change-brief' },
      { stage: 'design', title: '提案', description: '为什么做、改变什么', artifact: change.artifacts.proposal },
      { stage: 'design', title: '设计', description: '实现做法与关键取舍', artifact: change.artifacts.design },
      ...change.artifacts.specs.map(artifact => ({ stage: 'design' as const, title: `规范 · ${artifact.capability || artifact.path.split('/').at(-2) || '行为要求'}`, description: '应满足的行为与边界', artifact })),
      { stage: 'implementation', title: '实施清单', description: '待办事项与已完成勾选', artifact: change.artifacts.tasks, purpose: 'checklist' },
    ];
    return entries.filter(entry => entry.artifact.exists && (entry.stage !== 'requirements' || materials !== null)).map(entry => ({ ...entry, historicalBrief: entry.stage === 'requirements', key: `${item.key}:${entry.artifact.path}`, changeKey: item.key, file: entry.artifact.path.split('/').slice(entry.artifact.path.includes('/specs/') ? -3 : -1).join('/'), provenance: item.provenance }));
  })];
}

export type ReviewRecord = { result: NonNullable<ReviewsResponse['slots']['planning']['result']>; resultDigest: string; observedAt: string | null };
export function reviewRecords(slot?: ReviewsResponse['slots']['planning']): ReviewRecord[] {
  if (!slot) return [];
  return [...(slot.history || []), ...(slot.result && slot.resultDigest ? [{ result: slot.result, resultDigest: slot.resultDigest, observedAt: slot.observedAt || null }] : [])];
}
export function reviewSummary(slot?: ReviewsResponse['slots']['planning']): string {
  if (!slot?.result) return '暂无记录';
  return slot.result.conclusion.outcome === 'accepted' ? '最近通过' : '最近需修改';
}
export function verificationSummary(value?: VerificationResponse | null): string {
  const report = value?.slot.report;
  if (!report) return '暂无结果';
  const label = { passed: '最近通过', 'not-passed': '最近未通过', incomplete: '未完成' }[report.conclusion.outcome];
  return value?.slot.applicability?.status === 'stale' ? `${label} · 需重核` : label;
}
export function parentStage(stage: TaskStage): TaskNodeStage {
  if (stage === 'planning-review') return 'design';
  if (stage === 'implementation-review' || stage === 'verification') return 'implementation';
  if (stage === 'acceptance') return 'closeout';
  return stage;
}
export function taskPathNodes(record: TaskRecord, context: TaskWorkContext | null | undefined) {
  const current = record.status === 'active' && context?.stage ? parentStage(context.stage) : null;
  return (['requirements', 'design', 'implementation', 'closeout'] as TaskNodeStage[]).map(stage => ({ stage, current: current === stage }));
}
export function taskDocumentLabel(item: TaskDocumentItem, peers: TaskDocumentItem[]): string {
  const label = item.historicalBrief ? '说明' : item.title;
  const duplicate = peers.filter(peer => (peer.historicalBrief ? '说明' : peer.title) === label).length > 1;
  return duplicate ? `${label} · ${item.changeKey}` : label;
}

export function sourceLabel(provenance: string): string {
  return provenance === 'task-local' ? '任务本机材料' : provenance === 'task-worktree-candidate' ? '任务工作树（Worktree）' : provenance.includes('archive') ? '已归档内容' : '保留目录';
}

export function taskDocumentTarget(item: TaskDocumentItem): TaskReadTarget {
  return item.material ? { kind: 'material', id: item.material.id, title: item.title } : { kind: 'artifact', title: item.title, changeKey: item.changeKey, path: item.artifact.path, historicalBrief: item.historicalBrief };
}

export type TaskReadTarget =
  | { kind: 'prototype'; title: string; prototypeKey?: string }
  | { kind: 'material'; id: string; title: string }
  | { kind: 'artifact'; changeKey: string; path: string; title: string; historicalBrief?: boolean }
  | { kind: 'review'; reviewType: 'planning' | 'completion'; digest: string; title: string }
  | { kind: 'document'; reference: TaskDocumentReference; title: string }
  | { kind: 'result' | 'coordination' | 'verification' | 'context' | 'record' | 'closeout' | 'retrospective' | 'intent'; title: string };
