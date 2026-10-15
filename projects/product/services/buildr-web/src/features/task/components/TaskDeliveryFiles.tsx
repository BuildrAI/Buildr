import { Alert, Spin, Tree, type TreeDataNode } from 'antd';
import { FileImageOutlined, FileTextOutlined, FolderOutlined } from '@ant-design/icons';
import type { TaskChangeState } from '../hooks/useTaskArtifacts';
import type { TaskReadTarget } from './taskWorkContent';
import { deliveryFileTree, type DeliveryFileNode } from './task-delivery-files';
import './task-delivery-files.css';

export function TaskDeliveryFiles({ changes, loading = false, onRead }: { changes: TaskChangeState[]; loading?: boolean; onRead(target: TaskReadTarget): void }) {
  const sources = changes.filter(source => source.kind === 'ready');
  const count = sources.reduce((total, source) => total + (source.change.assets?.length || 0), 0);
  const nodes = (items: DeliveryFileNode[], changeKey: string): TreeDataNode[] => items.map(item => ({
    key: item.key, selectable: false,
    title: item.asset ? <button type="button" className="task-delivery-file" data-task-delivery-file={item.asset.relativePath} title={item.asset.relativePath} onClick={() => onRead({ kind: 'change-asset', changeKey, path: item.asset!.relativePath, sourceIdentity: item.asset!.sourceIdentity, title: item.asset!.name })}>{item.title}</button> : <span>{item.title}</span>,
    icon: item.asset ? item.asset.kind === 'image' ? <FileImageOutlined /> : <FileTextOutlined /> : <FolderOutlined />,
    ...(item.children ? { children: nodes(item.children, changeKey) } : { isLeaf: true }),
  }));
  return <section className="task-delivery-files" aria-label="交付资料" data-task-delivery-files>
    <h3>交付资料{count > 0 && <span className="task-badge">{count}</span>}</h3>
    {changes.map(source => source.kind === 'missing' ? <Alert key={source.key} type="warning" message={source.message} /> : null)}
    {loading && !count ? <div className="task-content-loading"><Spin size="small" /> 正在读取交付资料…</div> : !count && <p className="task-node-empty">暂无额外交付资料。</p>}
    {sources.map(source => <div key={source.key} className="task-delivery-source">
      {sources.length > 1 && <p className="task-report-meta">{source.key}</p>}
      {source.change.assetDiagnostics?.map((diagnostic, index) => <Alert key={`${diagnostic.code}:${index}`} type="warning" message={diagnostic.message} />)}
      {Boolean(source.change.assets?.length) && <Tree showIcon blockNode defaultExpandAll treeData={nodes(deliveryFileTree(source.change.assets || [], source.key), source.key)} />}
    </div>)}
  </section>;
}
