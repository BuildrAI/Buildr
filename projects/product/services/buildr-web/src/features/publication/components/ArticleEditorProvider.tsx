import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { ArticleSourceDraftGuard } from './ArticleSourceDraftGuard';
import { publicationsChanged, type PublicationDetail } from '../api/publication-api';
import { workspaceHref } from '../../../lib/labels';

type ArticleEditorTarget = { projectCode: string; publicationId: string; sourceTaskId?: string };
type OpenArticleEditor = (target: ArticleEditorTarget) => void;
const ArticleEditorContext = createContext<OpenArticleEditor | null>(null);
export type ArticleSourceDraft = { key: string; target: ArticleEditorTarget; base: PublicationDetail; source: string; busy: boolean };
const ArticleSourceContext = createContext<{ draft: ArticleSourceDraft | null; setDraft: Dispatch<SetStateAction<ArticleSourceDraft | null>>; clear(): void } | null>(null);

/** 「编辑文章」不再开抽屉：入口统一把用户带到文章详情页的就地编辑。 */
export function ArticleEditorProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const navigate = useNavigate();
  const [source, setSource] = useState<ArticleSourceDraft | null>(null);
  const sourceRef = useRef(source); sourceRef.current = source;
  const [messages, holder] = message.useMessage();
  const open = useCallback<OpenArticleEditor>(target => {
    if (sourceRef.current) { messages.info('请先保存或取消原文修改。'); return; }
    const suffix = target.sourceTaskId ? `?task=${encodeURIComponent(target.sourceTaskId)}` : '';
    navigate(workspaceHref(workspaceId, `/articles/${encodeURIComponent(target.projectCode)}/${encodeURIComponent(target.publicationId)}/edit${suffix}`));
  }, [messages, navigate, workspaceId]);
  const clearSource = () => { setSource(null); window.dispatchEvent(new Event(publicationsChanged)); };
  return <ArticleEditorContext.Provider value={open}><ArticleSourceContext.Provider value={{ draft: source, setDraft: setSource, clear: clearSource }}>
    {children}{holder}
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
