import { Button } from 'antd';
import { DoubleLeftOutlined, DoubleRightOutlined } from '@ant-design/icons';
import type { PointerEventHandler, Ref } from 'react';
import './pane-toggle.css';

type Props = {
  collapsed: boolean;
  label: string;
  side?: 'left' | 'right';
  onToggle(): void;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  disabled?: boolean;
  controls?: string;
  className?: string;
  position?: string;
  buttonRef?: Ref<HTMLButtonElement>;
};

/** One local visibility control for navigation, page and content panes. */
export function PaneToggleButton({ collapsed, label, side = 'left', onToggle, onPointerDown, disabled, controls, className = '', position, buttonRef }: Props) {
  const action = `${collapsed ? '展开' : '收起'}${label}`;
  const towardLeft = side === 'left' ? !collapsed : collapsed;
  return <Button ref={buttonRef} type="text" size="small" className={`pane-toggle-button ${className}`} disabled={disabled}
    title={action} aria-label={action} aria-expanded={!collapsed} aria-controls={controls} data-prototype-position={position}
    icon={towardLeft ? <DoubleLeftOutlined /> : <DoubleRightOutlined />} onPointerDown={onPointerDown} onClick={onToggle} />;
}
