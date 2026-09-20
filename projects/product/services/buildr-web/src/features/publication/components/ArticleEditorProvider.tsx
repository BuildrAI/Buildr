import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { message } from 'antd';
import { ArticleEditorDrawer } from './ArticleEditorDrawer';
import { publicationsChanged } from '../api/publication-api';

type ArticleEditorTarget = { projectCode: string; publicationId: string };
type OpenArticleEditor = (target: ArticleEditorTarget) => void;
const ArticleEditorContext = createContext<OpenArticleEditor | null>(null);

/** Keep the active draft alive when its reader closes or browser history changes. */
export function ArticleEditorProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const [editing, setEditing] = useState<ArticleEditorTarget | null>(null);
  const [messages, holder] = message.useMessage();
  // An already open editor owns its draft until save or an explicit close.
  const open = useCallback<OpenArticleEditor>(target => setEditing(current => current || target), []);
  const close = () => {
    setEditing(null);
    // Discarding a conflicted draft must also expose the current persisted revision.
    window.dispatchEvent(new Event(publicationsChanged));
  };
  return <ArticleEditorContext.Provider value={open}>
    {children}{holder}
    {editing && <ArticleEditorDrawer key={`${editing.projectCode}:${editing.publicationId}`} workspaceId={workspaceId}
      projectCode={editing.projectCode} publicationId={editing.publicationId}
      onClose={close} onSaved={() => { messages.success('文章已保存'); }} />}
  </ArticleEditorContext.Provider>;
}

export function useArticleEditor(): OpenArticleEditor {
  const open = useContext(ArticleEditorContext);
  if (!open) throw new Error('Article editing requires the workspace editor provider');
  return open;
}
