import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App, Button, ConfigProvider, Dropdown } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { HistoryOutlined, HomeOutlined, MoreOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { PageTabStrip } from '../../app/PageTabStrip';
import { TaskOverview } from '../../features/task/components/TaskOverview';
import { TaskWorkPath } from '../../features/task/components/TaskWorkPath';
import { changedFileKey } from '../../features/task/components/TaskChangedFiles';
import { TaskDiffReader, type RailRepository } from '../../features/task/components/TaskDiffReader';
import { taskCommitKey, type TaskCommitsState } from '../../features/task/components/task-commit-model';
import { taskStageLabels, type TaskNodeStage } from '../../features/task/components/taskWorkContent';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import { changedFiles, changedFilesResult, commitFiles, commits, commitResult, context, record, taskId } from './fixtures';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/task/task-detail.css';
import './preview.css';

type ContentTab = 'code' | TaskNodeStage;
type ChangesState = 'ready' | 'clean' | 'partial' | 'loading' | 'failure';

function Preview() {
  const { message } = App.useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [content, setContent] = useState<ContentTab>('code');
  const [changesState, setChangesState] = useState<ChangesState>('ready');
  const [commitState, setCommitState] = useState<TaskCommitsState>('ready');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [commitExpanded, setCommitExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => changedFileKey(changedFilesResult.files[0]));
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);
  const page = content === 'code' ? 'code' : 'task-context';
  const state = content === 'code'
    ? changesState !== 'ready' ? changesState
      : commitState === 'empty' ? 'no-commits'
      : expanded ? 'diff'
      : commitExpanded ? 'commit-files'
      : ''
    : content === 'requirements' ? '' : content;
  const current = useRef({ page, state });
  function chooseScene(nextPage: string, nextState: string) {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (nextPage === 'task-context') { setContent((nextState || 'requirements') as TaskNodeStage); return; }
    setContent('code');
    const next = (['clean', 'partial', 'loading', 'failure'].includes(nextState) ? nextState : 'ready') as ChangesState;
    setChangesState(next);
    setExpanded(nextState === 'diff' ? changedFileKey(changedFiles[0]) : null);
    setCommitExpanded(nextState === 'commit-files' || nextState === 'commit-detail' ? taskCommitKey(commits[0]) : null);
    setCommitState(nextState === 'no-commits' ? 'empty' : 'ready');
    if (nextState === 'diff' || nextState === 'commit-files') setSelected(changedFileKey(nextState === 'diff' ? changedFiles[0] : (commitFiles[taskCommitKey(commits[0])] || [])[0]));
  }
  const bridge = usePrototypeBridge(scenes.pages, current, chooseScene);
  useEffect(() => { bridge.report(page, state); }, [page, state]);
  function retryChanges() {
    setChangesState('loading');
    retryTimer.current = setTimeout(() => { setChangesState('ready'); message.success('已恢复模拟变更文件'); }, 650);
  }
  const info = () => message.info('本原型仅演示任务中查看改动与提交。此入口沿用现有页面，不执行真实操作。');
  const tabs = [{ key: 'dir:tasks', kind: 'dir' as const, title: '任务', path: '/tasks' }];
  const nav: Array<[string, string, ReactNode]> = [['overview', '概览', <HomeOutlined />], ['tasks', '任务', <UnorderedListOutlined />], ['activity', '动态', <HistoryOutlined />]];
  const stageCopy: Record<TaskNodeStage, string> = {
    requirements: record.intent,
    design: '改动与提交合并为一个内容标签：左侧仓库树常驻导航，右侧差异面并排或统一自适应。',
    implementation: '本阶段先评审原型，尚未开始正式功能实现。',
    closeout: '本任务尚未收尾。工作区改动与提交记录都会保留在任务中。',
  };
  const filesData = changesState === 'loading' || changesState === 'failure' ? null
    : {
        files: changesState === 'clean' ? [] : changesState === 'partial' ? changedFilesResult.files.filter(file => file.repositoryId === 'prototype-buildr') : changedFilesResult.files,
        repositories: changesState === 'partial' ? changedFilesResult.repositories.map(repository => repository.id === 'prototype-operation-trace' ? { ...repository, status: 'unavailable' as const } : repository) : changedFilesResult.repositories,
      };
  const filesCount = filesData ? filesData.files.length : null;
  const railRepositories = useMemo<RailRepository[]>(() => {
    const fileRepos = filesData?.repositories || changedFilesResult.repositories;
    const fileList = filesData?.files || [];
    const commitData = commitState === 'empty' ? { ...commitResult, commits: [] } : commitResult;
    return fileRepos.map(repository => ({
      id: repository.id, label: repository.label, root: repository.root, branch: repository.branch, ahead: repository.ahead,
      status: repository.status,
      changes: fileList.filter(file => file.repositoryId === repository.id),
      commits: commitData.commits.filter(commit => commit.repositoryId === repository.id).map(commit => ({ key: taskCommitKey(commit), commit, files: commitFiles[taskCommitKey(commit)] || [] })),
    }));
  }, [filesData, commitState]);
  // no helper needed; selection via rail row clicks
  return <>
    <div className="app-shell area-workbench task-commits-preview">
      <AppShellHeader development brandHref="/tasks" workspaceName="Buildr" workspaceMenuItems={[{ key: 'preview', label: 'Buildr · 原型预览', onClick: info }]} area="workbench" workbenchHref="/tasks" workspaceDestination={{ to: '/tasks' }} actions={<><Button type="text" aria-label="搜索" icon={<SearchOutlined />} onClick={info} /><Button className="nav-quit" type="text" onClick={info}>退出</Button><Button id="open-agent-action" type="primary" icon={<PlusOutlined />} onClick={info}>提出新目标</Button></>} />
      <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)} navigation={<nav className="shell-navigation" aria-label="工作台导航"><p className="shell-nav-caption">工作台</p>{nav.map(([key, label, icon]) => <AppNavigationItem key={key} name={key} label={label} icon={icon} to={'/' + key} path={'/' + key} active={key === 'tasks'} onClick={event => { event.preventDefault(); if (key !== 'tasks') info(); }} />)}<div className="workbench-followed-navigation"><p className="shell-nav-caption">我关注的项目</p><button className="shell-nav-item task-commits-project-link" onClick={info}><span className="workbench-project-dot" /><span>Buildr 产品</span></button></div></nav>}>
        <div className="workspace-pages"><div className="workspace-page-tabs"><PageTabStrip tabs={tabs} onClose={info} onReorder={() => {}} /></div><div className="workspace-page-stack"><div className="workspace-page task-commits-page">
          <article className={`task-detail-page${content === 'code' ? ' is-wide' : ''}`} id="task-detail-main" data-task-id={taskId}>
            <TaskOverview record={record} metadata={<div className="task-metadata-line task-header-metadata"><span id="task-detail-id" className="task-detail-id">{record.taskId}</span><span className="task-scope-links">项目：<Button type="link" onClick={info}>product</Button></span><span>服务：buildr、buildr-web</span><time>最后更新 2026-09-30 16:10</time></div>} onRelativeLink={info} actions={<><Button size="small" type="text" aria-label="刷新任务" icon={<ReloadOutlined />} onClick={() => { setContent('code'); retryChanges(); }} /><Dropdown trigger={['click']} menu={{ items: [{ key: 'continue', label: '生成接续指令' }, { key: 'edit', label: '编辑任务' }, { key: 'complete', label: '登记完成' }], onClick: info }}><Button size="small" type="text" aria-label="更多任务操作" icon={<MoreOutlined />} /></Dropdown></>} />
            <TaskWorkPath record={record} context={context} selected={content === 'code' ? null : content} onSelect={setContent} contentTabs={[
              { key: 'code', label: <span data-prototype-position="changes-entry">改动与提交{filesCount !== null && filesCount > 0 && <span className="task-commits-tab-count">{filesCount}</span>}</span>, selected: content === 'code', onSelect: () => setContent('code') },
            ]} actions={<Button id="task-checklist-toggle" type="text" size="small" icon={<UnorderedListOutlined />} onClick={info}>实施清单</Button>} />
            <div className="task-commits-reading">
              {content === 'code'
                ? <TaskDiffReader repositories={railRepositories} selected={selected} onSelect={setSelected} notice="模拟差异内容，仅演示工作台布局。" />
                : <section className="task-reader"><h2>{taskStageLabels[content].title}</h2><p>{stageCopy[content]}</p><Button onClick={() => setContent('code')}>查看改动与提交</Button></section>}
            </div>
          </article>
        </div></div></div>
      </AppShellFrame>
    </div>
  </>;
}

createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/tasks']}><Preview /></MemoryRouter></App></ConfigProvider>);
