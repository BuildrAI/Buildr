# 技术层、对象与代表方法

以下位置均相对 `projects/product/services/buildr/`。

## 工作空间模块目录树

```text
src/modules/workspace/
├── module.ts                            对象装配（Composition），不拥有用例
├── domain/                              领域模型（Domain）
│   ├── workspace.ts                     工作空间身份
│   ├── project.ts                       项目身份、名称和来源
│   ├── service.ts                       服务身份、类型和来源
│   └── source-root.ts                   来源与所有权规则
├── application/                         应用服务（Application）
│   ├── workspace-query-application.ts    getWorkspace：读取展示结果
│   ├── workspace-command-application.ts 注册、更新、迁移与请求根解析
│   ├── workspace-operations.ts          initializeWorkspace：初始化编排
│   ├── project-application.ts           listProjects / createProjectAsset
│   ├── service-application.ts           listServices / createServiceAsset
│   ├── registry-maintenance.ts          convergeRegistryManifests：登记发现、服务迁移与修复
│   └── diagnostics/                     本模块负责的登记和来源诊断
├── persistence/                         数据访问（Persistence）
│   ├── workspace-manifest-repository.ts 工作空间声明读写
│   ├── workspace-registry-repository.ts 本机已登记工作空间读写
│   ├── project-manifest-repository.ts   项目登记读写
│   └── service-manifest-repository.ts   服务登记读写
├── infrastructure/                      模块专属基础设施（Infrastructure）
│   ├── workspace-source-filesystem.ts  来源暂存、复制和发布
│   ├── workspace-source-git.ts          来源 Git 操作
│   └── workspace-management-fence.ts   管理身份、锁与冲突保护
└── interfaces/                          接口入口（Interface）
    ├── cli/                             workspace / project / service 参数适配
    └── http/                            登记与详情路由、协议和响应校验
```

工作空间不拥有每日演进，也不再反向绑定任务查询。资产模块只取得明确的 `WORKSPACE_ASSET_SUPPORT`，不取得全部工作空间业务与测试方法。

## 任务模块目录树

```text
src/modules/task/
├── module.ts                            任务及专业子能力的装配入口
├── domain/                              身份、状态与自身规则
│   ├── task.ts                          普通任务状态与结果
│   ├── task-project.ts / task-service.ts / task-change.ts
│   │                                    任务范围关系
│   ├── task-review.ts                   审查结果规则
│   ├── task-verification.ts             验证报告与适用性
│   └── parent-coordination.ts           父任务完成约束
├── application/                         用例、事务与结果组合
│   ├── task-query-application.ts        queryTasks / inspectTask
│   ├── task-command-application.ts      createTask / updateTask / completeTask
│   ├── task-validation.ts               核心任务共享业务检查
│   ├── task-dto.ts                      手工结果类型与生成协议类型的边界
│   ├── task-review-application.ts       inspectTaskReview / recordTaskReview
│   ├── task-verification-application.ts inspectTaskVerification / recordTaskVerification
│   └── parent-coordination-application.ts inspectParentCoordination
├── persistence/                         唯一业务存取与结果映射
│   ├── task-repository.ts               任务主记录
│   ├── task-project-repository.ts / task-service-repository.ts
│   ├── task-change-repository.ts         任务范围关系
│   ├── task-list-repository.ts           列表投影与分页查询
│   ├── task-review-repository.ts         审查结果
│   ├── task-verification-repository.ts   验证报告
│   └── task-retrospective-document.ts    本机复盘文档安全读取
├── infrastructure/git-worktree-provider.ts
│                                        任务工作树创建、检查与安全清理
├── interfaces/{cli,http}/               任务及专业结果协议适配
├── change/                              任务关联 OpenSpec 的组合读取
│   ├── module.ts
│   ├── application/change-application.ts resolveTaskScopedChange / taskUiPrototypes
│   │                                    选择副本与来源，调用 OpenSpec 内容查询
│   └── interfaces/http/change-http.ts    任务关联详情和原型路由
└── daily-progress/                      本机每日演进子能力
    ├── domain/project-daily-progress.ts  日期、提交、摘要与文件规则
    ├── application/project-daily-progress-application.ts
    │   ├── recordProjectDailyProgress   校验项目、提交和任务引用后保存
    │   ├── inspectProjectDailyProgress  读取并组合当前任务信息
    │   ├── listProjectDailyProgress     列出已保存日期
    │   └── inspectTaskDailyProgress     查询任务关联演进
    ├── persistence/project-daily-progress-repository.ts
    │   ├── readDailyProgressDocument
    │   └── writeDailyProgressDocument   唯一演进文件 writer
    └── interfaces/
        ├── cli/project-daily-progress.ts 命令与输出适配
        └── http/project-daily-progress.ts 项目/任务演进只读路由
```

普通任务和专业结果使用 SQLite；每日演进使用被 Git 忽略的 YAML。属于同一模块不要求改成同一种存储，也不改变当前 Git 提交主导、关联本地任务的行为。

## 资产与支撑模块目录树

