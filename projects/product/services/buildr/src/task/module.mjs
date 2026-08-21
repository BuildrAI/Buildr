import { registerTaskRecordApplication } from './application/task-record-application.mjs';
import { registerTaskRetrospectiveApplication } from './application/task-retrospective-application.mjs';
import { registerTaskReviewApplication } from './application/task-review-application.mjs';
import { registerTaskEnvironmentApplication } from './application/task-environment-application.mjs';
import { registerTaskExecutionRecordApplication } from './application/task-execution-record-application.mjs';
import { registerTaskVerificationApplication } from './application/task-verification-application.mjs';
import { registerTaskPlanningIdentityApplication } from './application/task-planning-identity-application.mjs';
import { registerTaskDevelopmentApplication } from './application/task-development-application.mjs';
import { registerTaskFinishApplication } from './application/finish/task-finish-application.mjs';
import { registerTaskTerminalDeliveryApplication } from './application/task-terminal-delivery-application.mjs';
import { registerParentCoordinationApplication } from './application/parent-coordination-application.mjs';
import { registerTaskOverviewApplication } from './application/task-overview-application.mjs';
import { registerTaskEntrySnapshotApplication } from './application/task-entry-snapshot-application.mjs';
import { registerTaskRecordRepository } from './persistence/task-record-repository.mjs';
import { registerTaskRetrospectiveRepository } from './persistence/task-retrospective-repository.mjs';
import { registerTaskReviewRepository } from './persistence/task-review-repository.mjs';
import { registerTaskEnvironmentRepository } from './persistence/task-environment-repository.mjs';
import { registerTaskExecutionRecordRepository } from './persistence/task-execution-record-repository.mjs';
import { registerTaskExecutionRecordBodyStore } from './persistence/task-execution-record-body-store.mjs';
import { registerTaskVerificationRepository } from './persistence/task-verification-repository.mjs';
import { registerTaskDevelopmentRepository } from './persistence/task-development-repository.mjs';
import { registerTaskFinishRepository } from './persistence/task-finish-repository.mjs';
import { registerParentCoordinationRepository } from './persistence/parent-coordination-repository.mjs';
import { registerTaskOverviewRepository } from './persistence/task-overview-repository.mjs';
import { taskRecordCommand } from './interfaces/cli/task-record.mjs';
import { taskReviewCommand } from './interfaces/cli/task-review.mjs';
import { taskEnvironmentCommand, taskEnvironmentPlanCommand } from './interfaces/cli/task-environment.mjs';
import { taskVerificationCommand } from './interfaces/cli/task-verification.mjs';
import { taskExecutionRecordGcCommand, taskExecutionRecordInspectCommand, taskExecutionRecordListCommand, taskExecutionRecordRecoverCommand } from './interfaces/cli/task-execution-record.mjs';
import { parentCoordinationCommand } from './interfaces/cli/parent-coordination.mjs';
import {
  createParentCoordinationHttpContribution,
  createTaskDevelopmentHttpContribution,
  createTaskEnvironmentHttpContribution,
  createTaskExecutionRecordHttpContribution,
  createTaskOverviewHttpContribution,
  createTaskVerificationHttpContribution,
} from './interfaces/http/task-lifecycle-core.mjs';
import { taskEntrySnapshotCommand } from './interfaces/cli/task-entry-snapshot.mjs';
import { taskTerminalDeliveryInspectCommand } from './interfaces/cli/task-terminal-delivery.mjs';
import { handleTaskRecordHttpRequest, TASK_RECORD_ID_SOURCE } from './interfaces/http/task-record-http.mjs';
import { handleTaskRetrospectiveHttpRequest } from './interfaces/http/task-retrospective-http.mjs';
import { handleTaskReviewHttpRequest } from './interfaces/http/task-review-http.mjs';

export async function runTaskRetrospectiveDriver(args, options) {
  const driver = await import('./interfaces/internal/task-retrospective-driver.mjs');
  return driver.runTaskRetrospectiveDriver(args, options);
}

export async function runTaskDevelopmentDriver(args, options) {
  const driver = await import('./interfaces/internal/task-development-driver-runner.mjs');
  return driver.runTaskDevelopmentDriver(args, options);
}

export async function runTaskPlanningIdentityDriver(args, options) {
  const driver = await import('./interfaces/internal/task-planning-identity-driver-runner.mjs');
  return driver.runTaskPlanningIdentityDriver(args, options);
}

export const TASK_RECORD_MODULE_ID = 'task-record';
export const TASK_RECORD_APPLICATION = 'task-record.application';
export const TASK_RECORD_PERSISTENCE_READ = 'task-record.persistence-read';
export const TASK_RECORD_COMPATIBILITY = 'task-record.bootstrap-compatibility';
export const TASK_REVIEW_MODULE_ID = 'task-review';
export const TASK_REVIEW_APPLICATION = 'task-review.application';
export const TASK_REVIEW_PERSISTENCE_READ = 'task-review.persistence-read';
export const TASK_REVIEW_COMPATIBILITY = 'task-review.bootstrap-compatibility';
export const TASK_RETROSPECTIVE_MODULE_ID = 'task-retrospective';
export const TASK_RETROSPECTIVE_APPLICATION = 'task-retrospective.application';
export const TASK_RETROSPECTIVE_PERSISTENCE_READ = 'task-retrospective.persistence-read';
export const TASK_RETROSPECTIVE_COMPATIBILITY = 'task-retrospective.bootstrap-compatibility';
export const TASK_ENVIRONMENT_MODULE_ID = 'task-environment';
export const TASK_ENVIRONMENT_APPLICATION = 'task-environment.application';
export const TASK_ENVIRONMENT_PERSISTENCE_READ = 'task-environment.persistence-read';
export const TASK_ENVIRONMENT_COMPATIBILITY = 'task-environment.bootstrap-compatibility';
export const TASK_EXECUTION_RECORD_MODULE_ID = 'task-execution-record';
export const TASK_EXECUTION_RECORD_APPLICATION = 'task-execution-record.application';
export const TASK_EXECUTION_RECORD_PERSISTENCE_READ = 'task-execution-record.persistence-read';
export const TASK_EXECUTION_RECORD_COMPATIBILITY = 'task-execution-record.bootstrap-compatibility';
export const TASK_VERIFICATION_MODULE_ID = 'task-verification';
export const TASK_VERIFICATION_APPLICATION = 'task-verification.application';
export const TASK_VERIFICATION_PERSISTENCE_READ = 'task-verification.persistence-read';
export const TASK_VERIFICATION_COMPATIBILITY = 'task-verification.bootstrap-compatibility';
export const TASK_PLANNING_IDENTITY_MODULE_ID = 'task-planning-identity';
export const TASK_PLANNING_IDENTITY_APPLICATION = 'task-planning-identity.application';
export const TASK_PLANNING_IDENTITY_COMPATIBILITY = 'task-planning-identity.bootstrap-compatibility';
export const TASK_DEVELOPMENT_MODULE_ID = 'task-development';
export const TASK_DEVELOPMENT_APPLICATION = 'task-development.application';
export const TASK_DEVELOPMENT_PERSISTENCE_READ = 'task-development.persistence-read';
export const TASK_DEVELOPMENT_COMPATIBILITY = 'task-development.bootstrap-compatibility';
export const PARENT_COORDINATION_MODULE_ID = 'task-parent-coordination';
export const PARENT_COORDINATION_APPLICATION = 'task-parent-coordination.application';
export const PARENT_COORDINATION_PERSISTENCE_READ = 'task-parent-coordination.persistence-read';
export const PARENT_COORDINATION_COMPATIBILITY = 'task-parent-coordination.bootstrap-compatibility';
export const TASK_OVERVIEW_MODULE_ID = 'task-overview';
export const TASK_OVERVIEW_APPLICATION = 'task-overview.application';
export const TASK_OVERVIEW_COMPATIBILITY = 'task-overview.bootstrap-compatibility';
export const TASK_ENTRY_SNAPSHOT_MODULE_ID = 'task-entry-snapshot';
export const TASK_ENTRY_SNAPSHOT_APPLICATION = 'task-entry-snapshot.application';
export const TASK_ENTRY_SNAPSHOT_COMPATIBILITY = 'task-entry-snapshot.bootstrap-compatibility';
export const TASK_FINISH_MODULE_ID = 'task-finish';
export const TASK_FINISH_APPLICATION = 'task-finish.application';
export const TASK_FINISH_PERSISTENCE_READ = 'task-finish.persistence-read';
export const TASK_FINISH_INTERNAL = 'task-finish.internal';
export const TASK_FINISH_COMPATIBILITY = 'task-finish.bootstrap-compatibility';
export const TASK_TERMINAL_DELIVERY_MODULE_ID = 'task-terminal-delivery';
export const TASK_TERMINAL_DELIVERY_APPLICATION = 'task-terminal-delivery.application';
export const TASK_TERMINAL_DELIVERY_COMPATIBILITY = 'task-terminal-delivery.bootstrap-compatibility';

