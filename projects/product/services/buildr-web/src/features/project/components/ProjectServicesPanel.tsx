import { AppstoreOutlined, CloseOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, List } from 'antd';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { CatalogMigration } from '../../workspace/components/CatalogMigration';
import { ServiceCreateDrawer } from '../../service/components/ServiceCreateDrawer';
export function ProjectServicesPanel({ projectCode }: { projectCode: string }) {
  const { workspaceId } = useAppShell(), { data, error, setData } = useAssetCatalog();
  const [creating, setCreating] = useState(false), [draft, setDraft] = useState<ServiceDraft>();
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  if (error) return <Alert type="error" message={error} />;
  if (!data) return <Card loading />;
  const project = data.projects.find(p => p.code === projectCode);
  if (!project) return <Alert type="error" message="项目不存在" />;
  const linkedIds = project.serviceIds || [], linked = data.services.filter(service => linkedIds.includes(service.id));
  const save = async (serviceIds: string[], newServices: ServiceDraft[] = []) => {
    setSaving(true); setSaveError('');
    try { setData(await assetCatalogApi.associate(project.id, { revision: data.revision, serviceIds, newServices })); }
    catch (err) { setSaveError((err as Error).message); throw err; }
    finally { setSaving(false); }
  };
  return <section className="resource-section"><CatalogMigration catalog={data} onSaved={setData} />
    <div className="resource-section-head"><h2>关联服务 <span>{linked.length}</span></h2>
      <div id="project-manage-services" className="project-associate-picker"><CreatableResourceSelect label="服务" placeholder="关联服务" value={null} disabled={data.migrationRequired || saving} loading={saving}
        options={data.services.filter(service => !linkedIds.includes(service.id)).map(service => ({ value: service.id, label: service.name }))}
        onChange={value => { void save([...linkedIds, value as string]).catch(() => {}); }} onCreate={() => setCreating(true)} /></div>
    </div>
    {saveError && <Alert type="error" showIcon message={saveError} description="关联未保存，请核对最新内容后重试。" />}
    <List dataSource={linked} locale={{ emptyText: '尚未关联服务，可以选择已有服务或新增。' }} renderItem={service => <List.Item className="project-service-row" actions={[<Button key="unlink" className="resource-unlink" aria-label={`解除关联 ${service.name}`} title="解除关联" icon={<CloseOutlined />} type="text" disabled={data.migrationRequired || saving} onClick={() => { void save(linkedIds.filter(id => id !== service.id)).catch(() => {}); }} />]}>
      <Link className="resource-relation-row" aria-label={service.name} data-service-card={service.code} to={workspaceHref(workspaceId, `/services/${service.id}`)}><span className="resource-row-icon"><AppstoreOutlined /></span><span className="resource-row-text"><strong>{service.name}</strong><small>{service.description || service.code}</small></span></Link>
    </List.Item>} />
    {creating && <ServiceCreateDrawer catalog={data} initial={draft} onClose={value => { setDraft(value); setCreating(false); }} onSave={async service => { await save(linkedIds, [service]); setDraft(undefined); setCreating(false); }} />}
  </section>;
}
