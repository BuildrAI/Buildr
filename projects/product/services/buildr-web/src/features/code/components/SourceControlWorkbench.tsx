import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Segmented, Spin, Tooltip } from 'antd';
import { ArrowRightOutlined, DownOutlined, InfoCircleOutlined, ProjectOutlined, ReloadOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { TaskDiffReader, type RailRepository } from '../../task/components/TaskDiffReader';
import { changedFileKey } from '../../task/components/TaskChangedFiles';
import { RepositoryFileBrowser, type RepositoryPreviewFile } from '../../workspace/components/RepositoryFileBrowser';
import { ReadingToggle } from '../../../components/ReadingToggle';
import { ResizablePanels } from '../../../components/ResizablePanels';
import { SourceControlHistory } from './SourceControlHistory';
import { SourceControlImagePreview } from './SourceControlImagePreview';
import { CommitInfoPopover } from './CommitInfoPopover';
import { CommitInfoContent } from './CommitInfoContent';
import { CodeLocationDetails, CodeLocationSummary } from './CodeLocationSummary';
import { SourceControlRepositoryTree, SourceControlChanges, layerFile, worktreeLabel } from './SourceControlRepositories';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { useSourceControlRead } from '../hooks/useSourceControlRead';
import { sourceControlAbsolutePath, sourceControlChange, sourceControlCommit, sourceControlFileKey as fileIdentity, sourceControlWorktreeKey, type SourceControlCommit, type SourceControlFileTarget, type SourceControlWorktree, type SourceControlObservation, type SourceControlReader, type SourceControlRepository, type SourceControlScene, type SourceControlScopeSelection } from '../source-control-model';
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
  const [selectedWorktreeKey, setSelectedWorktreeKey] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [catalogExpanded, setCatalogExpanded] = useState(true);
  const [sourceDetailsExpanded, setSourceDetailsExpanded] = useState(false);
  const sourceDetailsId = useId();
  const [query, setQuery] = useState(''), [composing, setComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [changeFileKey, setChangeFileKey] = useState(''), [historyFileKey, setHistoryFileKey] = useState('');
  const [commitHash, setCommitHash] = useState(''), [commitSummary, setCommitSummary] = useState<SourceControlCommit>();
  const [historyReaderMode, setHistoryReaderMode] = useState<'detail' | 'file'>('detail');
  const [commitBaseHash, setCommitBaseHash] = useState<string | null>(null);
  const [returnScene, setReturnScene] = useState<SourceControlScene>('changes');
  const [readingExpanded, setReadingExpanded] = useState(false), [refreshToken, setRefreshToken] = useState(0);
  const [filePage, setFilePage] = useState<{key: string; page: number; revision?: string}>({key: '', page: 0});
  const [fileReload, setFileReload] = useState({key: '', version: 0});
  const previousScene = useRef(scene), appliedSelection = useRef('');
  const [selectionEpoch, setSelectionEpoch] = useState('');
  const taskSelections = useRef(new Map<string, {selectedWorktreeKey: string; changeFileKey: string; historyFileKey: string; commitHash: string; commitSummary?: SourceControlCommit; commitBaseHash: string | null; historyReaderMode: 'detail' | 'file'; scene: SourceControlScene; returnScene: SourceControlScene}>());
  const history = scene === 'history' || scene === 'full-file' && returnScene === 'history';
  const sources = repositories.flatMap(repository => repository.worktrees.map(worktree => ({repository, worktree})));
  const selectedSource = scopeSelection && selectionEpoch !== scopeSelection.key ? undefined : selectedWorktreeKey ? sources.find(({repository, worktree}) => sourceControlWorktreeKey(repository.id, worktree.worktreeId) === selectedWorktreeKey) : sources.find(({worktree}) => worktree.isMain) || sources[0];
  const selectedRepository = selectedSource?.repository, selectedWorktree = selectedSource?.worktree;
  const selectedIdentity = selectedSource ? sourceControlWorktreeKey(selectedSource.repository.id, selectedSource.worktree.worktreeId) : '';
  useEffect(() => { setSourceDetailsExpanded(false); }, [selectedIdentity]);
  const fileKey = history ? historyFileKey : changeFileKey;
  const setFileKey = history ? setHistoryFileKey : setChangeFileKey;
  useEffect(() => { if (!selectedWorktreeKey && selectedIdentity && !scopeSelection) setSelectedWorktreeKey(selectedIdentity); }, [selectedWorktreeKey, selectedIdentity, scopeSelection]);
  useEffect(() => {
    if (composing) return;
    const normalized = query.trim();
    if (Array.from(normalized).length < 2) { setSearchQuery(''); return; }
    const timer = setTimeout(() => setSearchQuery(normalized), 250);
    return () => clearTimeout(timer);
  }, [query, composing]);
  useEffect(() => {
    if (scene === 'history' && previousScene.current !== 'full-file') setReturnScene('history');
    else if (scene !== 'full-file') setReturnScene(scene);
    previousScene.current = scene;
  }, [scene]);
  useEffect(() => {
    if (!scopeSelection || !observation.readAt || appliedSelection.current === scopeSelection.key) return;
    appliedSelection.current = scopeSelection.key;
    const saved = task ? taskSelections.current.get(task.id) : undefined;
    const validKeys = scopeSelection.worktrees.map(item => sourceControlWorktreeKey(item.repositoryId, item.worktreeId));
    const savedValid = saved && validKeys.includes(saved.selectedWorktreeKey) && sources.some(({repository, worktree}) => sourceControlWorktreeKey(repository.id, worktree.worktreeId) === saved.selectedWorktreeKey);
    const first = scopeSelection.worktrees[0];
    setSelectedWorktreeKey(savedValid ? saved.selectedWorktreeKey : first ? sourceControlWorktreeKey(first.repositoryId, first.worktreeId) : 'missing-task:' + (task?.id || scopeSelection.key));
    setChangeFileKey(savedValid ? saved.changeFileKey : ''); setHistoryFileKey(savedValid ? saved.historyFileKey : '');
    setCommitHash(savedValid ? saved.commitHash : ''); setCommitSummary(savedValid ? saved.commitSummary : undefined); setCommitBaseHash(savedValid ? saved.commitBaseHash : null); setHistoryReaderMode(savedValid ? saved.historyReaderMode : 'detail');
    setQuery(''); setSearchQuery('');
    setReturnScene(savedValid ? saved.returnScene : 'changes');
    if (scene !== 'task') onScene(savedValid ? saved.scene : 'changes');
    setSelectionEpoch(scopeSelection.key);
  }, [scopeSelection, observation.readAt, repositories, task, onScene, scene]);
  useEffect(() => {
    if (task && scopeSelection && selectionEpoch === scopeSelection.key) taskSelections.current.set(task.id, {selectedWorktreeKey: selectedIdentity, changeFileKey, historyFileKey, commitHash, commitSummary, commitBaseHash, historyReaderMode, scene, returnScene});
  }, [task, scopeSelection, selectionEpoch, selectedIdentity, changeFileKey, historyFileKey, commitHash, commitSummary, commitBaseHash, historyReaderMode, scene, returnScene]);
  const version = observation.readAt + ':' + refreshToken;
  const historyInput: CodeSourceControlInput = { repositoryId: selectedRepository?.id, worktreeId: selectedWorktree?.worktreeId, query: searchQuery || undefined, limit: 100 };
  const historyRead = useSourceControlRead(JSON.stringify([readKey, historyInput]), historyInput, reader.history, Boolean(history && selectedWorktree && selectedWorktree.status !== 'offline'), version);
  const commits = historyRead.data?.commits.map(commit => sourceControlCommit(commit)) || [];
  const selectedCommit = commitSummary?.hash === commitHash ? commitSummary : undefined;
  const candidateFiles = !selectedWorktree || selectedWorktree.status === 'offline' ? [] : history ? selectedCommit?.files || [] : selectedWorktree.changes;
  const currentFile = history && historyReaderMode === 'detail' ? undefined : candidateFiles.find(file => fileIdentity(file) === fileKey) || (!history ? candidateFiles[0] : undefined);
  useEffect(() => { if (currentFile && !fileKey) setFileKey(previous => previous || fileIdentity(currentFile)); }, [currentFile, fileKey, setFileKey]);
  const associatedTask = selectedWorktree?.taskId ? {id: selectedWorktree.taskId, title: selectedWorktree.taskTitle || selectedWorktree.taskId} : undefined;
  const location = selectedWorktree?.location || '';
  const target: CodeSourceControlInput = { repositoryId: selectedRepository?.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile?.path, area: history ? 'commit' : currentFile?.area,
    commitHash: history ? selectedCommit?.hash : undefined, expectedRevision: history ? undefined : selectedWorktree?.observedRevision || undefined };
  const targetKey = JSON.stringify([readKey, target]);
  const diffRead = useSourceControlRead(targetKey, target, reader.diff, Boolean(currentFile && scene !== 'full-file'), version);
  const imagePreview = diffRead.data?.imagePreview;
  const fullImage = imagePreview?.after === null && imagePreview.before?.kind === 'image' ? imagePreview.before : undefined;
  const displayedFile = currentFile && diffRead.data ? { ...currentFile, ...sourceControlChange(diffRead.data.file), area: currentFile.area, preview: diffRead.data.patch } : currentFile;
  const effectiveFileKey = displayedFile ? changedFileKey(layerFile(displayedFile, history ? selectedCommit?.hash : undefined)) : null;
  const rail: RailRepository[] = selectedRepository ? [{ id: selectedRepository.id, label: selectedRepository.name, root: location,
    branch: selectedWorktree?.branch ?? null, ahead: selectedWorktree?.ahead ?? null, status: selectedWorktree?.status === 'offline' ? 'unavailable' : 'complete',
    changes: displayedFile ? [layerFile(displayedFile, history ? selectedCommit?.hash : undefined)] : [], commits: [] }] : [];
  const continuingPage = filePage.key === targetKey && Boolean(filePage.revision);
  const fullInput: CodeSourceControlInput = { ...target, page: continuingPage ? filePage.page : undefined,
    expectedRevision: continuingPage ? filePage.revision : history || fileReload.key === targetKey ? undefined : diffRead.data?.observedRevision || target.expectedRevision };
  const fullRead = useSourceControlRead(JSON.stringify([targetKey, fullInput.page, fullInput.expectedRevision]), fullInput, reader.sourceFile, Boolean(scene === 'full-file' && currentFile && !fullImage), version + ':' + fileReload.version);
  // A deleted image's old side is already verified; keep its exact source rather than requesting a missing current file.
  const file = fullImage ? {...fullImage,readAt:fullImage.observedAt,observedRevision:fullImage.revision,coverage:{limit:fullImage.limitBytes,truncated:fullImage.truncated,nextCursor:null},diagnostics:[]} : fullRead.data;
  const fullFiles: RepositoryPreviewFile[] = file ? [{ path: file.path, kind: file.kind, content: file.content, image: file.kind === 'image' ? file.content : undefined }] : [];
  const observedSource = scene === 'full-file' ? file?.source : diffRead.data?.source;
  const sourceLocation = {repositoryName: selectedRepository?.name || '全部代码库', location: observedSource?.location || location,
    branch: selectedWorktree?.branch, worktreeName: selectedWorktree ? worktreeLabel(selectedWorktree) : undefined,
    taskId: selectedWorktree?.taskId || observedSource?.taskId || undefined, area: target.area, kind: observedSource?.kind,
    commitHash: scene === 'full-file' && file?.source.commitHash ? file.source.commitHash : history ? selectedCommit?.hash : undefined};
  const fileVersion = file?.source.version || (history && selectedCommit ? selectedCommit.hash + ' · 历史文件' : (selectedWorktree ? selectedWorktree.branch || selectedWorktree.head?.slice(0, 8) || '—' : '') + (currentFile?.area === 'staged' ? ' · 已暂存版本' : ' · 当前文件'));
  const comparison = history ? '提交变更' : currentFile?.area === 'staged' ? '已暂存 · 上次提交 → 暂存' : currentFile?.area === 'unstaged' ? '未暂存 · 暂存 → 当前' : '未跟踪 · 新文件';
  const comparisonDescription = history ? ['旧版本：' + (diffRead.data ? diffRead.data.baseHash || '空内容（根提交）' : commitBaseHash || '父提交（正在读取）'), '新版本：' + (selectedCommit?.hash || '尚未选择')].join('\n') : currentFile?.area === 'staged' ? '旧版本：上次提交\n新版本：暂存内容' : currentFile?.area === 'unstaged' ? '旧版本：暂存内容\n新版本：当前文件' : '新文件，尚未跟踪，没有旧版本';
  const filePresentation = currentFile ? {absolutePath: sourceControlAbsolutePath(sourceLocation.location, currentFile.path), previousAbsolutePath: sourceControlAbsolutePath(sourceLocation.location, displayedFile?.previousPath || undefined), comparison, comparisonDescription} : undefined;
  function changeScene(next: SourceControlScene) { onScene(next); }
  function pickFile(key: string) { setFileKey(key); if (scene === 'full-file') changeScene(returnScene); }
  function pickWorktree(repository: SourceControlRepository, worktree: SourceControlWorktree) {
    if (sourceControlWorktreeKey(repository.id, worktree.worktreeId) === selectedIdentity) return;
    setSelectedWorktreeKey(sourceControlWorktreeKey(repository.id, worktree.worktreeId));
    setChangeFileKey(''); setHistoryFileKey(''); setCommitHash(''); setCommitSummary(undefined); setCommitBaseHash(null); setHistoryReaderMode('detail');
    setQuery(''); setSearchQuery(''); setFilePage({key: '', page: 0});
    if (scene === 'full-file') changeScene(returnScene);
  }
  function toggle(key: string, defaultExpanded = true) { setExpanded(value => ({...value, [key]: !(value[key] ?? defaultExpanded)})); }
  async function retry(repositoryId?: string) { await (onRetry ? onRetry(repositoryId) : onRefresh()); setRefreshToken(value => value + 1); }
  async function refresh() { await onRefresh(); setFilePage({key: '', page: 0}); setRefreshToken(value => value + 1); }
  function openFullFile() {
    if (!currentFile || !selectedRepository) return;
    setReturnScene(scene === 'full-file' ? returnScene : scene);
    if (!fullImage) onOpenFile?.({ repositoryId: selectedRepository.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile.path, location, area: target.area, commitHash: target.commitHash, taskId: target.taskId, expectedRevision: target.expectedRevision });
    onScene('full-file');
  }
  return <section className="source-control-workbench" aria-label="源代码管理" data-prototype-position="scm-panels">
    <ResizablePanels direction="horizontal" className="source-control-columns" initialSize={360} minFirst={260} minSecond={300} firstHidden={readingExpanded} storageKey={layoutStorageKey ? layoutStorageKey + ':columns' : undefined} separatorLabel="调整源代码管理与阅读区宽度" first={<aside className="source-control-sidebar">
      <header className="source-control-title"><button type="button" className="source-control-catalog-toggle" aria-label={catalogExpanded ? '折叠代码库列表' : '展开代码库列表'} aria-expanded={catalogExpanded} onClick={() => setCatalogExpanded(value => !value)}>{catalogExpanded ? <DownOutlined /> : <RightOutlined />}<strong>源代码管理</strong></button><Tooltip title="重新读取本机代码状态"><Button type="text" size="small" aria-label="刷新源代码管理" icon={<ReloadOutlined spin={observation.loading} />} onClick={() => void refresh()} /></Tooltip></header>
      <ResizablePanels direction="vertical" className="source-control-stack" firstHidden={!catalogExpanded} storageKey={layoutStorageKey ? layoutStorageKey + ':stack' : undefined} initialRatio={0.42} minFirst={120} minSecond={180} separatorLabel="调整代码库与浏览区高度"
        first={<div className="source-control-catalog-pane">
        <SourceControlRepositoryTree repositories={repositories} ready={Boolean(observation.readAt)} expanded={expanded} onToggle={toggle}
          selectedWorktreeKey={selectedIdentity} onPick={pickWorktree} onOpenTask={onOpenTask} />
        {task && <div className="source-control-task-origin" data-prototype-position="task-link"><span>来自任务 · {task.title}</span><Button type="link" size="small" onClick={() => onOpenTask(task.id)}>返回任务 <ArrowRightOutlined /></Button></div>}
        </div>}
        second={<div className="source-control-browser">      <div className="source-control-browse-tabs"><Segmented block value={history ? 'history' : 'changes'} options={[{ label: '未提交变更', value: 'changes' }, { label: '提交历史', value: 'history' }]} onChange={value => changeScene(value as SourceControlScene)} /></div>

      <div className="source-control-list" data-prototype-position={history ? 'history-list' : 'change-list'}>

        {observation.loading && !observation.readAt ? <div className="source-control-list-state"><Spin size="small" /><p>正在读取本机记录…</p></div> : history ? <>
          <div className="source-control-history-search"><Input size="small" allowClear prefix={<SearchOutlined />} placeholder="搜索提交、作者或任务编号（至少2字符）" aria-label="搜索提交历史" value={query} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setComposing(false); setQuery(event.currentTarget.value); }} onChange={event => setQuery(event.target.value)} />{Array.from(query.trim()).length === 1 && <small>输入至少2个字符开始搜索</small>}</div>
          {historyRead.loading && !historyRead.data ? <div className="source-control-list-state"><Spin size="small" /><p>正在读取历史…</p></div> : historyRead.error && !historyRead.data ? <div className="source-control-list-state"><p>历史暂不可读取。</p></div> : selectedRepository?.worktreeCount === null || selectedWorktree?.status === 'offline' ? <div className="source-control-list-state"><p>该工作树历史暂不可读取。</p><Button size="small" onClick={() => void retry(selectedRepository?.id)}>重新读取</Button></div> : commits.length ? <SourceControlHistory key={selectedIdentity} commits={commits} expanded={expanded} onToggle={toggle} selectedHash={selectedCommit?.hash} selectedFileKey={effectiveFileKey} reader={reader} readKey={readKey} version={version} repositoryId={selectedRepository!.id} worktreeId={selectedWorktree!.worktreeId} worktreeLocation={location} onOpenTask={onOpenTask} onSelect={commit => { if (commit.hash !== commitHash) setHistoryFileKey(''); setCommitHash(commit.hash); setCommitSummary(commit); setHistoryReaderMode('detail'); if (scene === 'full-file') changeScene('history'); }} onPick={(commit, file, baseHash) => { setHistoryReaderMode('file'); setCommitBaseHash(baseHash); setCommitHash(commit.hash); setCommitSummary(commit); setHistoryFileKey(fileIdentity(file)); if (scene === 'full-file') changeScene('history'); }} /> : <div className="source-control-list-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={searchQuery ? '没有匹配的提交' : '当前分支暂无提交'} /></div>}
          <p className="source-control-list-note">当前分支的本机记录，包含未推送提交。{readNote(historyRead.data)}</p>{historyRead.data?.coverage.nextCursor && <Button size="small" className="source-control-load-more" loading={historyRead.loading} onClick={() => void historyRead.refresh({cursor: historyRead.data!.coverage.nextCursor!}, (previous, next) => ({...next, commits: [...new Map([...(previous?.commits || []), ...next.commits].map(commit => [commit.hash, commit])).values()]}))}>继续读取历史</Button>}
        </> : <>
          <SourceControlChanges repositories={selectedRepository ? [selectedRepository] : []} names={[]} exact={selectedIdentity ? [selectedIdentity] : []} expanded={expanded} onToggle={toggle} selectedKey={effectiveFileKey} onPick={pickFile} onRetry={id => void retry(id)} />
        </>}
      </div>
</div>} />
      <footer className="source-control-observed">{observation.readAt ? "读取时间 · " + formatShortDateTime(observation.readAt) : observation.loading ? "正在读取…" : "尚未取得记录"}<span>本机记录</span></footer>
    </aside>} second={<section className="source-control-reader" data-prototype-position="scm-reader">
      <ReadingToggle className="source-control-reading-toggle" expanded={readingExpanded} onToggle={() => setReadingExpanded(value => !value)} />
      <div className="source-control-checkout" data-prototype-position="checkout"><CodeLocationSummary {...sourceLocation} expanded={sourceDetailsExpanded} detailsId={sourceDetailsId} onToggle={() => setSourceDetailsExpanded(value => !value)} />
        {history && selectedCommit && <span data-prototype-position="task-link"><CommitInfoPopover placement="bottomRight" commit={selectedCommit} onOpenTask={onOpenTask}><Button type="text" size="small" icon={<InfoCircleOutlined />} aria-label="查看完整提交信息" onClick={() => { setHistoryReaderMode('detail'); if (scene === 'full-file') changeScene('history'); }} /></CommitInfoPopover></span>}
        {associatedTask && <Tooltip title={'任务：' + associatedTask.title}><Button className="source-control-selected-task" type="text" size="small" icon={<ProjectOutlined />} aria-label={'打开工作树任务 ' + associatedTask.title} onClick={() => onOpenTask(associatedTask.id)} /></Tooltip>}
      </div>
      {sourceDetailsExpanded && <CodeLocationDetails {...sourceLocation} id={sourceDetailsId} onClose={() => setSourceDetailsExpanded(false)} />}
      {(observation.error || observation.diagnostics.length || observation.truncated) && <Alert type="warning" showIcon message={observation.error ? '读取失败，保留已有内容。' : '部分范围未能完整读取。'} description={[observation.error, ...observation.diagnostics, observation.truncated ? '代码库读取达到上限。' : ''].filter(Boolean).join('；')} action={<Button size="small" onClick={() => void retry()}>重新读取</Button>} />}
      {history && historyRead.error && <Alert type="warning" showIcon message={historyRead.data ? '历史刷新失败，保留已读取记录。' : '历史暂不可读取。'} description={historyRead.error} action={<Button size="small" onClick={() => void historyRead.refresh()}>重试</Button>} />}

      {diffRead.error && scene !== 'full-file' && <Alert type="warning" showIcon message={diffRead.data ? '差异刷新失败，保留已读取内容。' : '差异暂不可读取。'} description={diffRead.error} action={<Button size="small" onClick={() => void diffRead.refresh()}>重试</Button>} />}
      {observation.loading && !repositories.length ? <div className="source-control-reader-state"><Spin /><p>正在读取代码库…</p></div> : <>
        {history && selectedCommit && historyReaderMode === 'detail' ? <div className="source-control-commit-detail"><CommitInfoContent commit={selectedCommit} onOpenTask={onOpenTask} /></div> : !currentFile ? <div className="source-control-reader-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={history ? '选择提交查看详情，展开后选择文件查看差异' : selectedWorktree?.status === 'offline' ? '当前工作树暂不可读取' : selectedWorktree ? '当前工作树没有未提交文件' : selectedWorktreeKey ? '所选工作树已不可用，请重新选择' : '选择代码库或工作树查看内容'} /></div> : <>
        {scene === 'full-file' && currentFile ? <div className="source-control-full-file"><header><strong>{imagePreview?.after === null && fullImage ? '删除前图片' : '完整文件'}</strong><Button size="small" onClick={() => changeScene(returnScene)}>返回差异</Button></header><RepositoryFileBrowser global readerActive files={fullFiles} selectedPath={currentFile.path} onSelect={() => {}} repositoryName={selectedRepository?.name} repositoryId={selectedRepository?.id} checkoutId={selectedWorktree?.worktreeId} context={null} location={file?.source.location || location} version={fileVersion} historical={Boolean(file?.source.commitHash || history)} onRetry={() => { if (fullImage) { changeScene(returnScene); setRefreshToken(value => value + 1); } else { setFilePage({key: '', page: 0}); setFileReload(value => ({key: targetKey, version: value.version + 1})); } }} onViewCurrent={() => onViewCurrent?.({repositoryId: selectedRepository!.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile.path, location, area: 'unstaged'})} canModify={false} observedRevision={file?.revision} observedDigest={file?.digest} observedAt={file?.observedAt} readLoading={!fullImage && fullRead.loading} readError={fullImage ? undefined : fullRead.error} readMessage={[file?.message, readNote(file)].filter(Boolean).join('；')} readPage={file?.page} sizeBytes={file?.sizeBytes} selectionKey={targetKey} onReadPage={page => setFilePage({key: targetKey, page, revision: file?.revision})} /></div> : <div className={'source-control-diff' + (history ? ' is-history' : '')}>{diffRead.loading && <div className="source-control-read-status" role="status"><Spin size="small" /> 正在读取差异…</div>}{diffRead.data?.file.previewTruncated && <Alert type="warning" showIcon message="差异达到读取上限，当前内容不完整。" />}{diffRead.data?.binary && !imagePreview && <Alert type="info" showIcon message="非文本内容，不提供文本差异。" />}<TaskDiffReader key={(selectedRepository?.id || '') + ':' + (selectedWorktree?.worktreeId || '') + ':' + (history ? selectedCommit?.hash || 'empty' : 'current')} repositories={rail} filePresentation={filePresentation} previewContent={imagePreview ? <SourceControlImagePreview key={targetKey} preview={imagePreview} area={diffRead.data!.area} /> : undefined} selected={effectiveFileKey} onSelect={key => { const selected = candidateFiles.find(candidate => changedFileKey(layerFile(candidate, history ? selectedCommit?.hash : undefined)) === key); if (selected) setFileKey(fileIdentity(selected)); }} onOpenFile={openFullFile} notice={readNote(diffRead.data)} /></div>}
        </>}
      </>}
    </section>} />
  </section>;
}
