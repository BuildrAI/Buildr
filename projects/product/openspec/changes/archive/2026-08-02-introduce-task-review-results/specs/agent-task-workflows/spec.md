## ADDED Requirements

### Requirement: task-review Skill 必须作为 Task Review 语义入口
Buildr MUST 交付一个名为 `task-review` 的 workspace Skill，并 MUST 通过 selected `buildr.task-review/v1` provider 支持 `planning|completion` 两种参数化 Review。Skill MUST 负责理解 Task Intent、动态选择实际审阅对象、形成 findings 与真实结论；产品 Application MUST 只负责确定性 Result persistence/read model。

#### Scenario: 用户要求审查正式 Task 的方案
- **WHEN** 用户、Project policy 或未来 Development 请求 Planning Review，并提供正式 Task 与明确 plan target identity
- **THEN** Agent MUST 路由到一个 `task-review` Skill，以 `reviewType: planning` 执行并在完整结束后记录 Planning Result

#### Scenario: 用户要求审查完成候选
- **WHEN** 用户、Project policy 或未来 Development 请求 Completion Review，并提供 current Candidate identity
- **THEN** Agent MUST 路由到同一个 `task-review` Skill，以 `reviewType: completion` 执行并在完整结束后记录 Completion Result

#### Scenario: Task 外普通审查
- **WHEN** 用户只要求一次性阅读或评论且没有正式 Task/target identity
- **THEN** Agent MAY 返回会话内审查意见
- **AND** MUST NOT 创建 Task Review Result、空 Task 或伪 target identity

### Requirement: Task Review 必须如实记录执行方式和覆盖边界
`task-review` MUST 如实选择 `self|independent-agent|human`，动态记录实际 reviewed、相关但 uncovered 的对象与原因、findings 和结论。Skill MUST NOT 把自审描述为独立审查，也 MUST NOT 把固定 OpenSpec artifacts、代码目录、测试命令或 review checklist 强制为所有 Task 的统一范围。

#### Scenario: 当前 Agent 自审
- **WHEN** 当前 Agent 自己执行 Review
- **THEN** Result method MUST 为 `self`，即使 Agent 使用工具或 Project evidence 也 MUST NOT 标为 independent-agent

#### Scenario: 只覆盖部分相关对象
- **WHEN** 某个相关对象因不可用、越权或明确范围限制没有被审阅
- **THEN** Skill MUST 把对象与真实原因写入 uncovered
- **AND** MUST NOT 以空列表或概括性 passed 隐藏覆盖缺口

### Requirement: P0.3 不得把两种 Review 变成默认 Task 门禁
Planning 与 Completion MUST 是两个可选 current Result 槽位。Task 创建、Task Environment ready、Task Record 更新或普通 Task inspect MUST NOT 因任一 Result 缺失而失败；是否要求某种 Review、method 或结论 MUST 留给未来 Task Development/Project policy consumer。

#### Scenario: 正式 Task 只有一种 Result
- **WHEN** Task 只有 Planning Result、只有 Completion Result或两者都没有
- **THEN** P0.3 Task Review/Task Record/Environment read path MUST 正常工作
- **AND** MUST 不写 skipped/not-applicable placeholder

#### Scenario: Review method 不满足未来政策
- **WHEN** Result target 仍 current，但未来 consumer 要求 human 或 independent-agent 而现有 method 为 self
- **THEN** consumer MUST 单独判定 gate 不满足
- **AND** Task Review MUST NOT 把 policy mismatch 持久化为 target stale

### Requirement: Task Review 与 Task Asset Review 必须保持独立 authority
`task-review` MUST 只拥有当前方案/完成目标的 Review Result；`task-asset-review` MUST 继续拥有长期资产 observation、资格审查、人工 accept/reject 和独立任务 handoff。两个 Skill MUST NOT 互写 store、互相别名或因名称相似共享 capability identity。

#### Scenario: Task 同时产生 Review Result 与资产 observation
- **WHEN** 同一正式 Task 在研发中完成 Planning/Completion Review，且另有长期资产 observation
- **THEN** 两类记录 MUST 由各自 provider 独立维护
- **AND** Task Finish 的 asset observation finalize MUST NOT 读取、替换或批准 Task Review Result
