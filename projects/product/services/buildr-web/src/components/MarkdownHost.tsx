import { useEffect, useRef } from 'react';
import { renderMarkdown, type MarkdownRenderOptions } from '../markdown';

type Props = {
  markdown: string;
  className?: string;
  options?: MarkdownRenderOptions;
};

export function MarkdownHost({ markdown, className, options }: Props) {
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
    const onRelativeLinkClick = currentOptions.onRelativeLinkClick;
    if (onRelativeLinkClick) {
      for (const link of view.querySelectorAll<HTMLAnchorElement>('a.markdown-relative-link')) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          const href = link.getAttribute('href') || '';
          onRelativeLinkClick(href, event);
        });
      }
    }
    host.replaceChildren(view);
  }, [markdown, className]);

  return <div ref={ref} />;
}
