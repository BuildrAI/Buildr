import { useEffect, useId, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { tabElementId } from '../../../lib/tab-navigation';
import { ObjectTabStrip } from '../../../components/ObjectTabStrip';
import { workspaceHref } from '../../../lib/labels';
import { SourceControlWorkbench } from '../components/SourceControlWorkbench';
import { codeReturnTarget } from '../code-navigation';
import { SourceControlCommitPanel } from '../components/SourceControlCommitPanel';
import { useSourceControlActions } from '../hooks/useSourceControlActions';
import { useSourceControl } from '../hooks/useSourceControl';
import { useSourceControlBranches } from '../hooks/useSourceControlBranches';
import { useSourceControlFetch } from '../hooks/useSourceControlFetch';
import { SourceControlFetchResults } from '../components/SourceControlFetchResults';
import type { SourceControlFileTarget, SourceControlScene } from '../source-control-model';

export function CodeSourceControlPage() {
  const panelId = useId();
  const {workspaceId, setBreadcrumbParts} = useAppShell();
  const location = useLocation(), navigate = useNavigate();
  const entry = location.state?.sourceControlEntry as {origin?: 'task'; nonce?: string; taskId: string; taskTitle?: string; from: {pathname: string; search: string; hash: string; state: unknown}} | undefined;
  const observation = useSourceControl(workspaceId || '', entry?.taskId);
  const actions = useSourceControlActions(workspaceId || '', observation.refresh);
  const fetchActions = useSourceControlFetch(workspaceId || '');
  const branches = useSourceControlBranches(workspaceId || '', fetchActions);
  const [scene, setScene] = useState<SourceControlScene>('changes');
  useEffect(() => { setBreadcrumbParts(['代码', '源代码管理']); }, [setBreadcrumbParts]);
  const href = (path: string) => workspaceHref(workspaceId, path);
  const openCurrent = (target: SourceControlFileTarget) => navigate(href('/code/explorer'), {state: {codeEntry: {
    origin: 'source-control',
    file: {repositoryId: target.repositoryId, checkoutId: target.worktreeId, path: target.path}, taskId: target.taskId,
    from: {pathname: location.pathname, search: location.search, hash: location.hash, state: location.state},
  }}});
  const openTask = (taskId: string) => {
    const target = codeReturnTarget(entry, href(''));
    if (entry?.taskId === taskId && target?.origin === 'task') navigate({pathname: target.from.pathname, search: target.from.search, hash: target.from.hash}, {state: target.from.state});
    else navigate(href('/tasks/' + encodeURIComponent(taskId)), {state: {from: location.pathname + location.search}});
  };
  return <div className="code-source-control-page">
    <ObjectTabStrip panelId={panelId} className="code-source-control-tab" tabs={[{key: 'source-control', kind: 'svc', title: '源代码管理'}]} active="source-control" closable={false} onActivate={() => {}} />
    <div className="object-tab-panel" id={panelId} role="tabpanel" aria-labelledby={tabElementId(panelId, 'source-control')} tabIndex={0}>
    <SourceControlWorkbench repositories={observation.repositories} reader={observation.reader} readKey={observation.readKey}
      observation={observation.observation} onRefresh={observation.refresh} onRetry={observation.refresh}
      catalogActions={<Tooltip title="获取当前已观察代码库的远程记录"><Button type="text" size="small" icon={<CloudDownloadOutlined />} loading={Object.values(fetchActions.pending).some(Boolean)} disabled={!observation.repositories.length} aria-label="全部获取远程" onClick={() => void fetchActions.run(observation.repositories)}>全部获取远程</Button></Tooltip>}
      catalogFeedback={<SourceControlFetchResults repositories={observation.repositories} results={fetchActions.results} />}
      scene={scene} onScene={setScene} onOpenTask={openTask}
      task={entry ? {id: entry.taskId, title: entry.taskTitle || entry.taskId} : undefined}
      scopeSelection={entry && observation.selection ? {...observation.selection, key: workspaceId + ':' + (entry.nonce || location.key)} : undefined}
      renderChangeActions={(repository, worktree) => workspaceId ? <SourceControlCommitPanel workspaceId={workspaceId} repository={repository} worktree={worktree} actions={actions} version={repository.readVersion || ''} /> : null}
      onViewCurrent={openCurrent} branchExtension={branches} layoutStorageKey={'buildr:source-control:' + workspaceId} />
    </div>
  </div>;
}
