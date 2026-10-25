import {ModelAccountSettings} from './ModelAccountSettings';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Tag } from 'antd';
import { LoginOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../components/DrawerShell';
import { useAgentConversations } from './AgentConversationsContext';
import { AgentProgramPreparation } from './AgentProgramPreparation';
import { providerNames, type ConnectionView, type ProviderId, type ModelAccount } from './types';
const statusLabels = { disconnected:'已断开', connecting:'检查中', 'not-authenticated':'尚未登录', ready:'可使用', expired:'登录已过期', failed:'检查失败' };
const providers: ProviderId[] = ['codex','dsh','qoder'];
const loginWaiting = (connection?: ConnectionView) => connection?.loginAttempt && ['initializing','waiting-browser','checking'].includes(connection.loginAttempt.state);
export function AgentConnectionSettings() {
  const context = useAgentConversations();
  const [selected,setSelected] = useState<ProviderId>('codex'), [busy,setBusy] = useState(''), [error,setError] = useState('');
  const [modelAccounts,setModelAccounts]=useState<ModelAccount[]>([]);
  const [preparing,setPreparing] = useState<Record<string,boolean>>({});
  const setProgramPending = useCallback((id:string,pending:boolean)=>setPreparing(previous=>previous[id]===pending?previous:{...previous,[id]:pending}),[]);
  const programPending = preparing[selected] ?? false;
  const connection = context.connections.find(item => item.provider === selected);
  const attempt = connection?.loginAttempt;
  const act = async (name: string, operation: () => Promise<ConnectionView>) => { if (busy) return; setBusy(name); setError(''); try {context.updateConnection(await operation()); void context.refreshPending().catch(() => {});} catch(failure) {setError(failure instanceof Error ? failure.message : '操作未完成。');} finally {setBusy('');} };
  useEffect(() => {if (context.settings) void context.refreshConnections().catch(failure => setError(failure instanceof Error ? failure.message : '无法读取账号配置。'));}, [context.settings,context.refreshConnections]);
  useEffect(() => {
    if (!context.settings || !connection || !attempt || !loginWaiting(connection)) return;
    const controller = new AbortController(); let reading = false;
    const timer = setInterval(() => { if (reading) return; reading=true; void context.api.loginAttempt(connection.id,attempt.id,controller.signal).then(value => {if (!controller.signal.aborted) context.updateConnection(value);}).catch(failure => {if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '无法观察登录。');}).finally(() => {reading=false;}); },1500);
    return () => {clearInterval(timer); controller.abort();};
  },[context.settings,connection?.id,attempt?.id,attempt?.state,context.api,context.updateConnection]);
  useEffect(()=>{if(!context.settings)return;let active=true;void Promise.all([context.refreshModelCatalog(),context.api.modelAccounts()]).then(([,value])=>{if(active)setModelAccounts(value.accounts);}).catch(failure=>{if(active)setError(failure instanceof Error?failure.message:'模型发现未完成。');});return()=>{active=false;};},[context.settings,connection?.revision,context.refreshModelCatalog,context.api]);
  const source=modelAccounts.find(account=>account.connectionId===selected);
  const officialUrl = attempt?.url && /^https?:\/\//i.test(attempt.url) ? attempt.url : null;
  return <DrawerShell open={context.settings} title="智能体账号与配置" onClose={() => context.setSettings(false)} closeAriaLabel="关闭智能体账号与配置" width="min(620px, 100vw)" rootClassName="agent-conversation-settings">
    <p className="ac-subtle">账号只需登录一次，模型自动发现，可在 Codex、DSH、Qoder 中分别选择使用。</p>
    <div className="ac-provider-tabs" role="tablist" aria-label="选择智能体">{providers.map(provider => <button key={provider} type="button" role="tab" aria-selected={selected===provider} onClick={() => {setSelected(provider);setError('');}}><RobotOutlined />{providerNames[provider]}</button>)}</div>
    {error && <Alert showIcon type="warning" message={error} />}
    <section className="ac-account-section"><header><h3>{providerNames[selected]}</h3><Tag bordered={false} color={connection?.status==='ready'?'success':connection?.status==='expired'?'warning':'default'}>{connection && connection.revision!=='unconfigured' ? statusLabels[connection.status] : '尚未接入'}</Tag></header>
    {!connection?.enabled && context.connections.map(item=><div key={item.id} hidden={item.provider!==selected}><AgentProgramPreparation connection={item} onPending={setProgramPending}/></div>)}
      {connection ? <>
        <p>{connection.account?.label || '尚未确认账号'}</p>
        {connection.diagnostic && <Alert type="warning" showIcon message={connection.diagnostic} />}
        {attempt && attempt.state!=='completed' && <div className="ac-login-attempt" role="status"><strong>{loginWaiting(connection) ? '等待官方登录并检查' : attempt.state==='cancelled' ? '已取消本次登录' : attempt.state==='expired' ? '本次登录已超时' : '登录未完成'}</strong>{attempt.diagnostic && <p>{attempt.diagnostic}</p>}{officialUrl && loginWaiting(connection) && <Button href={officialUrl} target="_blank" rel="noopener noreferrer">打开官方登录页</Button>}<small>仅在实际账号检查通过后显示可使用。</small></div>}
        <div className="ac-account-actions"><Button aria-label="检查账号与接入" icon={<ReloadOutlined aria-hidden />} loading={busy==='check'} disabled={Boolean(busy)||programPending||!connection.enabled} onClick={() => void act('check',() => context.api.check(connection))}>刷新模型</Button>{loginWaiting(connection) && attempt ? <Button disabled={Boolean(busy)||programPending} onClick={() => void act('cancel',() => context.api.cancelLogin(connection,attempt.id))}>取消本次登录</Button> : connection.status!=='ready' && <Button aria-label={connection.status==='expired'?'重新登录':'官方登录'} icon={<LoginOutlined aria-hidden />} disabled={Boolean(busy)||programPending||!connection.enabled} loading={busy==='login'} onClick={() => void act('login',() => context.api.login(connection))}>{connection.status==='expired'?'重新登录':'官方登录'}</Button>}{connection.enabled && <Button disabled={Boolean(busy)||programPending} onClick={() => void act('disconnect',() => context.api.disconnect(connection))}>断开接入</Button>}</div>
        <p>{source?.status==='ready'?`${source.models.length} 个共享模型`:connection.status==='ready'?'正在发现可共享模型':'登录后自动发现模型'}</p>{source?.diagnostic&&<Alert type="warning" message={source.diagnostic}/>}
        <details className="ac-account-details"><summary>程序与连接详情</summary>{connection.enabled&&<AgentProgramPreparation connection={connection} onPending={setProgramPending}/>}<Button onClick={()=>void act('login',()=>context.api.login(connection))} disabled={Boolean(busy)||programPending||!connection.enabled}>重新登录</Button><dl><dt>使用程序</dt><dd><code>{connection.executable || (connection.status==='ready'?'已发现兼容程序（自动发现）':'按配置自动发现（待检查）')}</code></dd><dt>独立配置目录</dt><dd><code>{connection.configPath || '连接时建立'}</code></dd><dt>可用模型</dt><dd>{connection.models.map(model => model.label).join('、') || '账号检查后读取'}</dd></dl></details>
      </> : <><p>当前尚未读取到此接入，请重新读取配置。</p><Button type="primary" loading={busy==='refresh'} onClick={() => {setBusy('refresh');setError('');void context.refreshConnections().catch(failure=>setError(failure instanceof Error?failure.message:'读取失败。')).finally(()=>setBusy(''));}}>重新读取接入</Button></>}

    </section>
    <ModelAccountSettings/>
  </DrawerShell>;
}
