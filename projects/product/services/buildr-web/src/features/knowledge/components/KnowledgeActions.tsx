import { Button, Dropdown, Space } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { KnowledgeActionMode } from '../knowledge-request';

export function KnowledgeActions({ onAction, disabled, reading = false, size = 'small' }: {
  onAction: (mode: KnowledgeActionMode) => void;
  disabled: boolean;
  reading?: boolean;
  size?: 'small' | 'middle';
}) {
  return <Space wrap>{reading ? <>
    <Button size={size} disabled={disabled} onClick={() => onAction('ask')}>追问当前内容</Button>
    <Button size={size} disabled={disabled} onClick={() => onAction('improve')}>完善当前内容</Button>
  </> : <>
    <Button size={size} disabled={disabled} onClick={() => onAction('explore')}>了解与探索</Button>
    <Dropdown trigger={['click']} disabled={disabled} menu={{ items: [{ key: 'construct', label: '构建架构知识' }, { key: 'diagram', label: '构建技术图' }], onClick: ({ key }) => onAction(key as KnowledgeActionMode) }}>
      <Button size={size} disabled={disabled}>建设知识 <DownOutlined /></Button>
    </Dropdown>
  </>}</Space>;
}
