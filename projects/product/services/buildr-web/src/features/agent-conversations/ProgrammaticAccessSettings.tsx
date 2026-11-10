import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Checkbox,Form,Input,Select,Space,Tag,Typography} from 'antd';
import {programmaticAccessApi,type AccessScope,type ProgrammaticAccessView,type AccessCredential} from './api/programmatic-access-api';
const labels:Record<AccessScope,string>={read:'读取与观察',execute:'发起、补充与停止',answer:'回答问题',approve:'批准敏感操作'};
/** Existing settings drawer; token exists only in this mounted view, never browser storage. */
export function ProgrammaticAccessSettings(){
 const [view,setView]=useState<ProgrammaticAccessView>(),[name,setName]=useState(''),[spaces,setSpaces]=useState<string[]>([]),[scopes,setScopes]=useState<AccessScope[]>(['read','execute']);
 const [secret,setSecret]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const live=useRef(true),gate=useRef(false);
 useEffect(()=>{live.current=true;void programmaticAccessApi.read().then(value=>{if(live.current)setView(value);}).catch(e=>{if(live.current)setError(e.message);});return()=>{live.current=false;};},[]);
 async function act(work:()=>Promise<void>){if(gate.current)return;gate.current=true;setBusy(true);setError('');try{await work();}catch(e){if(live.current)setError(e instanceof Error?e.message:'操作失败');}finally{gate.current=false;if(live.current)setBusy(false);}}
 async function create(){await act(async()=>{const result=await programmaticAccessApi.create({name,workspaceIds:spaces,scopes});if(live.current){setSecret(result.token);setView(current=>current?{...current,credentials:[result.credential,...current.credentials]}:current);setName('');}});}
 async function revoke(item:AccessCredential){await act(async()=>{await programmaticAccessApi.revoke(item);const result=await programmaticAccessApi.read();if(live.current)setView(result);});}
 return <Space direction="vertical" size="middle" style={{width:'100%'}} data-testid="programmatic-access-settings">
  <Typography.Paragraph>供本机工具直接调用 Agent Service，不读取浏览器认证。凭据按工作空间授权，不是操作系统文件沙箱。GrokBot 建议只授读取和执行，问题与审批由你本人在对话中处理。</Typography.Paragraph>
  {error&&<Alert type="error" showIcon message={error}/>}
  {view&&<Card size="small" title="连接地址"><Typography.Paragraph copyable>{view.apiUrl}</Typography.Paragraph><Typography.Paragraph>发现入口即上述地址。帮助：<Typography.Text copyable>{view.documentationUrl}</Typography.Text></Typography.Paragraph><Typography.Paragraph>OpenAPI：<Typography.Text copyable>{view.openapiUrl}</Typography.Text>（均需 Bearer）</Typography.Paragraph></Card>}
  {secret&&<Card size="small" title="新凭据：仅本次显示"><Alert type="warning" message="保存到本机私有文件（权限600），不要发送到聊天或提交Git。关闭此页后无法再次查看。"/><Input.Password aria-label="新程序访问令牌" value={secret} readOnly autoComplete="off"/><Button onClick={()=>setSecret('')}>已安全保存，隐藏令牌</Button></Card>}
  <Card size="small" title="创建程序凭据"><Form layout="vertical" onFinish={()=>void create()}>
   <Form.Item label="名称"><Input aria-label="程序凭据名称" value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="例如 GrokBot"/></Form.Item>
   <Form.Item label="允许的工作空间"><Select aria-label="凭据允许的工作空间" mode="multiple" value={spaces} onChange={setSpaces} options={view?.workspaces.map(w=>({value:w.id,label:w.name}))}/></Form.Item>
   <Form.Item label="操作权限"><Checkbox.Group value={scopes} onChange={value=>setScopes([...new Set(['read',...value] as AccessScope[])])} options={Object.entries(labels).map(([value,label])=>({value,label,disabled:value==='read'}))}/></Form.Item>
   {(scopes.includes('answer')||scopes.includes('approve'))&&<Alert type="warning" message="此权限允许程序代答问题或审批。仅在你明确希望自动化处理时授予。"/>}
   <Button htmlType="submit" type="primary" loading={busy} disabled={!name.trim()||!spaces.length||!!secret}>创建凭据</Button>
  </Form></Card>
  {view?.credentials.map(item=><Card size="small" key={item.id} title={<Space>{item.name}<Tag>{item.revokedAt?'已撤销':'有效'}</Tag></Space>} extra={<Button danger disabled={!!item.revokedAt||busy} onClick={()=>void revoke(item)}>撤销</Button>}><Typography.Paragraph>{item.scopes.map(scope=>labels[scope]).join('、')}</Typography.Paragraph><Typography.Paragraph>{item.workspaceIds.map(id=>view.workspaces.find(w=>w.id===id)?.name??id).join('、')}</Typography.Paragraph><Typography.Text type="secondary">{item.id} · {item.createdAt}</Typography.Text></Card>)}
 </Space>;
}
