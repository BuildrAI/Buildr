import { useOutlet } from 'react-router-dom';
import { useResizableListWidth } from '../lib/useResizableListWidth';
import { ProjectsPage } from './ProjectsPage';

const STORAGE_KEY = 'buildr.web.projects-list-width';

/**
 * 项目工作台：宽屏左列表右详情；窄屏打开详情时列表让出主表面。
 */
export function ProjectsSection() {
  const outlet = useOutlet();
  const showingChild = outlet != null;
  const { cockpitRef, listWidth, resizing, listMin, listMax, resizerHandlers } = useResizableListWidth(STORAGE_KEY);

  return (
    <div
      ref={cockpitRef}
      className={`resource-cockpit${showingChild ? ' has-detail' : ''}${resizing ? ' is-resizing' : ''}`}
      style={{ ['--resource-list-width' as string]: `${listWidth}px` }}
    >
      <div className="resource-list-host">
        <ProjectsPage />
        <button
          type="button"
          id="projects-list-resizer"
          className="resource-list-resizer"
          aria-label="调整项目列表宽度"
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
            <p>选择左侧项目查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
