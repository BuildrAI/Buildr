import { useEffect, useRef } from 'react';
import { renderMarkdown, type MarkdownRenderOptions } from '../markdown.ts';
import { bindMarkdownImagePreviews } from '../lib/markdownImagePreviews.ts';
import {useHarnessUiHost} from '../host.tsx';
import { renderMarkdownDiagrams } from '../lib/markdownDiagrams.ts';

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
  const hostAdapter=useHarnessUiHost();
  const ref = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
        if(reference.trim().startsWith('@')){
          const target=hostAdapter.resolveWorkObjectLink?.(reference,currentOptions.taskLinkPathname);
          link.classList.remove('markdown-relative-link');
          if(target){link.classList.add('markdown-task-link');link.setAttribute('href',target.href);link.setAttribute('title',target.title);}
          else {link.removeAttribute('href');link.setAttribute('title','工作对象引用不可用');}
          continue;
        }
        link.addEventListener('click', (event) => {
          event.preventDefault();
          const href = link.getAttribute('data-markdown-href') || link.getAttribute('href') || '';
          if (href.startsWith('#') && scrollMarkdownFragment(host.closest<HTMLElement>('.knowledge-artifact, .knowledge-documents, .markdown-reader') || view, href)) return;
          optionsRef.current?.onRelativeLinkClick?.(href, event);
        });
    }
    if (currentOptions.onImageClick) bindMarkdownImagePreviews(view, () => optionsRef.current?.onImageClick);
    host.replaceChildren(view);
    if (fragment) requestAnimationFrame(() => scrollMarkdownFragment(view, fragment));
    return renderMarkdownDiagrams(view);
  }, [markdown, className, fragment, renderVersion, hostAdapter, options?.taskLinkPathname, JSON.stringify(options?.headingCounts)]);

  return <div ref={ref} />;
}
