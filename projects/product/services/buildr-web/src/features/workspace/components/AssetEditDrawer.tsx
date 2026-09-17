import { useRepositoryLocalConfig } from './useRepositoryLocalConfig';
import { RepositoryFields } from './RepositoryFields';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import { assetCatalogApi, repositoryBranch, type AssetCatalog, type AssetKind, type RepositoryDraft } from '../api/asset-catalog-api';
export function AssetEditDrawer({ catalog, kind, id, onClose }: { catalog: AssetCatalog; kind: AssetKind; id: string; onClose: () => void }) {
  const item = (kind === 'project' ? catalog.projects : kind === 'service' ? catalog.services : catalog.repositories).find(x => x.id === id)!;
  const service = catalog.services.find(x => x.id === id);
  const [creatingRepository, setCreatingRepository] = useState(false);
  const [repositoryDraft, setRepositoryDraft] = useState<RepositoryDraft>({ code: '', url: '', integrationBranch: '' });
  const [name, setName] = useState(item.name), [description, setDescription] = useState(item.description), [repositoryId, setRepositoryId] = useState(service?.repositoryId), [modulePath, setModulePath] = useState(service?.modulePath || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const repository = catalog.repositories.find(x => x.id === id);
  const git = repository?.source.git as { url?: string; remote?: string; integrationBranch?: string } | undefined;
  const [source, setSource] = useState<RepositoryDraft>({ code: item.code, path: repository?.source.path || '.', url: git?.url || '', remote: git?.remote || 'origin', integrationBranch: String(repository?.source.integrationBranch || git?.integrationBranch || '') });
  const local = useRepositoryLocalConfig(kind === 'repository' ? id : undefined, catalog.revision);
  const touchedSource = useRef(false);
  const changeSource = (next: RepositoryDraft) => {
    if (next.url !== source.url || next.remote !== source.remote || next.path !== source.path) touchedSource.current = true;
    setSource(next);
  };
  useEffect(() => {
    if (git?.url || touchedSource.current || !local.data?.available) return;
    const remote = local.data.remotes.find(remote => remote.name === local.data?.selectedRemote);
    if (remote) setSource(previous => ({ ...previous, url: remote.url, remote: remote.name }));
  }, [local.data, git?.url]);
  const affectedServices = catalog.services.filter(service => service.repositoryId === id);
  const [revision] = useState(catalog.revision);
  const label = { project: '项目', service: '服务', repository: '代码库' }[kind];
  return <MetadataEditDrawer open title={`编辑${label}`} objectName={item.name} formId="catalog-edit" saveButtonId="catalog-edit-save" saving={busy} disabled={catalog.migrationRequired || kind === 'repository' && local.loading} onClose={onClose}>
    {error && <Alert type="error" showIcon message={error} description="当前输入已保留；若版本已变化，请重新打开后核对。" />}
    <form id="catalog-edit" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await assetCatalogApi.update(kind, id, { revision, name, description, ...(kind === 'service' ? { ...(creatingRepository ? { repository: repositoryDraft } : { repositoryId }), modulePath } : kind === 'repository' ? { path: source.path, url: source.url, remote: source.remote, integrationBranch: source.integrationBranch } : {}) }); onClose(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
      <Form layout="vertical" component={false}><Form.Item label="名称" required><Input aria-label="名称" value={name} required onChange={e => setName(e.target.value)} /></Form.Item><Form.Item label="说明"><Input.TextArea aria-label="说明" value={description} onChange={e => setDescription(e.target.value)} rows={4} /></Form.Item>
      {kind === 'service' && <><Form.Item label="代码库" required><CreatableResourceSelect label="代码库" disabled={busy} value={creatingRepository ? undefined : repositoryId} placeholder={creatingRepository ? '正在新增代码库' : '选择代码库'} onChange={value => { setCreatingRepository(false); setRepositoryId(value as string); }} onCreate={() => setCreatingRepository(true)} options={catalog.repositories.map(r => ({ value: r.id, label: `${r.name} · ${repositoryBranch(r)}` }))} /></Form.Item>{creatingRepository && <section className="resource-section" data-inline-repository><div className="resource-section-head"><h3>新增代码库</h3><Button type="text" disabled={busy} onClick={() => setCreatingRepository(false)}>取消新增代码库</Button></div><RepositoryFields value={repositoryDraft} onChange={setRepositoryDraft} /><p className="page-copy">保存服务时一并登记代码库，关闭编辑不会留下登记。</p></section>}<Form.Item label="模块目录"><Input aria-label="模块目录" value={modulePath} onChange={e => setModulePath(e.target.value)} placeholder="留空表示代码库根目录" /></Form.Item></>}
      {kind === 'repository' && <><RepositoryFields editing value={source} onChange={changeSource} />
        {local.loading && <p className="page-copy">正在读取本地 Git 配置…</p>}
        {(local.error || local.data?.diagnostic) && <Alert type="warning" message={local.error || local.data?.diagnostic} />}
        {local.data?.available && <div data-local-repository-config><p className="page-copy">本地实际配置{!git?.url ? '：可确定的地址会补入空白字段，保存后才记入声明。' : '（与编辑中的声明分别展示）'}</p>
          {local.data.remotes.length ? local.data.remotes.map(remote => <p className="page-copy" key={remote.name}><strong>{remote.name}</strong>：{remote.url} <Button size="small" onClick={() => { touchedSource.current = true; setSource(previous => ({ ...previous, url: remote.url, remote: remote.name })); }}>使用 {remote.name}</Button></p>) : <p className="page-copy">本地尚未配置远端。</p>}
          <p className="page-copy">当前分支：{local.data.currentBranch || '未检出分支'}。集成分支保持你的声明。</p></div>}
<p className="page-copy">引用服务：{affectedServices.map(service => service.name).join('、') || '无'}。声明修改将影响这些服务后续的代码定位和工作起点。</p><Alert type="info" message="保存仅更新声明" description="不会切换当前分支、改写实际远端、克隆或搬迁文件。保存后可在详情检查实际状态，按提示处理待对齐事项。" /></>}</Form>
    </form>
  </MetadataEditDrawer>;
}
