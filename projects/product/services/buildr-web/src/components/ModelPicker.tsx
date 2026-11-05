import {useEffect,useRef,useState} from 'react';
import {Button,Input,Popover,Select,Slider} from 'antd';
import {CheckOutlined,DownOutlined,SearchOutlined,ThunderboltFilled,ThunderboltOutlined} from '@ant-design/icons';
import {filterModelGroups,reasoningEffortLabel,type ModelPickerGroup} from '../lib/model-picker.ts';
import './model-picker.css';

export type ModelPickerReasoning={options:{id:string;label:string}[];index:number;ordered:boolean;inherited:boolean;label:string};
type Props={
  selectedKey:string; modelLabel:string; defaultLabel?:string; groups:ModelPickerGroup[];
  reasoning:ModelPickerReasoning; disabled:boolean; unavailable:boolean;
  tierSwitchable:boolean; tierDisabled:boolean; tierLabel?:string; accelerated:boolean;
  resetKey?:string; compact?:boolean; id?:string; popupPlacement?:'topRight'|'bottomLeft';
  onSelectModel(key:string):void; onSelectEffort(id:string):void; onCycleTier():void;
};

/** Controlled model UI only: callers own catalog, choice, preferences and business context. */
export function ModelPicker({selectedKey,modelLabel,defaultLabel='默认模型',groups,reasoning,disabled,unavailable,tierSwitchable,tierDisabled,tierLabel,accelerated,resetKey,compact=false,id,popupPlacement='topRight',onSelectModel,onSelectEffort,onCycleTier}:Props){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[modelListOpen,setModelListOpen]=useState(false);
  // Corner placements flip but do not shift by default; keep compact menus inside narrow viewports.
  const popupAlign=compact?{overflow:{adjustX:true,adjustY:true,shiftX:true}}:undefined;
  const trigger=useRef<HTMLButtonElement>(null),controlsRef=useRef<HTMLDivElement>(null),modelPopup=useRef<HTMLDivElement>(null);
  const closeModelList=(nextQuery='')=>{setModelListOpen(false);setQuery(nextQuery);};
  const jumpToGroup=(id:string)=>{const root=modelPopup.current;const header=Array.from(root?.querySelectorAll<HTMLElement>('[data-model-source]')??[]).find(node=>node.dataset.modelSource===id)?.closest<HTMLElement>('.ant-select-item-group');const scroll=root?.querySelector<HTMLElement>('.rc-virtual-list-holder');const first=header?.nextElementSibling as HTMLElement|null;if(header&&scroll&&first)scroll.scrollTo({top:scroll.scrollTop+first.getBoundingClientRect().top-scroll.getBoundingClientRect().top-header.getBoundingClientRect().height,behavior:'auto'});};
  useEffect(()=>{setOpen(false);setModelListOpen(false);setQuery('');},[resetKey,disabled]);
  useEffect(()=>{
    if(!open)return;
    const frame=requestAnimationFrame(()=>{
      const controls=controlsRef.current;
      if(!controls||controls.contains(document.activeElement)||modelPopup.current?.contains(document.activeElement))return;
      controls.querySelector<HTMLElement>('[role="slider"],[role="radio"]')?.focus();
    });
    return()=>cancelAnimationFrame(frame);
  },[open]);
  const selectEffort=(index:number)=>{const effort=reasoning.options[index];if(effort)onSelectEffort(effort.id);};
  const visibleGroups=filterModelGroups(groups,query);
  const controls=<div ref={controlsRef} className="ac-model-controls" role="dialog" aria-label="模型与推理强度设置" onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();setOpen(false);setModelListOpen(false);setQuery('');trigger.current?.focus();}
  }}>
    <div className="ac-model-top-row">{tierSwitchable?<Button type="text" size="small" className={'ac-tier-lightning'+(accelerated?' is-active':'')} disabled={tierDisabled} aria-label="切换服务档位" aria-pressed={accelerated} title={tierLabel||'切换服务档位'} onClick={onCycleTier}>{accelerated?<ThunderboltFilled/>:<ThunderboltOutlined/>}</Button>:<Button type="text" size="small" className="ac-tier-lightning" disabled aria-label="服务档位不可切换" title="该模型未提供可切换的快速档位"><ThunderboltOutlined/></Button>}<Select className="ac-model-picker" aria-label="执行模型" title="模型" variant="borderless" size="small" suffixIcon={null}
      value={selectedKey} labelRender={({label})=>selectedKey?label:defaultLabel}
      disabled={unavailable} open={modelListOpen&&!unavailable} onDropdownVisibleChange={next=>{setModelListOpen(next);if(!next)setQuery('');}}
      notFoundContent={<span className="ac-model-search-empty">{groups.length?'没有匹配的模型':'暂无可选模型'}</span>}
      popupMatchSelectWidth placement={popupPlacement} dropdownAlign={popupAlign} virtual={false} listHeight={248}
      popupRender={menu=><div ref={modelPopup}>
        <div className="ac-model-search"><Input size="small" allowClear prefix={<SearchOutlined aria-hidden="true"/>} placeholder="搜索模型或来源" aria-label="搜索模型" autoComplete="off" value={query} onChange={event=>setQuery(event.target.value)}
          onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();closeModelList();controlsRef.current?.querySelector<HTMLElement>('.ac-model-picker [role="combobox"]')?.focus();}}}/></div>
        <nav className="ac-model-source-nav" aria-label="模型来源快速定位">{visibleGroups.map(group=><Button key={group.id} size="small" type="text" onMouseDown={event=>{event.preventDefault();event.stopPropagation();}} onClick={event=>{event.stopPropagation();jumpToGroup(group.id);}}>{group.label}</Button>)}</nav>{menu}</div>}
      classNames={{popup:{root:'ac-panel-popup ac-choice-popup ac-model-list-popup'}}}
      options={visibleGroups.map(group=>({label:<span data-model-source={group.id}>{group.label}</span>,options:group.options}))}
      onChange={key=>onSelectModel(key)}/></div>
    <div className="ac-effort-controls">
      {reasoning.ordered&&reasoning.index>=0?<div className="ac-depth-slider"><Slider min={0} max={reasoning.options.length-1} step={1} dots value={reasoning.index} disabled={disabled} ariaLabelForHandle="思考深度" ariaValueTextFormatterForHandle={index=>reasoningEffortLabel(reasoning.options[index]!)} tooltip={{open:false}} onChange={selectEffort}/><div className="ac-depth-labels" aria-hidden="true">{reasoning.options.map((option,index)=><span key={option.id} className={index===reasoning.index?'is-selected':''} style={{left:`${index/(reasoning.options.length-1)*100}%`}}>{reasoningEffortLabel(option)}</span>)}</div></div>:reasoning.options.length?<div className="ac-effort-list" role="radiogroup" aria-label="思考深度" onKeyDown={event=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)||disabled)return;event.preventDefault();const next=(Math.max(0,reasoning.index)+(event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1)+reasoning.options.length)%reasoning.options.length;selectEffort(next);event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();}}>{reasoning.options.map((effort,index)=><Button key={effort.id} role="radio" tabIndex={index===Math.max(0,reasoning.index)?0:-1} aria-checked={index===reasoning.index} type="text" className={index===reasoning.index?'is-selected':''} disabled={disabled} onClick={()=>selectEffort(index)}><span>{reasoningEffortLabel(effort)}</span>{index===reasoning.index&&<CheckOutlined aria-hidden="true"/>}</Button>)}</div>:<p className="ac-effort-unavailable">此模型未提供可调节的推理强度</p>}
    </div>
  </div>;
  return <Popover rootClassName="ac-panel-popup ac-model-popover" trigger="click" placement={popupPlacement} align={popupAlign} open={open&&!unavailable} onOpenChange={next=>{setOpen(next&&!unavailable);if(!next){setModelListOpen(false);setQuery('');}}} content={controls}>
    <Button ref={trigger} id={id} type="text" size="small" className={compact?'execution-model-trigger':'ac-model-trigger'} aria-label={compact?'选择执行模型':'模型与推理强度'} aria-haspopup="dialog" aria-expanded={open&&!unavailable}
      title={modelLabel+(reasoning.options.length?` · ${reasoning.label}${reasoning.inherited?'（默认）':''}`:'')} disabled={unavailable}>
      {!compact&&<>{accelerated&&<ThunderboltFilled className="ac-tier-mark" aria-hidden="true"/>}<span className="ac-model-label">{modelLabel}</span>{reasoning.options.length>0&&<span className="ac-model-effort">{reasoning.label}</span>}</>}<DownOutlined/>
    </Button>
  </Popover>;
}
