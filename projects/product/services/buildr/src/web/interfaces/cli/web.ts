import { reportWebHandoffStartupFailure } from '../../../bootstrap/cli/main.ts';

type WebCliRuntime = {
  manageBuildrWebPreview(action: string, args: string[]): unknown;
  startBuildrWeb(args: string[]): unknown;
};
type WebCliContext = { argv: string[] };
type WebCliMatch = { domain?: string; action?: string; runtimeId?: string };
type WebCliContribution = {
  key: string;
  surface: string;
  summary: string;
  help: string[];
  match(input: WebCliMatch): boolean;
  run(runtime: WebCliRuntime, context: WebCliContext): unknown;
};

async function startWeb(application: WebCliRuntime, args: string[]): Promise<unknown> {
  try {
    return await application.startBuildrWeb(args);
  } catch (cause: any) {
    // The detached updater has no standard streams. Flush its startup failure
    // through the private channel before ordinary CLI error reporting.
    await reportWebHandoffStartupFailure(cause, args);
    throw cause;
  }
}

export function createWebCliContributions(application: WebCliRuntime | null = null): readonly WebCliContribution[] {
  const contributions: WebCliContribution[] = [
  {
    key: "web preview start",
    surface: "maintenance",
    summary: "提供 --task 时，从该 Task 的受管 Git Worktree 启动；--reuse 可显式沿用开发版环境事实，预览能力保存精确 owner 并负责认证停止自己创建的进程。",
    help: [
      "Usage: buildr web preview start <instance> [--task <task-id> --target <canonical-workspace>] [--workspace <root> ...] [--port <port>] [--reuse <profile>[:facet,...]] [--refresh-reuse] [--no-open] [--json]",
      "",
      "提供 --task 时，从该 Task 的受管 Git Worktree 启动；预览能力保存精确 owner 并负责认证停止自己创建的进程。",
      "不提供 --task 时保留独立 checkout 预览。实例名不能接管其他健康预览，也不会替换默认 Buildr Web Runtime。",
      "不指定 --port 时复用该实例上次端口（被占用则改用随机端口）；--workspace 可重复，把其他已初始化 Workspace 登记进本实例用于验收。",
      "--reuse development 沿用开发版应用数据：默认包含 model-catalog（模型账号、缓存模型与启用偏好）与 agent-runtime（provider 登录配置、所需程序与预览内连接绑定）。",
      "可用 --reuse development:model-catalog,agent-runtime 只选择明确 facet；agent-runtime 自动包含 model-catalog。来源只读，写入限定在预览实例根内。",
      "首次启动缺失时播种，已有副本默认复用；--refresh-reuse 从来源重新复制所选 facet 并原子替换，失败保留旧副本。来源不可用或 facet 未知时在写入前失败。",
      "预览会话、附件、交接材料与模型运行缓存不复制；预览内执行不会写入开发版会话。",
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'preview' && runtimeId === 'start',
    run: (r, c) => (application || r).manageBuildrWebPreview('start', c.argv.slice(5)),
  },
  {
    key: "web preview list",
    surface: "maintenance",
    summary: "列出 Buildr 管理的开发预览及其 owner、URL、PID 与健康状态；不会扫描或管理其他系统进程。",
    help: [
      "Usage: buildr web preview list [--json]",
      "",
      "列出 Buildr 管理的开发预览及其 owner、URL、PID 与健康状态；不会扫描或管理其他系统进程。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'preview' && runtimeId === 'list',
    run: (r, c) => (application || r).manageBuildrWebPreview('list', c.argv.slice(5)),
  },
  {
    key: "web preview stop",
    surface: "maintenance",
    summary: "Task preview 必须同时提供 canonical Workspace 与 Task ID，并与 Worktree evidence、preview owner 和进程 secret 完全匹配。默认保留实例数据；--purge 在停止确认和 owner 校验后删除整个实例目录。",
    help: [
      "Usage: buildr web preview stop <instance> [--task <task-id> --target <canonical-workspace>] [--purge] [--json]",
      "",
      "Task preview 必须同时提供 canonical Workspace 与 Task ID，并与 Worktree evidence、preview owner 和进程 secret 完全匹配。独立 preview 保持实例级停止。",
      "默认只停止实例并保留数据。--purge 删除该实例根内的会话、附件、交接材料、账号与配置副本、程序副本、日志和登记。",
      "停止未确认、owner 不匹配、目标不在预览根内或存在越界符号链接时拒绝清理并保留现场。",
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'preview' && runtimeId === 'stop',
    run: (r, c) => (application || r).manageBuildrWebPreview('stop', c.argv.slice(5)),
  },
  {
    key: "web",
    surface: "primary",
    summary: "启动或复用只监听 127.0.0.1 的全局本机 Web 应用，并默认打开浏览器；--no-open 只启动服务。",
    help: [
      "Usage: buildr web [--target <workspace>] [--port <port>] [--no-open] [--replace-mismatched-development]",
      "",
      "启动或复用只监听 127.0.0.1 的全局本机 Web 应用，并默认打开浏览器；--no-open 只启动服务。",
      "--replace-mismatched-development 仅 development 实例使用：运行中的开发版与当前来源不匹配或缺少来源证明时，先正常退出旧实例再按当前来源启动；来源仍匹配的实例照常复用。",
      "--target 验证并登记指定 Workspace，然后打开该 Workspace；不提供时显示本机已登记 Workspace。",
      "关闭浏览器不会退出服务；通过页面“退出 Buildr”或终止进程停止服务。",
      "Workspace 页面帮助理解 Workspace → Project → Service 工作范围，只允许修改 name 和 description；创建、迁移和修复只生成可复制 Agent 指令。",
      "Project 与 Service 页面保持独立目录、详情和编辑；页面可生成范围明确的开始工作指令，但不会启动或管理 Agent 会话。",
      "页面不会 checkout、stash、merge 或改写 Project Git source。",
      "旧 Workspace metadata 可以只读查看，完成 canonical sync 迁移后才能从页面保存。",
      "本机登记列表只保存 Workspace root；事实仍来自各 Workspace，应用不提供远程服务或 Agent session connector。",
      "任务验证工作区的并行验收可使用 web preview；每个 preview 具有独立状态和 loopback URL，不会改变默认 Buildr Web 或 Buildr Web Dev.app。"
    ],
    match: ({ domain }) => domain === 'web',
    run: (r, c) => startWeb(application || r, c.argv.slice(3)),
  },
  ];
  return Object.freeze(contributions.map((contribution) => Object.freeze(contribution)));
}

export const WEB_CLI_GROUPS: readonly Readonly<{
  key: string;
  surface: string;
  summary: string;
  help: readonly string[];
  executable: boolean;
}>[] = Object.freeze([Object.freeze({
  key: 'web preview',
  surface: 'maintenance',
  summary: '预览以实例名隔离本地状态与 loopback URL；Task-owned preview 的归属和关闭安全由预览能力直接管理。',
  help: Object.freeze([
    'Usage: buildr web preview <start|list|stop> ...',
    '',
    '预览以实例名隔离本地状态与 loopback URL；Task-owned preview 的归属和关闭安全由预览能力直接管理。',
  ]),
  executable: false,
})]);
