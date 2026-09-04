import { registerTaskRecordApplication, type TaskRecordApplicationRuntime } from './application/task-record-application.ts';
import { registerTaskReviewApplication, type TaskReviewApplicationRuntime } from './application/task-review-application.ts';
import { registerTaskVerificationApplication, type VerificationApplicationRuntime } from './application/task-verification-application.ts';
import { registerParentCoordinationApplication, type ParentCoordinationApplicationRuntime } from './application/parent-coordination-application.ts';
import { createTaskRepository } from './persistence/task-repository.ts';
import { createTaskProjectRepository } from './persistence/task-project-repository.ts';
import { createTaskServiceRepository } from './persistence/task-service-repository.ts';
import { createTaskChangeRepository } from './persistence/task-change-repository.ts';
import { registerTaskRecordRetrospectiveDocument } from './persistence/task-record-retrospective-document.ts';
import { registerTaskReviewRepository, type TaskReviewRepositoryRuntime } from './persistence/task-review-repository.ts';
import { registerTaskVerificationRepository, type TaskVerificationRepositoryRuntime } from './persistence/task-verification-repository.ts';
import { registerGitWorktreeProvider, TASK_WORKTREE_PROVIDER, type GitWorktreeProviderRuntime, type GitWorktreeRuntime } from './infrastructure/git-worktree-provider.ts';
import { taskRecordCommand, type TaskCommandRuntime } from './interfaces/cli/task-record.ts';
import { taskReviewCommand, type TaskReviewCliRuntime } from './interfaces/cli/task-review.ts';
import { gitWorktreeCommand, type GitWorktreeCliRuntime } from './interfaces/cli/git-worktree.ts';
import { taskVerificationCommand, type TaskVerificationCliRuntime } from './interfaces/cli/task-verification.ts';
import { parentCoordinationCommand, type ParentCoordinationCliRuntime } from './interfaces/cli/parent-coordination.ts';
import {
  createParentCoordinationHttpContribution,
  createTaskVerificationHttpContribution,
} from './interfaces/http/task-lifecycle-core.ts';
import { handleTaskRecordHttpRequest, TASK_RECORD_ID_SOURCE, type TaskHttpInput } from './interfaces/http/task-record-http.ts';
import { handleTaskReviewHttpRequest } from './interfaces/http/task-review-http.ts';

export const TASK_RECORD_MODULE_ID = 'task-record';
export const TASK_RECORD_APPLICATION = 'task-record.application';
export const TASK_RECORD_PERSISTENCE_READ = 'task-record.persistence-read';
export const TASK_RECORD_RUNTIME_PORT = 'task-record.runtime-port';
export const TASK_REVIEW_MODULE_ID = 'task-review';
export const TASK_REVIEW_APPLICATION = 'task-review.application';
export const TASK_REVIEW_PERSISTENCE_READ = 'task-review.persistence-read';
export const TASK_REVIEW_RUNTIME_PORT = 'task-review.runtime-port';
export { TASK_WORKTREE_PROVIDER } from './infrastructure/git-worktree-provider.ts';
export const TASK_VERIFICATION_MODULE_ID = 'task-verification';
export const TASK_VERIFICATION_APPLICATION = 'task-verification.application';
export const TASK_VERIFICATION_PERSISTENCE_READ = 'task-verification.persistence-read';
export const TASK_VERIFICATION_RUNTIME_PORT = 'task-verification.runtime-port';
export const PARENT_COORDINATION_MODULE_ID = 'task-parent-coordination';
export const PARENT_COORDINATION_APPLICATION = 'task-parent-coordination.application';
export const PARENT_COORDINATION_RUNTIME_PORT = 'task-parent-coordination.runtime-port';

