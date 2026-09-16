import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { useState } from 'react';
import { Alert, Form, Input } from 'antd';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import { assetCatalogApi, repositoryBranch, type AssetCatalog, type AssetKind } from '../api/asset-catalog-api';
export function AssetEditDrawer({ catalog, kind, id, onClose }: { catalog: AssetCatalog; kind: AssetKind; id: string; onClose: () => void }) {
  const item = (kind === 'project' ? catalog.projects : kind === 'service' ? catalog.services : catalog.repositories).find(x => x.id === id)!;
  const service = catalog.services.find(x => x.id === id);
  const [name, setName] = useState(item.name), [description, setDescription] = useState(item.description), [repositoryId, setRepositoryId] = useState(service?.repositoryId), [modulePath, setModulePath] = useState(service?.modulePath || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [revision] = useState(catalog.revision);
  const label = { project: '项目', service: '服务', repository: '代码库' }[kind];
  return <MetadataEditDrawer open title={`编辑${label}`} objectName={item.name} formId="catalog-edit" saveButtonId="catalog-edit-save" dirty={name !== item.name || description !== item.description || repositoryId !== service?.repositoryId || modulePath !== (service?.modulePath || '')} saving={busy} disabled={catalog.migrationRequired} onClose={onClose}>
    {error && <Alert type="error" showIcon message={error} description="当前输入已保留；若版本已变化，请重新打开后核对。" />}
    <form id="catalog-edit" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await assetCatalogApi.update(kind, id, { revision, name, description, ...(kind === 'service' ? { repositoryId, modulePath } : {}) }); onClose(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
      <Form layout="vertical" component={false}><Form.Item label="名称" required><Input aria-label="名称" value={name} required onChange={e => setName(e.target.value)} /></Form.Item><Form.Item label="说明"><Input.TextArea aria-label="说明" value={description} onChange={e => setDescription(e.target.value)} rows={4} /></Form.Item>
      {kind === 'service' && <><Form.Item label="代码库" required><CreatableResourceSelect label="代码库" value={repositoryId} onChange={value => setRepositoryId(value as string)} options={catalog.repositories.map(r => ({ value: r.id, label: `${r.name} · ${repositoryBranch(r)}` }))} /></Form.Item><Form.Item label="模块目录"><Input value={modulePath} onChange={e => setModulePath(e.target.value)} placeholder="留空表示代码库根目录" /></Form.Item></>}
      {kind === 'repository' && <Alert type="info" message="Git 来源、分支和目录属于代码身份；变更前需由智能体（Agent）核对实际代码状态。" />}</Form>
    </form>
  </MetadataEditDrawer>;
}
