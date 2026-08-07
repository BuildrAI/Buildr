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
    const view = renderMarkdown(markdown, optionsRef.current || {});
    if (className) {
      for (const token of className.split(/\s+/).filter(Boolean)) view.classList.add(token);
    }
    host.replaceChildren(view);
  }, [markdown, className]);

  return <div ref={ref} />;
}