const APPLICATION_METHODS = Object.freeze([
  'listTaskRecords', 'queryTaskRecordViews', 'inspectTaskRecord', 'inspectTaskRecordView',
  'createTaskRecord', 'updateTaskRecord', 'activateTaskRecord', 'completeTaskRecord',
  'completeTaskRecordFromFinish', 'abandonTaskRecord',
]);

const PERSISTENCE_READ_METHODS = Object.freeze([
  'assertCanonicalTaskWorkspace', 'taskRecordDirectory', 'ensureTaskRecordDirectory',
  'readTaskRecordPersistence', 'prepareTaskRecordPersistence', 'listTaskRecordPersistence',
  'queryTaskRecordViewPersistence', 'readTaskRecordViewPersistence',
]);

const TEST_SUPPORT_METHODS = Object.freeze([
  'createTaskRecordPersistence', 'mutateTaskRecordPersistence', 'writeTaskRecordPersistence',
]);

const TASK_REVIEW_APPLICATION_METHODS = Object.freeze([
  'inspectTaskReview', 'recordTaskReview', 'generateTaskReviewPrompt',
]);

const TASK_REVIEW_PERSISTENCE_READ_METHODS = Object.freeze([
  'taskReviewDirectory', 'taskReviewResultPath', 'readTaskReviewResultPersistence',
]);

const TASK_REVIEW_PERSISTENCE_COMPATIBILITY_METHODS = Object.freeze([
  ...TASK_REVIEW_PERSISTENCE_READ_METHODS, 'writeTaskReviewResultPersistence', 'renderTaskReviewResult',
]);

const TASK_RETROSPECTIVE_APPLICATION_METHODS = Object.freeze([
  'inspectTaskRetrospective', 'listTaskRetrospectives', 'recordTaskRetrospective', 'handleTaskRetrospective',
]);

const TASK_RETROSPECTIVE_PERSISTENCE_READ_METHODS = Object.freeze([
  'taskRetrospectiveResultPath', 'readTaskRetrospectiveResultPersistence',
]);

const TASK_RETROSPECTIVE_PERSISTENCE_COMPATIBILITY_METHODS = Object.freeze([
  ...TASK_RETROSPECTIVE_PERSISTENCE_READ_METHODS,
  'writeTaskRetrospectiveResultPersistence', 'writeTaskRetrospectiveDispositionPersistence', 'renderTaskRetrospectiveResult',
]);

const TASK_ENVIRONMENT_APPLICATION_METHODS = Object.freeze([
  'prepareTaskEnvironment', 'inspectTaskEnvironment', 'readTaskEnvironmentCurrent',
  'recordTaskEnvironmentPlan', 'inspectTaskEnvironmentPlan', 'cleanupTaskEnvironment',
  'registerTaskEnvironmentResource', 'releaseTaskEnvironmentResource',
  'resolveTaskEnvironmentExecution', 'resolveTaskEnvironmentCleanupContext', 'assertTaskEnvironmentController',
]);
const TASK_ENVIRONMENT_PERSISTENCE_METHODS = Object.freeze([
  'taskEnvironmentPath', 'readTaskEnvironmentPersistence', 'writeTaskEnvironmentPersistence', 'renderTaskEnvironmentReceipt',
]);
const TASK_EXECUTION_RECORD_APPLICATION_METHODS = Object.freeze([
  'openTaskExecutionRecord', 'inspectTaskExecutionRecord', 'listTaskExecutionRecords',
  'listTaskExecutionRecordView', 'inspectTaskExecutionRecordView', 'inspectTaskExecutionRecordCompactView',
  'readTaskExecutionRecordBodyFileView', 'sealTaskExecutionRecord', 'resolveTaskExecutionRecord',
  'cleanupTaskExecutionRecord', 'gcTaskExecutionRecords', 'recoverTaskExecutionRecord',
]);
const TASK_EXECUTION_RECORD_PERSISTENCE_METHODS = Object.freeze([
  'readTaskExecutionRecordPersistence', 'listTaskExecutionRecordPersistence', 'openTaskExecutionRecordPersistence',
  'replaceTaskExecutionRecordPersistence', 'taskExecutionRecordRecentRank', 'listTaskExecutionRecordGcCandidates',
  'deleteTaskExecutionRecordTombstonePersistence', 'taskExecutionRecordBodyFiles', 'publishTaskExecutionRecordBody',
  'verifyTaskExecutionRecordBody', 'inspectTaskExecutionRecordBody', 'readTaskExecutionRecordBodyFile',
  'cleanupTaskExecutionRecordBody',
]);
const TASK_VERIFICATION_APPLICATION_METHODS = Object.freeze([
  'observeTaskVerificationDeclarations', 'inspectTaskVerification', 'recordTaskVerification', 'generateTaskVerificationPrompt',
]);
const TASK_VERIFICATION_PERSISTENCE_METHODS = Object.freeze([
  'taskVerificationResultPath', 'readTaskVerificationResultPersistence', 'writeTaskVerificationResultPersistence', 'renderTaskVerificationResult',
]);
const TASK_PLANNING_IDENTITY_APPLICATION_METHODS = Object.freeze(['inspectTaskPlanningIdentity']);
const TASK_DEVELOPMENT_APPLICATION_METHODS = Object.freeze([
  'inspectTaskDevelopment', 'inspectTaskDevelopmentCurrent', 'beginTaskDevelopment',
  'recordTaskDevelopmentPlanning', 'observeTaskDevelopment', 'recordTaskDevelopmentPolicy',
  'recordTaskDevelopmentGate', 'freezeTaskDevelopmentCandidate', 'decideTaskDevelopment',
  'createTaskDevelopmentHandoff', 'assertTaskDevelopmentCarrier', 'recordTaskParentPlan',
  'bindTaskPlannedContributions', 'recordTaskParentAcceptance',
]);
const TASK_DEVELOPMENT_PERSISTENCE_METHODS = Object.freeze([
  'taskDevelopmentReceiptPath', 'readTaskDevelopmentPersistence', 'writeTaskDevelopmentPersistence', 'renderTaskDevelopmentReceipt',
]);
const PARENT_COORDINATION_APPLICATION_METHODS = Object.freeze([
  'projectParentCoordinationChild', 'inspectParentCoordination', 'inspectParentStartupReadiness',
  'refreshParentPlanning', 'recordParentPlan', 'reconcileParentPlan', 'bindChildContributions', 'acceptParentCoordination',
]);
const PARENT_COORDINATION_PERSISTENCE_METHODS = Object.freeze(['readParentCoordinationPersistence']);
const TASK_OVERVIEW_APPLICATION_METHODS = Object.freeze(['inspectTaskOverview']);
const TASK_OVERVIEW_PERSISTENCE_METHODS = Object.freeze(['readTaskOverviewPersistence']);
const TASK_ENTRY_SNAPSHOT_APPLICATION_METHODS = Object.freeze(['inspectTaskEntrySnapshot']);
const TASK_FINISH_APPLICATION_METHODS = Object.freeze([
  'taskFinish', 'refreshTaskFinishMaintenance', 'inspectTaskFinishReadModel', 'readTaskFinishResults',
]);
const TASK_FINISH_PERSISTENCE_METHODS = Object.freeze([
  'taskFinishRunPath', 'taskFinishCompletionPath', 'readTaskFinishRunPersistence',
  'writeTaskFinishRunPersistence', 'discardFailedTaskFinishRunPersistence',
  'readTaskFinishCompletionPersistence', 'writeTaskFinishCompletionPersistence',
  'finalizeTaskFinishPersistence', 'writeTaskFinishMaintenancePersistence',
  'acquireTaskFinishCurrentTargetLease', 'acquireTaskFinishTargetLease',
  'releaseTaskFinishCurrentTargetLease', 'releaseTaskFinishTargetLease',
  'readTaskFinishResultsPersistence', 'inspectTaskFinishPersistence',
]);
const TASK_FINISH_PERSISTENCE_READ_METHODS = Object.freeze([
  'taskFinishRunPath', 'taskFinishCompletionPath', 'readTaskFinishRunPersistence',
  'readTaskFinishCompletionPersistence', 'readTaskFinishResultsPersistence', 'inspectTaskFinishPersistence',
]);
const TASK_FINISH_INTERNAL_METHODS = Object.freeze([
  'refreshTaskFinishMaintenance', 'acquireTaskFinishCurrentTargetLease', 'releaseTaskFinishCurrentTargetLease',
]);
const TASK_TERMINAL_DELIVERY_APPLICATION_METHODS = Object.freeze([
  'inspectTaskTerminalDelivery', 'inspectTaskDevelopmentView', 'inspectTaskReviewView', 'inspectTaskVerificationView',
]);

