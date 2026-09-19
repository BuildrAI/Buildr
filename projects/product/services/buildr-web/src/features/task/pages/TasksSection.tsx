import { useLayoutEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { loadTaskListPosition, taskListScrollHost } from '../taskNavigation';
import { TasksPage } from './TasksPage';
import '../task-workbench.css';

/** 列表与详情各占完整页面，筛选和返回位置由地址及历史状态承接。 */
export function TasksSection() {
  const outlet = useOutlet();
  const location = useLocation();
  useLayoutEffect(() => {
    if (outlet || !loadTaskListPosition(location.pathname + location.search)) taskListScrollHost().scrollTo({ top: 0 });
  }, [location.pathname]);
  return <div className="task-workspace">{outlet || <TasksPage />}</div>;
}
