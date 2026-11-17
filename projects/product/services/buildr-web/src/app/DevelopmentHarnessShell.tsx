import {createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {HarnessShell, type HarnessWorkEnvironment} from '../../../buildr-harness-web/src/shell';
import {useAgentConversations} from '../features/harness-ui/AgentConversationsContext';
import {SplitDivider} from '../components/SplitDivider';
import {readOptionalPreference, writeOptionalPreference} from '../lib/optional-preferences';
import {WorkEnvironmentVisibleContext} from './work-environment-visibility';
import './development-harness-shell.css';

// Keep a stable component type while the existing routed engineering nodes change.
const EngineeringContent = createContext<{content: ReactNode; visible: boolean}>({content: null, visible: false});
function DevelopmentWorkspace() {
  const value = useContext(EngineeringContent);
  return <WorkEnvironmentVisibleContext.Provider value={value.visible}>{value.content}</WorkEnvironmentVisibleContext.Provider>;
}
const development: HarnessWorkEnvironment = {
  id: 'development',
  title: 'Development',
  Workspace: DevelopmentWorkspace,
};

export function DevelopmentHarnessShell({children, conversation}: {children: ReactNode; conversation: ReactNode}) {
  const context = useAgentConversations();
  const location = useLocation();
  const previousPath = useRef(location.pathname);
  const [width, setWidth] = useState(() => Math.min(800, Math.max(560, Number(readOptionalPreference('buildr.agent-conversation-width')) || 620)));
  const drag = useRef<{x: number; width: number} | null>(null);
  const resize = (next: number) => {
    const value = Math.min(800, Math.max(560, next));
    setWidth(value);
    writeOptionalPreference('buildr.agent-conversation-width', String(value));
  };
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      context.setFull(false);
    }
  }, [location.pathname, context.setFull]);

  const environmentOpen = !context.open || !context.full;
  return <EngineeringContent.Provider value={{content: children, visible: environmentOpen}}>
    <div className={'development-work-environment-shell' + (!context.open ? ' is-conversation-collapsed' : context.full ? ' is-conversation-focused' : '')}
      style={{'--development-conversation-width': `${width}px`} as CSSProperties}>
      <HarnessShell environment={development} environmentOpen={environmentOpen}
        onEnvironmentOpenChange={open => {
          context.setOpen(true);
          context.setFull(!open);
        }}>
        <div className="development-conversation-slot">
          {conversation}
          {context.open && !context.full && <SplitDivider className="development-harness-divider" aria-label="调整对话宽度"
            aria-valuemin={560} aria-valuemax={800} aria-valuenow={width}
            onPointerDown={event => {if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = {x: event.clientX, width};}}
            onPointerMove={event => {if (drag.current) resize(drag.current.width + drag.current.x - event.clientX);}}
            onPointerUp={() => {drag.current = null;}} onPointerCancel={() => {drag.current = null;}}
            onKeyDown={event => {if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); resize(width + (event.key === 'ArrowLeft' ? 16 : -16));}}}
            onDoubleClick={() => resize(620)} />}
        </div>
      </HarnessShell>
    </div>
  </EngineeringContent.Provider>;
}
