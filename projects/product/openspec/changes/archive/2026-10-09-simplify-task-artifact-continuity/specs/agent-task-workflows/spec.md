## ADDED Requirements

### Requirement: 原型到正式开发必须接续同一隔离位置

同一目标从已授权原型（Prototype）进入正式开发时，任务分流（Task Triage）MUST 核对并复用已有源码工作树（Worktree）、分支（Branch）和稳定隔离标识，MUST 保留未提交成果及确认版来源，MUST NOT 仅因阶段转换新建另一套位置。任务管理 MUST 在尚无正式任务且已有同目标隔离标识时核验后沿用该标识登记；已有匹配任务 MUST 继续使用原任务。工作树提供者 MUST 使用现有 inspect 核验归属，身份冲突 MUST 保留现场。正式任务正文 MUST 继续位于主工作空间数据库，不随隔离位置搬移。

#### Scenario: 原型先于正式任务形成源码位置
- **WHEN** 用户确认按已有原型实施，原型源码已有可核验的独占工作树（Worktree），且尚无匹配正式任务
- **THEN** 智能体（Agent）MUST 以已核对的隔离标识登记正式任务并复用该路径和分支（Branch）
- **AND** MUST 保留原型源码和未提交修改，不另建实施隔离或补造过去任务历史

#### Scenario: 已有正式任务进入开发
- **WHEN** 正式任务已在同一位置制作原型并获得实施授权
- **THEN** 智能体（Agent）MUST 接续该任务与位置，不因阶段或轮次变化重复创建

#### Scenario: 原型只有临时页面
- **WHEN** 原型没有源码检出位置，仅有独立临时 HTML
- **THEN** 智能体（Agent）MUST 按正常任务隔离策略创建开发位置并保全原型，不为页面回溯补造旧工作树（Worktree）

#### Scenario: 原型位置归属冲突
- **WHEN** 既有隔离标识、工作树（Worktree）或分支（Branch）无法证明属于当前同一目标
- **THEN** 智能体（Agent）MUST 保留现场，只停止依赖该位置的写入，MUST NOT 另建副本或覆盖登记绕过冲突
