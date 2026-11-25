import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Popover, Spin } from 'antd';
import { DashboardOutlined, ExportOutlined, SettingOutlined } from '@ant-design/icons';
import { useAgentConversations } from './AgentConversationsContext.tsx';
import {
  accountBillingLink,
  accountQuotaView,
  accountQuotaWarning,
  accountSourceName,
  compareSourceNames,
  formatQuotaPercent,
  groupQuotaWindows,
  magpieQuotaOverviewGroups,
  quotaOverviewAccounts,
  quotaOverviewSections,
  quotaResetCountdown,
  type GatewayQuotaSnapshot,
  type MagpieQuotaOverviewGroup,
} from './account-quota-view.ts';
import { useGoogleAccountRefresh } from './useGoogleAccountRefresh.ts';
import type { ModelAccount } from './types.ts';
import './account-quota-button.css';

type Props = { onClick?(): void; dedicated?:boolean };
type MagpieQuotaState = { revision: string; status: 'loading' | 'ready' | 'failed'; snapshot?: GatewayQuotaSnapshot };
type OverviewEntry =
  | { kind: 'standard'; key: string; sortName: string; subSort: string; account: ModelAccount }
  | { kind: 'magpie-group'; key: string; sortName: string; subSort: string; account: ModelAccount; group: MagpieQuotaOverviewGroup; snapshot: GatewayQuotaSnapshot; staleError: boolean }
  | { kind: 'magpie-fallback'; key: string; sortName: string; subSort: string; account: ModelAccount; status: 'loading' | 'empty' | 'failed' };

