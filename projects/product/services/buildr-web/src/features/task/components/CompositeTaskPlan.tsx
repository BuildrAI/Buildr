import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { taskDocumentLabel, taskDocumentTarget, type TaskDocumentItem, type TaskReadTarget } from './taskWorkContent';
import type { TaskMaterialsState } from '../task-materials';
import { Alert, Select, Spin } from 'antd';
import type { TaskRecord } from '../../../../build/generated/task-dto';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import { projectApi } from '../../project/api/project-api';
import { resolveTaskDocumentReference, type TaskDocumentReference } from '../../../lib/taskDocumentLinks';
import { ResourceDocumentPane } from '../../../components/ResourceDocumentPane';
import { taskApi } from '../api/task-api';

export function CompositeTaskPlan({ record, briefs, documents, materials, renderContent, onDocument }: { record: TaskRecord; briefs: TaskBriefState[]; documents: TaskDocumentItem[]; materials: TaskMaterialsState; renderContent(target: TaskReadTarget): ReactNode; onDocument(projectOrChange: string, path: string): void }) {
  const entries = documents.filter(item => item.stage === 'requirements' || item.stage === 'design');
  const [selected, setSelected] = useState('');
  const active = entries.find(item => item.key === selected) || entries[0];
  const link = [...record.intent.matchAll(/\[([^\]]*(?:方案|计划)[^\]]*)\]\(([^)]+)\)/g)][0]?.[2];
  const [reference, setReference] = useState<TaskDocumentReference | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true; setReference(null); setError('');
    if (entries.length || materials.loading || materials.error || !link) { setLoading(false); return; }
    setLoading(true);
    void projectApi.listProjects().then(data => {
      if (!live) return;
      const ref = resolveTaskDocumentReference(link, record.scope, data.projects || []);
      if (!ref) throw new Error('方案链接不在当前任务的可读项目范围内。');
      setReference(ref);
    }).catch(cause => { if (live) setError(cause instanceof Error ? cause.message : '方案读取失败'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [record.taskId, record.intent, link, entries.length, materials.loading, materials.error]);
  const load = useCallback(async (file: string) => {
    const data = await taskApi.projectDocument(record.taskId, reference!.projectCode, file.split('/').map(encodeURIComponent).join('/'));
    return { ...data, path: data.path || file };
  }, [record.taskId, reference?.projectCode]);
  if (materials.loading && !materials.data) return <Spin size="small" aria-label="正在读取任务材料" />;
  if (materials.error && !materials.data) return <Alert type="warning" message={`任务材料读取失败：${materials.error}`} />;
  if (active) return <section id="task-node-content" aria-label="任务说明与方案"><h2>任务说明与方案</h2>{materials.loading && !active.material && <Alert type="info" message="材料关联正在重新核对，当前显示上次读取的内容。" />}{materials.error && !active.material && <Alert type="warning" message={`任务材料读取失败：${materials.error}`} description="材料关联的新版本尚未确认。请刷新任务后重试。" />}{!entries.some(item => item.stage === 'requirements') && <p className="task-node-empty">尚未关联独立任务说明。</p>}{briefs.map(item => item.kind === 'missing' ? <Alert key={item.key} type="warning" message={item.message} /> : item.kind === 'ready' && !item.change.brief.exists ? <Alert key={item.key} type="warning" message={`${item.key} 的变更说明当前缺失。`} /> : null)}{materials.data?.diagnostics.map((item, index) => <Alert key={index} type="warning" message={item.message} />)}{entries.length > 1 && <Select aria-label="选择任务说明或方案" value={active.key} options={entries.map(item => ({ value: item.key, label: taskDocumentLabel(item, entries) }))} onChange={setSelected} />}{renderContent(taskDocumentTarget(active))}</section>;
  if (materials.loading || materials.error) return <Alert type={materials.error ? 'warning' : 'info'} message={materials.error ? `任务材料读取失败：${materials.error}` : '正在重新核对上次读取的任务材料。'} description="上次读取尚未关联独立任务说明；新版本尚未确认。" />;
  if (materials.data?.diagnostics.length) return <>{materials.data.diagnostics.map((item, index) => <Alert key={index} type="warning" message={item.message} />)}</>;
  if (loading) return <Spin size="small" />;
  if (error) return <Alert type="warning" message={error} />;
  if (reference) return <ResourceDocumentPane showHeader={false} file={reference.documentPath} load={load} onOpen={file => onDocument(reference.projectCode, file)} />;
  return <p className="task-node-empty">{briefs.some(item => item.kind === 'missing') ? '方案暂时不可读取，请刷新后重试。' : '尚未关联独立任务说明；暂无方案。'}</p>;
}
