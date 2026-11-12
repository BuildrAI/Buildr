import {useState} from 'react';
import {Alert,Button,Input,InputNumber,Modal,Select,Space,Switch,Table,Tag} from 'antd';
import {DeleteOutlined,PlusOutlined,ReloadOutlined} from '@ant-design/icons';
import {CUSTOM_PROVIDER_PROTOCOLS,customProviderEndpoint,removeCustomModel,upsertCustomModel,type CustomProviderDiscoverInput,type CustomProviderDiscoverResult,type CustomProviderModelInput,type CustomProviderProtocol,type CustomProviderSaveInput} from './custom-provider-model';

interface FormInitial {accountId?:string;label:string;baseUrl:string;protocol?:CustomProviderProtocol;useApiKey:boolean;credentialConfigured?:boolean;sourceEnabled?:boolean;models:CustomProviderModelInput[];}
interface Props {
  open:boolean;busy?:boolean;initial?:FormInitial;
  onCancel():void;
  onSave(input:CustomProviderSaveInput):Promise<void>;
  onDiscover?(input:CustomProviderDiscoverInput):Promise<CustomProviderDiscoverResult>;
}

/** Supplier-declared endpoint form; keys stay in the account-private store and never appear in lists. */
export function CustomProviderForm({open,busy,initial,onCancel,onSave,onDiscover}:Props){
  return <Modal open={open} title={initial?.accountId?'编辑供应商':'添加供应商'} width={640} footer={null} destroyOnClose onCancel={onCancel}>
    <CustomProviderFields key={initial?.accountId??'new'} busy={busy} initial={initial} onCancel={onCancel} onSave={onSave} onDiscover={onDiscover}/>
  </Modal>;
}

