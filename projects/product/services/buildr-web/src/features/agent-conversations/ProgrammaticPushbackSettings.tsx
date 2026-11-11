import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Space, Switch, Tag, Typography } from 'antd';
import { EyeInvisibleOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { programmaticAccessApi, type PushbackSettingsView } from './api/programmatic-access-api';

const labels = { unconfigured: '未配置', invalid: '配置无效', disabled: '已停用', enabled: '已启用' };
const deliveryText = (item: { kind: string; success: boolean; status?: number; at: string }) =>
  `${item.kind === 'test' ? '测试' : '事件'} · ${item.success ? '成功' : '失败'}${item.status ? `（HTTP ${item.status}）` : ''} · ${new Date(item.at).toLocaleString('zh-CN', { hour12: false })}`;

/** Per-credential pushback settings; mounted only while the credential details are open, so secrets never outlive this view. */
export function ProgrammaticPushbackSettings({ credentialId, credentialName }: { credentialId: string; credentialName: string }) {
  const [view, setView] = useState<PushbackSettingsView>();
  const [url, setUrl] = useState(''), [enabled, setEnabled] = useState(true), [secret, setSecret] = useState(''), [revealed, setRevealed] = useState<string | null>(null);
  const [rateHour, setRateHour] = useState(180), [rateMinute, setRateMinute] = useState(20);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const epoch = useRef(0), gate = useRef(false);
  const prefix = `programmatic-pushback-${credentialId}`;
  const apply = (next: PushbackSettingsView) => { setView(next); setUrl(next.url); setEnabled(next.state === 'enabled' || next.state === 'unconfigured'); setSecret(''); setRevealed(null); setRateHour(next.rateLimitHour); setRateMinute(next.rateLimitMinute); };
  useEffect(() => {
    const controller = new AbortController(); const generation = ++epoch.current;
    void programmaticAccessApi.pushback(credentialId, controller.signal)
      .then(next => { if (epoch.current === generation) apply(next); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '回推配置读取失败。'); });
    return () => { epoch.current++; controller.abort(); };
  }, [credentialId]);
  const run = async (operation: (current: () => boolean) => Promise<void>) => {
    if (gate.current) return; gate.current = true; setBusy(true); setError(''); setNotice('');
    const generation = epoch.current;
    try { await operation(() => epoch.current === generation); }
    catch (failure) { if (epoch.current === generation) { setRevealed(null); setError(failure instanceof Error ? failure.message : '操作未完成。'); } }
    finally { gate.current = false; if (epoch.current === generation) setBusy(false); }
  };
  const dirty = !!view && (url !== view.url || secret !== '' || enabled !== (view.state === 'enabled' || view.state === 'unconfigured') || rateHour !== view.rateLimitHour || rateMinute !== view.rateLimitMinute);
  return <section className="pas-pushback" id={prefix} aria-label={`${credentialName}事件回推`}>
    <div className="pas-detail-heading">
      <strong>事件回推</strong>
      <Space size={8}>{view && <Tag color={view.state === 'enabled' ? 'success' : view.state === 'invalid' ? 'error' : 'default'}>{labels[view.state]}</Tag>}
        <Button type="text" size="small" aria-label={`重新读取${credentialName}回推配置`} icon={<ReloadOutlined aria-hidden />} disabled={busy} onClick={() => void run(async current => { const next = await programmaticAccessApi.pushback(credentialId); if (current()) apply(next); })} /></Space>
    </div>
    <Typography.Paragraph type="secondary">仅向该凭据接管的对话推送决策请求与执行结果等关键事件，不含密钥和完整对话内容。密钥保存在本机私有文件，默认隐藏。</Typography.Paragraph>
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
    {notice && <Alert type="success" showIcon message={notice} style={{ marginBottom: 12 }} />}
    {view && <Form layout="vertical" onFinish={() => void run(async current => {
      const next = await programmaticAccessApi.savePushback(credentialId, { expectedRevision: view.revision, url, enabled, rateLimitHour: rateHour, rateLimitMinute: rateMinute, ...(secret ? { secret } : {}) });
      if (current()) { apply(next); setNotice('回推配置已保存并生效。'); }
    })}>
      <Form.Item label="启用回推"><Switch checked={enabled} disabled={busy} onChange={setEnabled} /></Form.Item>
      <Form.Item label="接收地址"><Input id={`${prefix}-url`} value={url} maxLength={8192} placeholder="https://example.com/pushback" disabled={busy} onChange={event => setUrl(event.target.value)} /></Form.Item>
      <Form.Item label="当前密钥" extra="默认隐藏；仅点击查看时读取，隐藏或收起详情后清除明文。">
        <Space.Compact block>
          <Input id={`${prefix}-secret`} readOnly value={revealed ?? (view.hasSecret ? '••••••••' : '未设置')} autoComplete="off" />
          <Button aria-label={revealed === null ? `查看${credentialName}回推密钥` : `隐藏${credentialName}回推密钥`} icon={revealed === null ? <EyeOutlined aria-hidden /> : <EyeInvisibleOutlined aria-hidden />} disabled={!view.hasSecret || busy}
            onClick={() => { if (revealed !== null) { setRevealed(null); return; } void run(async current => { const result = await programmaticAccessApi.revealPushback(credentialId, view.revision); if (current()) setRevealed(result.secret); }); }}>{revealed === null ? '查看' : '隐藏'}</Button>
        </Space.Compact>
      </Form.Item>
      <Form.Item label={view.hasSecret ? '更换密钥' : '设置密钥'} extra={view.hasSecret ? '留空保留现有密钥，不会清除。' : '首次启用必须设置密钥。'}>
        <Input.Password id={`${prefix}-new-secret`} value={secret} maxLength={4096} autoComplete="new-password" disabled={busy} onChange={event => setSecret(event.target.value)} />
      </Form.Item>
      <Space size={16} wrap>
        <Form.Item label="每小时上限" style={{ marginBottom: 0 }}><InputNumber id={`${prefix}-rate-hour`} min={1} max={100000} precision={0} value={rateHour} disabled={busy} onChange={value => setRateHour(typeof value === 'number' ? value : 180)} /></Form.Item>
        <Form.Item label="每分钟上限" style={{ marginBottom: 0 }}><InputNumber id={`${prefix}-rate-minute`} min={1} max={10000} precision={0} value={rateMinute} disabled={busy} onChange={value => setRateMinute(typeof value === 'number' ? value : 20)} /></Form.Item>
      </Space>
      <Space wrap style={{ marginTop: 12 }}>
        <Button type="primary" htmlType="submit" loading={busy} disabled={!dirty}>保存配置</Button>
        <Button disabled={busy || dirty || view.state !== 'enabled'} onClick={() => void run(async current => {
          setRevealed(null); const result = await programmaticAccessApi.testPushback(credentialId, view.revision);
          if (current()) { setView(previous => previous ? { ...previous, lastDelivery: result, recentDeliveries: [...(previous.recentDeliveries ?? []), result].slice(-20) } : previous); if (result.success) setNotice('测试通知已成功送达。'); else setError('测试通知未确认送达，请核对接收端；本次测试不会自动重试。'); }
        })}>发送测试通知</Button>
      </Space>
      {dirty && <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>请先保存配置，再发送测试通知。</Typography.Paragraph>}
    </Form>}
    {view && <div className="pas-pushback-deliveries">
      <Typography.Text type="secondary">最近投递（当前服务进程）</Typography.Text>
      {view.recentDeliveries?.length ? <ul>{[...view.recentDeliveries].reverse().slice(0, 5).map((item, index) => <li key={index}><Tag color={item.success ? 'success' : 'error'}>{item.success ? '成功' : '失败'}</Tag>{deliveryText(item)}</li>)}</ul>
        : <Typography.Paragraph type="secondary" style={{ margin: 0 }}>暂无记录。重新读取可刷新。</Typography.Paragraph>}
    </div>}
  </section>;
}