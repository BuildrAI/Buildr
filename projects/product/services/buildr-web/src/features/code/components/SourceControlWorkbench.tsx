import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Segmented, Select, Spin, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { TaskDiffReader, type RailRepository } from '../../task/components/TaskDiffReader';
import { changedFileKey } from '../../task/components/TaskChangedFiles';
import { RepositoryFileBrowser, type RepositoryPreviewFile } from '../../workspace/components/RepositoryFileBrowser';
import { ReadingToggle } from '../../../components/ReadingToggle';
import { ResizablePanels } from '../../../components/ResizablePanels';
import { ObjectTabStrip } from '../../../components/ObjectTabStrip';
import { CommitInfoPopover } from './CommitInfoPopover';
import { CodeLocationSummary } from './CodeLocationSummary';
import { SourceControlRepositoryTree, SourceControlChanges, areaLabels, layerFile, worktreeLabel } from './SourceControlRepositories';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { useSourceControlRead } from '../hooks/useSourceControlRead';
import { sourceControlChange, sourceControlCommit, sourceControlFileKey as fileIdentity, sourceControlVisibleWorktrees, sourceControlWorktreeKey, type SourceControlFileTarget, type SourceControlObservation, type SourceControlReader, type SourceControlRepository, type SourceControlScene, type SourceControlScopeSelection } from '../source-control-model';
import type { CodeSourceControlInput } from '../api/code-api';
import '../source-control.css';
export type { SourceControlChange, SourceControlCommit, SourceControlRepository, SourceControlFileTarget, SourceControlScene, SourceControlState } from '../source-control-model';

type Props = {
  repositories: SourceControlRepository[]; scene: SourceControlScene; reader: SourceControlReader; readKey: string;
  observation: SourceControlObservation; onRefresh(): void | Promise<void>; onRetry?(repositoryId?: string): void | Promise<void>;
  onScene(scene: SourceControlScene): void; onOpenTask(taskId: string): void;
  onOpenFile?(target: SourceControlFileTarget): void; onViewCurrent?(target: SourceControlFileTarget): void;
  task?: { id: string; title: string }; scopeSelection?: SourceControlScopeSelection; layoutStorageKey?: string;
};
const readNote = (data: { coverage: { limit: number; truncated: boolean }; diagnostics: Array<{message: string}> } | null) => data ? [data.coverage.truncated ? '当前读取范围不完整。' : '', ...data.diagnostics.map(item => item.message)].filter(Boolean).join('；') : '';

