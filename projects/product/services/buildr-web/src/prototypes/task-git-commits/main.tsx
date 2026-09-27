import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { TaskCommitRecords } from '../../features/task/components/TaskCommitRecords';
import { taskCommitKey, type TaskCommitsState } from '../../features/task/components/task-commit-model';
import { taskStageLabels, type TaskNodeStage } from '../../features/task/components/taskWorkContent';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import { commits, commitResult, context, record, taskId } from './fixtures';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/task/task-detail.css';
import './preview.css';

function Preview() {
  const { message } = App.useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [content, setContent] = useState<'commits' | TaskNodeStage>('commits');
  const [loadState, setLoadState] = useState<TaskCommitsState>('ready');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [example, setExample] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);
  const page = content === 'commits' ? 'commits' : 'task-context';
  const state = content !== 'commits' ? content === 'requirements' ? '' : content : example ? 'example' : loadState !== 'ready' ? loadState : expanded ? 'detail' : '';
  const current = useRef({ page, state });
  function chooseScene(nextPage: string, nextState: string) {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (nextPage === 'task-context') { setContent((nextState || 'requirements') as TaskNodeStage); return; }
    setContent('commits');
    setLoadState(['empty', 'loading', 'failure', 'partial'].includes(nextState) ? nextState as TaskCommitsState : 'ready');
    setExpanded(nextState === 'detail' ? taskCommitKey(commits[0]) : null);
    setExample(nextState === 'example');
  }
  const bridge = usePrototypeBridge(scenes.pages, current, chooseScene);
  useEffect(() => { bridge.report(page, state); }, [page, state]);
  function retry() {
    setLoadState('loading');
    retryTimer.current = setTimeout(() => { setLoadState('ready'); message.success('已恢复模拟提交记录'); }, 650);
  }
  const info = () => message.info('本原型仅演示任务与提交关联。此入口沿用现有页面，不执行真实操作。');
  const tabs = [{ key: 'dir:tasks', kind: 'dir' as const, title: '任务', path: '/tasks' }];
  const nav: Array<[string, string, ReactNode]> = [['overview', '概览', <HomeOutlined />], ['tasks', '任务', <UnorderedListOutlined />], ['activity', '动态', <HistoryOutlined />]];
  const stageCopy: Record<TaskNodeStage, string> = {
    requirements: record.intent,
    design: '在提交说明末尾记录任务编码，在任务中按时间查看关联提交。一个任务可以对应多次提交；通常一次提交只属于一个任务。',
    implementation: '本次先讨论关联方式和页面呈现，尚未开始正式功能实现。',
    closeout: '本任务尚未收尾。提交记录会保留在任务中，便于之后查看实际改动。',
  };
  return <>
    <div className="app-shell area-workbench task-commits-preview">
      <AppShellHeader development brandHref="/tasks" workspaceName="Buildr" workspaceMenuItems={[{ key: 'preview', label: 'Buildr · 原型预览', onClick: info }]} area="workbench" workbenchHref="/tasks" workspaceDestination={{ to: '/tasks' }} actions={<><Button type="text" aria-label="搜索" icon={<SearchOutlined />} onClick={info} /><Button className="nav-quit" type="text" onClick={info}>退出</Button><Button id="open-agent-action" type="primary" icon={<PlusOutlined />} onClick={info}>提出新目标</Button></>} />
      <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)} navigation={<nav className="shell-navigation" aria-label="工作台导航"><p className="shell-nav-caption">工作台</p>{nav.map(([key, label, icon]) => <AppNavigationItem key={key} name={key} label={label} icon={icon} to={'/' + key} path={'/' + key} active={key === 'tasks'} onClick={event => { event.preventDefault(); if (key !== 'tasks') info(); }} />)}<div className="workbench-followed-navigation"><p className="shell-nav-caption">我关注的项目</p><button className="shell-nav-item task-commits-project-link" onClick={info}><span className="workbench-project-dot" /><span>Buildr 产品</span></button></div></nav>}>
        <div className="workspace-pages"><div className="workspace-page-tabs"><PageTabStrip tabs={tabs} onClose={info} onReorder={() => {}} /></div><div className="workspace-page-stack"><div className="workspace-page task-commits-page">
          <article className="task-detail-page" id="task-detail-main" data-task-id={taskId}>
            <TaskOverview record={record} onRelativeLink={info} actions={<><Button size="small" type="text" aria-label="刷新任务" icon={<ReloadOutlined />} onClick={() => { setContent('commits'); retry(); }} /><Dropdown trigger={['click']} menu={{ items: [{ key: 'continue', label: '生成接续指令' }, { key: 'edit', label: '编辑任务' }, { key: 'complete', label: '登记完成' }], onClick: info }}><Button size="small" type="text" aria-label="更多任务操作" icon={<MoreOutlined />} /></Dropdown></>} />
            <section className="task-header-context" aria-label="任务信息"><div className="task-metadata-line"><span className="task-scope-links">项目：<Button type="link" onClick={info}>product</Button></span><span>服务：buildr、buildr-web</span><time>最后更新 2026-09-27 14:40</time></div></section>
            <TaskWorkPath record={record} context={context} selected={content === 'commits' ? null : content} onSelect={setContent} contentTabs={[{ key: 'commits', label: <span data-prototype-position="commit-entry">提交记录{loadState === 'ready' && <span className="task-commits-tab-count">3</span>}</span>, selected: content === 'commits', onSelect: () => setContent('commits') }]} actions={<Button id="task-checklist-toggle" type="text" size="small" icon={<UnorderedListOutlined />} onClick={info}>实施清单</Button>} />
            <div className="task-commits-reading">
              {content === 'commits' ? <TaskCommitRecords taskId={taskId} data={loadState === 'loading' || loadState === 'failure' ? null : { ...commitResult, commits: loadState === 'empty' ? [] : commits, status: loadState === 'partial' ? 'partial' : 'complete', diagnostics: loadState === 'partial' ? [{ code: 'example_unavailable', message: '另一个仓库暂不可读取，保留已读取的记录。', repositoryId: null, reference: null, hash: null }] : [] }} loading={loadState === 'loading'} error={loadState === 'failure' ? '模拟读取失败，请重新读取。' : ''} notice="本页使用模拟提交与哈希值，仅演示关联方式，未读取真实提交。" expanded={expanded} exampleOpen={example} onExpand={setExpanded} onExample={setExample} onRetry={retry} /> : <section className="task-reader"><h2>{taskStageLabels[content].title}</h2><p>{stageCopy[content]}</p><Button onClick={() => setContent('commits')}>查看提交记录</Button></section>}
            </div>
          </article>
        </div></div></div>
      </AppShellFrame>
    </div>

  </>;
}

createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/tasks']}><Preview /></MemoryRouter></App></ConfigProvider>);
