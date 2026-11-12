import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, List, Skeleton, Typography } from 'antd';
import { MarkdownHost } from '../../components/MarkdownHost';
import { programmaticAccessApi, type AccessDocument, type AccessDocumentKind } from './api/programmatic-access-api';

type Operation = { id: string; method: string; path: string; summary: string; scope: string };
export function ProgrammaticAccessDocumentDrawer({ kind, onClose, onSelect }: { kind: AccessDocumentKind | null; onClose(): void; onSelect(kind: AccessDocumentKind): void }) {
  const [document, setDocument] = useState<AccessDocument>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setDocument(undefined); setError('');
    if (kind) void programmaticAccessApi.document(kind).then(value => {
      if (live) setDocument(value);
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : '读取文档失败'); });
    return () => { live = false; };
  }, [kind, retry]);
  function download() {
    if (!document) return;
    const url = URL.createObjectURL(new Blob([document.content], { type: document.mediaType + ';charset=utf-8' }));
    const link = window.document.createElement('a');
    link.href = url; link.download = document.fileName; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  let operations: Operation[] = [], contractVersion = '';
  if (kind === 'operations' && document) {
    try {
      const index = JSON.parse(document.content);
      operations = Array.isArray(index.operations) ? index.operations : [];
      contractVersion = index.contractVersion ?? '';
    } catch { /* The original text remains downloadable for diagnosis. */ }
  }
  const single = kind?.startsWith('operations/');
  return <Drawer open={!!kind} onClose={onClose} width="min(960px, 95vw)"
    title={kind === 'help' ? 'Buildr 程序接入使用指南' : kind === 'operations' ? '操作目录 · 按需读取' : single ? `接口说明：${kind?.slice('operations/'.length)}` : 'Buildr 完整 OpenAPI'}
    extra={<Button onClick={download} disabled={!document}>下载文档</Button>}>
    {error ? <Alert type="error" message={error} action={<Button onClick={() => setRetry(value => value + 1)}>重试</Button>} />
      : !document ? <Skeleton active />
        : kind === 'help' ? <MarkdownHost markdown={document.content} className="markdown-body" />
          : kind === 'operations' ? <>
            <Alert type="info" message="需要哪个操作，再查看哪个操作；单操作描述已包含全部依赖模型，无需先读完整 OpenAPI。" />
            <Typography.Paragraph type="secondary" style={{ overflowWrap: 'anywhere' }}>契约版本：{contractVersion}</Typography.Paragraph>
            <List dataSource={operations} rowKey="id" renderItem={item => <List.Item
              actions={[<Button key="read" onClick={() => onSelect(`operations/${item.id}`)}>查看 {item.id}</Button>]}>
              <List.Item.Meta title={`${item.method} · ${item.id} · ${item.scope}`} description={<>{item.summary}<br /><Typography.Text type="secondary">{item.path}</Typography.Text></>} />
            </List.Item>} />
          </> : <>
            {single && <Button onClick={() => onSelect('operations')}>返回操作目录</Button>}
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} data-testid="programmatic-openapi-content">{document.content}</pre>
          </>}
  </Drawer>;
}