/** Shared view: all observed facts and reads come from the caller, including in the offline prototype. */
export function SourceControlWorkbench({ repositories, scene, reader, readKey, observation, onRefresh, onRetry, onScene, onOpenTask, onOpenFile, onViewCurrent, task, scopeSelection, layoutStorageKey }: Props) {
  const firstRepository = repositories[0];
  const [scope, setScope] = useState<string[]>([]), [names, setNames] = useState<string[]>([]), [exactScope, setExactScope] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [historyRepository, setHistoryRepository] = useState(firstRepository?.id || ''), [historyWorktree, setHistoryWorktree] = useState('');
  const [changeWorktree, setChangeWorktree] = useState('');
  const [branch, setBranch] = useState('all'), [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState(''), [fileKey, setFileKey] = useState(''), [commitHash, setCommitHash] = useState('');
  const [returnScene, setReturnScene] = useState<SourceControlScene>('changes');
  const [readingExpanded, setReadingExpanded] = useState(false), [refreshToken, setRefreshToken] = useState(0);
  const [filePage, setFilePage] = useState<{key: string; page: number; revision?: string}>({key: '', page: 0});
  const [fileReload, setFileReload] = useState({key: '', version: 0});
  const previousScene = useRef(scene), appliedSelection = useRef('');
  const [selectionEpoch, setSelectionEpoch] = useState('');
  const taskSelections = useRef(new Map<string, {fileKey: string; changeWorktree: string; historyRepository: string; historyWorktree: string; branch: string; commitHash: string; scene: SourceControlScene; returnScene: SourceControlScene}>());
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (scene === 'history' && previousScene.current !== 'full-file') setReturnScene('history');
    else if (scene !== 'full-file') setReturnScene(scene);
    previousScene.current = scene;
  }, [scene]);
  useEffect(() => {
    if (!scopeSelection || !observation.readAt || appliedSelection.current === scopeSelection.key) return;
    appliedSelection.current = scopeSelection.key;
    setScope(scopeSelection.repositoryIds); setNames([]);
    setExactScope(scopeSelection.worktrees.map(item => sourceControlWorktreeKey(item.repositoryId, item.worktreeId)));
    const saved = task ? taskSelections.current.get(task.id) : undefined;
    const validKeys = scopeSelection.worktrees.map(item => sourceControlWorktreeKey(item.repositoryId, item.worktreeId));
    const savedSource = saved && repositories.flatMap(repository => repository.worktrees.map(worktree => ({repository, worktree}))).find(({repository, worktree}) => worktree.changes.some(file => fileIdentity(file) === saved.fileKey) && validKeys.includes(sourceControlWorktreeKey(repository.id, worktree.worktreeId)));
    const first = savedSource ? {repositoryId: savedSource.repository.id, worktreeId: savedSource.worktree.worktreeId} : scopeSelection.worktrees[0];
    const repository = repositories.find(item => item.id === first?.repositoryId), worktree = repository?.worktrees.find(item => item.worktreeId === first?.worktreeId);
    const savedHistoryValid = saved && validKeys.includes(sourceControlWorktreeKey(saved.historyRepository, saved.historyWorktree));
    setChangeWorktree(repository && worktree ? sourceControlWorktreeKey(repository.id, worktree.worktreeId) : '');
    setFileKey(savedSource || savedHistoryValid && saved && (saved.scene === 'history' || saved.scene === 'full-file' && saved.returnScene === 'history') ? saved!.fileKey : worktree?.changes[0] ? fileIdentity(worktree.changes[0]) : '');
    setHistoryRepository(savedHistoryValid ? saved!.historyRepository : repository?.id || ''); setHistoryWorktree(savedHistoryValid ? saved!.historyWorktree : worktree?.worktreeId || '');
    setBranch(savedHistoryValid ? saved!.branch : 'all'); setCommitHash(savedHistoryValid ? saved!.commitHash : ''); setQuery('');
    setReturnScene(savedHistoryValid && saved ? saved.returnScene : 'changes');
    if (scene !== 'task') onScene(savedHistoryValid && saved ? saved.scene : 'changes');
    setSelectionEpoch(scopeSelection.key);

  }, [scopeSelection, observation.readAt, repositories, task, onScene, scene]);
  useEffect(() => {
    if (task && scopeSelection && selectionEpoch === scopeSelection.key) taskSelections.current.set(task.id, {fileKey, changeWorktree, historyRepository, historyWorktree, branch, commitHash, scene, returnScene});
  }, [task, scopeSelection, selectionEpoch, fileKey, changeWorktree, historyRepository, historyWorktree, branch, commitHash, scene, returnScene]);
  const history = scene === 'history' || scene === 'full-file' && returnScene === 'history';
  const selectedIds = scope.length ? scope : repositories.map(repository => repository.id);
  const visibleRepositories = repositories.filter(repository => selectedIds.includes(repository.id));
  const sources = repositories.flatMap(repository => repository.worktrees.map(worktree => ({repository, worktree})));
  const visibleSources = visibleRepositories.flatMap(repository => sourceControlVisibleWorktrees(repository, names, exactScope).map(worktree => ({repository, worktree})));
  const historyRepositories = visibleRepositories.length ? visibleRepositories : repositories;
  const historyRepo = repositories.find(repository => repository.id === historyRepository) || historyRepositories[0];
  const historyRepositoryOptions = historyRepo && !historyRepositories.includes(historyRepo) ? [historyRepo, ...historyRepositories] : historyRepositories;
  const historyChoices = historyRepo ? sourceControlVisibleWorktrees(historyRepo, names, exactScope) : [];
  const historyCheckout = historyRepo?.worktrees.find(worktree => worktree.worktreeId === historyWorktree) || historyChoices[0] || historyRepo?.worktrees[0];
  const historyOptions = historyCheckout && !historyChoices.includes(historyCheckout) ? [historyCheckout, ...historyChoices] : historyChoices;
  const version = observation.readAt + ':' + refreshToken;
  const historyInput: CodeSourceControlInput = { repositoryId: historyRepo?.id, worktreeId: historyCheckout?.worktreeId, branch: branch === 'all' ? undefined : branch, query: searchQuery || undefined, limit: 100 };
  const historyRead = useSourceControlRead(JSON.stringify([readKey, historyInput]), historyInput, reader.history, Boolean(history && historyCheckout && historyCheckout.status !== 'offline'), version);
  const commits = historyRead.data?.commits.map(commit => sourceControlCommit(commit)) || [];
  const summary = commits.find(commit => commit.hash === commitHash) || commits[0];
  const commitInput: CodeSourceControlInput = { repositoryId: historyRepo?.id, worktreeId: historyCheckout?.worktreeId, commitHash: summary?.hash };
  const commitRead = useSourceControlRead(JSON.stringify([readKey, commitInput]), commitInput, reader.commit, Boolean(history && summary), version);
  const selectedCommit = summary ? commitRead.data ? sourceControlCommit(commitRead.data.commit, commitRead.data.files) : summary : undefined;
  const changeSource = sources.find(({worktree}) => worktree.changes.some(file => fileIdentity(file) === fileKey)) || sources.find(({repository, worktree}) => sourceControlWorktreeKey(repository.id, worktree.worktreeId) === changeWorktree) || visibleSources[0];
  const selectedRepository = history ? historyRepo : changeSource?.repository;
  const selectedWorktree = history ? historyCheckout : changeSource?.worktree;
  const candidateFiles = !selectedWorktree || selectedWorktree.status === 'offline' ? [] : history ? selectedCommit?.files || [] : selectedWorktree.changes;
  const currentFile = candidateFiles.find(file => fileIdentity(file) === fileKey) || candidateFiles[0];
  useEffect(() => { if (currentFile && !fileKey) setFileKey(previous => previous || fileIdentity(currentFile)); }, [currentFile, fileKey]);
  const location = selectedWorktree?.location || '';
  const target: CodeSourceControlInput = { repositoryId: selectedRepository?.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile?.path, area: history ? 'commit' : currentFile?.area,
    commitHash: history ? selectedCommit?.hash : undefined, expectedRevision: history ? undefined : selectedWorktree?.observedRevision || undefined };
  const targetKey = JSON.stringify([readKey, target]);
  const diffRead = useSourceControlRead(targetKey, target, reader.diff, Boolean(currentFile && scene !== 'full-file'), version);
  const displayedFile = currentFile && diffRead.data ? { ...currentFile, ...sourceControlChange(diffRead.data.file), area: currentFile.area, preview: diffRead.data.patch } : currentFile;
  const effectiveFileKey = displayedFile ? changedFileKey(layerFile(displayedFile, history ? selectedCommit?.hash : undefined)) : null;
  const rail: RailRepository[] = selectedRepository ? [{ id: selectedRepository.id, label: selectedRepository.name, root: location,
    branch: selectedWorktree?.branch, ahead: selectedWorktree?.ahead ?? null, status: selectedWorktree?.status === 'offline' ? 'unavailable' : 'complete',
    changes: displayedFile ? [layerFile(displayedFile, history ? selectedCommit?.hash : undefined)] : [], commits: [] }] : [];
  const continuingPage = filePage.key === targetKey && Boolean(filePage.revision);
  const fullInput: CodeSourceControlInput = { ...target, page: continuingPage ? filePage.page : undefined,
    expectedRevision: continuingPage ? filePage.revision : history || fileReload.key === targetKey ? undefined : diffRead.data?.observedRevision || target.expectedRevision };
  const fullRead = useSourceControlRead(JSON.stringify([targetKey, fullInput.page, fullInput.expectedRevision]), fullInput, reader.sourceFile, Boolean(scene === 'full-file' && currentFile), version + ':' + fileReload.version);
  const file = fullRead.data;
  const fullFiles: RepositoryPreviewFile[] = file ? [{ path: file.path, kind: file.kind, content: file.content, image: file.kind === 'image' ? file.content : undefined }] : [];
  const observedSource = scene === 'full-file' ? file?.source : diffRead.data?.source;
  const observedRevision = scene === 'full-file' ? file?.revision : diffRead.data?.observedRevision;
  const fileVersion = file?.source.version || (history && selectedCommit ? selectedCommit.hash + ' · 历史文件' : (selectedWorktree ? selectedWorktree.branch || selectedWorktree.head?.slice(0, 8) || '—' : '') + (currentFile?.area === 'staged' ? ' · 已暂存版本' : ' · 当前文件'));
  function changeScene(next: SourceControlScene) { onScene(next); }
  function pickFile(key: string) { setFileKey(key); if (scene === 'full-file') changeScene(returnScene); }
  function resetScope() { setScope([]); setNames([]); setExactScope([]); }
  function toggle(key: string, defaultExpanded = true) { setExpanded(value => ({...value, [key]: !(value[key] ?? defaultExpanded)})); }
  async function retry(repositoryId?: string) { await (onRetry ? onRetry(repositoryId) : onRefresh()); setRefreshToken(value => value + 1); }
  async function refresh() { await onRefresh(); setFilePage({key: '', page: 0}); setRefreshToken(value => value + 1); }
  function openFullFile() {
    if (!currentFile || !selectedRepository) return;
    setReturnScene(scene === 'full-file' ? returnScene : scene);
    onOpenFile?.({ repositoryId: selectedRepository.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile.path, location, area: target.area, commitHash: target.commitHash, taskId: target.taskId, expectedRevision: target.expectedRevision });
    onScene('full-file');
  }
  return <section className="source-control-workbench" aria-label="源代码管理" data-prototype-position="scm-panels">
    <ResizablePanels direction="horizontal" className="source-control-columns" initialSize={360} minFirst={260} minSecond={300} firstHidden={readingExpanded} storageKey={layoutStorageKey ? layoutStorageKey + ':columns' : undefined} separatorLabel="调整源代码管理与阅读区宽度" first={<aside className="source-control-sidebar">
      <header className="source-control-title"><strong>源代码管理</strong><Tooltip title="重新读取本机代码状态"><Button type="text" size="small" aria-label="刷新源代码管理" icon={<ReloadOutlined spin={observation.loading} />} onClick={() => void refresh()} /></Tooltip></header>
      <ResizablePanels direction="vertical" className="source-control-stack" storageKey={layoutStorageKey ? layoutStorageKey + ':stack' : undefined} initialRatio={0.42} minFirst={120} minSecond={180} separatorLabel="调整代码库与浏览区高度"
        first={<div className="source-control-catalog-pane">
        <SourceControlRepositoryTree repositories={repositories} scope={scope} names={names} ready={Boolean(observation.readAt)} expanded={expanded} onToggle={toggle}
          selectedWorktreeKey={selectedRepository && selectedWorktree ? sourceControlWorktreeKey(selectedRepository.id, selectedWorktree.worktreeId) : ''}
          onScope={setScope} onNames={values => { setNames(values); setExactScope([]); }} onReset={resetScope}
          onPick={(repository, worktree) => { setChangeWorktree(sourceControlWorktreeKey(repository.id, worktree.worktreeId)); setFileKey(worktree.changes[0] ? fileIdentity(worktree.changes[0]) : ''); setHistoryRepository(repository.id); setHistoryWorktree(worktree.worktreeId); setBranch('all'); setQuery(''); }} />
      {task && <div className="source-control-task-origin" data-prototype-position="task-link"><span>来自任务 · {task.title}</span><small>{scopeSelection?.reason || '按实际位置预选，可调整筛选。'}</small><div><Button type="link" size="small" onClick={resetScope}>查看全部</Button><Button type="link" size="small" onClick={() => onOpenTask(task.id)}>返回任务</Button></div></div>}
</div>}
        second={<div className="source-control-browser">      <div className="source-control-browse-tabs"><Segmented block value={history ? 'history' : 'changes'} options={[{ label: '未提交变更', value: 'changes' }, { label: '提交历史', value: 'history' }]} onChange={value => changeScene(value as SourceControlScene)} /></div>
      <div className="source-control-list" data-prototype-position={history ? 'history-list' : 'change-list'}>
        {observation.loading && !observation.readAt ? <div className="source-control-list-state"><Spin size="small" /><p>正在读取本机记录…</p></div> : history ? <>
          <div className="source-control-history-filter"><Select size="small" aria-label="选择历史代码库" value={historyRepo?.id} options={historyRepositoryOptions.map(repository => ({ value: repository.id, label: repository.name }))} onChange={id => { setHistoryRepository(id); setHistoryWorktree(''); setBranch('all'); setQuery(''); }} /><Select size="small" aria-label="选择历史工作树" value={historyCheckout?.worktreeId} options={historyOptions.map(worktree => ({value: worktree.worktreeId, label: worktreeLabel(worktree) + (worktree.branch ? " · " + worktree.branch : "")}))} onChange={id => { setHistoryWorktree(id); setBranch("all"); setQuery(""); setFileKey(""); setCommitHash(""); }} /><Select size="small" aria-label="筛选历史分支" value={branch} options={[{ value: 'all', label: '全部本机分支' }, ...(historyRead.data?.branches.map(item => item.name) || historyRepo?.branches || []).map(name => ({ value: name, label: name }))]} onChange={setBranch} /><Input size="small" allowClear prefix={<SearchOutlined />} placeholder="搜索提交、作者或任务" aria-label="搜索提交历史" value={query} onChange={event => setQuery(event.target.value)} /></div>
          {historyRead.loading && !historyRead.data ? <div className="source-control-list-state"><Spin size="small" /><p>正在读取历史…</p></div> : historyRead.error && !historyRead.data ? <div className="source-control-list-state"><p>历史暂不可读取。</p></div> : historyRepo?.worktreeCount === null || historyCheckout?.status === 'offline' ? <div className="source-control-list-state"><p>该代码库历史暂不可读取。</p><Button size="small" onClick={() => void retry(historyRepo!.id)}>重新读取</Button></div> : commits.length ? <ol className="source-control-graph">{commits.map(commit => <li key={commit.hash} className={commit.hash === selectedCommit?.hash ? 'is-selected' : ''}><CommitInfoPopover commit={commit} onOpenTask={onOpenTask}><button type="button" aria-label={'查看提交 ' + commit.subject} onClick={() => { setCommitHash(commit.hash); setFileKey(commit.files[0] ? fileIdentity(commit.files[0]) : ''); }}><span className="source-control-graph-dot" /><span className="source-control-graph-copy"><strong>{commit.subject}</strong><span><code>{commit.shortHash}</code><span>{commit.authorName}</span><time>{formatShortDateTime(commit.committedAt)}</time></span><span className="source-control-graph-refs">{commit.branches.map(name => <Tag key={name}>{name}</Tag>)}{commit.tags.map(tag => <Tag key={tag} color="gold">{tag}</Tag>)}{commit.taskId && <small>关联任务</small>}</span></span></button></CommitInfoPopover></li>)}</ol> : <div className="source-control-list-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? '没有匹配的提交' : '当前范围暂无提交'} /></div>}
          <p className="source-control-list-note">本机可达记录，包含未推送提交。{readNote(historyRead.data)}</p>{historyRead.data?.coverage.nextCursor && <Button size="small" className="source-control-load-more" loading={historyRead.loading} onClick={() => void historyRead.refresh({cursor: historyRead.data!.coverage.nextCursor!}, (previous, next) => ({...next, commits: [...new Map([...(previous?.commits || []), ...next.commits].map(commit => [commit.hash, commit])).values()]}))}>继续读取历史</Button>}
        </> : <>
          <SourceControlChanges repositories={visibleRepositories} names={names} exact={exactScope} expanded={expanded} onToggle={toggle} selectedKey={effectiveFileKey} onPick={pickFile} onRetry={id => void retry(id)} />
        </>}
      </div>
</div>} />
      <footer className="source-control-observed">{observation.readAt ? "读取时间 · " + formatShortDateTime(observation.readAt) : observation.loading ? "正在读取…" : "尚未取得记录"}<span>本机记录</span></footer>
    </aside>} second={<section className="source-control-reader" data-prototype-position="scm-reader">
      <ReadingToggle className="source-control-reading-toggle" expanded={readingExpanded} onToggle={() => setReadingExpanded(value => !value)} />
      <div className="source-control-checkout" data-prototype-position="checkout"><CodeLocationSummary
        repositoryName={selectedRepository?.name || '全部代码库'} location={observedSource?.location || location}
        branch={selectedWorktree?.branch} worktreeName={selectedWorktree ? worktreeLabel(selectedWorktree) : undefined}
        taskId={observedSource?.taskId || undefined} area={target.area} observedRevision={observedRevision} kind={observedSource?.kind}
        commitHash={history ? selectedCommit?.hash : undefined} />
        {history && selectedCommit && <span data-prototype-position="task-link"><CommitInfoPopover commit={selectedCommit} onOpenTask={onOpenTask}><Button type="text" size="small" icon={<InfoCircleOutlined />} aria-label="查看完整提交信息" /></CommitInfoPopover></span>}
      </div>
      {!history && currentFile && selectedWorktree && selectedRepository && !visibleSources.some(source => source.repository.id === selectedRepository.id && source.worktree.worktreeId === selectedWorktree.worktreeId) && <div className="source-control-outside-filter" role="status">当前文件来源不在筛选范围内。<Button type="link" size="small" onClick={resetScope}>查看全部</Button></div>}
      {(observation.error || observation.diagnostics.length || observation.truncated) && <Alert type="warning" showIcon message={observation.error ? '读取失败，保留已有内容。' : '部分范围未能完整读取。'} description={[observation.error, ...observation.diagnostics, observation.truncated ? '代码库读取达到上限。' : ''].filter(Boolean).join('；')} action={<Button size="small" onClick={() => void retry()}>重新读取</Button>} />}
      {history && historyRead.error && <Alert type="warning" showIcon message={historyRead.data ? '历史刷新失败，保留已读取记录。' : '历史暂不可读取。'} description={historyRead.error} action={<Button size="small" onClick={() => void historyRead.refresh()}>重试</Button>} />}
      {history && commitRead.error && <Alert type="warning" showIcon message="提交文件暂不可读取。" description={commitRead.error} action={<Button size="small" onClick={() => void commitRead.refresh()}>重试</Button>} />}
      {diffRead.error && scene !== 'full-file' && <Alert type="warning" showIcon message={diffRead.data ? '差异刷新失败，保留已读取内容。' : '差异暂不可读取。'} description={diffRead.error} action={<Button size="small" onClick={() => void diffRead.refresh()}>重试</Button>} />}
      {observation.loading && !repositories.length ? <div className="source-control-reader-state"><Spin /><p>正在读取代码库…</p></div> : <>
        {history && selectedCommit && <ObjectTabStrip className="source-control-commit-files" label="提交中的文件" closable={false}
          tabs={selectedCommit.files.map(file => ({ key: fileIdentity(file), kind: 'svc', title: file.path, label: file.path.split('/').at(-1), accessibleLabel: file.path }))}
          active={currentFile ? fileIdentity(currentFile) : null} onActivate={setFileKey} />}
        {scene === 'full-file' && currentFile ? <div className="source-control-full-file"><header><strong>完整文件</strong><Button size="small" onClick={() => changeScene(returnScene)}>返回差异</Button></header><RepositoryFileBrowser global readerActive files={fullFiles} selectedPath={currentFile.path} onSelect={() => {}} repositoryName={selectedRepository?.name} repositoryId={selectedRepository?.id} checkoutId={selectedWorktree?.worktreeId} context={null} location={file?.source.location || location} version={fileVersion} historical={Boolean(file?.source.commitHash || history)} onRetry={() => { setFilePage({key: '', page: 0}); setFileReload(value => ({key: targetKey, version: value.version + 1})); }} onViewCurrent={() => onViewCurrent?.({repositoryId: selectedRepository!.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile.path, location, area: 'unstaged'})} canModify={false} observedRevision={file?.revision} observedDigest={file?.digest} observedAt={file?.observedAt} readLoading={fullRead.loading} readError={fullRead.error} readMessage={[file?.message, readNote(file)].filter(Boolean).join('；')} readPage={file?.page} sizeBytes={file?.sizeBytes} selectionKey={targetKey} onReadPage={page => setFilePage({key: targetKey, page, revision: file?.revision})} /></div> : <div className={'source-control-diff' + (history ? ' is-history' : '')}>{!history && currentFile && <div className="source-control-history-version"><strong>{areaLabels[currentFile.area]}</strong><span>{currentFile.area === 'staged' ? '上次提交 → 暂存内容' : currentFile.area === 'unstaged' ? '暂存内容 → 当前文件' : '新文件 · 尚未跟踪'}</span></div>}{(diffRead.loading || commitRead.loading) && <div className="source-control-read-status" role="status"><Spin size="small" /> {history && commitRead.loading ? '正在读取提交文件…' : '正在读取差异…'}</div>}{diffRead.data?.file.previewTruncated && <Alert type="warning" showIcon message="差异达到读取上限，当前内容不完整。" />}{diffRead.data?.binary && <Alert type="info" showIcon message="非文本内容，不提供文本差异。" />}<TaskDiffReader key={(selectedRepository?.id || '') + ':' + (selectedWorktree?.worktreeId || '') + ':' + (history ? selectedCommit?.hash || 'empty' : 'current')} repositories={rail} selected={effectiveFileKey} onSelect={key => { const selected = candidateFiles.find(candidate => changedFileKey(layerFile(candidate, history ? selectedCommit?.hash : undefined)) === key); if (selected) setFileKey(fileIdentity(selected)); }} onOpenFile={openFullFile} notice={history ? ['历史差异固定到 ' + (selectedCommit?.hash || '所选提交'), commitRead.data ? commitRead.data.baseHash ? '比较第一父提交 ' + commitRead.data.baseHash : '根提交，与空内容比较' : '', readNote(commitRead.data), readNote(diffRead.data)].filter(Boolean).join(' · ') : readNote(diffRead.data)} /></div>}

      </>}
    </section>} />
  </section>;
}
