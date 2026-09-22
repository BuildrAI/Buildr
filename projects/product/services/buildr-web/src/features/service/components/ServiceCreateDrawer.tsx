import { RepositoryFields } from '../../workspace/components/RepositoryFields';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { DirectoryCandidateSelect } from '../../workspace/components/DirectoryCandidateSelect';
import { useState } from 'react';
import { Alert, Button, Form, Input, Space, Select } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { repositoryBranch, type AssetCatalog, type RepositoryDraft, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
export function ServiceCreateDrawer({ catalog, onClose, onSave, initial, projectCode }: { catalog: AssetCatalog; onClose: (draft?: ServiceDraft) => void; onSave: (draft: ServiceDraft) => Promise<void> | void; initial?: ServiceDraft; projectCode?: string }) {
  const [draft, setDraft] = useState<ServiceDraft>(initial || { name: '', code: '', description: '', type: 'service', directoryMode: 'create', projectCode });
  const [newRepository, setNewRepository] = useState(Boolean(initial?.repository)), [repository, setRepository] = useState<RepositoryDraft>(initial?.repository || { code: '', url: '', integrationBranch: '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const update = (key: keyof ServiceDraft, value: string) => setDraft(s => ({ ...s, [key]: value }));
  const current = () => ({ ...draft, projectCode: projectCode || draft.projectCode, ...(newRepository ? { repository, repositoryId: undefined } : { repository: undefined }) });
  return <DrawerShell open title="新增服务" sub="选择已有服务目录，或在项目下新建。" onClose={() => { if (!busy) onClose(current()); }} closeDisabled={busy} width="min(580px,100vw)" footer={<Space style={{ display: 'flex', justifyContent: 'flex-end' }}><Button disabled={busy} onClick={() => onClose(current())}>取消</Button><Button type="primary" loading={busy} htmlType="submit" form="catalog-service-create">添加服务</Button></Space>}>
    <form id="catalog-service-create" onSubmit={async e => { e.preventDefault(); e.stopPropagation(); if (draft.directoryMode !== 'existing' && !projectCode && !draft.projectCode) { setError('请选择新建服务所在项目。'); return; } setBusy(true); setError(''); try { await onSave(current()); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}><Form layout="vertical" component={false}>
      {error && <Alert type="error" message={error} />}
      <Form.Item label="服务名称" required><Input aria-label="服务名称" required value={draft.name} onChange={e => update('name', e.target.value)} /></Form.Item>
      <Form.Item label="服务标识" required><Input aria-label="服务标识" required pattern="[A-Za-z0-9]([A-Za-z0-9._]|-)*" value={draft.code} onChange={e => update('code', e.target.value)} placeholder="例如 egg-business" /></Form.Item>
      <Form.Item label="实现职责"><Input.TextArea aria-label="实现职责" rows={3} value={draft.description} onChange={e => update('description', e.target.value)} /></Form.Item>
      <Form.Item label="服务目录"><DirectoryCandidateSelect kind="service" value={draft.directoryMode === 'existing' ? draft.directoryPath : undefined} onChange={candidate => setDraft(s => ({ ...s, directoryMode: candidate ? 'existing' : 'create', directoryPath: candidate?.path, directoryObservation: candidate?.observation, projectCode: candidate?.projectCode || projectCode || s.projectCode, code: s.code || candidate?.code || '', name: s.name || candidate?.code || '' }))} /></Form.Item>
      {draft.directoryMode !== 'existing' && <><Form.Item label="所在项目" required>{projectCode ? <span>{catalog.projects.find(p => p.code === projectCode)?.name || projectCode}</span> : <Select aria-label="所在项目" value={draft.projectCode} onChange={value => update('projectCode', value)} options={catalog.projects.map(p => ({ label: p.name, value: p.code }))} />}</Form.Item><p className="page-copy">将新建：projects/{projectCode || draft.projectCode || '<项目>'}/services/{draft.code || '<服务标识>'}/</p></>}
      <Form.Item label="代码库（可选）" help="留空由系统根据服务目录识别；多个服务可以共用代码库。"><CreatableResourceSelect label="代码库" value={newRepository ? undefined : draft.repositoryId} placeholder={newRepository ? '正在新增代码库' : '自动识别服务目录所属代码库'} onChange={value => { setNewRepository(false); update('repositoryId', value as string); }} onCreate={() => { setRepository(r => ({ ...r, path: draft.directoryPath || `projects/${projectCode || draft.projectCode}/services/${draft.code}` })); setNewRepository(true); }} options={catalog.repositories.map(r => ({ value: r.id, label: `${r.name} · ${repositoryBranch(r)}` }))} /></Form.Item>
      {newRepository && <section style={{ padding: 16, border: '1px solid #dbe7e1', borderRadius: 8, background: '#f7faf8', marginBottom: 20 }}><h3>新增代码库</h3><RepositoryFields value={repository} onChange={setRepository} /></section>}
    </Form></form>
  </DrawerShell>;
}
