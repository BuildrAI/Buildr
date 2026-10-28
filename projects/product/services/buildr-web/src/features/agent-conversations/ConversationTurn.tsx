import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ConversationExecutionIndicator } from './ConversationExecutionIndicator';

type Props = {
  id: string;
  runId?: string;
  prompt?: { id: string; text: string; images?: ReactNode; diagnostic?: ReactNode };
  identity?: string;
  startedAt?: string;
  children?: ReactNode;
};

/** Keeps the input and its assistant together while reading this part of the conversation. */
export function ConversationTurn({ id, runId, prompt, identity, startedAt, children }: Props) {
  const content = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false), [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => setLong(node.scrollHeight > 100);
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [prompt?.id, prompt?.text, prompt?.images]);
  return <section className="ac-turn" data-turn-id={id} data-run-id={runId}>
    <div className="ac-turn-context">
      {prompt && <article className="ac-message is-user ac-turn-prompt" data-entry-id={prompt.id}>
        <div ref={content} className={'ac-turn-prompt-content' + (expanded ? ' is-expanded' : '')} tabIndex={expanded ? 0 : undefined}>
          {prompt.text && <p>{prompt.text}</p>}{prompt.images}
        </div>
        {long && <button type="button" className="ac-turn-prompt-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起内容' : '展开内容'}</button>}
        {prompt.diagnostic}
      </article>}
      {identity && <div className="ac-turn-identity"><small className="ac-message-identity">{identity}</small>{startedAt && <ConversationExecutionIndicator startedAt={startedAt} active />}</div>}
    </div>
    <div className="ac-turn-content">{children}</div>
  </section>;
}
