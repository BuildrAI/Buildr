import { CreatableResourceSelect } from '../../../components/CreatableResourceSelect';
import { useState } from 'react';
import { Space, Tag } from 'antd';
import { ServiceCreateDrawer } from '../../service/components/ServiceCreateDrawer';
import type { AssetCatalog, ServiceDraft } from '../../workspace/api/asset-catalog-api';
export function ProjectServiceSelection({ catalog, projectCode, ids, onIds, drafts, onDrafts }: { catalog: AssetCatalog; projectCode?: string; ids: string[]; onIds: (ids: string[]) => void; drafts: ServiceDraft[]; onDrafts: (drafts: ServiceDraft[]) => void }) {
  const [creating, setCreating] = useState(false), [pending, setPending] = useState<ServiceDraft>();
  return <><CreatableResourceSelect label="服务" multiple placeholder="选择已有服务，也可以稍后关联" value={ids} onChange={value => onIds(value as string[])} options={catalog.services.map(s => ({ value: s.id, label: s.name }))} onCreate={() => setCreating(true)} />
    <Space wrap style={{ marginTop: 12 }}>{drafts.map((draft, index) => <Tag key={index} closable onClose={() => onDrafts(drafts.filter((_, i) => i !== index))}>{draft.name} · 待保存</Tag>)}</Space>
    {creating && <ServiceCreateDrawer projectCode={projectCode} catalog={catalog} initial={pending} onClose={draft => { setPending(draft); setCreating(false); }} onSave={draft => { if (catalog.services.some(s => s.code === draft.code) || drafts.some(s => s.code === draft.code)) throw new Error('服务标识重复，请更换标识。'); onDrafts([...drafts, draft]); setPending(undefined); setCreating(false); }} />}
  </>;
}
