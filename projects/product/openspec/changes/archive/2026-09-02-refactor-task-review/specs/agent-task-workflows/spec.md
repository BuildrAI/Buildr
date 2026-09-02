## MODIFIED Requirements

### Requirement: task-review Skill 必须作为 Task Review 语义入口
Buildr MUST交付一个`task-review` workspace Skill，并通过selected`buildr.task-review/v2`支持`planning|completion`。Agent理解Task Intent、重新观察真实subject、动态选择工具和范围并形成结论；Application只负责inspect与CAS record。

#### Scenario: 用户要求审查正式 Task 的方案
- **WHEN** 用户或Agent目标需要Planning Review并能取得真实方案identity
- **THEN** Agent MUST路由到task-review并在完整结束后可选记录Planning Result

#### Scenario: 用户要求审查完成候选
- **WHEN** 用户要求审查真实完成结果
- **THEN** Agent MUST路由到同一Skill并自行从代码、Git、文件、部署或外部系统取得subject
- **AND** MUST不要求Candidate或Development Receipt

#### Scenario: Task 外普通审查
- **WHEN** 用户只要求一次性评论且没有正式Task
- **THEN** Agent MAY返回会话内意见
- **AND** MUST不创建Task Review Result或伪subject

### Requirement: Task Development 必须区分任务贡献与交付基线适用性
Task Development MUST只维护Content Target、Candidate、Current Knowledge、decision与handoff适用性。Review与Verification独立；交付基线前进或两类Result变化 MUST不改变Development。只有原Task source/贡献、Task Context、planning或Content Target真实变化时，Development action才使对应facts stale。

#### Scenario: rebase 只引入无关交付基线前进
- **WHEN** handoff形成后Delivery Baseline前进但原Task source、Task Context与Content Target未变化
- **THEN** Development inspect MUST保持Candidate、decision与handoff current
- **AND** MUST不读取Review/Verification或增加generation

#### Scenario: 任务贡献或同路径基线事实变化
- **WHEN** 原Task source、Task Contribution、Task Context或Content Target真实变化
- **THEN** Development MUST使相应Candidate或handoff stale
- **AND** Agent按真实目标重新开发；Review与Verification仍由各自Skill独立判断

#### Scenario: Finish conflict不写Development authority
- **WHEN** Finish报告需要交付适配且Development自身inputs未变
- **THEN** Development MUST保持Candidate与handoff current
- **AND** Finish或Agent resume MUST不写Development Receipt

#### Scenario: 无法判断是否改变任务行为
- **WHEN** Agent无法判断Delivery Adaptation是否改变任务行为或验收目标
- **THEN** workflow MUST保持blocked且不得交付
- **AND** MUST不伪造复用evidence或调用Development observe

#### Scenario: 真实 Development 到 Finish 的适用性覆盖
- **WHEN** Product验证目标分支前进后的Candidate复用
- **THEN** 测试 MUST使用真实Task Development Application形成并只读检查Candidate与handoff
- **AND** MUST覆盖clean reuse、conflict adaptation、source drift与generation
