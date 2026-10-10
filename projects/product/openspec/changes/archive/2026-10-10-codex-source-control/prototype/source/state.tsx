import {createContext,useContext} from 'react';
export type AgentId='codex'|'dsh';
export const agentNames:Record<AgentId,string>={codex:'Codex',dsh:'DSH'};
export type CommitMode='commit'|'commit-push';
export type CommitRecord={sourceKey:string;phase:'committing'|'pushing'|'success'|'push-failed'|'upstream-missing';completed:boolean;pushed:boolean;hash:string;message:string;mode:CommitMode;target:string|null};
export type Connection='connected'|'unregistered'|'login-required'|'unavailable';
export type Service='dormant'|'starting'|'running'|'reclaimed'|'stopping'|'stopped';
export type Draft={text:string;generated:boolean;pending?:boolean;phase?:'starting'|'generating';error?:boolean;stale?:boolean;agentId?:AgentId;generatedBy?:AgentId;expanded?:boolean};
export type State={connection:Connection;service:Service;services:Record<AgentId,Service>;drafts:Record<string,Draft>;setDraft(key:string,draft:Draft):void;setActiveKey(key:string):void;agentsOpen:boolean;setAgentsOpen(open:boolean):void;noChanges:boolean;commits:Record<string,CommitRecord>;commit(key:string,text:string,mode:CommitMode):void;retryPush(key:string):void;preferredCommitMode:CommitMode;multiAgent:boolean;defaultAgent:AgentId;setDefaultAgent(agent:AgentId):void;generate(key:string,main:boolean,agent:AgentId):void;cancel(key:string):void};
export const PrototypeContext=createContext<State>(null!);
export const usePreview=()=>useContext(PrototypeContext);
export const sampleMessage='chore(idea): 忽略本机 IDE 工作文件\n\n- 忽略 shelf、workspace.xml 和本机 HTTP 请求\n- 排除数据库连接及缓存配置';
export const registrationPrompt='请将当前智能体接入本机 Buildr，以便我在 Buildr 中调用你完成工作。';
export async function copyValue(text:string,elementId?:string){
 try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{let field=elementId?document.getElementById(elementId) as HTMLTextAreaElement|null:null;let temporary=false;if(!field){field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.append(field);temporary=true;}field.focus();field.select();const ok=document.execCommand('copy');if(temporary)field.remove();if(!ok)throw Error('clipboard unavailable');}return true;}catch{return false;}
}
