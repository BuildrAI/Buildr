import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from 'antd';
import { CloseOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import './side-reading.css';

type Props = HTMLAttributes<HTMLElement> & { id: string; title: string; open: boolean; pinned: boolean; canPin: boolean; onTogglePin(): void; onClose(): void; children: ReactNode };
export function SideReadingPanel({ id, title, open, pinned, canPin, onTogglePin, onClose, children, className = '', ...events }: Props) {
  return <aside {...events} id={`${id}-panel`} hidden={!open} className={`side-reading ${className}${pinned ? ' is-pinned' : ''}`} role="region" aria-label={title} onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="side-reading-heading"><h2>{title}</h2><div>
      <Button id={`${id}-pin`} type="text" size="small" disabled={!canPin && !pinned} title={!canPin ? '阅读空间充足时可固定并排查看' : undefined} icon={pinned ? <PushpinFilled /> : <PushpinOutlined />} aria-pressed={pinned} onClick={onTogglePin}>{pinned ? '取消固定' : '固定'}</Button>
      <Button type="text" size="small" icon={<CloseOutlined />} aria-label={`关闭${title}`} onClick={onClose} />
    </div></div><div className="side-reading-body">{children}</div>
  </aside>;
}
