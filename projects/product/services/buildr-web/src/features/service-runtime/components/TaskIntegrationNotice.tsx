import { Alert } from 'antd';
import type { TaskIntegrationCheck } from '../api/service-runtime-api';

export function TaskIntegrationNotice({ check }: { check: TaskIntegrationCheck }) {
  return <Alert
    type={check.complete ? 'success' : 'info'}
    showIcon
    message={check.complete ? '集成快检通过' : '集成快检情况'}
    description={<>
      <p>当前无可用任务工作树；已只读核对主工作库，不会自动启动主库服务。业务验证仍需单独执行。</p>
      {check.repositories.map(row => <p key={row.repositoryId}>
        <strong>{row.label}</strong> · {row.branch || '分支未知 / 分离 HEAD'} · {row.head?.slice(0, 12) || '版本未知'} · 已包含 {row.contained}/{row.checked} 个已检查提交
        <br />{row.message}
      </p>)}
      {!check.repositories.length && <p>未发现可核对的代码库，不能确认集成状态。</p>}
      {check.diagnostics.map((item, index) => <p key={index}>{item}</p>)}
      <small>检查时间：{check.checkedAt}；仅核对本地已发现的关联提交。</small>
    </>}
  />;
}
