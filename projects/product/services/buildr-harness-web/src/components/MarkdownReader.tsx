import { useEffect, useState, type ReactNode } from 'react';
import { Button } from 'antd';
import { MarkdownHost } from './MarkdownHost.tsx';
import type { MarkdownRenderOptions } from '../markdown.ts';
import './markdown-reader.css';

/** Shared read-only Markdown surface: original bytes and the existing safe renderer. */
export function MarkdownReader({ content, source = content, path, fragment, options, className = 'markdown-body', toolbarStart }: {
  content: string; source?: string; path: string; fragment?: string; options?: MarkdownRenderOptions; className?: string; toolbarStart?: ReactNode;
}) {
  const [raw, setRaw] = useState(false);
  useEffect(() => setRaw(false), [path]);
  return <section className="markdown-reader">
    <div className="markdown-reader-toolbar"><span>{toolbarStart === undefined ? path.split('/').at(-1) : toolbarStart}</span><Button type="text" size="small" aria-pressed={raw} onClick={() => setRaw(value => !value)}>{raw ? '阅读模式' : '查看原文'}</Button></div>
    {raw ? <pre className="markdown-reader-source" aria-label="Markdown 原文">{source}</pre> : <MarkdownHost key={path} markdown={content} fragment={fragment} className={className} options={options} />}
  </section>;
}
