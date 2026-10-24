export type UpdateStep = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type UpdateStage = 'idle' | 'download' | 'ready' | 'install' | 'launcher' | 'restart' | 'verify' | 'workspaces' | 'completed';
export type UpdateError = { code: string; message: string; details?:string };
export type WorkspaceUpdate = { rootPath: string; workspaceId: string | null; name: string; status: UpdateStep; error: string | null; details?:string; customizations?: Array<{id:string;integrity:string}> };
export type UpdateRecord = {
  autoApply?: boolean;
  resources?: UpdateStep;
  workspaces?: WorkspaceUpdate[];
  id: string;
  revision: number;
  productRoot: string;
  mode: 'npm' | 'development';
  previousInstallationIdentity: string | null;
  previousVersion: string;
  ownerPid: number;
  status: 'preparing' | 'ready' | 'applying' | 'failed' | 'partial' | 'completed';
  stage: UpdateStage;
  track: 'stable' | 'candidate';
  version: string;
  installedVersion: string | null;
  steps: { install: UpdateStep; launcher: UpdateStep; restart: UpdateStep; verify: UpdateStep };
  launcherError: UpdateError | null;
  error: UpdateError | null;
  updatedAt: string;
};
export type UpdateStore = { read(): UpdateRecord | null; write(record: UpdateRecord, expectedRevision: number | null): void };
export function updateError(code: string, message: string, status = 409, details?: unknown) {
  return Object.assign(new Error(message), { code, status, ...(details === undefined ? {} : { details }) });
}
export function pendingSteps(): UpdateRecord['steps'] { return { install: 'pending', launcher: 'pending', restart: 'pending', verify: 'pending' }; }
