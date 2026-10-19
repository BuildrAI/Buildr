import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { message } from 'antd';
import { ArticleEditorDrawer } from './ArticleEditorDrawer';
import { ArticleSourceDraftGuard } from './ArticleSourceDraftGuard';
import { publicationsChanged, type PublicationDetail } from '../api/publication-api';

type ArticleEditorTarget = { projectCode: string; publicationId: string; sourceTaskId?: string };
type OpenArticleEditor = (target: ArticleEditorTarget) => void;
const ArticleEditorContext = createContext<OpenArticleEditor | null>(null);
export type ArticleSourceDraft = { key: string; target: ArticleEditorTarget; base: PublicationDetail; source: string; busy: boolean };
const ArticleSourceContext = createContext<{ draft: ArticleSourceDraft | null; setDraft: Dispatch<SetStateAction<ArticleSourceDraft | null>>; clear(): void; blocked: boolean } | null>(null);

/** Keep the active draft alive when its reader closes or browser history changes. */
export function ArticleEditorProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const [editing, setEditing] = useState<ArticleEditorTarget | null>(null);
  const [source, setSource] = useState<ArticleSourceDraft | null>(null);
  const sourceRef = useRef(source); sourceRef.current = source;
  const [messages, holder] = message.useMessage();
  // An already open editor owns its draft until save or an explicit close.
  const open = useCallback<OpenArticleEditor>(target => {
    if (sourceRef.current) { messages.info('请先保存或取消原文修改。'); return; }
    setEditing(current => current || target);
  }, [messages]);
  const clearSource = () => { setSource(null); window.dispatchEvent(new Event(publicationsChanged)); };
  const close = () => {
    setEditing(null);
    // Discarding a conflicted draft must also expose the current persisted revision.
    window.dispatchEvent(new Event(publicationsChanged));
  };
  return <ArticleEditorContext.Provider value={open}><ArticleSourceContext.Provider value={{ draft: source, setDraft: setSource, clear: clearSource, blocked: Boolean(editing) }}>
    {children}{holder}
    {editing && <ArticleEditorDrawer key={`${editing.projectCode}:${editing.publicationId}:${editing.sourceTaskId || ''}`} workspaceId={workspaceId}
      projectCode={editing.projectCode} publicationId={editing.publicationId} sourceTaskId={editing.sourceTaskId}
      onClose={close} onSaved={() => { messages.success('文章已保存'); }} />}
    {source && <ArticleSourceDraftGuard workspaceId={workspaceId} busy={source.busy} onDiscard={clearSource} />}
  </ArticleSourceContext.Provider></ArticleEditorContext.Provider>;
}

export function useArticleSourceDraft() {
  const value = useContext(ArticleSourceContext);
  if (!value) throw new Error('Article source editing requires the workspace editor provider');
  return value;
}

export function useArticleEditor(): OpenArticleEditor {
  const open = useContext(ArticleEditorContext);
  if (!open) throw new Error('Article editing requires the workspace editor provider');
  return open;
}