type RuntimeMember = unknown;
type DynamicRuntime = Record<string, RuntimeMember>;
type RuntimeRequires = Record<string, DynamicRuntime>;
type CliMatch = { domain?: string; action?: string; runtimeId?: string; operation?: string };
type CliContext = { argv: string[] };
type HttpContributionInput = Record<string, unknown>;
type TaskRecordModuleRequires = {
  'workspace.structured-store': Pick<TaskRecordApplicationRuntime, 'assertCanonicalStructuredWorkspace' | 'prepareWorkspaceStructuredStore' | 'runWorkspaceSqliteRead' | 'runWorkspaceTransaction'>;
  'project-service.reader': Pick<TaskRecordApplicationRuntime, 'readProjectRegistryRecord' | 'readServiceRegistryRecord'>;
  'change.resolver': Pick<TaskRecordApplicationRuntime, 'resolveTaskScopedChange'>;
  'workspace.operation-memoizer': Pick<TaskRecordApplicationRuntime, 'memoizeWorkspaceOperation'>;
};
type SharedTaskComposition = DynamicRuntime;

const APPLICATION_METHODS = Object.freeze([
  'queryTaskRecordViews', 'inspectTaskRecord', 'inspectTaskRecordView',
  'inspectTaskRetrospectiveDocument',
  'createTaskRecord', 'updateTaskRecord', 'activateTaskRecord', 'completeTaskRecord',
  'abandonTaskRecord',
]);

const PERSISTENCE_READ_METHODS = Object.freeze([
  'assertCanonicalTaskWorkspace', 'taskRecordDirectory', 'ensureTaskRecordDirectory',
  'readTaskRecordPersistence', 'prepareTaskRecordPersistence',
  'queryTaskRecordViewPersistence', 'readTaskRecordViewPersistence', 'readParentTaskContext',
  'taskRetrospectiveDocumentPath', 'readTaskRetrospectiveDocumentPersistence',
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

const TASK_VERIFICATION_APPLICATION_METHODS = Object.freeze([
  'inspectTaskVerification', 'inspectTaskVerificationView', 'recordTaskVerification',
]);
const TASK_VERIFICATION_PERSISTENCE_METHODS = Object.freeze([
  'taskVerificationReportPath', 'readTaskVerificationReportPersistence', 'writeTaskVerificationReportPersistence', 'renderTaskVerificationReport',
]);
const PARENT_COORDINATION_APPLICATION_METHODS = Object.freeze([
  'inspectParentCoordination',
]);

function pick(source: object, methods: readonly string[]): Readonly<DynamicRuntime> {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, Reflect.get(source, method)])));
}

function taskPrivateComposition(runtime: DynamicRuntime, requires: RuntimeRequires): SharedTaskComposition {
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

function runtimePort(methods: unknown, testSupportProperties?: Record<string, unknown>) {
  return Object.freeze({
    methods: Object.freeze(methods),
    ...(testSupportProperties ? { testSupportProperties: Object.freeze(testSupportProperties) } : {}),
  });
}

export function createWorktreeProviderModule(runtime: GitWorktreeRuntime) {
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
        contributions: { cli: createGitWorktreeCliContributions() },
      });
    },
  });
}

function taskVerificationCliContributions() {
  return Object.freeze([
    {
      key: 'task verification inspect', surface: 'agent-machine', summary: '只读查看开发完成后保存的任务验证报告。',
      help: ['Usage: buildr task verification inspect <task-id> [--content-identity <identity>] [--target <canonical-workspace>] [--json]', '', '只读返回报告、reportDigest与适用性，不写报告，不执行测试、Git、交付、Task完成或清理。'],
      match: ({ domain, action, runtimeId }: CliMatch) => domain === 'task' && action === 'verification' && runtimeId === 'inspect',
      run: (runtime: TaskVerificationCliRuntime, context: CliContext) => taskVerificationCommand(runtime, 'inspect', context.argv.slice(5)),
    },
    {
      key: 'task verification record', surface: 'agent-machine', summary: '保存一份绑定当前内容版本的有意义任务验证报告。',
      help: ['Usage: buildr task verification record <task-id> --report <json-file> --expected-report <absent|sha256-digest> [--target <canonical-workspace>] [--json]', '', '先inspect当前槽位并提交其absent或reportDigest；冲突后重新读取真实报告和当前内容再判断，不自动重试。', 'Agent直接运行项目测试；该命令只保存报告，不执行测试、Git、交付、Task完成或清理。'],
      match: ({ domain, action, runtimeId }: CliMatch) => domain === 'task' && action === 'verification' && runtimeId === 'record',
      run: (runtime: TaskVerificationCliRuntime, context: CliContext) => taskVerificationCommand(runtime, 'record', context.argv.slice(5)),
    },
  ].map(Object.freeze));
}

