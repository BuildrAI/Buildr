import { useTaskFileDiff } from '../hooks/useTaskFileDiff';
import { SplitDivider } from '../../../components/SplitDivider';
import { App, Button, Segmented, Spin, Tooltip } from 'antd';
import { BranchesOutlined, CheckOutlined, CopyOutlined, DownOutlined, FileAddOutlined, MenuFoldOutlined, MenuUnfoldOutlined, RightOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChangedFileList, changedFileKey, type ChangedFileEntry } from './TaskChangedFiles';
import type { TaskCommit } from './task-commit-model';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { diffContentRows, parseUnifiedDiff, pairForSplit } from './diff-text';
import './task-diff-reader.css';

type DiffMode = 'split' | 'unified';

function fileName(path: string) { return path.split('/').at(-1) || path; }
function fileDir(path: string) { const index = path.lastIndexOf('/'); return index < 0 ? '' : path.slice(0, index); }

export type RailCommit = { key: string; commit: TaskCommit; files: ChangedFileEntry[] };
export type RailRepository = {
  id: string;
  label: string;
  root: string;
  branch: string | null;
  ahead: number | null;
  status: 'complete' | 'unavailable' | 'truncated';
  message?: string;
  changes: ChangedFileEntry[];
  commits: RailCommit[];
};

