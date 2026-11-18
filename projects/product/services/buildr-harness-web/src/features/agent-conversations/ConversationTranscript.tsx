import {useLayoutEffect, useRef, type ReactNode} from 'react';
import {Spin} from 'antd';

type Props = {loading: boolean; children: ReactNode};

/** Keep one committed transcript mounted while reading the next selection.
 * This is presentation only: stale controls are inert and never become live data.
 */
export function ConversationTranscript({loading, children}: Props) {
  const committed = useRef<ReactNode>(null);
  useLayoutEffect(() => {
    if (!loading) committed.current = children;
  }, [loading, children]);
  return <>
    {loading && <div className="ac-transcript-loading" role="status" aria-label="正在切换对话"><Spin size="small"/><span>正在读取对话…</span></div>}
    <div className="ac-transcript" inert={loading} aria-hidden={loading || undefined} data-transcript-loading={loading || undefined}>
      {loading ? committed.current : children}
    </div>
  </>;
}
