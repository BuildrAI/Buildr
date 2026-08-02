## Why

Buildr 当前只有分散在 task environment、Verification、Finish 和 Board 中的任务标识，没有一份能够跨 Agent、session 和 checkout 恢复正式 Task 意图、范围与顶层结果的权威记录。P0 后续模块都需要先共享稳定 Task identity，因此先建立宽而薄的 Task Record；同时把可稳定执行的创建、校验和状态转换固化到产品，不让 Agent 每次重新推理记录格式和合法写法。

## What Changes

- 新增正式任务（Task）与任务记录（Task Record）基础，在 canonical Workspace 的 `.buildr/tasks/<task-id>/task.yml` 保存最小身份、意图、业务范围、限定 Change 引用、顶层状态、结果与时间。
- 新增 Task Record Application 作为 `task.yml` 的唯一 mutation authority；`task-manager` Skill/CLI 是 Agent 客户端，Local App 是人的客户端。Task Manager 不是统一任务调度器，Application 与两个客户端都不拥有或记录 Task Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective 的专业事实。
- 新增产品化的 `buildr task create|inspect|update|complete|abandon` 操作。调用方提供明确参数，CLI interface 只负责参数与输出适配，Application 生成系统字段、校验引用和合法状态转换，repository 只替换其拥有的 `task.yml`；Agent 不直接编写完整 YAML，也不提交任意 next-state document。
- 在现有 Workspace 级 Local App 增加“任务”核心入口、Task 列表与详情，并允许人通过同一 Application 创建、编辑 active Task、完成或放弃 Task。Local App API 只接受已登记 `workspaceId`，复用同源/session/JSON/字段白名单边界，终态动作必须明确确认且不得冒充 Finish 或 cleanup。
- 将 v1 持久 schema 收缩为真正首版：保留 `schemaVersion`、`taskId`、`title`、`intent`、Project/Service scope、`0..N` 个 `project/change` 引用、`active / completed / abandoned`、终态结果和时间；不加入持久化 `revision`、`workspaceId`、执行者、Board/Task 关系、blocker、专业记录引用和富文本 Overview。Application/read API 额外返回不写入 `task.yml` 的 `recordDigest`，仅用于拒绝陈旧 Local App 表单覆盖新内容。
- 删除 P0.1 的跨 Task Change 唯一归属扫描、`portable / unpublished / local-only` publication 分类与 typed input schema。Change 只在当前记录内按 `project/change` 限定并去重；Task Record 禁止机器本地字段，Git publication 全部留给 P0.7。
- 更新 `task-triage`：当工作已经判断为正式持久交付 Task 时，在首次交付写入前通过 selected Task Record provider 创建或恢复 Task Record；纯讨论、只读探索和 Task 外临时操作不创建记录。
- P0.1 交付后 Task Record 即成为新正式 Task 顶层事实的当前 authority，不再作为等待 P0.8 的 preview。其他专业模块继续拥有各自现行事实，直到推进到对应模块时在同一 Change 中完成新能力、迁移/替换入口并删除不再需要的旧 mutation path。
- 明确自举激活边界：task worktree/branch 内的源码、Skill、contract 和 package 变更是候选内容，可以投射到同一 task worktree 的任务验证 Workspace 做候选验证，但不能更新 retained Workspace 或另一个 task worktree；实现完成并集成到 retained checkout 后，才从 retained 产品源码 sync/render 对应 Agent runtime 并以 doctor/专项验证确认正式生效。
- 将正式 Task、Task Record 与 Task Manager 的术语边界写入 Change Brief 和 current knowledge 影响清单，并同步维护任务生命周期 Roadmap 的逐模块交付跟踪表。

## Capabilities

### New Capabilities

- `task-record`: 定义正式 Task identity、最小 Task Record v1、canonical 路径、共享 Application、Skill/CLI 与 Local App 客户端、产品化创建/读取/更新/结束、三态结果、限定引用与失败边界。

### Modified Capabilities

- `agent-task-workflows`: 增加 `task-manager` Skill，令 `task-triage` 在正式执行分支条件消费 Task Record capability，并明确专业模块与 Task Record 的 authority 边界。
- `cli-product-surface`: 登记 `buildr task create|inspect|update|complete|abandon` 及其帮助、参数、错误和与现有 `task finish` 的边界。
- `public-json-contracts`: 登记 Task Record CLI 的公开 JSON result identity 与 checkout/npm parity。
- `buildr-package-assets`: 原子交付 `buildr.task-record/v1` contract、`task-manager` provider、`task-triage` consumer edge、binding、随包资产和防回退验证。

## Impact

- 产品实现将新增 Task Record Domain/Application/filesystem repository、CLI registry/help/runtime 接线、Local App Workspace routes/API/UI、公开 JSON schema 与专项测试；唯一实现根仍为 `projects/product/services/buildr/`。
- 随包资产将新增 `task-manager` workspace Skill 和 capability contract，并修改 `task-triage` 的条件依赖与正式 Task 交接；不改变 Environment、Verification、Finish、Board、Asset Review 或 Git 的专业数据 authority。
- Product current knowledge 将更新 Change Brief、glossary、overview、产品/技术架构、OpenSpec lifecycle flow 与 Buildr Service 说明；Roadmap 继续是非规范跟踪文档。
- 测试覆盖五个明确动作、重复 Task ID、目录占用、非法 schema/引用/状态、终态不可重开、`0/1/N` Change 引用、跨 Project 同名 Change、禁止 Environment/本机字段、写入失败时原文件与同目录专业文件保持不变、Local App 列表/详情/六项管理与陈旧表单冲突、task-triage 正式/非正式分支，以及 checkout/npm/runtime/browser 投射一致性。
- 本 Change 不迁移历史 environment receipt、Verification evidence、Task Finish run、静态 Board 或 Asset Review observation；没有旧 Task Record store 需要批量迁移。
