import { useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Space } from 'antd';
import { publicationApi, type PublicationDetail } from '../api/publication-api';
import { useArticleSourceDraft, type ArticleSourceDraft } from './ArticleEditorProvider';

type Props = { detail: PublicationDetail; projectCode: string; publicationId: string; sourceTaskId?: string; onSaved(detail: PublicationDetail): void };

/** Inline source edits share the workspace draft lifetime with the existing article editor. */
export function ArticleSourceEditor({ detail, projectCode, publicationId, sourceTaskId, onSaved }: Props) {
  const editor = useArticleSourceDraft();
  const key = JSON.stringify([projectCode, publicationId, sourceTaskId || null]);
  const current = editor.draft?.key === key ? editor.draft : null;
  const source = current?.source ?? detail.source;
  const blocked = Boolean(editor.draft && !current);
  const busy = Boolean(current?.busy), dirty = Boolean(current && source !== current.base.source);
  const [error, setError] = useState(''), [conflict, setConflict] = useState(false), [latest, setLatest] = useState<PublicationDetail | null>(null), [comparing, setComparing] = useState(false), [reading, setReading] = useState(false);
  const saving = useRef(false);
  const change = (value: string) => {
    if (blocked || busy) return;
    editor.setDraft(previous => {
      if (previous && previous.key !== key) return previous;
      const base = previous?.base || detail;
      return value === base.source ? null : { key, target: { projectCode, publicationId, sourceTaskId }, base, source: value, busy: false };
    });
  };
  const save = async () => {
    if (!current || !dirty || saving.current) return;
    saving.current = true; setError('');
    const observed: ArticleSourceDraft = { ...current, busy: true };
    editor.setDraft(observed);
    try {
      const result = await publicationApi.updateSource(projectCode, publicationId, current.base.revision, current.source, sourceTaskId);
      onSaved(result); editor.clear(); setConflict(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，修改已保留。');
      setConflict(/revision|conflict/i.test(String((cause as { code?: string })?.code || '')));
      editor.setDraft({ ...observed, busy: false });
    } finally { saving.current = false; }
  };
  const compare = async () => {
    setReading(true); setError('');
    try { setLatest(await publicationApi.detail(publicationId, undefined, projectCode, sourceTaskId)); setComparing(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '最新原文读取失败。'); }
    finally { setReading(false); }
  };
  return <section className="publication-source-editor" data-view="source">
    <div className="publication-source-toolbar"><span role="status">{busy ? '正在保存…' : dirty ? '有尚未保存的修改' : '可直接编辑原文'}</span><Space>
      <Button disabled={!current || busy} onClick={() => { editor.clear(); setError(''); setConflict(false); }}>取消修改</Button>
      <Button id="article-source-save" type="primary" disabled={!dirty || blocked} loading={busy} onClick={() => void save()}>保存原文</Button>
    </Space></div>
    {blocked && <Alert type="info" message="另有文章正在编辑，请先保存或取消那份修改。" />}
    {error && <Alert type="error" message={conflict ? '原文已被其他入口修改，你的输入已保留。' : '原文尚未保存，你的输入已保留。'} description={error}
      action={conflict && <Button size="small" loading={reading} onClick={() => void compare()}>对照最新原文</Button>} />}
    <Input.TextArea id="article-source-content" aria-label="文章原文" className="publication-source-input" value={source} onChange={event => change(event.target.value)} disabled={busy || blocked} autoSize={{ minRows: 22 }} spellCheck={false} />
    <Modal open={comparing} title="对照最新原文" width={940} onCancel={() => setComparing(false)} footer={<Space><Button onClick={() => setComparing(false)}>继续查看</Button><Button type="primary" disabled={!latest || !current} onClick={() => {
      if (!latest || !current) return;
      editor.setDraft({ ...current, base: latest }); setComparing(false); setConflict(false); setError('');
    }}>已完成对照，保留输入继续编辑</Button></Space>}>
      <Alert type="warning" message="请将需要保留的最新内容合入原文后再保存。确认对照会保留你的输入。" />
      {latest && <div className="publication-compare"><section><h3>最新原文</h3><pre>{latest.source}</pre></section><section><h3>我的修改</h3><pre>{source}</pre></section></div>}
    </Modal>
  </section>;
}
