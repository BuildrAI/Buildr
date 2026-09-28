# 技术层、对象与代表方法

本地图用工作空间（Workspace）模块的一条业务路径解释分层，再定位跨模块装配、恢复与前端状态的关键边界。完整能力目录见[服务与工程地图](system-services-assets.md)；任务、知识、投射与验证的详细实现由各自专题地图维护。

下列后端路径相对 `projects/product/services/buildr/`；前端链接明确指向另一服务（Service）。目录只列理解职责所需的代表文件，不是源码镜像。

## 一例完整模块：工作空间与对象关系

关系写入从命令行（CLI）或网页进入同一应用；应用核对整组登记的已观察版本，领域模型判断对象及引用是否合法，数据访问保存清单。真实代码位置、Git 状态与登记是不同事实，保存登记不会自动准备代码。详细关系和前端操作见[对象关系地图](project-service-repositories.md)。

- **[`src/modules/workspace/`](../../services/buildr/src/modules/workspace/)**：身份、来源、登记与组成。
  - [`module.ts`](../../services/buildr/src/modules/workspace/module.ts)：私有装配和公开能力选择，不拥有用例。
  - **`interfaces/`**：解析输入并展示结果。
    - [`cli/asset-catalog.ts`](../../services/buildr/src/modules/workspace/interfaces/cli/asset-catalog.ts)：`assets` 输入、帮助与输出适配。
    - [`http/`](../../services/buildr/src/modules/workspace/interfaces/http/)：网页登记及详情的路由、协议与响应校验。
  - **`application/`**：组织业务判断、版本核对与读写。
    - [`asset-relationships-application.ts`](../../services/buildr/src/modules/workspace/application/asset-relationships-application.ts)：对象创建、引用关系与移除边界。
    - [`workspace-query-application.ts`](../../services/buildr/src/modules/workspace/application/workspace-query-application.ts)：`getWorkspace` 等只读展示结果。
    - [`workspace-command-application.ts`](../../services/buildr/src/modules/workspace/application/workspace-command-application.ts)：登记、更新、迁移与请求根解析。
    - [`workspace-operations.ts`](../../services/buildr/src/modules/workspace/application/workspace-operations.ts)：初始化与恢复编排。
    - [`registry-maintenance.ts`](../../services/buildr/src/modules/workspace/application/registry-maintenance.ts)：登记发现、旧服务迁移与修复。
  - **`domain/`**：不依赖输入输出的结构与约束。
    - [`asset-relationships.ts`](../../services/buildr/src/modules/workspace/domain/asset-relationships.ts)：项目（Project）、服务（Service）、代码库实例（Repository Instance）及引用校验。
    - [`source-root.ts`](../../services/buildr/src/modules/workspace/domain/source-root.ts)：来源与所有权规则。
  - **`persistence/`**：保存格式、读取与来源映射。
    - [`asset-catalog-repository.ts`](../../services/buildr/src/modules/workspace/persistence/asset-catalog-repository.ts)：读取当前或兼容登记，组成关系视图。
    - [`asset-composition-repository.ts`](../../services/buildr/src/modules/workspace/persistence/asset-composition-repository.ts)：总览只读投影与局部来源诊断。
    - [`workspace-manifest-repository.ts`](../../services/buildr/src/modules/workspace/persistence/workspace-manifest-repository.ts)：工作空间（Workspace）声明读写。
    - [`workspace-registry-repository.ts`](../../services/buildr/src/modules/workspace/persistence/workspace-registry-repository.ts)：本机已登记目录读写。
  - **`infrastructure/`**：本模块专用技术协作。
    - [`workspace-source-filesystem.ts`](../../services/buildr/src/modules/workspace/infrastructure/workspace-source-filesystem.ts)：来源暂存、复制和发布。
    - [`workspace-source-git.ts`](../../services/buildr/src/modules/workspace/infrastructure/workspace-source-git.ts)：明确来源的 Git 操作。
    - [`workspace-management-fence.ts`](../../services/buildr/src/modules/workspace/infrastructure/workspace-management-fence.ts)：管理身份、锁与冲突保护。

工作空间（Workspace）不拥有每日演进，也不反向绑定全部任务查询。资产模块只取得明确的 `WORKSPACE_ASSET_SUPPORT`，不取得全部业务和测试方法。

## 对象装配与跨模块依赖

| 入口 | 代表职责 |
| --- | --- |
| [`bootstrap/runtime.ts`](../../services/buildr/src/bootstrap/runtime.ts) | `createRuntime` 创建技术运行时（Runtime）并安装模块；`runtimeProvide` 读取具名能力，`runtimeContributions` 汇集入口贡献 |
| [`bootstrap/module-registry.ts`](../../services/buildr/src/bootstrap/module-registry.ts) | `install`、`provide`、`contributions` 校验依赖、提供者唯一性与装配顺序 |
| [`bootstrap/cli/registry.ts`](../../services/buildr/src/bootstrap/cli/registry.ts) | 将各模块贡献组合为唯一命令目录、帮助和分发入口 |

确需延后连接的依赖由上述装配中的一次性绑定器（Binder）处理，以当前代码为准，不另列易漂移的成员清单。生产运行时（Runtime）不暴露 `createTask`、`doctor` 等扁平业务方法；测试需要便利入口时使用 [`runtime-harness.ts`](../../services/buildr/test/helpers/runtime-harness.ts)。

资产装配逐项注入局部依赖，只公开调用方需要的方法。`AGENT_ASSETS_DIAGNOSTICS_READ` 只提供检查；`inspectPackageBuiltins` 固定以检查模式调用所属能力，诊断方不能请求同步写入。来源见[资产装配](../../services/buildr/src/modules/agent-assets/module.ts)和[诊断装配](../../services/buildr/src/modules/diagnostics/module.ts)。

