## MODIFIED Requirements

### Requirement: Task Verification 必须维护一个 Task-scoped current Result
Buildr MUST 为每个正式Task提供至多一份`.buildr/tasks/<task-id>/verification.yml`，其schema MUST为`buildr.task-verification-result/v1`。Result MUST只包含Task/stable Content Target、Project declaration identities、实际执行capability facts、coverage gaps、整体结论与完成时间，并MUST可移植、可Git跟踪。Verification Result MUST NOT绑定或生成Task Candidate。

#### Scenario: 完整验证形成 current Result
- **WHEN** Agent已针对Development观察到的明确stable Content Target完成全部选择、执行和事实提炼
- **THEN** Application MUST写入该Task唯一current Result，且`target.identity` MUST等于Content Target identity
- **AND** Result MUST NOT包含Candidate/generation、stdout、stderr、临时目录、本机绝对路径、Environment Receipt、resultDigest或applicability

#### Scenario: 没有测试能力
- **WHEN** Task scope内某个目标没有可用声明或适用能力
- **THEN** Result MUST通过`coverageGaps`如实记录缺口
- **AND** Verification MUST NOT自动创建测试、脚本或capability declaration

### Requirement: Result 必须使用关闭且最小的数据模型
Result MUST绑定非空Content Target `target.identity`和可移植`target.summary`；每个declaration MUST绑定Project、相对path与当前content identity或`absent`；每个实际capability MUST绑定Project、capability identity、`passed|failed` outcome与至少一个portable fact；结论MUST只使用`passed|not-passed`。

#### Scenario: 调用方提交 lifecycle authority 字段
- **WHEN** record输入或持久Result包含Candidate identity/generation、verification policy decision、assurance level、proceed、blocked decision、Task status、revision、history、CAS、execution path或raw output字段
- **THEN** Application MUST拒绝整个值
- **AND** 原current MUST保持不变

#### Scenario: 完整失败结论
- **WHEN** 已完成的能力执行产生失败事实且整体结论已经形成
- **THEN** Agent MAY记录`not-passed` current Result
- **AND** Result MUST NOT决定是否带风险继续推进

### Requirement: Task Verification Application 必须是唯一 writer 和 reader
Task Verification Application MUST独占Result normalization、Task/Project resolution、declaration identity观察、persistence调用、Result digest与applicability派生。CLI、Skill、Local App、Development、Finish、Task Record与Task Environment MUST NOT直接读写Result store或复制其字段authority；Development MUST只消费Application inspect/declaration read model，Finish MUST不再消费Verification。

#### Scenario: CLI 记录 Result
- **WHEN** Agent调用`buildr task verification record <task-id>`
- **THEN** CLI MUST只解析输入并调用同一Application
- **AND** persistence writer与reader的静态调用方 MUST只有Task Verification Application/repository组合

#### Scenario: declaration 尚在 Task Environment
- **WHEN** 当前Content Target使用的Project declaration bytes尚未进入canonical Workspace
- **THEN** inspect/record MAY提供`--declaration-root`，但Application MUST只接受该Task当前matching ready Environment的精确根
- **AND** Result MUST只保存Workspace相对declaration path与content identity，不得保存declaration root

#### Scenario: Development检查Result
- **WHEN** Task Development准备冻结Candidate
- **THEN** Development MUST调用Task Verification Application inspect并提供current Content Target identity/declaration root
- **AND** MUST不直接读取YAML、计算Result digest或自行派生declaration applicability

#### Scenario: Local App 查看 Result
- **WHEN** 用户在Task详情查看Verification
- **THEN** Local App MUST调用同一Application的inspect read model
- **AND** 页面/API MUST NOT暴露direct Result writer

### Requirement: Applicability 必须由 target 与 declaration identities 派生
Application inspect MUST对Content Target与Task scope内全部Project declaration分别派生applicability，不得把applicability持久化。任一declaration出现、消失、内容、registry/path或validity变化 MUST使current Result stale；Content Target identity不同时 MUST stale；未提供当前target时target轴 MUST为unknown。

#### Scenario: target 与 declarations 均未变化
- **WHEN** inspect提供的Content Target identity等于Result target，且所有当前declaration observations与Result相等
- **THEN** overall applicability MUST为`current`

#### Scenario: Local App 没有当前 target identity
- **WHEN** Local App只读inspect且declarations仍current
- **THEN** overall applicability MUST为`unknown`
- **AND** Application MUST NOT从HEAD、Candidate、dirty tree、Environment或时间伪造target identity

#### Scenario: policy 内容变化
- **WHEN** 任一Project `verification.yml` bytes与Result中绑定的identity不同
- **THEN** overall applicability MUST为`stale`
- **AND** reader MUST返回可解释的declaration reason

### Requirement: Verification 不得拥有 Task 推进或其他专业 authority
Task Verification MUST NOT创建Candidate/generation、更新Task顶层状态、决定verification policy或proceed/blocked、实现缺失测试、替代Task Review/Environment/业务验收，或发布metadata。Task Development MAY根据current Result做自己的fail-closed决定，但MUST NOT回写该决定为Verification字段；Task Finish MUST不读取或补齐Verification Result。

#### Scenario: Development消费not-passed Result
- **WHEN** Task Development读取到current且`not-passed`的Result
- **THEN** Development MAY在policy事实完整时冻结Candidate，但MUST在没有精确用户风险接受时阻止proceed/handoff并形成自己的blocked decision
- **AND** Verification Result MUST保持原事实，不得新增blocked/proceed、risk、Candidate或Finish stage

#### Scenario: Finish 消费 not-passed Result
- **WHEN** 旧Finish consumer尝试读取或解释`not-passed` Verification Result
- **THEN** P0.5 runtime MUST拒绝该authority路径并返回Task Development
- **AND** Finish MUST只消费current Development handoff，不得运行Verification或决定风险
