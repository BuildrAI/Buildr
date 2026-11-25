import './shell/workspace-tabs.css';
/** Public work-environment composition entry; does not load conversation internals. */
export {HarnessShell, WorkspacePanelIcon} from './shell/HarnessShell';
export type {HarnessWorkEnvironment} from './shell/HarnessShell';
export {configureDesktopBridge, desktopNotify, desktopPage} from './dsh-desktop-bridge';
export type {DesktopTool} from './dsh-desktop-bridge';
