import {createContext, useContext, useState} from 'react';
import {Button, Checkbox, Empty, Form, Input, InputNumber, Modal, Select, Space, Tabs} from 'antd';
import {PlusOutlined, ReloadOutlined, RobotOutlined} from '@ant-design/icons';
import {AccountModelManager, type ManagedModel, type ModelSourceView} from '../../features/agent-conversations/AccountModelManager';
import {compareSourceNames} from '../../features/agent-conversations/account-quota-view';
import {ProviderConnectionDrawer, type ProviderConnection} from './ProviderConnectionDrawer';

type Props = Parameters<typeof AccountModelManager>[0];
export type ModelEntry = {modelId:string;label?:string;contextWindow?:number};
export type PreviewSource = ModelSourceView & {connection?: ProviderConnection};
export const ProviderPreviewContext = createContext<{
  editId?: string;
  editConnection(id?: string): void;
  saveConnection(connection: ProviderConnection): void;
  discoverModels(id: string): ModelEntry[];
  addModels(id: string, entries: ModelEntry[]): void;
  removeModel(id: string, modelId: string): void;
} | null>(null);
const canRefresh = (source: ModelSourceView) => source.sourceEnabled !== false && source.status === 'ready' && !source.loginPending;

function summary(source: ModelSourceView) {
  if (source.sourceEnabled === false) return '已停用';
  if (source.loginPending) return '正在连接';
  if (source.status === 'expired') return '登录已过期';
  if (source.status === 'failed') return '暂不可用';
  if (source.status === 'not-authenticated') return source.provider === 'custom' ? '待配置' : '未登录';
  const count = source.models.filter(model => model.enabled).length;
  return count ? `${count} 个模型已启用` : '已连接 · 未启用模型';
}

