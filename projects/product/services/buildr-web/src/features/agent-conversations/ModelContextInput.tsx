import {useEffect,useRef,useState} from 'react';
import {Button,Input,Tooltip} from 'antd';
import {ReloadOutlined} from '@ant-design/icons';
import {contextWindowText,parseContextWindow} from './context-window';
export function ModelContextInput({label,value,override,reported,disabled,onSave}:{label:string;value?:number;override?:number;reported?:number;disabled:boolean;onSave(value:number|null):void}){
 const skip=useRef(false),initial=contextWindowText(override??value);
 const [draft,setDraft]=useState(initial),[invalid,setInvalid]=useState(false);
 useEffect(()=>{setDraft(initial);setInvalid(false);},[initial]);
 const save=()=>{if(draft===initial)return;const tokens=parseContextWindow(draft);if(tokens===undefined||(tokens!==null&&tokens>(reported??10000000))){setInvalid(true);return;}setInvalid(false);onSave(tokens);};
 return <div className="amm-context-editor" data-prototype-position="model-context"><Tooltip title={invalid?(reported?`请输入正整数或K，不能超过来源报告窗口 ${reported}（${contextWindowText(reported)}）`:'请输入正整数或K'):(reported?`来源报告窗口 ${reported}（${contextWindowText(reported)}）`:'来源未返回上下文窗口')}><Input aria-label={`${label}上下文窗口`} size="small" value={draft} status={invalid?'error':undefined} placeholder="如 200K" disabled={disabled} onChange={event=>{setDraft(event.target.value);setInvalid(false);}} onBlur={()=>{if(skip.current){skip.current=false;return;}save();}} onPressEnter={event=>event.currentTarget.blur()} onKeyDown={event=>{if(event.key==='Escape'){skip.current=true;setDraft(initial);setInvalid(false);event.currentTarget.blur();}}}/></Tooltip><Tooltip title="恢复模型默认上下文窗口"><Button type="text" size="small" icon={<ReloadOutlined/>} aria-label={`恢复${label}上下文默认值`} disabled={disabled||override===undefined} onClick={()=>{setInvalid(false);onSave(null);}}/></Tooltip></div>;
}
