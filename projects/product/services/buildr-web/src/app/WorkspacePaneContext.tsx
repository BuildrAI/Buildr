import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from 'react';
import type { WorkspaceObjectTab } from '../components/ObjectTabStrip';

export type WorkspacePaneRegistration = {
  ownerPath: string;
  pageKey: string;
  pageTarget: HTMLElement;
  contentTarget: HTMLElement;
  objectTabs: WorkspaceObjectTab[];
  activeObject: string | null;
  objectContentLayout?: 'reading' | 'fill';
  objectLabel?: string;
  retainObjectContent?: boolean;
  onActivateObject?: (localKey: string) => void;
  onCloseObject?: (localKey: string) => void;
  onCloseAll?: () => void;
};

export type WorkspacePaneView = {
  registered: boolean;
  pageVisible: boolean;
  pageTransient: boolean;
  contentVisible: boolean;
  displayedObject: string | null;
  transient: boolean;
};

export type WorkspacePaneHostValue = {
  register: (ownerPath: string, latest: RefObject<WorkspacePaneRegistration | null>) => () => void;
  publish: (ownerPath: string) => void;
  viewFor: (ownerPath: string) => WorkspacePaneView;
  revealContent: (ownerPath: string, localKey?: string) => void;
};

export const WorkspacePaneContext = createContext<WorkspacePaneHostValue | null>(null);

/** Fixed portal targets register once; changing callbacks only update the latest reference. */
export function useWorkspacePaneRegistration(registration: WorkspacePaneRegistration | null): WorkspacePaneView | null {
  const host = useContext(WorkspacePaneContext);
  const latest = useRef(registration);
  latest.current = registration;
  const ownerPath = registration?.ownerPath;
  useLayoutEffect(() => {
    if (!host || !ownerPath) return;
    return host.register(ownerPath, latest);
  }, [host?.register, ownerPath]);
  useLayoutEffect(() => { if (host && ownerPath) host.publish(ownerPath); });
  return host && ownerPath ? host.viewFor(ownerPath) : null;
}

export function useWorkspacePaneHost() { return useContext(WorkspacePaneContext); }
