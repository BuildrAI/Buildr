import {useMemo,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {HarnessUiHostProvider,type HarnessUiHost} from '@buildr-ai/buildr-harness-ui';
import {ConversationTaskLink} from './ConversationTaskLink';
import {BuildrParticipation} from './BuildrParticipation';
import {codeApi} from '../code/api/code-api';
import {conversationFileReference} from './conversation-process';
import {conversationFileTarget} from './conversation-files';
import {resolveTaskBriefReference,taskBriefHref} from '../../lib/taskBriefLinks';
import type {ConversationView} from './types';

/** Development contributes business controls and source-checked file navigation only.
 * Sending, drafts, subscriptions, models and execution controls stay in Harness UI. */
export function DevelopmentHarnessHost({children}:{children:ReactNode}){
  const navigate=useNavigate(),location=useLocation();
  const host=useMemo<HarnessUiHost>(()=>{
    const resolveFile=async(conversation:ConversationView,path:string,signal?:AbortSignal,literal=false)=>{
      const reference=literal?{path}:conversationFileReference(path);
      if(!reference)throw new Error('来源路径或行号无效，请复制原路径核对。');
      const catalog=await codeApi.repositories(conversation.workspaceId,conversation.taskId,signal);
      const file=conversationFileTarget(conversation.cwd,reference.path,catalog);
      if(!file)throw new Error('无法确认这个文件的原工作目录，请复制原路径核对。');
      return {file,reference};
    };
    return {
      taskLinks:({scopeId,...props})=>scopeId.startsWith('scope:')?null:<ConversationTaskLink {...props}/>,
      participation:props=><BuildrParticipation {...props}/>,
      async readFile(conversation,path,signal){const {file}=await resolveFile(conversation,path,signal,true);return codeApi.file(conversation.workspaceId,file,signal);},
      async openFile(conversation,path,literal){
        const {file,reference}=await resolveFile(conversation,path,undefined,literal);
        await codeApi.file(conversation.workspaceId,file);
        navigate(`/workspaces/${encodeURIComponent(conversation.workspaceId)}/code/explorer`,{state:{codeEntry:{file:{...file,...(reference.line?{line:reference.line}:{})},from:{pathname:location.pathname,search:location.search,hash:location.hash,state:location.state}}}});
      },
      resolveWorkObjectLink(reference,pathname){const id=resolveTaskBriefReference(reference);return id&&pathname!==null?{href:taskBriefHref(id,pathname??location.pathname),title:`任务说明：${id}`}:null;},
    };
  },[navigate,location]);
  return <HarnessUiHostProvider host={host}>{children}</HarnessUiHostProvider>;
}
