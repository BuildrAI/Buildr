import {useConversationHost} from '../integration/ConversationHost';
import { useEffect, useRef, useState } from 'react';
import { renderMarkdown, type MarkdownRenderOptions } from '../markdown.ts';
import { bindMarkdownDiagramPreviews, type MarkdownDiagramTarget } from '../lib/markdownDiagramPreviews.ts';
import { bindMarkdownImagePreviews } from '../lib/markdownImagePreviews.ts';
import { renderMarkdownDiagrams } from '../lib/markdownDiagrams.ts';
import { MarkdownDiagramPreview } from './MarkdownDiagramPreview.tsx';

type Props = {
  markdown: string;
  className?: string;
  options?: MarkdownRenderOptions;
  fragment?: string;
  renderVersion?: string;
};

export function scrollMarkdownFragment(root: HTMLElement, fragment: string) {
  let id: string;
  try { id = decodeURIComponent(fragment.replace(/^#/, '')); } catch { return false; }
  const heading = [...root.querySelectorAll<HTMLElement>('[id]')].find(item => item.id === id);
  if (!heading) return false;
  heading.scrollIntoView({ block: 'start' });
  return true;
}

export function MarkdownHost({ markdown, className, options, fragment, renderVersion }: Props) {
  const hostActions=useConversationHost();
  const hostActionsRef=useRef(hostActions);hostActionsRef.current=hostActions;
  const ref = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [diagramPreview, setDiagramPreview] = useState<MarkdownDiagramTarget | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const currentOptions = optionsRef.current || {};
    const view = renderMarkdown(markdown, currentOptions);
    if (className) {
      for (const token of className.split(/\s+/).filter(Boolean)) view.classList.add(token);
    }
    for (const link of view.querySelectorAll<HTMLAnchorElement>('a.markdown-relative-link')) {
        const reference = link.getAttribute('data-markdown-href') || '';
        if(reference.trim().startsWith('@')){link.classList.remove('markdown-relative-link');if(hostActionsRef.current.openObject&&currentOptions.taskLinkPathname){link.setAttribute('href','#');link.addEventListener('click',event=>{event.preventDefault();hostActionsRef.current.openObject?.(reference,currentOptions.taskLinkPathname!);});}else if(window.parent!==window&&currentOptions.taskLinkPathname){link.setAttribute('href','#');link.addEventListener('click',event=>{event.preventDefault();window.parent.postMessage({protocol:'buildr.harness-frame/v1',event:'work-object',reference,scopePath:currentOptions.taskLinkPathname},location.origin);});}else{link.removeAttribute('href');link.setAttribute('title','此工作对象需要相应工作环境支持');}continue;}
        link.addEventListener('click', (event) => {
          event.preventDefault();
          const href = link.getAttribute('data-markdown-href') || link.getAttribute('href') || '';
          if (href.startsWith('#') && scrollMarkdownFragment(host.closest<HTMLElement>('.knowledge-artifact, .knowledge-documents, .markdown-reader') || view, href)) return;
          optionsRef.current?.onRelativeLinkClick?.(href, event);
        });
    }
    if (currentOptions.onImageClick) bindMarkdownImagePreviews(view, () => optionsRef.current?.onImageClick);
    bindMarkdownDiagramPreviews(view, () => (diagram) => {
      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage(
          { protocol: 'buildr.harness-frame/v1', event: 'diagram-preview', svg: diagram.svg, source: diagram.source },
          window.location.origin,
        );
        return;
      }
      setDiagramPreview(diagram);
    });
    host.replaceChildren(view);
    if (fragment) requestAnimationFrame(() => scrollMarkdownFragment(view, fragment));
    return renderMarkdownDiagrams(view, hostActionsRef.current.diagramRendererPath);
  }, [markdown, className, fragment, renderVersion, options?.taskLinkPathname, JSON.stringify(options?.headingCounts)]);

  return (
    <>
      <div ref={ref} />
      {diagramPreview && (
        <MarkdownDiagramPreview
          svg={diagramPreview.svg}
          source={diagramPreview.source}
          onClose={() => setDiagramPreview(null)}
        />
      )}
    </>
  );
}
