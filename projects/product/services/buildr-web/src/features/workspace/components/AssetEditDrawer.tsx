import { useRepositoryLocalConfig } from './useRepositoryLocalConfig';
import { assetEditDraft } from './asset-edit-draft';
import { useAppShell } from '../../../app/AppShellContext';
import { MetadataConflictNotice } from '../../../components/MetadataConflictNotice';
import { rebaseEditedFields } from '../../../lib/metadata-recovery';
import { codeFieldTrim, textFieldTrim } from '../../../lib/input-trim';
import { CODE_INPUT_PATTERN, CODE_INPUT_TITLE, normalizeCodeInput } from '../../../lib/code-input';
import { RepositoryFields } from './RepositoryFields';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { ProjectServiceSelection } from './ProjectServiceSelection';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Select } from 'antd';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import { assetCatalogApi, repositoryBranch, type AssetCatalog, type AssetKind, type RepositoryDraft, type ServiceDraft } from '../api/asset-catalog-api';
import { SERVICE_TYPE_OPTIONS } from '../../../lib/labels';
export function AssetEditDrawer({ catalog: initialCatalog, kind, id, onClose, onSaved }: { catalog: AssetCatalog; kind: AssetKind; id: string; onClose: () => void; onSaved?: (catalog: AssetCatalog) => void }) {
  const { workspaceId } = useAppShell();
  const [observed, setObserved] = useState(initialCatalog);
  const catalog = observed;
  const item = (kind === 'project' ? catalog.projects : kind === 'service' ? catalog.services : catalog.repositories).find(x => x.id === id)!;
  const service = catalog.services.find(x => x.id === id);
  const project = catalog.projects.find(x => x.id === id);
  const [creatingRepository, setCreatingRepository] = useState(false);
  const [repositoryDraft, setRepositoryDraft] = useState<RepositoryDraft>({ code: '', url: '', integrationBranch: '' });
  const [code, setCode] = useState(item.code), [name, setName] = useState(item.name), [description, setDescription] = useState(item.description), [type, setType] = useState(service?.type || 'service'), [repositoryId, setRepositoryId] = useState(service?.repositoryId), [modulePath, setModulePath] = useState(service?.modulePath || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>(() => service ? catalog.projects.filter(entry => entry.serviceIds?.includes(service.id)).map(entry => entry.id) : []);
  const [serviceIds, setServiceIds] = useState<string[]>(() => project ? [...(project.serviceIds ?? [])] : catalog.services.filter(entry => entry.repositoryId === id).map(entry => entry.id));
  const [newServices, setNewServices] = useState<ServiceDraft[]>([]);
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
  const [conflict, setConflict] = useState(false), [latest, setLatest] = useState<AssetCatalog | null>(null);
  const [readingLatest, setReadingLatest] = useState(false), [recoveryError, setRecoveryError] = useState('');
  const scope = useRef({ workspaceId, kind, id });
  if (scope.current.workspaceId !== workspaceId || scope.current.kind !== kind || scope.current.id !== id) scope.current = { workspaceId, kind, id };
  useEffect(() => () => { scope.current = { ...scope.current }; }, []);
  const baseDraft = assetEditDraft(observed, kind, id)!;
  const draft = { code: normalizeCodeInput(code.replace(/\s+/g, '')), name: name.trim(), description, type: type.trim() || 'service', repositoryId, modulePath: modulePath.trim(), projectIds, serviceIds, path: (source.path ?? '.').replace(/\s+/g, ''), url: (source.url ?? '').replace(/\s+/g, ''), remote: (source.remote ?? 'origin').replace(/\s+/g, ''), integrationBranch: (source.integrationBranch ?? '').replace(/\s+/g, '') };
  const latestDraft = latest ? assetEditDraft(latest, kind, id) : null;
  const readOnly = Boolean(observed.migrationRequired || latest?.migrationRequired);
  const applyDraft = (next: typeof draft) => {
    setCode(next.code); setName(next.name); setDescription(next.description); setType(next.type); setRepositoryId(next.repositoryId); setModulePath(next.modulePath);
    setProjectIds(next.projectIds); setServiceIds(next.serviceIds);
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
      const updatedCatalog = await assetCatalogApi.update(kind, id, { revision: base.revision, name: input.name, description: input.description,
        ...(kind === 'service' ? { code: input.code, type: input.type, projectIds: input.projectIds, ...(creatingRepository ? { repository: repositoryDraft } : { repositoryId: input.repositoryId }), modulePath: input.modulePath }
          : kind === 'project' ? { code: input.code, serviceIds: input.serviceIds, newServices }
          : { path: input.path, url: input.url, remote: input.remote, integrationBranch: input.integrationBranch, serviceIds: input.serviceIds }) });
      if (scope.current === observedScope) { onSaved?.(updatedCatalog); onClose(); }
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
  const label = { project: '项目', service: '服务', repository: '代码库' }[kind];
  const serviceName = (value: string) => (latest || catalog).services.find(entry => entry.id === value)?.name || value;
  const projectName = (value: string) => (latest || catalog).projects.find(entry => entry.id === value)?.name || value;
  return <MetadataEditDrawer open title={`编辑${label}`} objectName={item.name} formId="catalog-edit" saveButtonId="catalog-edit-save" saving={busy} disabled={readOnly || conflict || readingLatest || !name.trim() || kind === 'repository' && local.loading} onClose={onClose}>
    {error && <Alert type="error" showIcon message={error} description="修改尚未保存，当前输入已保留。" />}
    {conflict && <MetadataConflictNotice loading={readingLatest} busy={busy} error={recoveryError} canContinue={Boolean(latestDraft && !readOnly)} canSave={Boolean(name.trim())}
      latest={latestDraft && <dl><dt>名称</dt><dd>{latestDraft.name}</dd><dt>说明</dt><dd>{latestDraft.description || '尚未填写'}</dd>
        {kind === 'service' && <><dt>服务编码</dt><dd>{latestDraft.code}</dd><dt>服务类型</dt><dd>{latestDraft.type}</dd><dt>代码库</dt><dd>{latest?.repositories.find(item => item.id === latestDraft.repositoryId)?.name || latestDraft.repositoryId}</dd><dt>模块目录</dt><dd>{latestDraft.modulePath || '代码库根目录'}</dd><dt>所属项目</dt><dd>{latestDraft.projectIds.map(projectName).join('、') || '尚未关联'}</dd></>}
        {kind === 'project' && <><dt>项目编码</dt><dd>{latestDraft.code}</dd><dt>关联服务</dt><dd>{latestDraft.serviceIds.map(serviceName).join('、') || '无'}</dd></>}
        {kind === 'repository' && <><dt>仓库目录</dt><dd>{latestDraft.path}</dd><dt>Git 地址</dt><dd>{latestDraft.url || '未填写'}</dd><dt>远端名称（Remote）</dt><dd>{latestDraft.remote}</dd><dt>集成分支</dt><dd>{latestDraft.integrationBranch || '未填写'}</dd><dt>引用服务</dt><dd>{latestDraft.serviceIds.map(serviceName).join('、') || '无'}</dd></>}
      </dl>} onRead={() => void readLatest()} onUseLatest={useLatest} onKeep={keepChanges} copyText={JSON.stringify({ ...draft, ...(creatingRepository ? { repository: repositoryDraft } : {}) }, null, 2)} />}
    <form ref={form} id="catalog-edit" onSubmit={event => { event.preventDefault(); if (!conflict) void save(observed); }}>
      <Form layout="vertical" component={false} disabled={busy || readOnly}><Form.Item label="名称" required><Input aria-label="名称" value={name} required {...textFieldTrim(setName)} /></Form.Item>
      {kind !== 'repository' && <Form.Item label={`${label}编码`} required help={kind === 'project' ? '字母、数字、点、下划线与短横线；改编码会重写历史定位，并在目标空闲时迁移受管项目目录及其中已登记代码库路径；若代码库根位于上层，则同步调整受影响的服务模块路径；附接源不移动，目标占用时拒绝保存。' : '字母、数字、点、下划线与短横线；服务改码保留历史定位，已有服务文档目录会随清单在同一事务内改名；目标占用时拒绝保存，不移动代码库模块目录。'}><Input aria-label={`${label}编码`} required pattern={CODE_INPUT_PATTERN} title={CODE_INPUT_TITLE} value={code} {...codeFieldTrim(text => setCode(normalizeCodeInput(text)))} /></Form.Item>}
      <Form.Item label="说明"><Input.TextArea aria-label="说明" value={description} onChange={e => setDescription(e.target.value)} rows={4} /></Form.Item>
      {kind === 'project' && <Form.Item label="关联服务" help="全量维护本项目的服务成员，可在此直接新增服务；解除关联不会删除服务或代码。"><ProjectServiceSelection catalog={catalog} projectCode={code} ids={serviceIds} onIds={setServiceIds} drafts={newServices} onDrafts={setNewServices} /></Form.Item>}
      {kind === 'service' && <Form.Item label="服务类型" help="用于本地运行等能力判断服务角色。"><Select aria-label="服务类型" value={type} onChange={setType} options={SERVICE_TYPE_OPTIONS.map(option => ({ ...option }))} placeholder="选择服务类型" /></Form.Item>}
      {kind === 'service' && <><Form.Item label="所属项目" help="可多选；保存时按所选集合全量维护归属，取消某个项目只解除该项目的引用。"><Select aria-label="所属项目" mode="multiple" allowClear value={projectIds} onChange={value => setProjectIds(value ?? [])} options={catalog.projects.map(entry => ({ label: entry.name, value: entry.id }))} placeholder="选择服务所属项目；留空显示为尚未关联" /></Form.Item><Form.Item label="代码库" required><CreatableResourceSelect label="代码库" disabled={busy || readOnly} value={creatingRepository ? undefined : repositoryId} placeholder={creatingRepository ? '正在新增代码库' : '选择代码库'} onChange={value => { setCreatingRepository(false); setRepositoryId(value as string); }} onCreate={() => setCreatingRepository(true)} options={catalog.repositories.map(r => ({ value: r.id, label: `${r.name} · ${repositoryBranch(r)}` }))} /></Form.Item>{creatingRepository && <section className="resource-section" data-inline-repository><div className="resource-section-head"><h3>新增代码库</h3><Button type="text" disabled={busy || readOnly} onClick={() => setCreatingRepository(false)}>取消新增代码库</Button></div><RepositoryFields disabled={busy || readOnly} value={repositoryDraft} onChange={setRepositoryDraft} /><p className="page-copy">保存服务时一并登记代码库，关闭编辑不会留下登记。</p></section>}<Form.Item label="模块目录" help="服务代码目录相对代码库根的路径，不是构建文件（如 pom）里的模块名；留空表示代码库根目录。"><Input aria-label="模块目录" value={modulePath} {...codeFieldTrim(setModulePath)} placeholder="留空表示代码库根目录" /></Form.Item></>}
      {kind === 'repository' && <><RepositoryFields editing disabled={busy || readOnly} value={source} onChange={changeSource} />
        <Form.Item label="所属服务" help="勾选会把该服务的代码库引用改到本库并保留模块路径；当前成员不能在此移除，请先在目标代码库安置。"><Select aria-label="所属服务" mode="multiple" value={serviceIds} onChange={setServiceIds} options={catalog.services.map(entry => ({ label: entry.repositoryId === id ? `${entry.name}（当前）` : entry.name, value: entry.id, disabled: entry.repositoryId === id }))} placeholder="选择使用本代码库的服务" /></Form.Item>
        {local.loading && <p className="page-copy">正在读取本地 Git 配置…</p>}
        {(local.error || local.data?.diagnostic) && <Alert type="warning" message={local.error || local.data?.diagnostic} />}
        {local.data?.available && <div data-local-repository-config><p className="page-copy">本地实际配置{!git?.url ? '：可确定的地址会补入空白字段，保存后才记入声明。' : '（与编辑中的声明分别展示）'}</p>
          {local.data.remotes.length ? local.data.remotes.map(remote => <p className="page-copy" key={remote.name}><strong>{remote.name}</strong>：{remote.url} <Button size="small" disabled={busy || readOnly} onClick={() => { touchedSource.current = true; setSource(previous => ({ ...previous, url: remote.url, remote: remote.name })); }}>使用 {remote.name}</Button></p>) : <p className="page-copy">本地尚未配置远端。</p>}
          <p className="page-copy">当前分支：{local.data.currentBranch || '未检出分支'}。集成分支保持你的声明。</p></div>}
<Alert type="info" message="保存仅更新声明" description="不会切换当前分支、改写实际远端、克隆或搬迁文件。保存后可在详情检查实际状态，按提示处理待对齐事项。" /></>}</Form>
    </form>
  </MetadataEditDrawer>;
}
