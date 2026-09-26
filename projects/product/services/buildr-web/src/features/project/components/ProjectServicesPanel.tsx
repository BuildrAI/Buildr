import { useState } from 'react';
import { Alert, Button } from 'antd';
import { ProjectServicesView } from './ProjectServicesView';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi, type AssetCatalog, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
import { CatalogMigration } from '../../workspace/components/CatalogMigration';
import { ServiceCreateDrawer } from '../../service/components/ServiceCreateDrawer';
import './project-services-panel.css';
type Props = { projectCode: string; data: AssetCatalog; setData: (catalog: AssetCatalog) => void; compact?: boolean; onReload?(): void };
export function ProjectServicesPanel({ projectCode, data, setData, compact, onReload }: Props) {
  const { workspaceId } = useAppShell();
  const [creating, setCreating] = useState(false), [draft, setDraft] = useState<ServiceDraft>();
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const project = data.projects.find(p => p.workspaceId === workspaceId && p.code === projectCode);
  if (!project) return <Alert type="error" message="项目不存在" />;
  const linkedIds = project.serviceIds || [], services = data.services.filter(service => service.workspaceId === workspaceId);
  const save = async (serviceIds: string[], newServices: ServiceDraft[] = []) => {
    setSaving(true); setSaveError('');
    try { setData(await assetCatalogApi.associate(project.id, { revision: data.revision, serviceIds, newServices })); }
    finally { setSaving(false); }
  };
  return <section className="resource-section"><CatalogMigration catalog={data} onSaved={setData} />
    <ProjectServicesView compact={compact} onReload={onReload} services={services} linkedIds={linkedIds} disabled={data.migrationRequired || saving} onSave={ids => save(ids)} onCreate={() => setCreating(true)} serviceHref={id => workspaceHref(workspaceId, `/services/${id}`)} />
    {saveError && <Alert type="error" message={saveError} action={onReload && <Button onClick={onReload}>重新读取</Button>} />}
    {creating && <ServiceCreateDrawer projectCode={projectCode} catalog={data} initial={draft} onClose={value => { setDraft(value); setCreating(false); }} onSave={async service => { try { await save(linkedIds, [service]); setDraft(undefined); setCreating(false); } catch (error) { setSaveError((error as Error).message); throw error; } }} />}
  </section>;
}
