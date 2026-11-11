import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Collapse, Form, Input, Popconfirm, Select, Space, Tag, Typography } from 'antd';
import { programmaticAccessApi, type AccessScope, type ProgrammaticAccessView, type AccessCredential, type AccessDocumentKind } from './api/programmatic-access-api';
import { ProgrammaticAccessDocumentDrawer } from './ProgrammaticAccessDocumentDrawer';
import { programmaticConnectionInfo } from './programmatic-connection-info';

const labels: Record<AccessScope, string> = { read: '读取与观察', execute: '发起、补充与停止', answer: '回答问题', approve: '批准敏感操作' };

/** Secrets are saved by the host; this page only retains metadata and paths. */
export function ProgrammaticAccessSettings() {
  const [view, setView] = useState<ProgrammaticAccessView>();
  const [name, setName] = useState('');
  const [spaces, setSpaces] = useState<string[]>([]);
  const [scopes, setScopes] = useState<AccessScope[]>(['read', 'execute']);
  const [error, setError] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [document, setDocument] = useState<AccessDocumentKind | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const live = useRef(true), gate = useRef(false);
  useEffect(() => {
    live.current = true;
    void programmaticAccessApi.read().then(value => { if (live.current) setView(value); })
      .catch(e => { if (live.current) setError(e.message); });
    return () => { live.current = false; };
  }, []);
  async function act(work: () => Promise<void>) {
    if (gate.current) return;
    gate.current = true; setBusy(true); setError(''); setSavedPath('');
    try { await work(); }
    catch (e) { if (live.current) setError(e instanceof Error ? e.message : '操作失败，请重新读取当前状态后再操作。'); }
    finally { gate.current = false; if (live.current) setBusy(false); }
  }
  function received(credential: AccessCredential) {
    if (!live.current) return;
    setView(current => current ? { ...current, credentials: [credential, ...current.credentials.filter(item => item.id !== credential.id)] } : current);
    setSavedPath(credential.tokenFilePath ?? '');
    setExpanded([credential.id]);
  }
  async function create() {
    await act(async () => {
      const result = await programmaticAccessApi.create({ name, workspaceIds: spaces, scopes });
      received(result.credential);
      if (live.current) setName('');
    });
  }
  async function regenerate(item: AccessCredential) {
    await act(async () => received((await programmaticAccessApi.regenerate(item)).credential));
  }
  async function revoke(item: AccessCredential) {
    await act(async () => {
      await programmaticAccessApi.revoke(item);
      const result = await programmaticAccessApi.read();
      if (live.current) setView(result);
    });
  }
  async function refresh() {
    await act(async () => { const result = await programmaticAccessApi.read(); if (live.current) setView(result); });
  }
  return <Space direction="vertical" size="middle" style={{ width: '100%' }} data-testid="programmatic-access-settings">
    <Typography.Paragraph>供本机程序直接调用 Agent Service。创建后凭据自动保存到当前实例的私有文件，将接入信息交给程序即可；调用方法由程序自行读取文档。凭据按工作空间授权，不是操作系统文件沙箱。</Typography.Paragraph>
    {error && <Alert type="error" showIcon message={error} action={<Button onClick={() => void refresh()} disabled={busy}>刷新当前状态</Button>} />}
    {savedPath && <Alert type="success" showIcon message="凭据已自动保存，无需手工复制令牌"
      description={<Typography.Text copyable>{savedPath}</Typography.Text>} />}
    {view && <Card size="small" title="连接与文档">
      <Typography.Paragraph copyable>{view.apiUrl}</Typography.Paragraph>
      <Space wrap>
        <Button onClick={() => setDocument('help')}>查看使用指南</Button>
        <Button onClick={() => setDocument('operations')}>查看操作目录</Button>
        <Button onClick={() => setDocument('openapi.json')}>查看完整 OpenAPI</Button>
      </Space>
      <Typography.Paragraph type="secondary">在此查看、下载文档使用当前网页会话，无需输入 Bearer。以下地址供接入程序使用，需要其专用凭据。</Typography.Paragraph>
      <Typography.Paragraph>帮助：<Typography.Text copyable>{view.documentationUrl}</Typography.Text></Typography.Paragraph>
      <Typography.Paragraph>轻量操作目录：<Typography.Text copyable>{view.operationsUrl ?? view.apiUrl + '/operations'}</Typography.Text>，单操作按需读取；完整 OpenAPI 用于可选导入。</Typography.Paragraph>
      <Typography.Paragraph>OpenAPI：<Typography.Text copyable>{view.openapiUrl}</Typography.Text></Typography.Paragraph>
    </Card>}
    <Card size="small" title="新建接入程序"><Form layout="vertical" onFinish={() => void create()}>
      <Form.Item label="名称"><Input aria-label="程序凭据名称" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="例如 千问办公" /></Form.Item>
      <Form.Item label="允许的工作空间"><Select aria-label="凭据允许的工作空间" mode="multiple" value={spaces} onChange={setSpaces} options={view?.workspaces.map(w => ({ value: w.id, label: w.name }))} /></Form.Item>
      <Form.Item label="操作权限"><Checkbox.Group value={scopes} onChange={value => setScopes([...new Set(['read', ...value] as AccessScope[])])} options={Object.entries(labels).map(([value, label]) => ({ value, label, disabled: value === 'read' }))} /></Form.Item>
      {(scopes.includes('answer') || scopes.includes('approve')) && <Alert type="warning" message="此权限允许程序代答问题或审批。仅在你明确希望自动化处理时授予。" />}
      <Typography.Paragraph type="secondary">令牌由本机宿主自动以 600 权限保存，目录权限 700，不写入聊天或浏览器存储。建议只授读取和执行，问题与审批由你本人处理。</Typography.Paragraph>
      <Button htmlType="submit" type="primary" loading={busy} disabled={!view || !name.trim() || !spaces.length}>创建并自动保存</Button>
    </Form></Card>
    {view?.credentials.map(item => {
      const info = programmaticConnectionInfo(view, item);
      return <Card size="small" key={item.id} data-credential-id={item.id}
        title={<Space>{item.name}<Tag>{item.revokedAt ? '已撤销' : '有效'}</Tag></Space>}
        extra={<Button danger disabled={!!item.revokedAt || busy} onClick={() => void revoke(item)}>撤销</Button>}>
        <Typography.Paragraph>{item.scopes.map(scope => labels[scope]).join('、')}</Typography.Paragraph>
        <Typography.Paragraph>{item.workspaceIds.map(id => view.workspaces.find(w => w.id === id)?.name ?? id).join('、')}</Typography.Paragraph>
        {!item.revokedAt && <>
          {item.tokenFilePath
            ? <Typography.Paragraph>凭据文件（600）：<Typography.Text copyable>{item.tokenFilePath}</Typography.Text></Typography.Paragraph>
            : <Alert type="info" message="此凭据创建于自动保存功能启用前。无法恢复原令牌；可重新生成并自动保存，原令牌将失效。" />}
          <Collapse activeKey={expanded.includes(item.id) ? ['connection'] : []}
            onChange={keys => setExpanded(current => keys.length ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id))}
            items={[{ key: 'connection', label: '接入信息 · 复制给程序', children: info
              ? <><Typography.Paragraph type="secondary">仅包含连接信息，不含令牌。程序需在本机运行且能读取此文件。</Typography.Paragraph>
                <Typography.Paragraph copyable={{ text: info }} style={{ whiteSpace: 'pre-wrap' }} data-testid="programmatic-connection-info">{info}</Typography.Paragraph></>
              : <Typography.Paragraph>重新生成并保存后，将在此提供可直接交付的接入信息。</Typography.Paragraph> }]} />
          <Popconfirm title="重新生成并保存凭据？" description="原令牌会立即失效，使用旧令牌的程序需要改用新文件。权限范围不变。"
            okText="确认重新生成" cancelText="取消" onConfirm={() => regenerate(item)}>
            <Button disabled={busy} style={{ marginTop: 12 }}>重新生成并保存</Button>
          </Popconfirm>
        </>}
        <Typography.Text type="secondary">{item.id} · {item.createdAt}</Typography.Text>
      </Card>;
    })}
    <ProgrammaticAccessDocumentDrawer kind={document} onSelect={setDocument} onClose={() => setDocument(null)} />
  </Space>;
}
