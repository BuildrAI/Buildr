import { registerTaskRecordApplication } from './application/task-record-application.mjs';
import { registerTaskRetrospectiveApplication } from './application/task-retrospective-application.mjs';
import { registerTaskReviewApplication } from './application/task-review-application.ts';
import { registerTaskEnvironmentApplication } from './application/task-environment-application.mjs';
import {
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
  projectEnvironmentPreparationScopeSelector,
} from './domain/project-environment-preparation.mjs';
import { registerTaskVerificationApplication } from './application/task-verification-application.ts';
import { registerParentCoordinationApplication } from './application/parent-coordination-application.ts';
import { registerTaskOverviewApplication } from './application/task-overview-application.ts';
import { registerTaskRecordRepository } from './persistence/task-record-repository.ts';
import { registerTaskRetrospectiveRepository } from './persistence/task-retrospective-repository.mjs';
import { registerTaskReviewRepository } from './persistence/task-review-repository.ts';
import { registerTaskEnvironmentRepository } from './persistence/task-environment-repository.mjs';
import { registerTaskVerificationRepository } from './persistence/task-verification-repository.ts';
import { registerTaskOverviewRepository } from './persistence/task-overview-repository.ts';
import { registerGitWorktreeProvider } from './infrastructure/git-worktree-provider.ts';
import { taskRecordCommand } from './interfaces/cli/task-record.mjs';
import { taskReviewCommand } from './interfaces/cli/task-review.ts';
import { gitWorktreeCommand } from './interfaces/cli/git-worktree.ts';
import { taskEnvironmentCommand, taskEnvironmentPlanCommand } from './interfaces/cli/task-environment.mjs';
import { taskVerificationCommand } from './interfaces/cli/task-verification.ts';
import { parentCoordinationCommand } from './interfaces/cli/parent-coordination.ts';
import {
  createParentCoordinationHttpContribution,
  createTaskEnvironmentHttpContribution,
  createTaskOverviewHttpContribution,
  createTaskVerificationHttpContribution,
} from './interfaces/http/task-lifecycle-core.ts';
import { handleTaskRecordHttpRequest, TASK_RECORD_ID_SOURCE } from './interfaces/http/task-record-http.mjs';
import { handleTaskRetrospectiveHttpRequest } from './interfaces/http/task-retrospective-http.mjs';
import { handleTaskReviewHttpRequest } from './interfaces/http/task-review-http.ts';
import {
  REQUIRED_INTERNAL_WORKFLOW_ROUTES,
  inspectRequiredInternalWorkflowRoutes,
} from './contracts/internal-workflow-route-catalog.mjs';
import { routeInternalWorkflow } from './interfaces/internal/workflow-route-router.mjs';

export async function runTaskRetrospectiveDriver(args, options) {
  const driver = await import('./interfaces/internal/task-retrospective-driver.mjs');
  return driver.runTaskRetrospectiveDriver(args, options);
}

const INTERNAL_WORKFLOW_RUNNERS = Object.freeze({
  'task-retrospective': runTaskRetrospectiveDriver,
});

export { REQUIRED_INTERNAL_WORKFLOW_ROUTES, inspectRequiredInternalWorkflowRoutes };
export {
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
  projectEnvironmentPreparationScopeSelector,
};

export function runRequiredInternalWorkflowRoute(route, args, options = {}) {
  return routeInternalWorkflow(route, args, INTERNAL_WORKFLOW_RUNNERS, options);
}

