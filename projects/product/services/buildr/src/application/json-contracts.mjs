export const PUBLIC_JSON_SCHEMAS = Object.freeze({
  builtinList: 'buildr.builtin-list/v1',
  cliError: 'buildr.cli-error/v1',
  commandsCheck: 'buildr.commands-check/v1',
  componentCheck: 'buildr.component-check/v1',
  componentList: 'buildr.component-list/v1',
  doctor: 'buildr.doctor/v1',
  launcherStatus: 'buildr.launcher-status/v1',
  localAppPreview: 'buildr.local-app-preview/v1',
  openspecConverge: 'buildr.openspec-convergence/v1',
  openspecAudit: 'buildr.openspec-convergence-audit/v1',
  runtimeList: 'buildr.runtime-list/v1',
  update: 'buildr.update/v1',
  updateCheck: 'buildr.update-check/v1',
  version: 'buildr.version/v1',
  taskEnvironmentResult: 'buildr.task-environment-result/v1',
  gitWorktreeResult: 'buildr.git-worktree-result/v1',
  taskRecordResult: 'buildr.task-record-result/v3',
  taskRecordView: 'buildr.task-record-view/v1',
  taskRecordList: 'buildr.task-record-list/v3',
  taskReviewOperationResult: 'buildr.task-review-operation-result/v1',
  taskVerificationOperationResult: 'buildr.task-verification-operation-result/v1',
  taskFinishRun: 'buildr.task-finish-run/v2',
  taskFinishResult: 'buildr.task-finish-result/v2',
  verificationExecution: 'buildr.verification-execution/v1',
  verificationEvidenceCleanup: 'buildr.verification-evidence-cleanup/v1',
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
