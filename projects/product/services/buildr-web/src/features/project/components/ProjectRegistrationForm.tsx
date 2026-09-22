import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Select, Space } from 'antd';
import { assetCatalogApi, type AssetCatalog, type ProjectCandidates } from '../../workspace/api/asset-catalog-api';

type Props = { catalog: AssetCatalog; busy: boolean; onBusy: (busy: boolean) => void; onReady: (ready: boolean) => void; onCatalog: (catalog: AssetCatalog) => void; onRegistered: (code: string) => void };

export function ProjectRegistrationForm({ catalog, busy, onBusy, onReady, onCatalog, onRegistered }: Props) {
  const [candidates, setCandidates] = useState<ProjectCandidates | null>(null);
  const [code, setCode] = useState(''), [name, setName] = useState(''), [description, setDescription] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const candidate = candidates?.candidates.find(item => item.code === code);
  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const [next, current] = await Promise.all([assetCatalogApi.projectCandidates(signal), assetCatalogApi.read(signal)]);
      if (signal?.aborted) return;
      if (next.revision !== current.revision) throw new Error('读取期间登记发生变化，请重新核对目录。');
      setCandidates(next); onCatalog(current);
    } catch (err) { if (!signal?.aborted) { setCandidates(null); setError((err as Error).message); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [onCatalog]);
  useEffect(() => { const controller = new AbortController(); void reload(controller.signal); return () => controller.abort(); }, [reload]);
  useEffect(() => { onReady(Boolean(candidate) && !loading); return () => onReady(false); }, [candidate, loading, onReady]);
  const git = candidate?.source.git as { url?: string; integrationBranch?: string } | undefined;

  return <form id="project-register-form" onSubmit={async event => {
    event.preventDefault();
    if (!candidate || !candidates) return;
    onBusy(true); setError('');
    try {
      await assetCatalogApi.registerProject({ revision: candidates.revision, observation: candidate.observation, code, name, description, serviceIds });
      onRegistered(code);
    } catch (err) { setError(`${(err as Error).message} 当前输入已保留，请重新核对目录后再提交。`); }
    finally { onBusy(false); }
  }}><Form layout="vertical" component={false} disabled={busy}>
    <Alert type="info" showIcon message="保留目录内全部文件，只增加项目登记和本次选择的服务关联。" description="重新登记不会自动恢复原项目身份或历史关联。" />
    {error && <Alert id="project-register-error" type="error" message={error} />}
    <Form.Item label="已有项目目录" required extra="选择当前工作空间 projects/ 下尚未登记的目录。">
      <Space.Compact block><Select aria-label="已有项目目录" showSearch optionFilterProp="label" value={code || undefined} loading={loading} disabled={busy || loading} placeholder="选择已有项目目录" notFoundContent={loading ? '正在读取' : '没有可登记的目录'} options={candidates?.candidates.map(item => ({ value: item.code, label: item.path }))} onChange={value => { setCode(value); setName(value); }} style={{ flex: 1 }} /><Button disabled={busy} loading={loading} onClick={() => { void reload(); }}>重新核对目录</Button></Space.Compact>
    </Form.Item>
    {candidates?.diagnostics.map(item => <Alert key={item.code} type="warning" message={`${item.path}：${item.message}`} />)}
    {candidate && <Form.Item label="登记位置"><div>{candidate.path}</div>{git && <div>Git 地址：{git.url}<br />集成分支：{git.integrationBranch}</div>}</Form.Item>}
    <Form.Item label="项目标识"><Input aria-label="项目标识" value={code} readOnly /></Form.Item>
    <Form.Item label="项目名称" required><Input aria-label="项目名称" required value={name} onChange={event => setName(event.target.value)} /></Form.Item>
    <Form.Item label="业务目标"><Input.TextArea aria-label="业务目标" rows={3} value={description} onChange={event => setDescription(event.target.value)} /></Form.Item>
    <Form.Item label="关联服务（可选）"><Select aria-label="关联已有服务" mode="multiple" showSearch optionFilterProp="label" placeholder="明确选择本次要关联的服务" value={serviceIds} onChange={setServiceIds} options={catalog.services.map(service => ({ value: service.id, label: service.name }))} /></Form.Item>
  </Form></form>;
}
