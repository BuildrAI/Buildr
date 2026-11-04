import { useState } from 'react';
import { Alert, Button, Image, Modal, Space, Spin } from 'antd';
import { CopyButton } from '../../components/CopyButton';

type Props = { href: string; reference: string; onClose(): void };
/** Mounted only for the current conversation; changing conversations discards the preview. */
export function ConversationImagePreview({ href, reference, onClose }: Props) {
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  // 原始像素用于核对截图中的小字；适应窗口保持整图可见。
  const [actualSize, setActualSize] = useState(false);
  return <Modal
    open
    title="图片预览"
    onCancel={onClose}
    width="min(1280px, calc(100vw - 32px))"
    footer={<Space>
      <Button onClick={() => setActualSize(value => !value)} disabled={failed}>{actualSize ? '适应窗口' : '实际大小'}</Button>
      <Button href={href} target="_blank" rel="noopener noreferrer">新窗口打开</Button>
      <Button type="primary" onClick={onClose}>关闭预览</Button>
    </Space>}
  >
    <div className="ac-linked-image-reference"><code>{reference}</code><CopyButton type="text" text={reference} ariaLabel="复制图片路径" failureMessage="复制失败，请手动复制图片路径。"/></div>
    {failed ? <Alert type="warning" showIcon message="图片暂时无法读取，可能已被移动、删除或超过大小限制。" action={<Button size="small" onClick={() => { setLoading(true); setFailed(false); setRetry(value => value + 1); }}>重新加载</Button>}/> :
      <Spin spinning={loading}><div className="ac-linked-image-preview" data-actual-size={actualSize ? 'true' : undefined}><Image key={retry} src={href + (retry ? `&retry=${retry}` : '')} alt="对话引用的图片" preview={false} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }}/></div></Spin>}
  </Modal>;
}
