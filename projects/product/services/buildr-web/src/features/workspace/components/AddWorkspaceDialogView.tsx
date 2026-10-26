import { Alert, Button, Form, Input, Modal, Spin, Typography } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import type { WorkspacePreparation } from '../api/workspace-preparation-api';
import '../workspace-add-dialog.css';

type Props = {
  open: boolean; value: WorkspacePreparation | null; name: string; busy: boolean; error: string;
  mode?: 'add' | 'prepare';
  onName(name: string): void; onChoose(): void; onConfirm(): void; onClose(): void;
};

/** Presentation shared by the real preparation flow and isolated demonstrations. */
export function AddWorkspaceDialogView({ open, value, name, busy, error, mode = 'add', onName, onChoose, onConfirm, onClose }: Props) {
  const preparing = value?.status === 'preparing';
  const keep = Boolean(value?.customizations?.length);
  return <Modal open={open} centered width={500} title={preparing ? mode === 'add' ? '正在添加工作空间' : '正在准备工作空间' : mode === 'add' ? '添加工作空间' : '准备工作空间'}
    className="workspace-add-dialog" onCancel={onClose} maskClosable={!preparing}
    footer={<Button id="workspace-add-confirm" type="primary" loading={busy || preparing} disabled={!value || !name.trim()}
      onClick={onConfirm}>{preparing ? mode === 'add' ? '正在添加' : '正在准备' : value?.status === 'failed' ? keep ? '保留当前定制并重试' : '重试' : '确认添加'}</Button>}>
    <div className="workspace-add-body" data-prototype-position="add-form">
      <p className="workspace-add-intro">{mode === 'add' ? '选择一个本机目录，作为你和智能体共同工作的空间。' : '已有内容会保留，继续完成这个工作空间的准备。'}</p>
      <Form layout="vertical" requiredMark={false}>
        <Form.Item label="工作目录">
          {value ? <div className="workspace-add-directory"><FolderOpenOutlined /><div><strong>{value.name}</strong><span className="mono">{value.rootPath}</span></div>
            {!preparing && <Button type="link" size="small" disabled={busy} onClick={onChoose}>更换</Button>}</div>
            : <Button id="workspace-choose-directory" className="workspace-add-choose" icon={<FolderOpenOutlined />} block loading={busy} onClick={onChoose}>选择文件夹</Button>}
        </Form.Item>
        {value && <Form.Item label="工作空间名称"><Input id="workspace-add-name" aria-label="工作空间名称" maxLength={160}
          value={name} disabled={busy || preparing} onChange={event => onName(event.target.value)}
          onPressEnter={() => { if (name.trim() && !busy && !preparing) onConfirm(); }} /></Form.Item>}
      </Form>
      {preparing ? <div className="workspace-add-progress" role="status" data-prototype-position="add-progress"><Spin size="small" /><span>正在检查目录、准备工作内容并加入列表。<br /><small>可以关闭窗口，准备会在后台继续。</small></span></div>
        : value?.status === 'failed' ? <Alert showIcon type="warning" message={value.error || '准备尚未完成'} description={keep ? '发现本地定制内容。重试会保留这些定制，并继续准备。' : '已完成的内容会保留，可以直接重试。'} />
        : <Typography.Paragraph type="secondary" className="workspace-add-helper">{value ? value.workspaceId ? '这个目录已有工作空间，将保留现有内容并加入列表。' : '将为这个目录准备工作空间，已有文件会保留。' : '已有工作空间可直接添加；新目录会自动完成初始化。'}</Typography.Paragraph>}
      {value?.status === 'failed' && value.details && <details className="workspace-add-details"><summary>查看详情</summary><pre>{value.details}</pre></details>}
      {error && <Alert className="workspace-add-error" showIcon type="error" message={error} />}
    </div>
  </Modal>;
}
