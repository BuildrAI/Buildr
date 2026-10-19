import { useEffect, useRef } from 'react';
import { Modal, message } from 'antd';
import { useBlocker } from 'react-router-dom';
import { shouldBlockArticleNavigation } from '../publication-navigation';

export function ArticleSourceDraftGuard({ workspaceId, busy, onDiscard }: { workspaceId: string; busy: boolean; onDiscard: () => void }) {
  const state = useRef({ dirty: true, busy }); state.current = { dirty: true, busy };
  const savingExit = useRef(false);
  const [messages, holder] = message.useMessage();
  const blocker = useBlocker(({ nextLocation }) => {
    const blocked = shouldBlockArticleNavigation(workspaceId, nextLocation.pathname, state.current);
    savingExit.current = blocked && state.current.busy;
    return blocked;
  });
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  useEffect(() => {
    if (blocker.state !== 'blocked' || (!busy && !savingExit.current)) return;
    savingExit.current = false; blocker.reset(); messages.info('原文正在保存，请稍候再离开。');
  }, [blocker, busy, messages]);
  return <>{holder}<Modal open={blocker.state === 'blocked' && !busy && !savingExit.current} title="放弃尚未保存的原文修改？" okText="放弃修改" cancelText="继续编辑"
    onCancel={() => { if (blocker.state === 'blocked') blocker.reset(); }} onOk={() => { if (state.current.busy) return; if (blocker.state === 'blocked') blocker.proceed(); onDiscard(); }}>
    <p>原文修改尚未保存。</p>
  </Modal></>;
}
