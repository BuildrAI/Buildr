import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Select, Switch } from 'antd';
import { DrawerShell } from '../../components/DrawerShell';
import type { AccessCredential, AccessScope, ProgrammaticAccessView } from './api/programmatic-access-api';

export type ProgrammaticAccessInput = { name: string; workspaceIds: string[]; scopes: AccessScope[]; allowFullAccess: boolean };
const permissions = [
  { value: 'execute', label: '执行开发', description: '发起、补充和停止工作' },
  { value: 'answer', label: '回答问题', description: '允许程序代答问题卡片' },
  { value: 'approve', label: '批准敏感操作', description: '允许程序处理审批卡片' },
];
const FORM_ID = 'programmatic-access-form';

/** 新建与编辑共用同一参数表单，按项目约定以第二层抽屉承载；编辑预填当前凭据，令牌与凭据 ID 不变。 */
export function ProgrammaticAccessFormDrawer({ open, view, busy, error, editing, onClose, onSubmit }: {
  open: boolean; view?: ProgrammaticAccessView; busy: boolean; error: string; editing?: AccessCredential | null;
  onClose(): void; onSubmit(input: ProgrammaticAccessInput): Promise<boolean>;
}) {
  const [name, setName] = useState(''), [spaces, setSpaces] = useState<string[]>([]);
  const [scopes, setScopes] = useState<AccessScope[]>(['read', 'execute']);
  const [allowFullAccess, setAllowFullAccess] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? ''); setSpaces(editing?.workspaceIds ?? []);
    setScopes(editing?.scopes ?? ['read', 'execute']); setAllowFullAccess(editing?.allowFullAccess ?? true);
  }, [open, editing]);
  return <DrawerShell open={open} width="min(520px, 100vw)"
    eyebrow="程序接入" title={editing ? '编辑接入程序' : '新建接入程序'} sub={editing ? editing.name : undefined}
    onClose={onClose} maskClosable={!busy} keyboard={!busy} closeDisabled={busy}
    closeAriaLabel={editing ? '关闭编辑' : '关闭新建'} rootClassName="pas-form-drawer"
    footer={<div className="metadata-edit-actions">
      <Button autoInsertSpace={false} disabled={busy} onClick={onClose}>取消</Button>
      <Button type="primary" htmlType="submit" form={FORM_ID} loading={busy} disabled={!view || !name.trim() || !spaces.length}>{editing ? '保存修改' : '创建并自动保存'}</Button>
    </div>}>
    <p className="pas-modal-intro">{editing ? '修改名称、工作空间与操作权限；凭据文件与令牌保持不变。' : '为本机工具创建独立凭据，随后复制接入信息交给它。'}</p>
    {error && <Alert type="error" showIcon message={error} />}
    <Form id={FORM_ID} layout="vertical" onFinish={() => void onSubmit({ name, workspaceIds: spaces, scopes, allowFullAccess })}>
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
    </Form>
  </DrawerShell>;
}
