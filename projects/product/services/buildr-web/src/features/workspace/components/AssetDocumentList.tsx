import { FileTextOutlined, RightOutlined } from '@ant-design/icons';
export function AssetDocumentList({active,onOpen}:{active:string|null;onOpen(file:string):void}) { return <>
        {['README.md', 'AGENTS.md'].map(file => <button type="button" key={file} className={`resource-document-row${file === active ? ' reading' : ''}`} data-doc-row={file === 'README.md' ? 'readme' : 'agents'} onClick={() => onOpen(file)}><span className="resource-row-icon"><FileTextOutlined /></span><span className="resource-row-text"><strong>{file}</strong><small>{file === 'README.md' ? '服务说明与使用入口' : '实现规则与协作边界'}</small></span><RightOutlined /></button>)}
  </>; }
