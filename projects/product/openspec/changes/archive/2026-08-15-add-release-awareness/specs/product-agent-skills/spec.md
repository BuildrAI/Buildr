## ADDED Requirements

### Requirement: 产品入口 Buildr Skill 必须主动解释 GA 与 RC 更新
产品入口 Buildr Skill MUST 在用户要求完整检查、安装状态检查或更新 Buildr 时运行 `buildr update check --json`，读取 stable/candidate 轨道，并用普通用户可理解的语言告知可用更新和请求用户选择。

#### Scenario: Agent 发现两个轨道更新
- **WHEN** `buildr update check --json` 返回 GA 或 RC 可更新
- **THEN** Agent MUST分别说明 GA 正式版与 RC 候选版
- **AND** MUST询问用户选择 stable、candidate 或暂不更新

#### Scenario: 用户选择轨道
- **WHEN** 用户明确选择 GA 或 RC
- **THEN** Agent MUST执行对应 `buildr update --track stable|candidate`
- **AND** MUST NOT替用户切换另一个轨道

#### Scenario: 版本检查不可用
- **WHEN** 结构化 Release Awareness 返回 unavailable 或 blocked
- **THEN** Agent MUST说明版本检查暂不可用
- **AND** MUST NOT把该结果解释为 Workspace Doctor 失败
