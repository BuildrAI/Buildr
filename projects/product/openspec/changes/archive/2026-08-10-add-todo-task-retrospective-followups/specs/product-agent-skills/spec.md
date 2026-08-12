## MODIFIED Requirements

### Requirement: 产品入口 Buildr Skill 路由 Task Retrospective
产品内置 Buildr Skill MUST 在用户明确要求记录、查看或处理任务复盘时路由到 selected `buildr.task-retrospective/v2` provider，并 MUST 将复盘报告限制为 terminal Task 的 Agent 执行效率复盘；处理已有报告时 MAY 通过 Task Manager 承接后续改进。

#### Scenario: 用户明确要求任务复盘
- **WHEN** 用户要求复盘已完成或已放弃 Task 的执行效率
- **THEN** Buildr Skill MUST 引导 Agent 使用 selected Task Retrospective provider
- **AND** MUST NOT恢复过程 observation、资产候选或 lifecycle gate

#### Scenario: 用户明确要求处理已有复盘
- **WHEN** 用户要求处理 pending Retrospective Result
- **THEN** Buildr Skill MUST 路由同一 v2 provider 执行当前事实重评与 Task 承接
- **AND** MUST NOT把处理简化为只改 disposition note

#### Scenario: Runtime 找不到 provider
- **WHEN** capability graph 表示 provider 应存在但 runtime 无法发现
- **THEN** Buildr Skill MUST 引导 Agent 检查 builtin、workspace source、binding 和 runtime 投射

### Requirement: 产品入口按 current capability 路由复盘意图
产品入口 Buildr Skill MUST 将明确的 terminal Task 执行效率复盘及其后续处理路由到 `buildr.task-retrospective/v2` selected provider，并 MUST NOT 将 builtin Skill id 当作不可替换入口。

#### Scenario: 路由 Task Retrospective
- **WHEN** 用户明确要求记录、查看或处理 terminal Task 的执行效率复盘
- **THEN** Buildr Skill MUST 使用当前 capability graph 的 v2 selected provider
- **AND** Buildr Skill MUST honor blocked semantics

#### Scenario: 用户替换 provider
- **WHEN** workspace 绑定兼容的内部 v2 provider
- **THEN** Buildr Skill MUST 路由到该 provider而不要求 `task-retrospective` Skill id

## ADDED Requirements

### Requirement: Agent Skills 必须区分 todo 创建与 active 启动
Task Triage 与 Task Manager provider MUST 将 todo 创建视为仅写 Workspace SQLite 的已接受意向，将 active 创建或 todo 激活视为正式执行入口。只有后者 MUST 条件消费 Git Operations 完成创建前基线收敛；Task Manager Application 自身 MUST 保持不执行 Git。

#### Scenario: 复盘产生 todo
- **WHEN** 用户同意保留复盘改进意向但未要求立即研发
- **THEN** Agent MUST 通过 Task Manager 创建 todo 与来源关系
- **AND** MUST NOT运行 Git baseline、准备 Environment 或创建 Change

#### Scenario: 启动 todo
- **WHEN** 用户要求开始执行已有 todo
- **THEN** Task Triage MUST 先完成当前事实确认与 Git 基线收敛，再调用 activate
- **AND** 任一前置门禁 blocked 时 MUST 保持 todo 不变

### Requirement: Task Retrospective Skill 必须完成后续落地闭环
Task Retrospective provider MUST 把 inspect、当前事实重评、承接 Task 选择、来源关系写入和 disposition 更新组成一个可恢复流程。它 MUST 先向用户提供原始报告或不可变引用，且 MUST 在所有 Task 关系成功后才标记 handled。

#### Scenario: 处理待处理复盘
- **WHEN** 用户要求处理 pending retrospective
- **THEN** provider MUST 输出原文/引用、当前有效性分析、重新拆分的方向、承接 Task 与丢弃理由
- **AND** MUST 返回实际 Task IDs、关系 effects 与最终 disposition evidence

#### Scenario: 中途写入失败
- **WHEN** 任一目标 Task 创建或来源关系 mutation 失败
- **THEN** provider MUST 保持 retrospective 为 pending 并报告精确恢复动作
- **AND** MUST NOT把部分完成冒充为 handled
