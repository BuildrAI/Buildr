import { useEffect, useRef, useState } from 'react';
import { ApiOutlined, BookOutlined, CodeOutlined, PlusOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Modal, Skeleton, Typography } from 'antd';
import { programmaticAccessApi, type ProgrammaticAccessView, type AccessCredential, type AccessDocumentKind } from './api/programmatic-access-api';
import { ProgrammaticAccessDocumentDrawer } from './ProgrammaticAccessDocumentDrawer';
import { ProgrammaticAccessCreateModal, type ProgrammaticAccessInput } from './ProgrammaticAccessCreateModal';
import { ProgrammaticCredentialCard } from './ProgrammaticCredentialCard';
import './programmatic-access.css';

/** The list is primary; forms, secrets metadata and destructive actions are on demand. */
export function ProgrammaticAccessSettings() {
  const [view, setView] = useState<ProgrammaticAccessView>();
  const [error, setError] = useState(''), [savedPath, setSavedPath] = useState('');
  const [busy, setBusy] = useState(false), [createOpen, setCreateOpen] = useState(false);
  const [document, setDocument] = useState<AccessDocumentKind | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [modal, modalContext] = Modal.useModal();
  const live = useRef(true), gate = useRef(false);
  useEffect(() => {
    live.current = true;
    void programmaticAccessApi.read().then(value => { if (live.current) setView(value); })
      .catch(e => { if (live.current) setError(e.message); });
    return () => { live.current = false; };
  }, []);
  async function act(work: () => Promise<void>): Promise<boolean> {
    if (gate.current) return false;
    gate.current = true; setBusy(true); setError(''); setSavedPath('');
    try { await work(); return true; }
    catch (e) { if (live.current) setError(e instanceof Error ? e.message : '操作失败，请刷新当前状态后重试。'); return false; }
    finally { gate.current = false; if (live.current) setBusy(false); }
  }
  function received(credential: AccessCredential) {
    if (!live.current) return;
    setView(current => current ? { ...current, credentials: [credential, ...current.credentials.filter(item => item.id !== credential.id)] } : current);
    setSavedPath(credential.tokenFilePath ?? ''); setExpanded([credential.id]);
  }
  async function create(input: ProgrammaticAccessInput) {
    return act(async () => {
      received((await programmaticAccessApi.create(input)).credential);
      if (live.current) setCreateOpen(false);
    });
  }
  function confirmRegenerate(item: AccessCredential) {
    modal.confirm({ title: `重新生成「${item.name}」的凭据？`, content: '原令牌会立即失效，程序需要改用新保存的凭据文件。工作空间和权限保持不变。',
      okText: '确认重新生成', cancelText: '取消', onOk: () => act(async () => received((await programmaticAccessApi.regenerate(item)).credential)) });
  }
  function confirmRevoke(item: AccessCredential) {
    modal.confirm({ title: `撤销「${item.name}」接入？`, content: '该程序将无法继续调用 Buildr；已受理的工作不会自动停止。',
      okText: '确认撤销', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => act(async () => {
        await programmaticAccessApi.revoke(item);
        const result = await programmaticAccessApi.read(); if (live.current) setView(result);
      }) });
  }
  async function refresh() {
    await act(async () => { const result = await programmaticAccessApi.read(); if (live.current) setView(result); });
  }
  return <section className="pas-root" data-testid="programmatic-access-settings">
    <header className="pas-intro">
      <div><h3>把 Buildr 接入你的工具</h3><p>创建接入，复制连接信息，即可交给本机程序使用。</p></div>
      <Button type="primary" icon={<PlusOutlined aria-hidden />} disabled={!view || busy} onClick={() => { setError(''); setCreateOpen(true); }}>新建接入</Button>
    </header>
    {error && !createOpen && <Alert type="error" showIcon message={error} action={<Button onClick={() => void refresh()} disabled={busy}>刷新状态</Button>} />}
    {savedPath && <Alert type="success" showIcon closable onClose={() => setSavedPath('')} message="凭据已安全保存，可复制下方接入信息交给程序。" />}
    {view ? <div className="pas-connection">
      <div className="pas-endpoint"><span className="pas-endpoint-label"><ApiOutlined aria-hidden />本机 API</span><Typography.Text code copyable className="pas-url">{view.apiUrl}</Typography.Text></div>
      <nav className="pas-documents" aria-label="程序接入文档">
        <Button type="text" size="small" icon={<BookOutlined aria-hidden />} onClick={() => setDocument('help')}>使用指南</Button>
        <Button type="text" size="small" icon={<UnorderedListOutlined aria-hidden />} onClick={() => setDocument('operations')}>操作目录</Button>
        <Button type="text" size="small" icon={<CodeOutlined aria-hidden />} onClick={() => setDocument('openapi.json')}>完整 OpenAPI</Button>
        <span>直接查看，无需输入令牌</span>
      </nav>
    </div> : !error && <Skeleton active paragraph={{ rows: 2 }} />}
    <section className="pas-programs" aria-label="已接入程序">
      <div className="pas-section-heading"><h4>接入程序</h4><span>{view ? `${view.credentials.filter(item => !item.revokedAt).length} 个有效接入` : '正在读取…'}</span></div>
      {view?.credentials.length ? <div className="pas-credential-list">{view.credentials.map(item => <ProgrammaticCredentialCard key={item.id}
        item={item} view={view} busy={busy} expanded={expanded.includes(item.id)}
        onToggle={() => setExpanded(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])}
        onRegenerate={() => confirmRegenerate(item)} onRevoke={() => confirmRevoke(item)} />)}</div>
        : view && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有接入程序，创建一个开始使用。" />}
    </section>
    <p className="pas-footnote">每个程序使用独立凭据，按工作空间授权。工作空间授权不等同于操作系统文件沙箱。</p>
    <ProgrammaticAccessCreateModal open={createOpen} view={view} busy={busy} error={error} onClose={() => setCreateOpen(false)} onCreate={create} />
    <ProgrammaticAccessDocumentDrawer kind={document} onSelect={setDocument} onClose={() => setDocument(null)} />
    {modalContext}
  </section>;
}
