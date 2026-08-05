## ADDED Requirements

### Requirement: 产品验证必须覆盖 retained activation 选择与收敛
Buildr package、runtime parity与Task Finish executable verification MUST覆盖retained activation声明、plan选择、执行边界、Git effect与恢复证据。验证 MUST证明普通Workspace Rule/Skill任务只render、自举package任务才sync、其他任务none，并 MUST拒绝候选自授权、隐式sync、render tracked delta、未知sync delta与不完整远端证据。

#### Scenario: 校验三种activation模式
- **WHEN** verifier分别构造普通代码、Workspace Skill与明确声明的Buildr self-bootstrap package Task Contribution
- **THEN** Task Finish plan MUST分别选择`none`、`render-runtime`与`sync-workspace`
- **AND** package/static/runtime parity MUST保护声明schema、Project source、Skill guidance与Application行为一致

#### Scenario: 校验普通Workspace不会sync
- **WHEN** fixture在用户Workspace修改Skill source并让PATH/runtime具备可执行Buildr CLI
- **THEN** executable test MUST观察到render与Doctor但零sync、零Builtin source变化和零tracked delta
- **AND** Environment cleanup MUST只在activation通过后发生

#### Scenario: 校验自举convergence delivery
- **WHEN** self-bootstrap sync fixture生成确定性的受管tracked delta
- **THEN** executable test MUST观察到独立convergence commit、普通push、carrier readback、final remote readback与ancestry证据
- **AND** Candidate generation、Formal Verification execution count、Review、decision与handoff MUST保持不变

#### Scenario: 校验activation失败恢复
- **WHEN** fixture制造未声明sync、render tracked delta、sync未知delta、convergence push rejection或remote drift
- **THEN** verifier MUST断言对应fail-closed code、精确paths/evidence与exact resume边界
- **AND** MUST断言零自动stash、reset、rebase、merge、force push、scope扩大或Development rebuild
