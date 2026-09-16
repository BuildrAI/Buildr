import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { useState } from 'react';
import { Alert, Button, Form, Input, Space } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { repositoryBranch, type AssetCatalog, type RepositoryDraft, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
export function ServiceCreateDrawer({ catalog, onClose, onSave, initial }: { catalog: AssetCatalog; onClose: (draft?: ServiceDraft) => void; onSave: (draft: ServiceDraft) => Promise<void> | void; initial?: ServiceDraft }) {
  const [draft, setDraft] = useState<ServiceDraft>(initial || { name: '', code: '', description: '', type: 'service', modulePath: '' });
  const [newRepository, setNewRepository] = useState(Boolean(initial?.repository)), [repository, setRepository] = useState<RepositoryDraft>(initial?.repository || { code: '', url: '', integrationBranch: '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const update = (key: keyof ServiceDraft, value: string) => setDraft(s => ({ ...s, [key]: value }));
  const current = () => ({ ...draft, ...(newRepository ? { repository, repositoryId: undefined } : { repository: undefined }) });
  return <DrawerShell open title="新增服务" sub="选择一个代码库，多个服务可以共用。" onClose={() => { if (!busy) onClose(current()); }} closeDisabled={busy} width="min(580px,100vw)" footer={<Space style={{ display: 'flex', justifyContent: 'flex-end' }}><Button disabled={busy} onClick={() => onClose(current())}>取消</Button><Button type="primary" loading={busy} htmlType="submit" form="catalog-service-create">添加服务</Button></Space>}>
    <form id="catalog-service-create" onSubmit={async e => { e.preventDefault(); e.stopPropagation(); if (!newRepository && !draft.repositoryId) { setError('请选择或新增一个代码库。'); return; } setBusy(true); setError(''); try { await onSave(current()); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}><Form layout="vertical" component={false}>
      {error && <Alert type="error" message={error} />}
      <Form.Item label="服务名称" required><Input aria-label="服务名称" required value={draft.name} onChange={e => update('name', e.target.value)} /></Form.Item>
      <Form.Item label="服务标识" required><Input aria-label="服务标识" required pattern="[A-Za-z0-9]([A-Za-z0-9._]|-)*" value={draft.code} onChange={e => update('code', e.target.value)} placeholder="例如 egg-business" /></Form.Item>
      <Form.Item label="实现职责"><Input.TextArea aria-label="实现职责" rows={3} value={draft.description} onChange={e => update('description', e.target.value)} /></Form.Item>
      <Form.Item label="代码库" required><CreatableResourceSelect label="代码库" value={newRepository ? undefined : draft.repositoryId} placeholder={newRepository ? '正在新增代码库' : '选择代码库'} onChange={value => { setNewRepository(false); update('repositoryId', value as string); }} onCreate={() => setNewRepository(true)} options={catalog.repositories.map(r => ({ value: r.id, label: `${r.name} · ${repositoryBranch(r)}` }))} /></Form.Item>
      {newRepository && <section style={{ padding: 16, border: '1px solid #dbe7e1', borderRadius: 8, background: '#f7faf8', marginBottom: 20 }}><h3>新增代码库</h3><Form.Item label="代码库标识" required><Input aria-label="代码库标识" required pattern="[A-Za-z0-9]([A-Za-z0-9._]|-)*" value={repository.code} onChange={e => setRepository(r => ({ ...r, code: e.target.value }))} /></Form.Item><p className="page-copy">repositories/{repository.code || '<代码库标识>'}/</p><Form.Item label="Git 地址" required><Input aria-label="Git 地址" required value={repository.url} onChange={e => setRepository(r => ({ ...r, url: e.target.value }))} /></Form.Item><Form.Item label="集成分支" required><Input aria-label="集成分支" required value={repository.integrationBranch} onChange={e => setRepository(r => ({ ...r, integrationBranch: e.target.value }))} /></Form.Item><p className="page-copy">先登记来源，本地代码由智能体（Agent）按需准备。</p></section>}
      <Form.Item label="模块目录"><Input value={draft.modulePath} onChange={e => update('modulePath', e.target.value)} placeholder="可选，相对代码库根目录" /></Form.Item>
    </Form></form>
  </DrawerShell>;
}
