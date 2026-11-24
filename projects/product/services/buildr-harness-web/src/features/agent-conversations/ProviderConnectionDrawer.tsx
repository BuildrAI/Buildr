import {useState} from 'react';
import {Button,Form,Input,Select,Space} from 'antd';
import {DrawerShell} from '../../components/DrawerShell.tsx';
import {executionAgentName} from '../../lib/model-picker.ts';
import {CUSTOM_PROVIDER_PROTOCOLS,customProviderEndpoint,customProviderModelsUrl,DEFAULT_CUSTOM_MODELS_PATH,type CustomProviderProtocol} from './custom-provider-model.ts';

export interface ProviderConnectionOption {
  id:string;
  label:string;
  authentication?:{type:'oauth'|'api-key';label:string;placeholder?:string;description?:string};
  group?:{id:string;label:string};
  modeLabel?:string;
  custom?:boolean;
  connectionId?:string;
  linked?:boolean;
}
export interface ProviderConnectionInput {
  kind:string;
  accountId?:string;
  label:string;
  baseUrl?:string;
  protocol?:CustomProviderProtocol;
  modelsPath?:string;
  useApiKey?:boolean;
  apiKey?:string;
  prepareLocalGateway?:boolean;
}
export interface ProviderConnectionInitial extends ProviderConnectionInput {
  credentialConfigured?:boolean;
}

function providerInitial(provider:ProviderConnectionOption|undefined):ProviderConnectionInitial {
  if(!provider)return {kind:'custom',label:'',baseUrl:'',protocol:'chat-completions',modelsPath:DEFAULT_CUSTOM_MODELS_PATH,useApiKey:false};
  if(provider.id==='magpie')return {kind:'magpie',label:'Magpie',baseUrl:''};
  if(provider.custom)return {kind:provider.id,label:'',baseUrl:'',protocol:'chat-completions',modelsPath:DEFAULT_CUSTOM_MODELS_PATH,useApiKey:false};
  return {kind:provider.id,label:provider.label};
}

function connectionName(connectionId:string,connections?:ReadonlyArray<{id:string;label:string}>):string {
  return connections?.find(item=>item.id===connectionId)?.label||executionAgentName(connectionId);
}

function providerLabel(provider:ProviderConnectionOption,configured:boolean,connections?:ReadonlyArray<{id:string;label:string}>):string {
  if(provider.connectionId)return `${provider.label}（由${connectionName(provider.connectionId,connections)}智能体接入）`;
  if(configured&&!provider.custom)return `${provider.label}（已接入）`;
  return provider.label;
}

type Props={
  open:boolean;
  initial?:ProviderConnectionInitial;
  providers:ProviderConnectionOption[];
  connections?:ReadonlyArray<{id:string;label:string}>;
  configuredProviders?:string[];
  busy?:boolean;
  onClose():void;
  onSave(input:ProviderConnectionInput):Promise<void>;
};