function pick(source, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, source[method]])));
}

function taskPrivateComposition(runtime, requires) {
  const composition = Object.create(runtime);
  for (const port of Object.values(requires)) {
    for (const [name, value] of Object.entries(port)) {
      const installedValue = runtime[name];
      Object.defineProperty(composition, name, {
        configurable: true,
        enumerable: true,
        get: () => runtime[name] === installedValue ? value : runtime[name],
      });
    }
  }
  return composition;
}

function compatibility(owner, methods, testSupportProperties = undefined) {
  return Object.freeze({
    owner,
    scope: 'existing Task Finish, Verification executor, Doctor and Web runtime consumers only',
    exit: 'remove per consumer as remaining Task Finish and HTTP Host slices migrate; delete in legacy-exit-and-conformance',
    methods: Object.freeze(methods),
    ...(testSupportProperties ? { testSupportProperties: Object.freeze(testSupportProperties) } : {}),
  });
}

function taskEnvironmentCliContributions() {
  return Object.freeze([
    {
      key: 'task environment prepare', surface: 'agent-machine', summary: '按Project Preparation Declaration与Agent选择的Task Plan幂等准备Project/Service执行环境。',
      help: ['Usage: buildr task environment prepare <task-id> --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> [--plan <json-file>] [--branch <branch>] [--start-point <ref>] [--shared] [--target <canonical-workspace>] [--json]', '', 'Plan Request必须恰好覆盖Task Record中的全部Project/Service scope，可引用Project preparation.yml的Recipe或显式task-inline Recipe。', '默认使用Git worktree；inspect严格只读，不执行Step或回写current。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'prepare',
      run: (runtime, context) => taskEnvironmentCommand(runtime, 'prepare', context.argv.slice(5)),
    },
    {
      key: 'task environment plan record', surface: 'agent-machine', summary: '解析Project Preparation Declaration并原子保存当前Task的Plan执行快照，不执行任何准备Step。',
      help: ['Usage: buildr task environment plan record <task-id> --input <json-file> [--target <canonical-workspace>] [--json]', '', '输入必须是closed buildr.task-environment-plan-request/v1；新current保存resolved buildr.task-environment-plan/v3。'],
      match: ({ domain, action, runtimeId, args }) => domain === 'task' && action === 'environment' && runtimeId === 'plan' && args[0] === 'record',
      run: (runtime, context) => taskEnvironmentPlanCommand(runtime, 'record', context.args.slice(1)),
    },
    {
      key: 'task environment plan inspect', surface: 'agent-machine', summary: '只读返回Environment current中保存的Preparation Plan，不探测或修复环境。',
      help: ['Usage: buildr task environment plan inspect <task-id> [--target <canonical-workspace>] [--json]', '', '只读取Workspace SQLite current；缺少Plan时返回unavailable。'],
      match: ({ domain, action, runtimeId, args }) => domain === 'task' && action === 'environment' && runtimeId === 'plan' && args[0] === 'inspect',
      run: (runtime, context) => taskEnvironmentPlanCommand(runtime, 'inspect', context.args.slice(1)),
    },
    {
      key: 'task environment inspect', surface: 'agent-machine', summary: '只读返回当前机器的 Environment Receipt availability、observedAt、scope/root、执行基础、provider、资源和 cleanup 摘要。',
      help: ['Usage: buildr task environment inspect <task-id> [--target <canonical-workspace>] [--json]', '', '只读返回当前机器的 Environment Receipt availability、observedAt、scope/root、执行基础、provider、资源和 cleanup 摘要。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'inspect',
      run: (runtime, context) => taskEnvironmentCommand(runtime, 'inspect', context.argv.slice(5)),
    },
    {
      key: 'task environment cleanup', surface: 'agent-machine', summary: '按 provider 依赖先停止 Task-owned 资源，再清理可证明属于该 Task 的 Git checkout；成功后保留最小处置摘要。',
      help: ['Usage: buildr task environment cleanup <task-id> [--target <canonical-workspace>] [--json]', '', '按 provider 依赖先停止 Task-owned 资源，再清理可证明属于该 Task 的 Git checkout；成功后保留最小处置摘要。', '公共CLI接受已持久化且可重新验证的Delivery evidence，或已明确abandon终态；不接受调用方声明交付成功。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'environment' && runtimeId === 'cleanup',
      run: (runtime, context) => taskEnvironmentCommand(runtime, 'cleanup', context.argv.slice(5)),
    },
  ].map(Object.freeze));
}

function taskExecutionRecordCliContributions() {
  return Object.freeze([
    {
      key: 'task execution-record list', surface: 'agent-machine', summary: '按 Task 返回紧凑、可移植的 Execution Record 列表。',
      help: ['Usage: buildr task execution-record list --task <task-id> [--view <all|verification|finish>] [--target <canonical-workspace>] [--json]', '', '原终端不可用时按Task恢复同一次execution identity；只读取Execution Record，不写Verification Result或Finish current。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'execution-record' && runtimeId === 'list',
      run: (runtime, context) => taskExecutionRecordListCommand(runtime, context.argv.slice(5)),
    },
    {
      key: 'task execution-record inspect', surface: 'agent-machine', summary: '按 Task 与 record identity 回读状态、耗时、失败和证据摘要。',
      help: ['Usage: buildr task execution-record inspect --task <task-id> --record <record-id> [--target <canonical-workspace>] [--json]', '', '回读同一record的lifecycle、timing、failure与evidence摘要；只读且不写Verification Result或Finish current。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'execution-record' && runtimeId === 'inspect',
      run: (runtime, context) => taskExecutionRecordInspectCommand(runtime, context.argv.slice(5)),
    },
    {
      key: 'task execution-record gc', surface: 'maintenance', summary: '按固定 retention、resolution 与 recent-count 规则执行 bounded Workspace ExecRecord GC；支持 dry-run，不扫描文件系统或清理执行资源。',
      help: ['Usage: buildr task execution-record gc [--target <canonical-workspace>] [--dry-run] [--limit <1..500>] [--json]', '', '按固定 retention、resolution 与 recent-count 规则选择 eligible records，复用单记录 cleanup，并删除到期 cleaned tombstone。', '不接受 Task/owner/path、force、retention override 或 failure disposition；不调用 Workspace Doctor。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'execution-record' && runtimeId === 'gc',
      run: (runtime, context) => taskExecutionRecordGcCommand(runtime, context.argv.slice(5)),
    },
    {
      key: 'task execution-record recover', surface: 'agent-machine', summary: '按registered producer的完整终态证据补seal Verification或Task Finish Execution Record。',
      help: ['Usage: buildr task execution-record recover --task <task-id> --record <record-id> [--summary <file> | --authorize-unknown-outcome] [--target <canonical-workspace>] [--json]', '', '--summary只接受matching Buildr-owned Verification transient summary，或该Finish invocation精确diagnostics summary；补seal原record而不重跑。', 'Task Finish recovery只读核对matching current/terminal Finish authority，不改写Finish current、delivery、Environment或Task terminal，并只清理该invocation evidence。', '--authorize-unknown-outcome仅适用于Verification：它不证明原结果，会终结原record并可能使仍存活producer的后续seal失败；Task Finish必须有terminal evidence。', '不接受outcome、files、locator、owner、producer、retry、timeout、process ID、SQL或cleanup shell。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'execution-record' && runtimeId === 'recover',
      run: (runtime, context) => taskExecutionRecordRecoverCommand(runtime, context.argv.slice(5)),
    },
  ].map(Object.freeze));
}

function taskVerificationCliContributions() {
  return Object.freeze([
    {
      key: 'task verification inspect', surface: 'agent-machine', summary: '只读返回单一 current slot、response-only resultDigest 与 target/declaration 派生 applicability；未提供 current target 时 target 轴为 unknown。',
      help: ['Usage: buildr task verification inspect <task-id> [--target-identity <identity>] [--target <canonical-workspace>] [--json]', '', '只读返回单一 current slot、response-only resultDigest 与 target/declaration 派生 applicability；未提供 current target 时 target 轴为 unknown。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'verification' && runtimeId === 'inspect',
      run: (runtime, context) => taskVerificationCommand(runtime, 'inspect', context.argv.slice(5)),
    },
    {
      key: 'task verification record', surface: 'agent-machine', summary: '只接收完整 current facts 并原子整值替换 current；declaration identities 由 Application 从 Task scope 与 Project registry 读取，调用方不能提交。',
      help: ['Usage: buildr task verification record <task-id> --target-identity <identity> --target-summary <text> [--capability <project>/<capability>::<passed|failed>::<fact> ...] [--coverage-gap <scope>::<summary> ...] --outcome <passed|not-passed> --summary <text> [--declaration-root <task-environment-root>] [--target <canonical-workspace>] [--json]', '', '只接收完整 current facts 并原子整值替换 current；declaration identities 由 Application 从 Task scope 与 Project registry 读取，调用方不能提交。', '完整 stdout/stderr、耗时、临时路径、Environment Receipt、applicability、revision、proceed/blocked 或 Task status 不属于 Result。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'verification' && runtimeId === 'record',
      run: (runtime, context) => taskVerificationCommand(runtime, 'record', context.argv.slice(5)),
    },
  ].map(Object.freeze));
}

function parentCoordinationCliContributions() {
  const definitions = [
    ['inspect', 'primary', '只读返回Parent Plan、Child Contribution交付事实与最终验收前置条件；历史Task保持legacy模式。', ['Usage: buildr task parent inspect <task-id> [--target <canonical-workspace>] [--json]', '', '只组合Task Record与已保存专业事实，不扫描文件系统或回填Parent。'], 'inspect'],
    ['record', 'agent-machine', '为active Parent首次记录closed Parent Plan。', ['Usage: buildr task parent record <task-id> --input <parent-plan.json> [--target <canonical-workspace>] [--json]', '       buildr task parent record --schema|--example [--json]'], 'record'],
    ['reconcile', 'agent-machine', '以expected Parent Plan identity显式收敛Contribution、依赖或最终验收变化。', ['Usage: buildr task parent reconcile <task-id> --expected-plan <identity> --input <parent-plan.json> --reason <text> [--target <canonical-workspace>] [--json]', '       buildr task parent reconcile --schema|--example [--json]'], 'reconcile'],
    ['refresh-planning', 'agent-machine', '复用saved Parent Plan与current ready Planning Review，安全刷新Development planning gate。', ['Usage: buildr task parent refresh-planning <task-id> [--target <canonical-workspace>] [--json]'], 'refresh'],
    ['bind-child', 'agent-machine', '把已有Child Development明确绑定到Parent Plan的一个或多个Contribution。', ['Usage: buildr task parent bind-child <child-task-id> --parent <parent-task-id> --contribution <id> ... [--target <canonical-workspace>] [--json]'], 'bind'],
    ['accept', 'agent-machine', '在全部Contribution得到可证明处置后显式记录Parent最终集成验收；不会自动完成Task。', ['Usage: buildr task parent accept <task-id> --expected-plan <identity> --summary <text> [--target <canonical-workspace>] [--json]'], 'accept'],
  ];
  return Object.freeze(definitions.map(([runtimeId, surface, summary, help, operation]) => Object.freeze({
    key: `task parent ${runtimeId}`, surface, summary, help,
    match: ({ domain, action, runtimeId: actual, operation: extra }) => domain === 'task' && action === 'parent' && actual === runtimeId && (runtimeId !== 'inspect' || !extra),
    run: (runtime, context) => parentCoordinationCommand(runtime, operation, context.argv.slice(5)),
  })));
}

function taskEntrySnapshotCliContributions() {
  return Object.freeze([Object.freeze({
    key: 'task next', surface: 'agent-machine', summary: '只读返回Formal Task当前最小identity、execution/writer route与唯一required或recommended next action。',
    help: ['Usage: buildr task next <task-id> [--execution-target <path>] [--profile] [--target <canonical-workspace>] [--json]', '', '按Task → Environment → Development的最早硬前置短路读取；不执行next、不写正式事实，也不展开完整下游lifecycle或capability graph。', '--execution-target只核验matching Environment允许的执行根；--profile只返回本次调用可观察的wall-clock与owner read事实。'],
    match: ({ domain, action }) => domain === 'task' && action === 'next',
    run: (runtime, context) => taskEntrySnapshotCommand(runtime, context.argv.slice(4)),
  })]);
}

export function createTaskFinishCliContributions(application = null) {
  const invoke = (runtime, action, args) => (application || runtime).taskFinish(action, args);
  return Object.freeze([
    Object.freeze({
      key: 'task finish inspect', surface: 'agent-machine', summary: '必需参数：--run。',
      help: [
        'Usage: buildr task finish inspect --run <id> [--target <canonical-workspace>] [--detail <compact|full|self-bootstrap>] [--json]', '',
        '必需参数：--run。', '互斥参数：无。', 'Execution surface：canonical Workspace 中的 durable finish run，只读。',
        '安全副作用：无；JSON默认返回closed compact投影，显式--detail full返回完整诊断Result；--detail self-bootstrap返回Product-owned稳定自举输入。',
        '新协议不接受 caller evidence、fingerprint、execution plan、repair authorization 或手写 recovery manifest；新客户端不读取、转换或处理旧协议状态。',
      ],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'inspect',
      run: (runtime, context) => invoke(runtime, 'inspect', context.argv.slice(5)),
    }),
    Object.freeze({
      key: 'task finish reconcile', surface: 'agent-machine', summary: '观察 current Task Contribution 与真实远端结果，收敛由 Agent、PR 或其他已授权路径完成的交付。',
      help: [
        'Usage: buildr task finish reconcile --task <task-id> [--agent <agent>] [--target-branch <branch>] [--remote <name>] [--target <canonical-workspace>] [--detail <compact|full|self-bootstrap>] [--json]', '',
        '从 current Development handoff 与 Task Environment repository set解析交付身份，读取并fetch真实远端ref，逐仓库验证Task Contribution包含关系。',
        '不接受success、evidence、commit message、run token或手写proof；不会push、force push、改写共享历史或创建Delivery Carrier。',
        '全部适用repository交付成立后提交Task交付终态；activation、Environment cleanup与diagnostics作为独立maintenance事实交给Agent继续处理。',
      ],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'reconcile',
      run: (runtime, context) => invoke(runtime, 'reconcile', context.argv.slice(5)),
    }),
    Object.freeze({
      key: 'task finish run', surface: 'agent-machine', summary: '必需参数：首次运行需要 --task、--commit-message、current formal Development handoff 与 ready Task Environment；resume复用已冻结message。',
      help: [
        'Usage: buildr task finish run --task <task-id> --commit-message <message> [--agent <agent>] [--target-branch <branch>] [--remote <name>] [--target <canonical-workspace>] [--detail <compact|full|self-bootstrap>] [--json]',
        'Resume: buildr task finish run --task <task-id> --run <id> --resume <token> [--accept-zero-delta-adaptation] [--target <canonical-workspace>] [--detail <compact|full|self-bootstrap>] [--json]',
        'Bootstrap recovery: buildr task finish run --run <id> [--resume <token>] --bootstrap-recovery --target <canonical-workspace> [--detail <compact|full|self-bootstrap>] [--json]',
        'Occupancy release: buildr task finish run --task <task-id> --run <id> --release-occupancy --target <canonical-workspace> [--detail <compact|full|self-bootstrap>] [--json]', '',
        '必需参数：首次运行需要 --task、--commit-message、current formal Development handoff 与 ready Task Environment；Agent根据最终内容和仓库约定提供完整message，产品规范化并追加Buildr-Task trailer。target branch 默认使用 retained canonical Workspace 的当前符号分支，Environment startPoint 不提供交付分支 authority。',
        '可选 --agent：省略时使用 Task Environment 已绑定 adapter，不得猜测当前聊天宿主或默认为 Codex；传入值必须与 Environment adapter 一致。',
        '互斥参数：已有run/resume不接受--commit-message覆盖；--resume只接受产品为当前blocked run生成的令牌；--release-occupancy与--resume、--bootstrap-recovery、--accept-zero-delta-adaptation互斥，且必须同时提供--run与--task；不接受--project/--change或调用方Candidate/Result。',
        '零差异适配：--accept-zero-delta-adaptation只用于已有adaptation-required run的matching resume，表示Agent已审查clean baseline carrier无需新增差异；它不创建commit、不替代resume token，也不表示Buildr证明语义等价。',
        '受控自修复：--bootstrap-recovery只用于已有run在无交付副作用的preflight/prepare Product provider缺陷；必须另行明确授权。retained Application仍是writer，只从冻结clean Task Environment HEAD派生并加载run-owned provider capsule；不接受source/module/tarball/manifest输入。',
        '占用释放：--release-occupancy只用于Task已放弃且该run从未成功交付时，释放run-owned隔离载体占用；不是普通resume、不是作废已推送交付，也不把abandoned Task改成completed。',
        'Execution surface：Development handoff、Task Environment carrier 执行根、retained canonical Workspace 与产品解析的 delivery remote。',
        '安全副作用：产品顺序执行 handoff preflight、隔离 Delivery Carrier 的机械复用或 Delivery Adaptation、deliver 和 cleanup；不收敛 Change、不生成 Candidate、不运行 Verification/Review，也不修改 Development Receipt。',
        '提交信息：新run拒绝缺失、空subject或精确“交付 + 当前Task ID”的占位主题；同一run的prepare、adaptation与resume复用冻结message，公开Result只返回subject和identity。',
        'deliver使用Environment adapter冻结的run agent尝试retained Doctor；Doctor未ready时保留已完成remote readback并把Activation标记为attention，不撤销Delivery。',
        '每次真正执行的run/resume尝试打开独立finish-diagnostics Execution Record；open、seal、capacity或transient cleanup失败只形成Diagnostics attention，不阻止安全Delivery。',
        'JSON输出默认使用closed compact投影；完整phase checks、operations、diagnostics、carrier与completion事实必须显式使用--detail full；跨模块自举只消费--detail self-bootstrap稳定投影。',
        '新协议不接受 caller evidence、fingerprint、execution plan、repair authorization 或手写 recovery manifest；新客户端不读取、转换或处理旧协议状态。',
      ],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'finish' && runtimeId === 'run',
      run: (runtime, context) => invoke(runtime, 'run', context.argv.slice(5)),
    }),
  ]);
}

export function createTaskTerminalDeliveryCliContributions(application = null) {
  return Object.freeze([Object.freeze({
    key: 'task delivery inspect', surface: 'agent-machine', summary: '仅凭 Task ID 回读既有 Terminal Delivery 状态、Finish run ID、最终远端引用、清理事实与可用恢复动作。',
    help: [
      'Usage: buildr task delivery inspect <task-id> [--target <canonical-workspace>] [--json]', '',
      '调用既有 Terminal Delivery Application，返回 buildr.task-terminal-delivery/v1；只读且不执行 resume、cleanup 或 Finish。',
      'task inspect 继续只查询 Task Record；task finish inspect --run 继续按 run identity 查询完整 Finish 明细。',
    ],
    match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'delivery' && runtimeId === 'inspect',
    run: (runtime, context) => taskTerminalDeliveryInspectCommand(application || runtime, context.argv.slice(5)),
  })]);
}

export function createTaskRecordCliContributions(application = null) {
  return Object.freeze([
    {
      key: 'task create', surface: 'primary', summary: '创建 active 正式 Task，或以 --status todo 只保存待办意向；复盘来源可重复。',
      help: [
        'Usage: buildr task create <task-id> --title <text> --intent <text> [--status <todo|active>] [--retrospective-source <task-id> ...] [--parent <task-id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] [--target <canonical-workspace>] [--json]',
        '',
        '省略 --status 时创建 active；--status todo 只写 SQLite，拒绝 Change，不创建 Environment、Git 或专业记录。',
        '--retrospective-source 只接受已有 current 复盘的 completed/abandoned Task，可重复且仅保存 source Task ID。',
        '--parent 只接受当前 Workspace 中已存在且 active 的 Task；副作用是在本地 structured store 中原子创建 Task 及其直接 Parent 关系。',
        '不创建 Environment、Change、branch、commit 或专业记录，也不自动改变 Parent/Child 的状态。',
      ],
      match: ({ domain, action }) => domain === 'task' && action === 'create',
      run: (runtime, context) => taskRecordCommand(application || pick(runtime, APPLICATION_METHODS), 'create', context.argv.slice(4)),
    },
    {
      key: 'task inspect', surface: 'primary', summary: '只读返回 Task Record、直接 Parent/Children 摘要和响应级 recordDigest，不递归展开整棵树，不暴露数据库路径；数据库尚未初始化时保持零写入。',
      help: ['Usage: buildr task inspect <task-id> [--target <canonical-workspace>] [--json]', '', '只读返回 Task Record、直接 Parent/Children 摘要和响应级 recordDigest，不递归展开整棵树，不暴露数据库路径；数据库尚未初始化时保持零写入。'],
      match: ({ domain, action }) => domain === 'task' && action === 'inspect',
      run: (runtime, context) => taskRecordCommand(application || pick(runtime, APPLICATION_METHODS), 'inspect', context.argv.slice(4)),
    },
    {
      key: 'task update', surface: 'primary', summary: '至少提供一个明确 setter/add/remove；只允许修改 todo 或 active Task。',
      help: [
        'Usage: buildr task update <task-id> [--title <text>] [--intent <text>] [--parent <task-id> | --clear-parent] [--add-retrospective-source <task-id> ...] [--remove-retrospective-source <task-id> ...] [--add-project <code> ...] [--remove-project <code> ...] [--add-service <project/service> ...] [--remove-service <project/service> ...] [--add-change <project/change> ...] [--remove-change <project/change> ...] [--target <canonical-workspace>] [--json]',
        '',
        '至少提供一个明确 setter/add/remove；同一引用不能同时 add/remove。只允许修改 todo 或 active Task，todo 拒绝 Change。',
        '--parent 与 --clear-parent 互斥；拒绝不存在或 terminal Parent、自引用和任何祖先循环。Child 列表是只读派生结果。',
        '不接受 --input、patch、完整 next-state、expected revision 或专业模块字段。',
      ],
      match: ({ domain, action }) => domain === 'task' && action === 'update',
      run: (runtime, context) => taskRecordCommand(application || pick(runtime, APPLICATION_METHODS), 'update', context.argv.slice(4)),
    },
    {
      key: 'task activate', surface: 'primary', summary: '把 todo Task 单向激活为 active；该动作自身不执行 Git、Environment 或研发阶段。',
      help: ['Usage: buildr task activate <task-id> [--target <canonical-workspace>] [--json]', '', '只执行 todo -> active。Agent 必须在调用前通过 Task Triage 完成当前事实确认与 Git 基线门禁。'],
      match: ({ domain, action }) => domain === 'task' && action === 'activate',
      run: (runtime, context) => taskRecordCommand(application || pick(runtime, APPLICATION_METHODS), 'activate', context.argv.slice(4)),
    },
    {
      key: 'task complete', surface: 'primary', summary: '完成 todo/active Task；todo 只允许 --no-change。',
      help: ['Usage: buildr task complete <task-id> --summary <text> [--no-change] [--target <canonical-workspace>] [--json]', '', 'active 可正常完成；todo 只允许 --no-change，否则必须先 activate。', '该动作只更新顶层 Task Record，不执行 Finish、Verification、Git、publication 或 cleanup。'],
      match: ({ domain, action }) => domain === 'task' && action === 'complete',
      run: (runtime, context) => taskRecordCommand(application || pick(runtime, APPLICATION_METHODS), 'complete', context.argv.slice(4)),
    },
    {
      key: 'task abandon', surface: 'primary', summary: '把 todo 或 active Task 单向标记为 abandoned；终态不可重开或继续修改。',
      help: ['Usage: buildr task abandon <task-id> --reason <text> [--target <canonical-workspace>] [--json]', '', '把 todo 或 active Task 单向标记为 abandoned；终态不可重开或继续修改。', '该动作只更新顶层 Task Record，不执行 Environment cleanup、Git 或其他专业动作。'],
      match: ({ domain, action }) => domain === 'task' && action === 'abandon',
      run: (runtime, context) => taskRecordCommand(application || pick(runtime, APPLICATION_METHODS), 'abandon', context.argv.slice(4)),
    },
  ].map(Object.freeze));
}

export function createTaskReviewCliContributions(application = null) {
  return Object.freeze([
    {
      key: 'task review inspect', surface: 'agent-machine',
      summary: '只读返回 Planning/Completion 两个可选槽位、response-only resultDigest 与派生 applicability；未提供 current target 时已有 Result 显示 unknown。',
      help: [
        'Usage: buildr task review inspect <task-id> [--planning-target <identity>] [--completion-target <identity>] [--target <canonical-workspace>] [--json]',
        '',
        '只读返回 Planning/Completion 两个可选槽位、response-only resultDigest 与派生 applicability；未提供 current target 时已有 Result 显示 unknown。',
      ],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'review' && runtimeId === 'inspect',
      run: (runtime, context) => taskReviewCommand(application || pick(runtime, [...TASK_REVIEW_APPLICATION_METHODS, 'taskReviewResultPath']), 'inspect', context.argv.slice(5)),
    },
    {
      key: 'task review record', surface: 'agent-machine',
      summary: '只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。',
      help: [
        'Usage: buildr task review record <task-id> --type <planning|completion> --target-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <ready|changes-required> --summary <text> [--target <canonical-workspace>] [--json]',
        '',
        '只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。',
        '中断、缺少 target identity、覆盖或结论不完整时不写入；Completion identity 必须由真实 Candidate producer 提供。',
      ],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'review' && runtimeId === 'record',
      run: (runtime, context) => taskReviewCommand(application || pick(runtime, [...TASK_REVIEW_APPLICATION_METHODS, 'taskReviewResultPath']), 'record', context.argv.slice(5)),
    },
  ].map(Object.freeze));
}

function createTaskRecordModule(requires) {
  const privateComposition = {
    ...requires['workspace.structured-store'],
    ...requires['project-service.reader'],
    ...requires['change.resolver'],
    ...requires['workspace.operation-memoizer'],
    ...requires['task.parent-coordination-reader'],
  };
  registerTaskRecordRepository(privateComposition);
  registerTaskRecordApplication(privateComposition);

  const application = pick(privateComposition, APPLICATION_METHODS);
  const persistenceRead = pick(privateComposition, PERSISTENCE_READ_METHODS);
  const cliPort = Object.freeze({
    ...application,
    readTaskRecordPersistence: persistenceRead.readTaskRecordPersistence,
  });
  const compatibility = Object.freeze({
    owner: 'bootstrap-and-module-contracts',
    scope: 'existing runtime consumers only',
    exit: 'remove per consumer as Task, Workspace, Agent Assets, Web and System modules migrate; delete in legacy-exit-and-conformance',
    methods: Object.freeze({ ...application, ...persistenceRead, ...pick(privateComposition, TEST_SUPPORT_METHODS) }),
    testSupportMethods: TEST_SUPPORT_METHODS,
  });
  return Object.freeze({
    provides: {
      [TASK_RECORD_APPLICATION]: application,
      [TASK_RECORD_PERSISTENCE_READ]: persistenceRead,
      [TASK_RECORD_COMPATIBILITY]: compatibility,
    },
    contributions: {
      cli: createTaskRecordCliContributions(cliPort),
      http: [Object.freeze({
        id: 'task-record.http',
        taskIdSource: TASK_RECORD_ID_SOURCE,
        handle: (input) => handleTaskRecordHttpRequest({ ...input, runtime: application }),
      })],
    },
  });
}

export const TASK_RECORD_MODULE = Object.freeze({
  id: TASK_RECORD_MODULE_ID,
  requires: Object.freeze([
    'workspace.structured-store',
    'project-service.reader',
    'change.resolver',
    'workspace.operation-memoizer',
    'task.parent-coordination-reader',
  ]),
  create: createTaskRecordModule,
});

function createTaskReviewModule(requires) {
  const privateComposition = {
    ...requires[TASK_RECORD_PERSISTENCE_READ],
    ...requires['workspace.structured-store'],
    ...requires['change.resolver'],
  };
  registerTaskReviewRepository(privateComposition);
  registerTaskReviewApplication(privateComposition);

  const application = pick(privateComposition, TASK_REVIEW_APPLICATION_METHODS);
  const persistenceRead = pick(privateComposition, TASK_REVIEW_PERSISTENCE_READ_METHODS);
  const cliPort = Object.freeze({ ...application, taskReviewResultPath: persistenceRead.taskReviewResultPath });
  const compatibility = Object.freeze({
    owner: 'task-capabilities',
    scope: 'existing runtime consumers only',
    exit: 'remove per consumer as remaining Task lifecycle modules migrate; delete in legacy-exit-and-conformance',
    methods: Object.freeze({ ...application, ...pick(privateComposition, TASK_REVIEW_PERSISTENCE_COMPATIBILITY_METHODS) }),
    testSupportProperties: Object.freeze({
      taskReviewSerialize: Object.freeze({
        get: () => privateComposition.taskReviewSerialize,
        set: (value) => { privateComposition.taskReviewSerialize = value; },
      }),
    }),
  });
  return Object.freeze({
    provides: {
      [TASK_REVIEW_APPLICATION]: application,
      [TASK_REVIEW_PERSISTENCE_READ]: persistenceRead,
      [TASK_REVIEW_COMPATIBILITY]: compatibility,
    },
    contributions: {
      cli: createTaskReviewCliContributions(cliPort),
      http: [Object.freeze({
        id: 'task-review.http',
        handle: (input) => handleTaskReviewHttpRequest({ ...input, runtime: application }),
      })],
    },
  });
}

export const TASK_REVIEW_MODULE = Object.freeze({
  id: TASK_REVIEW_MODULE_ID,
  requires: Object.freeze([
    TASK_RECORD_PERSISTENCE_READ,
    'workspace.structured-store',
    'change.resolver',
  ]),
  create: createTaskReviewModule,
});

function createTaskRetrospectiveModule(requires) {
  const privateComposition = {
    ...requires[TASK_RECORD_APPLICATION],
    ...requires[TASK_RECORD_PERSISTENCE_READ],
    ...requires['workspace.structured-store'],
  };
  registerTaskRetrospectiveRepository(privateComposition);
  registerTaskRetrospectiveApplication(privateComposition);

  const application = pick(privateComposition, TASK_RETROSPECTIVE_APPLICATION_METHODS);
  const persistenceRead = pick(privateComposition, TASK_RETROSPECTIVE_PERSISTENCE_READ_METHODS);
  const compatibility = Object.freeze({
    owner: 'task-retrospective-capability',
    scope: 'existing runtime consumers only',
    exit: 'remove per consumer as remaining Task lifecycle modules migrate; delete in legacy-exit-and-conformance',
    methods: Object.freeze({ ...application, ...pick(privateComposition, TASK_RETROSPECTIVE_PERSISTENCE_COMPATIBILITY_METHODS) }),
    testSupportProperties: Object.freeze({
      taskRetrospectiveSerialize: Object.freeze({
        get: () => privateComposition.taskRetrospectiveSerialize,
        set: (value) => { privateComposition.taskRetrospectiveSerialize = value; },
      }),
    }),
  });
  return Object.freeze({
    provides: {
      [TASK_RETROSPECTIVE_APPLICATION]: application,
      [TASK_RETROSPECTIVE_PERSISTENCE_READ]: persistenceRead,
      [TASK_RETROSPECTIVE_COMPATIBILITY]: compatibility,
    },
    contributions: {
      http: [Object.freeze({
        id: 'task-retrospective.http',
        handle: (input) => handleTaskRetrospectiveHttpRequest({ ...input, runtime: application }),
      })],
    },
  });
}

export const TASK_RETROSPECTIVE_MODULE = Object.freeze({
  id: TASK_RETROSPECTIVE_MODULE_ID,
  requires: Object.freeze([
    TASK_RECORD_APPLICATION,
    TASK_RECORD_PERSISTENCE_READ,
    'workspace.structured-store',
  ]),
  create: createTaskRetrospectiveModule,
});

export function createTaskEnvironmentModule(runtime) {
  return Object.freeze({
    id: TASK_ENVIRONMENT_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_PERSISTENCE_READ]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerTaskEnvironmentRepository(composition);
      registerTaskEnvironmentApplication(composition);
      const application = pick(composition, TASK_ENVIRONMENT_APPLICATION_METHODS);
      const persistenceRead = pick(composition, ['taskEnvironmentPath', 'readTaskEnvironmentPersistence']);
      const testSupportProperties = {
        readTaskEnvironmentPersistence: Object.freeze({
          get: () => composition.readTaskEnvironmentPersistence,
          set: (value) => { composition.readTaskEnvironmentPersistence = value; },
        }),
      };
      return Object.freeze({
        provides: {
          [TASK_ENVIRONMENT_APPLICATION]: application,
          [TASK_ENVIRONMENT_PERSISTENCE_READ]: persistenceRead,
          [TASK_ENVIRONMENT_COMPATIBILITY]: compatibility('task-lifecycle-core', pick(composition, [...TASK_ENVIRONMENT_PERSISTENCE_METHODS, ...TASK_ENVIRONMENT_APPLICATION_METHODS]), testSupportProperties),
        },
        contributions: {
          cli: taskEnvironmentCliContributions(),
          http: [createTaskEnvironmentHttpContribution(TASK_RECORD_ID_SOURCE, application, requires[TASK_RECORD_PERSISTENCE_READ])],
        },
      });
    },
  });
}

export function createTaskExecutionRecordModule(runtime) {
  return Object.freeze({
    id: TASK_EXECUTION_RECORD_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_PERSISTENCE_READ]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerTaskExecutionRecordRepository(composition);
      registerTaskExecutionRecordBodyStore(composition);
      registerTaskExecutionRecordApplication(composition);
      const application = pick(composition, TASK_EXECUTION_RECORD_APPLICATION_METHODS);
      const persistenceRead = pick(composition, [
        'readTaskExecutionRecordPersistence', 'listTaskExecutionRecordPersistence',
        'verifyTaskExecutionRecordBody', 'inspectTaskExecutionRecordBody', 'readTaskExecutionRecordBodyFile',
      ]);
      const testSupportProperties = Object.fromEntries([
        'replaceTaskExecutionRecordPersistence', 'cleanupTaskExecutionRecordBody',
      ].map((name) => [name, Object.freeze({
        get: () => composition[name],
        set: (value) => { composition[name] = value; },
      })]));
      return Object.freeze({
        provides: {
          [TASK_EXECUTION_RECORD_APPLICATION]: application,
          [TASK_EXECUTION_RECORD_PERSISTENCE_READ]: persistenceRead,
          [TASK_EXECUTION_RECORD_COMPATIBILITY]: compatibility('task-lifecycle-core', pick(composition, [...TASK_EXECUTION_RECORD_PERSISTENCE_METHODS, ...TASK_EXECUTION_RECORD_APPLICATION_METHODS]), testSupportProperties),
        },
        contributions: {
          cli: taskExecutionRecordCliContributions(),
          http: [createTaskExecutionRecordHttpContribution(TASK_RECORD_ID_SOURCE)],
        },
      });
    },
  });
}

export function createTaskVerificationModule(runtime) {
  return Object.freeze({
    id: TASK_VERIFICATION_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_PERSISTENCE_READ, TASK_ENVIRONMENT_APPLICATION]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      Object.defineProperty(composition, 'taskVerificationSerialize', { configurable: true, writable: true, value: undefined });
      registerTaskVerificationRepository(composition);
      registerTaskVerificationApplication(composition);
      const application = pick(composition, TASK_VERIFICATION_APPLICATION_METHODS);
      const persistenceRead = pick(composition, ['taskVerificationResultPath', 'readTaskVerificationResultPersistence']);
      const testSupportProperties = {
        taskVerificationSerialize: Object.freeze({
          get: () => composition.taskVerificationSerialize,
          set: (value) => { composition.taskVerificationSerialize = value; },
        }),
      };
      return Object.freeze({
        provides: {
          [TASK_VERIFICATION_APPLICATION]: application,
          [TASK_VERIFICATION_PERSISTENCE_READ]: persistenceRead,
          [TASK_VERIFICATION_COMPATIBILITY]: compatibility('task-lifecycle-core', pick(composition, [...TASK_VERIFICATION_PERSISTENCE_METHODS, ...TASK_VERIFICATION_APPLICATION_METHODS]), testSupportProperties),
        },
        contributions: {
          cli: taskVerificationCliContributions(),
          http: [createTaskVerificationHttpContribution(TASK_RECORD_ID_SOURCE)],
        },
      });
    },
  });
}

export function createTaskPlanningIdentityModule(runtime) {
  return Object.freeze({
    id: TASK_PLANNING_IDENTITY_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_APPLICATION]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerTaskPlanningIdentityApplication(composition);
      const application = pick(composition, TASK_PLANNING_IDENTITY_APPLICATION_METHODS);
      return Object.freeze({ provides: {
        [TASK_PLANNING_IDENTITY_APPLICATION]: application,
        [TASK_PLANNING_IDENTITY_COMPATIBILITY]: compatibility('task-lifecycle-core', application),
      } });
    },
  });
}

export function createTaskDevelopmentModule(runtime) {
  return Object.freeze({
    id: TASK_DEVELOPMENT_MODULE_ID,
    requires: Object.freeze([
      TASK_RECORD_APPLICATION, TASK_RECORD_PERSISTENCE_READ, TASK_ENVIRONMENT_APPLICATION,
      TASK_REVIEW_APPLICATION, TASK_VERIFICATION_APPLICATION, TASK_PLANNING_IDENTITY_APPLICATION,
    ]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      Object.defineProperty(composition, 'taskDevelopmentSerialize', { configurable: true, writable: true, value: undefined });
      registerTaskDevelopmentRepository(composition);
      registerTaskDevelopmentApplication(composition);
      const application = pick(composition, TASK_DEVELOPMENT_APPLICATION_METHODS);
      const persistenceRead = pick(composition, ['taskDevelopmentReceiptPath', 'readTaskDevelopmentPersistence']);
      const testSupportProperties = {
        taskDevelopmentSerialize: Object.freeze({
          get: () => composition.taskDevelopmentSerialize,
          set: (value) => { composition.taskDevelopmentSerialize = value; },
        }),
      };
      return Object.freeze({
        provides: {
          [TASK_DEVELOPMENT_APPLICATION]: application,
          [TASK_DEVELOPMENT_PERSISTENCE_READ]: persistenceRead,
          [TASK_DEVELOPMENT_COMPATIBILITY]: compatibility('task-lifecycle-core', pick(composition, [...TASK_DEVELOPMENT_PERSISTENCE_METHODS, ...TASK_DEVELOPMENT_APPLICATION_METHODS]), testSupportProperties),
        },
        contributions: { http: [createTaskDevelopmentHttpContribution(TASK_RECORD_ID_SOURCE)] },
      });
    },
  });
}

export function createParentCoordinationModule(runtime) {
  return Object.freeze({
    id: PARENT_COORDINATION_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_APPLICATION, TASK_DEVELOPMENT_APPLICATION, TASK_REVIEW_APPLICATION, TASK_ENVIRONMENT_APPLICATION]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerParentCoordinationRepository(composition);
      registerParentCoordinationApplication(composition);
      const application = pick(composition, PARENT_COORDINATION_APPLICATION_METHODS);
      const persistenceRead = pick(composition, PARENT_COORDINATION_PERSISTENCE_METHODS);
      const testSupportProperties = {
        projectParentCoordinationChild: Object.freeze({
          get: () => composition.projectParentCoordinationChild,
          set: (value) => { composition.projectParentCoordinationChild = value; },
        }),
      };
      return Object.freeze({
        provides: {
          [PARENT_COORDINATION_APPLICATION]: application,
          [PARENT_COORDINATION_PERSISTENCE_READ]: persistenceRead,
          [PARENT_COORDINATION_COMPATIBILITY]: compatibility('task-lifecycle-core', pick(composition, [...PARENT_COORDINATION_PERSISTENCE_METHODS, ...PARENT_COORDINATION_APPLICATION_METHODS]), testSupportProperties),
        },
        contributions: {
          cli: parentCoordinationCliContributions(),
          http: [createParentCoordinationHttpContribution(TASK_RECORD_ID_SOURCE, application)],
        },
      });
    },
  });
}

