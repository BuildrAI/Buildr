import { useEffect, useRef, useState } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { Alert, Button, Empty, Form, Input, Modal, Select, Space, Spin, message } from 'antd';
import { CopyOutlined, EyeOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { publicationApi, type PublicationAsset, type PublicationDetail, type PublicationDraft } from '../api/publication-api';
import { usePublication } from '../hooks/usePublication';
import { articleDraft, insertMarkdown, publicationStatus, writingMethods } from '../publication-model';
import { ArticleAssetsPanel } from './ArticleAssetsPanel';
import { ArticleBody } from './ArticleBody';
import { ArticleWritingDrawer } from './ArticleWritingDrawer';
import '../publication.css';

type Props = {
  workspaceId: string; projectCode: string; publicationId: string;
  onClose: () => void; onSaved?: (detail: PublicationDetail) => void;
};

export function ArticleEditorDrawer({ workspaceId, projectCode, publicationId, onClose, onSaved }: Props) {
  const read = usePublication(workspaceId, projectCode, publicationId, false);
  const [base, setBase] = useState<PublicationDetail | null>(null), [draft, setDraft] = useState<PublicationDraft | null>(null), [assets, setAssets] = useState<PublicationAsset[]>([]);
  const [mode, setMode] = useState('edit'), [busy, setBusy] = useState(false), [saveError, setSaveError] = useState(''), [conflict, setConflict] = useState(false), [comparing, setComparing] = useState(false), [latest, setLatest] = useState<PublicationDetail | null>(null), [compareLoading, setCompareLoading] = useState(false), [compareError, setCompareError] = useState('');
  const [writing, setWriting] = useState<string | null>(null), [leave, setLeave] = useState(false);
  const [messages, holder] = message.useMessage();
  const textarea = useRef<TextAreaRef>(null), selection = useRef({ start: 0, end: 0 });
  const dirty = Boolean(base && draft && JSON.stringify(draft) !== JSON.stringify(articleDraft(base)));
  const article = base?.publication;
  useEffect(() => {
    if (!read.data) return;
    setBase(read.data); setDraft(articleDraft(read.data)); setAssets(read.data.assets || []); selection.current = { start: read.data.content.length, end: read.data.content.length };
  }, [read.data]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const change = (key: keyof PublicationDraft, value: string) => setDraft(current => current ? { ...current, [key]: value } : current);
  const cancel = () => { if (busy) return; if (dirty) setLeave(true); else onClose(); };
  const save = async () => {
    if (!base || !draft || busy) return;
    if (!draft.title.trim()) { setSaveError('请填写文章标题'); return; }
    setBusy(true); setSaveError('');
    try {
      const saved = await publicationApi.update(projectCode, publicationId, base.revision, { ...draft, title: draft.title.trim() });
      setBase(saved); setDraft(articleDraft(saved)); setAssets(saved.assets || []); setConflict(false);
      onSaved?.(saved); onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败，输入已保留');
      setConflict(/revision|conflict/i.test(String((err as { code?: string })?.code || '')));
    } finally { setBusy(false); }
  };
  const compare = async () => {
    setComparing(true); setCompareLoading(true); setCompareError('');
    try { setLatest(await publicationApi.detail(publicationId, undefined, projectCode)); }
    catch (err) { setCompareError(err instanceof Error ? err.message : '最新稿件读取失败'); }
    finally { setCompareLoading(false); }
  };
  const insert = (markdown: string) => {
    if (!draft) return;
    const next = insertMarkdown(draft.content, markdown, selection.current.start, selection.current.end);
    change('content', next.content); setMode('edit'); selection.current = { start: next.cursor, end: next.cursor };
    requestAnimationFrame(() => { const input = textarea.current?.resizableTextArea?.textArea; input?.focus(); input?.setSelectionRange(next.cursor, next.cursor); });
  };
  const currentText = draft ? `# ${draft.title}\n\n${draft.summary}\n\n${draft.content}` : '';
  return <DrawerShell open title="编辑文章" sub={article ? `${article.projectName} · ${article.title}` : '正在读取当前稿件'}
    width="min(1120px, 90vw)" rootClassName="publication-editor-drawer" onClose={cancel}
    closeAriaLabel="关闭文章编辑" closeDisabled={busy} maskClosable={!busy} keyboard
    footer={<div className="publication-editor-footer"><span id="article-edit-state" role="status">{busy ? '正在保存…' : dirty ? '有尚未保存的修改' : draft ? '当前稿件已保存' : '正在读取稿件'}</span><Space><Button autoInsertSpace={false} onClick={cancel} disabled={busy}>取消</Button><Button id="article-save" type="primary" icon={<SaveOutlined />} loading={busy} disabled={!draft || !base} onClick={() => void save()}>保存修改</Button></Space></div>}>
    <div id="article-editor" className="publication-page publication-editor" data-project-code={projectCode} data-publication-id={publicationId}>{holder}
    {read.error && <Alert type="error" message="文章读取失败" description={read.error} action={<Button size="small" onClick={read.reload}>重试</Button>} />}
    {!draft || !base || !article ? read.loading ? <div className="publication-loading"><Spin /><p>正在读取当前稿件…</p></div> : <Empty description="当前稿件不可用" /> : <>
      {saveError && <Alert type="error" message={conflict ? '文章已被其他入口修改，你的输入已保留。' : '修改尚未保存，输入已保留。'} description={saveError} action={conflict ? <Space wrap><Button size="small" onClick={() => void compare()}>查看最新稿件</Button><Button size="small" onClick={() => { void navigator.clipboard.writeText(currentText).then(() => messages.success('当前修改已复制')).catch(() => messages.error('自动复制失败')); }}>复制我的修改</Button></Space> : undefined} />}
      {base.assetDiagnostics.length > 0 && <Alert type="warning" message="部分文章资源暂时不可用，正文仍可编辑。" description={base.assetDiagnostics.map(item => item.message).join('；')} />}
      <div className="publication-editor-layout"><main className="publication-editor-main"><Form layout="vertical">
        <Form.Item label="标题" required><Input id="article-edit-title" className="publication-title-input" maxLength={150} value={draft.title} onChange={event => change('title', event.target.value)} disabled={busy} /></Form.Item>
        <Form.Item label="摘要"><Input.TextArea id="article-edit-summary" rows={2} maxLength={1000} value={draft.summary} onChange={event => change('summary', event.target.value)} placeholder="用一两句话说明文章的主题" disabled={busy} /></Form.Item>
      </Form><div className="publication-editor-toolbar"><label htmlFor="article-edit-content">正文</label><Space><Button size="small" type={mode === 'edit' ? 'primary' : 'default'} icon={<EditOutlined />} onClick={() => setMode('edit')}>编辑</Button><Button size="small" type={mode === 'preview' ? 'primary' : 'default'} icon={<EyeOutlined />} onClick={() => setMode('preview')}>预览</Button></Space></div>
        <div hidden={mode !== 'edit'}><Input.TextArea ref={textarea} id="article-edit-content" aria-label="文章正文" className="publication-writing-area" value={draft.content} onChange={event => { const node = event.currentTarget; selection.current = { start: node.selectionStart, end: node.selectionEnd }; change('content', node.value); }} onSelect={event => { const node = event.currentTarget; selection.current = { start: node.selectionStart, end: node.selectionEnd }; }} disabled={busy} /></div>
        {mode === 'preview' && <div className="publication-editor-preview" id="article-edit-preview"><ArticleBody content={draft.content} workspaceId={workspaceId || ''} projectCode={projectCode} publicationId={publicationId} /></div>}
        <p className="publication-hint">支持 Markdown 标题、列表、链接和图片。上传完成后插入资源引用，保存后正文才会更新。</p>
      </main><aside className="publication-edit-aside"><section className="publication-edit-info"><Form layout="vertical"><Form.Item label="所属项目"><Input value={article.projectName} disabled /></Form.Item><Form.Item label="稿件状态"><Select id="article-edit-status" value={draft.status} disabled={busy} onChange={value => change('status', value)} options={[...Object.entries(publicationStatus).map(([value, label]) => ({ value, label })), ...(!publicationStatus[draft.status] ? [{ value: draft.status, label: draft.status }] : [])]} /></Form.Item></Form><p className="publication-hint">平台发布记录保持原样，不会自动同步。</p></section>
        <ArticleAssetsPanel workspaceId={workspaceId || ''} projectCode={projectCode} publicationId={publicationId} revision={base.revision} content={draft.content} assets={assets} disabled={busy} onAssets={setAssets} onInsert={insert} onConflict={text => { setSaveError(text); setConflict(true); }} />
        <section className="publication-edit-methods"><h2>让智能体（Agent）帮一把</h2>{writingMethods.slice(1).map(method => <Button type="text" block key={method.value} onClick={() => setWriting(method.value)}>{method.value}<span>→</span></Button>)}<p className="publication-hint">保存编辑后，可带上最新内容准备写作请求。</p></section>
      </aside></div>
      {writing && <ArticleWritingDrawer projects={[{ code: projectCode, name: article.projectName }]} article={article} revision={base.revision} initialMethod={writing} hasUnsavedChanges={dirty} onClose={() => setWriting(null)} />}
      <Modal open={leave} title="放弃尚未保存的修改？" okText="放弃修改" cancelText="继续编辑" onCancel={() => setLeave(false)} onOk={() => { setDraft(articleDraft(base)); setLeave(false); onClose(); }}><p>已上传的资源文件会保留，正文改动尚未保存。</p></Modal>
      <Modal open={comparing} width={940} title="对照最新稿件" onCancel={() => setComparing(false)} footer={<Space wrap><Button onClick={() => setComparing(false)}>继续查看</Button><Button icon={<CopyOutlined />} onClick={() => { void navigator.clipboard.writeText(currentText).then(() => messages.success('当前修改已复制')).catch(() => messages.error('自动复制失败')); }}>复制我的修改</Button><Button type="primary" disabled={!latest || compareLoading} onClick={() => { if (!latest) return; setBase(latest); setAssets(latest.assets || []); setComparing(false); setConflict(false); setSaveError(''); }}>已完成对照，保留我的输入继续编辑</Button></Space>}>
        <Alert type="warning" message="请将需要保留的最新内容合入编辑框。确认后仍保留你的输入；下次保存将以当前编辑内容更新这份最新稿件。" />
        {compareLoading ? <Spin /> : compareError ? <Alert type="error" message={compareError} /> : latest && <div className="publication-compare"><section><h3>最新稿件</h3><strong>{latest.publication.title}</strong><p>{latest.publication.summary}</p><pre>{latest.content}</pre></section><section><h3>我的修改</h3><strong>{draft.title}</strong><p>{draft.summary}</p><pre>{draft.content}</pre></section></div>}
      </Modal>
    </>}
  </div></DrawerShell>;
}
