import { useContext, useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown } from 'antd';
import { CloudDownloadOutlined, MoreOutlined, SyncOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { WorkspaceViewActiveContext } from '../../../app/pageTabs';
import { workspaceHref } from '../../../lib/labels';
import { SourceControlWorkbench } from '../components/SourceControlWorkbench';
import { codeReturnTarget } from '../code-navigation';
import { SourceControlCommitPanel } from '../components/SourceControlCommitPanel';
import { useSourceControlActions } from '../hooks/useSourceControlActions';
import type { CodeSourceTarget } from '../code-source-selection';
import { useCodeSourceSelection } from '../hooks/useCodeSourceSelection';
import { useSourceControl } from '../hooks/useSourceControl';
import { useSourceControlBranches } from '../hooks/useSourceControlBranches';
import { useSourceControlFetch } from '../hooks/useSourceControlFetch';
import { useSourceControlSync } from '../hooks/useSourceControlSync';
import { SourceControlOperationNotices } from '../components/SourceControlOperationNotices';
import { codeApi } from '../api/code-api';
import { orderCodeRepositories } from '../code-repository-order';
import { sourceControlRepositoryHasChanges, type SourceControlFileTarget, type SourceControlScene } from '../source-control-model';

export function CodeSourceControlPage() {
  const viewActive = useContext(WorkspaceViewActiveContext);
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false);
  const {workspaceId, workspace, setBreadcrumbParts} = useAppShell();
  const {message} = App.useApp();
  useEffect(() => {setCatalogMenuOpen(false);}, [workspaceId, viewActive]);
  const location = useLocation(), navigate = useNavigate();
  const entry = location.state?.sourceControlEntry as {origin?: 'task'; nonce?: string; taskId: string; taskTitle?: string; from: {pathname: string; search: string; hash: string; state: unknown}} | undefined;
  const observation = useSourceControl(workspaceId || '', entry?.taskId, viewActive);
  const repositories = useMemo(() => orderCodeRepositories(observation.repositories, workspace?.rootPath, sourceControlRepositoryHasChanges), [observation.repositories, workspace?.rootPath]);
  const currentSource = useCodeSourceSelection(workspaceId);
  const actions = useSourceControlActions(workspaceId || '', observation.refresh);
  const fetchActions = useSourceControlFetch(workspaceId || '');
  const syncActions = useSourceControlSync(workspaceId || '');
  const branches = useSourceControlBranches(workspaceId || '', fetchActions, syncActions);
  const fetching = Object.values(fetchActions.pending).some(Boolean), syncing = syncActions.runningAll || Object.values(syncActions.pending).some(Boolean);
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
    <SourceControlOperationNotices workspaceId={workspaceId || ''} repositories={observation.repositories} fetchResults={fetchActions.feedback} syncResults={syncActions.results} onViewChanges={(repositoryId, worktreeId) => branches.viewChanges?.(repositoryId, worktreeId)} />
    <SourceControlWorkbench sourceEntryKey={entry ? workspaceId+':'+(entry.nonce||location.key) : undefined} currentSourceSelection={currentSource.selection ? {key:workspaceId+':'+currentSource.selection.sequence,targets:currentSource.selection.targets,preferredTarget:currentSource.selection.preferredTarget} : undefined} onCurrentSourceSelect={(target:CodeSourceTarget)=>currentSource.select('source-control',[target],target)} active={viewActive} repositories={repositories} defaultRepositories={observation.repositories} reader={observation.reader} readKey={observation.readKey}
      editableWorkspaceId={workspaceId || undefined}
      observation={observation.observation} onRefresh={observation.refresh} onRetry={observation.refresh}
      onClone={workspaceId ? (repositoryId => { void codeApi.repositoryClone(workspaceId, repositoryId).then(result => {
        if (result.status === 'unavailable') message.warning(result.diagnostic || '仅 Git 来源的代码库支持克隆。');
        void observation.refresh(repositoryId);
      }).catch(error => { message.error(error instanceof Error ? error.message : '克隆请求未能完成。'); void observation.refresh(repositoryId); }); }) : undefined}
      catalogActions={<Dropdown open={viewActive && catalogMenuOpen} onOpenChange={setCatalogMenuOpen} trigger={['click']} placement="bottomRight" menu={{'aria-label':'源代码管理操作菜单', items:[
        {key:'sync', icon:<SyncOutlined aria-hidden spin={syncing} />, label:syncing ? '正在同步…' : '全部同步', disabled:fetching || syncing || !observation.repositories.length},
        {key:'fetch', icon:<CloudDownloadOutlined aria-hidden spin={fetching} />, label:fetching ? '正在获取远程…' : '全部获取远程', disabled:fetching || syncing || !observation.repositories.length},
      ], onClick:({key}) => {setCatalogMenuOpen(false); if (key === 'sync') void syncActions.runAll(observation.repositories); else void fetchActions.run(observation.repositories);}}}><Button type="text" size="small" icon={<MoreOutlined rotate={90} />} loading={fetching || syncing} aria-label="源代码管理操作菜单" title="源代码管理操作菜单" aria-expanded={catalogMenuOpen} aria-haspopup="menu" /></Dropdown>}
      scene={scene} onScene={setScene} onOpenTask={openTask}
      task={entry ? {id: entry.taskId, title: entry.taskTitle || entry.taskId} : undefined}
      scopeSelection={entry && observation.selection ? {...observation.selection, key: workspaceId + ':' + (entry.nonce || location.key)} : undefined}
      renderChangeActions={(repository, worktree, active) => workspaceId ? <SourceControlCommitPanel active={active} workspaceId={workspaceId} repository={repository} worktree={worktree} actions={actions} version={repository.readVersion || ''} /> : null}
      onViewCurrent={openCurrent} branchExtension={branches} layoutStorageKey={'buildr:source-control:' + workspaceId} />
  </div>;
}
