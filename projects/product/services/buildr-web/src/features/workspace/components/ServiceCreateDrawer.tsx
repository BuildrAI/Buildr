import { RepositoryFields } from './RepositoryFields';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { DirectoryCandidateSelect } from './DirectoryCandidateSelect';
import { useState } from 'react';
import { Alert, Button, Form, Input, Space, Select } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { codeFieldTrim, textFieldTrim } from '../../../lib/input-trim';
import { CODE_INPUT_PATTERN, CODE_INPUT_TITLE, normalizeCodeInput } from '../../../lib/code-input';
import { repositoryBranch, type AssetCatalog, type RepositoryDraft, type ServiceDraft } from '../api/asset-catalog-api';
import { serviceCreateDraft, serviceCreatePayload } from './service-create-draft';
import { SERVICE_TYPE_OPTIONS } from '../../../lib/labels';
export function ServiceCreateDrawer({ catalog, onClose, onSave, initial, projectCode }: { catalog: AssetCatalog; onClose: (draft?: ServiceDraft) => void; onSave: (draft: ServiceDraft) => Promise<void> | void; initial?: ServiceDraft; projectCode?: string }) {
  const [draft, setDraft] = useState<ServiceDraft>(initial || { name: '', code: '', description: '', directoryMode: 'create', projectCode, projectIds: projectCode ? [projectCode] : undefined });
  const parentProject = projectCode ? catalog.projects.find(p => p.code === projectCode) : undefined;
  const [newRepository, setNewRepository] = useState(Boolean(initial?.repository)), [repository, setRepository] = useState<RepositoryDraft>(initial?.repository || { code: '', url: '', integrationBranch: '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const update = (key: keyof ServiceDraft, value: string | undefined) => setDraft(s => ({ ...s, [key]: value }));
  const existingRepository = Boolean(!newRepository && draft.repositoryId);
  const createsServiceDirectory = !existingRepository && !newRepository && draft.directoryMode !== 'existing';
  const selectedProject = draft.projectIds?.[0] ?? (draft.projectIds === undefined ? draft.projectCode : undefined);
  const setProject = (value?: string) => setDraft(s => ({ ...s, projectIds: value ? [value] : [], ...(!existingRepository && !newRepository && s.directoryMode !== 'existing' ? { projectCode: value } : {}) }));
  const current = () => serviceCreateDraft(draft, { newRepository, repository, projectCode });
  const submit = async () => { if (draft.type !== 'frontend' && draft.type !== 'backend') { setError('请选择服务类型（前端或后端）。'); return; } if (createsServiceDirectory && !projectCode && !draft.projectCode) { setError('请选择新建服务目录所属项目。'); return; } setBusy(true); setError(''); try { await onSave(serviceCreatePayload(draft, { newRepository, repository, projectCode })); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } };
  return <DrawerShell open title="新增服务" sub="选择承载代码的代码库，或在工作空间中登记、新建服务目录。" onClose={() => { if (!busy) onClose(current()); }} closeDisabled={busy} width="min(580px,100vw)" footer={<Space style={{ display: 'flex', justifyContent: 'flex-end' }}><Button disabled={busy} onClick={() => onClose(current())}>取消</Button><Button type="primary" loading={busy} htmlType="submit" form="catalog-service-create">添加服务</Button></Space>}>
    <form id="catalog-service-create" onSubmit={e => { e.preventDefault(); e.stopPropagation(); void submit(); }}><Form layout="vertical" component={false}>
      {error && <Alert type="error" message={error} />}
      <Form.Item label="服务名称" required><Input aria-label="服务名称" required value={draft.name} {...textFieldTrim(text => update('name', text))} /></Form.Item>
      <Form.Item label="服务编码" required><Input aria-label="服务编码" required pattern={CODE_INPUT_PATTERN} title={CODE_INPUT_TITLE} value={draft.code} {...codeFieldTrim(text => update('code', normalizeCodeInput(text)))} placeholder="例如 egg-business" /></Form.Item>
      <Form.Item label="实现职责"><Input.TextArea aria-label="实现职责" rows={3} value={draft.description} onChange={e => update('description', e.target.value)} /></Form.Item>
      <Form.Item label="服务类型" required help="用于本地运行等能力判断服务角色。"><Select aria-label="服务类型" value={draft.type === 'frontend' || draft.type === 'backend' ? draft.type : undefined} onChange={value => update('type', value as string | undefined)} options={SERVICE_TYPE_OPTIONS.map(option => ({ ...option }))} placeholder="选择服务类型" /></Form.Item>
      {projectCode
        ? <Form.Item label="所属项目" required={createsServiceDirectory} help={createsServiceDirectory ? '新建服务目录同时落在入口项目中。' : '新增服务归属于入口项目，归属随服务提交生效。'}><span>{parentProject ? `${parentProject.name}（${parentProject.code}）` : projectCode}</span></Form.Item>
        : <Form.Item label="所属项目" required={createsServiceDirectory} help={createsServiceDirectory ? '新建目录落在所选项目下；选择已有目录时，此处维护服务归属。' : '单选已有项目；留空的服务显示为尚未关联，可稍后补充。'}><Select aria-label="所属项目" allowClear value={selectedProject} onChange={value => setProject(value as string | undefined)} options={catalog.projects.map(p => ({ label: p.name, value: p.code }))} placeholder="选择服务所属项目" /></Form.Item>}
      <Form.Item label="代码库" help={existingRepository ? '该代码库承载服务代码，下方填写库内模块路径。' : '留空由系统根据服务目录识别；多个服务可以共用代码库。'}><CreatableResourceSelect label="代码库" allowClear value={newRepository ? undefined : draft.repositoryId} placeholder={newRepository ? '正在新增代码库' : '自动识别服务目录所属代码库'} onChange={value => { setNewRepository(false); update('repositoryId', value as string | undefined); }} onCreate={() => { setRepository(r => ({ ...r, path: undefined })); setNewRepository(true); }} options={catalog.repositories.map(r => ({ value: r.id, label: `${r.name} · ${repositoryBranch(r)}` }))} /></Form.Item>
      {newRepository && <section style={{ padding: 16, border: '1px solid #dbe7e1', borderRadius: 8, background: '#f7faf8', marginBottom: 20 }}><h3>新增代码库</h3><RepositoryFields value={repository} onChange={setRepository} /></section>}
      {existingRepository ? <Form.Item label="模块路径" help="服务代码目录相对代码库根的路径，留空表示整个代码库即此服务；不是构建文件里的模块名，不以 / 或 .. 开头。"><Input aria-label="模块路径" value={draft.modulePath || ''} {...textFieldTrim(text => update('modulePath', text))} placeholder="例如 services/supplier-app，留空为代码库根" /></Form.Item> : newRepository ? null : <>
        <Form.Item label="服务目录"><DirectoryCandidateSelect kind="service" value={draft.directoryMode === 'existing' ? draft.directoryPath : undefined} onChange={candidate => setDraft(s => ({ ...s, directoryMode: candidate ? 'existing' : 'create', directoryPath: candidate?.path, directoryObservation: candidate?.observation, projectCode: candidate?.projectCode || projectCode || s.projectCode, projectIds: projectCode ? [projectCode] : candidate?.projectCode ? [candidate.projectCode] : s.projectIds, code: s.code || candidate?.code || '', name: s.name || candidate?.code || '' }))} /></Form.Item>
        {draft.directoryMode !== 'existing' && <p className="page-copy">将新建：projects/{projectCode || draft.projectCode || '<项目>'}/services/{draft.code || '<服务编码>'}/</p>}
      </>}
    </Form></form>
  </DrawerShell>;
}
