import { useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App, Button, ConfigProvider, Dropdown, Input, Segmented, Tag, Tooltip } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  AppstoreOutlined, BranchesOutlined, CopyOutlined, FileImageOutlined, FileTextOutlined,
  FolderOutlined, HomeOutlined, PictureOutlined, PlusOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { AppShellHeader } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { usePrototypeBridge } from '../prototype-bridge';
import { softProductTheme } from '../../theme';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import '../../features/publication/publication.css';
import './preview.css';

const TITLE = 'Buildr：让 Agent 越做越多，越做越好';
const BODY_MD = `# Buildr：让 Agent 越做越多，越做越好

![工作资产贯穿产品、前端、后端和测试的示意图](assets/buildr-agent-more-and-better.webp)

过去几年，我们一直在学习怎么把大模型用进工作。模型越来越会理解意图、调用工具、写代码、分析资料，甚至能把一个任务推进很远。

但真正开始用 Agent 做事后，我越来越强烈地感到：问题已经不只是"Agent 能不能完成一次任务"，而是它完成之后，下一步能不能接着做。

## 一项工作，不是一次对话

一项真实的工作，往往从一个模糊的想法开始，经过产品判断、方案设计、前后端开发、测试验证，最后才到发布。中间会涉及多个代码仓、历史决策、业务规则、外部工具和不同角色。

今天，产品可以让 Agent 做调研和文档；开发可以拿着产品结果完成前端和后端；测试也可以基于页面、接口和需求进行验证。但这些工作仍常常是割裂的：前后端各自推进，测试不知道该依赖哪些预期验证；开发中途改了功能，上下游又得靠会议、聊天和反复解释重新对齐。

如果需求、规则、实现和验证结果只留在聊天记录、个人经验、本机文件和零散文档里，每一次换人、换 Agent、换窗口，工作就会重新开始。Agent 很聪明，却常常像一个刚入职的同事：需要重新解释背景，重新确认规则，也可能重新踩一遍已经踩过的坑。

> 这不是模型能力的问题。这是工作没有被组织起来的问题。

## 只靠 Agent 还不够

Buildr 是我最近在做的一件事。它不是另一个 Agent，也不打算替 Agent 规划、思考或执行任务。它要补上的，是 Agent 之间、工作环节之间没有共同基础的问题。

Buildr 要做的，是把散落在个人经验、文档、仓库和不同工具中的内容，组织成 Agent 可发现、可选择、可使用的工作资产。人负责目标、业务判断和关键授权；Agent 负责理解任务、调用工具、推进工作；Buildr 让它们共同依赖的内容不必每次从零开始。

## 真正要积累的，不是提示词

当 Agent 开始参与真实工作时，真正值得长期留下来的通常有两类东西。

**工作事实：**我们在做什么，业务如何运转，哪些项目、服务、代码和规范彼此相关。

**工作方法：**我们应该怎么做，哪些边界不能碰，怎样测试、发布、排查和交接。

前者让 Agent 知道"这件事是什么"；后者让 Agent 知道"这件事该怎样稳妥地完成"。Buildr 不把所有资料塞进上下文窗口，而是让 Agent 在需要时，能够找到与当前任务相关的需求、约束、服务、变更和验证证据。

## 变更不再靠节点传递

真正考验协作的，往往不是第一次把功能做出来，而是中途发生变化之后。过去，一条需求调整需要沿着产品、开发、测试等节点逐一传递；每个岗位或责任范围收到信息后，再在自己的上下文里理解影响、实施调整，并由上下游继续验证。

当需求、实现、服务关系、验证方式和已有结果都被组织在同一套工作资产中，变更一旦产生，就不再只是等待传递的消息。Agent 可以直接基于共同事实识别它影响了什么、涉及哪些服务、需要调整哪些实现、补哪些验证，并继续沿着整条工作链推进。没有信息在节点间传递时的阻塞、延迟和遗忘，上下游也不必依靠转述猜测变化。

## 先让 Agent 真正把一件事做完`;

