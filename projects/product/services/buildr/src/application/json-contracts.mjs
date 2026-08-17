export const PUBLIC_JSON_SCHEMAS = Object.freeze({
  builtinList: 'buildr.builtin-list/v1',
  cliError: 'buildr.cli-error/v1',
  commandsCheck: 'buildr.commands-check/v1',
  componentCheck: 'buildr.component-check/v1',
  componentList: 'buildr.component-list/v1',
  doctor: 'buildr.doctor/v1',
  launcherStatus: 'buildr.launcher-status/v1',
  installationStatus: 'buildr.installation-status/v1',
  localAppPreview: 'buildr.local-app-preview/v1',
  openspecConverge: 'buildr.openspec-convergence/v1',
  openspecConvergencePreflight: 'buildr.openspec-convergence-preflight/v1',
  openspecConvergenceInspect: 'buildr.openspec-convergence-inspect/v1',
  releaseAwareness: 'buildr.release-awareness/v1',
  runtimeList: 'buildr.runtime-list/v1',
  update: 'buildr.update/v2',
  updateCheck: 'buildr.update-check/v2',
  version: 'buildr.version/v1',
  taskEnvironmentResult: 'buildr.task-environment-result/v4',
  taskEnvironmentPlanResult: 'buildr.task-environment-plan-result/v2',
  gitWorktreeResult: 'buildr.git-worktree-result/v1',
  taskRecordResult: 'buildr.task-record-result/v4',
  taskEntrySnapshot: 'buildr.task-entry-snapshot/v1',
  taskTerminalDelivery: 'buildr.task-terminal-delivery/v1',
  taskRecordView: 'buildr.task-record-view/v2',
  taskRecordList: 'buildr.task-record-list/v4',
  parentCoordinationResult: 'buildr.parent-coordination-result/v1',
  parentStartupReadiness: 'buildr.parent-startup-readiness/v1',
  parentPlanInputSchema: 'buildr.parent-plan-input-schema/v1',
  parentPlanInputExample: 'buildr.parent-plan-input-example/v1',
  parentPlan: 'buildr.parent-plan/v1',
  contributionHandoff: 'buildr.contribution-handoff/v1',
  taskReviewOperationResult: 'buildr.task-review-operation-result/v1',
  taskRetrospectiveListResult: 'buildr.task-retrospective-list-result/v1',
  taskRetrospectiveOperationResult: 'buildr.task-retrospective-operation-result/v1',
  taskVerificationOperationResult: 'buildr.task-verification-operation-result/v1',
  taskExecutionRecordListView: 'buildr.task-execution-record-list-view/v1',
  taskExecutionRecordDetailView: 'buildr.task-execution-record-detail-view/v1',
  taskExecutionRecordInspectResult: 'buildr.task-execution-record-inspect-result/v1',
  taskExecutionRecordBodyFile: 'buildr.task-execution-record-body-file/v1',
  taskExecutionRecordGcResult: 'buildr.task-execution-record-gc-result/v1',
  taskExecutionRecordRecoverResult: 'buildr.task-execution-record-recover-result/v1',
  taskFinishRun: 'buildr.task-finish-run/v2',
  taskFinishCompactResult: 'buildr.task-finish-compact-result/v1',
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
