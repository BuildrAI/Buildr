## ADDED Requirements

### Requirement: Task Record 必须拥有旧 Parent Plan 的只读历史位置
Buildr MUST在Task-owned SQLite row中保存从旧Development Receipt一次性迁移的nullable `legacy_parent_plan_json`。该值 MUST仅供Parent inspect历史展示，不得提供新writer、current applicability、计划推进或完成判断。

#### Scenario: 迁移有效旧 Parent Plan
- **WHEN** migration发现Task Development current中存在有效`parentPlan`
- **THEN** MUST将相同JSON值复制到所属Task row并校验Task identity与迁移数量
- **AND** MUST保留原Development payload不变

#### Scenario: 新父任务
- **WHEN** 新父任务使用当前轻量父子管理
- **THEN** `legacy_parent_plan_json` MUST保持null
- **AND** 计划 MUST继续由Task intent引用的真实文档或当前对话维护

#### Scenario: 历史内容损坏
- **WHEN** Parent inspect无法解析旧历史值
- **THEN** MUST返回局部historical diagnostic并继续展示Task、Parent/Children和结果
- **AND** MUST NOT回退读取Development current
