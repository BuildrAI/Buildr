import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ConversationExecutionIndicator } from './ConversationExecutionIndicator';
import { locateConversationContent } from './conversation-reading';

type Props = {
  id: string;
  runId?: string;
  prompt?: { id: string; text: string; images?: ReactNode; diagnostic?: ReactNode };
  identity?: string;
  executing?: boolean;
  startedAt?: string;
  showExecutionIndicator?: boolean;
  finishedAt?: string;
  processExpanded?: boolean;
  onToggleProcess?: () => void;
  onCollapseProcess?: () => void;
  collapseLabel?: string;
  children?: ReactNode;
};

/** Keeps the input and its assistant together while reading this part of the conversation. */
export function ConversationTurn({ id, runId, prompt, identity, executing = false, startedAt, showExecutionIndicator = true, finishedAt, processExpanded, onToggleProcess, onCollapseProcess, collapseLabel = '收起处理过程', children }: Props) {
  const turn = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false), [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => setLong(node.scrollHeight > 100);
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [prompt?.id, prompt?.text, prompt?.images]);
  const locateInput = () => { if (turn.current) locateConversationContent(turn.current, false); };
  const locateAssistant = () => {
    const target = body.current?.querySelector<HTMLElement>('.ac-message.is-assistant') || body.current;
    if (target) locateConversationContent(target);
  };
  /* While a run is still preparing there is nothing to identify yet; the row appears once it carries time, failures or controls. */
  const canToggleProcess = Boolean(onToggleProcess || onCollapseProcess);
  const showIdentity = Boolean(identity || canToggleProcess) && (!executing || Boolean(startedAt) || canToggleProcess);
  const identityExpanded = onToggleProcess ? Boolean(processExpanded) : true;
  const identityActionLabel = onToggleProcess ? (processExpanded ? '收起处理过程' : '展开处理过程') : onCollapseProcess ? collapseLabel : '定位助手内容';
  const handleIdentityClick = () => {
    if (onToggleProcess) { onToggleProcess(); if (processExpanded) requestAnimationFrame(locateInput); return; }
    if (onCollapseProcess) { onCollapseProcess(); requestAnimationFrame(locateInput); return; }
    locateAssistant();
  };
  return <section ref={turn} className={'ac-turn' + (executing ? ' is-executing' : '')} data-turn-id={id} data-run-id={runId} tabIndex={-1}>
    <div className="ac-turn-context">
      {prompt && <article className="ac-message is-user ac-turn-prompt" data-entry-id={prompt.id}>
        <div ref={content} className={'ac-turn-prompt-content' + (expanded ? ' is-expanded' : '')} tabIndex={expanded ? 0 : undefined}>
          {prompt.text && <p>{prompt.text}</p>}{prompt.images}
        </div>
        {long && <button type="button" className="ac-turn-prompt-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起内容' : '展开内容'}</button>}
        {prompt.diagnostic}
      </article>}
    </div>
    {showIdentity && <div className="ac-turn-identity">
        <button type="button" className={'ac-message-identity ac-turn-identity-link' + (canToggleProcess ? ' ac-turn-identity-toggle' : '')} aria-label={identityActionLabel} title={identityActionLabel} aria-expanded={canToggleProcess ? identityExpanded : undefined} onClick={handleIdentityClick}>{identity||'助手'}{canToggleProcess && (identityExpanded ? <UpOutlined className="ac-turn-identity-caret" /> : <DownOutlined className="ac-turn-identity-caret" />)}</button>
        {showExecutionIndicator && startedAt && <ConversationExecutionIndicator startedAt={startedAt} active={executing} finishedAt={finishedAt} />}
      </div>}
    <div ref={body} className="ac-turn-content" tabIndex={-1}>{children}</div>
  </section>;
}
