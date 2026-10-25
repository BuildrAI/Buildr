import {useEffect,useRef,useState} from 'react';
import {Button,InputNumber,Tooltip} from 'antd';
import {ReloadOutlined} from '@ant-design/icons';
export function ModelContextInput({label,value,override,reported,disabled,onSave}:{label:string;value?:number;override?:number;reported?:number;disabled:boolean;onSave(value:number|null):void}){
 const skip=useRef(false);
 const [draft,setDraft]=useState<number|null>(override??value??null);
 useEffect(()=>setDraft(override??value??null),[override,value]);
 const save=()=>{if(draft!==null&&(!Number.isSafeInteger(draft)||draft<1||draft>(reported??10000000))){setDraft(override??value??null);return;}if(draft!==(override??value??null))onSave(draft);};
 return <div className="amm-context-editor" data-prototype-position="model-context"><Tooltip title={reported?`平台报告上限：${reported.toLocaleString()}；留空恢复默认`:'平台未报告上限；本地数字不代表上游保证'}><InputNumber aria-label={`${label}上下文数字`} size="small" controls={false} min={1} max={reported??10000000} precision={0} value={draft} disabled={disabled} onChange={setDraft} onBlur={()=>{if(skip.current){skip.current=false;return;}save();}} onPressEnter={event=>event.currentTarget.blur()} onKeyDown={event=>{if(event.key==='Escape'){skip.current=true;setDraft(override??value??null);event.currentTarget.blur();}}}/></Tooltip><Button type="text" size="small" icon={<ReloadOutlined/>} aria-label={`恢复${label}上下文默认值`} disabled={disabled||override===undefined} onClick={()=>onSave(null)}/></div>;
}
