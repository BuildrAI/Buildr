import { useMemo, useState } from 'react';
import { Alert, Button, Modal, Popconfirm, Space, Tag } from 'antd';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { FileCodeEditor } from './FileCodeEditor';
import { normalizeEditorText } from './file-editing-text';
import { CopyButton } from '../CopyButton';
import type { FileEditingController, FileEditingDocument, FileEditingSession } from './file-editing-types';

const comparisonTheme = EditorView.theme({ '&': { height: '185px', fontSize: 'var(--font-size-code)' }, '.cm-scroller': { overflow: 'auto', lineHeight: '1.8', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }, '&.cm-focused': { outline: 'none' } });
function ReadOnlyContent({ content, label }: { content: string; label: string }) {
  const state = useMemo(() => EditorState.create({ doc: normalizeEditorText(content), extensions: [basicSetup, comparisonTheme, EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.contentAttributes.of({ 'aria-label': label })] }), [content, label]);
  return <FileCodeEditor documentId={label} state={state} />;
}

type Props = { file: FileEditingDocument; session: FileEditingSession; editing: FileEditingController; open: boolean; onClose(): void };

export function FileConflictDialog({ file, session, editing, open, onClose }: Props) {
  const [showBase, setShowBase] = useState(false);
  const [saving, setSaving] = useState(false);
  const merged = session.mergeContent || '';
  const unresolved = /^(?:<{7}|={7}|>{7})(?:\s|$)/m.test(merged);
  async function saveMerge() {
    setSaving(true);
    try { if (await editing.resolveConflict(file.id, merged)) onClose(); } finally { setSaving(false); }
  }

  return <Modal title="处理文件保存冲突" open={open && Boolean(session.conflict)} width={1120} className="file-editing-conflict-modal" onCancel={onClose} footer={<div className="file-editing-conflict-footer">
    <Popconfirm title="采用磁盘最新内容？" description="当前输入将被替换，本次编辑历史会重置。你可以先复制自己的输入。" okText="采用磁盘版本" cancelText="继续处理" onConfirm={() => { editing.acceptDisk(file.id); onClose(); }}><Button disabled={saving}>采用磁盘版本</Button></Popconfirm>
    <Space><Button onClick={onClose}>稍后处理</Button><Button type="primary" loading={saving} disabled={unresolved} onClick={() => void saveMerge()}>保存合并结果</Button></Space>
  </div>}>
    <section className="file-editing-conflict" data-prototype-position="conflict-resolution">
      <Alert type="warning" showIcon message={session.conflict?.reason === 'source' ? '文件来源已变化，请核对位置后再继续' : '自动保存已暂停，双方内容都已保留'} description="检查差异，编辑下方合并结果。确认后保存，或明确采用磁盘最新内容。" />
      <div className="file-editing-conflict-path" title={file.location}>{file.location.replace(/\/$/, '') + '/' + file.path}</div>
      {session.mergeStale && <Alert type="warning" showIcon message="磁盘内容再次更新，合并草稿已保留" description="请重新对照左侧最新内容，再确认保存合并结果。" />}
      <div className="file-editing-compare">
        <section><header><strong>磁盘最新内容</strong><Tag bordered={false}>外部更新</Tag></header><ReadOnlyContent content={session.conflict?.disk || ''} label="磁盘最新内容" /></section>
        <section><header><strong>我的输入</strong><CopyButton type="text" text={session.content} failureMessage="无法自动复制，请手动选择输入内容复制。">复制输入</CopyButton></header><ReadOnlyContent content={session.content} label="我的输入" /></section>
      </div>
      <Button className="file-editing-base-toggle" type="link" size="small" onClick={() => setShowBase(value => !value)}>{showBase ? '收起共同基线' : '查看共同基线'}</Button>
      {showBase && <ReadOnlyContent content={session.conflict?.base || ''} label="共同基线" />}
      <section className="file-editing-merge"><header><strong>合并结果</strong><small>检查并保留双方需要的修改，再保存</small></header>{session.mergeEditorState && <FileCodeEditor documentId={file.id + ':merge'} state={session.mergeEditorState} onTransactions={transactions => editing.applyMergeTransactions(file.id, transactions)} />}</section>
      {unresolved && <Alert type="info" showIcon message="双方修改需要人工合并。请编辑合并结果，移除冲突标记后保存。" />}
      {session.error && <Alert type="error" showIcon message="合并结果尚未保存" description={session.error} />}
      {session.protectedMessage && <Alert type="warning" showIcon message={session.protectedMessage} />}
    </section>
  </Modal>;
}
