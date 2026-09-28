import { MarkdownHost } from '../../../components/MarkdownHost';
import { knowledgeReferenceImage, type KnowledgeReference, type KnowledgeScope } from '../api/knowledge-api';
import { resolveKnowledgePath } from '../knowledge-navigation';

type Props = {
  content: string;
  path: string;
  workspaceId: string;
  scope: KnowledgeScope;
  reference: KnowledgeReference;
  fragment?: string;
  headingCounts?: Record<string, number>;
  onLink?: (href: string) => boolean;
  onReference: (reference: KnowledgeReference, title: string, fragment?: string) => void;
};

/** Registered and discovered documents share local-link and image behavior. */
export function KnowledgeMarkdown({ content, path, workspaceId, scope, reference, fragment, headingCounts, onLink, onReference }: Props) {
  return <MarkdownHost markdown={content} className="markdown-body" fragment={fragment} options={{
    allowRelativeLinks: true,
    allowParentRelativeLinks: true,
    sourcePath: path,
    headingCounts,
    imageResolver: href => /\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(href) && resolveKnowledgePath(path, href)
      ? { href: knowledgeReferenceImage(workspaceId, scope, { ...reference, links: [...reference.links, href] }) } : null,
    onRelativeLinkClick: href => {
      const hash = href.includes('#') ? href.slice(href.indexOf('#')) : undefined;
      if (!hash && onLink?.(href)) return;
      onReference({ ...reference, links: [...reference.links, href] }, href.split(/[?#]/)[0].split('/').at(-1) || path.split('/').at(-1) || '引用文件', hash);
    },
  }} />;
}
