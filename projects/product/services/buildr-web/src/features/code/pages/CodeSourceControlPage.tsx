import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { tabElementId } from '../../../lib/tab-navigation';
import { ObjectTabStrip } from '../../../components/ObjectTabStrip';
import { workspaceHref } from '../../../lib/labels';
import { SourceControlWorkbench } from '../components/SourceControlWorkbench';
import { isTaskReturnPath } from '../code-navigation';
import { useSourceControl } from '../hooks/useSourceControl';
import type { SourceControlFileTarget, SourceControlScene } from '../source-control-model';

export function CodeSourceControlPage() {
  const panelId = useId();
  const {workspaceId, setBreadcrumbParts} = useAppShell();
  const location = useLocation(), navigate = useNavigate();
  const entry = location.state?.sourceControlEntry as {nonce?: string; taskId: string; taskTitle?: string; from: {pathname: string; search: string; hash: string; state: unknown}} | undefined;
  const observation = useSourceControl(workspaceId || '', entry?.taskId);
  const [scene, setScene] = useState<SourceControlScene>('changes');
  useEffect(() => { setBreadcrumbParts(['代码', '源代码管理']); }, [setBreadcrumbParts]);
  const href = (path: string) => workspaceHref(workspaceId, path);
  const openCurrent = (target: SourceControlFileTarget) => navigate(href('/code/explorer'), {state: {codeEntry: {
    file: {repositoryId: target.repositoryId, checkoutId: target.worktreeId, path: target.path}, taskId: target.taskId,
    from: {pathname: location.pathname, search: location.search, hash: location.hash, state: location.state},
  }}});
  const openTask = (taskId: string) => {
    if (entry?.taskId === taskId && isTaskReturnPath(entry.from.pathname, href('/tasks'))) navigate({pathname: entry.from.pathname, search: entry.from.search, hash: entry.from.hash}, {state: entry.from.state});
    else navigate(href('/tasks/' + encodeURIComponent(taskId)), {state: {from: location.pathname + location.search}});
  };
  return <div className="code-source-control-page">
    <ObjectTabStrip panelId={panelId} className="code-source-control-tab" tabs={[{key: 'source-control', kind: 'svc', title: '源代码管理'}]} active="source-control" closable={false} onActivate={() => {}} />
    <div className="object-tab-panel" id={panelId} role="tabpanel" aria-labelledby={tabElementId(panelId, 'source-control')} tabIndex={0}>
    <SourceControlWorkbench repositories={observation.repositories} reader={observation.reader} readKey={observation.readKey}
      observation={observation.observation} onRefresh={observation.refresh} onRetry={() => observation.refresh()}
      scene={scene} onScene={setScene} onOpenTask={openTask}
      task={entry ? {id: entry.taskId, title: entry.taskTitle || entry.taskId} : undefined}
      scopeSelection={entry && observation.selection ? {...observation.selection, key: workspaceId + ':' + (entry.nonce || location.key)} : undefined}
      onViewCurrent={openCurrent} layoutStorageKey={'buildr:source-control:' + workspaceId} />
    </div>
  </div>;
}
