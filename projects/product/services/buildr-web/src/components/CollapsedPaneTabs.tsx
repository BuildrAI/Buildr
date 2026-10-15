import type { Ref } from 'react';
import { Button } from 'antd';
import { PaneToggleButton } from './PaneToggleButton';
import type { usePanePeek } from './usePanePeek';
import './collapsed-pane-tabs.css';

type Props = {
  tabs: Array<{ key: string; title: string; dirty?: boolean }>;
  active?: string | null;
  noun: string;
  side: 'left' | 'right';
  controls: string;
  position: string;
  railRef: Ref<HTMLDivElement>;
  peek: ReturnType<typeof usePanePeek>;
  onActivate(key: string): void;
  onExpand(key: string): void;
};

/** Each collapsed tab keeps its own temporary view and explicit expansion action. */
export function CollapsedPaneTabs({ tabs, active, noun, side, controls, position, railRef, peek, onActivate, onExpand }: Props) {
  const current = tabs.find(tab => tab.key === active)?.key || tabs[0]?.key;
  return <div ref={railRef} className={`collapsed-pane-tabs side-${side}`} data-prototype-position={position} aria-label={`收起的${noun}`}>
    <div className="collapsed-pane-header" onPointerEnter={peek.cancel} onPointerLeave={peek.leave} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); peek.close(true); } }}>
      <PaneToggleButton collapsed label={noun} side={side} controls={controls} position={position.replace('-rail', '-restore')} disabled={!current} onToggle={() => { if (current) onExpand(current); }} />
    </div>
    <div className="collapsed-pane-scroll">{tabs.map(tab => <div key={tab.key} className={`collapsed-pane-item${tab.key === active ? ' is-active' : ''}`}>
      <button type="button" className="collapsed-pane-label" title={`${tab.title} · 悬停暂看，点击保持打开`} aria-label={`暂时查看${tab.title}`} aria-controls={controls} aria-expanded={tab.key === active && peek.open}
        onPointerEnter={event => { if (event.pointerType === 'touch') return; onActivate(tab.key); peek.enter('tab:' + tab.key, event.pointerType, event.currentTarget); }}
        onPointerLeave={event => peek.exit('tab:' + tab.key, event.pointerType)} onFocus={peek.cancel} onBlur={peek.leave}
        onClick={event => { onActivate(tab.key); peek.pin(event.currentTarget); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); peek.close(true); } }}>
        <span className="collapsed-pane-title">{tab.title}</span>{tab.dirty && <span className="collapsed-pane-dirty" aria-label="有未保存修改">●</span>}
      </button>
      <div className="collapsed-pane-expand" onPointerEnter={peek.cancel} onPointerLeave={peek.leave}>
        <Button type="text" size="small" className="collapsed-pane-open" icon={<span className="anticon">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" data-icon="open-in-pane" aria-hidden="true">
            <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.75" />
            <path d="M7 4V16" />
            <path className="pane-open-direction" d="M10.25 7.5L12.75 10L10.25 12.5" />
          </svg>
        </span>} aria-label={`展开${noun}：${tab.title}`} title={`在分屏中打开${tab.title}`} aria-controls={controls} data-prototype-position={position.replace('-rail', '-expand')} onClick={() => onExpand(tab.key)} />
      </div>
    </div>)}</div>
  </div>;
}
