import { Button } from 'antd';
import { useAgentConversationShell } from './AgentConversationsContext';

export function ConversationAttention({className=''}:{className?:string}) {
  const {pending,openGlobal}=useAgentConversationShell();
  if(!pending.length)return null;
  const label=`查看${pending.length}段待回应对话`;
  const openPending=()=>{
    openGlobal();
    requestAnimationFrame(()=>{
      const panel=document.getElementById('agent-conversation-panel');
      const target=panel?.querySelector<HTMLButtonElement>(pending.length===1?'.ac-thread-title':'button[aria-label="返回当前对话"]');
      if(target?.getClientRects().length)target.focus({preventScroll:true});
    });
  };
  return <Button type="text" className={'ac-attention-entry'+(className?' '+className:'')} aria-label={label} title={label} onClick={openPending}>
    <span className="ac-attention-count">{pending.length}</span>
  </Button>;
}