export const TASK_RECORD_MODULE_ID = 'task-record';
export const TASK_RECORD_APPLICATION = 'task-record.application';
export const TASK_RECORD_PERSISTENCE_READ = 'task-record.persistence-read';
export const TASK_RECORD_RUNTIME_PORT = 'task-record.runtime-port';
export const TASK_REVIEW_MODULE_ID = 'task-review';
export const TASK_REVIEW_APPLICATION = 'task-review.application';
export const TASK_REVIEW_PERSISTENCE_READ = 'task-review.persistence-read';
export const TASK_REVIEW_RUNTIME_PORT = 'task-review.runtime-port';
export const TASK_RETROSPECTIVE_MODULE_ID = 'task-retrospective';
export const TASK_RETROSPECTIVE_APPLICATION = 'task-retrospective.application';
export const TASK_RETROSPECTIVE_PERSISTENCE_READ = 'task-retrospective.persistence-read';
export const TASK_RETROSPECTIVE_RUNTIME_PORT = 'task-retrospective.runtime-port';
export const TASK_ENVIRONMENT_MODULE_ID = 'task-environment';
export const TASK_ENVIRONMENT_APPLICATION = 'task-environment.application';
export const TASK_ENVIRONMENT_PERSISTENCE_READ = 'task-environment.persistence-read';
export const TASK_ENVIRONMENT_RUNTIME_PORT = 'task-environment.runtime-port';
export const TASK_ENVIRONMENT_DECLARATION = 'task-environment.declaration';
export const TASK_WORKTREE_PROVIDER = 'task-environment.worktree-provider';
export const TASK_VERIFICATION_MODULE_ID = 'task-verification';
export const TASK_VERIFICATION_APPLICATION = 'task-verification.application';
export const TASK_VERIFICATION_PERSISTENCE_READ = 'task-verification.persistence-read';
export const TASK_VERIFICATION_RUNTIME_PORT = 'task-verification.runtime-port';
export const PARENT_COORDINATION_MODULE_ID = 'task-parent-coordination';
export const PARENT_COORDINATION_APPLICATION = 'task-parent-coordination.application';
export const PARENT_COORDINATION_RUNTIME_PORT = 'task-parent-coordination.runtime-port';
export const TASK_OVERVIEW_MODULE_ID = 'task-overview';
export const TASK_OVERVIEW_APPLICATION = 'task-overview.application';
export const TASK_OVERVIEW_RUNTIME_PORT = 'task-overview.runtime-port';

const APPLICATION_METHODS = Object.freeze([
  'listTaskRecords', 'queryTaskRecordViews', 'inspectTaskRecord', 'inspectTaskRecordView',
  'createTaskRecord', 'updateTaskRecord', 'activateTaskRecord', 'completeTaskRecord',
  'abandonTaskRecord',
]);

const PERSISTENCE_READ_METHODS = Object.freeze([
  'assertCanonicalTaskWorkspace', 'taskRecordDirectory', 'ensureTaskRecordDirectory',
  'readTaskRecordPersistence', 'prepareTaskRecordPersistence', 'listTaskRecordPersistence',
  'queryTaskRecordViewPersistence', 'readTaskRecordViewPersistence', 'readParentTaskContext',
]);

const TEST_SUPPORT_METHODS = Object.freeze([
  'createTaskRecordPersistence', 'mutateTaskRecordPersistence', 'writeTaskRecordPersistence',
]);

const TASK_REVIEW_APPLICATION_METHODS = Object.freeze([
  'inspectTaskReview', 'recordTaskReview',
]);

const TASK_REVIEW_PERSISTENCE_READ_METHODS = Object.freeze([
  'taskReviewDirectory', 'taskReviewResultPath', 'readTaskReviewResultPersistence',
]);

const TASK_REVIEW_RUNTIME_PORT_METHODS = Object.freeze([
  ...TASK_REVIEW_PERSISTENCE_READ_METHODS, 'writeTaskReviewResultPersistence', 'renderTaskReviewResult',
]);

const TASK_RETROSPECTIVE_APPLICATION_METHODS = Object.freeze([
  'inspectTaskRetrospective', 'listTaskRetrospectives', 'recordTaskRetrospective', 'handleTaskRetrospective',
]);

const TASK_RETROSPECTIVE_PERSISTENCE_READ_METHODS = Object.freeze([
  'taskRetrospectiveResultPath', 'readTaskRetrospectiveResultPersistence',
]);

