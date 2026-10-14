import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Segmented, Space, Spin, Tag, Tooltip } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, FolderOpenOutlined, LoadingOutlined } from '@ant-design/icons';
import { LanguageDescription } from '@codemirror/language';
import { fileEditingLanguages } from './file-editing-language';
import { MarkdownHost } from '../MarkdownHost';
import type { MarkdownRenderOptions } from '../../markdown';
import { FileCodeEditor } from './FileCodeEditor';
import { ReadOnlyFileCodeEditor } from './ReadOnlyFileCodeEditor';
import { FileConflictDialog } from './FileConflictDialog';
import { WorkspaceViewTransientContext } from '../../app/pageTabs';
import type { FileEditingController, FileEditingDocument } from './file-editing-types';
import './file-editing-pane.css';

export type FileEditingPaneProps = {
  file: FileEditingDocument;
  editing: FileEditingController;
  active?: boolean;
  markdownOptions?: MarkdownRenderOptions;
  markdownRevision?: string;
  focusLine?: number;
  focusRequest?: number;
  searchQuery?: string;
  onSelectLines?(lines: [number, number] | null): void;
  onOpenInExplorer?: () => void;
  onViewCurrent?: () => void;
  toolbarEnd?: ReactNode;
};

/** Shared file identity, editor, autosave feedback and conflict handling for every entry. */
export function FileEditingPane({ file, editing, active = true, markdownOptions, markdownRevision, focusLine, focusRequest, searchQuery, onSelectLines, onOpenInExplorer, onViewCurrent, toolbarEnd }: FileEditingPaneProps) {
  const transient = useContext(WorkspaceViewTransientContext);
  const session = editing.sessions[file.id];
  const [preview, setPreview] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const readHost = useRef<HTMLDivElement>(null);
  const scrolls = useRef(new Map<string, number>());
  const focusKey = focusLine ? JSON.stringify([file.id, focusLine, focusRequest]) : '';
  const appliedFocus = useRef('');
  const [dismissedFocus, setDismissedFocus] = useState('');
  const [selectedLines, setSelectedLines] = useState<[number, number] | null>(null);
  const selectLines = (lines: [number, number] | null) => { setSelectedLines(lines); onSelectLines?.(lines); };
  const current = useRef(editing); current.current = editing;
  useEffect(() => { editing.ensure(file); }, [file.id, file.revision, file.content, file.observedAt, file.sourceRevision, editing.ensure]);
  useEffect(() => {
    if (!active) return;
    const release = editing.watch(file.id);
    void editing.refresh(file.id);
    return release;
  }, [file.id, active, editing.watch, editing.refresh]);
  useEffect(() => { setPreview(false); setConflictOpen(false); setSelectedLines(null); }, [file.id]);
  useEffect(() => { if (session?.mode !== 'edit' || session?.file.readOnlyReason) setPreview(false); }, [session?.mode, session?.file.readOnlyReason]);
  useEffect(() => {
    let cancelled = false;
    const language = LanguageDescription.matchFilename(fileEditingLanguages, file.path);
    if (language) void language.load().then(support => { if (!cancelled) current.current.setLanguage(file.id, support); }).catch(() => {});
    return () => { cancelled = true; };
  }, [file.id, file.path]);
  const conflictKey = session?.conflict ? file.id + ':' + session.conflict.file.revision : '';
  useEffect(() => { setConflictOpen(Boolean(conflictKey) && active); }, [conflictKey, active]);
  const markdown = file.kind === 'markdown';
  const editingSource = session?.mode === 'edit' && !session.file.readOnlyReason;
  const readingSource = markdown && !editingSource && Boolean(focusKey) && dismissedFocus !== focusKey;
  const showSource = !markdown || editingSource || readingSource;
  useEffect(() => {
    if (!showSource && readHost.current) readHost.current.scrollTop = scrolls.current.get(file.id + ':read') || 0;
    if (!showSource) onSelectLines?.(null);
  }, [file.id, showSource]);
  useEffect(() => {
    if (active && focusLine && appliedFocus.current !== focusKey) {
      appliedFocus.current = focusKey;
      selectLines([focusLine, focusLine]);
    }
  }, [focusKey, active]);

  if (!session) return <div className="file-editing-loading"><Spin /></div>;
  const editable = !session.file.readOnlyReason;
  const showPreview = editingSource && markdown && preview;
  const pathParts = file.path.split('/');
  const fileName = pathParts.pop() || file.path;
  const parentPath = pathParts.join('/');
  const fullPath = file.location.replace(/\/$/, '') + '/' + file.path;
  const versionLabel = session.file.sourceKey === file.sourceKey ? session.file.versionLabel || file.versionLabel : file.versionLabel;
  const lineCount = session.editorState.doc.lines;
  const statusText = session.status === 'conflict' ? '保存已暂停' : session.status === 'error' ? '保存失败' : session.status === 'saving' ? '保存中…' : '已保存';
  const statusIcon = session.status === 'saving' ? <LoadingOutlined /> : session.status === 'saved' ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />;

  return <section className={'file-editing-pane' + (showSource ? ' is-editing' : '')} aria-label="文件阅读与编辑" data-file-id={file.id} data-file-status={session.status} data-file-presentation={showSource ? 'source' : 'rendered'}>
    <header className="file-editing-header" data-prototype-position="file-identity">
      <div className="file-editing-header-top">
        <div className="file-editing-path" title={fullPath} aria-label={'文件路径：' + file.path}>{parentPath && <span>{parentPath} / </span>}<strong>{fileName}</strong></div>
        <Space size={6} className="file-editing-header-actions">
          {readingSource && <Button size="small" onClick={() => setDismissedFocus(focusKey)}>返回阅读</Button>}
          {markdown && <span className="file-editing-mode" data-prototype-position="file-mode"><Segmented block size="small" aria-label="文件查看模式" value={editingSource ? 'edit' : 'read'} options={[{ label: '阅读', value: 'read' }, { label: '编辑', value: 'edit', disabled: !editable }]} onChange={value => { setDismissedFocus(focusKey); editing.setMode(file.id, value as 'read' | 'edit'); }} /></span>}
          {onOpenInExplorer && <Tooltip title="在资源管理器（Explorer）中打开同一文件"><Button type="text" size="small" aria-label="在资源管理器中打开" icon={<FolderOpenOutlined />} onClick={onOpenInExplorer} /></Tooltip>}
          {onViewCurrent && <Button size="small" onClick={onViewCurrent}>打开当前文件</Button>}
          {toolbarEnd}
        </Space>
      </div>
      <div className="file-editing-header-meta">
        <span className="file-editing-location" title={file.location} aria-label="文件位置与版本"><FolderOpenOutlined /><span>{file.locationLabel || '当前目录'}</span>{versionLabel && <><span aria-hidden="true">·</span><strong title={versionLabel}>{versionLabel}</strong></>}<span className="file-editing-line-count">· {lineCount} 行</span></span>
        <div className="file-editing-meta-actions">
          {markdown && <span className="file-editing-preview-action">{editingSource && <Button type={preview ? 'primary' : 'text'} size="small" aria-pressed={preview} onClick={() => setPreview(value => !value)}>预览</Button>}</span>}
          <div className="file-editing-save" data-prototype-position="save-status" aria-live="polite">{editable ? <><span className="file-editing-save-detail" title={session.savedAt ? '最近保存：' + session.savedAt : '停止输入后自动保存'}>自动保存</span><span className={'file-editing-save-state state-' + session.status}>{statusIcon}{statusText}</span></> : <Tag bordered={false}>只读</Tag>}</div>
        </div>
      </div>
    </header>
    {session.file.readOnlyReason && <Alert className="file-editing-notice" type="info" showIcon message={session.file.readOnlyReason} />}
    {session.file.protectedRanges?.length ? <Alert className="file-editing-notice" type="info" showIcon message="受管区块（Managed Block）由 Buildr 维护，区块外内容可以编辑。" /> : null}
    {session.protectedMessage && <Alert className="file-editing-notice" type="warning" showIcon message={session.protectedMessage} />}
    {session.bindingError && <Alert className="file-editing-notice" type="error" showIcon message="文件来源已变化，保存已暂停" description={session.bindingError} action={<Button size="small" onClick={() => void editing.reviewSource(file.id)}>核对最新来源</Button>} />}
    {session.readError && <Alert className="file-editing-notice" type="warning" showIcon message="暂时无法核对文件最新状态" description={session.readError} action={<Button size="small" onClick={() => void editing.refresh(file.id)}>重新核对</Button>} />}
    {session.status === 'error' && !session.bindingError && <Alert className="file-editing-notice" type="error" showIcon message="保存失败，输入已保留" description={session.error} action={<Button size="small" onClick={() => void editing.retry(file.id)}>重试保存</Button>} />}
    {session.conflict && <Alert className="file-editing-notice" type="warning" showIcon message="文件已被外部修改，自动保存已暂停" description="你的输入和磁盘最新内容都已保留。处理差异后继续保存。" action={<Button size="small" onClick={() => setConflictOpen(true)}>处理冲突</Button>} />}
    <div className={'file-editing-body' + (showPreview ? ' with-preview' : '')}>
      {readingSource ? <div className="file-editing-source" data-prototype-position="editor-input"><ReadOnlyFileCodeEditor documentId={file.id + ':search'} path={file.path} content={session.content} query={searchQuery} selectedLines={selectedLines} active={active} focusLine={focusLine} focusRequest={focusRequest}
        onSelectLine={(line, extend) => selectLines(extend && selectedLines ? [Math.min(selectedLines[0], line), Math.max(selectedLines[1], line)] : [line, line])} readOnlyReason="源码定位：只读查看，可返回阅读或明确进入编辑。" initialScrollTop={scrolls.current.get(file.id + ':search') || 0} onScroll={top => scrolls.current.set(file.id + ':search', top)} /></div>
        : showSource ? <div className="file-editing-source" data-prototype-position="editor-input"><FileCodeEditor documentId={file.id} state={session.editorState} onTransactions={transactions => editing.applyTransactions(file.id, transactions)} onComposing={value => editing.setComposing(file.id, value)} onBlur={() => void editing.saveNow(file.id)} active={active} autoFocus={active && !transient && markdown && editingSource} focusLine={focusLine} focusRequest={focusRequest} searchQuery={searchQuery} selectedLines={selectedLines} onSelectLines={selectLines}
          initialScrollTop={scrolls.current.get(file.id + ':source') || 0} onScroll={top => scrolls.current.set(file.id + ':source', top)} /></div>
        : <div className="file-editing-reading" ref={readHost} data-prototype-position="editor-input" onScroll={event => scrolls.current.set(file.id + ':read', event.currentTarget.scrollTop)}><MarkdownHost markdown={session.content} className="markdown-body" renderVersion={markdownRevision} options={markdownOptions} /></div>}
      {showPreview && <div className="file-editing-preview"><div className="file-editing-preview-label">Markdown 预览</div><MarkdownHost markdown={session.content} className="markdown-body" renderVersion={markdownRevision} options={markdownOptions} /></div>}
    </div>
    {session.conflict && active && <FileConflictDialog file={file} session={session} editing={editing} open={conflictOpen} onClose={() => setConflictOpen(false)} />}
  </section>;
}
