import { useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Switch } from 'antd';
import type { AccessScope, ProgrammaticAccessView } from './api/programmatic-access-api';

export type ProgrammaticAccessInput = { name: string; workspaceIds: string[]; scopes: AccessScope[]; allowFullAccess: boolean };
const permissions = [
  { value: 'execute', label: '执行开发', description: '发起、补充和停止工作' },
  { value: 'answer', label: '回答问题', description: '允许程序代答问题卡片' },
  { value: 'approve', label: '批准敏感操作', description: '允许程序处理审批卡片' },
];

export function ProgrammaticAccessCreateModal({ open, view, busy, error, onClose, onCreate }: {
  open: boolean; view?: ProgrammaticAccessView; busy: boolean; error: string;
  onClose(): void; onCreate(input: ProgrammaticAccessInput): Promise<boolean>;
}) {
  const [name, setName] = useState(''), [spaces, setSpaces] = useState<string[]>([]);
  const [scopes, setScopes] = useState<AccessScope[]>(['read', 'execute']);
  const [allowFullAccess, setAllowFullAccess] = useState(true);
  async function create() {
    if (await onCreate({ name, workspaceIds: spaces, scopes, allowFullAccess })) {
      setName(''); setSpaces([]); setScopes(['read', 'execute']); setAllowFullAccess(true);
    }
  }
  return <Modal title="新建接入程序" open={open} onCancel={onClose} footer={null}
    width={520} closable={!busy} maskClosable={!busy} keyboard={!busy} className="pas-create-modal">
    <p className="pas-modal-intro">为本机工具创建独立凭据，随后复制接入信息交给它。</p>
    {error && <Alert type="error" showIcon message={error} />}
    <Form layout="vertical" onFinish={() => void create()}>
      <Form.Item label="程序名称">
        <Input autoFocus aria-label="程序凭据名称" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="例如 千问办公" disabled={busy} />
      </Form.Item>
      <Form.Item label="允许访问的工作空间">
        <Select aria-label="凭据允许的工作空间" mode="multiple" value={spaces} onChange={setSpaces}
          placeholder="选择允许访问的工作空间" disabled={busy} options={view?.workspaces.map(w => ({ value: w.id, label: w.name }))} />
      </Form.Item>
      <Form.Item label="操作权限">
        <div className="pas-read-grant">读取与观察<span>所有接入均包含</span></div>
        <div className="pas-permissions">
          {permissions.map(permission => <Checkbox key={permission.value} checked={scopes.includes(permission.value as AccessScope)} disabled={busy}
            onChange={e => setScopes(current => e.target.checked ? [...current, permission.value as AccessScope] : current.filter(scope => scope !== permission.value))}>
            <span className="pas-permission-label">{permission.label}<small>{permission.description}</small></span>
          </Checkbox>)}
        </div>
      </Form.Item>
      <Form.Item label="全部授权执行">
        <div className="pas-full-access"><Switch checked={allowFullAccess} disabled={busy} onChange={setAllowFullAccess} aria-label="允许全部授权执行" />
          <span className="pas-full-access-hint">允许程序在 start/send/续聊请求 permissionMode=full-access（与网页全部授权一致）；关闭后请求 full-access 返回 403。</span></div>
      </Form.Item>
      {(scopes.includes('answer') || scopes.includes('approve')) && <Alert type="warning" showIcon message="你正在允许程序代答或审批，请确认这是你希望的自动化范围。" />}
      <p className="pas-form-note">凭据自动保存到本机私有文件（600），不需要复制令牌。工作空间授权不是操作系统文件沙箱。</p>
      <div className="pas-modal-actions">
        <Button disabled={busy} onClick={onClose}>取消</Button>
        <Button htmlType="submit" type="primary" loading={busy} disabled={!view || !name.trim() || !spaces.length}>创建并自动保存</Button>
      </div>
    </Form>
  </Modal>;
}
