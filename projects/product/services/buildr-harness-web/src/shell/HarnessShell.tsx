import {Component, useEffect, useId, useState, type ComponentType, type ReactNode} from 'react';
import {Alert, Button} from 'antd';
import {LayoutOutlined} from '@ant-design/icons';
import './harness-shell.css';

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

  const integrated = typeof children === 'function';
  const label = environment ? (open ? '收起' : '打开') + environment.title : '';
  const toggle = environment && <Button type="text" className="harness-workspace-toggle" aria-label={label} title={label} aria-expanded={open} aria-controls={panelId}
    icon={integrated ? <LayoutOutlined aria-hidden /> : undefined} onClick={() => {
      setOpenedId(open ? null : environment.id);
      setMountedId(environment.id);
      onEnvironmentOpenChange?.(!open);
    }}>{!integrated && label}</Button>;
  return <div className={integrated ? "harness-shell harness-shell-integrated" : "harness-shell"}>
    {!integrated && environment && <nav className="harness-environment-controls" aria-label="工作环境">{toggle}</nav>}
    <div className="harness-shell-body">
      <div className="harness-conversation-region">{typeof children === 'function' ? children(toggle) : children}</div>
      {environment && <section id={panelId} key={environment.id}
        className="harness-environment-region" aria-label={environment.title} hidden={!open}>
        {mountedId === environment.id && <EnvironmentBoundary>{environment.render ? environment.render(open) : Workspace && <Workspace />}</EnvironmentBoundary>}
      </section>}
    </div>
  </div>;
}