function parentCoordinationCliContributions() {
  return Object.freeze([Object.freeze({
    key: 'task parent inspect', surface: 'primary', summary: '只读查看整体目标、真实子任务结果、完成观察身份和历史父计划。',
    help: ['Usage: buildr task parent inspect <task-id> [--target <canonical-workspace>] [--json]', '', '只读返回父任务协调（Task Parent Coordination）事实；不写Task，不执行Git、验证、交付或清理。'],
    match: ({ domain, action, runtimeId, operation }: CliMatch) => domain === 'task' && action === 'parent' && runtimeId === 'inspect' && !operation,
    run: (runtime: ParentCoordinationCliRuntime, context: CliContext) => parentCoordinationCommand(runtime, context.argv.slice(5)),
  })]);
}

export function createGitWorktreeCliContributions(application: GitWorktreeCliRuntime | null = null) {
  return Object.freeze([
    {
      key: 'worktree create',
      surface: 'agent-machine',
      summary: '这是窄 Git provider 命令：只规划并创建显式 repository checkout/branch，写入 Git common-dir provider evidence。',
      help: [
        'Usage: buildr worktree create <task-id> --branch <branch> [--start-point <ref>] [--include <project:code|service:project/service> ...] [--target <workspace>] [--json]',
        '',
        '这是窄 Git provider 命令：只规划并创建显式 repository checkout/branch，写入 Git common-dir provider evidence。',
        '全部仓库在写入前统一预检；部分创建失败保留已创建 checkout 和 evidence，供同一计划恢复。它不判断Task完成，也不准备Runtime/CLI/依赖/projection。',
      ],
      match: ({ domain, action }: CliMatch) => domain === 'worktree' && action === 'create',
      run: (runtime: GitWorktreeCliRuntime, context: CliContext) => gitWorktreeCommand(application || runtime, 'create', context.argv.slice(4)),
    },
    {
      key: 'worktree cleanup',
      surface: 'agent-machine',
      summary: '按Git provider evidence及调用方已核验的逐仓source/delivered完整提交保护内容，再nested-first删除worktree、本地任务分支和provider evidence。',
      help: [
        'Usage: buildr worktree cleanup <task-id> --expected-source <selector>=<full-commit> --delivered-ref <selector>=<full-commit> ... [--target <workspace>] [--json]',
        '',
        '调用方先核验完整交付；provider复核checkout/branch/clean/registration、source版本和delivered提交仍由非任务retained ref持有。',
        '它不停止其他资源、不判断业务等价，也不删除远端分支。',
      ],
      match: ({ domain, action }: CliMatch) => domain === 'worktree' && action === 'cleanup',
      run: (runtime: GitWorktreeCliRuntime, context: CliContext) => gitWorktreeCommand(application || runtime, 'cleanup', context.argv.slice(4)),
    },
    {
      key: 'worktree inspect',
      surface: 'agent-machine',
      summary: '根据窄provider evidence检查全部成员仓库的checkout、branch、HEAD、clean与registration；不输出Task、runtime或session结论。',
      help: [
        'Usage: buildr worktree inspect <task-id> [--target <workspace>] [--json]',
        '',
        '根据窄provider evidence检查全部成员仓库的checkout、branch、HEAD、clean与registration；不输出Task、runtime或session结论。',
      ],
      match: ({ domain, action }: CliMatch) => domain === 'worktree' && action === 'inspect',
      run: (runtime: GitWorktreeCliRuntime, context: CliContext) => gitWorktreeCommand(application || runtime, 'inspect', context.argv.slice(4)),
    },
  ].map(Object.freeze));
}