function CustomProviderFields({busy,initial,onCancel,onSave,onDiscover}:Omit<Props,'open'>){
  const [label,setLabel]=useState(initial?.label??''),[baseUrl,setBaseUrl]=useState(initial?.baseUrl??'');
  const [protocol,setProtocol]=useState<CustomProviderProtocol>(initial?.protocol??'chat-completions');
  const [useApiKey,setUseApiKey]=useState(initial?.useApiKey??false),[apiKey,setApiKey]=useState('');
  const [sourceEnabled,setSourceEnabled]=useState(initial?.sourceEnabled!==false);
  const [models,setModels]=useState<CustomProviderModelInput[]>(initial?.models??[]);
  const [manual,setManual]=useState<{id:string;label:string;contextWindow?:number}>({id:'',label:''});
  const [candidates,setCandidates]=useState<Array<{id:string;label?:string}>>([]),[notice,setNotice]=useState('');
  const [error,setError]=useState(''),[saving,setSaving]=useState(false),[discovering,setDiscovering]=useState(false);
  const locked=Boolean(busy)||saving||discovering;
  const keyReady=!useApiKey||Boolean(apiKey.trim())||Boolean(initial?.credentialConfigured);
  const join=(entries:Array<{id:string;label?:string}>)=>{
    setModels(current=>entries.reduce((list,entry)=>upsertCustomModel(list,entry),current));
    setCandidates(current=>current.filter(candidate=>!entries.some(entry=>entry.id===candidate.id)));
  };
  async function discover(){
    if(!onDiscover||locked)return;
    setDiscovering(true);setError('');setNotice('');setCandidates([]);
    try{
      const result=await onDiscover({...(initial?.accountId?{accountId:initial.accountId}:{}),baseUrl:baseUrl.trim(),protocol,useApiKey,...(useApiKey&&apiKey.trim()?{apiKey:apiKey.trim()}:{})});
      const fresh=result.models.filter(model=>!models.some(existing=>existing.id===model.id));
      setCandidates(fresh);
      setNotice(result.models.length?fresh.length?`从端点发现 ${result.models.length} 个模型，请选择要加入的候选。`:'发现的模型已在列表中。':result.diagnostic||'端点没有返回可用的模型列表，请手动添加模型。');
    }catch(failure){setError(failure instanceof Error?failure.message:'模型列表获取失败。');}
    finally{setDiscovering(false);}
  }
  async function save(){
    if(locked)return;
    setSaving(true);setError('');
    try{await onSave({...(initial?.accountId?{accountId:initial.accountId}:{}),label:label.trim(),baseUrl:baseUrl.trim(),protocol,useApiKey,apiKey:useApiKey&&apiKey.trim()?apiKey.trim():undefined,models,sourceEnabled});}
    catch(failure){setError(failure instanceof Error?failure.message:'供应商配置未完成。');}
    finally{setSaving(false);}
  }
  return <div className="amm-custom-form">
    {error&&<Alert type="error" showIcon message={error}/>}
    <label className="amm-custom-field"><span>供应商名称</span><Input aria-label="供应商名称" placeholder="例如：公司网关" maxLength={160} value={label} disabled={locked} onChange={event=>setLabel(event.target.value)}/></label>
    <label className="amm-custom-field"><span>API 协议</span><Select aria-label="API 协议" value={protocol} disabled={locked} options={CUSTOM_PROVIDER_PROTOCOLS.map(item=>({value:item.value,label:item.label}))} onChange={setProtocol}/></label>
    <label className="amm-custom-field"><span>Base URL</span><Input aria-label="Base URL" placeholder="https://gateway.example.com/v1" maxLength={2048} value={baseUrl} disabled={locked} onChange={event=>setBaseUrl(event.target.value)}/></label>
    <p className="amm-custom-endpoint">实际请求地址：<span className="mono">{customProviderEndpoint(protocol,baseUrl)}</span>；模型发现读取 <span className="mono">{baseUrl.trim().replace(/\/+$/,'')||'<Base URL>'}/models</span>。</p>
    <div className="amm-custom-field is-inline"><span>使用 API Key</span><Switch aria-label="使用 API Key" checked={useApiKey} disabled={locked} onChange={setUseApiKey}/></div>
    {useApiKey&&<label className="amm-custom-field"><span>API Key</span><Input.Password aria-label="API Key" autoComplete="new-password" placeholder={initial?.credentialConfigured?'已保存，留空则保持不变':'sk-...'} value={apiKey} disabled={locked} onChange={event=>setApiKey(event.target.value)}/></label>}
    <div className="amm-custom-field is-inline"><span>启用此供应商</span><Switch aria-label="启用此供应商" checked={sourceEnabled} disabled={locked} onChange={setSourceEnabled}/></div>
    <section className="amm-custom-models">
      <header><strong>模型</strong><Button size="small" icon={<ReloadOutlined/>} aria-label="获取模型列表" loading={discovering} disabled={!onDiscover||locked||!baseUrl.trim()} onClick={()=>void discover()}>获取模型列表</Button></header>
      {notice&&<Alert type="info" showIcon message={notice}/>}
      {candidates.length>0&&<div className="amm-custom-candidates"><p>候选模型</p><Space wrap>{candidates.map(candidate=><Tag key={candidate.id} closable={false}><Space size={4}>{candidate.label||candidate.id}<Button type="link" size="small" aria-label={`加入 ${candidate.label||candidate.id}`} onClick={()=>join([candidate])}>加入</Button></Space></Tag>)}</Space><Button type="link" size="small" aria-label="加入全部候选模型" onClick={()=>join(candidates)}>全部加入</Button></div>}
      {models.length>0&&<Table className="amm-custom-model-table" size="small" rowKey="id" pagination={false} dataSource={models} columns={[
        {title:'模型 ID',key:'id',render:(_,model)=><span className="mono">{model.id}</span>},
        {title:'显示名',key:'label',render:(_,model)=>model.label||'—'},
        {title:'上下文窗口',key:'context',width:150,render:(_,model)=>model.contextWindow?model.contextWindow.toLocaleString():'未设置'},
        {title:'',key:'remove',width:56,render:(_,model)=><Button type="text" aria-label={`移除 ${model.label||model.id}`} icon={<DeleteOutlined/>} disabled={locked} onClick={()=>setModels(current=>removeCustomModel(current,model.id))}/>},
      ]}/>}
      <div className="amm-custom-manual">
        <Input aria-label="模型 ID" placeholder="模型 ID，例如 gpt-4o" value={manual.id} disabled={locked} onChange={event=>setManual(current=>({...current,id:event.target.value}))}/>
        <Input aria-label="模型显示名" placeholder="显示名（可选）" value={manual.label} disabled={locked} onChange={event=>setManual(current=>({...current,label:event.target.value}))}/>
        <InputNumber aria-label="上下文窗口" placeholder="上下文窗口" min={1} max={10000000} value={manual.contextWindow??null} disabled={locked} onChange={value=>setManual(current=>({...current,contextWindow:typeof value==='number'?value:undefined}))}/>
        <Button icon={<PlusOutlined/>} disabled={locked||!manual.id.trim()} onClick={()=>{setModels(current=>upsertCustomModel(current,manual));setManual({id:'',label:''});}}>手动添加模型</Button>
      </div>
    </section>
    <footer className="amm-custom-actions"><Button disabled={saving} onClick={onCancel}>取消</Button><Button type="primary" loading={saving} disabled={Boolean(busy)||discovering||!label.trim()||!baseUrl.trim()||!keyReady} onClick={()=>void save()}>保存供应商</Button></footer>
  </div>;
}
