import { Link } from 'react-router-dom';
import { Alert, Tag } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { useServiceRuntimeOverview } from '../hooks/useServiceRuntime';

/** 工作台只读汇总：本地受管运行实例与跳转；启动、停止和日志在服务页操作。 */
export function WorkbenchLocalRuns() {
  const { workspaceId } = useAppShell();
  const overview = useServiceRuntimeOverview(workspaceId);
  const href = (path: string) => workspaceHref(workspaceId, path);
  const runs = overview.data?.local.active ?? [];
  const serviceOf = (code: string) => overview.data?.services.find(service => service.code === code);

  return <section className="workbench-rail-card" id="workbench-local-runs">
    <div className="workbench-section-heading">
      <h2>本地运行 <span className="workbench-count">{overview.data ? runs.length : '—'}</span></h2>
      <Link className="workbench-link" to={href('/services')}>服务目录 <ArrowRightOutlined /></Link>
    </div>
    {overview.error ? <Alert type="warning" showIcon message={overview.error} /> : null}
    {runs.length ? runs.map(run => {
      const service = serviceOf(run.serviceCode);
      return <div className="workbench-run-row" key={run.id}>
        <Link to={href('/services/' + encodeURIComponent(service?.id ?? run.serviceCode))}>
          <span className="run-dot" aria-hidden="true" />
          <span className="workbench-run-main">
            <strong>{service?.name ?? run.serviceCode}</strong>
            <small>{run.worktreeLabel} · {run.branch ?? '—'} · {formatShortDateTime(run.startedAt)}</small>
          </span>
          <span className="workbench-run-port">:{run.actualPort}</span>
        </Link>
        {run.status === 'starting' ? <Tag color="processing">启动中</Tag> : null}
      </div>;
    }) : <p className="workbench-muted">{overview.data ? '本地没有运行中的服务。去服务目录启动。' : '正在读取本地运行状态…'}</p>}
    <p className="workbench-muted workbench-local-note">只读状态；启动、停止和日志在服务页管理。</p>
  </section>;
}