export function createTaskRecordCliContributions(application: TaskCommandRuntime | null = null) {
  return Object.freeze([
    {
      key: 'task create', surface: 'primary', summary: '创建 active 正式 Task，或以 --status todo 只保存待办意向。',
      help: [
        'Usage: buildr task create <task-id> --title <text> --intent <text> [--status <todo|active>] [--parent-task] [--parent <task-id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] [--target <canonical-workspace>] [--json]',
        '',
        '省略 --status 时创建active；--status todo只写SQLite，拒绝Change，不执行Git或创建专业记录。',
        '任务复盘文档由Agent按用户要求生成到固定本机路径，Task创建不自动生成或登记复盘。',
        '--parent 只接受当前 Workspace 中已存在且 active 的 Task；副作用是在本地 structured store 中原子创建 Task 及其直接 Parent 关系。',
        '不创建Change、branch、commit或专业记录，也不自动改变父任务/子任务状态。',
      ],
      match: ({ domain, action }: CliMatch) => domain === 'task' && action === 'create',
      run: (runtime: TaskCommandRuntime, context: CliContext) => taskRecordCommand(application || runtime, 'create', context.argv.slice(4)),
    },
    {
      key: 'task inspect', surface: 'primary', summary: '只读返回Task Record、直接父任务/子任务摘要和响应级recordDigest，不递归展开整棵树，不暴露数据库路径；数据库尚未初始化时保持零写入。',
      help: ['Usage: buildr task inspect <task-id> [--target <canonical-workspace>] [--json]', '', '只读返回Task Record、直接父任务/子任务摘要和响应级recordDigest，不递归展开整棵树，不暴露数据库路径；数据库尚未初始化时保持零写入。'],
      match: ({ domain, action }: CliMatch) => domain === 'task' && action === 'inspect',
      run: (runtime: TaskCommandRuntime, context: CliContext) => taskRecordCommand(application || runtime, 'inspect', context.argv.slice(4)),
    },
    {
      key: 'task update', surface: 'primary', summary: '按当前摘要修改任务事实；支持带原因的终态事实更正。',
      help: [
        'Usage: buildr task update <task-id> --expected-record <recordDigest> [--status todo|active|completed|abandoned] [--reason <text>] [--summary <text>] [--title <text>] [--intent <text>] [--parent-task] [--parent <task-id> | --clear-parent] [--retrospective-state <pending-decision|decided> --retrospective-document-digest <sha256> | --clear-retrospective] [--add-project <code> ...] [--remove-project <code> ...] [--add-service <project/service> ...] [--remove-service <project/service> ...] [--add-change <project/change> ...] [--remove-change <project/change> ...] [--target <canonical-workspace>] [--json]',
        '',
        '至少提供一个明确 setter/add/remove；同一引用不能同时 add/remove。四种状态均可显式更正；终态事实更正必须提供--reason和当前--expected-record，todo拒绝Change。',
        '--parent 与 --clear-parent 互斥；拒绝不存在或 terminal Parent、自引用和任何祖先循环。Child 列表是只读派生结果。',
        '只更新Task Record SQLite；不接受--input、patch、完整next-state、expected revision或专业模块字段，不执行Git、验证、交付或清理。',
      ],
      match: ({ domain, action }: CliMatch) => domain === 'task' && action === 'update',
      run: (runtime: TaskCommandRuntime, context: CliContext) => taskRecordCommand(application || runtime, 'update', context.argv.slice(4)),
    },
    {
      key: 'task activate', surface: 'primary', summary: '把todo Task单向激活为active；该动作自身不执行Git或研发工作。',
      help: ['Usage: buildr task activate <task-id> --expected-record <recordDigest> [--target <canonical-workspace>] [--json]', '', '只写Task Record的todo -> active。Agent必须先读取当前摘要；不执行Git、验证、交付或清理。'],
      match: ({ domain, action }: CliMatch) => domain === 'task' && action === 'activate',
      run: (runtime: TaskCommandRuntime, context: CliContext) => taskRecordCommand(application || runtime, 'activate', context.argv.slice(4)),
    },
    {
      key: 'task complete', surface: 'primary', summary: '以明确结果摘要完成 todo 或 active Task。',
      help: ['Usage: buildr task complete <task-id> --summary <text> --expected-record <recordDigest> [--parent-completion <json-file>] [--target <canonical-workspace>] [--json]', '', '父任务必须同时提供 --parent-completion：包含当前观察、总体验收、逐子任务处置和明确用户授权。', '该动作只更新顶层 Task Record，不执行 Finish、Verification、Git、publication 或 cleanup。'],
      match: ({ domain, action }: CliMatch) => domain === 'task' && action === 'complete',
      run: (runtime: TaskCommandRuntime, context: CliContext) => taskRecordCommand(application || runtime, 'complete', context.argv.slice(4)),
    },
    {
      key: 'task abandon', surface: 'primary', summary: '把 todo 或 active Task 标记为 abandoned；终态事实可由统一 update 带原因更正。',
      help: ['Usage: buildr task abandon <task-id> --reason <text> --expected-record <recordDigest> [--target <canonical-workspace>] [--json]', '', '把todo或active Task标记为abandoned；终态事实仍可通过带原因的统一update显式更正。', '该动作只更新顶层Task Record，不执行Git或其他专业动作。'],
      match: ({ domain, action }: CliMatch) => domain === 'task' && action === 'abandon',
      run: (runtime: TaskCommandRuntime, context: CliContext) => taskRecordCommand(application || runtime, 'abandon', context.argv.slice(4)),
    },
  ].map(Object.freeze));
}

