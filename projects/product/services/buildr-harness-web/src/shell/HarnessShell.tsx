import {Component, useEffect, useId, useState, type ComponentType, type ReactNode} from 'react';
import {Alert, Button} from 'antd';
import './harness-shell.css';

/** Trusted, build-time composition only; not a dynamic plugin or permission API. */
export type HarnessWorkEnvironment = {
  id: string;
  title: string;
} & ({Workspace: ComponentType; render?: never} | {Workspace?: never; render(active: boolean): ReactNode});

type HarnessShellProps = {
  children: ReactNode;
  environment?: HarnessWorkEnvironment;
  environmentOpen?: boolean;
  onEnvironmentOpenChange?(open: boolean): void;
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

export function HarnessShell({children, environment, environmentOpen, onEnvironmentOpenChange}: HarnessShellProps) {
  const panelId = useId();
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [mountedId, setMountedId] = useState<string | null>(null);
  const open = !!environment && (environmentOpen ?? openedId === environment.id);
  useEffect(() => {
    if (open && environment) setMountedId(environment.id);
  }, [open, environment?.id]);
  const Workspace = environment?.Workspace;

  return <div className="harness-shell">
    {environment && <nav className="harness-environment-controls" aria-label="工作环境">
      <Button type="text" aria-expanded={open} aria-controls={panelId} onClick={() => {
        setOpenedId(open ? null : environment.id);
        setMountedId(environment.id);
        onEnvironmentOpenChange?.(!open);
      }}>{open ? '收起' : '打开'}{environment.title}</Button>
    </nav>}
    <div className="harness-shell-body">
      <div className="harness-conversation-region">{children}</div>
      {environment && <section id={panelId} key={environment.id}
        className="harness-environment-region" aria-label={environment.title} hidden={!open}>
        {mountedId === environment.id && <EnvironmentBoundary>{environment.render ? environment.render(open) : Workspace && <Workspace />}</EnvironmentBoundary>}
      </section>}
    </div>
  </div>;
}
