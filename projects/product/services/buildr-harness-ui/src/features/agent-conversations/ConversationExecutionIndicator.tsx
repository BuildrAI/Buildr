import { useEffect, useState } from 'react';

type Props = { startedAt: string; active: boolean; finishedAt?: string };
function elapsedLabel(startedAt: string, observedAt: number) {
  const seconds = Math.max(0, Math.floor((observedAt - Date.parse(startedAt)) / 1000));
  if (!Number.isFinite(seconds)) return '00:00:00';
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60, rest = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** The shared live indicator uses the persisted start time, so refresh does not restart its clock. */
export function ConversationExecutionIndicator({ startedAt, active, finishedAt }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, startedAt]);
  const duration = elapsedLabel(startedAt, !active && finishedAt ? Date.parse(finishedAt) : now);
  return <span className={'ac-execution-indicator' + (active ? ' is-active' : '')} role="status" aria-label={(active ? '智能体正在执行，已持续 ' : '本轮执行时间 ') + duration}>
    {active && <span className="ac-execution-light" aria-hidden="true" />}<time>{duration}</time>
  </span>;
}
