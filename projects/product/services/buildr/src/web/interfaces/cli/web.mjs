export function createWebCliContributions() {
  return Object.freeze([
  {
    key: "web preview start",
    surface: "maintenance",
    summary: "提供 --task 时，从该 Task Environment 的任务验证工作区启动，并在健康后登记为 Environment 动态资源；登记失败会认证停止刚创建的实例。",
    help: [
      "Usage: buildr web preview start <instance> [--task <task-id> --target <canonical-workspace>] [--port <port>] [--no-open] [--json]",
      "",
      "提供 --task 时，从该 Task Environment 的任务验证工作区启动，并在健康后登记为 Environment 动态资源；登记失败会认证停止刚创建的实例。",
      "不提供 --task 时保留独立 checkout 预览。实例名不能接管其他健康预览，也不会替换默认 Buildr Web Runtime。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'preview' && runtimeId === 'start',
    run: (r, c) => r.manageLocalAppPreview('start', c.argv.slice(5)),
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
    run: (r, c) => r.manageLocalAppPreview('list', c.argv.slice(5)),
  },
  {
    key: "web preview stop",
    surface: "maintenance",
    summary: "Task preview 必须同时提供 canonical Workspace 与 Task ID，并与 Environment resource、preview metadata 和进程 secret 完全匹配；停止后释放同一资源。独立 preview 保持实例级停止。",
    help: [
      "Usage: buildr web preview stop <instance> [--task <task-id> --target <canonical-workspace>] [--json]",
      "",
      "Task preview 必须同时提供 canonical Workspace 与 Task ID，并与 Environment resource、preview metadata 和进程 secret 完全匹配；停止后释放同一资源。独立 preview 保持实例级停止。"
    ],
    match: ({ domain, action, runtimeId }) => domain === 'web' && action === 'preview' && runtimeId === 'stop',
    run: (r, c) => r.manageLocalAppPreview('stop', c.argv.slice(5)),
  },
  {
    key: "web",
    surface: "primary",
    summary: "启动或复用只监听 127.0.0.1 的全局本机 Web 应用，并默认打开浏览器；--no-open 只启动服务。",
    help: [
      "Usage: buildr web [--target <workspace>] [--port <port>] [--no-open]",
      "",
      "启动或复用只监听 127.0.0.1 的全局本机 Web 应用，并默认打开浏览器；--no-open 只启动服务。",
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
    run: (r, c) => r.startLocalWorkspaceApp(c.argv.slice(3)),
  },
  ].map(Object.freeze));
}

export const WEB_CLI_GROUPS = Object.freeze([Object.freeze({
  key: 'web preview',
  surface: 'maintenance',
  summary: '预览以实例名隔离本地状态与 loopback URL；Task-owned preview 的归属和 cleanup 事实由 Environment Receipt 管理。',
  help: Object.freeze([
    'Usage: buildr web preview <start|list|stop> ...',
    '',
    '预览以实例名隔离本地状态与 loopback URL；Task-owned preview 的归属和 cleanup 事实由 Environment Receipt 管理。',
  ]),
  executable: false,
})]);
