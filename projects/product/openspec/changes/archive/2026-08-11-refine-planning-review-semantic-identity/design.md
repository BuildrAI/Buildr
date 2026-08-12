## Context

Task Review Application 只保存调用方提供的 opaque `targetIdentity` 并做纯值比较，这是正确的单 writer 边界；问题位于上游 consumer：OpenSpec workflow 没有统一的 plan target resolver，Agent 只能手工对 artifact 文件做摘要。上一次任务中，`tasks.md` checkbox 更新导致 target identity 改变，而 archive 后又由 Agent 手工保持旧 target，说明“何时改变”和“何时保持”都缺少产品级确定性。

现有 Task-scoped Change Resolver 已能从 canonical Task、matching Environment 和 logical `project/change` 引用解析 active 或 archived working copy，并按需返回 artifact 内容。新能力应复用该 authority，不扫描 cwd，不把路径、mtime 或 checklist progress 提升为计划语义。

## Goals / Non-Goals

**Goals:**

- 为关联 OpenSpec Change 的正式 Task 返回唯一、确定性、response-only planning target identity。
- identity 只绑定 Task Intent/scope 与可审查的 proposal、design、delta specs、任务文本语义。
- checkbox 状态、active/archive provenance、文件时间、Brief 和 workflow sidecar 变化不改变 identity。
- artifact 缺失、结构不支持、Task-scoped resolution 不可靠时 fail closed，不返回可复用 target。
- 返回稳定的逻辑 planning nodes，供 Task Development 保存专业 authority 引用与语义 content identity。

**Non-Goals:**

- 不修改 Task Review Result schema、SQLite 表或 applicability 比较逻辑。
- 不让 Task Development 解析 OpenSpec Markdown，也不保存语义投影正文。
- 不为任意 Project 自定义 planning artifact 建立通用 Markdown 语义引擎。
- 不新增公共 CLI、长期 cache、history、revision 或第二个 Review writer。
- 不把任务执行进度、代码实现细节或验证结果纳入 Planning Review target。

## Decisions

### 1. 新增独立的 response-only Application 与内部 driver

`Task Planning Identity Application` 读取 Task Record 和现有 Task-scoped Change Resolver，返回 `resolved|blocked` 结果。独立 driver 只为 Agent workflow 提供确定性调用入口，避免与正在演进的 `task-development-driver` 输入契约耦合。

备选方案是让 Task Review CLI 读取路径并生成 identity；这会让 Review writer 接管目标解释和 filesystem authority，破坏其纯 Result 边界，因此不采用。

### 2. 使用 closed semantic projection，而不是文件摘要串

投影包含规范化 Task Intent/scope，以及按 `project/change`、artifact kind、capability 排序的语义内容摘要。proposal、design 与 delta spec 使用规范化 Markdown；tasks 另外把 `- [ ]`、`- [x]` 统一为无状态 checkbox。投影不含 path、lifecycle、updatedAt、progress、Brief 或 sidecar。

备选方案是继续摘要完整文件但剥离路径；这仍会让 checkbox 和格式噪声触发重审，不能满足目标。

### 3. 同时返回 aggregate target 与稳定 planning nodes

aggregate identity 用于 Planning Review；每个 artifact 的 semantic identity 与 `openspec:<project>/<change>#<artifact>` 逻辑 reference 用于 Development planning nodes。归档只改变 resolver provenance，不改变 logical reference 或 content identity。

### 4. 解析不完整时 fail closed

Application 要求 Task 至少关联一个 Change，且每个 Change 都有非空 proposal、design、tasks 和至少一个 delta spec；Markdown 必须包含可识别的二级 section，tasks 必须包含任务项，spec 必须包含合法 Requirement/Scenario 结构。任一条件不成立时返回空 target 与精确 diagnostic。

备选方案是回退到 raw file digest；这会让同一 target 在 resolved/fallback 间拥有两种语义，可能错误复用旧 Result，因此不采用。

### 5. Consumer 负责在 artifact 集合稳定后调用

propose/update 阶段可以继续用 `targetIdentity: null` 登记部分 planning nodes；达到 apply-ready 后必须调用 resolver、更新 Development planning，再执行 Planning Review。apply 前和 converge/archive 后重新调用，identity 相同才复用 Review；blocked 或 identity 改变时停止并重审。

## Risks / Trade-offs

- [Markdown 规范化仍不是完整语义理解] → 只支持当前 OpenSpec 结构并用严格 section/Requirement/Scenario 检查限定可解析边界；未知结构直接 blocked。
- [纯格式变化可能仍改变 identity] → 统一换行、尾随空白、连续空行和 checkbox marker；不尝试高风险的自然语言等价判断。
- [多 Change 聚合可能增加重审范围] → 这是 Task planning target 的真实范围；按 logical key 排序保证确定性。
- [旧 Review target 无法自动迁移] → 不迁移或重写旧 Result；consumer 首次采用 resolver 时按新 identity 重新审查一次。
- [Skill 与实现漂移] → package contract 测试同时覆盖内部 driver、结果字段和所有相关 Skill 的 resolver 调用指引。

