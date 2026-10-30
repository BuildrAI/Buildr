import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Popover, Spin } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { accountQuotaView, quotaOverviewAccounts } from './account-quota-view';
import type { ModelAccount } from './types';
import './account-quota-button.css';

type Props = { onClick?(): void };
/** Reads shared account snapshots only; opening this never logs in or checks all providers. */
export function AccountQuotaButton({ onClick }: Props) {
  const { api, settings } = useAgentConversations();
  const [open, setOpen] = useState(false), [accounts, setAccounts] = useState<ModelAccount[]>([]);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const dismissed = useRef(false), pointerFocus = useRef(false), entry = useRef<HTMLButtonElement>(null);
  const previewOpen = open && !settings;
  const dismiss = () => { dismissed.current = true; setOpen(false); };
  useEffect(() => {
    if (!previewOpen) return;
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const result = await api.modelAccounts(controller.signal);
        if (!controller.signal.aborted) { setAccounts(result.accounts); setError(''); }
      } catch {
        if (!controller.signal.aborted) setError('更新失败，已保留上次额度');
      } finally { pending = false; if (!controller.signal.aborted) setLoaded(true); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [api, previewOpen]);
  const visible = quotaOverviewAccounts(accounts);
  const content = <div className="ac-account-quota-overview" data-testid="account-quota-overview">
    {error && <Alert type="warning" showIcon message={error}/>}
    {!loaded && !error ? <Spin size="small"/> : !visible.length && !error ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无已登录账号，点击图标接入"/> : null}
    {visible.map(account => {
      const view = accountQuotaView(account, Date.now(), true);
      return <section key={account.id} data-account-id={account.id}>
        <strong>{account.accountLabel || account.label}</strong>
        <div>
          {view.lines.map((line, index) => <p key={index}>{line.text}</p>)}
          {(account.status === 'failed' || view.stale || account.quota?.diagnostic) && <small className="ac-account-quota-warning" title={account.quota?.diagnostic}>
            {account.status === 'failed' ? '账号待确认 · 上次额度' : view.stale ? '上次额度，非实时' : '详情见设置'}
          </small>}
        </div>
      </section>;
    })}
  </div>;
  return <Popover title="账号额度" content={content} placement="topLeft" trigger={['hover']} open={previewOpen} mouseEnterDelay={0.2} mouseLeaveDelay={0.5}
    onOpenChange={next => {
      if (next && (dismissed.current || settings)) return;
      if (!next && document.activeElement === entry.current && !pointerFocus.current) return;
      setOpen(next);
    }}>
    <Button ref={entry} type="text" className="ac-conversation-icon ac-account-settings" icon={<SettingOutlined aria-hidden="true"/>} aria-label="账号与配置"
      onFocus={() => { if (!pointerFocus.current && !dismissed.current && !settings) setOpen(true); }}
      onBlur={() => { pointerFocus.current = false; if (!settings) dismissed.current = false; setOpen(false); }}
      onPointerEnter={() => { if (!pointerFocus.current) dismissed.current = false; }}
      // As with the conversation list, cancel pointer focus and delayed hover before click.
      onPointerDown={() => { pointerFocus.current = true; dismiss(); }}
      onPointerCancel={() => { pointerFocus.current = false; }}
      onKeyDown={event => { if (event.key === 'Escape') { dismiss(); event.currentTarget.blur(); } }}
      onClick={() => { pointerFocus.current = false; dismiss(); onClick?.(); }}/>
  </Popover>;
}
