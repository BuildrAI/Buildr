import { DrawerShell } from '../../../components/DrawerShell';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Form, Input } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { CatalogMigration } from '../../workspace/components/CatalogMigration';
import { ProjectServiceSelection } from './ProjectServiceSelection';
export function ProjectCreateDrawer({ onClose }: { onClose?: () => void }) {
  const { workspaceId } = useAppShell(), navigate = useNavigate(), { data, error, setData } = useAssetCatalog();
  const [name, setName] = useState(''), [code, setCode] = useState(''), [description, setDescription] = useState(''), [ids, setIds] = useState<string[]>([]), [drafts, setDrafts] = useState<ServiceDraft[]>([]), [busy, setBusy] = useState(false), [saveError, setSaveError] = useState('');
  if (error) return <Alert type="error" message={error} />;
  if (!data) return <Card loading />;
  return <DrawerShell open title="创建项目" sub="先定义业务目标，再关联服务。没有服务也可以创建项目。" onClose={() => { if (!busy) onClose?.(); }} closeDisabled={busy} footer={<Button type="primary" form="project-create-form" htmlType="submit" disabled={data.migrationRequired} loading={busy}>创建项目</Button>}><CatalogMigration catalog={data} onSaved={setData} /><form id="project-create-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setSaveError(''); try { await assetCatalogApi.project({ revision: data.revision, name, code, description, serviceIds: ids, newServices: drafts }); onClose?.(); navigate(workspaceHref(workspaceId, `/projects/${code}`)); } catch (err) { setSaveError((err as Error).message); } finally { setBusy(false); } }}><Form layout="vertical" component={false}>{saveError && <Alert type="error" message={saveError} />}<Form.Item label="项目名称" required><Input aria-label="项目名称" required value={name} onChange={e => setName(e.target.value)} /></Form.Item><Form.Item label="项目标识" required><Input aria-label="项目标识" required pattern="[A-Za-z0-9]([A-Za-z0-9._]|-)*" value={code} onChange={e => setCode(e.target.value)} /></Form.Item><Form.Item label="业务目标"><Input.TextArea aria-label="业务目标" rows={3} value={description} onChange={e => setDescription(e.target.value)} /></Form.Item><Form.Item label="关联服务（可选）"><ProjectServiceSelection catalog={data} ids={ids} onIds={setIds} drafts={drafts} onDrafts={setDrafts} /></Form.Item></Form></form></DrawerShell>;
}
