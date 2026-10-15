import { useRepositoryLocalConfig } from './useRepositoryLocalConfig';
import { assetEditDraft } from './asset-edit-draft';
import { useAppShell } from '../../../app/AppShellContext';
import { MetadataConflictNotice } from '../../../components/MetadataConflictNotice';
import { rebaseEditedFields } from '../../../lib/metadata-recovery';
import { RepositoryFields } from './RepositoryFields';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import { assetCatalogApi, repositoryBranch, type AssetCatalog, type AssetKind, type RepositoryDraft } from '../api/asset-catalog-api';
export function AssetEditDrawer({ catalog: initialCatalog, kind, id, onClose }: { catalog: AssetCatalog; kind: AssetKind; id: string; onClose: () => void }) {
  const { workspaceId } = useAppShell();
  const [observed, setObserved] = useState(initialCatalog);
  const catalog = observed;
  const item = (kind === 'project' ? catalog.projects : kind === 'service' ? catalog.services : catalog.repositories).find(x => x.id === id)!;
  const service = catalog.services.find(x => x.id === id);
  const [creatingRepository, setCreatingRepository] = useState(false);
  const [repositoryDraft, setRepositoryDraft] = useState<RepositoryDraft>({ code: '', url: '', integrationBranch: '' });
  const [name, setName] = useState(item.name), [description, setDescription] = useState(item.description), [repositoryId, setRepositoryId] = useState(service?.repositoryId), [modulePath, setModulePath] = useState(service?.modulePath || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const repository = catalog.repositories.find(x => x.id === id);
  const git = repository?.source.git as { url?: string; remote?: string; integrationBranch?: string } | undefined;
  const [source, setSource] = useState<RepositoryDraft>({ code: item.code, path: repository?.source.path || '.', url: git?.url || '', remote: git?.remote || 'origin', integrationBranch: String(repository?.source.integrationBranch || git?.integrationBranch || '') });
  const saving = useRef(false), reading = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const local = useRepositoryLocalConfig(kind === 'repository' ? id : undefined, catalog.revision);
  const touchedSource = useRef(false);
  const changeSource = (next: RepositoryDraft) => {
    if (saving.current) return;
    if (next.url !== source.url || next.remote !== source.remote || next.path !== source.path) touchedSource.current = true;
    setSource(next);
  };
  useEffect(() => {
    if (git?.url || touchedSource.current || saving.current || !local.data?.available) return;
    const remote = local.data.remotes.find(remote => remote.name === local.data?.selectedRemote);
    if (remote) setSource(previous => ({ ...previous, url: remote.url, remote: remote.name }));
  }, [local.data, git?.url]);
  const affectedServices = catalog.services.filter(service => service.repositoryId === id);
  const [conflict, setConflict] = useState(false), [latest, setLatest] = useState<AssetCatalog | null>(null);
  const [readingLatest, setReadingLatest] = useState(false), [recoveryError, setRecoveryError] = useState('');
  const scope = useRef({ workspaceId, kind, id });
  if (scope.current.workspaceId !== workspaceId || scope.current.kind !== kind || scope.current.id !== id) scope.current = { workspaceId, kind, id };
  useEffect(() => () => { scope.current = { ...scope.current }; }, []);
  const baseDraft = assetEditDraft(observed, kind, id)!;
  const draft = { name, description, repositoryId, modulePath, path: source.path ?? '.', url: source.url ?? '', remote: source.remote ?? 'origin', integrationBranch: source.integrationBranch ?? '' };
  const latestDraft = latest ? assetEditDraft(latest, kind, id) : null;
  const readOnly = Boolean(observed.migrationRequired || latest?.migrationRequired);
  const applyDraft = (next: typeof draft) => {
    setName(next.name); setDescription(next.description); setRepositoryId(next.repositoryId); setModulePath(next.modulePath);
    touchedSource.current = true;
    setSource(previous => ({ ...previous, path: next.path, url: next.url, remote: next.remote, integrationBranch: next.integrationBranch }));
  };
  const readLatest = async () => {
    if (saving.current || reading.current) return;
    const observedScope = scope.current;
    reading.current = true; setReadingLatest(true); setRecoveryError(''); setLatest(null);
    try {
      const data = await assetCatalogApi.read();
      if (scope.current !== observedScope) return;
      setLatest(data);
      if (!assetEditDraft(data, kind, id)) setRecoveryError('对象已被移除，输入仍保留；请复制修改后核对当前目录。');
    } catch (err) {
      if (scope.current === observedScope) setRecoveryError(err instanceof Error ? err.message : '最新内容读取失败，请重试。');
    } finally {
      if (scope.current === observedScope) { reading.current = false; setReadingLatest(false); }
    }
  };
  const save = async (base: AssetCatalog, input = draft) => {
    if (saving.current || reading.current || readOnly || !input.name.trim() || !assetEditDraft(base, kind, id)) return;
    const observedScope = scope.current;
    saving.current = true; setBusy(true); setError('');
    setObserved(base); applyDraft(input);
    try {
      await assetCatalogApi.update(kind, id, { revision: base.revision, name: input.name, description: input.description,
        ...(kind === 'service' ? { ...(creatingRepository ? { repository: repositoryDraft } : { repositoryId: input.repositoryId }), modulePath: input.modulePath }
          : kind === 'repository' ? { path: input.path, url: input.url, remote: input.remote, integrationBranch: input.integrationBranch } : {}) });
      if (scope.current === observedScope) onClose();
    } catch (err) {
      if (scope.current !== observedScope) return;
      if ((err as { code?: string }).code === 'asset_revision_conflict') { setConflict(true); setLatest(null); setRecoveryError(err instanceof Error ? err.message : '声明版本已变化。'); }
      else setError(err instanceof Error ? err.message : '保存失败，输入已保留。');
    } finally {
      if (scope.current === observedScope) { saving.current = false; setBusy(false); }
    }
  };
  const useLatest = () => {
    if (!latest || !latestDraft || saving.current || reading.current) return;
    setObserved(latest); applyDraft(latestDraft); setCreatingRepository(false);
    setConflict(false); setLatest(null); setRecoveryError(''); setError('');
  };
  const keepChanges = () => {
    if (!form.current?.reportValidity()) return;
    if (latest && latestDraft) void save(latest, rebaseEditedFields(baseDraft, draft, latestDraft));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify({ ...draft, ...(creatingRepository ? { repository: repositoryDraft } : {}) }, null, 2)); }
    catch { setRecoveryError('自动复制失败，请直接选择并复制输入内容。'); }
  };
  const label = { project: '项目', service: '服务', repository: '代码库' }[kind];
  return <MetadataEditDrawer open title={`编辑${label}`} objectName={item.name} formId="catalog-edit" saveButtonId="catalog-edit-save" saving={busy} disabled={readOnly || conflict || readingLatest || !name.trim() || kind === 'repository' && local.loading} onClose={onClose}>
    {error && <Alert type="error" showIcon message={error} description="修改尚未保存，当前输入已保留。" />}
    {conflict && <MetadataConflictNotice loading={readingLatest} busy={busy} error={recoveryError} canContinue={Boolean(latestDraft && !readOnly)} canSave={Boolean(name.trim())}
      latest={latestDraft && <dl><dt>名称</dt><dd>{latestDraft.name}</dd><dt>说明</dt><dd>{latestDraft.description || '尚未填写'}</dd>
        {kind === 'service' && <><dt>代码库</dt><dd>{latest?.repositories.find(item => item.id === latestDraft.repositoryId)?.name || latestDraft.repositoryId}</dd><dt>模块目录</dt><dd>{latestDraft.modulePath || '代码库根目录'}</dd></>}
        {kind === 'repository' && <><dt>仓库目录</dt><dd>{latestDraft.path}</dd><dt>Git 地址</dt><dd>{latestDraft.url || '未填写'}</dd><dt>远端名称（Remote）</dt><dd>{latestDraft.remote}</dd><dt>集成分支</dt><dd>{latestDraft.integrationBranch || '未填写'}</dd></>}
      </dl>} onRead={() => void readLatest()} onUseLatest={useLatest} onKeep={keepChanges} onCopy={() => void copy()} />}
    <form ref={form} id="catalog-edit" onSubmit={event => { event.preventDefault(); if (!conflict) void save(observed); }}>
      <Form layout="vertical" component={false} disabled={busy || readOnly}><Form.Item label="名称" required><Input aria-label="名称" value={name} required onChange={e => setName(e.target.value)} /></Form.Item><Form.Item label="说明"><Input.TextArea aria-label="说明" value={description} onChange={e => setDescription(e.target.value)} rows={4} /></Form.Item>
      {kind === 'service' && <><Form.Item label="代码库" required><CreatableResourceSelect label="代码库" disabled={busy || readOnly} value={creatingRepository ? undefined : repositoryId} placeholder={creatingRepository ? '正在新增代码库' : '选择代码库'} onChange={value => { setCreatingRepository(false); setRepositoryId(value as string); }} onCreate={() => setCreatingRepository(true)} options={catalog.repositories.map(r => ({ value: r.id, label: `${r.name} · ${repositoryBranch(r)}` }))} /></Form.Item>{creatingRepository && <section className="resource-section" data-inline-repository><div className="resource-section-head"><h3>新增代码库</h3><Button type="text" disabled={busy || readOnly} onClick={() => setCreatingRepository(false)}>取消新增代码库</Button></div><RepositoryFields disabled={busy || readOnly} value={repositoryDraft} onChange={setRepositoryDraft} /><p className="page-copy">保存服务时一并登记代码库，关闭编辑不会留下登记。</p></section>}<Form.Item label="模块目录"><Input aria-label="模块目录" value={modulePath} onChange={e => setModulePath(e.target.value)} placeholder="留空表示代码库根目录" /></Form.Item></>}
      {kind === 'repository' && <><RepositoryFields editing disabled={busy || readOnly} value={source} onChange={changeSource} />
        {local.loading && <p className="page-copy">正在读取本地 Git 配置…</p>}
        {(local.error || local.data?.diagnostic) && <Alert type="warning" message={local.error || local.data?.diagnostic} />}
        {local.data?.available && <div data-local-repository-config><p className="page-copy">本地实际配置{!git?.url ? '：可确定的地址会补入空白字段，保存后才记入声明。' : '（与编辑中的声明分别展示）'}</p>
          {local.data.remotes.length ? local.data.remotes.map(remote => <p className="page-copy" key={remote.name}><strong>{remote.name}</strong>：{remote.url} <Button size="small" disabled={busy || readOnly} onClick={() => { touchedSource.current = true; setSource(previous => ({ ...previous, url: remote.url, remote: remote.name })); }}>使用 {remote.name}</Button></p>) : <p className="page-copy">本地尚未配置远端。</p>}
          <p className="page-copy">当前分支：{local.data.currentBranch || '未检出分支'}。集成分支保持你的声明。</p></div>}
<p className="page-copy">引用服务：{affectedServices.map(service => service.name).join('、') || '无'}。声明修改将影响这些服务后续的代码定位和工作起点。</p><Alert type="info" message="保存仅更新声明" description="不会切换当前分支、改写实际远端、克隆或搬迁文件。保存后可在详情检查实际状态，按提示处理待对齐事项。" /></>}</Form>
    </form>
  </MetadataEditDrawer>;
}
