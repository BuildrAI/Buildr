import { useRef, useState } from 'react';
import { Alert, Button, Empty, Image, Segmented, Space, Tag, Tooltip, message } from 'antd';
import { CopyOutlined, FileOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { publicationApi, type PublicationAsset } from '../api/publication-api';
import { assetMarkdown, publicationAssetUrl, referencedAssets } from '../publication-model';

type Props = {
  workspaceId: string; projectCode: string; publicationId: string; revision: string;
  content: string; assets: PublicationAsset[]; disabled?: boolean;
  onAssets: (assets: PublicationAsset[]) => void; onInsert: (markdown: string) => void;
  onConflict: (message: string) => void;
};
const accepted = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.json,.zip,.docx,.xlsx,.pptx';
const imagePattern = /\.(png|jpe?g|gif|webp)$/i;
const fileSize = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}
export function ArticleAssetsPanel({ workspaceId, projectCode, publicationId, revision, content, assets, disabled, onAssets, onInsert, onConflict }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState('referenced'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [messages, holder] = message.useMessage();
  const referenced = referencedAssets(content), used = new Set(referenced);
  const shown = scope === 'referenced' ? assets.filter(asset => used.has(asset.relativePath)) : assets;
  const missing = referenced.filter(path => !assets.some(asset => asset.relativePath === path));
  const handleError = (err: unknown) => {
    const text = err instanceof Error ? err.message : '资源操作失败'; setError(text);
    if (/revision|conflict/i.test(String((err as { code?: string })?.code || ''))) onConflict(text);
  };
  const refresh = async () => {
    setBusy(true); setError('');
    try { const result = await publicationApi.assets(projectCode, publicationId); onAssets(result.assets); }
    catch (err) { handleError(err); }
    finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    const suffix = `.${file.name.split('.').at(-1)?.toLowerCase()}`;
    if (!accepted.split(',').includes(suffix)) { setError('请选择 PNG、JPEG、GIF、WebP 图片或 PDF、TXT、Markdown、CSV、JSON、ZIP、Office 附件。'); return; }
    const limit = imagePattern.test(file.name) ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > limit) { setError(`文件超过 ${limit / 1024 / 1024} MB 上限，请换一个较小文件。`); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await publicationApi.upload(projectCode, publicationId, revision, file.name, await readBase64(file), workspaceId);
      onAssets([...assets.filter(asset => asset.relativePath !== result.asset.relativePath), result.asset]);
      setScope('project'); setNotice(`“${file.name}”已上传。点击“插入引用”加入正文，再保存文章。`);
    } catch (err) { handleError(err); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return <section className="publication-assets-panel" aria-label="文章图片与附件">{holder}<div className="publication-aside-heading"><h2>图片与附件</h2><Tooltip title="刷新资源"><Button size="small" type="text" icon={<ReloadOutlined />} aria-label="刷新文章资源" loading={busy} disabled={disabled} onClick={() => void refresh()} /></Tooltip></div>
    <p className="publication-hint">文件保存在项目 <code>assets/</code> 中，通过引用加入文章。</p>
    <input ref={input} type="file" id="article-asset-file" aria-label="上传文章图片或附件" accept={accepted} hidden onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    <Button id="article-asset-upload" block icon={<UploadOutlined />} loading={busy} disabled={disabled} onClick={() => input.current?.click()}>上传图片或附件</Button>
    <p className="publication-hint">图片最大 5 MB，附件最大 10 MB。</p>
    {error && <Alert type="error" message={error} closable onClose={() => setError('')} />}
    {notice && <Alert type="success" message={notice} closable onClose={() => setNotice('')} />}
    <Segmented block value={scope} onChange={value => setScope(String(value))} options={[{ label: `本文引用 ${referenced.length}`, value: 'referenced' }, { label: `项目资源 ${assets.length}`, value: 'project' }]} />
    {scope === 'referenced' && missing.length > 0 && <Alert type="warning" message="部分引用资源未找到" description={missing.join('、')} />}
    <div className="publication-assets-list">{shown.length ? [...shown].sort((a, b) => Number(used.has(b.relativePath)) - Number(used.has(a.relativePath))).map(asset => {
      const url = publicationAssetUrl(workspaceId, projectCode, publicationId, asset.relativePath) || '';
      return <article className="publication-asset" key={asset.relativePath} data-article-asset={asset.relativePath}>
        {asset.isImage ? <Image src={url} alt={asset.name} width="100%" /> : <a className="publication-attachment" href={url} target="_blank" rel="noopener noreferrer"><FileOutlined /><span>{asset.name}</span><small>下载附件 ↗</small></a>}
        <div className="publication-asset-title"><strong title={asset.name}>{asset.name}</strong>{used.has(asset.relativePath) && <Tag>已引用</Tag>}</div><code>{asset.relativePath}</code><small>{fileSize(asset.size)}</small>
        <Space><Button size="small" icon={<PlusOutlined />} disabled={disabled} data-insert-asset={asset.relativePath} onClick={() => { onInsert(assetMarkdown(asset)); setNotice('引用已插入正文，保存文章后生效。'); }}>插入引用</Button><Tooltip title="复制相对路径"><Button size="small" type="text" icon={<CopyOutlined />} aria-label={`复制资源路径：${asset.name}`} onClick={() => { void navigator.clipboard.writeText(asset.relativePath).then(() => messages.success('资源路径已复制')).catch(() => messages.error('自动复制失败，请选择路径文本复制')); }} /></Tooltip></Space>
      </article>;
    }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={scope === 'referenced' ? '正文还没有引用本地资源' : '项目还没有资源'} />}</div>
  </section>;
}
