# 任务记录基础

## 一句话摘要

通过共享 Task Record Application、`task-manager`/CLI 与 Local App，为正式 Task 建立最小、可恢复且可视化管理的 Task Record；不记录任务环境或专业阶段内容，并在本模块交付后直接成为新正式 Task 的顶层事实入口。

## 背景与问题

Buildr 当前把 task identity 分散在 environment receipt、Verification、Task Finish、Board 和 Agent host task/thread 中，没有一份能够持续表达 Task 意图、范围和顶层结果的共同 authority，也没有让人在现有 Local App 中查看和管理正式 Task 的入口。后续模块如果继续各自创造 Task identity，会形成重复状态与恢复歧义；但首版也不应加入持久 revision、跨记录 ownership、publication 状态和所有专业引用。Local App 带来的陈旧页面风险只用不持久化的内容摘要处理。

## 目标与非目标

目标是在 canonical Workspace 的 `.buildr/tasks/<task-id>/task.yml` 建立宽而薄的正式 Task 记录，通过 `task-manager`、`buildr task create|inspect|update|complete|abandon` 和 Local App Task 列表/详情创建、恢复、修改和结束，并由同一 Application 固化 schema、引用校验、系统字段、陈旧页面拒绝和合法状态转换。CLI interface 只适配参数与输出，repository 只拥有精确 `task.yml`。非目标是不建设 Task Core、总调度器、数据库、锁、目录级事务、统一状态机、协同编辑或 metadata publication，也不保存或在 P0.1 页面聚合 Task Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective 的内容与引用。

## 受影响用户与角色

- 需要让一个持久交付任务跨 Agent、session 或 checkout 连续推进的维护者。
- 需要在 Local App 中查看任务整体状态，并直接创建、编辑、完成或放弃顶层 Task Record 的人。
- 负责理解用户意图、判断是否形成正式 Task、提供 title/intent 并选择专业能力的主 Agent。
- 负责为 Skill/CLI 与 Local App 统一生成默认值、校验引用、执行 mutation/终态转换、拒绝陈旧页面和安全写入的 Buildr Application。
- 后续通过同一 Task ID 维护各自 receipt/result、但不把事实写入 Task Record 的专业模块。

## 核心流程

人与 Agent 对齐持久交付意图后，task-triage 或已知正式执行入口先调用 selected `buildr.task-record/v1` provider；人也可以先在 Local App 中创建 Task。产品创建或 inspect active Task Record。后续只在 title、intent、业务 scope 或真实 Change 引用变化时执行明确 update；Task 正常完成、无变更完成或放弃时分别执行 complete/complete --no-change/abandon。Local App 使用同一 Application，终态操作要求明确确认，终态不可重开。

`task-manager` 只使用 canonical Workspace target，不读取 task environment receipt；Local App 只通过已登记 `workspaceId` 解析同一 root，不接受 filesystem path。Environment、Development、Review、Verification、Finish、Board 与 Retrospective 均按 Task ID 管理自己的事实。

## 关键变化

- Skill 名称确定为 `task-manager`；Task Record 保持数据与 capability 术语。
- Task Record Application 是唯一 writer；`task-manager`/CLI 和 Local App 分别是 Agent 与人的客户端。
- Task Record repository 只替换 `task.yml`；已有目录占用和任何专业 sibling 均 fail closed 保留，canonical Git target 按真实 worktree 拓扑判断。
- P0.1 Local App 提供“任务”核心导航、列表、详情、创建、active Task 编辑、完成和放弃；不等待 P1 Board 才首次展示 Task。
- v1 只保留 schemaVersion、Task ID、title、intent、Project/Service scope、限定 Change references、status/result 与时间。
- 不持久化 revision、recordDigest、workspaceId、executionOwner、Board/Task relations、blocker、专业 records、Overview、跨 Task Change 唯一扫描和 publication/storage 分类；`recordDigest` 只存在于 read/result model，用于拒绝陈旧页面。
- 通过 Agent 工作时由 Agent 负责语义判断，人也可在 Local App 直接表达顶层事实；产品统一负责五个动作、默认值、完整校验、状态转换和文件 effects。
- `task-triage` 在正式持久交付分支首次写入前创建或恢复 Task Record；P0.1 交付后不是 preview。
- 后续每到一个已有旧模块，就在该模块 Change 内完成迁移/替换和旧 mutation path 清退，不等待最终统一切换。
- worktree/branch 内 Skill 与产品改动只是候选；可投射到自身任务验证 Workspace，但不能写 retained/peer checkout。集成后从 retained source sync/render/doctor 才在自举主 Workspace Agent runtime 正式生效。

## 影响、风险与兼容性

主要风险是 `task-manager` 名称被误解为总调度器、Local App 陈旧页面覆盖 Agent 新写入、人过早结束 Task，以及分模块切换期间新旧能力并存。通过精确 routing/contract fixtures、响应级 `recordDigest` 冲突、终态明确确认、每类事实保持唯一 owner，并在每个模块 Change 当场关闭重叠旧 mutation path 控制。P0.1 没有旧 Task Record store，不做历史专业记录迁移或双写。

## 验收摘要

- 五个产品 action 能创建、跨 context inspect、明确更新并单向结束同一 Task Record。
- Local App 能按已登记 Workspace 展示 Task 列表/详情并执行同一 create/update/complete/abandon Application；陈旧页面被拒绝且 terminal Task 只读。
- v1 schema 只包含已确认最小字段；任何 Environment、专业、机器本地或暂缓字段均被拒绝。
- `0/1/N` 个 `project/change` 引用可解析且当前记录内无重复，不扫描其他 Task ownership。
- 没有 Environment 时可如实 `completed + no-change`，且不生成任何专业占位事实。
- task-triage 正式分支先建立 Task Record，纯讨论与只读分支不创建。
- Local App API 继续拒绝任意 target/root/path、未知字段和不可信写请求，不在 Web 层复制 YAML/状态逻辑。
- 写入失败保持原 `task.yml` 与同目录专业文件不变；有效重复、路径占用和损坏记录具有不同诊断。
- 候选 runtime/Local App 测试与 retained 激活严格分离；只有集成后 sync/render/doctor 与 bundled App 专项验证完成才算自举生效。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