const TASK_RETROSPECTIVE_RUNTIME_PORT_METHODS = Object.freeze([
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
const TASK_VERIFICATION_APPLICATION_METHODS = Object.freeze([
  'inspectTaskVerification', 'inspectTaskVerificationView', 'recordTaskVerification',
]);
const TASK_VERIFICATION_PERSISTENCE_METHODS = Object.freeze([
  'taskVerificationReportPath', 'readTaskVerificationReportPersistence', 'writeTaskVerificationReportPersistence', 'renderTaskVerificationReport',
]);
const PARENT_COORDINATION_APPLICATION_METHODS = Object.freeze([
  'inspectParentCoordination',
]);
const TASK_OVERVIEW_APPLICATION_METHODS = Object.freeze(['inspectTaskOverview']);
const TASK_OVERVIEW_PERSISTENCE_METHODS = Object.freeze(['readTaskOverviewPersistence']);

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

function runtimePort(methods, testSupportProperties = undefined) {
  return Object.freeze({
    methods: Object.freeze(methods),
    ...(testSupportProperties ? { testSupportProperties: Object.freeze(testSupportProperties) } : {}),
  });
}

export function createWorktreeProviderModule(runtime) {
  return Object.freeze({
    id: 'task-worktree-provider',
    requires: Object.freeze([]),
    create() {
      registerGitWorktreeProvider(runtime);
      return Object.freeze({
        provides: {
          [TASK_WORKTREE_PROVIDER]: pick(runtime, [
            'gitWorktreeEvidencePath',
            'readGitWorktreeEvidence',
            'writeGitWorktreeEvidence',
            'planGitWorktrees',
            'prepareGitWorktrees',
            'inspectGitWorktrees',
            'cleanupGitWorktrees',
          ]),
        },
      });
    },
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
      help: ['Usage: buildr task environment plan record <task-id> --input <json-file> [--target <canonical-workspace>] [--json]', '       buildr task environment plan record --schema|--example [--json]', '', '输入必须是closed buildr.task-environment-plan-request/v1；新current保存resolved buildr.task-environment-plan/v3。', 'Discovery与实际Plan request定义同源，零Workspace读取且零写入。'],
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

function taskVerificationCliContributions() {
  return Object.freeze([
    {
      key: 'task verification inspect', surface: 'agent-machine', summary: '读取开发完成后保存的任务验证报告。',
      help: ['Usage: buildr task verification inspect <task-id> [--content-identity <identity>] [--target <canonical-workspace>] [--json]', '', '报告包含实际检查、选择范围、结果、未覆盖项和结论；开发过程中的临时测试不进入该报告。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'verification' && runtimeId === 'inspect',
      run: (runtime, context) => taskVerificationCommand(runtime, 'inspect', context.argv.slice(5)),
    },
    {
      key: 'task verification record', surface: 'agent-machine', summary: '保存一份绑定当前内容版本的有意义任务验证报告。',
      help: ['Usage: buildr task verification record <task-id> --report <json-file> [--target <canonical-workspace>] [--json]', '', 'Agent 直接调用项目命令、Playwright、Browser 或 HTTP 工具完成验证后提交报告；Application 不生成计划或代跑测试。'],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'verification' && runtimeId === 'record',
      run: (runtime, context) => taskVerificationCommand(runtime, 'record', context.argv.slice(5)),
    },
  ].map(Object.freeze));
}

function parentCoordinationCliContributions() {
  return Object.freeze([Object.freeze({
    key: 'task parent inspect', surface: 'primary', summary: '查看整体目标、真实子任务结果、完成观察身份和历史父计划。',
    help: ['Usage: buildr task parent inspect <task-id> [--target <canonical-workspace>] [--json]'],
    match: ({ domain, action, runtimeId, operation }) => domain === 'task' && action === 'parent' && runtimeId === 'inspect' && !operation,
    run: (runtime, context) => parentCoordinationCommand(runtime, context.argv.slice(5)),
  })]);
}

export function createGitWorktreeCliContributions(application = null) {
  return Object.freeze([
    {
      key: 'worktree create',
      surface: 'agent-machine',
      summary: '这是窄 Git provider 命令：只规划并创建显式 repository checkout/branch，写入 Git common-dir provider evidence。',
      help: [
        'Usage: buildr worktree create <task-id> --branch <branch> [--start-point <ref>] [--include <project:code|service:project/service> ...] [--target <workspace>] [--json]',
        '',
        '这是窄 Git provider 命令：只规划并创建显式 repository checkout/branch，写入 Git common-dir provider evidence。',
        '全部仓库在写入前统一预检；部分创建失败保留已创建 checkout 和 evidence，供同一计划恢复。它不判断 Environment ready，也不准备 Runtime/CLI/依赖/projection。',
      ],
      match: ({ domain, action }) => domain === 'worktree' && action === 'create',
      run: (runtime, context) => gitWorktreeCommand(application || runtime, 'create', context.argv.slice(4)),
    },
    {
      key: 'worktree cleanup',
      surface: 'agent-machine',
      summary: '按Git provider evidence及调用方已核验的逐仓source/delivered完整提交保护内容，再nested-first删除worktree、本地任务分支和provider evidence。',
      help: [
        'Usage: buildr worktree cleanup <task-id> --expected-source <selector>=<full-commit> --delivered-ref <selector>=<full-commit> ... [--target <workspace>] [--json]',
        '',
        '调用方先核验完整交付；provider复核checkout/branch/clean/registration、source版本和delivered提交仍由非任务retained ref持有。',
        '它不读取Environment Receipt、不停止动态资源、不判断业务等价，也不删除远端分支。',
      ],
      match: ({ domain, action }) => domain === 'worktree' && action === 'cleanup',
      run: (runtime, context) => gitWorktreeCommand(application || runtime, 'cleanup', context.argv.slice(4)),
    },
    {
      key: 'worktree inspect',
      surface: 'agent-machine',
      summary: '根据窄 provider evidence 检查全部成员仓库的 checkout、branch、HEAD、clean 与 registration；不输出 Environment ready 或 runtime/session 事实。',
      help: [
        'Usage: buildr worktree inspect <task-id> [--target <workspace>] [--json]',
        '',
        '根据窄 provider evidence 检查全部成员仓库的 checkout、branch、HEAD、clean 与 registration；不输出 Environment ready 或 runtime/session 事实。',
      ],
      match: ({ domain, action }) => domain === 'worktree' && action === 'inspect',
      run: (runtime, context) => gitWorktreeCommand(application || runtime, 'inspect', context.argv.slice(4)),
    },
  ].map(Object.freeze));
}

export function createTaskRecordCliContributions(application = null) {
  return Object.freeze([
    {
      key: 'task create', surface: 'primary', summary: '创建 active 正式 Task，或以 --status todo 只保存待办意向；复盘来源可重复。',
      help: [
        'Usage: buildr task create <task-id> --title <text> --intent <text> [--status <todo|active>] [--parent-task] [--retrospective-source <task-id> ...] [--parent <task-id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] [--target <canonical-workspace>] [--json]',
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
        'Usage: buildr task update <task-id> [--title <text>] [--intent <text>] [--parent-task] [--expected-record <recordDigest>] [--parent <task-id> | --clear-parent] [--add-retrospective-source <task-id> ...] [--remove-retrospective-source <task-id> ...] [--add-project <code> ...] [--remove-project <code> ...] [--add-service <project/service> ...] [--remove-service <project/service> ...] [--add-change <project/change> ...] [--remove-change <project/change> ...] [--target <canonical-workspace>] [--json]',
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
      help: ['Usage: buildr task complete <task-id> --summary <text> [--no-change] [--parent-completion <json-file>] [--expected-record <recordDigest>] [--target <canonical-workspace>] [--json]', '', '父任务必须提供 --parent-completion 与 --expected-record：当前观察、总体验收、逐子任务处置和明确用户授权。', 'active 可正常完成；todo 只允许 --no-change，否则必须先 activate。', '该动作只更新顶层 Task Record，不执行 Finish、Verification、Git、publication 或 cleanup。'],
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
      summary: '只读返回 Planning/Completion 两个可选槽位及 response-only resultDigest；不判断对当前现场的适用性。',
      help: [
        'Usage: buildr task review inspect <task-id> [--target <canonical-workspace>] [--json]',
        '',
        '只读返回 Planning/Completion 两个可选槽位及 response-only resultDigest；不判断对当前现场的适用性。',
      ],
      match: ({ domain, action, runtimeId }) => domain === 'task' && action === 'review' && runtimeId === 'inspect',
      run: (runtime, context) => taskReviewCommand(application || pick(runtime, [...TASK_REVIEW_APPLICATION_METHODS, 'taskReviewResultPath']), 'inspect', context.argv.slice(5)),
    },
    {
      key: 'task review record', surface: 'agent-machine',
      summary: '只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。',
      help: [
        'Usage: buildr task review record <task-id> --type <planning|completion> --subject-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <accepted|changes-requested> --summary <text> --expected-current <absent|sha256-digest> [--target <canonical-workspace>] [--json]',
        '',
        '只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。',
        '中断、缺少审查对象 identity、并发冲突或结论不完整时不写入。',
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
  };
  registerTaskRecordRepository(privateComposition);
  registerTaskRecordApplication(privateComposition);

  const application = pick(privateComposition, APPLICATION_METHODS);
  const persistenceRead = pick(privateComposition, PERSISTENCE_READ_METHODS);
  const cliPort = Object.freeze({
    ...application,
    readTaskRecordPersistence: persistenceRead.readTaskRecordPersistence,
  });
  const runtimePortValue = Object.freeze({
    methods: Object.freeze({ ...application, ...persistenceRead, ...pick(privateComposition, TEST_SUPPORT_METHODS) }),
    testSupportMethods: TEST_SUPPORT_METHODS,
  });
  return Object.freeze({
    provides: {
      [TASK_RECORD_APPLICATION]: application,
      [TASK_RECORD_PERSISTENCE_READ]: persistenceRead,
      [TASK_RECORD_RUNTIME_PORT]: runtimePortValue,
    },
    contributions: {
      cli: createTaskRecordCliContributions(cliPort),
      http: [Object.freeze({
        id: 'task-record.http',
        taskIdSource: TASK_RECORD_ID_SOURCE,
        handle: (input) => handleTaskRecordHttpRequest({ ...input, runtime: application }),
      })],
      diagnostics: [Object.freeze({ id: 'task-record.diagnostics', readModel: Object.freeze({ application, persistenceRead }) })],
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
  ]),
  create: createTaskRecordModule,
});

function createTaskReviewModule(requires) {
  const privateComposition = {
    ...requires[TASK_RECORD_PERSISTENCE_READ],
    ...requires['workspace.structured-store'],
  };
  registerTaskReviewRepository(privateComposition);
  registerTaskReviewApplication(privateComposition);

  const application = pick(privateComposition, TASK_REVIEW_APPLICATION_METHODS);
  const persistenceRead = pick(privateComposition, TASK_REVIEW_PERSISTENCE_READ_METHODS);
  const cliPort = Object.freeze({ ...application, taskReviewResultPath: persistenceRead.taskReviewResultPath });
  const runtimePortValue = Object.freeze({
    methods: Object.freeze({ ...application, ...pick(privateComposition, TASK_REVIEW_RUNTIME_PORT_METHODS) }),
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
      [TASK_REVIEW_RUNTIME_PORT]: runtimePortValue,
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
  const runtimePortValue = Object.freeze({
    methods: Object.freeze({ ...application, ...pick(privateComposition, TASK_RETROSPECTIVE_RUNTIME_PORT_METHODS) }),
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
      [TASK_RETROSPECTIVE_RUNTIME_PORT]: runtimePortValue,
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

export function createTaskEnvironmentModule(runtime, { agentRuntimeCapability = null, worktreeProviderCapability = null } = {}) {
  return Object.freeze({
    id: TASK_ENVIRONMENT_MODULE_ID,
    requires: Object.freeze([
      TASK_RECORD_PERSISTENCE_READ,
      ...(agentRuntimeCapability ? [agentRuntimeCapability] : []),
      ...(worktreeProviderCapability ? [worktreeProviderCapability] : []),
    ]),
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
          [TASK_ENVIRONMENT_DECLARATION]: Object.freeze({
            normalizeProjectEnvironmentPreparation,
            parseProjectEnvironmentPreparation,
            projectEnvironmentPreparationScopeSelector,
          }),
          [TASK_ENVIRONMENT_RUNTIME_PORT]: runtimePort(pick(composition, [...TASK_ENVIRONMENT_PERSISTENCE_METHODS, ...TASK_ENVIRONMENT_APPLICATION_METHODS]), testSupportProperties),
        },
        contributions: {
          cli: Object.freeze([...taskEnvironmentCliContributions(), ...createGitWorktreeCliContributions()]),
          http: [createTaskEnvironmentHttpContribution(TASK_RECORD_ID_SOURCE, application, requires[TASK_RECORD_PERSISTENCE_READ])],
        },
      });
    },
  });
}

export function createTaskVerificationModule(runtime, { verificationDeclaration = null } = {}) {
  return Object.freeze({
    id: TASK_VERIFICATION_MODULE_ID,
    requires: Object.freeze([
      TASK_RECORD_PERSISTENCE_READ,
      ...(verificationDeclaration ? [verificationDeclaration] : []),
    ]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      Object.defineProperty(composition, 'taskVerificationSerialize', { configurable: true, writable: true, value: undefined });
      registerTaskVerificationRepository(composition);
      registerTaskVerificationApplication(composition);
      const application = pick(composition, TASK_VERIFICATION_APPLICATION_METHODS);
      const persistenceRead = pick(composition, ['taskVerificationReportPath', 'readTaskVerificationReportPersistence']);
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
          [TASK_VERIFICATION_RUNTIME_PORT]: runtimePort(pick(composition, [...TASK_VERIFICATION_PERSISTENCE_METHODS, ...TASK_VERIFICATION_APPLICATION_METHODS]), testSupportProperties),
        },
        contributions: {
          cli: taskVerificationCliContributions(),
          http: [createTaskVerificationHttpContribution(TASK_RECORD_ID_SOURCE, application)],
        },
      });
    },
  });
}

export function createParentCoordinationModule(runtime) {
  return Object.freeze({
    id: PARENT_COORDINATION_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_APPLICATION, TASK_RECORD_PERSISTENCE_READ]),
    create(requires) {
      const composition = taskPrivateComposition(runtime, requires);
      registerParentCoordinationApplication(composition);
      const application = pick(composition, PARENT_COORDINATION_APPLICATION_METHODS);
      const testSupportProperties = {};
      return Object.freeze({
        provides: {
          [PARENT_COORDINATION_APPLICATION]: application,
          [PARENT_COORDINATION_RUNTIME_PORT]: runtimePort(application, testSupportProperties),
        },
        contributions: {
          cli: parentCoordinationCliContributions(),
          http: [createParentCoordinationHttpContribution(TASK_RECORD_ID_SOURCE)],
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
          [TASK_OVERVIEW_RUNTIME_PORT]: runtimePort(pick(composition, [...TASK_OVERVIEW_PERSISTENCE_METHODS, ...TASK_OVERVIEW_APPLICATION_METHODS])),
        },
        contributions: { http: [createTaskOverviewHttpContribution(TASK_RECORD_ID_SOURCE)] },
      });
    },
  });
}
