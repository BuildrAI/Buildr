import { useEffect, useRef } from 'react';
import { renderMarkdown } from '../../../markdown';
import { publicationAssetUrl, readingContent } from '../publication-model';

export type ArticleHeading = { text: string; index: number; level: number };
type Props = {
  content: string; workspaceId: string; projectCode: string; publicationId: string;
  onHeadings?: (headings: ArticleHeading[]) => void; onRelativeLink?: (href: string) => void;
  onScrollToReady?: (scroll: (index: number) => void) => void;
};
export function ArticleBody({ content, workspaceId, projectCode, publicationId, onHeadings, onRelativeLink, onScrollToReady }: Props) {
  const ref = useRef<HTMLDivElement>(null), callbacks = useRef({ onHeadings, onRelativeLink, onScrollToReady });
  callbacks.current = { onHeadings, onRelativeLink, onScrollToReady };
  useEffect(() => {
    if (!ref.current) return;
    const rendered = renderMarkdown(readingContent(content), {
      allowRelativeLinks: true,
      imageResolver: path => {
        const href = publicationAssetUrl(workspaceId, projectCode, publicationId, path);
        return href ? { href } : null;
      },
    });
    const headings = [...rendered.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')];
    headings.forEach((heading, index) => { heading.dataset.articleHeading = String(index); });
    callbacks.current.onHeadings?.(headings.map((heading, index) => ({ text: heading.textContent || '', index, level: Number(heading.tagName.slice(1)) })));
    callbacks.current.onScrollToReady?.(index => headings[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    for (const link of rendered.querySelectorAll<HTMLAnchorElement>('a.markdown-relative-link')) {
      const raw = link.getAttribute('href') || '';
      const asset = publicationAssetUrl(workspaceId, projectCode, publicationId, raw);
      if (asset) {
        link.href = asset; link.target = '_blank'; link.rel = 'noopener noreferrer';
      } else {
        link.addEventListener('click', event => { event.preventDefault(); callbacks.current.onRelativeLink?.(raw); });
      }
    }
    ref.current.replaceChildren(rendered);
  }, [content, workspaceId, projectCode, publicationId]);
  return <div ref={ref} className="publication-body" data-view="rendered" />;
}
