## MODIFIED Requirements

### Requirement: Task Development 必须区分任务贡献与交付基线适用性

Task Development MUST是 Content Target、Candidate、Verification Result、Completion Review、decision 与研发交接（Development Handoff）是否 current/stale 的唯一 authority。Git-backed Development MUST只读观察原 Task source snapshot、Task Context、policy 与 gates；交付基线（Delivery Baseline）前进或 Task Finish 的机械应用冲突 MUST NOT自动改变这些 applicability facts。只有原 Task source/任务贡献（Task Contribution）、Task Context、policy或gate真实变化时，Development `observe`才使旧facts stale并要求重新Verification、Completion Review、handoff与新Candidate freeze。Buildr MUST NOT以路径不重叠、clean apply、resume动作或调用方boolean推断语义安全。

#### Scenario: rebase 只引入无关交付基线前进

- **WHEN** current Development handoff形成后Delivery Baseline前进，但原Task worktree/source snapshot、Task Context、policy与gates均未变化
- **THEN** Development只读inspect MUST保持Content Target、Candidate、Verification Result、Completion Review、decision与handoff current
- **AND** MUST不调用observe覆盖Content Target、不重跑formal Verification且Candidate generation不增加
- **AND** Agent MUST只在隔离Delivery Carrier处理需要的Delivery Adaptation

#### Scenario: 任务贡献或同路径基线事实变化

- **WHEN** 原Task source/Task Contribution、Task Context、policy或gate真实变化
- **THEN** Development MUST派生相应Content Target、Candidate或gate stale并阻止旧handoff继续交付
- **AND** Agent MUST在Development重新完成formal Verification、Completion Review与handoff后才能freeze新generation

#### Scenario: Finish conflict不写Development authority

- **WHEN** Finish报告`delivery-adaptation-required`或`semantic-review-required`，且Development只读inspect仍证明原Task source与全部applicability inputs未变
- **THEN** Development MUST保持全部gates与handoff current
- **AND** Finish result或Agent resume MUST NOT写Development Receipt或宣称Candidate stale

#### Scenario: 无法判断是否改变任务行为

- **WHEN** Agent无法判断Delivery Adaptation是否改变任务行为或验收目标
- **THEN** workflow MUST保持blocked且不得交付
- **AND** MUST NOT伪造复用evidence或静默调用Development observe

#### Scenario: 真实 Development 到 Finish 的适用性覆盖

- **WHEN** Product验证目标分支前进后的Candidate复用
- **THEN** 测试 MUST使用真实Task Development Application形成并只读检查current gates与handoff
- **AND** MUST覆盖clean reuse、same-path conflict adaptation、真实source drift rebuild、generation与formal Verification执行次数
