# 技术层、对象与代表方法

以下位置均相对 `projects/product/services/buildr/`。

## 对象装配（Composition）

| 对象 | 文件 | 代表方法 | 责任 |
|---|---|---|---|
| Runtime | `src/bootstrap/runtime.ts` | `createRuntime`、`runtimeProvide`、`runtimeContributions` | 建立技术 Runtime，安装模块并只通过命名能力访问业务 |
| Module Registry | `src/bootstrap/module-registry.ts` | `install`、`provide`、`contributions` | 校验 requires/provides，保持模块注册顺序和贡献目录 |
| CLI Registry | `src/bootstrap/cli/registry.ts` | command catalog 组装 | 将模块 CLI contribution 变成唯一命令目录 |

生产 `createRuntime()` 不暴露 `createTask`、`doctor`、`startBuildrWeb` 等扁平业务方法。测试若需全产品便利入口，只能使用 `test/helpers/runtime-harness.ts`。

## Workspace

| 技术层 | 主要文件与对象 | 代表方法或行为 |
|---|---|---|
| Domain | `src/modules/workspace/domain/{workspace,project,service,source-root}.ts` | 身份、编码、Source Root 与声明规则 |
| Application | `workspace-command-application.ts`、`workspace-query-application.ts`、`project-application.ts`、`service-application.ts` | 创建、更新、查询与跨 Registry 一致性编排 |
| Persistence | `workspace-manifest-repository.ts`、`project-manifest-repository.ts`、`service-manifest-repository.ts` | YAML parse/render/read/write |
| Infrastructure | `workspace-management-fence.ts`、`workspace-source-filesystem.ts`、`workspace-source-git.ts` | 管理锁、staging/publish、Git source |
| Interface | `interfaces/cli/`、`interfaces/http/` | 结构化参数/结果与 HTTP Schema |

## Task

| 技术层 | 主要文件与对象 | 代表方法或行为 |
|---|---|---|
| Domain | `src/modules/task/domain/task.ts`、`task-review.ts`、`task-verification.ts`、`parent-coordination.ts` | Task 状态、关系、Review/Verification 与父任务完成约束 |
| Application | `task-command-application.ts`、`task-query-application.ts`、`task-review-application.ts`、`task-verification-application.ts` | 命令事务、列表/详情投影、专业记录条件写入 |
| Persistence | `task-repository.ts`、`task-list-repository.ts` 与关系 Repository | 同一 SQLite transaction context 下写入/查询 |
| Infrastructure | `git-worktree-provider.ts` | 精确创建、检查和安全清理 Task Worktree |
| Interface | `interfaces/cli/`、`interfaces/http/` | Task CLI、HTTP Schema、mapping 和生命周期端点 |

## Agent Assets

| 技术层 | 主要文件与对象 | 代表方法或行为 |
|---|---|---|
| Domain | `capability-identity.ts`、`component-definition.ts`、`command-version.ts` | 能力身份、Component 定义和版本语义；不做文件 I/O |
| Application | `commands.ts`、`rules.ts`、`skills.ts`、`components.ts` | 接收结构化输入，协调业务校验与 Repository，不解析 argv、不打印输出 |
| Persistence | `*-repository.ts`、`capability-graph-repository.ts` | Manifest、定义与 Capability Graph 的唯一文件读写 |
| Infrastructure | `command-version-probe.ts`、`component-source.ts`、`infrastructure/runtime/` | 外部命令探测、source 读取、Adapter 与 runtime projection |
| Interface | `interfaces/cli/agent-assets.ts`、`interfaces/http/` | CLI 参数/输出和 HTTP 协议映射 |

## OpenSpec

| 技术职责 | 文件 | 代表方法或不变量 |
|---|---|---|
| 用例入口 | `src/modules/openspec/application/openspec-application.ts` | 解析 Project/Change context，协调 validate/converge/archive |
| 计划 | `convergence-observer.ts`、`convergence-planner.ts`、`delta-parser.ts` | 从真实 baseline 与 delta 构造确定性计划 |
| 条件应用 | `canonical-applier.ts`、`deterministic-sync.ts` | 临时文件、版本比较、原子 rename 与失败回滚 |
| 恢复 | `convergence-recovery.ts`、`openspec-converge.ts` | receipt 与 recovery state；不掩盖 canonical drift |
| 隔离验证 | `projected-validator.ts` | 在临时 Project tree 上执行严格 OpenSpec 验证 |

## 通用基础设施

| 机制 | 文件 | 代表责任 |
|---|---|---|
| 原子文件 | `src/infrastructure/filesystem/atomic-files.ts` | 同目录 staging 与原子替换 |
| 独占锁 | `exclusive-file-lock.ts` | 所有权、超时和陈旧锁判断 |
| Workspace mutation | `workspace-mutation.ts` | 变更 journal 与恢复支撑 |
| 路径安全 | `path-safety.ts`、`workspace-path.ts` | canonical path 与越界拒绝 |
| Workspace 身份 | `workspace-identity.ts` | UUID 与当前 Workspace 身份核对 |
| 受管规则区块 | `required-block.ts` | Managed Block 检查与更新 |
| YAML | `yaml.ts` | 通用解析/格式化机制，不拥有业务 Schema |
| SQLite | `src/infrastructure/sqlite/` | connection、migration、transaction 与锁 |
| 进程 | `src/infrastructure/process.ts` | 同步进程调用与结构化结果 |

## 前端技术层

前端不复制后端的每一层。每个 `features/<capability>/` 只在真实需要时包含：

- `api/`：该功能专用客户端；
- `hooks/`：请求生命周期与页面状态；
- `components/`：功能内可组合视图；
- `pages/`：路由级组合。

共享 transport 位于 `src/api/client.ts`，生成 DTO 位于 `src/api/generated/`；`App.tsx` 只注册路由，`AppLayout.tsx` 只组合应用壳和跨页提示。
