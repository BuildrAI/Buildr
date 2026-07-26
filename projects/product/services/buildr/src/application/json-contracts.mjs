export const PUBLIC_JSON_SCHEMAS = Object.freeze({
  builtinList: 'buildr.builtin-list/v1',
  cliError: 'buildr.cli-error/v1',
  commandsCheck: 'buildr.commands-check/v1',
  componentCheck: 'buildr.component-check/v1',
  componentList: 'buildr.component-list/v1',
  doctor: 'buildr.doctor/v1',
  launcherStatus: 'buildr.launcher-status/v1',
  localAppPreview: 'buildr.local-app-preview/v1',
  openspecBaseline: 'buildr.openspec-baseline/v1',
  openspecCheck: 'buildr.openspec-check/v1',
  openspecSyncPlan: 'buildr.openspec-sync-plan/v1',
  openspecSyncApply: 'buildr.openspec-sync-result/v1',
  openspecConverge: 'buildr.openspec-convergence/v1',
  runtimeList: 'buildr.runtime-list/v1',
  update: 'buildr.update/v1',
  updateCheck: 'buildr.update-check/v1',
  version: 'buildr.version/v1',
  taskEnvironmentContext: 'buildr.task-environment-context/v1',
  taskEnvironmentAdoption: 'buildr.task-environment-adoption/v1',
  taskFinishRecovery: 'buildr.task-finish-recovery/v1',
  taskFinishObservation: 'buildr.task-finish-observation/v1',
  taskFinishCheckpoint: 'buildr.task-finish-checkpoint/v1',
  taskFinishCompletion: 'buildr.task-finish-completion/v1',
  worktreeCreate: 'buildr.worktree-create/v2',
});

export function withJsonSchema(schemaVersion, payload) {
  if (!Object.values(PUBLIC_JSON_SCHEMAS).includes(schemaVersion)) {
    throw new Error(`Unknown public JSON schema: ${schemaVersion}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Public JSON payload must be an object: ${schemaVersion}`);
  }
  return { schemaVersion, ...payload };
}
