import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Result, Space, Steps, Tag, Typography } from 'antd';
import { CheckCircleOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons';

export type Candidate = {
  id: string;
  name: string;
  path: string;
  kind: 'new' | 'existing' | 'registered';
};

export const candidates: Candidate[] = [
  { id: 'new', name: '新项目', path: '/Users/lin/Workspaces/新项目', kind: 'new' },
  { id: 'existing', name: '客户平台', path: '/Users/lin/Workspaces/customer-platform', kind: 'existing' },
  { id: 'registered', name: '产品研发', path: '/Users/lin/Workspaces/product', kind: 'registered' },
];

type Props = {
  open: boolean;
  stage: 'select' | 'confirm' | 'preparing' | 'ready' | 'failed';
  selected: Candidate | null;
  name: string;
  step: number;
  onName: (name: string) => void;
  onSelect: (candidate: Candidate) => void;
  onConfirm: () => void;
  onClose: () => void;
  onRetry: () => void;
  onOpen: () => void;
  onCopyPath: () => void;
};

const kindLabels: Record<Candidate['kind'], string> = {
  new: '普通目录',
  existing: '已有工作空间',
  registered: '已添加',
};

export function AddWorkspaceDialog({ open, stage, selected, name, step, onName, onSelect, onConfirm, onClose, onRetry, onOpen, onCopyPath }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) setPickerOpen(false);
  }, [open]);

  const selectDirectory = (candidate: Candidate) => {
    setPickerOpen(false);
    onSelect(candidate);
  };
  const choosing = stage === 'select' || stage === 'confirm';
  const title = stage === 'preparing' ? '正在准备工作空间' : stage === 'ready' ? '工作空间已准备好' : stage === 'failed' ? '工作空间尚未准备完成' : '添加工作空间';
  const directory = selected ? (
    <div className="workspace-lifecycle-directory-summary" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, border: '1px solid var(--soft-line, #e1e5e9)', borderRadius: 8 }}>
      <FolderOpenOutlined style={{ marginTop: 3, fontSize: 20, color: 'var(--soft-primary, #397d74)' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Typography.Text strong>{name.trim() || selected.name}</Typography.Text>
        <Typography.Paragraph className="mono" type="secondary" style={{ margin: '4px 0 0', overflowWrap: 'anywhere', fontSize: 13 }}>{selected.path}</Typography.Paragraph>
      </div>
      {choosing && <Button type="link" size="small" onClick={() => setPickerOpen(true)}>更换</Button>}
    </div>
  ) : null;

  const footer = choosing && pickerOpen
    ? <Button onClick={() => setPickerOpen(false)}>返回</Button>
    : stage === 'select'
    ? <Button onClick={onClose}>取消</Button>
    : stage === 'confirm'
      ? <Space wrap><Button onClick={onClose}>取消</Button><Button id="prototype-add-confirm" type="primary" disabled={!selected || !name.trim()} onClick={onConfirm}>{selected?.kind === 'registered' ? '打开工作空间' : '添加并打开'}</Button></Space>
      : stage === 'preparing'
        ? <Button onClick={onClose}>收起</Button>
        : stage === 'failed'
          ? <Space wrap><Button onClick={onClose}>稍后处理</Button><Button id="prototype-add-retry" type="primary" onClick={onRetry}>重试</Button></Space>
          : <Space wrap><Button onClick={onCopyPath}>复制目录</Button><Button id="prototype-add-open" type="primary" onClick={onOpen}>进入工作空间</Button></Space>;

  return (
    <Modal open={open} title={title} width={560} onCancel={onClose} footer={footer} destroyOnClose styles={{ body: { paddingTop: 12 } }}>
      <div data-prototype-position="add-dialog">
        {choosing && (
          <>
            {stage === 'select' && !pickerOpen && (
              <Space data-prototype-position="directory-picker" direction="vertical" size={16} style={{ width: '100%' }}>
                <Typography.Paragraph type="secondary" style={{ margin: 0 }}>选择你和智能体共同工作的本机目录，Buildr 会准备开始工作所需的内容。</Typography.Paragraph>
                <Button id="prototype-choose-directory" size="large" icon={<FolderOpenOutlined />} onClick={() => setPickerOpen(true)} block>选择文件夹</Button>
              </Space>
            )}
            {pickerOpen && (
              <div data-prototype-position="directory-picker">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                  <Typography.Text strong>选择本机目录</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>本机</Typography.Text>
                </div>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {candidates.map((candidate) => (
                    <Button key={candidate.id} className="workspace-lifecycle-directory-option" style={{ display: 'flex', height: 'auto', minHeight: 76, padding: '12px 14px', textAlign: 'left', whiteSpace: 'normal' }} block onClick={() => selectDirectory(candidate)}>
                      <FolderOutlined style={{ marginRight: 4, fontSize: 20, color: 'var(--soft-primary, #397d74)' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><strong>{candidate.name}</strong><Tag style={{ margin: 0 }} color={candidate.kind === 'registered' ? 'success' : 'default'}>{kindLabels[candidate.kind]}</Tag></span>
                        <span className="mono" style={{ display: 'block', color: 'var(--soft-muted, #68717b)', fontSize: 12, marginTop: 4, overflowWrap: 'anywhere' }}>{candidate.path}</span>
                      </span>
                      {selected?.id === candidate.id && <CheckCircleOutlined style={{ color: 'var(--soft-primary, #397d74)' }} />}
                    </Button>
                  ))}
                </Space>
                <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0', fontSize: 12 }}>也可以选择一个已有项目目录。</Typography.Paragraph>
              </div>
            )}
            {stage === 'confirm' && !pickerOpen && selected && (
              <Space direction="vertical" size={20} style={{ width: '100%' }}>
                {directory}
                <Form layout="vertical" style={{ margin: 0 }}>
                  <Form.Item label="工作空间名称" style={{ marginBottom: 0 }}>
                    <Input id="prototype-workspace-name" value={name} onChange={(event) => onName(event.target.value)} maxLength={60} placeholder="默认使用文件夹名称" autoComplete="off" onPressEnter={() => { if (name.trim()) onConfirm(); }} />
                  </Form.Item>
                </Form>
                <Typography.Paragraph type="secondary" style={{ margin: 0 }}>{selected.kind === 'registered' ? '这个目录已经添加，将直接打开已有工作空间。' : selected.kind === 'existing' ? '已找到工作空间。Buildr 会检查并补齐需要的内容，完成后即可开始工作。' : 'Buildr 会在这个目录准备工作所需的内容。已有文件会保留，完成后即可开始工作。'}</Typography.Paragraph>
              </Space>
            )}
          </>
        )}
        {stage === 'preparing' && (
          <div data-prototype-position="add-progress">
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              {directory}
              <Steps direction="vertical" size="small" current={Math.max(0, Math.min(2, step))} items={[
                { title: '检查目录', description: '确认目录可以使用' },
                { title: '准备工作内容', description: '自动准备规则、工作方法和智能体入口' },
                { title: '确认可用', description: '检查完成后打开工作空间' },
              ]} />
              <Typography.Paragraph type="secondary" style={{ margin: 0 }}>你可以收起窗口，在工作空间列表继续查看进度。</Typography.Paragraph>
            </Space>
          </div>
        )}
        {stage === 'failed' && (
          <div data-prototype-position="add-result">
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              {directory}
              <Alert type="warning" showIcon message="目录暂时无法写入" description="已完成的内容会保留，重试将继续准备。" />
              <Typography.Paragraph type="secondary" style={{ margin: 0 }}>确认目录的使用权限后重试，也可以稍后从工作空间列表继续。</Typography.Paragraph>
            </Space>
          </div>
        )}
        {stage === 'ready' && (
          <div data-prototype-position="add-result">
            <Result status="success" title="现在就可以开始工作" subTitle="打开智能体，选择下面的目录作为工作目录，即可使用这个工作空间需要的内容。" style={{ padding: '8px 0 20px' }} />
            {directory}
          </div>
        )}
      </div>
    </Modal>
  );
}
