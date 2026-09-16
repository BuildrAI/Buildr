import { DrawerShell } from '../../../components/DrawerShell';
import { AppstoreOutlined, CloseOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, List, Space } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi, type AssetCatalog, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { CatalogMigration } from '../../workspace/components/CatalogMigration';
import { ProjectServiceSelection } from './ProjectServiceSelection';
export function ProjectServicesPanel({ projectCode }: { projectCode: string }) {
  const { workspaceId } = useAppShell(), { data, error, setData } = useAssetCatalog();
  const [editing, setEditing] = useState<AssetCatalog | null>(null), [ids, setIds] = useState<string[]>([]), [drafts, setDrafts] = useState<ServiceDraft[]>([]), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  if (error) return <Alert type="error" message={error} />;
  if (!data) return <Card loading />;
  const project = data.projects.find(p => p.code === projectCode);
  if (!project) return <Alert type="error" message="项目不存在" />;
  const linked = data.services.filter(s => project.serviceIds?.includes(s.id));
  const save = async (serviceIds: string[], newServices = drafts) => { setSaving(true); setSaveError(''); try { setData(await assetCatalogApi.associate(project.id, { revision: (editing || data).revision, serviceIds, newServices })); setEditing(null); setDrafts([]); } catch (err) { setSaveError((err as Error).message); } finally { setSaving(false); } };
  return <section className="resource-section"><CatalogMigration catalog={data} onSaved={setData} /><div className="resource-section-head"><h2>关联服务 <span>{linked.length}</span></h2><Button id="project-manage-services" disabled={data.migrationRequired || saving} onClick={() => { setIds(project.serviceIds || []); setEditing(data); }}>关联服务</Button></div>{saveError && !editing && <Alert type="error" message={saveError} description="当前输入已保留，请重新读取后核对。" />}
    {editing && <DrawerShell open title="关联服务" onClose={() => { if (!saving) setEditing(null); }} closeDisabled={saving} footer={<Space style={{ display: 'flex', justifyContent: 'flex-end' }}><Button onClick={() => setEditing(null)} disabled={saving}>取消</Button><Button type="primary" loading={saving} onClick={() => void save(ids)}>保存关联</Button></Space>}>
      {saveError && <Alert type="error" message={saveError} />}
      <ProjectServiceSelection catalog={editing} ids={ids} onIds={setIds} drafts={drafts} onDrafts={setDrafts} />
    </DrawerShell>}<List dataSource={linked} locale={{ emptyText: '尚未关联服务，可以选择已有服务或新增。' }} renderItem={service => <List.Item className="project-service-row" actions={[<Button key="unlink" className="resource-unlink" aria-label={`解除关联 ${service.name}`} title="解除关联" icon={<CloseOutlined />} type="text" disabled={data.migrationRequired || saving} onClick={() => void save((project.serviceIds || []).filter(id => id !== service.id), [])} />]}><Link className="resource-relation-row" aria-label={service.name} data-service-card={service.code} to={workspaceHref(workspaceId, `/services/${service.id}`)}><span className="resource-row-icon"><AppstoreOutlined /></span><span className="resource-row-text"><strong>{service.name}</strong><small>{service.description || service.code}</small></span></Link></List.Item>} />
  </section>;
}
