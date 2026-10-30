import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Popover, Spin } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { accountQuotaView, quotaOverviewAccounts } from './account-quota-view';
import type { ModelAccount } from './types';
import './account-quota-button.css';

type Props = { onClick?(): void };
/** Reads shared account snapshots only; opening this never logs in or checks all providers. */
export function AccountQuotaButton({ onClick }: Props) {
  const { api } = useAgentConversations();
  const [open, setOpen] = useState(false), [accounts, setAccounts] = useState<ModelAccount[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true; setLoading(true);
      try {
        const result = await api.modelAccounts(controller.signal);
        if (!controller.signal.aborted) { setAccounts(result.accounts); setError(''); }
      } catch {
        if (!controller.signal.aborted) setError('账号额度读取失败，已保留上次观察；点击图标可前往设置重新读取。');
      } finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [api, open]);
  const visible = quotaOverviewAccounts(accounts);
  const content = <div className="ac-account-quota-overview" data-testid="account-quota-overview" aria-live="polite">
    {error && <Alert type="warning" showIcon message={error}/>}
    {loading && !visible.length ? <Spin size="small" tip="读取账号额度"/> : !visible.length && !error ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无已登录账号，点击图标接入"/> : null}
    {visible.map(account => {
      const view = accountQuotaView(account);
      return <section key={account.id} data-account-id={account.id}>
        <header><strong>{account.accountLabel || account.label}</strong><span>{account.label}</span></header>
        {account.status === 'failed' && <p className="ac-account-quota-warning">账号状态未确认，以下为上次观察</p>}
        {(error || view.stale) && <p className="ac-account-quota-warning">上次观察，非实时余额</p>}
        {view.lines.map((line, index) => <p key={index}>{line.text}{line.resetsAt && <small>{new Date(line.resetsAt).toLocaleString()} 重置</small>}</p>)}
        <small>观察时间 · {view.observedLabel}</small>
        {account.quota?.diagnostic && <p className="ac-account-quota-warning">{account.quota.diagnostic}</p>}
      </section>;
    })}
  </div>;
  return <Popover title="已登录账号可用额度" content={content} placement="topLeft" trigger={['hover', 'focus']} open={open} onOpenChange={setOpen} mouseEnterDelay={0.2}>
    <Button type="text" className="ac-conversation-icon ac-account-settings" icon={<SettingOutlined aria-hidden="true"/>} aria-label="账号与配置" onClick={() => { setOpen(false); onClick?.(); }}/>
  </Popover>;
}