function ArticleBodyHtml() {
  return <div className="markdown-body" data-prototype-position="article-content">
    <h1 data-article-heading="0">{TITLE}</h1>
    <p><img alt="工作资产贯穿产品、前端、后端和测试的示意图" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='240'%3E%3Crect fill='%23f3efe4' width='900' height='240' rx='6'/%3E%3Ctext x='450' y='125' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%238b8471'%3E工作资产贯穿产品、前端、后端和测试的示意图（webp）%3C/text%3E%3C/svg%3E" /></p>
    <p>过去几年，我们一直在学习怎么把大模型用进工作。模型越来越会理解意图、调用工具、写代码、分析资料，甚至能把一个任务推进很远。</p>
    <p>但真正开始用 Agent 做事后，我越来越强烈地感到：问题已经不只是"Agent 能不能完成一次任务"，而是它完成之后，下一步能不能接着做。</p>
    <h2 data-article-heading="1">一项工作，不是一次对话</h2>
    <p>一项真实的工作，往往从一个模糊的想法开始，经过产品判断、方案设计、前后端开发、测试验证，最后才到发布。中间会涉及多个代码仓、历史决策、业务规则、外部工具和不同角色。</p>
    <p>今天，产品可以让 Agent 做调研和文档；开发可以拿着产品结果完成前端和后端；测试也可以基于页面、接口和需求进行验证。但这些工作仍常常是割裂的：前后端各自推进，测试不知道该依赖哪些预期验证；开发中途改了功能，上下游又得靠会议、聊天和反复解释重新对齐。</p>
    <p>如果需求、规则、实现和验证结果只留在聊天记录、个人经验、本机文件和零散文档里，每一次换人、换 Agent、换窗口，工作就会重新开始。Agent 很聪明，却常常像一个刚入职的同事：需要重新解释背景，重新确认规则，也可能重新踩一遍已经踩过的坑。</p>
    <blockquote><p>这不是模型能力的问题。这是工作没有被组织起来的问题。</p></blockquote>
    <h2 data-article-heading="2">只靠 Agent 还不够</h2>
    <p>Buildr 是我最近在做的一件事。它不是另一个 Agent，也不打算替 Agent 规划、思考或执行任务。它要补上的，是 Agent 之间、工作环节之间没有共同基础的问题。</p>
    <p>Buildr 要做的，是把散落在个人经验、文档、仓库和不同工具中的内容，组织成 Agent 可发现、可选择、可使用的工作资产。人负责目标、业务判断和关键授权；Agent 负责理解任务、调用工具、推进工作；Buildr 让它们共同依赖的内容不必每次从零开始。</p>
    <h2 data-article-heading="3">真正要积累的，不是提示词</h2>
    <p>当 Agent 开始参与真实工作时，真正值得长期留下来的通常有两类东西。</p>
    <p><strong>工作事实：</strong>我们在做什么，业务如何运转，哪些项目、服务、代码和规范彼此相关。</p>
    <p><strong>工作方法：</strong>我们应该怎么做，哪些边界不能碰，怎样测试、发布、排查和交接。</p>
    <p>前者让 Agent 知道"这件事是什么"；后者让 Agent 知道"这件事该怎样稳妥地完成"。Buildr 不把所有资料塞进上下文窗口，而是让 Agent 在需要时，能够找到与当前任务相关的需求、约束、服务、变更和验证证据。</p>
    <h2 data-article-heading="4">变更不再靠节点传递</h2>
    <p>真正考验协作的，往往不是第一次把功能做出来，而是中途发生变化之后。过去，一条需求调整需要沿着产品、开发、测试等节点逐一传递；每个岗位或责任范围收到信息后，再在自己的上下文里理解影响、实施调整，并由上下游继续验证。</p>
    <p>当需求、实现、服务关系、验证方式和已有结果都被组织在同一套工作资产中，变更一旦产生，就不再只是等待传递的消息。Agent 可以直接基于共同事实识别它影响了什么、涉及哪些服务、需要调整哪些实现、补哪些验证，并继续沿着整条工作链推进。没有信息在节点间传递时的阻塞、延迟和遗忘，上下游也不必依靠转述猜测变化。</p>
    <h2 data-article-heading="5">先让 Agent 真正把一件事做完</h2>
    <p>我不认为 Agent 时代最重要的体验只是"生成得更快"。更重要的是：能不能在一个窗口里，把一件真实的事从探索持续推进到完成——能继续、能交接、能复核，也能沉淀为下一件工作的共同基础。</p>
  </div>;
}

