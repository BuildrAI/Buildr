import { CloseOutlined } from '@ant-design/icons';
import { useId, useRef, type ReactNode } from 'react';
import { useTabNavigation } from '../lib/useTabNavigation';
import { tabElementId } from '../lib/tab-navigation';

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
  closable?: boolean;
  className?: string;
  label?: string;
  panelId?: string;
};

/** The same object tabs serve workspace side panes and full-file reading. */
export function ObjectTabStrip({ tabs, active, onActivate, onClose, closable = true, className = '', label = '打开的对象', panelId }: Props) {
  const generatedId = useId();
  const prefix = panelId || generatedId;
  const strip = useRef<HTMLDivElement>(null);
  const navigation = useTabNavigation(tabs.map(tab => tab.key), active, strip);
  return <div ref={strip} tabIndex={-1} className={`pane-tabstrip ${className}`} role={panelId ? 'tablist' : 'group'} aria-label={label}>
    {tabs.map(tab => <div key={tab.key} className={`pane-tab-wrap${closable ? '' : ' not-closable'}`}>
      <button type="button" role={panelId ? 'tab' : undefined} aria-selected={panelId ? tab.key === active : undefined} aria-pressed={panelId ? undefined : tab.key === active}
        id={tabElementId(prefix, tab.key)} aria-controls={panelId} data-tab-key={tab.key} tabIndex={navigation.focusKey === tab.key ? 0 : -1}
        onFocus={() => navigation.onFocus(tab.key)} onKeyDown={event => navigation.onKeyDown(event, tab.key, closable ? onClose : undefined)}
        aria-label={tab.accessibleLabel} className={`pane-tab${tab.key === active ? ' on' : ''}`} title={tab.title} onClick={() => onActivate?.(tab.key)}>
        <span className={`pane-tab-dot ${tab.kind}`} aria-hidden />
        <span className="pane-tab-text">{tab.label ?? tab.title}</span>
      </button>
      {closable && <button type="button" className="pane-tab-x" tabIndex={-1} aria-label={tab.closeLabel ?? `关闭 ${tab.title}`}
        onClick={() => navigation.close(tab.key, onClose)}><CloseOutlined /></button>}
    </div>)}
  </div>;
}
