import { useLayoutEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { loadTaskListPosition, taskListScrollHost } from '../taskNavigation';
import { TasksPage } from './TasksPage';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import '../task-workbench.css';

/** 任务列表保持在主屏，详情由共享资源副屏承接；旧变更深链仍可独立查看。 */
export function TasksSection() {
  const outlet = useOutlet();
  const location = useLocation();
  const tabs = useWorkspacePageTabs();
  useLayoutEffect(() => {
    if (outlet || !loadTaskListPosition(location.pathname + location.search)) taskListScrollHost().scrollTo({ top: 0 });
  }, [location.pathname]);
  if (outlet) return <div className="task-workspace">{outlet}</div>;
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}><div className="task-list-workspace"><TasksPage /></div></WorkspaceStage>;
}
