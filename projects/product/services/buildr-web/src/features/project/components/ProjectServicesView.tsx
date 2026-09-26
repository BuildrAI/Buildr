import { AppstoreOutlined, CloseOutlined, RightOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Alert, Button } from 'antd';
import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import './project-services-panel.css';

type Service = { id: string; code: string; name: string; description?: string };
type Props = { services: Service[]; linkedIds: string[]; disabled?: boolean; compact?: boolean; onReload?(): void; onSave(ids: string[]): Promise<void>; onCreate(): void; serviceHref(id: string): string; onOpen?(id: string): void };
export function ProjectServicesView({ services, linkedIds, disabled, compact, onReload, onSave, onCreate, serviceHref, onOpen }: Props) {
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const linked = services.filter(service => linkedIds.includes(service.id));
  const save = async (ids: string[]) => {
    setSaving(true); setSaveError('');
    try { await onSave(ids); } catch (error) { setSaveError(error instanceof Error ? error.message : '关联未保存'); }
    finally { setSaving(false); }
  };
  return <>
    <div className="resource-section-head"><h2>关联服务 <span>{linked.length}</span></h2>
      <div id="project-manage-services" className="project-associate-picker"><CreatableResourceSelect label="服务" placeholder="关联服务" value={null} disabled={disabled || saving} loading={saving}
        options={services.filter(service => !linkedIds.includes(service.id)).map(service => ({ value: service.id, label: service.name }))}
        onChange={value => { void save([...linkedIds, value as string]); }} onCreate={() => onCreate()} /></div>
    </div>
    {saveError && <Alert type="error" showIcon message={saveError} description="关联未保存，请重新读取最新内容后重试。" action={onReload && <Button onClick={onReload}>重新读取</Button>} />}
    {!compact && (linked.length ? <ul className="project-service-list" aria-label="项目关联服务">{linked.map(service => <li key={service.id} className="project-service-row">
      <a className="project-service-link" aria-label={service.name} data-service-card={service.code} href={serviceHref(service.id)} onClick={event => { if (onOpen) { event.preventDefault(); onOpen(service.id); } }}>
        <span className="project-service-icon"><AppstoreOutlined /></span>
        <span className="project-service-text"><strong>{service.name}</strong><small>{service.description || service.code}</small></span>
        <RightOutlined className="project-service-open" aria-hidden />
      </a>
      <Button className="resource-unlink" aria-label={`解除关联 ${service.name}`} title="解除关联" icon={<CloseOutlined />} type="text" disabled={disabled || saving} onClick={() => { void save(linkedIds.filter(id => id !== service.id)); }} />
    </li>)}</ul> : <p className="page-copy project-service-empty">尚未关联服务，可以选择已有服务或新增。</p>)}
  </>;
}