export function createTaskReviewCliContributions(application: TaskReviewCliRuntime | null = null) {
  return Object.freeze([
    {
      key: 'task review inspect', surface: 'agent-machine',
      summary: '只读返回 Planning/Completion 两个可选槽位及 response-only resultDigest；不判断对当前现场的适用性。',
      help: [
        'Usage: buildr task review inspect <task-id> [--target <canonical-workspace>] [--json]',
        '',
        '只读返回 Planning/Completion 两个可选槽位及 response-only resultDigest；不写Review，不执行Git、验证、交付、Task完成或清理。',
      ],
      match: ({ domain, action, runtimeId }: CliMatch) => domain === 'task' && action === 'review' && runtimeId === 'inspect',
      run: (runtime: TaskReviewCliRuntime, context: CliContext) => taskReviewCommand(application || runtime, 'inspect', context.argv.slice(5)),
    },
    {
      key: 'task review record', surface: 'agent-machine',
      summary: '只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。',
      help: [
        'Usage: buildr task review record <task-id> --type <planning|completion> --subject-identity <identity> --method <self|independent-agent|human> --reviewed <subject> ... [--uncovered <subject>::<reason> ...] [--finding <text> ...] --outcome <accepted|changes-requested> --summary <text> --expected-current <absent|sha256-digest> [--target <canonical-workspace>] [--json]',
        '',
        '只接收一份完整语义结果并原子替换对应 current 槽位；不接受完整 YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。',
        '中断、缺少审查对象identity、并发冲突或结论不完整时不写入。该命令只写Review current，不执行Git、验证、交付、Task完成或清理。',
      ],
      match: ({ domain, action, runtimeId }: CliMatch) => domain === 'task' && action === 'review' && runtimeId === 'record',
      run: (runtime: TaskReviewCliRuntime, context: CliContext) => taskReviewCommand(application || runtime, 'record', context.argv.slice(5)),
    },
  ].map(Object.freeze));
}

