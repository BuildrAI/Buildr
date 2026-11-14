import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Popover, Spin } from 'antd';
import { ExportOutlined, SettingOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext';
import { accountBillingLink, groupQuotaWindows, accountQuotaView, accountQuotaWarning, accountSourceName, quotaOverviewAccounts } from './account-quota-view';
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
    {!loaded && !error ? <Spin size="small"/> : !visible.length && !error ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无已接入的供应商，点击图标接入"/> : null}
    {visible.map(account => {
      const view = accountQuotaView(account, Date.now(), true), warning = accountQuotaWarning(account);
      const billing = account.quota?.available ? undefined : accountBillingLink(account);
      const grouped = view.lines.length > 1;
      const name = accountSourceName(account);
      const groups = groupQuotaWindows(view.lines);
      // 缓存额度直接展示；观察时间保留在悬停标题，不额外提示非实时。
      return <section key={account.id} className={grouped ? 'is-grouped' : undefined} data-account-id={account.id} title={`额度最近更新：${view.observedLabel}`}>
        {grouped ? <>
          <header><strong>{name}</strong></header>
          {[...groups].map(([title, lines]) => <div className="ac-account-quota-rows" key={title ?? 'windows'}>
            {title && <strong className="ac-account-quota-group">{title}</strong>}
            {lines.map((line, index) => <div className="ac-account-quota-row" key={index}>
              <span className="ac-account-quota-label">
                {line.label ?? line.text}
                {line.resetsAt && <small className="ac-account-quota-reset">重置于 {new Date(line.resetsAt).toLocaleString()}</small>}
              </span>
              <span className="ac-account-quota-value">
                {line.percent === undefined ? line.text : `剩余 ${line.percent}%`}
                {line.credits && <span className="ac-account-quota-credits">· {line.credits}</span>}
              </span>
            </div>)}
          </div>)}
          {warning && <small className="ac-account-quota-warning" title={account.quota?.diagnostic}>{warning}</small>}
        </> : <>
          <strong>{name}</strong>
          <div className="ac-account-quota-value">
            {billing ? <Button type="default" size="small" href={billing.url} target="_blank" rel="noopener noreferrer" icon={<ExportOutlined/>} title={billing.label}>{billing.label}</Button>
              : view.lines.map((line, index) => <p key={index}>{line.text}{line.credits && <span className="ac-account-quota-credits">· {line.credits}</span>}</p>)}
            {warning && <small className="ac-account-quota-warning" title={account.quota?.diagnostic}>{warning}</small>}
          </div>
        </>}
      </section>;
    })}
  </div>;
  return <Popover title="供应商额度" content={content} placement="topLeft" trigger={['hover']} open={previewOpen} mouseEnterDelay={0.2} mouseLeaveDelay={0.5}
    onOpenChange={next => {
      if (next && (dismissed.current || settings)) return;
      if (!next && document.activeElement === entry.current && !pointerFocus.current) return;
      setOpen(next);
    }}>
    <Button ref={entry} type="text" className="ac-conversation-icon ac-account-settings" icon={<SettingOutlined aria-hidden="true"/>} aria-label="智能体与模型设置"
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
