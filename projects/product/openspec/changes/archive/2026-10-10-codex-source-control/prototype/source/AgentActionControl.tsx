import {Button,Dropdown,Tooltip} from 'antd';
import {DownOutlined,RobotOutlined} from '@ant-design/icons';
import {agentNames,type AgentId} from './state';
type Props={id:string;actionLabel:string;agent:AgentId;defaultAgent:AgentId;choice:'default'|AgentId;multiple:boolean;disabled?:boolean;busy?:boolean;onAction():void;onChoose(choice:'default'|AgentId):void;onOpenAgents():void};
/** Shared prototype control: provider identity stays in tooltips, invocation is bound at click time. */
export function AgentActionControl({id,actionLabel,agent,defaultAgent,choice,multiple,disabled,busy,onAction,onChoose,onOpenAgents}:Props){
 const tip=actionLabel+' · '+agentNames[agent];
 return <div className="cm-agent-action-control" data-prototype-position="message-executor"><Tooltip title={tip}><Button id={id} aria-label={tip} type="text" size="small" icon={<RobotOutlined/>} disabled={disabled||busy} onClick={onAction}/></Tooltip><Dropdown trigger={['click']} disabled={busy} menu={{selectedKeys:[choice],items:multiple?[{key:'default',label:'跟随默认（'+agentNames[defaultAgent]+'）'},{type:'divider'},{key:'codex',label:'仅本次使用 Codex'},{key:'dsh',label:'仅本次使用 DSH'}]:[{key:'default',label:'跟随默认（'+agentNames[defaultAgent]+'）'},{type:'divider'},{key:'agents',label:'查看智能体'}],onClick:({key})=>key==='agents'?onOpenAgents():onChoose(key as 'default'|AgentId)}}><Tooltip title={choice==='default'?'本次跟随默认：'+agentNames[defaultAgent]:'本次使用 '+agentNames[agent]+'，调用后恢复默认'}><Button id={id+'-agent-menu'} aria-label="选择本次智能体" type="text" size="small" icon={<DownOutlined/>} disabled={busy}/></Tooltip></Dropdown></div>;
}
