# 功能与模块地图

## 后端产品模块

| 用户或产品能力 | 唯一模块入口 | 主要责任 | 主要对外端口或贡献 |
|---|---|---|---|
| Workspace、Project、Service 与每日演进 | `services/buildr/src/modules/workspace/module.ts` | Workspace 身份、注册表、Project/Service Manifest、Workspace mutation、每日演进 | `WORKSPACE_APPLICATION`、`WORKSPACE_QUERY`、CLI/HTTP/diagnostics |
| Task Record、Review、Verification、父任务协调与 Worktree | `services/buildr/src/modules/task/module.ts` | Task 领域规则、SQLite 事务、查询投影、专业记录和 Git Worktree 操作 | `TASK_QUERY_APPLICATION`、Task 各端口、CLI/HTTP |
| Task 与 OpenSpec Change 关联展示 | `services/buildr/src/modules/task/change/module.ts` | Task scope 下的 Change 定位和 HTTP 展示组合 | `CHANGE_APPLICATION`、HTTP |
| 通用 OpenSpec | `services/buildr/src/modules/openspec/module.ts` | Change 读取、严格校验、收敛计划、条件应用与恢复 | `OPENSPEC_APPLICATION`、`OPENSPEC_QUERY`、CLI |
| Agent Assets | `services/buildr/src/modules/agent-assets/module.ts` | Command、Rule、Skill、Component、Capability Binding、package maintenance 与 runtime projection | `AGENT_ASSETS_APPLICATION`、`AGENT_ASSETS_RUNTIME`、CLI/HTTP/diagnostics |
| 用户 Project 测试声明 | `services/buildr/src/modules/project-testing/module.ts` | `verification.yml` inspect/validate/update；不拥有测试执行 | `VERIFICATION_APPLICATION`、`VERIFICATION_DECLARATION`、CLI/diagnostics |
| Buildr installation 与 release awareness | `services/buildr/src/modules/installation/module.ts` | installation identity、update、状态、npm Launcher 和版本提示 | `SYSTEM_INSTALLATION_APPLICATION`、CLI/HTTP |
| Doctor 聚合 | `services/buildr/src/modules/diagnostics/module.ts` | 聚合各模块只读诊断并形成统一结果 | `SYSTEM_DOCTOR_APPLICATION`、CLI |
| Publication | `services/buildr/src/modules/publication/module.ts` | 文章清单、详情和资源读取 | `PUBLICATION_APPLICATION`、HTTP |

## 后端技术宿主

| 宿主 | 入口 | 责任 |
|---|---|---|
| Bootstrap | `services/buildr/src/bootstrap/runtime.ts` | 按依赖顺序安装模块，以命名能力和一次性 Binder 完成装配 |
| CLI Host | `services/buildr/src/bootstrap/cli/main.ts`、`cli/registry.ts` | 收集命令贡献、解析顶层命令并分发；不实现业务 |
| Web Host | `services/buildr/src/web/module.ts`、`web/http/router.ts` | 生命周期、会话、loopback HTTP、静态托管和业务 HTTP contribution 分发 |
| Infrastructure | `services/buildr/src/infrastructure/index.ts` | 文件、路径、SQLite、进程、Git、产品资源等通用技术能力 |

## 前端功能

| 功能 | 位置 | 代表入口 |
|---|---|---|
| 应用壳 | `services/buildr-web/src/app/` | `AppLayout`、`AppShellContext`、`AgentActionDrawer` |
| Workspace | `services/buildr-web/src/features/workspace/` | `WorkspacesPage`、`WorkspaceAgentAction` |
| Project | `services/buildr-web/src/features/project/` | `ProjectsPage`、`ProjectDetailPage`、`ProjectEditModal` |
| Service | `services/buildr-web/src/features/service/` | `ServicesPage`、`ServiceDetailPage`、`useServiceCatalog` |
| Task | `services/buildr-web/src/features/task/` | `TasksPage`、`TaskDetailPage`、`useTaskList`、`useTaskActions` |
| Project Daily Progress | `services/buildr-web/src/features/project-daily-progress/` | `DailyProgressPanel` |
| Publication | `services/buildr-web/src/features/publication/` | `ArticlesPage`、`ArticleDetailPage`、`publicationApi` |
| Installation | `services/buildr-web/src/features/installation/` | `SettingsPage`、`ReleaseAwarenessBanner`、`releaseAwarenessApi` |

## 工程模块

| 工程责任 | 位置 | 产出或作用 |
|---|---|---|
| HTTP DTO 代码生成 | `services/buildr/tools/codegen/contracts/` | 从后端模块 Schema 生成前后端 TypeScript DTO |
| npm 应用负载 | `services/buildr/tools/release/application-payload.ts` | 解析发布依赖闭包并构建受检应用负载 |
| Development Launcher | `services/buildr/tools/build/launcher/` | 构建/安装当前 checkout 的开发应用入口 |
| 测试选择与调度 | `services/buildr/test/verification/` | 只服务 Buildr 自测与 Candidate 验证，不进入产品模块 |
| 性能基准 | `services/buildr/tools/performance/` | 隔离运行百万 Task 查询基准，不进入默认回归 |
| 文件型交付源 | `services/buildr/resources/` | Workspace 同步、Agent runtime、安装资源 |
