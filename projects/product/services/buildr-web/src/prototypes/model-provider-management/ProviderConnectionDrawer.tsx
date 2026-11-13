import {useState} from 'react';
import {Button, Form, Input, Select, Space} from 'antd';
import {DrawerShell} from '../../components/DrawerShell';
import {CUSTOM_PROVIDER_PROTOCOLS, type CustomProviderProtocol} from '../../features/agent-conversations/custom-provider-model';

export const apiPresets = [
  {value:'openai',label:'ChatGPT API'},
  {value:'deepseek-api',label:'DeepSeek API'},
] as const;

type Preset = typeof apiPresets[number]['value'];
export type ProviderConnection = {
  kind: Preset | 'custom';
  label: string;
  baseUrl?: string;
  protocol?: CustomProviderProtocol;
  modelsPath?: string;
  credentialConfigured: boolean;
};
type Fields = Omit<ProviderConnection, 'credentialConfigured'> & {apiKey?: string};

export function ProviderConnectionDrawer({initial, configuredPresets, existingConnections, onClose, onSave}: {
  initial?: ProviderConnection;
  configuredPresets: string[];
  existingConnections: ProviderConnection[];
  onClose(): void;
  onSave(connection: ProviderConnection): void;
}) {
  const [form] = Form.useForm<Fields>();
  const [clearKey,setClearKey] = useState(false);
  const kind = Form.useWatch('kind',form) ?? initial?.kind ?? 'custom';
  const custom = kind === 'custom';
  const hasKey = initial?.credentialConfigured && initial.kind === kind;
  const options = [
    ...apiPresets.map(preset => ({...preset,disabled:configuredPresets.includes(preset.value) && preset.value !== initial?.kind,label:configuredPresets.includes(preset.value) && preset.value !== initial?.kind ? preset.label+'（已接入）' : preset.label})),
    {value:'custom',label:'自定义供应商'},
  ];

  function save(values: Fields) {
    const credentialConfigured = Boolean(values.apiKey?.trim() || (hasKey && !clearKey));
    if (values.kind !== 'custom') {
      const preset = apiPresets.find(option => option.value === values.kind)!;
      onSave({kind:preset.value,label:preset.label,credentialConfigured});
      return;
    }
    const baseUrl = values.baseUrl?.trim().replace(/\/+$/, '');
    if(existingConnections.some(connection=>connection.kind==='custom' && connection.baseUrl?.replace(/\/+$/, '')===baseUrl && connection.protocol===values.protocol)){
      form.setFields([{name:'baseUrl',errors:['该端点与协议已接入，请编辑已有供应商。']}]);
      return;
    }
    onSave({
      kind:'custom',
      label:values.label.trim(),
      baseUrl,
      protocol:values.protocol,
      modelsPath:values.modelsPath?.trim() || '/models',
      credentialConfigured,
    });
  }

  return <DrawerShell open title={initial ? '编辑自定义供应商' : '添加供应商'} onClose={onClose}
    width="min(440px, 100vw)" closeAriaLabel="关闭供应商配置"
    footer={<Space><Button onClick={onClose}>取消</Button><Button type="primary" onClick={()=>form.submit()}>保存供应商</Button></Space>}>
    <Form name="provider-connection" form={form} layout="vertical" requiredMark={false} initialValues={initial ?? {kind:'custom',protocol:'chat-completions'}} onFinish={save}>
      <Form.Item label="供应商名称" name="kind" rules={[{required:true,message:'请选择供应商'}]}>
        <Select options={options} placeholder="选择供应商" disabled={Boolean(initial)} onChange={()=>form.resetFields(['apiKey'])}/>
      </Form.Item>
      {custom && <>
        <Form.Item label="显示名称" name="label" rules={[{required:true,whitespace:true,message:'请输入显示名称'}]}>
          <Input placeholder="例如：公司模型网关"/>
        </Form.Item>
        <Form.Item label="API 协议" name="protocol" rules={[{required:true,message:'请选择 API 协议'}]}>
          <Select options={[...CUSTOM_PROVIDER_PROTOCOLS]}/>
        </Form.Item>
        <Form.Item label="Base URL" name="baseUrl" rules={[{required:true,type:'url',message:'请输入有效的 Base URL'}]}>
          <Input placeholder="https://gateway.example.com/v1"/>
        </Form.Item>
        <Form.Item label="模型列表路径" name="modelsPath" extra="相对于 Base URL，用于在「模型」页读取模型列表。"
          rules={[{pattern:/^\/(?!\/)[^\s]*$/,message:'请输入以 / 开头的相对路径'}]}>
          <Input placeholder="/models"/>
        </Form.Item>
      </>}
      {kind && <Form.Item label="API Key" name="apiKey" rules={!custom && !hasKey ? [{required:true,whitespace:true,message:'请输入 API Key'}] : undefined}
        extra={hasKey && !clearKey ? '已保存密钥，留空保留原密钥。' : custom ? '端点无需认证时留空。' : '使用该供应商的官方 API。'}>
        <Input.Password autoComplete="new-password"/>
      </Form.Item>}
      {custom && hasKey && <Button size="small" onClick={()=>{form.resetFields(['apiKey']);setClearKey(value=>!value);}}>{clearKey?'保留原密钥':'清除已保存的密钥'}</Button>}
    </Form>
  </DrawerShell>;
}
