import {Component, createContext, useContext, type ReactNode} from 'react';
import type {ConversationView} from '../features/agent-conversations/types';

/** Trusted first-party composition, not a plugin permission boundary. */
export type HarnessConversationHost = {
  diagramRendererPath?: string;
  /** Optional work context, owned by the environment; no reserved task-sized space. */
  renderContext?(conversation: ConversationView, apply: (value: ConversationView, observedRevision?: string) => void): ReactNode;
  /** The assembled host interprets its own objects; ordinary files use HarnessDirectoryFiles. */
  openObject?(reference: string, scopePath: string): void;
  requestLayout?(action: 'collapse' | 'full', full?: boolean): void;
};

const Host = createContext<HarnessConversationHost>({});
export const useConversationHost = () => useContext(Host);
export function ConversationHostProvider({host, children}: {host: HarnessConversationHost; children: ReactNode}) {
  return <Host.Provider value={host}>{children}</Host.Provider>;
}

class ContextBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {return {failed: true};}
  render() {
    return this.state.failed ? <span role="status">工作上下文暂不可用</span> : this.props.children;
  }
}
type ContextProps = {conversation: ConversationView; apply(value: ConversationView, observedRevision?: string): void};
function ContextContent({conversation, apply}: ContextProps) {
  const host = useConversationHost();
  return <>{host.renderContext?.(conversation, apply)}</>;
}
/** A faulty environment control must not unmount observation or stop controls. */
export function ConversationContextSlot(props: ContextProps) {
  return <ContextBoundary key={props.conversation.workspaceId + ':' + props.conversation.id}><ContextContent {...props}/></ContextBoundary>;
}
