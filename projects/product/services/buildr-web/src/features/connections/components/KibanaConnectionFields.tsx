import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Input, Select, Space } from 'antd';
import type { ConnectionClient } from '../api/connection-api';
import type { ConnectionTestInput, KibanaDataViewsResult } from '../connection-types';
import type { KibanaConnectionDraft } from '../kibana-connection-form';
import type { ConnectionRequestScope } from '../connection-request-scope';

type Props = {
  draft: KibanaConnectionDraft; disabled: boolean; requestVersion: number; requestScope: ConnectionRequestScope;
  client: ConnectionClient; input(): ConnectionTestInput; children: ReactNode;
  onChange<K extends keyof KibanaConnectionDraft>(field: K, value: KibanaConnectionDraft[K]): void;
};

export function KibanaConnectionFields({ draft, disabled, requestVersion, requestScope, client, input, onChange, children }: Props) {
  const [views, setViews] = useState<KibanaDataViewsResult>(), [viewName, setViewName] = useState('');
  const [discovering, setDiscovering] = useState(false), [error, setError] = useState('');
  useEffect(() => { setDiscovering(false); }, [requestVersion]);
  useEffect(() => { setViews(undefined); setError(''); }, [draft.consoleUrl, draft.username, draft.password]);
  useEffect(() => () => requestScope.invalidate(), [requestScope]);

  async function discover(offset = 0) {
    const request = requestScope.begin();
    try {
      const value = input(); setDiscovering(true); setError('');
      const result = await client.discoverKibanaViews({ ...value, viewName: viewName.trim() || undefined, offset, limit: 100 }, request.signal);
      if (request.isCurrent()) setViews(result);
    } catch (cause) {
      if (request.isCurrent()) { setViews(undefined); setError(cause instanceof Error ? cause.message : '数据视图（Data View）读取失败。'); }
    } finally { if (request.isCurrent()) setDiscovering(false); }
  }

  const options = (views?.dataViews || []).map(view => ({ value: view.id, label: `${view.name || view.title} · ${view.id}` }));
  if (draft.dataViewId && !options.some(option => option.value === draft.dataViewId)) options.unshift({ value: draft.dataViewId, label: `已选编号：${draft.dataViewId}（未在本次结果中）` });
  return <div className="buildr-kibana-fields">
    <label>网站地址<Input id="kibana-connection-url" aria-label="Kibana 网站地址" value={draft.consoleUrl} disabled={disabled} onChange={event => onChange('consoleUrl', event.target.value)} placeholder="https://example.com/kibana/s/team/app/discover" /></label>
    {draft.consoleUrl.trim().toLowerCase().startsWith('http://') && <Alert type="warning" showIcon message="此地址使用 HTTP，账号密码和日志将以明文传输。建议使用 HTTPS。" />}
    {children}
    <div className="buildr-kibana-discovery">
      <label>查找数据视图（Data View）<Input id="kibana-view-name" aria-label="数据视图名称筛选" value={viewName} disabled={disabled} placeholder="按名称筛选 · 可留空" onChange={event => { requestScope.invalidate(); setDiscovering(false); setViews(undefined); setError(''); setViewName(event.target.value); }} onPressEnter={event => { event.preventDefault(); if (!disabled) void discover(); }} /></label>
      <Button id="discover-kibana-data-views" loading={discovering} disabled={disabled} onClick={() => void discover()}>读取数据视图（Data View）</Button>
    </div>
    <label>默认数据视图（Data View）· 可选<Select id="kibana-data-view" aria-label="默认数据视图" allowClear showSearch optionFilterProp="label" value={draft.dataViewId || undefined} disabled={disabled} options={options} placeholder="先读取，再按真实编号选择" onChange={value => onChange('dataViewId', value || null)} /></label>
    <p className="buildr-connections-muted">{draft.dataViewId ? '读取视图和保存配置不会验证查询能力；请测试连接。' : '尚未选择默认数据视图（Data View）。可先保存，查询前再选择并测试。'}</p>
    {views && <>
      <Space className="buildr-kibana-pagination" wrap>
        <span id="kibana-data-views-count">本次显示 {views.dataViews.length} 项，共 {views.total} 项匹配</span>
        <Button id="kibana-data-views-previous" size="small" disabled={disabled || discovering || views.offset === 0} onClick={() => void discover(Math.max(0, views.offset - views.limit))}>上一页</Button>
        <Button id="kibana-data-views-next" size="small" disabled={disabled || discovering || !views.limitReached} onClick={() => void discover(views.offset + views.limit)}>下一页</Button>
      </Space>
      {views.total === 0 && <Alert type="info" showIcon message="未发现匹配的数据视图（Data View）；可以调整名称筛选，或先保存连接。" />}
      {(views.warnings || []).map((warning, index) => <Alert key={`${index}:${warning.code}`} type="warning" showIcon message={warning.message} />)}
    </>}
    {error && <Alert type="error" showIcon message={error} description="输入已保留；合法配置仍可保存。" />}
  </div>;
}
