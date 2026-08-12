## ADDED Requirements

### Requirement: 自举 Workspace 必须分离同步准备与发布
Buildr自举Workspace的`buildr-self-bootstrap` Component MUST在不改变通用Task Finish产品五阶段的前提下处理自身package同步。其Contribution MAY在同一Finish run已成功push/readback carrier、但retained Doctor仅因可归因的`components.update_available`阻塞时，调用专属Skill形成clean的本地sync commit；该准备阶段 MUST NOT push。只有同一run的Formal Task Finish成功后，专属Skill才 MUST发布该prepared commit并完成远端回读与最终Doctor。

#### Scenario: 精确自举更新阻塞 Finish
- **WHEN** blocked Finish Result的failure code为`task-finish.retained-doctor-failed`、全部actionable findings均为`components.update_available`、冻结Task Contribution命中声明的package inputs，且carrier push/readback已成功
- **THEN** self-bootstrap Skill MAY执行retained sync、核验受管mutation plan并只创建本地精确commit
- **AND** MUST保留远端target不变，再用产品生成的current token恢复同一Finish run

#### Scenario: Formal Finish成功后发布prepared commit
- **WHEN** 同一run随后返回成功Formal Result，且retained checkout仍clean并可证明本地prepared commit与该Result匹配
- **THEN** self-bootstrap Skill MUST通过Git Operations普通push完整范围、回读远端并运行最终Doctor
- **AND** 失败 MUST报告“主任务已交付、自举Workspace收敛未完成”，不得改写Formal Result

#### Scenario: Doctor含有其他问题
- **WHEN** Finish failure不是`retained-doctor-failed`、存在非`components.update_available` actionable finding、package inputs未命中或carrier push/readback未证明
- **THEN** self-bootstrap Skill MUST停止preparation并保留原Finish恢复动作
- **AND** 通用Task Finish MUST不知道或执行任何self-bootstrap、package path或Component更新逻辑
