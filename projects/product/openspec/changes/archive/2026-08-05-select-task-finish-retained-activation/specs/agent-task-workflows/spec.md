## ADDED Requirements

### Requirement: Task Finish 必须按 retained activation binding 选择生效动作
Task Finish MUST在交付前从 retained Project/Service authority 解析并冻结类型化 activation plan。`sync-workspace` MUST同时要求 retained binding 明确授权、Task scope 匹配且 Task Contribution 命中声明输入；缺少声明时 MUST NOT隐式执行 `sync`。canonical Workspace 根 Rule、Skill 等 runtime source 变化 MUST选择 `render-runtime`，其他不适用变化 MUST选择`none`。候选内容 MUST NOT为当前run新增或扩大sync授权。

#### Scenario: 用户 Workspace 开发 Skill
- **WHEN** Task Contribution只修改canonical Workspace根的Skill source且没有匹配的`sync-workspace`binding
- **THEN** Task Finish MUST选择`render-runtime`并从已交付的retained source执行当前Agent render与Doctor
- **AND** MUST NOT执行`buildr sync`、更新Builtin或把Agent runtime当作Git交付内容

#### Scenario: Buildr自举 package 输入变化
- **WHEN** retained Product Project为当前Service声明`sync-workspace`且Task Contribution命中声明的workspace package输入
- **THEN** Task Finish MUST选择`sync-workspace`并使用已经交付的retained Product CLI执行sync与Doctor
- **AND** activation plan MUST记录binding identity、匹配路径、agent与`managed-only` Git effect

#### Scenario: Product普通代码变化
- **WHEN** Task属于声明了self-bootstrap binding的Project/Service但Task Contribution未命中binding输入或canonical Workspace runtime source
- **THEN** Task Finish MUST选择`none`
- **AND** MUST NOT仅因Project名称、Service名称或宽泛路径前缀执行sync或render

#### Scenario: 候选尝试授予sync权限
- **WHEN** 当前Task新增或修改activation声明但retained baseline没有对应授权
- **THEN** Task Finish MUST按retained声明选择当前run并拒绝候选自授权
- **AND** 新声明只可在交付后供后续Task使用

### Requirement: Task Finish 必须收敛 activation 的 Git effect 与最终远端证据
Task Finish MUST在activation前后观察retained Git identity与status。`render-runtime` MUST禁止tracked delta；`sync-workspace` MUST只允许可证明为Buildr受管投射的delta，并在存在delta时形成独立convergence commit、普通push与最终远端回读。原Candidate、carrier、Formal Verification、Completion Review与decision MUST保持不变。

#### Scenario: render只写Agent runtime
- **WHEN** `render-runtime`成功且retained Git tracked tree没有变化
- **THEN** Task Finish MUST记录render与Doctor通过且`finalRemoteRef`等于carrier ref
- **AND** MUST继续Environment cleanup

#### Scenario: render产生tracked变化
- **WHEN** `render-runtime`后出现任一tracked或staged delta
- **THEN** Task Finish MUST blocked并报告精确路径
- **AND** MUST NOT自动暂存、提交、stash、reset或改为sync

#### Scenario: self-bootstrap sync产生受管变化
- **WHEN** `sync-workspace`产生全部可证明ownership的Workspace受管tracked delta
- **THEN** Task Finish MUST精确暂存这些路径并创建独立convergence commit，再普通push并回读最终远端ref
- **AND** Result MUST证明`remoteAfterRef`等于carrier、`finalRemoteRef`等于convergence commit且carrier是其祖先

#### Scenario: sync混入未知变化
- **WHEN** activation前已有无法分离的dirty/staged内容或sync后出现未知、scope外或非受管tracked delta
- **THEN** Task Finish MUST fail closed并保留现场
- **AND** MUST NOT扩大ownership、使用`git add -A`、改写carrier或声称cleanup完成

#### Scenario: convergence push暂态失败
- **WHEN** carrier已经远端交付且convergence commit已形成，但普通push或回读失败
- **THEN** Task Finish MUST保存convergence ref并返回绑定run、carrier与activation plan的exact resume token
- **AND** 恢复 MUST只在retained HEAD、remote、owned tree与记录一致时重试，不得返回Development或自动rebase、merge、force push
