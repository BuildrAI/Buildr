## ADDED Requirements

### Requirement: Preparation preview必须冻结完整selected capability closure
Buildr MUST让Verification preparation preview与execution admission使用同一完整closure算法。Closed Task Environment plan request MUST保留current base Project/scope选择，并包含全部selected capability requirements的去重排序并集，而非仅包含当前missing requirements；每项辅助准备 MUST绑定capability identity、Project、selector与Recipe。Task Environment MUST继续独占Plan mutation与Recipe execution，并 MUST按identity幂等复用已current的Step结果。

#### Scenario: Product与Browser共享和扩展准备要求
- **WHEN** 同一Plan选中Product Verification与Browser capability，二者共享Buildr Web Recipe且Product另需Buildr Recipe
- **THEN** preview plan request MUST只包含一个去重的Browser requirement和一个Buildr requirement，并保留完整base scopes
- **AND** Task Environment prepare MUST一次形成两项辅助准备，不得交替替换或扩大Task scope

#### Scenario: 部分requirements已经current
- **WHEN** current Environment已准备Buildr Recipe但Buildr Web Recipe缺失
- **THEN** preview MUST仍冻结两项完整requirements与同一closure identity
- **AND** Task Environment MUST只执行缺失或漂移Step，保留current Step的幂等事实

#### Scenario: preview与run之间closure漂移
- **WHEN** declaration、capability identity、Environment Plan或Recipe identity在preview后变化
- **THEN** formal run MUST在首个execution side effect前返回preparation drift或新的action-required事实
- **AND** MUST不复用旧preview、静默安装或补造Execution Record