function Toc() {
  const items = [TITLE, '一项工作，不是一次对话', '只靠 Agent 还不够', '真正要积累的，不是提示词', '变更不再靠节点传递', '先让 Agent 真正把一件事做完'];
  return <aside className="publication-toc" data-prototype-position="toc">
    <div className="publication-toc-label">本文目录</div>
    <nav className="publication-toc-links">{items.map((item, index) => <button key={index} type="button" className={index === 0 ? '' : 'nested'}>{item}</button>)}</nav>
    <div className="publication-record-summary" data-prototype-position="publish-records">
      <h2>发布记录</h2>
      <div id="publication-targets"><div><span>墨问</span><Tag className="publication-state published">已发布</Tag></div><div><span>微信公众号</span><Tag className="publication-state planned">待发布</Tag></div><div><span>Buildr Web</span><Tag className="publication-state published">已发布</Tag></div></div>
      <Button type="link" size="small">查看发布记录 →</Button>
    </div>
  </aside>;
}

function ToolsAside() {
  return <aside className="publication-tools-aside" data-prototype-position="tools-aside">
    <section className="publication-tools-card">
      <div className="publication-aside-heading"><h2>图片与附件</h2><Button type="text" size="small" icon={<CopyOutlined />} /></div>
      <p className="publication-hint">文件保存在项目 assets/ 中，通过引用加入文章。</p>
      <Button block icon={<PlusOutlined />}>上传图片或附件</Button>
      <p className="publication-hint">图片最大 5 MB，附件最大 10 MB。</p>
      <div className="publication-assets-list">
        <div className="publication-asset"><div className="publication-attachment"><FileImageOutlined /><small>webp</small></div><div className="publication-asset-title"><strong>buildr-agent-more-and-better.webp</strong><Tag>已引用</Tag></div><code>assets/buildr-agent-more-and-better.webp</code><small>105 KB</small><Button size="small" block icon={<PictureOutlined />}>插入引用</Button></div>
      </div>
    </section>
    <section className="publication-tools-card publication-edit-methods">
      <div className="publication-aside-heading"><h2>让智能体（Agent）帮一把</h2></div>
      {['润色表达', '审校内容', '改写平台版'].map(name => <Button key={name} type="text" block>{name}<span>→</span></Button>)}
      <p className="publication-hint">保存编辑后，可带上最新内容准备写作请求。</p>
    </section>
  </aside>;
}

