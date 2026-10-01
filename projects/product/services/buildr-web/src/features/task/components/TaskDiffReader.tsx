import { App, Button, Segmented, Tooltip } from 'antd';
import { BranchesOutlined, CheckOutlined, CopyOutlined, DownOutlined, FileAddOutlined, MenuFoldOutlined, MenuUnfoldOutlined, RightOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChangedFileList, changedFileKey, type ChangedFileEntry } from './TaskChangedFiles';
import type { TaskCommit } from './task-commit-model';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { parseUnifiedDiff, pairForSplit } from './diff-text';
import './task-diff-reader.css';

type DiffMode = 'split' | 'unified' | 'all';

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
export function TaskDiffReader({ repositories, selected, onSelect, notice }: {
  repositories: RailRepository[];
  selected: string | null;
  onSelect(key: string | null): void;
  notice?: ReactNode;
}) {
  const { message } = App.useApp();
  const [view, setView] = useState<'diff' | 'all'>('diff');
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
  const [openCommits, setOpenCommits] = useState<Record<string, boolean>>({});
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
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      
      setSplitRoom(width >= 1000);
      setStacked(reader.getBoundingClientRect().width > 0 && reader.getBoundingClientRect().width < 560);
    });
    observer.observe(element);
    observer.observe(reader);
    return () => observer.disconnect();
  }, []);
  const mode: DiffMode = view === 'all' ? 'all' : splitRoom ? 'split' : 'unified';
  const owners = useMemo(() => {
    const map = new Map<string, { repository: RailRepository; commit?: RailCommit }>();
    for (const repository of repositories) {
      for (const file of repository.changes) map.set(changedFileKey(file), { repository });
      for (const commit of repository.commits) for (const file of commit.files) map.set(changedFileKey(file), { repository, commit });
    }
    return map;
  }, [repositories]);
  const allFiles = useMemo(() => [...owners.keys()], [owners]);
  const current = useMemo(() => {
    for (const repository of repositories) {
      const file = repository.changes.find(item => changedFileKey(item) === selected)
        || repository.commits.flatMap(commit => commit.files).find(item => changedFileKey(item) === selected);
      if (file) return file;
    }
    return undefined;
  }, [repositories, selected]);
  const owner = current ? owners.get(changedFileKey(current)) : undefined;
  const parsed = useMemo(() => current?.preview ? parseUnifiedDiff(current.preview) : null, [current?.preview]);
  const pairs = useMemo(() => parsed ? pairForSplit(parsed.rows) : [], [parsed]);
  const splitLeftRef = useRef<HTMLDivElement>(null);
  const splitGutterRef = useRef<HTMLDivElement>(null);
  const splitRightRef = useRef<HTMLDivElement>(null);
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
  async function copyPath() {
    if (!current) return;
    try {
      if (!navigator.clipboard?.writeText) throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(current.path);
      setCopied(true);
      message.success('已复制');
    } catch { message.info('当前环境不允许访问剪贴板，请选中文字复制。'); }
  }
  const isAddOnly = current?.status === 'added' && current.kind === 'untracked';
  const hasAny = allFiles.length > 0 || repositories.some(repository => repository.status === 'unavailable');
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
                {repository.changes.length > 0 && <ChangedFileList selectable files={repository.changes} expanded={null} onExpand={key => { if (key) onSelect(key); }} selectedKey={current ? changedFileKey(current) : null} />}
                <p className="task-rail-group">提交 · {repository.commits.length}</p>
                {repository.commits.length === 0 && <p className="task-rail-empty">暂无关联提交</p>}
                <ol className="task-rail-commits">
                  {repository.commits.map(entry => {
                    const open = Boolean(openCommits[entry.key]);
                    return <li key={entry.key}>
                      <button type="button" className="task-rail-commit" aria-expanded={open} onClick={() => setOpenCommits(previous => ({ ...previous, [entry.key]: !previous[entry.key] }))}>
                        <span className="task-commits-expand">{open ? <DownOutlined /> : <RightOutlined />}</span>
                        <span className="task-rail-commit-content"><strong>{entry.commit.subject}</strong><span className="task-commits-meta"><code>{entry.commit.shortHash}</code><time dateTime={entry.commit.committedAt}>{formatShortDateTime(entry.commit.committedAt)}</time></span></span>
                      </button>
                      {open && <div className="task-rail-commit-files">
                        {entry.files.length === 0 ? <p className="task-rail-empty">文件列表暂不可读取</p> : <ChangedFileList compact selectable files={entry.files} expanded={null} onExpand={key => { if (key) onSelect(key); }} selectedKey={current ? changedFileKey(current) : null} />}
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
  return <section ref={readerRef} className={`task-diff-reader task-changes-workbench${dragging ? ' is-resizing' : ''}${stacked ? ' is-narrow-layout' : ''}`} aria-label="改动与提交工作台" data-prototype-position="diff-reader">
    <aside className={`task-diff-rail${railCollapsed ? ' is-collapsed' : ''}${railPeek ? ' is-peeking' : ''}`} style={railCollapsed ? undefined : { flexBasis: railWidth }} data-prototype-position="diff-file-rail"
      onPointerEnter={() => { if (railCollapsed) setRailPeek(true); }}
      onPointerLeave={() => { if (railCollapsed) setRailPeek(false); }}>
      <header className="task-diff-rail-head">
        <Button type="text" size="small" aria-label={railCollapsed ? '展开文件栏' : '收起文件栏'} icon={railCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => { setRailCollapsed(value => !value); setRailPeek(false); }} />
      </header>
      {!railCollapsed && railContent}
      {railPeek && <div className="task-diff-rail-peek" role="complementary" aria-label="文件栏浮窗">{railContent}</div>}
      {!railCollapsed && <span className="task-diff-rail-resize" role="separator" aria-orientation="vertical" aria-label="拖拽调整文件栏宽度" title="拖拽调整宽度（220–480px）" onPointerDown={event => { dragStart.current = { x: event.clientX, width: railWidth }; setDragging(true); event.preventDefault(); }} onDoubleClick={() => setRailWidth(320)} />}
    </aside>
    <div className="task-diff-pane" ref={paneRef} data-prototype-position="diff-pane">
      <header className="task-diff-toolbar" data-prototype-position="diff-modes">
        <div className="task-diff-file">
          <strong>{current ? fileName(current.path) : '未选择文件'}</strong>
          {current && <small>{current.previousPath ? `${current.previousPath} → ${current.path}` : fileDir(current.path)}</small>}
          {owner && <small className="task-diff-scope">{owner.repository.label}{owner.commit ? ` · ${owner.commit.commit.shortHash} ${owner.commit.commit.subject}` : ' · 未提交的改动'}</small>}
        </div>
        <div className="task-diff-actions">
          {current && parsed && (parsed.totalAdd > 0 || parsed.totalDel > 0) && <Segmented size="small" value={view} onChange={value => setView(value as 'diff' | 'all')} options={[
            { value: 'diff', disabled: !splitRoom, label: <Tooltip title={splitRoom ? '并排对照' : '差异面宽度不足，差异对照不可用'}><span>差异</span></Tooltip> },
            { value: 'all', disabled: !splitRoom, label: <Tooltip title={!splitRoom ? '差异面宽度不足，暂以统一视图展示' : '整份新文件'}><span>全文</span></Tooltip> },
          ]} />}
          {copied ? <Button size="small" type="text" icon={<CheckOutlined />}>已复制路径</Button> : <Button size="small" type="text" icon={<CopyOutlined />} aria-label="复制路径" onClick={() => void copyPath()}>复制路径</Button>}
        </div>
      </header>
      <div className="task-diff-body" role="region" aria-label="差异内容">
        {!current && <p className="task-diff-empty">{hasAny ? '从左侧文件栏选择一个文件查看差异。' : '该范围暂无可查看的文件。'}</p>}
        {current && !parsed && <p className="task-diff-empty">{current.status === 'deleted' ? '文件已删除，不提供差异预览。' : current.status === 'renamed' ? '重命名文件内容未变化时不提供差异预览。' : '暂无可展示的差异预览。'}</p>}
        {current && parsed && mode !== 'split' && <pre className={`task-diff-text${mode === 'all' ? ' is-full' : ''}`}>
          {parsed.rows.map((row, index) => <span key={index} className={`task-diff-line line-${row.kind}`}>
            <i className="task-diff-gutter">{row.oldNo ?? ''}</i><i className="task-diff-gutter">{row.newNo ?? ''}</i>
            <em>{(mode === 'unified' && (row.kind === 'add' || row.kind === 'del')) ? (row.kind === 'add' ? '+' : '−') : ''}{row.text}</em>
          </span>)}
        </pre>}
        {current && parsed && mode === 'split' && <div className="task-diff-split" role="region" aria-label="并排差异">
          <div ref={splitLeftRef} className="task-diff-split-side" aria-label="旧版本">
            {pairs.map((pair, index) => <div key={index} className={`task-diff-row ${pair.left?.kind === 'del' ? 'is-del' : pair.left?.kind === 'ctx' || pair.left?.kind === 'hunk' || pair.left?.kind === 'meta' ? 'is-plain' : 'is-empty'}`}><em>{pair.left ? pair.left.text : ''}</em></div>)}
          </div>
          <div ref={splitGutterRef} className="task-diff-split-gutter" aria-label="行号对照">
            {pairs.map((pair, index) => <div key={index} className={`task-diff-nums${pair.left?.kind === 'hunk' || pair.right?.kind === 'hunk' ? ' is-hunk' : ''}`}><i>{pair.left?.oldNo ?? ''}</i><i>{pair.right?.newNo ?? ''}</i></div>)}
          </div>
          <div ref={splitRightRef} className="task-diff-split-side" aria-label="新版本">
            {pairs.map((pair, index) => <div key={index} className={`task-diff-row ${pair.right?.kind === 'add' ? 'is-add' : pair.right?.kind === 'ctx' || pair.right?.kind === 'hunk' || pair.right?.kind === 'meta' ? 'is-plain' : pair.right?.kind === 'del' ? 'is-del' : 'is-empty'}`}><em>{pair.right ? pair.right.text : ''}</em></div>)}
          </div>
        </div>}
        {current && parsed && isAddOnly && <p className="task-diff-hint"><FileAddOutlined /> 未跟踪文件全文按新增行展示。</p>}
      </div>
      {notice && <p className="task-commits-demo-note">{notice}</p>}
    </div>
  </section>;
}
