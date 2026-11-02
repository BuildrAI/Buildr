import { useState } from 'react';
import { Button, Popover, Tag } from 'antd';
import { LoadingOutlined, RightOutlined } from '@ant-design/icons';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { RUN_STATUS_COLOR, RUN_STATUS_LABEL, activeRuns, sourceLabel } from '../model';
import type { ServiceRuntimeSummary } from '../api/service-runtime-api';

type Props = { service: ServiceRuntimeSummary; configuring?: boolean; onOpenDetail(): void };

/** 目录仅显示本地实例摘要；详细来源及独立操作在同一服务运行页。 */
export function ServiceRuntimeStatusCell({ service, configuring = false, onOpenDetail }: Props) {
  const [open, setOpen] = useState(false);
  const runs = activeRuns(service);
  const popoverNote = runs.length
    ? configuring ? <p>智能体正在检查运行配置；当前运行实例不受影响。</p> : null
    : configuring
      ? <p>智能体正在核对并保存运行定义；完成后这里会显示“未运行”和启动入口。</p>
      : <p>{service.definition ? '当前没有运行实例。' : '尚未配置已验证的启动方式。'}</p>;
  return <Popover open={open} onOpenChange={setOpen} trigger={['hover', 'click']} placement="bottomLeft" content={<div className="directory-popover"><div className="directory-popover-section"><h4>本地运行</h4>{runs.length ? <ul>{runs.map(run => <li key={run.id}><div className="directory-popover-line"><strong>{sourceLabel(run)}</strong><code>:{run.actualPort}</code><Tag color={RUN_STATUS_COLOR[run.status]}>{RUN_STATUS_LABEL[run.status]}</Tag></div><div className="directory-popover-line is-sub"><span>{run.branch || '分支未记录'}</span><span>{formatShortDateTime(run.startedAt)}</span></div></li>)}</ul> : null}{popoverNote}</div><Button type="link" size="small" onClick={() => { setOpen(false); onOpenDetail(); }}>查看本地运行 <RightOutlined /></Button></div>}>
    <div className="directory-status" data-service-runtime-status={service.code} data-service-runtime-configuring={configuring ? 'true' : undefined} onClick={event => event.stopPropagation()}>
      <span className="directory-env"><Tag color={runs.length ? 'success' : undefined}>本地</Tag><span className="directory-env-text">{runs.length ? <><span className="run-dot" aria-hidden="true" /><strong>{runs.length} 个运行中</strong></> : configuring ? <><LoadingOutlined spin aria-hidden="true" /><strong>{service.definition ? '检查中' : '配置中'}</strong></> : service.definition ? '未运行' : '未配置运行定义'}</span>{runs.length && configuring ? <Tag color="processing">检查中</Tag> : null}</span>
      {runs.length ? <span className="directory-run-ports">{runs.map(run => <span key={run.id}>{sourceLabel(run)} <code>:{run.actualPort}</code></span>)}</span> : null}
    </div>
  </Popover>;
}
