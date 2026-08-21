import { registerTaskRecordApplication } from './application/record/task-record-application.mjs';
import { registerTaskRecordRepository } from './persistence/record/task-record-repository.mjs';
import { taskRecordCommand } from './interfaces/cli/task-record.mjs';
import { handleTaskRecordHttpRequest, TASK_RECORD_ID_SOURCE } from './interfaces/http/task-record-http.mjs';

export const TASK_RECORD_MODULE_ID = 'task-record';
export const TASK_RECORD_APPLICATION = 'task-record.application';
export const TASK_RECORD_PERSISTENCE_READ = 'task-record.persistence-read';
export const TASK_RECORD_COMPATIBILITY = 'task-record.bootstrap-compatibility';

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

function pick(source, methods) {
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, source[method]])));
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