/** Shows the cached overview first, with a bounded Google-only refresh while visible. */
export function AccountQuotaButton({ onClick, dedicated=false }: Props) {
  const { api, settings, full, side } = useAgentConversations();
  const [open, setOpen] = useState(false), [accounts, setAccounts] = useState<ModelAccount[]>([]);
  const [magpieQuotas, setMagpieQuotas] = useState<Record<string, MagpieQuotaState>>({});
  const [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const dismissed = useRef(false), pointerFocus = useRef(false), entry = useRef<HTMLButtonElement>(null);
  const previewOpen = open && !settings;
  const refreshSnapshot = useRef<() => Promise<void>>(async () => {});
  const [googleRefreshFailed, setGoogleRefreshFailed] = useState(false);
  useGoogleAccountRefresh(previewOpen, api, () => { setGoogleRefreshFailed(false); void refreshSnapshot.current(); }, () => setGoogleRefreshFailed(true));
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
        if (controller.signal.aborted) return;
        setAccounts(result.accounts);
        setError('');
        setLoaded(true);
        const magpieAccounts = quotaOverviewAccounts(result.accounts).filter(
          account => account.provider === 'magpie' && account.enabled && account.sourceEnabled !== false,
        );
        const activeIds = new Set(magpieAccounts.map(account => account.id));
        setMagpieQuotas(current => {
          const next: Record<string, MagpieQuotaState> = {};
          for (const [id, state] of Object.entries(current)) {
            if (activeIds.has(id)) next[id] = state;
          }
          for (const account of magpieAccounts) {
            if (!next[account.id]) next[account.id] = { revision: account.revision, status: 'loading' };
          }
          return next;
        });
        if (magpieAccounts.length && typeof api.modelGatewayQuota === 'function') {
          const reads = await Promise.allSettled(
            magpieAccounts.map(async account => ({
              id: account.id,
              revision: account.revision,
              snapshot: await api.modelGatewayQuota(account.id, account.revision, controller.signal),
            })),
          );
          if (!controller.signal.aborted) {
            setMagpieQuotas(current => {
              const next = { ...current };
              for (const [index, outcome] of reads.entries()) {
                const target = magpieAccounts[index]!;
                if (outcome.status === 'fulfilled') {
                  next[target.id] = { revision: outcome.value.revision, status: 'ready', snapshot: outcome.value.snapshot };
                } else {
                  const prior = next[target.id];
                  next[target.id] = { revision: target.revision, status: 'failed', ...(prior?.snapshot ? { snapshot: prior.snapshot } : {}) };
                }
              }
              return next;
            });
          }
        }
      } catch {
        if (!controller.signal.aborted) setError('更新失败，已保留上次额度');
      } finally { pending = false; if (!controller.signal.aborted) setLoaded(true); }
    };
    refreshSnapshot.current = refresh;
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [api, previewOpen]);

  const visible = quotaOverviewAccounts(accounts);
  const overviewEntries: OverviewEntry[] = [];
  for (const account of visible) {
    if (account.provider === 'magpie') {
      const state = magpieQuotas[account.id];
      if (state?.snapshot && state.snapshot.accounts.length > 0) {
        for (const group of magpieQuotaOverviewGroups(state.snapshot)) {
          overviewEntries.push({
            kind: 'magpie-group',
            key: `${account.id}::${group.provider}`,
            sortName: group.label,
            subSort: group.provider,
            account,
            group,
            snapshot: state.snapshot,
            staleError: state.status === 'failed',
          });
        }
      } else {
        const initialLoading = !state && account.enabled && account.sourceEnabled !== false && typeof api.modelGatewayQuota === 'function';
        const status = state?.status === 'loading' || initialLoading ? 'loading' : state?.status === 'ready' ? 'empty' : 'failed';
        overviewEntries.push({
          kind: 'magpie-fallback',
          key: account.id,
          sortName: accountSourceName(account),
          subSort: account.accountLabel || account.label,
          account,
          status,
        });
      }
      continue;
    }
    overviewEntries.push({
      kind: 'standard',
      key: account.id,
      sortName: accountSourceName(account),
      subSort: account.accountLabel || account.label,
      account,
    });
  }
  overviewEntries.sort((left, right) =>
    compareSourceNames(left.sortName, right.sortName)
    || compareSourceNames(left.subSort, right.subSort)
    || left.key.localeCompare(right.key),
  );

  const { standard, magpie } = quotaOverviewSections(overviewEntries);
  const renderEntry = (item: OverviewEntry) => {
    if (item.kind === 'magpie-group') {
      const { account, group, snapshot, staleError } = item;
      const single = group.accounts.length === 1;
      const singleAccount = single ? group.accounts[0]! : undefined;
      const singlePlan = singleAccount?.plan;
      const observed = singleAccount?.observedAt ?? snapshot.readAt;
      const observedText = observed ? new Date(observed).toLocaleString() : '尚未读取';
      return <section key={item.key} className="is-grouped" data-account-id={account.id} data-magpie-provider={group.provider} title={`额度最近更新：${observedText}`}>
        <header>
          <strong>{group.provider === 'magpie' && group.label === 'Magpie' ? '网关额度' : group.label}</strong>
          {singlePlan && <small className="ac-account-quota-meta" title={singlePlan}>{singlePlan}</small>}
        </header>
        {group.accounts.map((acc, index) => <div className="ac-account-quota-rows" key={index}>
          {!single && <strong className="ac-account-quota-group">{[`账号 ${index + 1}`, acc.plan].filter(Boolean).join(' · ')}</strong>}
          {acc.balance && <div className="ac-account-quota-row">
            <span className="ac-account-quota-label">余额</span>
            <span className="ac-account-quota-value">{acc.balance}</span>
          </div>}
          {acc.windows.map((window, windowIndex) => <div className="ac-account-quota-row" key={windowIndex}>
            <span className="ac-account-quota-label">
              {window.label}
              {window.resetsAt && <small className="ac-account-quota-reset" title={new Date(window.resetsAt).toLocaleString()}>{quotaResetCountdown(window.resetsAt)}</small>}
            </span>
            <span className="ac-account-quota-value">
              {window.remainingPercent === undefined ? '剩余未知' : `剩余 ${formatQuotaPercent(window.remainingPercent)}%`}
            </span>
          </div>)}
          {!acc.balance && !acc.windows.length && <div className="ac-account-quota-row">
            <span className="ac-account-quota-label">暂无额度记录</span>
            <span className="ac-account-quota-value">未知</span>
          </div>}
          {acc.unavailable && <small className="ac-account-quota-warning">上游读取未完成，所列值仅供参考</small>}
        </div>)}
        {staleError && <small className="ac-account-quota-warning">本次额度未能更新，显示上次观察</small>}
      </section>;
    }
    if (item.kind === 'magpie-fallback') {
      const text = item.status === 'loading' ? '正在读取额度…' : item.status === 'empty' ? '尚无额度记录' : '额度暂不可读取';
      return <section key={item.key} data-account-id={item.account.id}>
        <strong>{item.sortName === 'Magpie' ? '网关额度' : item.sortName}</strong>
        <div className="ac-account-quota-value"><p>{text}</p></div>
      </section>;
    }
    const account = item.account;
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
              {line.resetsAt && <small className="ac-account-quota-reset" title={new Date(line.resetsAt).toLocaleString()}>{quotaResetCountdown(line.resetsAt)}</small>}
            </span>
            <span className="ac-account-quota-value">
              {line.percent === undefined ? line.text : `剩余 ${formatQuotaPercent(line.percent)}%`}
              {line.credits && <span className="ac-account-quota-credits">· {line.credits}</span>}
            </span>
          </div>)}
        </div>)}
        {warning && <small className="ac-account-quota-warning" title={account.quota?.diagnostic}>{warning}</small>}
      </> : <>
        <strong>{name}</strong>
        <div className="ac-account-quota-value">
          {billing ? <Button type="default" size="small" href={billing.url} data-harness-web-link target="_blank" rel="noopener noreferrer" icon={<ExportOutlined/>} title={billing.label}>{billing.label}</Button>
            : view.lines.map((line, index) => <p key={index}>{line.text}{line.resetsAt && <small className="ac-account-quota-reset" title={new Date(line.resetsAt).toLocaleString()}>{quotaResetCountdown(line.resetsAt)}</small>}{line.credits && <span className="ac-account-quota-credits">· {line.credits}</span>}</p>)}
          {warning && <small className="ac-account-quota-warning" title={account.quota?.diagnostic}>{warning}</small>}
        </div>
      </>}
    </section>;
  };

  const content = <div className="ac-account-quota-overview" data-testid="account-quota-overview">
    {error && <Alert type="warning" showIcon message={error}/>}
    {googleRefreshFailed && <Alert type="warning" showIcon message="Google AI 刷新未完成，保留上次额度"/>}
    {!loaded && !error ? <Spin size="small"/> : !overviewEntries.length && !error ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无已接入的供应商，点击图标接入"/> : null}
    {standard.map(renderEntry)}
    {magpie.length > 0 && <div className="ac-account-quota-magpie" role="group" aria-label="Magpie">
      <strong className="ac-account-quota-magpie-title">Magpie</strong>
      {magpie.map(renderEntry)}
    </div>}
  </div>;
  return <Popover title="供应商额度" content={content} placement={full || side === 'left' ? 'topLeft' : 'topRight'} trigger={['hover']} open={previewOpen} mouseEnterDelay={0.2} mouseLeaveDelay={0.5}
    onOpenChange={next => {
      if (next && (dismissed.current || settings)) return;
      if (!next && document.activeElement === entry.current && !pointerFocus.current) return;
      setOpen(next);
    }}>
    <Button ref={entry} type="text" className={'ac-conversation-icon '+(dedicated?'ac-quota-entry':'ac-account-settings')} icon={dedicated?<DashboardOutlined aria-hidden="true"/>:<SettingOutlined aria-hidden="true"/>} aria-label={dedicated?'供应商额度':'设置'}
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
