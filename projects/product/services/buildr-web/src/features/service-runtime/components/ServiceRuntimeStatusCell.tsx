import { useState } from 'react';
import { Button, Popover, Tag } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { formatShortDateTime } from '../../../lib/taskLabels';
import {
  DEPLOYMENT_STATE_COLOR,
  DEPLOYMENT_STATE_LABEL,
  activeRuns,
  deploymentSummary,
  environmentEntries,
  shortCommit,
} from '../model';
import type { ServiceRuntimeSummary } from '../api/service-runtime-api';

type Props = {
  service: ServiceRuntimeSummary;
  onOpenDetail(): void;
};

function localLine(service: ServiceRuntimeSummary) {
  if (!service.definition) return { tag: <Tag>本地</Tag>, text: <span className="directory-muted">未配置运行定义</span> };
  const runs = activeRuns(service);
  if (!runs.length) return { tag: <Tag>本地</Tag>, text: <span className="directory-muted">未运行</span> };
  return {
    tag: <Tag color="success">本地</Tag>,
    text: <span className="directory-env-text">
      <span className="run-dot" aria-hidden="true" />
      <strong>{runs.length} 个运行中</strong>
      <span className="directory-run-ports">{runs.map(run => <span key={run.id}>{run.worktreeLabel} <code>:{run.actualPort}</code></span>)}</span>
    </span>,
  };
}

function statusPopover(service: ServiceRuntimeSummary, onOpenDetail: () => void) {
  return <div className="directory-popover">
    <div className="directory-popover-section">
      <h4>本地运行</h4>
      {!service.definition ? <p>未配置运行定义；运行配置由智能体读取仓库事实并实际验证后生成。</p>
        : activeRuns(service).length ? <ul>
          {activeRuns(service).map(run => <li key={run.id}>
            <strong>{run.worktreeLabel}</strong>
            <code>:{run.actualPort}</code>
            <span>{run.branch ?? '—'} · {formatShortDateTime(run.startedAt)}</span>
            <span className="directory-muted">{run.portNote}</span>
          </li>)}
        </ul>
        : <p>当前没有运行实例。</p>}
    </div>
    {environmentEntries(service).map(environment => <div className="directory-popover-section" key={environment.id}>
      <h4>{environment.label} 部署</h4>
      {environment.defined ? <>
        <p>{environment.latest ? deploymentSummary(environment.latest) : '还没有提交过部署'}</p>
        {environment.latest?.externalUrl ? <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} href={environment.latest.externalUrl} target="_blank" rel="noreferrer">打开外部系统 <RightOutlined /></Button> : null}
      </> : <p>尚未配置 {environment.label} 部署目标。</p>}
    </div>)}
    <Button size="small" type="link" style={{ padding: 0, height: 'auto' }} onClick={onOpenDetail}>查看服务详情 <RightOutlined /></Button>
  </div>;
}

/** 目录状态列合并本地运行与各环境最近结果；显示不完整时悬停或点击查看浮窗。 */
export function ServiceRuntimeStatusCell({ service, onOpenDetail }: Props) {
  const [open, setOpen] = useState(false);
  const local = localLine(service);
  // 单元格固定两行：优先显示已配置环境，其余环境在浮窗展开，避免增加行高。
  const [primary, ...rest] = environmentEntries(service).sort((left, right) => Number(right.defined) - Number(left.defined));
  return <Popover open={open} onOpenChange={setOpen} trigger={['hover', 'click']} placement="bottomLeft" content={statusPopover(service, () => { setOpen(false); onOpenDetail(); })}>
    <div className="directory-status" data-service-runtime-status={service.code} onClick={event => event.stopPropagation()}>
      <span className="directory-env">{local.tag}{local.text}</span>
      {primary ? <span className="directory-env" data-service-runtime-environment={primary.id}>
        <Tag color={primary.latest ? DEPLOYMENT_STATE_COLOR[primary.latest.state] : undefined}>{primary.label}</Tag>
        <span className="directory-env-text">{primary.defined
          ? primary.latest ? `${DEPLOYMENT_STATE_LABEL[primary.latest.state]} · ${primary.latest.version ?? `${primary.latest.branch}@${shortCommit(primary.latest.commit)}`}` : '未部署'
          : '未配置'}
          {rest.length ? <span className="directory-muted">另 {rest.length} 个环境</span> : null}</span>
      </span> : null}
    </div>
  </Popover>;
}
