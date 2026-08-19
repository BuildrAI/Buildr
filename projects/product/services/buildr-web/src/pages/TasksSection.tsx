import { useOutlet } from 'react-router-dom';
import { useAppShell } from '../app/AppShellContext';
import { useResizableListWidth } from '../lib/useResizableListWidth';
import { TasksPage } from './TasksPage';

const STORAGE_KEY = 'buildr.web.tasks-list-width';

/**
 * 任务工作台：宽屏左列表右详情；窄屏打开详情时列表让出主表面。
 * 顶栏「任务」通过 resetToken 强制重建列表筛选。
 */
export function TasksSection() {
  const outlet = useOutlet();
  const { taskListResetToken } = useAppShell();
  const showingChild = outlet != null;
  const { cockpitRef, listWidth, resizing, listMin, listMax, resizerHandlers } = useResizableListWidth(STORAGE_KEY);

  return (
    <div
      ref={cockpitRef}
      className={`resource-cockpit${showingChild ? ' has-detail' : ''}${resizing ? ' is-resizing' : ''}`}
      style={{ ['--resource-list-width' as string]: `${listWidth}px` }}
    >
      <div className="resource-list-host">
        <TasksPage key={taskListResetToken} />
        <button
          type="button"
          id="tasks-list-resizer"
          className="resource-list-resizer"
          aria-label="调整任务列表宽度"
          aria-orientation="vertical"
          aria-valuemin={listMin}
          aria-valuemax={listMax}
          aria-valuenow={listWidth}
          {...resizerHandlers}
        />
      </div>
      <div className="resource-detail-host">
        {outlet || (
          <div className="resource-detail-empty">
            <p>选择左侧任务查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
