# 工作空间产物登记与生命周期处置

## Why

任务与智能体（Agent）在工作区创建的中间产物——隔离构建目录、候选验证现场、保全的构建输入——没有任何登记与处置机制。实测本自举工作区 `services/dsh-plugin/build/` 累积 24G、`buildr/build/verification/` 5G、`.buildr/local/task-preservation` 5.3G 失效构建现场；收尾流程只对工作树（Worktree）有契约化清理，其余临时产物靠 Agent 自觉，结果是无主目录无限堆积，且"还在使用"与"已经失效"无从区分。现在改变是因为已造成真实磁盘占用损失，且人工归因证明归属与失效事实是可核验的，缺的只是产品化能力。

## What Changes

- 新增工作空间产物清单（Artifact Inventory）：`.buildr/local/artifacts/` 文件登记，记录产物路径、归属任务、用途、处置策略（`ephemeral|retained|evidence`）与保留引用方；登记为描述性可选动作，不是任何工作的前置条件。
- 新增产物发现与归属：扫描已声明的 scratch 根（如各服务 `build/` 目录），枚举已登记与未登记产物，按登记、任务标识与证据归属分类为 `active|retained|retained-stale|expired|unattributed`，报告大小、年龄与所有者任务状态。
- 新增产物清扫：`buildr artifact clean` 默认 dry-run 输出逐项计划与依据；`--execute` 只删除归属与失效均已核验的项，逐项失败隔离，不触碰证据类与其他所有者（Worktree provider）管理的目录。
- 新增保留边界：保留（retained）必须显式声明引用方；引用失效只形成待决诊断，不自动删除。
- 更新 `task-finish` 技能指引：收尾时对本任务已登记产物逐项处置（清理/转 retained 并写明引用/报告未决），为指引而非新增门禁。
- 明确 `task-environments` 边界：产物清单不是 Task Environment 资源注册，不引入统一环境应用、就绪门禁或总 cleanup。

不包含破坏性变更（BREAKING）：全部为新增能力；未登记产物的既有工作方式不受影响。

## Capabilities

### New Capabilities

- `workspace-artifact-lifecycle`: 工作空间中间产物的登记、发现、归属分类、诊断报告与有界清扫；含文件登记格式、scratch 根声明、处置状态机、清扫授权与失败隔离、Agent 使用指引边界。

### Modified Capabilities

- `cli-product-surface`: 新增 `buildr artifact` 命令族在命令目录与产品表面分类中的登记要求。
- `agent-task-workflows`: 新增任务收尾指引对已登记产物逐项处置的要求（指引而非门禁）。
- `task-environments`: 新增产物清单与 Task Environment 资源注册的边界澄清，允许有界产物登记能力存在。

## Impact

- 代码：`services/buildr` 新增 `artifact-lifecycle` 模块（domain/application/persistence/interfaces/cli）与 CLI 注册；不改 workspace.sqlite schema（产物清单采用文件存储，规避 `workspace-structured-data-store` 的域限定）。
- 资源：`services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md` 增补产物处置指引。
- 规范：`cli-product-surface`、`agent-task-workflows`、`task-environments` 各一条增量要求。
- 兼容：无 schema 迁移；已存在的未登记目录由发现功能渐进识别，不做批量补登记。