export function ProviderWorkspace(props: Props) {
  const {sources, selection, onSelect, onRefresh, onShowDisabled, showDisabled, busy} = props;
  const preview = useContext(ProviderPreviewContext)!;
  const [manual, setManual] = useState(false);
  const [manualForm] = Form.useForm<ModelEntry>();
  const [discovery,setDiscovery] = useState<{sourceId:string;entries:ModelEntry[]}>();
  const [removeId,setRemoveId] = useState<string>();
  const connections = sources as PreviewSource[];
  const disabled = sources.filter(source => source.sourceEnabled === false);
  const entries = connections.filter(source => showDisabled || source.sourceEnabled !== false)
    .sort((a,b)=>compareSourceNames(a.providerLabel,b.providerLabel));
  const builtIn = entries.filter(source=>!source.connection);
  const custom = entries.filter(source=>source.connection);
  const selected = entries.find(source => source.id === selection.sourceId);
  const edit = connections.find(source=>source.id === preview.editId);
  const scope = selected ? [selected] : entries;
  const models = scope.filter(source => source.sourceEnabled !== false);
  const rows = models.reduce((sum, source) => sum + source.models.length, 0);
  const tab = selection.tab;
  const choose = (sourceId: string) => {setDiscovery(undefined);onSelect({sourceId,tab});};
  const editModel = selected?.connection && canRefresh(selected) ? selected : undefined;
  const candidates = discovery && discovery.sourceId===editModel?.id
    ? discovery.entries.filter(entry=>!editModel?.models.some(model=>model.id===entry.modelId)) : undefined;
  const removableModels:ManagedModel[] = editModel?.connection?.kind==='custom' ? editModel.models : [];

  const navItem = (source:PreviewSource) => <button type="button" key={source.id} aria-current={selected?.id === source.id ? 'true' : undefined} onClick={() => choose(source.id)}>
          <span className={`amm-provider-mark is-${source.provider}`}>{source.providerLabel.slice(0,1)}</span>
          <span><strong>{source.providerLabel}</strong><small>{summary(source)}</small></span>
        </button>;

  return <div className="pmp-workspace">
    <aside className="pmp-sidebar" aria-label="供应商" data-prototype-position="account-sources">
      <div className="pmp-side-actions" data-prototype-position="provider-actions">
        <div className="pmp-nav-title">供应商</div>
        <Button block icon={<PlusOutlined aria-hidden="true"/>} onClick={() => preview.editConnection('new')}>添加供应商</Button>
        <Checkbox className="pmp-show-disabled" checked={showDisabled} onChange={event => onShowDisabled?.(event.target.checked)}>显示已停用{disabled.length ? ` (${disabled.length})` : ''}</Checkbox>
      </div>
      <div className="pmp-mobile-picker">
        <Select aria-label="选择供应商" value={selected?.id ?? 'all'} options={[{value:'all',label:'全部供应商'}, ...entries.map(source => ({value:source.id,label:source.providerLabel}))]} onChange={choose}/>
      </div>
      <div className="pmp-nav-items">
        <button type="button" aria-current={!selected ? 'true' : undefined} onClick={() => choose('all')}>
          <span className="amm-provider-mark"><RobotOutlined aria-hidden="true"/></span><strong>全部供应商</strong>
        </button>
        {builtIn.map(navItem)}
        {!!custom.length && <>
          <div className="pmp-nav-section">自定义供应商</div>
          {custom.map(navItem)}
        </>}
      </div>
    </aside>
    <div className="pmp-main">
      <header className="pmp-header">
        <div><h2>{selected?.providerLabel ?? '全部供应商'}</h2>{!selected && <p>{entries.length} 家供应商</p>}</div>
        {selected?.connection && <Button size="small" onClick={()=>preview.editConnection(selected.id)}>编辑接入</Button>}
      </header>
      <div className="pmp-tabs">
        <Tabs activeKey={tab} onChange={value => onSelect({...selection,tab:value as typeof tab})} items={[
          {key:'quota',label:'账号与额度'},
          {key:'models',label:rows ? `模型 · ${rows}` : '模型'},
        ]}/>
        {(!selected || tab === 'models' && !selected.connection) && scope.some(canRefresh) &&
          <Button size="small" icon={<ReloadOutlined aria-hidden="true"/>} loading={scope.some(source => props.refreshingIds?.includes(source.id))}
            onClick={() => onRefresh(selected?.id ?? 'all')}>{tab === 'models' ? '刷新模型' : '刷新已连接账号'}</Button>}
      </div>
      {tab === 'models' && editModel && <Space wrap className="pmp-model-actions" data-prototype-position="model-actions">
        <Button size="small" loading={busy} title={editModel.connection?.modelsPath} onClick={()=>setDiscovery({sourceId:editModel.id,entries:preview.discoverModels(editModel.id)})}>读取模型列表</Button>
        {editModel.connection?.kind==='custom' && <Button size="small" disabled={busy} onClick={()=>{manualForm.resetFields();setManual(true);}}>手动添加模型</Button>}
        {!!removableModels.length && <Button size="small" onClick={()=>setRemoveId('')}>移除模型</Button>}
      </Space>}
      {tab==='models' && editModel && candidates && <div className="pmp-candidates">
        {candidates.length ? <><strong>候选模型</strong><Space wrap>
          {candidates.map(entry=><Button key={entry.modelId} size="small" onClick={()=>preview.addModels(editModel.id,[entry])}>加入 {entry.label??entry.modelId}</Button>)}
          <Button size="small" onClick={()=>preview.addModels(editModel.id,candidates)}>全部加入</Button>
        </Space></> : <span>没有新的候选模型。</span>}
      </div>}
      {tab === 'models' && !rows && !models.some(source => source.combinations?.length)
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={editModel ? '还没有模型。' : models.length ? '暂无可管理的模型，请先完成账号连接。' : '该供应商已停用。'}/>
        : <div className="pmp-account-content" key={selected?.id ?? 'all'}>
            <AccountModelManager {...props} sources={tab === 'models' ? models : scope}
              selection={{sourceId:'all',tab}} onSelect={next => onSelect({sourceId:next.sourceId === 'all' ? selection.sourceId : next.sourceId,tab:next.tab})}
              onShowDisabled={undefined} additionalProviders={undefined} onAdd={undefined} onEditProvider={preview.editConnection}/>
          </div>}
    </div>
    {preview.editId && <ProviderConnectionDrawer key={preview.editId} initial={edit?.connection} existingConnections={connections.flatMap(source=>source.id!==edit?.id&&source.connection?[source.connection]:[])} configuredPresets={connections.flatMap(source=>source.connection ? [source.connection.kind] : [])}
      onClose={()=>preview.editConnection()} onSave={preview.saveConnection}/>}
    <Modal forceRender title="手动添加模型" open={manual && Boolean(editModel)} okText="添加" onCancel={()=>setManual(false)} onOk={()=>manualForm.submit()}>
      <Form name="manual-model" form={manualForm} layout="vertical" onFinish={entry=>{
        if(editModel)preview.addModels(editModel.id,[{...entry,modelId:entry.modelId.trim()}]);
        setManual(false);
      }}>
        <Form.Item label="模型 ID" name="modelId" rules={[{required:true,whitespace:true,message:'请输入模型 ID'}]}>
          <Input placeholder="例如：my-model-v2"/>
        </Form.Item>
        <Form.Item label="模型显示名" name="label"><Input placeholder="留空时使用模型 ID"/></Form.Item>
        <Form.Item label="上下文窗口" name="contextWindow"><InputNumber min={1} max={10000000} precision={0}/></Form.Item>
      </Form>
    </Modal>
    <Modal title="移除模型" open={removeId!==undefined && Boolean(editModel)} okText="移除" okButtonProps={{danger:true,disabled:!removeId}}
      onCancel={()=>setRemoveId(undefined)} onOk={()=>{
        if(editModel&&removeId)preview.removeModel(editModel.id,removeId);
        setRemoveId(undefined);
      }}>
      <Select aria-label="选择要移除的模型" placeholder="选择要移除的模型" value={removeId||undefined}
        options={removableModels.map(model=>({value:model.id,label:model.label}))} onChange={setRemoveId} style={{width:'100%'}}/>
    </Modal>
  </div>;
}

export {ProviderWorkspace as AccountModelManager};
