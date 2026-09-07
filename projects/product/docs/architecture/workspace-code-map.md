# 工作空间代码地图（Workspace Code Map）

以 Java 面向对象设计（OOD）思路组织职责，不机械复制“一类一文件”：重要独立边界单列，其余优先在所属文件内组织。领域（Domain）不等于清单文件（Manifest）；前者表达对象与规则，后者由仓储（Repository）解析、映射和保存。

## 后端：目录与职责

根目录：`services/buildr/src/workspace/`。

```text
workspace/
├── module.ts                          私有装配、具名能力、明确公开方法
├── domain/                            领域对象、声明与不变量
│   ├── workspace.ts                   身份、名称、描述等规则
│   ├── project.ts                     项目及其来源声明
│   ├── service.ts                     服务及其来源声明
│   ├── source-root.ts                 受管/附接来源、稳定身份、归属、默认值
│   └── project-daily-progress.ts       每日演进文档与输入约束
├── application/                       对象用例和执行顺序
│   ├── workspace-query-application.ts  查询、创建指令、首次使用引导、诊断
│   ├── workspace-command-application.ts 登记、移除、元数据更新、迁移
│   ├── workspace-operations.ts         初始化、引导文档、失败恢复
│   ├── project-application.ts          项目读取、更新、迁移、创建与附接
│   ├── service-application.ts          服务读取、更新、迁移、创建与附接
│   └── project-daily-progress-application.ts 写入、读取、任务关联、查询分组
├── persistence/                       格式映射和持久化，不另拆编解码文件
│   ├── workspace-manifest-repository.ts 工作空间清单
│   ├── workspace-registry-repository.ts 本机工作空间目录
│   ├── project-manifest-repository.ts   项目登记清单
│   ├── service-manifest-repository.ts   服务登记清单
│   └── project-daily-progress-repository.ts 每日演进 YAML 文件
├── infrastructure/                    三个完整技术边界
│   ├── workspace-source-git.ts         Git 观察、克隆、附接核验、忽略边界
│   ├── workspace-source-filesystem.ts  路径、受限文档、复制、暂存与发布
│   └── workspace-management-fence.ts   不同 Web 配置之间的管理权保护
└── interfaces/                        入口协议适配
    ├── cli/
    │   ├── workspace.ts               参数解析、调用、初始化/恢复输出
    │   ├── project.ts                 项目创建入口
    │   ├── service.ts                 服务创建入口
    │   ├── project-daily-progress.ts   每日演进入口
    │   └── cli-arguments.ts            共用参数解析
    └── http/
        ├── workspace-http.ts          路由与调用
        └── workspace-http-contracts.ts 请求/响应契约
```

HTTP 生成类型位于 `interfaces/http/generated/`，不作为手写逻辑维护。

### 主要对象提供什么

| 对象或能力 | 代表方法 | 内部边界 |
| --- | --- | --- |
| 工作空间应用（Workspace Application） | `getWorkspace`、`registerLocalWorkspace`、`updateWorkspaceMetadata`、`initializeWorkspace`、`recoverWorkspaceMutation` | 三个实现文件，同一公开能力；引导和诊断不继续拆文件 |
| 项目应用（Project Application） | `listProjects`、`projectDetail`、`projectDocument`、`updateProjectMetadata`、`migrateProjectRegistry`、`createProjectAsset` | 读取、更新和创建在同一文件内分组 |
| 服务应用（Service Application） | `listServices`、`serviceDetail`、`serviceDocument`、`updateServiceMetadata`、`migrateServiceRegistry`、`createServiceAsset` | 同上，不另建创建应用 |
| 每日演进应用（Daily Progress Application） | `recordProjectDailyProgress`、`inspectProjectDailyProgress`、`listProjectDailyProgress`、`inspectTaskDailyProgress` | 查询分组留在应用内，文档约束留在领域内 |
| 来源文件访问对象（Source Filesystem） | `resolveRoot`、`readDocument`、`withStaging`、`copy`、`publish` | 只做技术访问；是否克隆、附接和何时写登记由所属应用决定 |
| 具名仓储（Repository） | `workspaceRepository`、`registryRepository`、`projectRepository`、`serviceRepository`、`dailyProgressRepository` | 各自的读取、解析、序列化、写入放在同一文件 |

模块（Module）内部仍有旧装配别名；对外使用明确方法清单。迁移、资产同步、诊断及少量测试仍需兼容方法，未宣称彻底消除旧调用。新增消费者优先使用公开应用或窄查询（Query）能力，不把内部仓储对象重新暴露到共享运行时（Runtime）。

管理保护（Management Fence）独立是因为它跨登记、创建和恢复保护同一管理权，不能并进某个领域的普通读写。它不是新增业务领域，也不再继续拆文件。

## 前端：目录与职责

根目录：`services/buildr-web/src/`。

```text
src/
├── app/
│   ├── AppLayout.tsx                  应用壳、导航、工作空间切换
│   └── AgentActionDrawer.tsx          动作选择、上下文、领域表单装配
├── features/
│   ├── workspace/
│   │   ├── pages/WorkspacesPage.tsx   目录、选择/登记/移除、页面局部状态
│   │   └── components/WorkspaceAgentAction.tsx 完整创建表单
│   ├── project/
│   │   ├── pages/                    列表、详情、编辑入口及项目区域
│   │   └── components/               ProjectEditModal、ProjectAgentAction
│   ├── service/
│   │   ├── pages/                    目录、详情、编辑入口
│   │   ├── hooks/useServiceCatalog.ts 多项目服务加载与目录状态
│   │   └── components/               ServiceEditModal、ServiceAgentAction
│   ├── project-daily-progress/
│   │   └── components/DailyProgressAgentAction.tsx 完整每日演进动作表单
│   └── task/
│       └── components/TaskAgentAction.tsx 开始工作、变更交接、审查/验证指令
├── components/AgentActionFeedback.tsx 错误、指令结果、复制反馈
├── lib/useMarkdownDocumentViewer.ts  项目/服务共用文档加载与历史导航
└── api/
    ├── workspace.ts                 目录、详情、编辑、创建指令请求
    └── task-professional.ts         现有专业结果读取及工作/变更指令请求
```

此图只展开本轮涉及的文件；每日演进与任务的其他页面、状态钩子（Hook）和客户端（Client）保持原有职责。

完整动作表单自己拥有字段状态、选项加载和提交；网络协议复用已有客户端（Client），不为每个表单再建文件。共享反馈不读取领域数据、不提交业务请求。工作空间目录仅使用一次的状态钩子（Hook）并回页面；真正跨项目、服务复用的文档导航继续独立。

## 本轮是合并还是拆分

- 合并：两个创建应用、来源创建策略、根目录忽略条目文件、工作空间目录状态钩子（Hook）。
- 归位：来源技术操作集中到一个文件系统文件；每日演进分组回应用；命令参数和输出回命令行（CLI）入口；共享文档导航移入 `lib/`。
- 粗拆：原跨多个领域的动作抽屉拆成五个完整表单，共用一个反馈文件。
- 保留：独立领域、五个仓储（Repository）、管理保护、工作空间三个应用职责组。不继续按每个方法或小逻辑单元拆文件。
