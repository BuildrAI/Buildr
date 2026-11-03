import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Form,Input,Space,Switch,Tag,Typography} from 'antd';
import {EyeInvisibleOutlined,EyeOutlined,ReloadOutlined} from '@ant-design/icons';
import {useAgentConversations} from './AgentConversationsContext';
import type {WebhookSettingsView} from './types';

const labels={unconfigured:'未配置',invalid:'配置无效',disabled:'已停用',enabled:'已启用'};
const sources={'private-file':'本机私有配置','external-file':'外部指定文件',environment:'兼容环境变量'};
/** Mounted only while the settings drawer is open; secrets never outlive this view. */
export function WebhookSettings(){
 const {api}=useAgentConversations();
 const [view,setView]=useState<WebhookSettingsView>(),[url,setUrl]=useState(''),[enabled,setEnabled]=useState(true),[secret,setSecret]=useState(''),[revealed,setRevealed]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const epoch=useRef(0),gate=useRef(false);
 const apply=(next:WebhookSettingsView)=>{setView(next);setUrl(next.url);setEnabled(next.state==='enabled'||next.state==='unconfigured');setSecret('');setRevealed(null);};
 useEffect(()=>{const controller=new AbortController();const generation=++epoch.current;void api.webhookSettings(controller.signal).then(next=>{if(epoch.current===generation)apply(next);}).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'配置读取失败。');});return()=>{epoch.current++;controller.abort();};},[api]);
 const run=async(operation:(current:()=>boolean)=>Promise<void>)=>{if(gate.current)return;gate.current=true;setBusy(true);setError('');setNotice('');const generation=epoch.current;try{await operation(()=>epoch.current===generation);}catch(failure){if(epoch.current===generation){setRevealed(null);setError(failure instanceof Error?failure.message:'操作未完成。');}}finally{gate.current=false;if(epoch.current===generation)setBusy(false);}};
 const dirty=!!view&&(url!==view.url||secret!==''||enabled!==(view.state==='enabled'||view.state==='unconfigured'));
 return <Card title={<Space>事件通知 / Webhook {view&&<Tag color={view.state==='enabled'?'success':view.state==='invalid'?'error':'default'}>{labels[view.state]}</Tag>}</Space>} id="agent-webhook-settings" extra={<Button aria-label="重新读取通知配置" icon={<ReloadOutlined/>} disabled={busy} onClick={()=>void run(async current=>{const next=await api.webhookSettings();if(current())apply(next);})}/> }>
 <Typography.Paragraph type="secondary">管理当前本机 Agent Service，适用于所有工作空间。保存后生效，不会自动发送测试通知。</Typography.Paragraph>
 {error&&<Alert type="error" showIcon message={error} style={{marginBottom:16}}/>}
 {notice&&<Alert type="success" showIcon message={notice} style={{marginBottom:16}}/>}
 {view&&<><Typography.Paragraph type="secondary">配置来源：{sources[view.source]}。{!view.writable?'当前由外部管理或文件不安全，此处只读；请在来源处修改后重新读取。':'配置仅保存在本机私有文件，不进入工作空间或 Git。'}</Typography.Paragraph>
 <Form layout="vertical" onFinish={()=>void run(async current=>{const next=await api.saveWebhookSettings({expectedRevision:view.revision,url,enabled,...(secret?{secret}:{})});if(current()){apply(next);setNotice('通知配置已保存并生效。');}})}>
 <Form.Item label="启用事件通知"><Switch checked={enabled} disabled={!view.writable||busy} onChange={setEnabled}/></Form.Item>
 <Form.Item label="接收地址"><Input id="agent-webhook-url" value={url} maxLength={8192} placeholder="https://example.com/webhook" disabled={!view.writable||busy} onChange={event=>setUrl(event.target.value)}/></Form.Item>
 <Form.Item label="当前密钥" extra="默认隐藏；仅点击查看时读取，隐藏或关闭设置后清除明文。">
 <Space.Compact block><Input id="agent-webhook-secret" readOnly value={revealed??(view.hasSecret?'••••••••':'未设置')} autoComplete="off"/><Button aria-label={revealed===null?'查看通知密钥':'隐藏通知密钥'} icon={revealed===null?<EyeOutlined/>:<EyeInvisibleOutlined/>} disabled={!view.hasSecret||busy} onClick={()=>{if(revealed!==null){setRevealed(null);return;}void run(async current=>{const result=await api.revealWebhookSecret(view.revision);if(current())setRevealed(result.secret);});}}>{revealed===null?'查看':'隐藏'}</Button></Space.Compact>
 </Form.Item>
 {view.writable&&<Form.Item label={view.hasSecret?'更换密钥':'设置密钥'} extra={view.hasSecret?'留空保留现有密钥，不会清除。':'首次启用必须设置密钥。'}><Input.Password id="agent-webhook-new-secret" value={secret} maxLength={4096} autoComplete="new-password" disabled={busy} onChange={event=>setSecret(event.target.value)}/></Form.Item>}
 <Space wrap>{view.writable&&<Button type="primary" htmlType="submit" loading={busy} disabled={!dirty}>保存配置</Button>}<Button disabled={busy||dirty||view.state!=='enabled'} onClick={()=>void run(async current=>{setRevealed(null);const result=await api.testWebhook(view.revision);if(current()){setView(previous=>previous?{...previous,lastDelivery:result}:previous);if(result.success)setNotice('测试通知已成功送达。');else setError('测试通知未确认送达，请核对接收端；本次测试不会自动重试。');}})}>发送测试通知</Button></Space>
 {dirty&&<Typography.Paragraph type="secondary">请先保存配置，再发送测试通知。</Typography.Paragraph>}
 </Form>
 <Typography.Paragraph style={{marginTop:16}} type="secondary">最近投递（当前服务进程）：{view.lastDelivery?`${view.lastDelivery.kind==='test'?'测试':'事件'} · ${view.lastDelivery.success?'成功':'失败'}${view.lastDelivery.status?`（HTTP ${view.lastDelivery.status}）`:''} · ${new Date(view.lastDelivery.at).toLocaleString()}`:'暂无记录'}。重新读取可刷新。</Typography.Paragraph>
 </>}
 </Card>;
}
