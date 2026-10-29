import { useState } from 'react';
import { Alert, Button, Image, Modal, Spin } from 'antd';
import { CopyButton } from '../../components/CopyButton';

type Props = { href: string; reference: string; onClose(): void };
/** Mounted only for the current conversation; changing conversations discards the preview. */
export function ConversationImagePreview({ href, reference, onClose }: Props) {
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  return <Modal open title="图片预览" onCancel={onClose} width="min(1000px, calc(100vw - 32px))" footer={<Button onClick={onClose}>关闭预览</Button>}>
    <div className="ac-linked-image-reference"><code>{reference}</code><CopyButton type="text" text={reference} ariaLabel="复制图片路径" failureMessage="复制失败，请手动复制图片路径。"/></div>
    {failed ? <Alert type="warning" showIcon message="图片暂时无法读取，可能已被移动、删除或超过大小限制。" action={<Button size="small" onClick={() => { setLoading(true); setFailed(false); setRetry(value => value + 1); }}>重新加载</Button>}/> :
      <Spin spinning={loading}><div className="ac-linked-image-preview"><Image key={retry} src={href + (retry ? `&retry=${retry}` : '')} alt="对话引用的图片" preview={false} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }}/></div></Spin>}
  </Modal>;
}