/** Provider onboarding shared by built-in declarations and user-declared endpoints; credentials never echo stored values. */
export function ProviderConnectionDrawer({open,initial,providers,connections,configuredProviders=[],busy,onClose,onSave}:Props){
  const [form]=Form.useForm<ProviderConnectionInput>();
  const fallback=providers.find(provider=>provider.custom)??providers[0];
  const kind=Form.useWatch('kind',form)??initial?.kind??fallback?.id??'custom';
  const [clearKey,setClearKey]=useState(false);
  const baseUrl=Form.useWatch('baseUrl',form)??initial?.baseUrl??'';
  const protocol=Form.useWatch('protocol',form)??initial?.protocol??'chat-completions';
  const modelsPath=Form.useWatch('modelsPath',form)??initial?.modelsPath??DEFAULT_CUSTOM_MODELS_PATH;
  const editing=Boolean(initial?.accountId);
  const provider=providers.find(item=>item.id===kind);
  const magpie=kind==='magpie';
  const custom=Boolean(provider?.custom)&&!magpie;
  const apiKey=provider?.authentication?.type==='api-key';
  const hasKey=Boolean(initial?.credentialConfigured&&initial.kind===kind);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const locked=Boolean(busy)||saving;
  const configured=(id:string)=>id!=='custom'&&configuredProviders.includes(id);
  const options=[
    {label:'订阅账号',options:providers.filter(item=>!item.custom&&item.authentication?.type!=='api-key').map(item=>({value:item.id,label:providerLabel(item,configured(item.id),connections),disabled:!editing&&(Boolean(item.connectionId)||configured(item.id))}))},
    {label:'API Key',options:providers.filter(item=>!item.custom&&item.authentication?.type==='api-key').map(item=>({value:item.id,label:providerLabel(item,configured(item.id),connections),disabled:!editing&&configured(item.id)}))},
    {label:'其他',options:providers.filter(item=>item.custom).map(item=>({value:item.id,label:item.id==='magpie'&&configured(item.id)?'Magpie（已接入）':providerLabel(item,false,connections),disabled:!editing&&configured(item.id)}))},
  ].filter(group=>group.options.length);
  const hint=magpie?'连接本机 Magpie，登录和额度在 Magpie 中管理。地址留空时自动发现。':custom
    ?'配置显示名称、协议、Base URL 与模型列表路径。'
    :provider?.authentication?.description
      ??(provider?.connectionId?`由${connectionName(provider.connectionId,connections)}智能体接入管理；请在“智能体”页完成登录。`
        :provider?.authentication?.type==='oauth'?'保存后使用官方账号登录，并自动发现可用的模型与额度。'
          :'保存后开始官方登录，并自动发现可用的模型与额度。');
  const connect=!magpie&&!custom&&!apiKey&&!provider?.connectionId;

  async function save(values:ProviderConnectionInput,prepareLocalGateway=false){
    if(locked)return;
    setSaving(true);setError('');
    try{
      const next:ProviderConnectionInput=magpie?{kind:'magpie',label:'Magpie',accountId:initial?.accountId,baseUrl:values.baseUrl?.trim(),prepareLocalGateway}:custom
        ?{kind:values.kind,label:values.label.trim(),baseUrl:values.baseUrl?.trim(),protocol:values.protocol,modelsPath:values.modelsPath?.trim()||DEFAULT_CUSTOM_MODELS_PATH,useApiKey:Boolean(values.apiKey?.trim()||(hasKey&&!clearKey)),...(values.apiKey?.trim()?{apiKey:values.apiKey.trim()}:{})}
        :{kind:values.kind,label:provider?.label??values.label,...(values.apiKey?.trim()?{apiKey:values.apiKey.trim()}:{})};
      await onSave(next);
    }catch(failure){setError(failure instanceof Error?failure.message:'供应商接入未完成。');}
    finally{setSaving(false);}
  }

  return <DrawerShell open={open} title={editing?(magpie?'编辑 Magpie 连接':'编辑自定义供应商'):'添加供应商'} onClose={()=>{if(!saving)onClose();}} closeAriaLabel="关闭供应商配置"
    width="min(460px,100vw)" footer={<Space><Button disabled={saving} onClick={onClose}>取消</Button>{magpie&&(editing?baseUrl===initial?.baseUrl:!baseUrl.trim())&&<Button disabled={locked} onClick={()=>void form.validateFields().then(values=>save(values,true)).catch(()=>{})}>{editing?'启动并连接':'下载并启动'}</Button>}<Button type="primary" loading={saving} disabled={Boolean(busy)} onClick={()=>form.submit()}>{magpie?'连接 Magpie':connect?'保存并登录':'保存供应商'}</Button></Space>}>
    <Form form={form} layout="vertical" requiredMark={false} initialValues={initial??providerInitial(fallback)} onFinish={values=>void save(values)} onValuesChange={()=>setError('')}>
      {error&&<p className="amm-provider-form-error" role="alert">{error}</p>}
      {saving&&magpie&&<p className="amm-provider-form-hint" role="status">正在连接 Magpie；首次下载可能需要一些时间。</p>}
      {saving&&connect&&<p className="amm-provider-form-hint" role="status">正在准备本地代理组件并初始化配置，首次下载可能需要数十秒，请稍候…</p>}
      <Form.Item label="接入方式" name="kind" rules={[{required:true,message:'请选择接入方式'}]}>
        <Select aria-label="接入方式" options={options} virtual={false} disabled={editing} onChange={value=>{
          const next=providerInitial(providers.find(item=>item.id===value));
          form.setFieldsValue({...next,apiKey:undefined});
          setClearKey(false);
        }}/>
      </Form.Item>
      <p className="amm-provider-form-hint">{hint}</p>
      {magpie&&<Form.Item label="本机地址（可选）" name="baseUrl" rules={editing?[{required:true,whitespace:true,message:'请输入本机 Magpie 地址'}]:undefined}><Input aria-label="本机 Magpie 地址" placeholder="自动发现，例如 http://127.0.0.1:3425" maxLength={2048}/></Form.Item>}
      {custom&&<>
        <Form.Item label="显示名称" name="label" rules={[{required:true,whitespace:true,message:'请输入显示名称'}]}>
          <Input aria-label="显示名称" placeholder="例如：公司模型网关" maxLength={160}/>
        </Form.Item>
        <Form.Item label="API 协议" name="protocol" rules={[{required:true,message:'请选择 API 协议'}]}>
          <Select aria-label="API 协议" options={CUSTOM_PROVIDER_PROTOCOLS.map(item=>({value:item.value,label:item.label}))}/>
        </Form.Item>
        <Form.Item label="Base URL" name="baseUrl" rules={[{required:true,type:'url',message:'请输入有效的 Base URL'}]}>
          <Input aria-label="Base URL" placeholder="https://gateway.example.com/v1" maxLength={2048}/>
        </Form.Item>
        <Form.Item label="模型列表路径" name="modelsPath" extra={customProviderModelsUrl(baseUrl,modelsPath)}
          rules={[{pattern:/^\/(?!\/)[^\s?#]*$/,message:'请输入以 / 开头且不含空白或查询参数的相对路径'}]}>
          <Input aria-label="模型列表路径" placeholder={DEFAULT_CUSTOM_MODELS_PATH} maxLength={2048}/>
        </Form.Item>
        <p className="amm-provider-form-hint">请求地址：<span className="mono">{customProviderEndpoint(protocol,baseUrl)}</span></p>
      </>}
      {(custom||apiKey)&&<Form.Item label="API Key" name="apiKey" rules={apiKey&&!hasKey?[{required:true,whitespace:true,message:'请输入 API Key'}]:undefined}
        extra={hasKey&&!clearKey?'已保存密钥，留空保留原密钥。':custom?'端点无需认证时留空。':provider?.authentication?.description??'使用该供应商的官方 API。'}>
        <Input.Password aria-label="API Key" autoComplete="new-password" placeholder={hasKey?'已保存，留空保持不变':provider?.authentication?.placeholder??'sk-...'}/>
      </Form.Item>}
      {custom&&hasKey&&<Button size="small" onClick={()=>{form.setFieldValue('apiKey',undefined);setClearKey(value=>!value);}}>{clearKey?'保留原密钥':'清除已保存的密钥'}</Button>}
    </Form>
  </DrawerShell>;
}
