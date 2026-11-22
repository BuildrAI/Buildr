## REMOVED Requirements

### Requirement: Buildr提供可选的功能设计技能
**Reason**: 撤下随包的独立功能设计技能。
**Migration**: 普通设计讨论不需要替代技能；已有官方副本按所有权收敛，用户内容不按名称删除。

### Requirement: 功能设计按真实问题逐步形成可评审成果
**Reason**: 撤下随包的独立功能设计技能。
**Migration**: 普通设计讨论不需要替代技能；已有官方副本按所有权收敛，用户内容不按名称删除。

## MODIFIED Requirements

### Requirement: 法则建议必须可行动且可验证
`ux-design-laws` Skill MUST 让重要建议说明具体观察、用户影响、改法和验证依据；法则和权衡仅在改变判断时展开。MUST NOT 为满足固定条数或模板栏目而重复建议。

#### Scenario: 输出界面审查结果
- **WHEN** Agent 完成界面审查
- **THEN** 结果 MUST 先说明总体结论，再按任务阻断和严重误解、高频任务效率、视觉与愉悦的顺序排列建议
- **AND** 每项 MUST 指向页面、流程或输入中的具体观察以及可验证的任务结果

#### Scenario: 缺少交互或用户行为证据
- **WHEN** 当前材料不能证明响应时间、隐藏状态或真实用户行为
- **THEN** Agent MUST 把对应判断标为待验证并说明所需证据
- **AND** Agent MUST 不把法则名称当作问题已经成立的证明
