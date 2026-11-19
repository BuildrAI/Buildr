import {createContext, useContext, useEffect, useRef, type CSSProperties, type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {HarnessShell, type HarnessWorkEnvironment} from '../../../buildr-harness-web/src/shell';
import {useAgentConversations} from '../features/harness-ui/AgentConversationsContext';
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
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      context.setFull(false);
    }
  }, [location.pathname, context.setFull]);

  const environmentOpen = !context.open || !context.full;
  return <EngineeringContent.Provider value={{content: children, visible: environmentOpen}}>
    <div className={
      'development-work-environment-shell'
      + (!context.open ? ' is-conversation-collapsed' : context.full ? ' is-conversation-focused' : '')
      + (context.side === 'left' ? ' is-conversation-left' : '')
    }
      style={{'--development-conversation-width': `${context.width}px`} as CSSProperties}>
      <HarnessShell environment={development} environmentOpen={environmentOpen}
        onEnvironmentOpenChange={open => {
          context.setOpen(true);
          context.setFull(!open);
        }}>
        <div className="development-conversation-slot">
          {conversation}
        </div>
      </HarnessShell>
    </div>
  </EngineeringContent.Provider>;
}
