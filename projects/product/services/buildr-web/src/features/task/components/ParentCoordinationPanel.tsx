import { Alert, Button, Collapse, Descriptions, List, Tag } from 'antd';
import { Link } from 'react-router-dom';
import type { ParentCoordinationResult } from './parentCoordination';
import { formatDateTime, taskStatusLabel } from '../../../lib/taskLabels';
import './ParentCoordinationPanel.css';

type Props = { data: ParentCoordinationResult | null; loading: boolean; onRefresh: () => void; taskHref: (taskId: string) => string };

export function ParentCoordinationPanel({ data, loading, onRefresh, taskHref }: Props) {
  if (!data) return null;
  if (!data.isParent && !data.parentSource && !data.diagnostic) return null;
  const evidence = data.completion?.evidence;
  return <section className="panel parent-coordination-panel" id="task-parent-coordination" aria-live="polite">
    <div className="parent-coordination-heading"><h2>{data.isParent ? '整体目标与子任务成果' : '所属父任务'}</h2><Button size="small" loading={loading} onClick={onRefresh}>刷新当前成果</Button></div>
    {data.parentSource && <p>所属父任务：<Link to={taskHref(data.parentSource.taskId)}>{data.parentSource.title}</Link></p>}
    {data.diagnostic && <Alert type="warning" message={data.diagnostic.message} showIcon />}
    {data.isParent && <>
      <Alert type="info" showIcon message="子任务结束不等于整体目标完成。父任务需要总体验收和明确完成授权。计划文档可从任务目标中的链接查看。" />
      <List dataSource={data.children || []} locale={{ emptyText: '尚未创建独立子任务。可以先维护目标与计划。' }} renderItem={(child) => <List.Item key={child.taskId} data-child-task={child.taskId}>
        <List.Item.Meta title={<><Link to={taskHref(child.taskId)}>{child.title}</Link> <Tag>{taskStatusLabel(child.status)}</Tag></>} description={<><p>{child.intent}</p><p>{child.result?.summary || '尚未记录结果'}</p></>} />
      </List.Item>} />
      {data.result?.summary && <p><strong>整体结果：</strong>{data.result.summary}</p>}
      {evidence ? <Descriptions title="父任务完成依据" column={1} bordered size="small">
        <Descriptions.Item label="总体验收">{evidence.acceptance.summary}</Descriptions.Item>
        <Descriptions.Item label="明确授权">{evidence.authorization.statement}</Descriptions.Item>
        <Descriptions.Item label="授权来源">{evidence.authorization.source}</Descriptions.Item>
        <Descriptions.Item label="记录时间">{formatDateTime(evidence.recordedAt)}</Descriptions.Item>
        {evidence.acceptance.children.map((child) => <Descriptions.Item key={child.taskId} label={child.taskId}>{child.summary}</Descriptions.Item>)}
      </Descriptions> : data.parentStatus === 'completed' ? <Alert type="warning" message="历史完成记录未保存独立授权与验收依据，不能从完成状态推断已获授权。" /> : null}
      {data.historicalPlan != null && <Collapse items={[{ key: 'history', label: '历史父计划（只读，已退出执行流程）', children: <pre className="parent-history">{JSON.stringify(data.historicalPlan, null, 2)}</pre> }]} />}
    </>}
  </section>;
}
