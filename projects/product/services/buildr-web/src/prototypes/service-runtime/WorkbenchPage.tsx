import { App, Button, Select, Space, Tag } from 'antd';
import { ReloadOutlined, RightOutlined } from '@ant-design/icons';
import type { Service } from './model';
import { worktreeOf } from './model';

type Props = {
  services: Service[];
  onOpenDirectory(): void;
  onOpenService(serviceId: string): void;
};

const tasks = [
  {
    title: '供应商入驻四服务部署 QA',
    summary: '已提交云雀，等待构建结果。',
    projects: ['基础服务', '鲜肉业务'],
  },
  {
    title: '修复原奶供应商消息开户依赖登录态',
    summary: '本地服务运行中，等待业务验证。',
    projects: ['原奶项目'],
  },
];

export function WorkbenchPage({ services, onOpenDirectory, onOpenService }: Props) {
  const { message } = App.useApp();
  const runs = services.flatMap(service => service.runs.map(run => ({ service, run })));

  return <div className="workbench-home" data-prototype-position="workbench">
    <header className="workbench-head">
      <div>
        <p className="workbench-date">10月21日 星期三</p>
        <h1>工作概览</h1>
        <p>2 项工作正在推进，{runs.length} 个本地实例运行中。</p>
      </div>
      <Space>
        <Select
          size="middle"
          value="all"
          options={[{ value: 'all', label: '全部项目' }]}
          onChange={() => message.info('原型只展示集鲜工作空间。')}
        />
        <Button icon={<ReloadOutlined />} onClick={() => message.info('原型数据不会刷新。')}>刷新</Button>
      </Space>
    </header>

    <div className="workbench-grid">
      <section className="workbench-local" data-prototype-position="workbench-local">
        <div className="workbench-local-head">
          <div><h2>本地运行</h2><Tag color={runs.length ? 'green' : undefined}>{runs.length} 个实例</Tag></div>
          <button type="button" onClick={onOpenDirectory}>服务目录 <RightOutlined /></button>
        </div>
        {runs.length ? <div className="workbench-run-list">
          {runs.map(({ service, run }) => {
            const worktree = worktreeOf(service, run);
            return <button key={run.id} type="button" className="workbench-run-row" onClick={() => onOpenService(service.id)}>
              <span className="run-dot" aria-hidden="true" />
              <span className="workbench-run-main"><strong>{service.name}</strong><small>{worktree.label} · {worktree.branch}</small></span>
              <span className="workbench-run-port">:{run.actualPort}</span>
            </button>;
          })}
        </div> : <p className="workbench-empty">本地没有运行中的服务。去服务目录启动。</p>}
        <p className="workbench-local-note">只读状态；启动、停止和日志在服务目录管理。</p>
      </section>

      <div className="workbench-main">
        <section className="workbench-section">
          <div className="workbench-section-head"><h2>继续推进 <span>2</span></h2><button type="button" onClick={() => message.info('原型只展示当前两条工作。')}>全部任务 <RightOutlined /></button></div>
          <div className="workbench-task-list">
            {tasks.map(task => <article key={task.title} className="workbench-task">
              <div>
                <h3>{task.title}</h3>
                <p>{task.summary}</p>
                <Space size={4} wrap>{task.projects.map(project => <Tag key={project}>{project}</Tag>)}</Space>
              </div>
              <Button size="small" onClick={() => message.info('原型不打开任务详情。')}>查看</Button>
            </article>)}
          </div>
        </section>

        <section className="workbench-section">
          <div className="workbench-section-head"><h2>接下来准备做</h2><button type="button" onClick={() => message.info('原型不展示待办详情。')}>查看待办 <RightOutlined /></button></div>
          <p className="workbench-empty">在待办详情中选择“加入接下来做”，安排准备推进的工作。</p>
        </section>

        <section className="workbench-section">
          <div className="workbench-section-head"><h2>近期完成</h2><button type="button" onClick={() => message.info('原型不展示完成记录。')}>查看完成记录 <RightOutlined /></button></div>
          <article className="workbench-done">
            <strong>生猪与白条企业供应商新入驻</strong>
            <p>代码收尾完成，706 项相关测试通过，两个规范已归档。</p>
            <span>鲜肉业务 · 2026/10/21 11:50:36</span>
          </article>
        </section>
      </div>

      <aside className="workbench-aside">
        <section className="workbench-side-card">
          <div className="workbench-section-head"><h2>常用入口</h2></div>
          <p className="workbench-side-line">已收藏</p>
          <p className="workbench-empty">还没有收藏。阅读资料时可以收藏到这里。</p>
        </section>

        <section className="workbench-side-card">
          <div className="workbench-section-head"><h2>关注的项目</h2><button type="button" onClick={() => message.info('原型不打开项目列表。')}>全部 <RightOutlined /></button></div>
          <ul className="workbench-project-list">
            {['鸡蛋业务', '基础服务', '鲜肉业务'].map(project => <li key={project}><span className="run-dot" aria-hidden="true" />{project}</li>)}
          </ul>
        </section>
      </aside>
    </div>
  </div>;
}
