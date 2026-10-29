import { useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { Alert, Button, Form, Input, Modal, Select, Space, Spin, message } from 'antd';
import { EyeOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { publicationApi, type PublicationAsset, type PublicationDetail, type PublicationDraft } from '../api/publication-api';
import { articleEditorRemains } from '../publication-navigation';
import { articleDraft, insertMarkdown, publicationStatus, writingMethods } from '../publication-model';
import { CopyButton } from '../../../components/CopyButton';
import { ArticleAssetsPanel } from './ArticleAssetsPanel';
import { ArticleBody } from './ArticleBody';
import { ArticleWritingDrawer } from './ArticleWritingDrawer';
import '../publication.css';

type Props = {
  workspaceId: string; projectCode: string; publicationId: string; sourceTaskId?: string;
  detail: PublicationDetail;
  /** 页面把分段切回「正文」时经此回调走统一的放弃确认。 */
  registerCancel?: (cancel: () => void) => void;
  onCancel: () => void; onSaved?: (detail: PublicationDetail) => void;
};

/** 文章详情页内的就地编辑：复用阅读页布局，正文区换成编辑表单，右侧保留资源与写作方法。 */
export function ArticleEditorPanel({ workspaceId, projectCode, publicationId, sourceTaskId, detail, registerCancel, onCancel, onSaved }: Props) {
  const location = useLocation();
  const [base, setBase] = useState<PublicationDetail>(detail), [draft, setDraft] = useState<PublicationDraft>(articleDraft(detail)), [assets, setAssets] = useState<PublicationAsset[]>(detail.assets || []);
  const [mode, setMode] = useState('edit'), [busy, setBusy] = useState(false), [saveError, setSaveError] = useState(''), [conflict, setConflict] = useState(false), [comparing, setComparing] = useState(false), [latest, setLatest] = useState<PublicationDetail | null>(null), [compareLoading, setCompareLoading] = useState(false), [compareError, setCompareError] = useState('');
  const [writing, setWriting] = useState<string | null>(null), [leave, setLeave] = useState(false);
  const [messages, holder] = message.useMessage();
  const textarea = useRef<TextAreaRef>(null), selection = useRef({ start: detail.content.length, end: detail.content.length });
  const dirty = Boolean(base && draft && JSON.stringify(draft) !== JSON.stringify(articleDraft(base)));
  const exitState = useRef({ dirty, busy });
  const savingExit = useRef(false);
  exitState.current = { dirty, busy };
  const exiting = useRef(false);
  const blocker = useBlocker(({ nextLocation }) => {
    // 编辑器在预览面板中，面板按属主路径在 location state 上堆叠：同路径换 key
    // 的导航会弹出或替换整个面板，草稿随之卸载；指向同一属主的资源地址先经
    // WorkspacePages 规范化为属主路径再替换栈，同样会落在「同路径」分支。
    // 换到同一工作空间的另一页面时本页保留在已访问页面中、草稿不丢，不拦截；
    // 只有进入会释放编辑现场的位置（跨工作空间、独立原型、列表/全局页）或上
    // 述同路径面板级替换，才需要继续编辑或放弃确认。
    const releases = nextLocation.key !== location.key
      && (nextLocation.pathname === location.pathname || !articleEditorRemains(workspaceId, nextLocation.pathname));
    const blocked = !exiting.current && (exitState.current.dirty || exitState.current.busy) && releases;
    savingExit.current = blocked && exitState.current.busy;
    return blocked;
  });
  const article = base.publication;
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!exitState.current.dirty && !exitState.current.busy) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  useEffect(() => {
    if (blocker.state !== 'blocked' || (!busy && !savingExit.current)) return;
    // Saving exits are cancelled now, never replayed after the request settles.
    savingExit.current = false; blocker.reset(); setLeave(false);
    messages.info('文章正在保存，请稍候再离开。');
  }, [blocker, busy, messages]);
  const change = (key: keyof PublicationDraft, value: string) => setDraft(current => current ? { ...current, [key]: value } : current);
  const resetExit = () => { savingExit.current = false; if (blocker.state === 'blocked') blocker.reset(); setLeave(false); };
  const cancel = () => {
    if (exitState.current.busy) return;
    resetExit();
    if (dirty) setLeave(true); else onCancel();
  };
  const discard = () => {
    if (exitState.current.busy || savingExit.current) { resetExit(); messages.info('文章正在保存，请稍候再离开。'); return; }
    exiting.current = true;
    if (blocker.state === 'blocked') blocker.proceed();
    setLeave(false); onCancel();
  };
  useEffect(() => { registerCancel?.(cancel); }, [registerCancel, dirty, busy]);
  const save = async () => {
    if (!base || !draft || exitState.current.busy) return;
    if (!draft.title.trim()) { setSaveError('请填写文章标题'); return; }
    // Close any earlier confirmation before starting this request. The ref also
    // protects navigation in the interval before React commits the busy state.
    exitState.current.busy = true; resetExit();
    setBusy(true); setSaveError('');
    try {
      const saved = await publicationApi.update(projectCode, publicationId, base.revision, { ...draft, title: draft.title.trim() }, sourceTaskId);
      setBase(saved); setDraft(articleDraft(saved)); setAssets(saved.assets || []); setConflict(false);
      // Mark the exit clean before the parent navigates; React state commits later.
      exitState.current.dirty = false; exiting.current = true;
      onSaved?.(saved);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败，输入已保留');
      setConflict(/revision|conflict/i.test(String((err as { code?: string })?.code || '')));
    } finally { exitState.current.busy = false; setBusy(false); }
  };
  const compare = async () => {
    setComparing(true); setCompareLoading(true); setCompareError('');
    try { setLatest(await publicationApi.detail(publicationId, undefined, projectCode, sourceTaskId)); }
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
  return <div id="article-editor" className="publication-page publication-editor" data-project-code={projectCode} data-publication-id={publicationId} data-source-task-id={sourceTaskId}>{holder}
    <div className="publication-editor-actions"><span id="article-edit-state" role="status" className="publication-muted">{busy ? '正在保存…' : dirty ? '有尚未保存的修改' : '当前稿件已保存'}</span><Space><Button autoInsertSpace={false} onClick={cancel} disabled={busy}>取消</Button><Button id="article-save" type="primary" icon={<SaveOutlined />} loading={busy} disabled={!draft || !base} onClick={() => void save()}>保存修改</Button></Space></div>
    {article.sourceTask && <Alert type="info" message={`正在编辑来源任务的草稿：${article.sourceTask.title}`} />}
    {saveError && <Alert type="error" message={conflict ? '文章已被其他入口修改，你的输入已保留。' : '修改尚未保存，输入已保留。'} description={saveError} action={conflict ? <Space wrap><Button size="small" onClick={() => void compare()}>查看最新稿件</Button><CopyButton text={currentText} failureMessage="自动复制失败，请手动选择文本复制。">复制我的修改</CopyButton></Space> : undefined} />}
    {base.assetDiagnostics.length > 0 && <Alert type="warning" message="部分文章资源暂时不可用，正文仍可编辑。" description={base.assetDiagnostics.map(item => item.message).join('；')} />}
    <div className="publication-editor-layout"><main className="publication-editor-main"><Form layout="vertical">
      <Form.Item label="标题" required><Input id="article-edit-title" className="publication-title-input" maxLength={150} value={draft.title} onChange={event => change('title', event.target.value)} disabled={busy} /></Form.Item>
      <Form.Item label="摘要"><Input.TextArea id="article-edit-summary" rows={2} maxLength={1000} value={draft.summary} onChange={event => change('summary', event.target.value)} placeholder="用一两句话说明文章的主题" disabled={busy} /></Form.Item>
    </Form><div className="publication-editor-toolbar"><label htmlFor="article-edit-content">正文</label><Space><Button size="small" type={mode === 'edit' ? 'primary' : 'default'} icon={<EditOutlined />} onClick={() => setMode('edit')}>编辑</Button><Button size="small" type={mode === 'preview' ? 'primary' : 'default'} icon={<EyeOutlined />} onClick={() => setMode('preview')}>预览</Button></Space></div>
      <div hidden={mode !== 'edit'}><Input.TextArea ref={textarea} id="article-edit-content" aria-label="文章正文" className="publication-writing-area" autoSize={{ minRows: 14 }} value={draft.content} onChange={event => { const node = event.currentTarget; selection.current = { start: node.selectionStart, end: node.selectionEnd }; change('content', node.value); }} onSelect={event => { const node = event.currentTarget; selection.current = { start: node.selectionStart, end: node.selectionEnd }; }} disabled={busy} /></div>
      {mode === 'preview' && <div className="publication-editor-preview" id="article-edit-preview"><ArticleBody content={draft.content} workspaceId={workspaceId || ''} projectCode={projectCode} publicationId={publicationId} sourceTaskId={sourceTaskId} /></div>}
      <p className="publication-hint" id="article-edit-hint">{sourceTaskId ? '支持修改标题、摘要和 Markdown 正文，保存到来源任务的稿件。' : '支持 Markdown 标题、列表、链接和图片。上传完成后插入资源引用，保存后正文才会更新。'}</p>
    </main><aside className="publication-edit-aside"><section className="publication-edit-info"><Form layout="vertical"><Form.Item label="所属项目"><Input value={article.projectName} disabled /></Form.Item><Form.Item label="稿件状态"><Select id="article-edit-status" value={draft.status} disabled={busy || Boolean(sourceTaskId)} onChange={value => change('status', value)} options={[...Object.entries(publicationStatus).map(([value, label]) => ({ value, label })), ...(!publicationStatus[draft.status] ? [{ value: draft.status, label: draft.status }] : [])]} /></Form.Item></Form>{!sourceTaskId && <p className="publication-hint">平台发布记录保持原样，不会自动同步。</p>}</section>
      <ArticleAssetsPanel workspaceId={workspaceId || ''} projectCode={projectCode} publicationId={publicationId} sourceTaskId={sourceTaskId} revision={base.revision} content={draft.content} assets={assets} disabled={busy} onAssets={setAssets} onInsert={insert} onConflict={text => { setSaveError(text); setConflict(true); }} />
      {!sourceTaskId && <section className="publication-edit-methods"><h2>让智能体（Agent）帮一把</h2>{writingMethods.slice(1).map(method => <Button type="text" block key={method.value} onClick={() => setWriting(method.value)}>{method.value}<span>→</span></Button>)}<p className="publication-hint">保存编辑后，可带上最新内容准备写作请求。</p></section>}
    </aside></div>
    {writing && <ArticleWritingDrawer projects={[{ code: projectCode, name: article.projectName }]} article={article} revision={base.revision} initialMethod={writing} hasUnsavedChanges={dirty} onClose={() => setWriting(null)} />}
    <Modal open={leave || (blocker.state === 'blocked' && !busy && !savingExit.current)} title="放弃尚未保存的修改？" okText="放弃修改" cancelText="继续编辑" onCancel={resetExit} onOk={discard}><p>已上传的资源文件会保留，正文改动尚未保存。</p></Modal>
    <Modal open={comparing} width={940} title="对照最新稿件" onCancel={() => setComparing(false)} footer={<Space wrap><Button onClick={() => setComparing(false)}>继续查看</Button><CopyButton text={currentText} size="middle" failureMessage="自动复制失败，请手动选择文本复制。">复制我的修改</CopyButton><Button type="primary" disabled={!latest || compareLoading} onClick={() => { if (!latest) return; setBase(latest); setAssets(latest.assets || []); setComparing(false); setConflict(false); setSaveError(''); }}>已完成对照，保留我的输入继续编辑</Button></Space>}>
      <Alert type="warning" message="请将需要保留的最新内容合入编辑框。确认后仍保留你的输入；下次保存将以当前编辑内容更新这份最新稿件。" />
      {compareLoading ? <Spin /> : compareError ? <Alert type="error" message={compareError} /> : latest && <div className="publication-compare"><section><h3>最新稿件</h3><strong>{latest.publication.title}</strong><p>{latest.publication.summary}</p><pre>{latest.content}</pre></section><section><h3>我的修改</h3><strong>{draft.title}</strong><p>{draft.summary}</p><pre>{draft.content}</pre></section></div>}
    </Modal>
  </div>;
}
