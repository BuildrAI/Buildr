import { Link } from 'react-router-dom';
import { Alert, Button, Empty } from 'antd';
import { ArrowRightOutlined, HistoryOutlined } from '@ant-design/icons';
import type { WorkbenchResponse } from '../../../../build/generated/workbench-dto';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { formatDateTime } from '../../../lib/taskLabels';

export function WorkbenchDailyProgress({ data, full = false, compact = false, project = '', onRefresh }: {
  data: WorkbenchResponse['dailyProgress']; full?: boolean; compact?: boolean; project?: string; onRefresh(): void;
}) {
  const { workspaceId, openAgentAction } = useAppShell();
  const items = full ? data.items : data.items.slice(0, 2);
  return <div id="workbench-daily-progress" className={compact ? 'workbench-daily-compact' : undefined}>
    {data.diagnostics.map((issue, index) => <Alert key={issue.project || index} type="warning" showIcon message={issue.project ? issue.project + ' 的项目变化暂不可用' : '部分项目变化暂不可用'} description={issue.message}
      action={<Button size="small" onClick={onRefresh}>重试项目变化</Button>} />)}
    {items.length ? <div className={'workbench-activity-items' + (full ? ' full' : '')}>
      {items.map(item => <article className="workbench-activity-item" key={item.project + '/' + item.date}>
        <span className="workbench-activity-point" />
        <div className="workbench-section-heading">
          <h3><Link to={workspaceHref(workspaceId, '/projects/' + encodeURIComponent(item.project))}>{item.projectName}</Link><span className="workbench-count">{item.date}</span></h3>
          {!compact && <Link className="workbench-link" to={workspaceHref(workspaceId, '/projects/' + encodeURIComponent(item.project) + '?document=daily')}>查看每日演进 <ArrowRightOutlined /></Link>}
        </div>
        <dl className="workbench-day-summary">
          {(full ? [['added', '新增'], ['updated', '更新'], ['deleted', '删除'], ['drawbacks', '影响与不足']] : [['added', '新增'], ['updated', '更新']]).map(([key, label]) => (
            <div key={key}><dt>{label}</dt><dd>{item.daySummary[key as keyof typeof item.daySummary] || '未记录'}</dd></div>
          ))}
        </dl>
        {!full && item.daySummary.drawbacks ? <p className="workbench-coverage workbench-day-drawbacks"><strong>影响与不足：</strong>{item.daySummary.drawbacks}</p> : null}
        <p className="workbench-coverage"><HistoryOutlined /> {compact ? '' : '摘要记录于 '}{formatDateTime(item.recordedAt)} · {item.commitCount} 个提交</p>
        <p className="workbench-coverage">{item.coverage || '仅覆盖已生成摘要中的提交范围；不包含未提交与未获取内容。'}</p>
        {compact && <Link className="workbench-link workbench-daily-detail" to={workspaceHref(workspaceId, '/projects/' + encodeURIComponent(item.project) + '?document=daily')}>查看每日演进 <ArrowRightOutlined /></Link>}
      </article>)}
    </div> : compact ? <div className="workbench-daily-empty">
      <span>暂无演进记录</span>
      <Button size="small" onClick={() => openAgentAction('daily-progress', { ...(project ? { projectCode: project } : {}) })}>生成每日演进</Button>
    </div> : <div className="workbench-empty-inline">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有已生成的项目演进" />
      <p>生成后可在这里查看新增、调整与影响。</p>
      <Button size="small" onClick={() => openAgentAction('daily-progress', { ...(project ? { projectCode: project } : {}) })}>生成每日演进</Button>
    </div>}
    {data.missingProjects.length && items.length ? <p className="workbench-coverage">{data.missingProjects.length} 个项目在所选范围内还没有摘要。</p> : null}
    {data.hasMore ? <p className="workbench-coverage">当前展示部分项目，请选择具体项目继续查看。</p> : null}
  </div>;
}
