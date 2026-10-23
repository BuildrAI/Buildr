import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Empty, Input, Segmented, Spin, Tooltip } from 'antd';
import { ArrowRightOutlined, DownOutlined, InfoCircleOutlined, ProjectOutlined, ReloadOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { TaskDiffReader, type RailRepository } from '../../task/components/TaskDiffReader';
import { changedFileKey } from '../../task/components/TaskChangedFiles';
import { RepositoryFileBrowser, type RepositoryPreviewFile } from '../../workspace/components/RepositoryFileBrowser';
import { ObjectTabStrip } from '../../../components/ObjectTabStrip';
import { ReadingToggle } from '../../../components/ReadingToggle';
import { ResizablePanels } from '../../../components/ResizablePanels';
import { tabElementId } from '../../../lib/tab-navigation';
import { SourceControlHistory } from './SourceControlHistory';
import { SourceControlImagePreview } from './SourceControlImagePreview';
import { SourceControlDiffEditor } from './SourceControlDiffEditor';
import { CommitInfoPopover } from './CommitInfoPopover';
import { CommitInfoContent } from './CommitInfoContent';
import { CodeLocationDetails, CodeLocationSummary } from './CodeLocationSummary';
import { SourceControlRepositoryTree, SourceControlChanges, layerFile, worktreeLabel, type SourceControlRowContext } from './SourceControlRepositories';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { useSourceControlRead } from '../hooks/useSourceControlRead';
import { sourceControlWorkingChanges, sourceControlAbsolutePath, sourceControlDefaultSource, sourceControlChange, sourceControlCommit, sourceControlFileKey as fileIdentity, sourceControlWorktreeKey, type SourceControlChange, type SourceControlCommit, type SourceControlFileTarget, type SourceControlWorktree, type SourceControlObservation, type SourceControlReader, type SourceControlRepository, type SourceControlScene, type SourceControlScopeSelection } from '../source-control-model';
import type { CodeSourceControlInput } from '../api/code-api';
import { codeRepositoryCode, codeRepositoryLabel } from '../code-source-labels';
import type { CodeSourceTarget } from '../code-source-selection';
import '../source-control.css';
export type { SourceControlChange, SourceControlCommit, SourceControlRepository, SourceControlFileTarget, SourceControlScene, SourceControlState } from '../source-control-model';

export type SourceControlBranchExtension = {
  historyRange(repository: SourceControlRepository, worktree: SourceControlWorktree): {branch?: string; authorEmail?: string};
  viewChanges?(repositoryId:string, worktreeId:string):void;
  selection?: {key: string; repositoryId: string; worktreeId: string; scene: 'changes' | 'history'};
  rowControl(repository: SourceControlRepository, worktree: SourceControlWorktree, ready: boolean, context: SourceControlRowContext): ReactNode;
  rowActions?(repository: SourceControlRepository, worktree: SourceControlWorktree, ready: boolean, context: SourceControlRowContext): ReactNode;
  syncAction?(repository: SourceControlRepository, worktree: SourceControlWorktree): {pending: boolean; run(): void};
  historyControls(repository: SourceControlRepository, worktree: SourceControlWorktree, controls: {query: string; active?: boolean; clearSearch(): void}): ReactNode;
};

type Props = {
  active?: boolean;
  repositories: SourceControlRepository[]; defaultRepositories?: SourceControlRepository[]; scene: SourceControlScene; reader: SourceControlReader; readKey: string;
  observation: SourceControlObservation; onRefresh(): void | Promise<void>; onRetry?(repositoryId?: string): void | Promise<void>; onClone?(repositoryId: string): void;
  catalogActions?: ReactNode; catalogFeedback?: ReactNode;
  onScene(scene: SourceControlScene): void; onOpenTask(taskId: string): void;
  onOpenFile?(target: SourceControlFileTarget): void; onViewCurrent?(target: SourceControlFileTarget): void;
  onDiscard?(repository: SourceControlRepository, worktree: SourceControlWorktree, file?: SourceControlChange): void;
  discardPending?: boolean;
  renderChangeActions?(repository: SourceControlRepository, worktree: SourceControlWorktree, active: boolean): ReactNode;
  editableWorkspaceId?: string;
  task?: { id: string; title: string }; scopeSelection?: SourceControlScopeSelection; layoutStorageKey?: string; branchExtension?: SourceControlBranchExtension;
  currentSourceSelection?: {key: string; targets: CodeSourceTarget[]; preferredTarget?: CodeSourceTarget} | null;
  sourceEntryKey?: string;
  onCurrentSourceSelect?(target: CodeSourceTarget): void;
};
const readNote = (data: { coverage: { limit: number; truncated: boolean }; diagnostics: Array<{message: string}> } | null) => data ? [data.coverage.truncated ? '当前读取范围不完整。' : '', ...data.diagnostics.map(item => item.message)].filter(Boolean).join('；') : '';
const readingSelectors = ['.source-control-list', '.source-control-commit-detail', '.task-diff-body', '.task-diff-split-side', '.task-diff-split-gutter', '.source-control-full-file .cm-scroller', '.source-control-editable-diff .cm-scroller', '.source-control-editable-diff .cm-mergeView'];
type ReadingPosition = {selector: string; index: number; top: number; left: number};
type WorktreeReading = {
  changeFileKey: string; historyFileKey: string; commitHash: string; commitSummary?: SourceControlCommit; commitBaseHash: string | null;
  historyReaderMode: 'detail' | 'file'; query: string; searchQuery: string;
  filePage: {key: string; page: number; revision?: string}; diffMode: 'split' | 'unified'; sourceDetailsExpanded: boolean;
  positions: ReadingPosition[];
};
function readingPositions(root: HTMLElement | null): ReadingPosition[] {
  return readingSelectors.flatMap(selector => [...(root?.querySelectorAll<HTMLElement>(selector) || [])].map((element, index) => ({selector, index, top:element.scrollTop, left:element.scrollLeft})));
}

/** Shared view: all observed facts and reads come from the caller, including in the offline prototype. */
export function SourceControlWorkbench({ active = true, repositories, defaultRepositories, scene, reader, readKey, observation, onRefresh, onRetry, onClone, onScene, onOpenTask, onOpenFile, onViewCurrent, task, scopeSelection, sourceEntryKey, currentSourceSelection, onCurrentSourceSelect, layoutStorageKey, branchExtension, renderChangeActions, onDiscard, discardPending, catalogActions, catalogFeedback, editableWorkspaceId }: Props) {
  const workbench = useRef<HTMLElement>(null);
  const [selectedWorktreeKey, setSelectedWorktreeKey] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [catalogExpanded, setCatalogExpanded] = useState(true);
  const [sourceDetailsExpanded, setSourceDetailsExpanded] = useState(false);
  const sourceDetailsId = useId(), readerPanelId = useId();
  const [query, setQuery] = useState(''), [composing, setComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [changeFileKey, setChangeFileKey] = useState(''), [historyFileKey, setHistoryFileKey] = useState('');
  const [commitHash, setCommitHash] = useState(''), [commitSummary, setCommitSummary] = useState<SourceControlCommit>();
  const [historyReaderMode, setHistoryReaderMode] = useState<'detail' | 'file'>('detail');
  const [commitBaseHash, setCommitBaseHash] = useState<string | null>(null);
  const [returnScene, setReturnScene] = useState<SourceControlScene>('changes');
  const [readingExpanded, setReadingExpanded] = useState(false), [refreshToken, setRefreshToken] = useState(0);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [filePage, setFilePage] = useState<{key: string; page: number; revision?: string}>({key: '', page: 0});
  const [fileReload, setFileReload] = useState({key: '', version: 0});
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>('split');
  const [listMode, setListMode] = useState<'changes' | 'history'>('changes');
  const sourceReadings = useRef(new Map<string, WorktreeReading>());
  const restoreReading = useRef<{key: string; reading: WorktreeReading} | null>(null);
  const wasActive = useRef(active);
  const appliedCurrentSource = useRef(''), currentEntry = useRef('');
  const entryBaseline = useRef({key:'', sourceKey:''});
  const previousScene = useRef(scene), appliedSelection = useRef('');
  const [selectionEpoch, setSelectionEpoch] = useState('');
  const taskSelections = useRef(new Map<string, {selectedWorktreeKey: string; changeFileKey: string; historyFileKey: string; commitHash: string; commitSummary?: SourceControlCommit; commitBaseHash: string | null; historyReaderMode: 'detail' | 'file'; scene: SourceControlScene; returnScene: SourceControlScene}>());
  const history = scene === 'history' || scene === 'full-file' && returnScene === 'history';
  // The sidebar list and the reader choose independently: switching a reader tab keeps the list where the user left it.
  const showHistoryList = listMode === 'history';
  const sources = repositories.flatMap(repository => repository.worktrees.map(worktree => ({repository, worktree})));
  const selectedSource = scopeSelection && selectionEpoch !== scopeSelection.key ? undefined : selectedWorktreeKey ? sources.find(({repository, worktree}) => sourceControlWorktreeKey(repository.id, worktree.worktreeId) === selectedWorktreeKey) : sourceControlDefaultSource(defaultRepositories || repositories);
  const selectedRepository = selectedSource?.repository, selectedWorktree = selectedSource?.worktree;
  const selectedIdentity = selectedSource ? sourceControlWorktreeKey(selectedSource.repository.id, selectedSource.worktree.worktreeId) : '';
  const entryIntentKey = sourceEntryKey || scopeSelection?.key;
  useEffect(() => {
    if (active && entryIntentKey && entryBaseline.current.key !== entryIntentKey) entryBaseline.current = {key:entryIntentKey, sourceKey:currentSourceSelection?.key || ''};
  }, [active, entryIntentKey]);
  function rememberReading() {
    if (!selectedIdentity || restoreReading.current) return;
    sourceReadings.current.set(selectedIdentity, {changeFileKey, historyFileKey, commitHash, commitSummary, commitBaseHash, historyReaderMode, query, searchQuery, filePage, diffMode, sourceDetailsExpanded,
      positions:readingPositions(workbench.current)});
  }
  function switchSource(nextKey: string, nextScene?: SourceControlScene) {
    if (nextKey === selectedIdentity) { if (nextScene && nextScene !== scene) onScene(nextScene); return; }
    rememberReading();
    const saved = sourceReadings.current.get(nextKey);
    setSelectedWorktreeKey(nextKey);
    setChangeFileKey(saved?.changeFileKey || ''); setHistoryFileKey(saved?.historyFileKey || '');
    setCommitHash(saved?.commitHash || ''); setCommitSummary(saved?.commitSummary); setCommitBaseHash(saved?.commitBaseHash || null);
    setHistoryReaderMode(saved?.historyReaderMode || 'detail'); setQuery(saved?.query || ''); setSearchQuery(saved?.searchQuery || ''); setComposing(false);
    setFilePage(saved?.filePage || {key:'',page:0}); setDiffMode(saved?.diffMode || diffMode); setSourceDetailsExpanded(saved?.sourceDetailsExpanded || false);
    const next = nextScene || (scene === 'full-file' ? returnScene : scene);
    setReturnScene(next); onScene(next);
    restoreReading.current = saved ? {key:nextKey, reading:saved} : null;
  }
  const historyRange = selectedRepository && selectedWorktree ? branchExtension?.historyRange(selectedRepository, selectedWorktree) : undefined;
  useEffect(() => {
    const selection = branchExtension?.selection;
    if (!selection) return;
    const nextWorktreeKey = sourceControlWorktreeKey(selection.repositoryId, selection.worktreeId);
    onCurrentSourceSelect?.({repositoryId:selection.repositoryId, checkoutId:selection.worktreeId});
    switchSource(nextWorktreeKey, selection.scene);
  }, [branchExtension?.selection?.key]);
  // The moving HEAD updates the list, never the user's fixed commit selection.
  const branchHistoryRevision = branchExtension ? historyRange?.branch || '' : undefined;
  const previousBranchHistory = useRef({identity: '', revision: branchHistoryRevision, author: historyRange?.authorEmail});
  useEffect(() => {
    const previous = previousBranchHistory.current;
    previousBranchHistory.current = {identity: selectedIdentity, revision: branchHistoryRevision, author: historyRange?.authorEmail};
    // A Task caller has its own selection restoration; only invalidate a changed history scope in this entry.
    if (!branchExtension || previous.identity !== selectedIdentity || previous.revision === branchHistoryRevision && previous.author === historyRange?.authorEmail) return;
    setHistoryFileKey(''); setCommitHash(''); setCommitSummary(undefined); setHistoryReaderMode('detail'); setCommitBaseHash(null);
    if (scene === 'full-file' && returnScene === 'history') onScene('history');
  }, [branchHistoryRevision, historyRange?.authorEmail, selectedIdentity]);
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
    if (!active || !scopeSelection || !observation.readAt || appliedSelection.current === scopeSelection.key) return;
    if (entryBaseline.current.key === scopeSelection.key && entryBaseline.current.sourceKey !== (currentSourceSelection?.key || '')) {
      appliedSelection.current = scopeSelection.key; currentEntry.current = scopeSelection.key; setSelectionEpoch(scopeSelection.key); return;
    }
    appliedCurrentSource.current = currentSourceSelection?.key || '';
    currentEntry.current = scopeSelection.key;
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
    const currentTarget = savedValid ? scopeSelection.worktrees.find(item => sourceControlWorktreeKey(item.repositoryId, item.worktreeId) === saved.selectedWorktreeKey) : first;
    if (currentTarget) onCurrentSourceSelect?.({repositoryId:currentTarget.repositoryId, checkoutId:currentTarget.worktreeId});
  }, [active, scopeSelection, observation.readAt, repositories, task, onScene, scene, currentSourceSelection]);
  useEffect(() => {
    if (!active || !observation.readAt) return;
    const entry = scopeSelection?.key || '';
    if (entry && entry !== currentEntry.current) { currentEntry.current = entry; appliedCurrentSource.current = currentSourceSelection?.key || ''; return; }
    currentEntry.current = entry;
    const selection = currentSourceSelection;
    if (!selection || appliedCurrentSource.current === selection.key || scopeSelection && selectionEpoch !== scopeSelection.key) return;
    appliedCurrentSource.current = selection.key;
    const existing = selection.targets.find(target => sourceControlWorktreeKey(target.repositoryId, target.checkoutId) === selectedIdentity);
    const target = selection.preferredTarget || existing || selection.targets[0];
    if (target) switchSource(sourceControlWorktreeKey(target.repositoryId, target.checkoutId));
  }, [active, currentSourceSelection, scopeSelection?.key, selectionEpoch, observation.readAt]);
  useEffect(() => {
    if (task && scopeSelection && selectionEpoch === scopeSelection.key) taskSelections.current.set(task.id, {selectedWorktreeKey: selectedIdentity, changeFileKey, historyFileKey, commitHash, commitSummary, commitBaseHash, historyReaderMode, scene, returnScene});
  }, [task, scopeSelection, selectionEpoch, selectedIdentity, changeFileKey, historyFileKey, commitHash, commitSummary, commitBaseHash, historyReaderMode, scene, returnScene]);
  const version = (selectedRepository?.readVersion ?? observation.readAt) + ':' + refreshToken;
  const historyVersion = JSON.stringify([selectedRepository?.refsVersion, selectedWorktree?.head, selectedWorktree?.branch, historyRange, refreshToken]);
  const detailVersion = history ? String(refreshToken) : version;
  const historyInput: CodeSourceControlInput = { repositoryId: selectedRepository?.id, worktreeId: selectedWorktree?.worktreeId, branch: historyRange?.branch, authorEmail: historyRange?.authorEmail, query: searchQuery || undefined, limit: 100 };
  const historyRead = useSourceControlRead(JSON.stringify([readKey, historyInput]), historyInput, reader.history, Boolean(active && (history || showHistoryList) && selectedWorktree && selectedWorktree.status !== 'offline'), historyVersion);
  const commits = historyRead.data?.commits.map(commit => sourceControlCommit(commit)) || [];
  const selectedCommit = commitSummary?.hash === commitHash ? commitSummary : undefined;
  const candidateFiles = !selectedWorktree ? [] : history ? selectedCommit?.files || [] : sourceControlWorkingChanges(selectedWorktree.changes);
  const listedFile = history && historyReaderMode === 'detail' ? undefined : candidateFiles.find(file => fileIdentity(file) === fileKey) || (!history && !fileKey ? candidateFiles[0] : undefined);
  const fileScope = JSON.stringify([readKey, selectedIdentity]);
  const observedFiles = useRef(new Map<string, NonNullable<typeof listedFile>>());
  if (listedFile && !history) observedFiles.current.set(JSON.stringify([fileScope, fileIdentity(listedFile)]), listedFile);
  // Saving or restoring the last change can remove its list row. Keep this exact
  // current file open so its shared undo history and unsaved input remain reachable.
  const currentFile = listedFile || (!history && editableWorkspaceId ? observedFiles.current.get(JSON.stringify([fileScope, fileKey])) : undefined);
  useEffect(() => { if (currentFile && !fileKey) setFileKey(previous => previous || fileIdentity(currentFile)); }, [currentFile, fileKey, setFileKey]);
  const associatedTask = selectedWorktree?.taskId ? {id: selectedWorktree.taskId, title: selectedWorktree.taskTitle || selectedWorktree.taskId} : undefined;
  const location = selectedWorktree?.location || '';
  const target: CodeSourceControlInput = { repositoryId: selectedRepository?.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile?.path, area: history ? 'commit' : currentFile?.area,
    commitHash: history ? selectedCommit?.hash : undefined, expectedRevision: history ? undefined : selectedWorktree?.observedRevision || undefined };
  const targetKey = JSON.stringify([readKey, {...target, expectedRevision: undefined}]);
  // An invalidation counter can change before the refreshed catalog arrives.
  // Current diffs wait for that actual observation, avoiding a request with the
  // preceding SCM revision after every autosave. Explicit refresh still rereads.
  const diffVersion = history ? detailVersion : (target.expectedRevision || '') + ':' + refreshToken;
  // The live entry reads the selected comparison as it exists now. Its list may
  // still be refreshing after a save; the server verifies its own read revision.
  // Fixed/task readers retain their original snapshot precondition.
  const diffInput = editableWorkspaceId && !history ? { ...target, expectedRevision: undefined } : target;
  const diffRead = useSourceControlRead(targetKey, diffInput, reader.diff, Boolean(active && selectedWorktree?.status !== 'offline' && currentFile && scene !== 'full-file' && (listedFile || !editableWorkspaceId)), diffVersion);
  const imagePreview = diffRead.data?.imagePreview;
  const liveDiff = editableWorkspaceId && diffRead.data && !history && ['unstaged', 'untracked', 'working'].includes(diffRead.data.area)
    && !diffRead.data.binary && !diffRead.data.file.previewTruncated && !['deleted', 'conflicted'].includes(diffRead.data.file.status)
    && diffRead.data.source.checkoutId ? diffRead.data : undefined;
  const readonlyDiffReason = history ? '历史版本仅供查看。' : currentFile?.area === 'staged' ? '暂存版本仅供查看；选择未暂存变更可编辑当前文件。'
    : currentFile?.status === 'deleted' ? '当前文件已删除。' : diffRead.data?.binary ? '非文本内容不支持直接编辑。'
    : diffRead.data?.file.previewTruncated ? '内容达到读取上限，当前比较不完整。' : currentFile?.status === 'conflicted' ? '索引仍有冲突，请先核对当前文件。' : undefined;
  const fullImage = imagePreview?.after === null && imagePreview.before?.kind === 'image' ? imagePreview.before : undefined;
  const displayedFile = currentFile && diffRead.data ? { ...currentFile, ...sourceControlChange(diffRead.data.file), area: currentFile.area, preview: diffRead.data.patch } : currentFile;
  const effectiveFileKey = displayedFile ? changedFileKey(layerFile(displayedFile, history ? selectedCommit?.hash : undefined)) : null;
  const rail: RailRepository[] = selectedRepository ? [{ id: selectedRepository.id, label: codeRepositoryLabel(selectedRepository), root: location,
    branch: selectedWorktree?.branch ?? null, ahead: selectedWorktree?.ahead ?? null, status: selectedWorktree?.status === 'offline' ? 'unavailable' : 'complete',
    changes: displayedFile ? [layerFile(displayedFile, history ? selectedCommit?.hash : undefined)] : [], commits: [] }] : [];
  const continuingPage = filePage.key === targetKey && Boolean(filePage.revision);
  const fullInput: CodeSourceControlInput = { ...target, page: continuingPage ? filePage.page : undefined,
    expectedRevision: continuingPage ? filePage.revision : history || fileReload.key === targetKey ? undefined : target.expectedRevision };
  const fullRead = useSourceControlRead(JSON.stringify([targetKey, fullInput.page]), fullInput, reader.sourceFile, Boolean(active && selectedWorktree?.status !== 'offline' && scene === 'full-file' && currentFile && !fullImage), detailVersion + ':' + fileReload.version);
  // A deleted image's old side is already verified; keep its exact source rather than requesting a missing current file.
  const file = fullImage ? {...fullImage,readAt:fullImage.observedAt,observedRevision:fullImage.revision,coverage:{limit:fullImage.limitBytes,truncated:fullImage.truncated,nextCursor:null},diagnostics:[]} : fullRead.data;
  useEffect(() => {
    const returning = active && !wasActive.current;
    wasActive.current = active;
    const saved = sourceReadings.current.get(selectedIdentity);
    if (returning && saved && !restoreReading.current) restoreReading.current = {key:selectedIdentity, reading:saved};
  }, [active, selectedIdentity]);
  useEffect(() => {
    const restore = restoreReading.current;
    if (!active || !restore || restore.key !== selectedIdentity) return;
    if (history && historyRead.loading || scene === 'full-file' && fullRead.loading || scene !== 'full-file' && currentFile && diffRead.loading) return;
    let frame = 0;
    const apply = () => {
      if (restoreReading.current !== restore) return;
      // The editable comparison reads its complete file and baseline after the
      // patch arrives. Restore only once its real scroll containers are mounted.
      if (liveDiff && scene !== 'full-file' && workbench.current?.querySelector('.source-control-diff-loading')) return;
      for (const position of restore.reading.positions) {
        const element = workbench.current?.querySelectorAll<HTMLElement>(position.selector)[position.index];
        if (element) {element.scrollTop = position.top; element.scrollLeft = position.left;}
      }
      restoreReading.current = null;
      observer.disconnect();
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(apply); };
    const observer = new MutationObserver(schedule);
    if (workbench.current) observer.observe(workbench.current, {childList:true, subtree:true});
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [active, selectedIdentity, scene, historyRead.loading, fullRead.loading, diffRead.loading, currentFile, liveDiff]);
  useEffect(() => { if (active) rememberReading(); }, [active, selectedIdentity, changeFileKey, historyFileKey, commitHash, commitSummary, commitBaseHash, historyReaderMode, scene, returnScene, query, searchQuery, filePage, diffMode, sourceDetailsExpanded]);
  useEffect(() => {
    if (!active) return;
    const element = workbench.current;
    const remember = () => rememberReading();
    element?.addEventListener('scroll', remember, true);
    return () => element?.removeEventListener('scroll', remember, true);
  }, [active, selectedIdentity, changeFileKey, historyFileKey, commitHash, commitSummary, commitBaseHash, historyReaderMode, scene, returnScene, query, searchQuery, filePage, diffMode, sourceDetailsExpanded]);
  const fullFiles: RepositoryPreviewFile[] = file ? [{ path: file.path, kind: file.kind, content: file.content, image: file.kind === 'image' ? file.content : undefined }] : [];
  const observedSource = scene === 'full-file' ? file?.source : diffRead.data?.source;
  const sourceLocation = {repositoryName: selectedRepository ? codeRepositoryCode(selectedRepository) : '全部代码库', repositoryTitle: selectedRepository ? codeRepositoryLabel(selectedRepository) : '全部代码库', location: observedSource?.location || location,
    branch: selectedWorktree?.branch, worktreeName: selectedWorktree ? worktreeLabel(selectedWorktree) : undefined,
    taskId: selectedWorktree?.taskId || observedSource?.taskId || undefined, area: target.area, kind: observedSource?.kind,
    commitHash: scene === 'full-file' && file?.source.commitHash ? file.source.commitHash : history ? selectedCommit?.hash : undefined};
  const fileVersion = file?.source.version || (history && selectedCommit ? selectedCommit.hash + ' · 历史文件' : (selectedWorktree ? selectedWorktree.branch || selectedWorktree.head?.slice(0, 8) || '—' : '') + (currentFile?.area === 'staged' ? ' · 已暂存版本' : ' · 当前文件'));
  const comparison = history ? '提交变更' : currentFile?.area === 'working' ? '更改 · 上次提交 → 当前文件' : currentFile?.area === 'staged' ? '已暂存 · 上次提交 → 暂存' : currentFile?.area === 'unstaged' ? '未暂存 · 暂存 → 当前' : '未跟踪 · 新文件';
  const comparisonDescription = history ? ['旧版本：' + (diffRead.data ? diffRead.data.baseHash || '空内容（根提交）' : commitBaseHash || '父提交（正在读取）'), '新版本：' + (selectedCommit?.hash || '尚未选择')].join('\n') : currentFile?.area === 'working' ? '旧版本：最近一次提交（新增文件为空）\n新版本：当前文件' : currentFile?.area === 'staged' ? '旧版本：上次提交\n新版本：暂存内容' : currentFile?.area === 'unstaged' ? '旧版本：暂存内容\n新版本：当前文件' : '新文件，尚未跟踪，没有旧版本';
  const filePresentation = currentFile ? {absolutePath: sourceControlAbsolutePath(sourceLocation.location, currentFile.path), previousAbsolutePath: sourceControlAbsolutePath(sourceLocation.location, displayedFile?.previousPath || undefined), comparison, comparisonDescription} : undefined;
  function changeScene(next: SourceControlScene) { onScene(next); }
  // A change row always reads as an uncommitted diff, whatever the reader was showing.
  function pickFile(key: string) { setChangeFileKey(key); if (scene !== 'changes') changeScene('changes'); }
  function pickWorktree(repository: SourceControlRepository, worktree: SourceControlWorktree) {
    onCurrentSourceSelect?.({repositoryId:repository.id, checkoutId:worktree.worktreeId});
    switchSource(sourceControlWorktreeKey(repository.id, worktree.worktreeId));
  }
  function toggle(key: string, defaultExpanded = true) { setExpanded(value => ({...value, [key]: !(value[key] ?? defaultExpanded)})); }
  // A running clone finishes outside this view; poll lightly while any is in flight.
  const cloningIds = repositories.filter(repository => repository.clone?.state === 'cloning').map(repository => repository.id).sort().join(',');
  useEffect(() => {
    if (!cloningIds) return;
    const timer = setInterval(() => void (onRetry ? onRetry() : onRefresh()), 3000);
    return () => clearInterval(timer);
  }, [cloningIds]);
  async function retry(repositoryId?: string) { await (onRetry ? onRetry(repositoryId) : onRefresh()); setRefreshToken(value => value + 1); }
  async function refresh() { await onRefresh(); setFilePage({key: '', page: 0}); setRefreshToken(value => value + 1); }
  function openFullFile() {
    if (!currentFile || !selectedRepository) return;
    setReturnScene(scene === 'full-file' ? returnScene : scene);
    if (!fullImage) onOpenFile?.({ repositoryId: selectedRepository.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile.path, location, area: target.area, commitHash: target.commitHash, taskId: target.taskId, expectedRevision: target.expectedRevision });
    onScene('full-file');
  }
  const historySearch = <div className="source-control-history-search"><Input size="small" allowClear prefix={<SearchOutlined />} placeholder="搜索提交、作者或任务编号（至少2字符）" aria-label="搜索提交历史" value={query} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setComposing(false); setQuery(event.currentTarget.value); }} onChange={event => setQuery(event.target.value)} />{Array.from(query.trim()).length === 1 && <small>输入至少2个字符开始搜索</small>}</div>;
  return <section ref={workbench} className="source-control-workbench" aria-label="源代码管理" data-prototype-position="scm-panels" data-current-repository={selectedRepository?.id} data-current-checkout={selectedWorktree?.worktreeId}>
    <ResizablePanels direction="horizontal" className="source-control-columns" initialSize={360} minFirst={260} minSecond={300} firstHidden={readingExpanded} storageKey={layoutStorageKey ? layoutStorageKey + ':columns' : undefined} separatorLabel="调整源代码管理与阅读区宽度" first={<aside className="source-control-sidebar">
      <header className="source-control-title"><button type="button" className="source-control-catalog-toggle" aria-label={catalogExpanded ? '折叠代码库列表' : '展开代码库列表'} aria-expanded={catalogExpanded} onClick={() => setCatalogExpanded(value => !value)}>{catalogExpanded ? <DownOutlined /> : <RightOutlined />}<strong>代码库</strong></button><div className="source-control-catalog-actions">{catalogActions}<Tooltip title="重新读取本机代码状态"><Button type="text" size="small" aria-label="刷新源代码管理" icon={<ReloadOutlined spin={observation.loading} />} onClick={() => void refresh()} /></Tooltip></div></header>
      <ResizablePanels direction="vertical" className="source-control-stack" firstHidden={!catalogExpanded} storageKey={layoutStorageKey ? layoutStorageKey + ':stack' : undefined} initialRatio={renderChangeActions ? 0.29 : branchExtension ? 0.30 : 0.42} minFirst={120} minSecond={180} separatorLabel="调整代码库与浏览区高度"
        first={<div className="source-control-catalog-pane">
        {catalogFeedback}
        <SourceControlRepositoryTree repositories={repositories} ready={Boolean(observation.readAt)} active={catalogExpanded && !readingExpanded} expanded={expanded} onToggle={toggle}
          selectedWorktreeKey={selectedIdentity} onPick={pickWorktree} onOpenTask={onOpenTask} onClone={onClone} renderWorktreeControl={branchExtension?.rowControl} renderWorktreeActions={branchExtension?.rowActions} syncAction={branchExtension?.syncAction} />
        {task && <div className="source-control-task-origin" data-prototype-position="task-link"><span>来自任务 · {task.title}</span><Button type="link" size="small" onClick={() => onOpenTask(task.id)}>返回任务 <ArrowRightOutlined /></Button></div>}
        </div>}
        second={<div className="source-control-browser">      <div className="source-control-browse-tabs"><Segmented block value={listMode} options={[{ label: '未提交变更', value: 'changes' }, { label: '提交历史', value: 'history' }]} onChange={value => setListMode(value as 'changes' | 'history')} /></div>
      {!showHistoryList && selectedRepository && selectedWorktree && renderChangeActions?.(selectedRepository, selectedWorktree, active)}
      <div className="source-control-list" data-prototype-position={showHistoryList ? 'history-list' : 'change-list'}>

        {observation.loading && !observation.readAt ? <div className="source-control-list-state"><Spin size="small" /><p>正在读取本机记录…</p></div> : showHistoryList ? <>
          {branchExtension ? <div className="source-control-history-toolbar" data-prototype-position="history-filters">{historySearch}{selectedRepository && selectedWorktree && branchExtension.historyControls(selectedRepository, selectedWorktree, {query, active, clearSearch: () => { setQuery(''); setSearchQuery(''); }})}</div> : historySearch}
          {historyRead.loading && !historyRead.data ? <div className="source-control-list-state"><Spin size="small" /><p>正在读取历史…</p></div> : historyRead.error && !historyRead.data ? <div className="source-control-list-state"><p>历史暂不可读取。</p></div> : selectedRepository?.worktreeCount === null || selectedWorktree?.status === 'offline' ? <div className="source-control-list-state"><p>该工作树历史暂不可读取。</p><Button size="small" onClick={() => void retry(selectedRepository?.id)}>重新读取</Button></div> : commits.length ? <SourceControlHistory active={active} key={selectedIdentity + ':' + JSON.stringify(historyRange || {})} commits={commits} expanded={expanded} onToggle={toggle} selectedHash={history ? selectedCommit?.hash : undefined} selectedFileKey={history ? effectiveFileKey : null} reader={reader} readKey={readKey} version={String(refreshToken)} repositoryId={selectedRepository!.id} worktreeId={selectedWorktree!.worktreeId} worktreeLocation={location} onOpenTask={onOpenTask} onSelect={commit => { if (commit.hash !== commitHash) setHistoryFileKey(''); setCommitHash(commit.hash); setCommitSummary(commit); setHistoryReaderMode('detail'); changeScene('history'); }} onPick={(commit, file, baseHash) => { setHistoryReaderMode('file'); setCommitBaseHash(baseHash); setCommitHash(commit.hash); setCommitSummary(commit); setHistoryFileKey(fileIdentity(file)); changeScene('history'); }} /> : <div className="source-control-list-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={searchQuery || historyRange?.authorEmail || historyRange?.branch ? '没有匹配的提交' : '当前分支暂无提交'} /></div>}
          <p className="source-control-list-note">{historyRange?.branch ? '当前查看范围的本机记录。' : '当前分支的本机记录，包含未推送提交。'}{readNote(historyRead.data)}</p>{historyRead.data?.coverage.nextCursor && <Button size="small" className="source-control-load-more" loading={historyRead.loading} onClick={() => void historyRead.refresh({cursor: historyRead.data!.coverage.nextCursor!}, (previous, next) => ({...next, commits: [...new Map([...(previous?.commits || []), ...next.commits].map(commit => [commit.hash, commit])).values()]}))}>继续读取历史</Button>}
        </> : <>
          <SourceControlChanges onDiscard={onDiscard} discardPending={discardPending} repositories={selectedRepository ? [selectedRepository] : []} names={[]} exact={selectedIdentity ? [selectedIdentity] : []} expanded={expanded} onToggle={toggle} selectedKey={history ? null : effectiveFileKey} onPick={pickFile} onRetry={id => void retry(id)} />
        </>}
      </div>
</div>} />
      <footer className="source-control-observed">{observation.readAt ? "读取时间 · " + formatShortDateTime(observation.readAt) : observation.loading ? "正在读取…" : "尚未取得记录"}<span>本机记录</span></footer>
    </aside>} second={<section className="source-control-reader" data-prototype-position="scm-reader">
      <div className="source-control-reader-tabs"><ObjectTabStrip panelId={readerPanelId} className="source-control-view-tabs" label="源代码管理视图" closable={false} active={history ? 'history' : 'changes'} onActivate={key => changeScene(key === 'history' ? 'history' : 'changes')} tabs={[{key:'changes',kind:'chg',title:'未提交变更'},{key:'history',kind:'doc',title:'提交历史'}]} />{(currentFile || (history && selectedCommit) || readingExpanded) && <ReadingToggle iconOnly className="source-control-reading-toggle" expanded={readingExpanded} onToggle={() => setReadingExpanded(value => !value)} />}</div>
      <div className="source-control-reader-body" id={readerPanelId} role="tabpanel" aria-labelledby={tabElementId(readerPanelId, history ? 'history' : 'changes')}>
      <div className="source-control-checkout" data-prototype-position="checkout"><CodeLocationSummary {...sourceLocation} expanded={sourceDetailsExpanded} detailsId={sourceDetailsId} onToggle={() => setSourceDetailsExpanded(value => !value)} />
        {history && selectedCommit && <span data-prototype-position="task-link"><CommitInfoPopover placement="bottomRight" commit={selectedCommit} onOpenTask={onOpenTask}><Button type="text" size="small" icon={<InfoCircleOutlined />} aria-label="查看完整提交信息" onClick={() => { setHistoryReaderMode('detail'); if (scene === 'full-file') changeScene('history'); }} /></CommitInfoPopover></span>}
        {associatedTask && <Tooltip title={'任务：' + associatedTask.title}><Button className="source-control-selected-task" type="text" size="small" icon={<ProjectOutlined />} aria-label={'打开工作树任务 ' + associatedTask.title} onClick={() => onOpenTask(associatedTask.id)} /></Tooltip>}
      </div>
      {sourceDetailsExpanded && <CodeLocationDetails {...sourceLocation} id={sourceDetailsId} onClose={() => setSourceDetailsExpanded(false)} />}
      {(() => { const notes = [...new Set([observation.error, ...observation.diagnostics, observation.truncated ? '代码库读取达到上限。' : ''].filter(Boolean))]; return notes.length ? <Alert type="warning" showIcon className="source-control-diagnostics" message={observation.error ? '读取失败，保留已有内容。' : notes.length > 1 ? `部分范围未能完整读取，共 ${notes.length} 条说明。` : '部分范围未能完整读取。'} description={notes.length > 1 && !diagnosticsExpanded ? notes[0] + ' 等…' : <ul className="source-control-diagnostic-list">{notes.map(note => <li key={note}>{note}</li>)}</ul>} action={<div className="source-control-diagnostic-actions">{notes.length > 1 && <Button size="small" type="text" aria-expanded={diagnosticsExpanded} aria-label={diagnosticsExpanded ? '收起说明' : '展开全部说明'} onClick={() => setDiagnosticsExpanded(value => !value)}>{diagnosticsExpanded ? '收起' : '展开'}</Button>}<Button size="small" onClick={() => void retry()}>重新读取</Button></div>} /> : null; })()}
      {history && historyRead.error && <Alert type="warning" showIcon message={historyRead.data ? '历史刷新失败，保留已读取记录。' : '历史暂不可读取。'} description={historyRead.error} action={<Button size="small" onClick={() => void historyRead.refresh()}>重试</Button>} />}

      {diffRead.error && scene !== 'full-file' && !(editableWorkspaceId && !listedFile && diffRead.data) && <Alert type="warning" showIcon message={diffRead.data ? '差异刷新失败，保留已读取内容。' : '差异暂不可读取。'} description={diffRead.error} action={<Button size="small" onClick={() => void diffRead.refresh()}>重试</Button>} />}
      {observation.loading && !repositories.length ? <div className="source-control-reader-state"><Spin /><p>正在读取代码库…</p></div> : <>
        {history && selectedCommit && historyReaderMode === 'detail' ? <div className="source-control-commit-detail"><CommitInfoContent commit={selectedCommit} onOpenTask={onOpenTask} /></div> : !currentFile ? <div className="source-control-reader-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={history ? '选择提交查看详情，展开后选择文件查看差异' : selectedWorktree?.status === 'offline' ? '当前工作树暂不可读取' : selectedWorktree && fileKey ? '所选文件已不在当前改动列表中' : selectedWorktree ? '当前工作树没有未提交文件' : selectedWorktreeKey ? '所选工作树已不可用，请重新选择' : '选择代码库或工作树查看内容'} /></div> : <>
        {scene === 'full-file' && currentFile ? <div className="source-control-full-file"><header><strong>{imagePreview?.after === null && fullImage ? '删除前图片' : '完整文件'}</strong><Button size="small" onClick={() => changeScene(returnScene)}>返回差异</Button></header><RepositoryFileBrowser global readerActive files={fullFiles} selectedPath={currentFile.path} onSelect={() => {}} repositoryName={selectedRepository ? codeRepositoryCode(selectedRepository) : undefined} repositoryTitle={selectedRepository ? codeRepositoryLabel(selectedRepository) : undefined} repositoryId={selectedRepository?.id} checkoutId={selectedWorktree?.worktreeId} context={null} location={file?.source.location || location} version={fileVersion} historical={Boolean(file?.source.commitHash || history)} onRetry={() => { if (fullImage) { changeScene(returnScene); setRefreshToken(value => value + 1); } else { setFilePage({key: '', page: 0}); setFileReload(value => ({key: targetKey, version: value.version + 1})); } }} onViewCurrent={() => onViewCurrent?.({repositoryId: selectedRepository!.id, worktreeId: selectedWorktree?.worktreeId, path: currentFile.path, location, area: 'unstaged'})} canModify={false} observedRevision={file?.revision} observedDigest={file?.digest} observedAt={file?.observedAt} readLoading={!fullImage && fullRead.loading} readError={fullImage ? undefined : fullRead.error} readMessage={[file?.message, readNote(file)].filter(Boolean).join('；')} readPage={file?.page} sizeBytes={file?.sizeBytes} selectionKey={targetKey} onReadPage={page => setFilePage({key: targetKey, page, revision: file?.revision})} /></div> : <div className={'source-control-diff' + (history ? ' is-history' : '')}>{diffRead.loading && !diffRead.data && <div className="source-control-read-status" role="status"><Spin size="small" /> 正在读取差异…</div>}{diffRead.data?.file.previewTruncated && <Alert type="warning" showIcon message="差异达到读取上限，当前内容不完整。" />}{diffRead.data?.binary && !imagePreview && <Alert type="info" showIcon message="非文本内容，不提供文本差异。" />}<TaskDiffReader key={(selectedRepository?.id || '') + ':' + (selectedWorktree?.worktreeId || '') + ':' + (history ? selectedCommit?.hash || 'empty' : 'current')} repositories={rail} filePresentation={filePresentation} viewMode={diffMode} onViewModeChange={setDiffMode} readOnlyReason={readonlyDiffReason} renderDiff={liveDiff ? mode => <SourceControlDiffEditor workspaceId={editableWorkspaceId!} diff={liveDiff} reader={reader} mode={mode} /> : undefined} previewContent={imagePreview ? <SourceControlImagePreview key={targetKey} preview={imagePreview} area={diffRead.data!.area} /> : undefined} selected={effectiveFileKey} onSelect={key => { const selected = candidateFiles.find(candidate => changedFileKey(layerFile(candidate, history ? selectedCommit?.hash : undefined)) === key); if (selected) setFileKey(fileIdentity(selected)); }} onOpenFile={openFullFile} notice={readNote(diffRead.data)} /></div>}
        </>}
      </>}
      </div>
    </section>} />
  </section>;
}
