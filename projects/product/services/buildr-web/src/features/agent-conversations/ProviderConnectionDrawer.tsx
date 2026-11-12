import {useState} from 'react';
import {Button,Form,Input,Select,Space} from 'antd';
import {DrawerShell} from '../../components/DrawerShell';
import {CUSTOM_PROVIDER_PROTOCOLS,customProviderEndpoint,customProviderModelsUrl,DEFAULT_CUSTOM_MODELS_PATH,type CustomProviderProtocol} from './custom-provider-model';

export type ProviderConnectionKind='openai'|'deepseek-api'|'custom';
export interface ProviderConnectionInput {
  kind:ProviderConnectionKind;
  accountId?:string;
  label:string;
  baseUrl?:string;
  protocol?:CustomProviderProtocol;
  modelsPath?:string;
  useApiKey?:boolean;
  apiKey?:string;
}
export interface ProviderConnectionInitial extends ProviderConnectionInput {
  credentialConfigured?:boolean;
}

const presets=[
  {value:'openai' as const,label:'ChatGPT API',description:'使用 OpenAI 官方 API Key，只需填写密钥。'},
  {value:'deepseek-api' as const,label:'DeepSeek API',description:'使用 DeepSeek 官方 API Key，通过 OpenAI 兼容协议读取模型。'},
  {value:'custom' as const,label:'其他自定义供应商',description:'配置显示名称、协议、Base URL 和模型列表路径。'},
];

function presetInitial(kind:ProviderConnectionKind):ProviderConnectionInitial {
  if(kind==='openai')return {kind,label:'ChatGPT API',useApiKey:true};
  if(kind==='deepseek-api')return {kind,label:'DeepSeek API',baseUrl:'https://api.deepseek.com',protocol:'chat-completions',modelsPath:DEFAULT_CUSTOM_MODELS_PATH,useApiKey:true};
  return {kind:'custom',label:'',baseUrl:'',protocol:'chat-completions',modelsPath:DEFAULT_CUSTOM_MODELS_PATH,useApiKey:false};
}

type Props={
  open:boolean;
  initial?:ProviderConnectionInitial;
  configuredPresets?:ProviderConnectionKind[];
  busy?:boolean;
  onClose():void;
  onSave(input:ProviderConnectionInput):Promise<void>;
};

/** Provider onboarding shared by presets and user-declared endpoints; credentials never echo stored values. */
export function ProviderConnectionDrawer({open,initial,configuredPresets=[],busy,onClose,onSave}:Props){
  const [form]=Form.useForm<ProviderConnectionInput>();
  const kind=Form.useWatch('kind',form)??initial?.kind??'custom';
  const [clearKey,setClearKey]=useState(false);
  const baseUrl=Form.useWatch('baseUrl',form)??initial?.baseUrl??'';
  const protocol=Form.useWatch('protocol',form)??initial?.protocol??'chat-completions';
  const modelsPath=Form.useWatch('modelsPath',form)??initial?.modelsPath??DEFAULT_CUSTOM_MODELS_PATH;
  const editing=Boolean(initial?.accountId);
  const custom=kind==='custom';
  const hasKey=Boolean(initial?.credentialConfigured&&initial.kind===kind);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const locked=Boolean(busy)||saving;
  const options=presets.map(preset=>({value:preset.value,label:preset.label,disabled:!editing&&configuredPresets.includes(preset.value)&&preset.value!==initial?.kind}));

  async function save(values:ProviderConnectionInput){
    if(locked)return;
    setSaving(true);setError('');
    try{
      const next:ProviderConnectionInput=values.kind==='custom'
        ?{kind:'custom',...(values.accountId?{accountId:values.accountId}:{}),label:values.label.trim(),baseUrl:values.baseUrl?.trim(),protocol:values.protocol,modelsPath:values.modelsPath?.trim()||DEFAULT_CUSTOM_MODELS_PATH,useApiKey:Boolean(values.apiKey?.trim()||(hasKey&&!clearKey)),...(values.apiKey?.trim()?{apiKey:values.apiKey.trim()}:{})}
        :{...presetInitial(values.kind),label:presets.find(preset=>preset.value===values.kind)!.label,...(values.apiKey?.trim()?{apiKey:values.apiKey.trim()}:{})};
      await onSave(next);
    }catch(failure){setError(failure instanceof Error?failure.message:'供应商接入未完成。');}
    finally{setSaving(false);}
  }

  return <DrawerShell open={open} title={editing?'编辑自定义供应商':'添加供应商'} onClose={onClose} closeAriaLabel="关闭供应商配置"
    width="min(460px,100vw)" footer={<Space><Button disabled={saving} onClick={onClose}>取消</Button><Button type="primary" loading={saving} disabled={Boolean(busy)} onClick={()=>form.submit()}>保存供应商</Button></Space>}>
    <Form form={form} layout="vertical" requiredMark={false} initialValues={initial??presetInitial(kind)} onFinish={save} onValuesChange={()=>setError('')}>
      {error&&<p className="amm-provider-form-error" role="alert">{error}</p>}
      <Form.Item label="接入方式" name="kind" rules={[{required:true,message:'请选择接入方式'}]}>
        <Select aria-label="接入方式" options={options} disabled={editing} onChange={value=>{
          const next=presetInitial(value);
          form.setFieldsValue({...next,apiKey:undefined});
          setClearKey(false);
        }}/>
      </Form.Item>
      {!custom&&<p className="amm-provider-form-hint">{presets.find(preset=>preset.value===kind)?.description}</p>}
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
      <Form.Item label="API Key" name="apiKey" rules={!custom&&!hasKey?[{required:true,whitespace:true,message:'请输入 API Key'}]:undefined}
        extra={hasKey&&!clearKey?'已保存密钥，留空保留原密钥。':custom?'端点无需认证时留空。':'使用该供应商的官方 API。'}>
        <Input.Password aria-label="API Key" autoComplete="new-password" placeholder={hasKey?'已保存，留空保持不变':'sk-...'}/>
      </Form.Item>
      {custom&&hasKey&&<Button size="small" onClick={()=>{form.setFieldValue('apiKey',undefined);setClearKey(value=>!value);}}>{clearKey?'保留原密钥':'清除已保存的密钥'}</Button>}
    </Form>
  </DrawerShell>;
}