/** Persistent master-detail workbench: repository tree on the left, diff pane on the right. */
export function TaskDiffReader({ repositories, selected, onSelect, notice, taskId, refreshVersion, readScope, onRegisterRefresh, onOpenFile, previewContent, filePresentation }: {
  taskId?: string;
  refreshVersion?: string;
  readScope?: string;
  onRegisterRefresh?(refresh: (() => Promise<void>) | null): void;
  repositories: RailRepository[];
  selected: string | null;
  onSelect(key: string | null): void;
  notice?: ReactNode;
  onOpenFile?(file: ChangedFileEntry, repository: RailRepository, commit?: RailCommit): void;
  previewContent?: ReactNode;
  filePresentation?: { absolutePath?: string; previousAbsolutePath?: string; comparison: string; comparisonDescription?: string };
}) {
  const { message } = App.useApp();
  const [view, setView] = useState<DiffMode>('split');
  const [splitRoom, setSplitRoom] = useState(false);
  const [stacked, setStacked] = useState(false);
  const readerRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [railPeek, setRailPeek] = useState(false);
  const [railWidth, setRailWidth] = useState(320);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { if (!railCollapsed) setRailPeek(false); }, [railCollapsed]);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [fileCommit, setFileCommit] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const selectFile = (key: string, commitKey: string | null = null) => { setSelectedCommit(null); setFileCommit(commitKey); setSelectionVersion(value => value + 1); onSelect(key); };
  const [openCommits, setOpenCommits] = useState<Record<string, boolean>>({});
  useEffect(() => { setCopied(false); }, [selected, filePresentation?.absolutePath]);
  const [openRepos, setOpenRepos] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const start = dragStart.current;
      if (!start) return;
      const next = Math.min(480, Math.max(220, start.width + event.clientX - start.x));
      setRailWidth(next);
    };
    const stop = () => { setDragging(false); dragStart.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, [dragging]);
  useEffect(() => {
    const element = paneRef.current, reader = readerRef.current;
    if (!element || !reader || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => {
      const width = element.getBoundingClientRect().width;
      
      setSplitRoom(width >= 680);
      setStacked(reader.getBoundingClientRect().width > 0 && reader.getBoundingClientRect().width < 560);
    });
    observer.observe(element);
    observer.observe(reader);
    return () => observer.disconnect();
  }, []);
  const mode: DiffMode = view === 'split' && splitRoom ? 'split' : 'unified';
  const listedSelection = useMemo(() => {
    for (const repository of repositories) {
      const commit = fileCommit ? repository.commits.find(entry => entry.key === fileCommit) : undefined;
      const file = (fileCommit ? commit?.files : repository.changes)?.find(item => changedFileKey(item) === selected);
      if (file) return { file, repository, commit };
    }
    return undefined;
  }, [repositories, selected, fileCommit]);
  const selectionIdentity = JSON.stringify([readScope, selected, fileCommit]);
  const observedSelection = useRef<{ identity: string; value: NonNullable<typeof listedSelection> } | null>(null);
  useEffect(() => { if (listedSelection) observedSelection.current = { identity: selectionIdentity, value: listedSelection }; }, [listedSelection, selectionIdentity]);
  // Refresh may remove or de-duplicate the selected row. Recheck its observed checkout;
  // a same-path row from another checkout must never become this selection.
  const selection = listedSelection ?? (!fileCommit && observedSelection.current?.identity === selectionIdentity && observedSelection.current.value.file.checkoutId ? observedSelection.current.value : undefined);
  const selectionMissing = Boolean(selection && !listedSelection);
  const sourceFile = selection?.file;
  const full = useTaskFileDiff(taskId, sourceFile ? { repositoryId: sourceFile.repositoryId, filePath: sourceFile.path, commitHash: selection?.commit?.commit.hash ?? 'worktree', ...(!selection?.commit && sourceFile.checkoutId ? { checkoutId: sourceFile.checkoutId } : {}) } : null, `${refreshVersion ?? ''}:${sourceFile?.preview ?? ''}`, readScope);
  useEffect(() => {
    onRegisterRefresh?.(full.refresh);
    return () => onRegisterRefresh?.(null);
  }, [onRegisterRefresh, full.refresh]);
  const current = full.error || (selectionMissing && full.loading)
    ? sourceFile && { ...sourceFile, preview: null, previewTruncated: false }
    : full.data?.files[0] ?? sourceFile;
  const owner = selection;
  const commitEntry = repositories.flatMap(repository => repository.commits.map(entry => ({ repository, entry }))).find(item => item.entry.key === selectedCommit);
  const parsed = useMemo(() => current?.preview ? parseUnifiedDiff(current.preview) : null, [current?.preview]);
  const compactFile = Boolean(filePresentation);
  const missingFinalNewline = compactFile && parsed?.rows.some(row => row.kind === 'meta' && row.text.startsWith('\\ No newline'));
  const rows = useMemo(() => parsed ? compactFile ? diffContentRows(parsed.rows) : parsed.rows : [], [parsed, compactFile]);
  const pairs = useMemo(() => pairForSplit(rows), [rows]);
  const splitLeftRef = useRef<HTMLDivElement>(null);
  const splitGutterRef = useRef<HTMLDivElement>(null);
  const splitRightRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const positioned = useRef('');
  useEffect(() => {
    if (mode !== 'split') return;
    const left = splitLeftRef.current, gutter = splitGutterRef.current, right = splitRightRef.current;
    if (!left || !gutter || !right) return;
    const mirror = (source: HTMLElement, targets: HTMLElement[], bothAxes: boolean) => {
      for (const target of targets) {
        if (target === source) continue;
        target.scrollTop = source.scrollTop;
        if (bothAxes) target.scrollLeft = source.scrollLeft;
      }
    };
    const onLeft = () => mirror(left, [gutter, right], true);
    const onRight = () => mirror(right, [gutter, left], true);
    const onGutter = () => mirror(gutter, [left, right], false);
    left.addEventListener('scroll', onLeft, { passive: true });
    right.addEventListener('scroll', onRight, { passive: true });
    gutter.addEventListener('scroll', onGutter, { passive: true });
    return () => { left.removeEventListener('scroll', onLeft); right.removeEventListener('scroll', onRight); gutter.removeEventListener('scroll', onGutter); };
  }, [mode, current]);
  useEffect(() => {
    if (taskId && full.loading) return;
    const key = JSON.stringify([readScope, taskId, selected, fileCommit, selectedCommit, selectionVersion, mode]);
    if (positioned.current === key) return;
    const body = bodyRef.current;
    if (!body) return;
    positioned.current = key;
    body.scrollTop = 0; body.scrollLeft = 0;
    const reveal = (host: HTMLElement, row: HTMLElement | null, headerHeight = 0) => {
      host.scrollLeft = 0;
      host.scrollTop = row ? Math.max(0, row.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop - headerHeight - 12) : 0;
    };
    if (mode === 'unified') reveal(body, body.querySelector('.line-add, .line-del'));
    else {
      const first = pairs.findIndex(pair => pair.left?.kind === 'del' || pair.right?.kind === 'add');
      for (const host of [splitLeftRef.current, splitGutterRef.current, splitRightRef.current]) {
        if (host) reveal(host, first < 0 ? null : host.querySelector(`[data-diff-row="${first}"]`), host.querySelector('.task-diff-version-head')?.getBoundingClientRect().height ?? 0);
      }
    }
  }, [taskId, readScope, selected, fileCommit, selectedCommit, selectionVersion, mode, full.loading, pairs]);
  async function copyPath() {
    if (!current) return;
    const path = filePresentation ? filePresentation.absolutePath : current.path;
    if (!path) { message.info('完整绝对路径暂不可读取。'); return; }
    try {
      if (!navigator.clipboard?.writeText) throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(path);
      setCopied(true);
      message.success('已复制');
    } catch { message.info('当前环境不允许访问剪贴板，请选中文字复制。'); }
  }
  async function copyCommit(value: string) {
    try { await navigator.clipboard.writeText(value); message.success('已复制'); }
    catch { message.info('当前环境不允许访问剪贴板，请选中文字复制。'); }
  }
  const isAddOnly = current?.status === 'added' || current?.status === 'untracked';
  const hasAny = repositories.some(repository => repository.changes.length > 0 || repository.commits.length > 0 || repository.status === 'unavailable');
  const railContent = <div className="task-rail-body">
        {repositories.map(repository => {
          const repoOpen = openRepos[repository.id] ?? true;
          return <section key={repository.id} className="task-changed-repo task-rail-repo" data-prototype-position="changes-repo">
            <header className="task-changed-repo-head">
              <div className="task-rail-repo-top">
                <button type="button" className="task-rail-repo-toggle" aria-expanded={repoOpen} onClick={() => setOpenRepos(previous => ({ ...previous, [repository.id]: !repoOpen }))}>
                  <span className="task-commits-expand">{repoOpen ? <DownOutlined /> : <RightOutlined />}</span>
                  <span className="task-changed-repo-label"><strong>{repository.label}</strong></span>
                </button>
                <span className="task-changed-repo-count">{repository.status === 'unavailable' ? '不可读取' : `${repository.changes.length} 改 / ${repository.commits.length} 提交`}</span>
              </div>
              {(repository.branch || (repository.ahead ?? 0) > 0) && <div className="task-rail-repo-meta">
                {repository.branch && <code className="task-changed-repo-branch" title="当前分支"><BranchesOutlined /> {repository.branch}</code>}
                {(repository.ahead ?? 0) > 0 && <span className="task-changed-ahead" title={`本地领先远端 ${repository.ahead} 个提交`}>↑{repository.ahead}</span>}
              </div>}
            </header>
            {repoOpen && <>
              {repository.status === 'unavailable' && <p className="task-changed-repo-error">{repository.message || '该仓库暂不可读取。'}</p>}
              {repository.status !== 'unavailable' && <>
                <p className="task-rail-group" data-prototype-position="rail-group">更改 · {repository.changes.length}</p>
                {repository.changes.length === 0 && <p className="task-rail-empty">工作区干净</p>}
                {repository.changes.length > 0 && <ChangedFileList selectable files={repository.changes} expanded={null} onExpand={key => { if (key) selectFile(key); }} selectedKey={!fileCommit && current ? changedFileKey(current) : null} />}
                <p className="task-rail-group">提交 · {repository.commits.length}</p>
                {repository.commits.length === 0 && <p className="task-rail-empty">暂无关联提交</p>}
                <ol className="task-rail-commits">
                  {repository.commits.map(entry => {
                    const open = Boolean(openCommits[entry.key]);
                    return <li key={entry.key}>
                      <button type="button" className="task-rail-commit" aria-expanded={open} onClick={() => { setOpenCommits(previous => ({ ...previous, [entry.key]: !previous[entry.key] })); setSelectedCommit(entry.key); onSelect(null); }}>
                        <span className="task-commits-expand">{open ? <DownOutlined /> : <RightOutlined />}</span>
                        <span className="task-rail-commit-content"><strong>{entry.commit.subject}</strong><span className="task-commits-meta"><code>{entry.commit.shortHash}</code><time dateTime={entry.commit.committedAt}>{formatShortDateTime(entry.commit.committedAt)}</time></span></span>
                      </button>
                      {open && <div className="task-rail-commit-files">
                        {entry.files.length === 0 ? <p className="task-rail-empty">文件列表暂不可读取</p> : <ChangedFileList compact selectable files={entry.files} expanded={null} onExpand={key => { if (key) selectFile(key, entry.key); }} selectedKey={fileCommit === entry.key && current ? changedFileKey(current) : null} />}
                      </div>}
                    </li>;
                  })}
                </ol>
              </>}
            </>}
          </section>;
        })}
        {!hasAny && <p className="task-rail-empty">暂无可见的改动与提交。</p>}
      </div>;
  return <section ref={readerRef} className={`task-diff-reader task-changes-workbench${dragging ? ' is-resizing' : ''}${stacked ? ' is-narrow-layout' : ''}`} aria-label="改动与提交工作台" aria-busy={Boolean(taskId && full.loading)} data-prototype-position="diff-reader">
    <aside className={`task-diff-rail${railCollapsed ? ' is-collapsed' : ''}${railPeek ? ' is-peeking' : ''}`} style={railCollapsed ? undefined : { flexBasis: railWidth }} data-prototype-position="diff-file-rail"
      onPointerEnter={() => { if (railCollapsed) setRailPeek(true); }}
      onPointerLeave={() => { if (railCollapsed) setRailPeek(false); }}>
      <header className="task-diff-rail-head">
        <div className="task-diff-rail-title"><strong>文件与提交</strong></div>
        <Button type="text" size="small" aria-label={railCollapsed ? '展开文件栏' : '收起文件栏'} icon={railCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => { setRailCollapsed(value => !value); setRailPeek(false); }} />
      </header>
      {!railCollapsed && railContent}
      {railPeek && <div className="task-diff-rail-peek" role="complementary" aria-label="文件栏浮窗">{railContent}</div>}
      {!railCollapsed && <SplitDivider className="task-diff-rail-resize" aria-label="拖拽调整文件栏宽度" title="拖拽调整宽度（220–480px）" onPointerDown={event => { dragStart.current = { x: event.clientX, width: railWidth }; setDragging(true); event.preventDefault(); }} onDoubleClick={() => setRailWidth(320)} />}
    </aside>
    <div className="task-diff-pane" ref={paneRef} data-prototype-position="diff-pane">
      <header className={`task-diff-toolbar${filePresentation ? ' is-compact-file' : ''}`} data-prototype-position="diff-modes">
        <div className="task-diff-file">
          <strong>{commitEntry ? '提交详情' : current ? fileName(current.path) : '差异阅读'}</strong>
          {!commitEntry && current && filePresentation && <Tooltip title={filePresentation.comparisonDescription || filePresentation.comparison} rootClassName="task-changed-path-tooltip" trigger={['hover', 'focus']} mouseEnterDelay={0.08} mouseLeaveDelay={0}><span className="task-diff-comparison" tabIndex={0}>{filePresentation.comparison}</span></Tooltip>}
          {!commitEntry && current && !filePresentation && <small>{current.previousPath ? `${current.previousPath} → ${current.path}` : fileDir(current.path)}</small>}
          {!commitEntry && owner && !filePresentation && <small className="task-diff-scope">{owner.repository.label}{owner.commit ? ` · ${owner.commit.commit.shortHash} ${owner.commit.commit.subject}` : ' · 未提交的改动'}</small>}
        </div>
        <div className="task-diff-actions">
          {!commitEntry && current && owner && onOpenFile && <Button size="small" onClick={() => onOpenFile(current, owner.repository, owner.commit)} data-prototype-position="diff-full-file">查看完整文件</Button>}
          {!commitEntry && taskId && current && <span className="task-diff-loading" role="status" aria-label={full.loading ? '正在读取完整差异' : undefined}>{full.loading && <Spin size="small" />}</span>}
          {!commitEntry && current && previewContent === undefined && parsed && (parsed.totalAdd > 0 || parsed.totalDel > 0) && <Segmented className="task-diff-mode" size="small" value={mode} onChange={value => setView(value as DiffMode)} options={[
            { value: 'split', disabled: !splitRoom, label: <Tooltip title={splitRoom ? '旧版本与新版本并排对照' : '当前阅读宽度不足，使用上下对比'}><span>左右对比</span></Tooltip> },
            { value: 'unified', label: <Tooltip title='同一视图按顺序显示删除和新增行'><span>上下对比</span></Tooltip> },
          ]} />}
          {!commitEntry && current && (copied ? <Button size="small" type="text" icon={<CheckOutlined />}>已复制路径</Button> : <Button size="small" type="text" icon={<CopyOutlined />} aria-label="复制路径" disabled={Boolean(filePresentation && !filePresentation.absolutePath)} onClick={() => void copyPath()}>复制路径</Button>)}
        </div>
        {!commitEntry && current && filePresentation && <div className="task-diff-absolute-path"><code aria-label="完整绝对路径">{filePresentation.absolutePath ? `${filePresentation.previousAbsolutePath ? `${filePresentation.previousAbsolutePath} → ` : ''}${filePresentation.absolutePath}` : '完整绝对路径暂不可读取'}</code></div>}
      </header>
      {taskId && current && (selectionMissing || (!full.loading && (full.error || current.previewTruncated || !current.preview))) && <p className="task-diff-read-status" role="status">{full.error ? `完整差异读取失败：${full.error}` : selectionMissing ? '上次所选改动已不在当前列表，仍按原检出来源核对；可从左侧重新选择。' : current.previewTruncated ? '差异已达到读取上限或无法完整读取，当前内容不完整。' : '该文件未提供可读的文本差异。'}</p>}
      <div ref={bodyRef} className="task-diff-body" role="region" aria-label="差异内容">
        {commitEntry && <article className="task-commit-details" aria-label="提交完整信息">
          <h2>{commitEntry.entry.commit.subject}</h2>
          <dl><dt>仓库</dt><dd>{commitEntry.repository.label}</dd><dt>提交</dt><dd><code>{commitEntry.entry.commit.hash}</code></dd><dt>作者</dt><dd>{commitEntry.entry.commit.authorName} &lt;{commitEntry.entry.commit.authorEmail}&gt;</dd><dt>时间</dt><dd>{formatShortDateTime(commitEntry.entry.commit.committedAt)}</dd></dl>
          <div className="task-commit-actions"><Button size="small" aria-label="复制提交说明" icon={<CopyOutlined />} onClick={() => void copyCommit(commitEntry.entry.commit.message)}>复制提交说明</Button><Button size="small" aria-label="复制完整哈希" icon={<CopyOutlined />} onClick={() => void copyCommit(commitEntry.entry.commit.hash)}>复制完整哈希</Button></div>
          <pre>{commitEntry.entry.commit.message}</pre>
        </article>}
        {!commitEntry && !current && <p className="task-diff-empty">{hasAny ? '从左侧文件栏选择一个文件查看差异。' : '该范围暂无可查看的文件。'}</p>}
        {!commitEntry && current && previewContent}
        {!commitEntry && current && previewContent === undefined && !parsed && <p className="task-diff-empty">{current.status === 'deleted' ? '文件已删除，不提供差异预览。' : current.status === 'renamed' ? '重命名文件内容未变化时不提供差异预览。' : '暂无可展示的差异预览。'}</p>}
        {!commitEntry && current && previewContent === undefined && parsed && mode === 'unified' && <pre className="task-diff-text" aria-label="上下差异">
          {rows.map((row, index) => <span key={index} className={`task-diff-line line-${row.kind}`}>
            <i className="task-diff-gutter">{(row.kind === 'del' ? row.oldNo : row.newNo) ?? ''}</i>
            <em>{(mode === 'unified' && (row.kind === 'add' || row.kind === 'del')) ? (row.kind === 'add' ? '+' : '−') : ''}{row.text}</em>
          </span>)}
        </pre>}
        {!commitEntry && current && previewContent === undefined && parsed && mode === 'split' && <div className="task-diff-split" role="region" aria-label="并排差异">
          <div ref={splitLeftRef} className="task-diff-split-side" aria-label="旧版本">
            <div className="task-diff-version-head">旧版本{isAddOnly ? ' · 文件不存在' : ''}</div>
            {pairs.map((pair, index) => <div key={index} data-diff-row={index} className={`task-diff-row ${pair.left?.kind === 'del' ? 'is-del' : pair.left?.kind === 'ctx' || pair.left?.kind === 'hunk' || pair.left?.kind === 'meta' ? 'is-plain' : 'is-empty'}`}><em>{pair.left ? pair.left.text : ''}</em></div>)}
          </div>
          <div ref={splitGutterRef} className="task-diff-split-gutter" aria-label="行号对照">
            <div className="task-diff-version-head">行号</div>
            {pairs.map((pair, index) => <div key={index} data-diff-row={index} className={`task-diff-nums${pair.left?.kind === 'hunk' || pair.right?.kind === 'hunk' ? ' is-hunk' : ''}`}><i>{pair.left?.oldNo ?? ''}</i><i>{pair.right?.newNo ?? ''}</i></div>)}
          </div>
          <div ref={splitRightRef} className="task-diff-split-side" aria-label="新版本">
            <div className="task-diff-version-head">新版本</div>
            {pairs.map((pair, index) => <div key={index} data-diff-row={index} className={`task-diff-row ${pair.right?.kind === 'add' ? 'is-add' : pair.right?.kind === 'ctx' || pair.right?.kind === 'hunk' || pair.right?.kind === 'meta' ? 'is-plain' : pair.right?.kind === 'del' ? 'is-del' : 'is-empty'}`}><em>{pair.right ? pair.right.text : ''}</em></div>)}
          </div>
        </div>}
        {!commitEntry && current && previewContent === undefined && missingFinalNewline && <p className="task-diff-hint">所比较的内容包含文件末尾没有换行的版本。</p>}
        {!commitEntry && current && previewContent === undefined && parsed && isAddOnly && <p className="task-diff-hint"><FileAddOutlined /> 新增文件没有旧版本，差异中全部行均为新增。</p>}
      </div>
      {notice && <p className="task-commits-demo-note">{notice}</p>}
    </div>
  </section>;
}
