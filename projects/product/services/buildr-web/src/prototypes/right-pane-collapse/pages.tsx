import { Button, Tabs, Tag } from 'antd';
import { FileTextOutlined, MoreOutlined, PlusOutlined, RightOutlined, StarOutlined } from '@ant-design/icons';
import type { WorkspacePageTab } from '../../app/pageTabs';
import { ResourceDirectory } from '../../components/ResourceDirectory';
import type { FileEditingDocument } from '../../components/file-editing/file-editing-types';
import { ProjectHomeHeader } from '../../features/project/components/ProjectHomeHeader';
import { ProjectHomeEntries } from '../../features/project/components/ProjectHomeEntries';
import { ProjectServicesView } from '../../features/project/components/ProjectServicesView';

export const projectTab: WorkspacePageTab = { key: 'project:product', kind: 'proj', title: 'Buildr 产品', path: '/projects/product' };
export const pageCatalog: WorkspacePageTab[] = [projectTab,
  { key: 'dir:services', kind: 'dir', title: '服务', path: '/services' },
  { key: 'dir:connections', kind: 'dir', title: '连接', path: '/connections' },
  { key: 'dir:repositories', kind: 'dir', title: '代码库', path: '/repositories' },
  { key: 'dir:skills', kind: 'dir', title: '技能', path: '/skills' },
  { key: 'dir:articles', kind: 'dir', title: '文章', path: '/articles' },
  { key: 'dir:projects', kind: 'dir', title: '项目', path: '/projects' },
  { key: 'dir:workspace-overview', kind: 'dir', title: '总览', path: '/workspace-overview' },
];
export const initialPageTabs = pageCatalog.slice(0, 3);
export function pageForNavigation(key: string) { return pageCatalog.find(tab => tab.path === '/' + key)!; }

type DemoResource = { id: string; name: string; description: string; environment?: string; address?: string };
const services = [
  { id: 'buildr', code: 'buildr', name: 'Buildr 后端', description: '命令行、本机运行、验证与维护。' },
  { id: 'buildr-web', code: 'buildr-web', name: 'Buildr 前端', description: '页面、交互与样式。' },
  { id: 'dsh-plugin', code: 'dsh-plugin', name: 'DSH 插件', description: '桌面插件的构建与交付。' },
];
const directoryData: Record<string, { description: string; rows: DemoResource[] }> = {
  projects: { description: '从项目进入业务目标与相关资料。', rows: [{ id: 'product', name: 'Buildr 产品', description: '人和智能体（Agent）的共同工作现场。' }] },
  services: { description: '了解实现职责，连接业务与代码。', rows: services },
  connections: { description: '管理外部系统连接，供你和智能体（Agent）使用。', rows: [
    { id: 'demo-business', name: '演示业务库', description: '数据源 / MySQL', environment: '开发', address: 'mysql.demo.invalid:3306' },
    { id: 'demo-analytics', name: '演示分析库', description: '数据源 / MySQL', environment: '测试', address: 'analytics.demo.invalid:3306' },
  ] },
  repositories: { description: '查看代码库与工作位置。', rows: [{ id: 'buildr', name: 'Buildr', description: 'Buildr 产品代码。' }] },
  skills: { description: '查看人和智能体（Agent）共同使用的工作能力。', rows: [{ id: 'ui-prototype', name: '界面原型', description: '制作可交互的讨论成果。' }, { id: 'frontend-development', name: '前端开发', description: '复用真实页面和组件。' }] },
  articles: { description: '查看项目文章与工作成果。', rows: [{ id: 'collaboration', name: '共同的工作现场', description: '保留可以继续查看和接续的成果。' }] },
  'workspace-overview': { description: '从工作空间中的项目与资料开始。', rows: [{ id: 'product', name: 'Buildr 产品', description: '人和智能体（Agent）的共同工作现场。' }] },
};

export function PrototypePageContent({ pageKey, files, onOpenFile, onOpenPage, onInfo }: { pageKey: string; files: FileEditingDocument[]; onOpenFile(id: string): void; onOpenPage(key: string): void; onInfo(): void }) {
  if (pageKey !== projectTab.key) {
    const tab = pageCatalog.find(item => item.key === pageKey)!;
    const directory = directoryData[tab.path.slice(1)];
    return <div data-prototype-position="directory-page"><ResourceDirectory<DemoResource> title={tab.title} noun={tab.title} description={directory.description} data={directory.rows}
      rowKey={item => item.id} name={item => item.name} summary={item => item.description} onRefresh={onInfo} onOpen={tab.key === 'dir:projects' || tab.key === 'dir:workspace-overview' ? () => onOpenPage(projectTab.key) : onInfo} onEdit={onInfo}
      searchId={`demo-${tab.path.slice(1)}-search`} actions={<Button type="primary" icon={<PlusOutlined />} onClick={onInfo}>新增{tab.title}</Button>}
      columns={tab.key === 'dir:connections' ? [{ title: '环境', width: 90, render: (_, item) => <Tag>{item.environment}</Tag> }, { title: '地址', width: 240, render: (_, item) => <code>{item.address}</code> }] : []} /></div>;
  }
  return <div className="project-home" data-prototype-position="project-page">
    <ProjectHomeHeader project={{ name: 'Buildr 产品', description: '围绕代码、文档与工作成果，让人和智能体（Agent）在同一现场协作。' }} href={() => '/projects/product'} onWork={onInfo} actions={<><Button icon={<StarOutlined />} onClick={onInfo}>关注项目</Button><Button onClick={onInfo}>编辑项目</Button><Button aria-label="更多项目操作" icon={<MoreOutlined />} onClick={onInfo} /></>} />
    <Tabs activeKey="overview" items={[{ key: 'overview', label: '概览' }, { key: 'composition', label: '项目组成' }]} onChange={onInfo} />
    <ProjectHomeEntries projectCode="product" href={() => '/projects/product'} onEntry={(_ref, event) => { event.preventDefault(); onInfo(); }} />
    <div className="project-home-details"><section className="resource-section" aria-label="项目资料" data-prototype-position="document-list"><div className="ws-section-head"><h2>项目资料 <span className="ws-count">2 个入口</span></h2></div><div className="ws-obj-list">{files.map(file => <button key={file.id} type="button" className="ws-obj-row" data-doc-row={file.id} onClick={() => onOpenFile(file.id)}><span className="ws-obj-ico"><FileTextOutlined /></span><span className="ws-obj-name">{file.id === 'readme' ? '项目文档' : '协作约定'}</span><small>{file.path.split('/').at(-1)}</small><RightOutlined className="ws-go" /></button>)}</div></section>
      <section className="resource-section"><ProjectServicesView services={services} linkedIds={services.map(item => item.id)} disabled onReload={onInfo} onSave={async () => {}} onCreate={onInfo} serviceHref={() => '#'} onOpen={onInfo} /></section></div>
  </div>;
}
