import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Space, Spin } from 'antd';
import { CopyButton } from '../../components/CopyButton.tsx';

type Props = { href?: string; load?: (signal: AbortSignal) => Promise<string>; reference: string; onClose(): void };
/** Mounted only for the current conversation; changing conversations discards the preview. */
export function ConversationImagePreview({ href, load, reference, onClose }: Props) {
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const [localSource,setLocalSource]=useState(''),[failure,setFailure]=useState(''),[original,setOriginal]=useState<{source:string;url:string}>();
  const source=href||localSource;
  useEffect(()=>{
    if(!load)return;
    const controller=new AbortController();
    void load(controller.signal).then(value=>{if(!controller.signal.aborted)setLocalSource(value);},error=>{if(!controller.signal.aborted){setFailure(error instanceof Error?error.message:'');setLoading(false);setFailed(true);}});
    return ()=>controller.abort();
  },[load,retry]);
  const inlineImage = /^data:/i.test(source);
  const showReference = !/^data:/i.test(reference);
  useEffect(()=>{
    const bitmap=showReference&&/^data:(image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon));base64,([a-z\d+/=]+)$/i.exec(source);
    if(!bitmap)return;
    try{
      const bytes=Uint8Array.from(atob(bitmap[2]!),char=>char.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:bitmap[1]}));
      setOriginal({source,url});
      return ()=>URL.revokeObjectURL(url);
    }catch{/* An invalid bitmap cannot be opened. */}
  },[source,showReference]);
  const originalHref=inlineImage?(original?.source===source?original.url:undefined):source;
  const previewSource=retry&&/^https?:\/\//i.test(source)?new URL(source):null;
  previewSource?.searchParams.set('retry',String(retry));
  // 原始像素用于核对截图中的小字；适应窗口保持整图可见。
  const [actualSize, setActualSize] = useState(false);
  return <Modal
    open
    centered
    title="图片预览"
    onCancel={onClose}
    width="min(1280px, calc(100vw - 32px))"
    footer={<Space>
      <Button onClick={() => setActualSize(value => !value)} disabled={failed}>{actualSize ? '适应窗口' : '实际大小'}</Button>
      {originalHref && !failed && <Button href={originalHref} target="_blank" rel="noopener noreferrer">新窗口打开</Button>}
      <Button type="primary" onClick={onClose}>关闭预览</Button>
    </Space>}
  >
    {showReference && <div className="ac-linked-image-reference"><code>{reference}</code><CopyButton type="text" text={reference} ariaLabel="复制图片路径" failureMessage="复制失败，请手动复制图片路径。"/></div>}
    {failed ? <Alert type="warning" showIcon message={failure||"图片暂时无法读取，可能已被移动、删除或超过大小限制。"} action={<Button size="small" onClick={() => { setLoading(true); setFailed(false); setFailure(''); setLocalSource(''); setRetry(value => value + 1); }}>重新加载</Button>}/> :
      <Spin spinning={loading}><div className="ac-linked-image-preview" data-actual-size={actualSize ? 'true' : undefined}>{source&&<img key={retry} src={previewSource?.href??source} alt="对话引用的图片" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }}/>}</div></Spin>}
  </Modal>;
}