function createTaskRecordModule(requires: TaskRecordModuleRequires) {
  const privateComposition = Object.assign({},
    requires['workspace.structured-store'],
    requires['project-service.reader'],
    requires['change.resolver'],
    requires['workspace.operation-memoizer'],
  );
  Object.assign(privateComposition, {
    taskRepository: createTaskRepository(),
    taskProjectRepository: createTaskProjectRepository(),
    taskServiceRepository: createTaskServiceRepository(),
    taskChangeRepository: createTaskChangeRepository(),
  });
  const applicationRuntime = registerTaskRecordApplication(privateComposition as TaskRecordApplicationRuntime);
  registerTaskRecordRetrospectiveDocument(applicationRuntime);

  const application = pick(applicationRuntime, APPLICATION_METHODS);
  const persistenceRead = pick(applicationRuntime, PERSISTENCE_READ_METHODS);
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
      cli: createTaskRecordCliContributions(applicationRuntime),
      http: [Object.freeze({
        id: 'task-record.http',
        taskIdSource: TASK_RECORD_ID_SOURCE,
        handle: (input: Omit<TaskHttpInput, 'runtime'>) => handleTaskRecordHttpRequest({ ...input, runtime: applicationRuntime }),
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

function createTaskReviewModule(requires: RuntimeRequires) {
  const privateComposition = {
    ...requires[TASK_RECORD_PERSISTENCE_READ],
    ...requires['workspace.structured-store'],
  } as DynamicRuntime & TaskReviewRepositoryRuntime & TaskReviewApplicationRuntime;
  registerTaskReviewRepository(privateComposition);
  registerTaskReviewApplication(privateComposition);

  const application = pick(privateComposition, TASK_REVIEW_APPLICATION_METHODS);
  const persistenceRead = pick(privateComposition, TASK_REVIEW_PERSISTENCE_READ_METHODS);
  const cliPort = Object.freeze({ ...application, taskReviewResultPath: persistenceRead.taskReviewResultPath }) as TaskReviewCliRuntime;
  const runtimePortValue = Object.freeze({
    methods: Object.freeze({ ...application, ...pick(privateComposition, TASK_REVIEW_RUNTIME_PORT_METHODS) }),
    testSupportProperties: Object.freeze({
      taskReviewSerialize: Object.freeze({
        get: () => privateComposition.taskReviewSerialize,
        set: (value: TaskReviewRepositoryRuntime['taskReviewSerialize']) => { privateComposition.taskReviewSerialize = value; },
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
        handle: (input: Parameters<typeof handleTaskReviewHttpRequest>[0]) => handleTaskReviewHttpRequest(input),
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

export function createTaskVerificationModule(runtime: DynamicRuntime, { verificationDeclaration = null }: { verificationDeclaration?: string | null } = {}) {
  return Object.freeze({
    id: TASK_VERIFICATION_MODULE_ID,
    requires: Object.freeze([
      TASK_RECORD_PERSISTENCE_READ,
      ...(verificationDeclaration ? [verificationDeclaration] : []),
    ]),
    create(requires: RuntimeRequires) {
      const composition = taskPrivateComposition(runtime, requires) as DynamicRuntime & VerificationApplicationRuntime & TaskVerificationRepositoryRuntime;
      Object.defineProperty(composition, 'taskVerificationSerialize', { configurable: true, writable: true, value: undefined });
      registerTaskVerificationRepository(composition);
      registerTaskVerificationApplication(composition);
      const application = pick(composition, TASK_VERIFICATION_APPLICATION_METHODS);
      const persistenceRead = pick(composition, ['taskVerificationReportPath', 'readTaskVerificationReportPersistence']);
      const testSupportProperties = {
        taskVerificationSerialize: Object.freeze({
          get: () => composition.taskVerificationSerialize,
          set: (value: TaskVerificationRepositoryRuntime['taskVerificationSerialize']) => { composition.taskVerificationSerialize = value; },
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
          http: [createTaskVerificationHttpContribution(TASK_RECORD_ID_SOURCE)],
        },
      });
    },
  });
}

export function createParentCoordinationModule(runtime: DynamicRuntime) {
  return Object.freeze({
    id: PARENT_COORDINATION_MODULE_ID,
    requires: Object.freeze([TASK_RECORD_APPLICATION, TASK_RECORD_PERSISTENCE_READ]),
    create(requires: RuntimeRequires) {
      const composition = taskPrivateComposition(runtime, requires) as DynamicRuntime & ParentCoordinationApplicationRuntime;
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
