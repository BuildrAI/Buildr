import { CloseOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

export type ObjectTabKind = 'svc' | 'doc' | 'chg';
export type WorkspaceObjectTab = {
  key: string;
  kind: ObjectTabKind;
  title: string;
  label?: ReactNode;
  accessibleLabel?: string;
  closeLabel?: string;
};
type Props = {
  tabs: WorkspaceObjectTab[];
  active?: string | null;
  onActivate?: (key: string) => void;
  onClose?: (key: string) => void;
  className?: string;
  label?: string;
};

/** The same object tabs serve workspace side panes and full-file reading. */
export function ObjectTabStrip({ tabs, active, onActivate, onClose, className = '', label = '打开的对象' }: Props) {
  return <div className={`pane-tabstrip ${className}`} role="tablist" aria-label={label}>
    {tabs.map(tab => <button key={tab.key} type="button" role="tab" aria-selected={tab.key === active}
      aria-label={tab.accessibleLabel} className={`pane-tab${tab.key === active ? ' on' : ''}`} title={tab.title}
      onClick={() => onActivate?.(tab.key)}>
      <span className={`pane-tab-dot ${tab.kind}`} aria-hidden />
      <span className="pane-tab-text">{tab.label ?? tab.title}</span>
      <span className="pane-tab-x" role="button" tabIndex={0} aria-label={tab.closeLabel ?? `关闭 ${tab.title}`}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onClose?.(tab.key); } }}
        onClick={event => { event.stopPropagation(); onClose?.(tab.key); }}><CloseOutlined /></span>
    </button>)}
  </div>;
}
