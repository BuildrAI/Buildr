import { useState } from 'react';
import type { CodeDiffResponse } from '../api/code-api';
import './source-control-image-preview.css';

type Preview = NonNullable<CodeDiffResponse['imagePreview']>;
type ImageFile = NonNullable<Preview['after']>;
const sizeLabel = (size:number) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KiB` : `${(size / 1024 / 1024).toFixed(1)} MiB`;

/** Contents and missing sides are supplied by the same verified diff read. */
export function SourceControlImagePreview({preview,area}:{preview:Preview;area:CodeDiffResponse['area']}) {
  const [failed,setFailed] = useState(new Set<string>());
  const labels = area === 'staged' ? ['上次提交','暂存内容'] : area === 'unstaged' ? ['暂存内容','当前文件'] : area === 'commit' ? ['第一父提交','所选提交'] : ['文件不存在','新增图片'];
  const comparison = Boolean(preview.before && preview.after);
  function side(file:ImageFile,direction:'before'|'after',index:number) {
    const identity = JSON.stringify([direction,file.path,file.revision]);
    const title = comparison ? `${direction === 'before' ? '旧版本' : '新版本'} · ${labels[index]}` : direction === 'before' ? '删除前图片' : '新增图片';
    return <figure className="source-control-image-side" data-side={direction}>
      <figcaption><strong>{title}</strong><span>{sizeLabel(file.sizeBytes)}</span></figcaption>
      {file.kind !== 'image' ? <p className="source-control-image-state" role="status">{file.message || '此版本不是可预览的图片。'}</p> : failed.has(identity) ? <p className="source-control-image-state" role="status">图片内容无法显示。</p> : <div className="source-control-image-canvas"><img src={file.content} alt={`${direction === 'before' ? '旧版本' : '新版本'}图片 ${file.path}`} onError={()=>setFailed(previous=>new Set(previous).add(identity))} /></div>}
      <small className="source-control-image-path" title={file.path}>{file.path}</small>
    </figure>;
  }
  return <section className="source-control-image-preview" aria-label="图片差异"><div className={'source-control-image-pair' + (comparison ? ' is-comparison' : '')}>{preview.before && side(preview.before,'before',0)}{preview.after && side(preview.after,'after',1)}{!preview.before && !preview.after && <p className="source-control-image-state" role="status">没有可预览的图片。</p>}</div></section>;
}
