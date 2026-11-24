import {Component, useEffect, useId, useState, type ComponentType, type ReactNode} from 'react';
import {Alert, Button} from 'antd';
import {ResizablePanels} from '../workbench/ui/ResizablePanels';
import {HARNESS_MOBILE_BREAKPOINT, THREE_PANE_DEFAULT_CONVERSATION_RATIO, THREE_PANE_WORKSPACE_MIN_WIDTH, TWO_PANE_WORKSPACE_MIN_CONVERSATION_WIDTH} from './harness-layout';
import './harness-shell.css';

export function WorkspacePanelIcon({open}: {open: boolean}) {
  return <svg className="harness-workspace-toggle-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" data-icon={open ? 'panel-right-open' : 'panel-right'} aria-hidden="true">
    <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
    {open && <path d="M10.25 2.5H12.25A1.75 1.75 0 0 1 14 4.25V11.75A1.75 1.75 0 0 1 12.25 13.5H10.25Z" fill="currentColor" fillOpacity="0.22" stroke="none" />}
    <line x1="10.25" y1="2.25" x2="10.25" y2="13.75" />
  </svg>;
}

/** Trusted, build-time composition only; not a dynamic plugin or permission API. */
export type HarnessWorkEnvironment = {
  id: string;
  title: string;
} & ({Workspace: ComponentType; render?: never} | {Workspace?: never; render(active: boolean): ReactNode});

type HarnessShellProps = {
  children: ReactNode | ((toggle: ReactNode) => ReactNode);
  environment?: HarnessWorkEnvironment;
  environmentOpen?: boolean;
  onEnvironmentOpenChange?(open: boolean): void;
  resizable?: boolean;
  conversationRatio?: number;
  defaultConversationRatio?: number;
  minConversationWidth?: number;
  minEnvironmentWidth?: number;
  onConversationRatioChange?(ratio: number, commit: boolean): void;
  onShellWidthChange?(width: number): void;
  onEnvironmentDragChange?(dragging: boolean): void;
  storageKey?: string;
};

class EnvironmentBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};

  static getDerivedStateFromError() {
    return {failed: true};
  }

  render() {
    return this.state.failed
      ? <Alert type="warning" message="工作环境暂不可用，仍可继续使用对话。" />
      : this.props.children;
  }
}

export function HarnessShell({
  children,
  environment,
  environmentOpen,
  onEnvironmentOpenChange,
  resizable = false,
  conversationRatio,
  defaultConversationRatio = THREE_PANE_DEFAULT_CONVERSATION_RATIO,
  minConversationWidth = TWO_PANE_WORKSPACE_MIN_CONVERSATION_WIDTH,
  minEnvironmentWidth = THREE_PANE_WORKSPACE_MIN_WIDTH,
  onConversationRatioChange,
  onShellWidthChange,
  onEnvironmentDragChange,
  storageKey,
}: HarnessShellProps) {
  const panelId = useId();
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [mountedId, setMountedId] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= HARNESS_MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    if (!resizable || typeof window === 'undefined') return;
    const update = () => setNarrow(window.innerWidth <= HARNESS_MOBILE_BREAKPOINT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [resizable]);
  const open = !!environment && (environmentOpen ?? openedId === environment.id);
  useEffect(() => {
    if (open && environment) setMountedId(environment.id);
  }, [open, environment?.id]);
  const Workspace = environment?.Workspace;

  const integrated = typeof children === 'function';
  const label = environment ? (open ? '收起' : '打开') + environment.title : '';
  const toggle = environment && <Button type="text" className="harness-workspace-toggle" aria-label={label} title={label} aria-expanded={open} aria-controls={panelId}
    icon={integrated ? <WorkspacePanelIcon open={open} /> : undefined} onClick={() => {
      setOpenedId(open ? null : environment.id);
      setMountedId(environment.id);
      onEnvironmentOpenChange?.(!open);
    }}>{!integrated && label}</Button>;
  const conversationNode = typeof children === 'function' ? children(toggle) : children;
  const environmentSection = environment ? <section id={panelId} key={environment.id}
    className="harness-environment-region" aria-label={environment.title} hidden={!open}>
    {mountedId === environment.id && <EnvironmentBoundary>{environment.render ? environment.render(open) : Workspace && <Workspace />}</EnvironmentBoundary>}
  </section> : null;

  return <div className={integrated ? "harness-shell harness-shell-integrated" : "harness-shell"}>
    {!integrated && environment && <nav className="harness-environment-controls" aria-label="工作环境">{toggle}</nav>}
    {resizable ? (
      <ResizablePanels
        direction={narrow ? 'vertical' : 'horizontal'}
        className="harness-shell-body harness-shell-panels"
        initialRatio={narrow ? 0.52 : defaultConversationRatio}
        ratio={narrow ? undefined : conversationRatio}
        minFirst={narrow ? 160 : minConversationWidth}
        minSecond={narrow ? 160 : minEnvironmentWidth}
        secondHidden={!open}
        separatorLabel={narrow ? '调整对话与工作区高度' : '调整对话与工作区宽度'}
        storageKey={narrow ? undefined : storageKey}
        onRatioChange={narrow ? undefined : onConversationRatioChange}
        onAxisSizeChange={narrow ? undefined : onShellWidthChange}
        onDragChange={narrow ? undefined : onEnvironmentDragChange}
        first={<div className="harness-conversation-region">{conversationNode}</div>}
        second={environmentSection}
      />
    ) : (
      <div className="harness-shell-body">
        <div className="harness-conversation-region">{conversationNode}</div>
        {environmentSection}
      </div>
    )}
  </div>;
}