```text
src/modules/agent-assets/
├── module.ts                            资产应用、读取接口与跨模块依赖装配
├── domain/                              能力身份、组件定义、版本规则
├── application/
│   ├── commands.ts / rules.ts / skills.ts / components.ts
│   │                                    完整资产用例，按职责而非操作数拆分
│   ├── runtime.ts / runtime-projection.ts 运行环境发现与投射编排
│   ├── http-query.ts                    资产列表读取
│   ├── package-maintenance.ts           内置资产同步、生命周期与资源打包
│   └── package-maintenance/             上述用例的专属规则与技术协作
│       ├── package-assets.ts            模板补齐、同步路径
│       └── builtin-receipts.ts          snapshot / resolveState：资产比较与回执
├── persistence/                         资产声明、定义、能力图的存取
│   └── package-manifest-repository.ts   readPackageManifest / parseManifestFileEntry
├── infrastructure/                      版本探测、来源读取、运行环境适配
│   └── runtime/                         原生配置生成、所有权、投射与检查
│       ├── adapter-contract.ts          适配描述、注册、选择与声明性计划
│       │   ├── getRuntimeAdapter / selectAdapterImplementation
│       │   └── createRuntimeContext / createRuntimePlan
│       ├── runtime-reconciler.ts        唯一计划文件执行者
│       │   ├── assertRuntimeTargetPath / validateRuntimePlan
│       │   └── reconcileRuntimePlan     比较、预检、按序写删及既有失败恢复
│       ├── projection.ts               从源资产组装完整投射
│       └── skills/                     技能（Skill）投射及文件字节工具
└── interfaces/{cli,http}/               参数、协议与结果展示

src/modules/project-testing/
├── module.ts                            只装配并导出声明能力
├── domain/project-verification.ts       声明格式与语义校验
├── application/project-verification-application.ts
│                                        inspect / validate / update 与只读诊断
└── interfaces/cli/project-verification.ts 参数与结果适配

src/modules/diagnostics/
├── module.ts                            只选择必要读取能力，不注入业务 writer
└── application/                         诊断编排、结果模型与输出
```

资产工程检查位于 `tools/verification/package-check.ts` 及其目录，不属于产品应用。`AGENT_ASSETS_DIAGNOSTICS_READ` 只提供检查；`inspectPackageBuiltins` 固定以检查模式调用资产 owner，诊断方无法请求同步写入。

运行时（Runtime）调用方向：应用与投射组装 → `runtime-reconciler.ts` → 适配声明与既有文件工具。`adapter-contract.ts` 不导入执行器、不实现文件写删；执行器整体保留 `compareOnly`、冲突预检、`commitLast`/`removeLast` 顺序及旧回执迁移失败恢复，不扩展原有事务保证。

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

```text
src/modules/openspec/
├── module.ts                            OPENSPEC_QUERY / OPENSPEC_APPLICATION 装配
└── application/
    ├── change-query.ts                   createChangeQuery：通用内容查询
    │   ├── listProjectChanges / listChanges 保留项目的变更列表
    │   ├── changeDetail / findLogicalChange 详情与活动、归档定位
    │   ├── discoverUiPrototypes          原型文件发现及安全限制
    │   └── generateChangeCreatePrompt / generateChangeActionPrompt
    ├── change-checklist.ts               只读清单进度
    └── openspec-application.ts           收敛用例及其下层协作者
```

任务详情的调用链：`change-http.ts` → `resolveTaskScopedChange` 选择受信任副本 → `OPENSPEC_QUERY.findLogicalChange` 读取内容。原型（UI Prototype）文件由 OpenSpec 发现，任务侧补充任务关联身份与副本来源。全局列表直接使用 OpenSpec 查询，不经过任务，也不扫描工作树（Worktree）。`task_changes` 关联表仍由任务维护；OpenSpec 不反向依赖任务。

OpenSpec 的资产依赖只通过 `AGENT_ASSETS_OPENSPEC_SUPPORT` 获取：`assertName`、`componentDefinitionFile`、`readComponentDefinition`、`readComponentsManifestForWrite`、`runCommandsCheck`。`OpenSpecAssetSupport` 定义具体签名，`createOpenSpecAssetSupport` 校验并只选取这五项；不再注入完整的 `AGENT_ASSETS_INTERNAL`。

| 技术职责 | 文件 | 代表方法或不变量 |
|---|---|---|
| 内容查询 | `src/modules/openspec/application/change-query.ts` | 列表、详情、归档、产物与原型读取；局部类型和文件辅助函数同文件维护 |
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

共享 transport 位于 `src/api/client.ts`，生成 DTO 位于 `build/generated/`；`App.tsx` 只注册路由，`AppLayout.tsx` 只组合应用壳和跨页提示。

## 诊断与安装的结果边界

```text
src/modules/diagnostics/
├── module.ts                           显式传入诊断依赖并贡献命令入口
├── application/
│   ├── doctor-application.ts            doctor(DoctorInput)：返回完整结果
│   ├── diagnostics.ts                  各诊断协作者装配
│   └── result-model.ts                 发现项、健康与修复计划
└── interfaces/cli/
    ├── doctor.ts                       runDoctorCommand / writeDoctorResult
    └── product-installation-report.ts  安装身份的人类可读输出

src/modules/installation/
├── application/
│   ├── product-installation-status.ts  installationStatus(options)：查询结果
│   └── cli-update.ts                   updateCheck / updateBuildr：计划与执行结果
└── interfaces/cli/installation.ts       参数校验、JSON、人类输出与退出码
```

资产装配入口（Composition）逐项注入 `CommandsDependencies`、`SkillsDependencies`、`ComponentsDependencies` 等局部类型，只公开调用方需要的函数。私有校验、事务内辅助方法和旧解析器不成为共享运行时（Runtime）属性。