export function createTaskOverviewModule(runtime) {
  return Object.freeze({
    id: TASK_OVERVIEW_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_PERSISTENCE_READ]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerTaskOverviewRepository(composition);
      registerTaskOverviewApplication(composition);
      const application = pick(composition, TASK_OVERVIEW_APPLICATION_METHODS);
      return Object.freeze({
        provides: {
          [TASK_OVERVIEW_APPLICATION]: application,
          [TASK_OVERVIEW_COMPATIBILITY]: compatibility('task-lifecycle-core', pick(composition, [...TASK_OVERVIEW_PERSISTENCE_METHODS, ...TASK_OVERVIEW_APPLICATION_METHODS])),
        },
        contributions: { http: [createTaskOverviewHttpContribution(TASK_RECORD_ID_SOURCE)] },
      });
    },
  });
}

export function createTaskEntrySnapshotModule(runtime) {
  return Object.freeze({
    id: TASK_ENTRY_SNAPSHOT_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_APPLICATION, TASK_ENVIRONMENT_APPLICATION, TASK_DEVELOPMENT_APPLICATION, PARENT_COORDINATION_APPLICATION]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerTaskEntrySnapshotApplication(composition);
      const application = pick(composition, TASK_ENTRY_SNAPSHOT_APPLICATION_METHODS);
      return Object.freeze({
        provides: {
          [TASK_ENTRY_SNAPSHOT_APPLICATION]: application,
          [TASK_ENTRY_SNAPSHOT_COMPATIBILITY]: compatibility('task-lifecycle-core', application),
        },
        contributions: { cli: taskEntrySnapshotCliContributions() },
      });
    },
  });
}