投射的应用与计划交给唯一协调器执行；适配声明不反向导入执行器，也不直接写删文件。协调器保留冲突预检、比较模式、记录最后提交及旧回执迁移恢复，不因此承诺所有文件异常下的全局回滚。详见[投射地图](skill-projection.md)。

## OpenSpec 接入与恢复

任务关联读取先由任务应用选择受信任副本，再委托 `OPENSPEC_QUERY` 查内容；全局列表直接使用 OpenSpec 查询，不经过任务，也不扫描工作树（Worktree）。`task_changes` 关系仍归任务模块，OpenSpec 不反向依赖任务，见[任务地图](task-system.md)。

| 技术职责 | 唯一实现入口与边界 |
| --- | --- |
| 内容查询 | [`change-query.ts`](../../services/buildr/src/modules/openspec/application/change-query.ts)：列表、详情、活动及归档定位、产物和原型读取 |
| 用例组织 | [`openspec-application.ts`](../../services/buildr/src/modules/openspec/application/openspec-application.ts)：解析项目（Project）及变更（Change），组织校验与收敛 |
| 上游解析 | [`upstream-openspec.ts`](../../services/buildr/src/modules/openspec/application/upstream-openspec.ts) 与[工作进程](../../services/buildr/src/modules/openspec/application/upstream-openspec-worker.ts)：用锁定上游解析增量、形成预期内容并校验，不自行写主规范 |
| 归档与恢复 | [`openspec-converge.ts`](../../services/buildr/src/modules/openspec/application/openspec-converge.ts)：核对输入后调用上游归档并回读；[恢复模型](../../services/buildr/src/modules/openspec/application/convergence-model.ts)和[当前观察](../../services/buildr/src/modules/openspec/application/convergence-observer.ts)比较修改前、预期与实际内容；未知状态保留现场 |
| 只读预检 | [`openspec-convergence-preflight.ts`](../../services/buildr/src/modules/openspec/application/openspec-convergence-preflight.ts)：核对活跃冲突与归档输入，不代替正式归档 |

OpenSpec 只通过 `AGENT_ASSETS_OPENSPEC_SUPPORT` 获取所需资产能力，具体签名与筛选由[资产模块](../../services/buildr/src/modules/agent-assets/module.ts)中的 `OpenSpecAssetSupport` 和 `createOpenSpecAssetSupport` 维护，不注入完整私有资产对象。恢复机制保护可核对现场，不承诺整个上游归档原子写入。

## 前端技术层

前端不复制后端所有层次。[`features/`](../../services/buildr-web/src/features/) 内的业务客户端、请求状态、组件和页面按需要建立；共享传输在 [`api/client.ts`](../../services/buildr-web/src/api/client.ts)，协议类型来自生成目录。应用壳与功能各自持有状态，不互相复制。

- **共同展示与入口隔离**：[`AppShellView.tsx`](../../services/buildr-web/src/app/AppShellView.tsx) 和 [`AppNavigationItem.tsx`](../../services/buildr-web/src/app/AppNavigationItem.tsx) 提供展示；正式入口接入真实数据，已授权原型可复用展示并注入模拟数据，不能调用真实写入。
- **连续阅读与当前事实**：已访问页面保留筛选、滚动和草稿，关闭页面或切换工作空间（Workspace）后释放。本地存储（localStorage）只保存偏好，不可用时不应阻断工作；保留页面不等于业务数据最新，保存仍需版本检查。
- **指令与请求时效**：生成的智能体（Agent）指令只对应当前输入。目标或范围变化后旧指令失效，迟到请求不能恢复旧结果；上下文切换释放旧表单，生成失败也不回退到旧指令。
- **局部失败与草稿**：任务材料按需读取，某项失败不隐藏其他可读成果。共用抽屉外观不代表所有表单已经具有相同草稿保护；保存、错误和保留输入仍由各功能负责。
- **原型与侧读**：原型以 `sandbox="allow-scripts"` 隔离，不能继承主页面会话（Session）。说明和清单共用 [`SideReadingPanel.tsx`](../../services/buildr-web/src/components/SideReadingPanel.tsx) 及[阅读状态](../../services/buildr-web/src/components/useSideReading.ts)；任务内、独立阅读及可选说明解析见[任务地图](task-system.md#原型阅读怎样落到实现)，不新增一份业务状态。

正式规则见[前端约束](../../services/buildr-web/AGENTS.md)。前端阅读、交互和源状态分别核验，逻辑通过不能代替浏览器验收。

## 技术机制与结果边界

通用[文件机制](../../services/buildr/src/infrastructure/filesystem/)提供路径、原子替换、独占锁、身份及写入恢复；[SQLite 机制](../../services/buildr/src/infrastructure/sqlite/)提供连接、迁移和事务（Transaction）；[进程调用](../../services/buildr/src/infrastructure/process.ts)保存结构化结果。这些机制不拥有业务约束；具体数据与恢复边界见[数据设计](../docs/architecture/buildr-data-design.md)。

[诊断应用](../../services/buildr/src/modules/diagnostics/application/doctor-application.ts)组合检查，[结果模型](../../services/buildr/src/modules/diagnostics/application/result-model.ts)表达发现、健康和修复计划；[安装状态](../../services/buildr/src/modules/installation/application/product-installation-status.ts)与[更新应用](../../services/buildr/src/modules/installation/application/cli-update.ts)分别保存实际观察和更新结果。诊断、安装成功与当前运行实例已采用仍是不同事实。

任务与每日演进可属于同一模块而使用不同存储；SQLite 协作记录和本机 YAML 摘要的区别见[任务地图](task-system.md)与[每日演进](../docs/flows/project-daily-progress.md)。工程包检查仍在 `tools/verification/`，不归资产应用或诊断所有。
