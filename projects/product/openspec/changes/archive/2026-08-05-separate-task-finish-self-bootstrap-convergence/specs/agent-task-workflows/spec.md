## ADDED Requirements

### Requirement: Task Finish 必须只按 Workspace 根 runtime source 选择 render
Task Finish MUST在交付前从冻结Task Contribution形成`none | render-runtime`计划。canonical Workspace根的Rule、Skill、Component、Command和相关runtime source变化 MUST选择`render-runtime`，其他变化 MUST选择`none`。Task Finish MUST NOT读取Project/Service activation声明、执行`buildr sync`、生成自举convergence commit或接受任意executable、args、env和shell。

#### Scenario: 用户 Workspace 开发 Skill
- **WHEN** Task Contribution修改canonical Workspace根Skill source
- **THEN** Task Finish MUST从已交付retained source执行当前Agent render与Doctor
- **AND** MUST NOT更新Builtin source、执行sync或把Agent runtime当作Git交付内容

#### Scenario: 普通代码变化
- **WHEN** Task Contribution没有命中canonical Workspace根runtime source
- **THEN** Task Finish MUST选择`none`
- **AND** MUST NOT仅因Project、Service或宽泛目录身份执行sync或render

#### Scenario: Project声明不能扩展Finish动作
- **WHEN** Project或候选内容包含Task Finish activation配置
- **THEN** 通用Task Finish MUST忽略该配置且不得获得sync资格
- **AND** Project MUST通过自身Workspace工作资产组合处理特有的交付后维护

### Requirement: Workspace 可以通过 Skill Contribution 扩展 Task Finish 后续维护
Workspace Component MAY通过通用Task Finish声明的`post-finish` Skill Contribution slot追加Workspace专属维护。Contribution MUST只在Formal Task Finish成功后由Agent执行，不得插入或改写产品固定五阶段、Formal Result、Candidate、Verification、Review、decision或Environment cleanup事实。

#### Scenario: 自举 Workspace 安装扩展
- **WHEN** Buildr自举Workspace安装同时拥有专属Skill与Contribution的Workspace Component
- **THEN** runtime MUST把Contribution组合到有效`task-finish` Skill的`post-finish` slot
- **AND** 普通用户Workspace未安装该Component时 MUST保持原Task Finish内容和行为

#### Scenario: 自举收敛未完成
- **WHEN** Formal Task Finish成功但Workspace专属自举收敛失败
- **THEN** Agent MUST报告主任务已交付且Workspace收敛未完成，并保留精确恢复现场
- **AND** MUST NOT改写或撤销Formal Task Finish Result与上游研发事实

## ADDED Requirements

### Requirement: Task Finish 必须收敛 render activation 的 Git effect 与最终远端证据
Task Finish MUST在render activation前后观察retained Git identity与status。`render-runtime` MUST禁止tracked或staged delta；`none` MUST不执行runtime mutation。两种模式的`remoteAfterRef`与`finalRemoteRef` MUST都等于carrier push后的远端回读，原Candidate、carrier、Formal Verification、Completion Review与decision MUST保持不变。

#### Scenario: render只写Agent runtime
- **WHEN** `render-runtime`成功且retained Git tracked tree没有变化
- **THEN** Task Finish MUST记录render与Doctor通过且`finalRemoteRef`等于carrier ref
- **AND** MUST继续Environment cleanup

#### Scenario: render产生tracked变化
- **WHEN** `render-runtime`后出现任一tracked或staged delta
- **THEN** Task Finish MUST blocked并报告精确路径
- **AND** MUST NOT自动暂存、提交、sync、stash、reset、rebase、merge或force push

#### Scenario: none不产生activation变化
- **WHEN** activation plan为`none`
- **THEN** Task Finish MUST只运行适用Doctor/install并保持retained tracked tree不变
- **AND** MUST以carrier远端回读作为最终交付ref

## REMOVED Requirements

### Requirement: Task Finish 必须收敛 activation 的 Git effect 与最终远端证据
**Reason**: 原Requirement把`sync-workspace`受管delta、convergence commit和push恢复作为Formal Task Finish通用责任；这些只服务当前自举Workspace，现已移到Workspace专属Skill。

**Migration**: 通用Finish使用新的render activation Requirement；自举sync在Formal Result成功后由`buildr-self-bootstrap` Component组合的Skill执行。

### Requirement: Task Finish 必须按 retained activation binding 选择生效动作
**Reason**: Project/Service binding和`sync-workspace`把Buildr自举Workspace的单一维护动作扩张成所有Workspace的通用产品契约。

**Migration**: 通用Task Finish改为只判断Workspace根runtime source并render；Buildr自举sync由当前Workspace安装的Component、Skill Contribution和专属Skill在Formal Finish成功后完成。
