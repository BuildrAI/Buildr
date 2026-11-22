import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Segmented } from 'antd';
import type { HarnessFileContent } from '../directory-files.tsx';
import { CopyButton } from './CopyButton.tsx';
import { MarkdownReader } from './MarkdownReader.tsx';
import {htmlPreviewAddress} from '../lib/localFileLink.ts';
import './local-file-preview-modal.css';

export function LocalFilePreviewBody({ path, value, fragment }: { path: string; value: HarnessFileContent; fragment?: string }) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const fullPath = value.path || path;
  const fileName = fullPath.split(/[\\/]/).at(-1) || fullPath;
  const htmlUrl = htmlPreviewAddress(value.htmlUrl, fragment);
  const canRenderHtml = value.kind === 'html' && Boolean(htmlUrl);

  useEffect(() => {
    setMode('preview');
  }, [fullPath, value.kind, htmlUrl]);

  if (value.kind === 'html') {
    const showPreview = canRenderHtml && mode === 'preview';
    return <>
      {canRenderHtml && (
        <div className="local-file-preview-toolbar">
          <Segmented
            size="small"
            aria-label="HTML 查看模式"
            value={mode}
            options={[{ label: '页面预览', value: 'preview' }, { label: '查看源码', value: 'source' }]}
            onChange={next => setMode(next as 'preview' | 'source')}
          />
          <Button size="small" onClick={() => window.open(htmlUrl!, '_blank', 'noopener')}>新标签页打开</Button>
        </div>
      )}
      {showPreview ? (
        <iframe
          className="local-file-preview-frame"
          title={fileName}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src={htmlUrl}
        />
      ) : (
        <>
          <pre className="local-file-preview-source">{value.content}</pre>
          {value.truncated && <Alert className="local-file-preview-truncated" type="info" message="源码超过预览上限，仅显示前 1 MiB。" />}
        </>
      )}
    </>;
  }

  if (value.kind === 'markdown') {
    return <>
      <MarkdownReader content={value.content} path={fullPath} />
      {value.truncated && <Alert className="local-file-preview-truncated" type="info" message="内容超过预览上限，仅显示前 1 MiB。" />}
    </>;
  }

  if (value.kind === 'image') {
    return <img className="local-file-preview-image" src={value.content} alt={fileName} />;
  }

  if (value.kind === 'unsupported') {
    return <Alert type="info" showIcon message={value.content || '此类型仅可复制路径，不执行或内嵌打开。'} />;
  }

  return <>
    <pre className="local-file-preview-source">{value.content}</pre>
    {value.truncated && <Alert className="local-file-preview-truncated" type="info" message="内容超过预览上限，仅显示前 1 MiB。" />}
  </>;
}

export function LocalFilePreviewModal({ file, onClose }: { file: { path: string; value: HarnessFileContent; fragment?: string } | null; onClose(): void }) {
  const fullPath = file ? file.value.path || file.path : '';
  const fileName = fullPath.split(/[\\/]/).at(-1) || fullPath;
  const isHtmlPreview = file?.value.kind === 'html' && Boolean(file.value.htmlUrl);
  return (
    <Modal
      open={Boolean(file)}
      centered
      title={fileName}
      footer={null}
      width={isHtmlPreview ? 'min(1280px, 96vw)' : 'min(1000px, 94vw)'}
      rootClassName="ac-panel-popup local-file-preview-modal"
      destroyOnHidden
      onCancel={onClose}
    >
      {file && (
        <>
          <div className="local-file-preview-meta">
            <code className="local-file-preview-path">{fullPath}</code>
            <CopyButton type="text" text={fullPath} ariaLabel="复制文件路径" failureMessage="复制失败，请手动复制文件路径。" />
          </div>
          <LocalFilePreviewBody path={fullPath} value={file.value} fragment={file.fragment} />
        </>
      )}
    </Modal>
  );
}
