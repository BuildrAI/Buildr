## ADDED Requirements

### Requirement: task-manager Skill 必须作为 Task Record 的薄管理入口
Buildr MUST 交付名为 `task-manager` 的 workspace Skill，并 MUST 用精确 routing description 将它限制在 Agent 对正式 Task Record 的创建、按 Task ID 恢复、查看、更新和结束；Skill MUST 通过 selected `buildr.task-record/v1` provider 执行，不得成为全局任务 dispatcher。Local App MUST 作为同一 Task Record Application 的独立人类客户端，不通过 Skill routing 写记录。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建正式 Task、查看或修改 Task 顶层事实、按 Task ID 恢复或结束 Task
- **THEN** Agent MUST 使用 `task-manager` 并报告实际 operation、Task ID、status、canonical path 和 effects
- **AND** 后续 Environment、Development、Review、Verification、Git、Finish、Board 与 Retrospective MUST 继续由各自专业能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或 Agent 提供已有 Task ID 并要求恢复或继续
- **THEN** `task-manager` MUST 先 inspect canonical Task Record
- **AND** MUST 只从 title、intent、scope、changes、status 和 result 恢复顶层事实，不得从 Task Record 推断运行环境或专业阶段状态

#### Scenario: 人先在 Local App 创建 Task
- **WHEN** 用户在 Local App 创建 active Task，随后要求 Agent 按该 Task ID 继续
- **THEN** `task-manager` MUST inspect 同一 canonical Task Record 并核对 intent/scope
- **AND** MUST NOT 重新 create、把 Local App 记录视为低权威副本或要求用户重复输入顶层事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出修复、实现、重构、文档、测试、纯讨论或只读探索
- **THEN** `task-manager` MUST NOT 仅因出现“任务”而抢占入口
- **AND** Agent MUST 先按现有语义入口判断是否已经形成正式持久交付 Task

### Requirement: 正式执行必须先建立 Task Record
Buildr 的 `task-triage` MUST optional 依赖 `buildr.task-record/v1`，并 MUST 在已确认进入正式持久交付的分支、首次交付写入前调用 selected provider 创建或恢复 Task Record。路径已明确而无需重新 Triage 的正式执行也 MUST 遵守同一前置条件。

#### Scenario: Triage 选择已有契约实现
- **WHEN** task-triage 选择 implementation，且任务即将创建环境、分支或修改交付物
- **THEN** Agent MUST 先创建或恢复 Task Record，再进入当前 Environment provider
- **AND** Task Record provider 不 ready 或操作 blocked MUST 阻止首次交付写入，但不抹去已确认的 triage 结论

#### Scenario: Triage 选择 Change Flow
- **WHEN** task-triage 选择 change-flow 且即将创建首份 OpenSpec artifact
- **THEN** Agent MUST 先创建或恢复 Task Record
- **AND** Change 创建成功后 MUST 通过 Task Manager 将真实 `project/change` 引用加入 active Task Record

#### Scenario: 不形成正式 Task
- **WHEN** triage 选择 explore、纯只读诊断、Task 外单次操作或 metadata 写入只是已有 Task lifecycle 的一部分
- **THEN** task-triage MUST NOT 调用 Task Record create
- **AND** 其他适用的只读或专业动作 MUST 不因 Task Record capability 不 ready 而阻塞

#### Scenario: 已有 Task Record
- **WHEN** 正式执行上下文已提供 Task ID
- **THEN** Agent MUST inspect 并核对 active Task 的 intent/scope
- **AND** MUST NOT 重新 create、从 worktree 名称补造第二个 Task ID 或覆盖终态 Task

### Requirement: 人、Agent 与产品必须分担语义和确定性逻辑
通过 Agent 工作时，Agent MUST 负责理解用户意图、判断是否形成正式 Task、形成 title/intent 与选择专业能力；人也 MAY 在 Local App 中直接表达 Task 顶层事实。Task Record Application MUST 对所有客户端负责 schema、默认值、引用解析、字段变更、状态转换、系统时间、陈旧页面拒绝和文件 effects。Skill MUST NOT 要求 Agent 手写 YAML、持久 revision 协议或任意 next state。

#### Scenario: 创建与更新参数
- **WHEN** Agent 已确认要创建或修改 Task 顶层事实
- **THEN** Agent MUST 只提供命令要求的明确业务参数
- **AND** 产品 MUST 生成其余系统字段并拒绝非法组合

#### Scenario: 人通过 Local App 管理 Task
- **WHEN** 人在 Local App 创建、编辑、完成或放弃 Task
- **THEN** 页面 MUST 收集明确业务字段与终态确认，并调用同一 Application action
- **AND** MUST NOT 依赖 Agent 临场生成 YAML、校验引用、计算状态迁移或执行 filesystem 写入

#### Scenario: 专业模块返回事实
- **WHEN** Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective provider 返回结果
- **THEN** `task-manager` MUST NOT 将专业 result、path、revision 或运行状态复制到 Task Record
- **AND** 只有 title、intent、scope、Change reference 或最终 summary 真正变化时才调用相应 Task Record action

### Requirement: P0.1 必须切换 Task Record authority，但不抢占专业 authority
P0.1 实现完成、集成并投射到 retained runtime 后，新正式 Task MUST 使用 Task Record Application 与 canonical Task Record 作为顶层 Task authority；`task-manager` 与 Local App 只是两个客户端，该能力 MUST NOT 标记为 preview。当前 Environment、Verification、Finish、Board、Asset Review 与 Git 模块 MUST 继续拥有各自专业事实，直到对应模块 Change 当场完成替换。

#### Scenario: P0.1 已在 retained runtime 生效
- **WHEN** Agent 开始新的正式持久交付 Task
- **THEN** task-triage/正式执行入口 MUST 先建立 Task Record
- **AND** MUST NOT 同时创建第二份旧顶层 Task record

#### Scenario: 调用尚未替换的专业模块
- **WHEN** active Task 在 P0.2/P0.4/P0.6/P0.8/P1/P2 前调用当前 Environment、Verification、Git、Finish、Board 或 Asset Review
- **THEN** 当前 provider MUST 继续维护其专业 receipt/result/store
- **AND** Task Manager MUST 不复制、不索引、不解释这些专业数据

#### Scenario: 后续模块达到旧 authority
- **WHEN** 后续 Change 实现与现有模块事实重叠的新 authority
- **THEN** 该 Change MUST 同时迁移或保留必要历史读取、切换 consumer/routing 并删除或关闭旧 mutation path
- **AND** MUST NOT 把已知清退工作统一延迟到完整主闭环之后
