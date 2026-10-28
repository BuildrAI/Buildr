import { AimOutlined, UpOutlined } from '@ant-design/icons';
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
  onCollapseProcess?: () => void;
  collapseLabel?: string;
  children?: ReactNode;
};

/** Keeps the input and its assistant together while reading this part of the conversation. */
export function ConversationTurn({ id, runId, prompt, identity, executing = false, startedAt, showExecutionIndicator = true, onCollapseProcess, collapseLabel = '收起处理过程', children }: Props) {
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
  return <section ref={turn} className={'ac-turn' + (executing ? ' is-executing' : '')} data-turn-id={id} data-run-id={runId} tabIndex={-1}>
    <div className="ac-turn-context">
      {prompt && <article className="ac-message is-user ac-turn-prompt" data-entry-id={prompt.id}>
        <button type="button" className="ac-turn-locate-input" aria-label="定位用户输入" title="定位用户输入" onClick={locateInput}><AimOutlined /></button>
        <div ref={content} className={'ac-turn-prompt-content' + (expanded ? ' is-expanded' : '')} tabIndex={expanded ? 0 : undefined}>
          {prompt.text && <p>{prompt.text}</p>}{prompt.images}
        </div>
        {long && <button type="button" className="ac-turn-prompt-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起内容' : '展开内容'}</button>}
        {prompt.diagnostic}
      </article>}
      {identity && <div className="ac-turn-identity">
        <button type="button" className="ac-message-identity ac-turn-identity-link" aria-label="定位助手内容" title="定位助手内容" onClick={locateAssistant}>{identity}<AimOutlined className="ac-turn-locate-icon" aria-hidden="true" /></button>
        {showExecutionIndicator && startedAt && <ConversationExecutionIndicator startedAt={startedAt} active />}
        {onCollapseProcess && <button type="button" className="ac-turn-collapse" onClick={() => { onCollapseProcess(); requestAnimationFrame(locateInput); }}><UpOutlined aria-hidden="true" />{collapseLabel}</button>}
      </div>}
    </div>
    <div ref={body} className="ac-turn-content" tabIndex={-1}>{children}</div>
  </section>;
}
