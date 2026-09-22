import { useCallback, useEffect, useState } from 'react';
import { Alert, Spin } from 'antd';
import type { TaskRecord } from '../../../../build/generated/task-dto';
import type { TaskBriefState } from '../hooks/useTaskArtifacts';
import { projectApi } from '../../project/api/project-api';
import { resolveTaskDocumentReference, type TaskDocumentReference } from '../../../lib/taskDocumentLinks';
import { ResourceDocumentPane } from '../../../components/ResourceDocumentPane';
import { TaskArtifactReader } from './TaskArtifactReader';
import { taskApi } from '../api/task-api';

export function CompositeTaskPlan({ record, briefs, onDocument }: { record: TaskRecord; briefs: TaskBriefState[]; onDocument(projectOrChange: string, path: string): void }) {
  const design = briefs.find(item => item.kind === 'ready' && item.change.artifacts.design.exists);
  const link = [...record.intent.matchAll(/\[([^\]]*(?:方案|计划)[^\]]*)\]\(([^)]+)\)/g)][0]?.[2];
  const [reference, setReference] = useState<TaskDocumentReference | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true; setReference(null); setError('');
    if (design || !link) { setLoading(false); return; }
    setLoading(true);
    void projectApi.listProjects().then(data => {
      if (!live) return;
      const ref = resolveTaskDocumentReference(link, record.scope, data.projects || []);
      if (!ref) throw new Error('方案链接不在当前任务的可读项目范围内。');
      setReference(ref);
    }).catch(cause => { if (live) setError(cause instanceof Error ? cause.message : '方案读取失败'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [record.taskId, record.intent, link, Boolean(design)]);
  const load = useCallback(async (file: string) => {
    const data = await taskApi.projectDocument(record.taskId, reference!.projectCode, file.split('/').map(encodeURIComponent).join('/'));
    return { ...data, path: data.path || file };
  }, [record.taskId, reference?.projectCode]);
  if (design?.kind === 'ready') return <TaskArtifactReader embedded change={design.change} artifactPath={design.change.artifacts.design.path} onClose={() => {}} onSelect={path => onDocument(design.key, path)} onProjectDocument={path => onDocument(design.key, path)} />;
  if (loading) return <Spin size="small" />;
  if (error) return <Alert type="warning" message={error} />;
  if (reference) return <ResourceDocumentPane showHeader={false} file={reference.documentPath} load={load} onOpen={file => onDocument(reference.projectCode, file)} />;
  return <p className="task-node-empty">{briefs.some(item => item.kind === 'missing') ? '方案暂时不可读取，请刷新后重试。' : '暂无方案。'}</p>;
}
