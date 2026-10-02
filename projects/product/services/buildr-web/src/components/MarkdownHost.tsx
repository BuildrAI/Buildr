import { useEffect, useRef } from 'react';
import { renderMarkdown, type MarkdownRenderOptions } from '../markdown';
import { resolveTaskBriefReference, taskBriefHref } from '../lib/taskBriefLinks';

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
        if (reference.trim().startsWith('@task/')) {
          const taskId = resolveTaskBriefReference(reference);
          // The workspace shell handles this real resource link, preserving the
          // original reading pane. Never send a task reference to a file reader.
          link.classList.remove('markdown-relative-link');
          if (taskId) {
            link.classList.add('markdown-task-link');
            link.setAttribute('href', taskBriefHref(taskId, window.location.pathname));
            link.setAttribute('title', `任务说明：${taskId}`);
          } else {
            link.removeAttribute('href');
            link.setAttribute('title', '任务说明引用无效');
          }
          continue;
        }
        link.addEventListener('click', (event) => {
          event.preventDefault();
          const href = link.getAttribute('data-markdown-href') || link.getAttribute('href') || '';
          if (href.startsWith('#') && scrollMarkdownFragment(host.closest<HTMLElement>('.knowledge-artifact, .knowledge-documents, .markdown-reader') || view, href)) return;
          optionsRef.current?.onRelativeLinkClick?.(href, event);
        });
    }
    host.replaceChildren(view);
    if (fragment) requestAnimationFrame(() => scrollMarkdownFragment(view, fragment));
  }, [markdown, className, fragment, renderVersion, JSON.stringify(options?.headingCounts)]);

  return <div ref={ref} />;
}
