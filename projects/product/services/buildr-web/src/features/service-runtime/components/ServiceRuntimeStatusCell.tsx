import { useState } from 'react';
import { Button, Popover, Tag } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { formatShortDateTime } from '../../../lib/taskLabels';
import { RUN_STATUS_COLOR, RUN_STATUS_LABEL, activeRuns, sourceLabel } from '../model';
import type { ServiceRuntimeSummary } from '../api/service-runtime-api';

type Props = { service: ServiceRuntimeSummary; onOpenDetail(): void };

/** 目录仅显示本地实例摘要；详细来源及独立操作在同一服务运行页。 */
export function ServiceRuntimeStatusCell({ service, onOpenDetail }: Props) {
  const [open, setOpen] = useState(false);
  const runs = activeRuns(service);
  return <Popover open={open} onOpenChange={setOpen} trigger={['hover', 'click']} placement="bottomLeft" content={<div className="directory-popover"><div className="directory-popover-section"><h4>本地运行</h4>{runs.length ? <ul>{runs.map(run => <li key={run.id}><div className="directory-popover-line"><strong>{sourceLabel(run)}</strong><code>:{run.actualPort}</code><Tag color={RUN_STATUS_COLOR[run.status]}>{RUN_STATUS_LABEL[run.status]}</Tag></div><div className="directory-popover-line is-sub"><span>{run.branch || '分支未记录'}</span><span>{formatShortDateTime(run.startedAt)}</span></div></li>)}</ul> : <p>{service.definition ? '当前没有运行实例。' : '尚未配置已验证的启动方式。'}</p>}</div><Button type="link" size="small" onClick={() => { setOpen(false); onOpenDetail(); }}>查看本地运行 <RightOutlined /></Button></div>}>
    <div className="directory-status" data-service-runtime-status={service.code} onClick={event => event.stopPropagation()}>
      <span className="directory-env"><Tag color={runs.length ? 'success' : undefined}>本地</Tag><span className="directory-env-text">{runs.length ? <><span className="run-dot" aria-hidden="true" /><strong>{runs.length} 个运行中</strong></> : service.definition ? '未运行' : '未配置运行定义'}</span></span>
      {runs.length ? <span className="directory-run-ports">{runs.map(run => <span key={run.id}>{sourceLabel(run)} <code>:{run.actualPort}</code></span>)}</span> : null}
    </div>
  </Popover>;
}
