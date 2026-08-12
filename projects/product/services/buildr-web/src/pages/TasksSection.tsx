import { useEffect, useState } from 'react';
import { useOutlet } from 'react-router-dom';
import { useAppShell } from '../app/AppShellContext';
import { TasksPage } from './TasksPage';

/**
 * 任务区段布局：列表始终按需挂载并在进入详情时保持实例，
 * 详情走嵌套 Outlet；侧栏「任务」通过 resetToken 强制重建列表。
 */
export function TasksSection() {
  const outlet = useOutlet();
  const { taskListResetToken } = useAppShell();
  const showingChild = outlet != null;
  const [listReady, setListReady] = useState(() => !showingChild);

  useEffect(() => {
    if (!showingChild) setListReady(true);
  }, [showingChild]);

  return (
    <>
      {listReady ? (
        <div
          className={showingChild ? 'tasks-list-host is-covered' : 'tasks-list-host'}
          hidden={showingChild}
          aria-hidden={showingChild}
          inert={showingChild || undefined}
        >
          <TasksPage key={taskListResetToken} />
        </div>
      ) : null}
      {outlet}
    </>
  );
}
