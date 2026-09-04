import type { ReactNode } from 'react';
import { Button, Popover } from 'antd';
import { FilterOutlined } from '@ant-design/icons';

export function TaskFilters({ open, active, content, onOpenChange }: {
  open: boolean;
  active: boolean;
  content: ReactNode;
  onOpenChange(open: boolean): void;
}) {
  return <Popover trigger="click" placement="bottomRight" arrow={false} destroyOnHidden overlayClassName="task-filter-overlay" open={open} onOpenChange={onOpenChange} content={content}>
    <Button id="task-filter-panel-toggle" type="text" aria-label="筛选任务" aria-expanded={open} className={open || active ? 'is-active' : ''} icon={<FilterOutlined />} />
  </Popover>;
}
