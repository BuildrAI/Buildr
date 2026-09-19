import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { MarkdownHost } from '../../../components/MarkdownHost';
import type { ChangeArtifact, ChangePayload } from '../../../components/ChangeBriefPanel';
import { resolveProjectMarkdownHref } from '../../../lib/projectDocuments';

export function taskChangeArtifacts(change: ChangePayload): Array<{ label: string; artifact: ChangeArtifact }> {
  return [
    { label: '方案摘要', artifact: change.brief },
    { label: '提案', artifact: change.artifacts.proposal },
    { label: '设计', artifact: change.artifacts.design },
    ...change.artifacts.specs.map(artifact => ({ label: `规格 · ${artifact.capability || artifact.path.split('/').at(-2) || '行为说明'}`, artifact })),
    { label: '实施任务', artifact: change.artifacts.tasks },
  ];
}

export function TaskArtifactReader({ change, artifactPath, sourceHref, onClose, onSelect }: {
  change: ChangePayload;
  artifactPath: string;
  sourceHref: string;
  onClose(): void;
  onSelect(path: string): void;
}) {
  const { state } = useLocation();
  const [message, setMessage] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const items = taskChangeArtifacts(change);
  const selected = items.find(item => item.artifact.path === artifactPath);
  useEffect(() => { setMessage(''); }, [artifactPath]);
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); origin?.focus(); };
  }, []);
  const followLink = (href: string) => {
    const path = resolveProjectMarkdownHref(artifactPath, href);
    const target = items.find(item => item.artifact.path === path);
    if (target) onSelect(target.artifact.path);
    else setMessage('这个链接不在当前已读取的方案材料中，可打开完整方案查看来源。');
  };
  return <aside className="task-document-reader" aria-label="成果阅读">
    <div className="task-document-reader-header"><strong>成果阅读</strong><Button id="task-artifact-close" type="text" aria-label="关闭成果阅读" onClick={onClose}>关闭</Button></div>
    <div id="task-artifact-reader" className="task-document-preview">
      <div className="task-document-preview-heading"><div><strong>{selected?.label || '关联成果'}</strong><small>{change.name}</small></div></div>
      <code className="task-document-preview-path">{artifactPath}</code>
      <Link state={state} to={sourceHref}>查看完整方案与读取来源</Link>
      {message && <Alert type="info" message={message} />}
      {selected?.artifact.exists && selected.artifact.content != null ? <MarkdownHost markdown={selected.artifact.content} className="task-document-preview-content markdown-body" options={{ headingOffset: 1, allowRelativeLinks: true, allowParentRelativeLinks: true, onRelativeLinkClick: followLink }} /> : <Alert type="info" message="当前没有可读取的正文。" />}
    </div>
  </aside>;
}