export function createTaskFinishModule(runtime) {
  return Object.freeze({
    id: TASK_FINISH_MODULE_ID,
    requires: Object.freeze([
      TASK_RECORD_APPLICATION,
      TASK_ENVIRONMENT_APPLICATION,
      TASK_EXECUTION_RECORD_APPLICATION,
      TASK_DEVELOPMENT_APPLICATION,
      'workspace.structured-store',
    ]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerTaskFinishRepository(composition);
      registerTaskFinishApplication(composition);
      const application = pick(composition, TASK_FINISH_APPLICATION_METHODS);
      const persistenceRead = pick(composition, TASK_FINISH_PERSISTENCE_READ_METHODS);
      const internal = pick(composition, TASK_FINISH_INTERNAL_METHODS);
      return Object.freeze({
        provides: {
          [TASK_FINISH_APPLICATION]: application,
          [TASK_FINISH_PERSISTENCE_READ]: persistenceRead,
          [TASK_FINISH_INTERNAL]: internal,
          [TASK_FINISH_COMPATIBILITY]: compatibility(
            'task-delivery-finish',
            pick(composition, [...TASK_FINISH_PERSISTENCE_METHODS, ...TASK_FINISH_APPLICATION_METHODS]),
          ),
        },
        contributions: { cli: createTaskFinishCliContributions(application) },
      });
    },
  });
}

export function createTaskTerminalDeliveryModule(runtime) {
  return Object.freeze({
    id: TASK_TERMINAL_DELIVERY_MODULE_ID,
    requires: Object.freeze([
      TASK_RECORD_APPLICATION,
      TASK_DEVELOPMENT_APPLICATION,
      TASK_REVIEW_APPLICATION,
      TASK_VERIFICATION_APPLICATION,
      TASK_FINISH_APPLICATION,
    ]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerTaskTerminalDeliveryApplication(composition);
      const application = pick(composition, TASK_TERMINAL_DELIVERY_APPLICATION_METHODS);
      return Object.freeze({
        provides: {
          [TASK_TERMINAL_DELIVERY_APPLICATION]: application,
          [TASK_TERMINAL_DELIVERY_COMPATIBILITY]: compatibility('task-delivery-finish', application),
        },
        contributions: { cli: createTaskTerminalDeliveryCliContributions(application) },
      });
    },
  });
}