function Preview() {
  const { message } = App.useApp();
  const current = useRef({ page: 'article-reader', state: '' });
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [innerMode, setInnerMode] = useState<'edit' | 'preview'>('edit');
  const [dirty, setDirty] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const bridge = usePrototypeBridge(scenes.pages, current, (page, state) => {
    if (page === 'article-reader') { setMode('read'); }
    else { setMode('edit'); setInnerMode(state === 'preview' ? 'preview' : 'edit'); setDirty(state === 'dirty'); }
  });
  const enterEdit = () => { setMode('edit'); setInnerMode('edit'); bridge.report('article-editor', ''); };
  const leaveToRead = () => { setMode('read'); setDirty(false); bridge.report('article-reader', ''); message.success('已回到正文视图'); };
  const info = () => message.info('这里只演示编辑链路的布局，不保存真实数据。');
  const nav: Array<[string, string, ReactNode]> = [['overview', '总览', <HomeOutlined />], ['projects', '项目', <FolderOutlined />], ['services', '服务', <AppstoreOutlined />], ['repositories', '代码库', <BranchesOutlined />], ['skills', '技能', <ThunderboltOutlined />], ['articles', '文章', <FileTextOutlined />]];
  const overflowItems = [
    { key: 'copy', label: '复制原文' },
    { key: 'export', label: '导出 Markdown' },
    { type: 'divider' as const },
    { key: 'records', label: '发布记录' },
    { key: 'delete', label: '删除文章', danger: true },
  ];
  return <div className="app-shell area-workspace">
    <AppShellHeader development brandHref="/articles" workspaceName="Buildr" workspaceMenuItems={[{ key: 'x', label: 'Buildr · 演示数据' }]} area="workspace" workbenchHref="/workbench" workspaceDestination={{ to: '/articles' }} actions={<><Tooltip title="沿用现有入口，本次仅演示布局"><Button type="text" onClick={info} icon={<PlusOutlined />}>交给 Agent</Button></Tooltip></>} />
    <div className={`app-frame${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar"><div className="app-sidebar-head"><Button type="text" className="sidebar-toggle" aria-label={collapsed ? '展开菜单' : '折叠菜单'} icon={collapsed ? <FileTextOutlined /> : <FileTextOutlined />} onClick={() => setCollapsed(v => !v)} /></div><nav className="shell-navigation" aria-label="工作空间导航"><p className="shell-nav-caption">工作空间</p>{nav.map(([key, label, icon]) => <AppNavigationItem key={key} name={key} label={label} icon={icon} to={'/' + key} path={'/' + key} active={key === 'articles'} onClick={e => { e.preventDefault(); if (key !== 'articles') info(); }} />)}</nav></aside>
      <div className="workspace-page-stack"><div className="workspace-page proto-article-page">
        <div className="publication-page publication-reader">
          <header className="publication-reader-head">
            <div className="publication-reader-topline"><span>Buildr 产品</span><span>/</span><span>文章</span><Tag className="publication-state published">已发布</Tag></div>
            <h1>{TITLE}</h1>
            <p className="publication-deck">当 Agent 能完成一次任务之后，真正难的问题是怎么让它接着做下一件事。</p>
            <div className="publication-reader-meta" data-prototype-position="meta-strip"><span>更新于 2026/10/19</span><span>约 5 分钟阅读</span><span>所属项目：Buildr 产品</span><span>稿件状态：已发布</span></div>
          </header>
          <div className="proto-modebar" data-prototype-position="modebar">
            <Segmented value={mode === 'read' ? 'read' : 'edit'} onChange={value => { if (value === 'edit') enterEdit(); else leaveToRead(); }} options={[{ label: '正文', value: 'read' }, { label: '编辑', value: 'edit' }]} />
            {mode === 'edit' && <div className="proto-mode-actions" data-prototype-position="editor-actions"><span className="publication-muted">{dirty ? '有尚未保存的修改' : '当前稿件已保存'}</span><Button onClick={() => { setDirty(false); message.success('已保存（演示）'); }} type="primary">保存修改</Button><Button onClick={leaveToRead}>取消</Button></div>}
            {mode === 'read' && <div className="proto-mode-actions"><Dropdown trigger={['click']} menu={{ items: overflowItems, onClick: ({ key }) => { if (key === 'copy') { void navigator.clipboard.writeText(BODY_MD); message.success('已复制原文'); } else info(); } }}><Button type="text" data-prototype-position="overflow-menu">⋯</Button></Dropdown></div>}
          </div>
          {mode === 'read' && <div className="publication-reading-layout"><Toc /><div className="publication-reading-content"><ArticleBodyHtml /></div><ToolsAside /></div>}
          {mode === 'edit' && <div className="proto-editor-layout">
            <div className="proto-editor-main" data-prototype-position="editor-body">
              <div className="proto-field"><label>标题</label><Input className="publication-title-input" defaultValue={TITLE} onChange={() => setDirty(true)} /></div>
              <div className="proto-field"><label>摘要</label><Input.TextArea rows={2} defaultValue="当 Agent 能完成一次任务之后，真正难的问题是怎么让它接着做下一件事。" onChange={() => setDirty(true)} /></div>
              <div className="proto-field"><div className="publication-editor-toolbar"><label>正文</label><Segmented size="small" value={innerMode} onChange={v => { setInnerMode(v as 'edit' | 'preview'); bridge.report('article-editor', v === 'preview' ? 'preview' : dirty ? 'dirty' : ''); }} options={[{ label: '编辑', value: 'edit' }, { label: '预览', value: 'preview' }]} /></div>
                {innerMode === 'edit' ? <Input.TextArea className="publication-writing-area" autoSize={{ minRows: 14 }} defaultValue={BODY_MD} onChange={() => setDirty(true)} />
                  : <div className="publication-editor-preview" data-prototype-position="editor-preview"><div className="publication-body"><ArticleBodyHtml /></div></div>}
              </div>
              <p className="publication-hint" data-prototype-position="dirty-hint">{dirty ? '有尚未保存的修改，切换「正文」前记得保存。' : '支持 Markdown 标题、列表、链接和图片。上传完成后插入资源引用，保存后正文才会更新。'}</p>
            </div>
            <ToolsAside />
          </div>}

        </div>
      </div></div>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter><Preview /></MemoryRouter></App></ConfigProvider>);
