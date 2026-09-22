import { AppstoreOutlined, CloseOutlined, RightOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi, type AssetCatalog, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
import { CatalogMigration } from '../../workspace/components/CatalogMigration';
import { ServiceCreateDrawer } from '../../service/components/ServiceCreateDrawer';
import './project-services-panel.css';
type Props = { projectCode: string; data: AssetCatalog; setData: (catalog: AssetCatalog) => void };
export function ProjectServicesPanel({ projectCode, data, setData }: Props) {
  const { workspaceId } = useAppShell();
  const [creating, setCreating] = useState(false), [draft, setDraft] = useState<ServiceDraft>();
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const project = data.projects.find(p => p.workspaceId === workspaceId && p.code === projectCode);
  if (!project) return <Alert type="error" message="项目不存在" />;
  const linkedIds = project.serviceIds || [], services = data.services.filter(service => service.workspaceId === workspaceId);
  const linked = services.filter(service => linkedIds.includes(service.id));
  const save = async (serviceIds: string[], newServices: ServiceDraft[] = []) => {
    setSaving(true); setSaveError('');
    try { setData(await assetCatalogApi.associate(project.id, { revision: data.revision, serviceIds, newServices })); }
    catch (err) { setSaveError((err as Error).message); throw err; }
    finally { setSaving(false); }
  };
  return <section className="resource-section"><CatalogMigration catalog={data} onSaved={setData} />
    <div className="resource-section-head"><h2>关联服务 <span>{linked.length}</span></h2>
      <div id="project-manage-services" className="project-associate-picker"><CreatableResourceSelect label="服务" placeholder="关联服务" value={null} disabled={data.migrationRequired || saving} loading={saving}
        options={services.filter(service => !linkedIds.includes(service.id)).map(service => ({ value: service.id, label: service.name }))}
        onChange={value => { void save([...linkedIds, value as string]).catch(() => {}); }} onCreate={() => setCreating(true)} /></div>
    </div>
    {saveError && <Alert type="error" showIcon message={saveError} description="关联未保存，请核对最新内容后重试。" />}
    {linked.length ? <ul className="project-service-list" aria-label="项目关联服务">{linked.map(service => <li key={service.id} className="project-service-row">
      <Link className="project-service-link" aria-label={service.name} data-service-card={service.code} to={workspaceHref(workspaceId, `/services/${service.id}`)}>
        <span className="project-service-icon"><AppstoreOutlined /></span>
        <span className="project-service-text"><strong>{service.name}</strong><small>{service.description || service.code}</small></span>
        <RightOutlined className="project-service-open" aria-hidden />
      </Link>
      <Button className="resource-unlink" aria-label={`解除关联 ${service.name}`} title="解除关联" icon={<CloseOutlined />} type="text" disabled={data.migrationRequired || saving} onClick={() => { void save(linkedIds.filter(id => id !== service.id)).catch(() => {}); }} />
    </li>)}</ul> : <p className="page-copy project-service-empty">尚未关联服务，可以选择已有服务或新增。</p>}
    {creating && <ServiceCreateDrawer projectCode={projectCode} catalog={data} initial={draft} onClose={value => { setDraft(value); setCreating(false); }} onSave={async service => { await save(linkedIds, [service]); setDraft(undefined); setCreating(false); }} />}
  </section>;
}
