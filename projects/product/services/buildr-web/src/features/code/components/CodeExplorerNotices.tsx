import { useId, useState } from 'react';
import { Alert, Button } from 'antd';

export type CodeExplorerNotice = {kind: string; title: string; details: string[]};

/** A status or association failure must not claim that file contents are unreadable. */
export function CodeExplorerNotices({notices, onRetry}: {notices: CodeExplorerNotice[]; onRetry(kind: string): void}) {
  const id = useId();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const visible = notices.map(notice => ({...notice, details:[...new Set(notice.details.filter(detail => detail.trim()))]})).filter(notice => notice.details.length);
  if (!visible.length) return null;
  return <div className="code-explorer-notices">{visible.map(notice => <section key={notice.kind} data-code-notice-kind={notice.kind}>
    <Alert type="warning" showIcon message={notice.title} description={expanded[notice.kind] ? <ul id={id + ':' + notice.kind} className="code-explorer-notice-details" aria-label={notice.title + '的原因'}>{notice.details.map(detail => <li key={detail}>{detail}</li>)}</ul> : undefined}
      action={<div className="code-explorer-notice-actions"><Button size="small" type="text" aria-expanded={Boolean(expanded[notice.kind])} aria-controls={expanded[notice.kind] ? id + ':' + notice.kind : undefined} aria-label={(expanded[notice.kind] ? '收起原因 · ' : '查看原因 · ') + notice.title} onClick={() => setExpanded(previous => ({...previous, [notice.kind]:!previous[notice.kind]}))}>{expanded[notice.kind] ? '收起原因' : '查看原因'}</Button><Button size="small" onClick={() => onRetry(notice.kind)}>{notice.kind === 'updates' ? '重新核对' : '重试'}</Button></div>} />
  </section>)}</div>;
}
