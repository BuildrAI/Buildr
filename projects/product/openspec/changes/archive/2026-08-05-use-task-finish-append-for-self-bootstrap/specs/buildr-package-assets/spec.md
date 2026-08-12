## MODIFIED Requirements

### Requirement: 产品验证必须覆盖 Task Finish render 与自举 Workspace 组合边界
Buildr package、runtime parity与Task Finish executable verification MUST证明通用Task Finish只选择`none | render-runtime`，Workspace根runtime source任务只render且其他任务none。验证 MUST同时证明自举Component以`task-finish@append`组合Skill、Contribution、完整性和runtime结果，但 MUST NOT让通用Skill声明自举slot，或把该Workspace资产重新描述为用户Workspace默认能力或Formal Finish product hook。

#### Scenario: 校验通用两种activation模式
- **WHEN** verifier分别构造普通代码与Workspace根Skill Task Contribution
- **THEN** Task Finish plan MUST分别选择`none`与`render-runtime`
- **AND** package/static/runtime parity MUST拒绝Project activation declaration、`sync-workspace`和通用sync执行分支

#### Scenario: 校验普通Workspace不会sync
- **WHEN** fixture在用户Workspace修改Skill source并让runtime具备可执行Buildr CLI
- **THEN** executable test MUST观察到render与Doctor但零sync、零Builtin source变化和零tracked delta
- **AND** Environment cleanup MUST只在render通过后发生

#### Scenario: 校验自举Component组合
- **WHEN** 当前Buildr Workspace安装`buildr-self-bootstrap` Component并render当前Agent runtime
- **THEN** Component check MUST证明专属Skill和Contribution完整，且有效`task-finish`末尾包含append片段
- **AND** 未安装该Component的临时用户Workspace MUST不包含自举Skill、片段或通用自举slot

#### Scenario: 校验render失败边界
- **WHEN** fixture制造render tracked delta或Doctor失败
- **THEN** verifier MUST断言对应fail-closed code与精确paths/evidence
- **AND** MUST断言零自动sync、暂存、提交、stash、reset、rebase、merge、force push或Development rebuild
