import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { MarkdownReader } from '../../../components/MarkdownReader';
import type { ChangeArtifact, ChangePayload } from '../../../components/ChangeBriefPanel';
import { resolveProjectMarkdownHref } from '../../../lib/projectDocuments';

export function taskChangeArtifacts(change: ChangePayload): Array<{ label: string; artifact: ChangeArtifact }> {
  return [
    { label: '需求或说明', artifact: change.brief },
    { label: '提案', artifact: change.artifacts.proposal },
    { label: '设计', artifact: change.artifacts.design },
    ...change.artifacts.specs.map(artifact => ({ label: `规范 · ${artifact.capability || artifact.path.split('/').at(-2) || '行为说明'}`, artifact })),
    { label: '实施清单', artifact: change.artifacts.tasks },
  ];
}

export function TaskArtifactReader({ change, artifactPath, onClose, onSelect, onProjectDocument, embedded = false }: {
  embedded?: boolean; change: ChangePayload;
  artifactPath: string;
  onClose(): void;
  onSelect(path: string): void;
  onProjectDocument?(path: string): void;
}) {
  const [message, setMessage] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const items = taskChangeArtifacts(change);
  const selected = items.find(item => item.artifact.path === artifactPath);
  useEffect(() => { setMessage(''); }, [artifactPath]);
  useEffect(() => {
    if (embedded) return;
    const origin = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); origin?.focus(); };
  }, [embedded]);
  const followLink = (href: string) => {
    const path = resolveProjectMarkdownHref(artifactPath, href);
    const target = items.find(item => item.artifact.path === path);
    if (target) onSelect(target.artifact.path);
    else if (path && onProjectDocument) onProjectDocument(path);
    else setMessage('这个链接不在当前项目的可读材料范围内。');
  };
  return <aside className={`task-document-reader${embedded ? ' task-document-embedded' : ''}`} aria-label="成果阅读">
    <div className="task-document-reader-header" hidden={embedded}><strong>成果阅读</strong><Button id={embedded ? undefined : "task-artifact-close"} type="text" aria-label="关闭成果阅读" onClick={onClose}>关闭</Button></div>
    <div id={embedded ? undefined : "task-artifact-reader"} className="task-document-preview">
      <div className="task-document-preview-heading" hidden={embedded}><div><strong>{selected?.label || '关联成果'}</strong><small>{change.name}</small></div></div>
      {message && <Alert type="info" message={message} />}
      {selected?.artifact.exists && selected.artifact.content?.trim() ? <MarkdownReader path={artifactPath} content={selected.artifact.content} className="task-document-preview-content markdown-body" options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick: followLink }} /> : <Alert type="info" message="当前文档为空或没有可读取的正文。" />}
    </div>
  </aside>;
}
