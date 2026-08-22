## MODIFIED Requirements

### Requirement: Agent必须按标准Parent启动流程推进到Child之前
Buildr内置Task workflow Skills MUST将新Parent从Git基线推进到Child前的顺序固定为：激活前Git门禁、Parent activate、matching Environment、Development begin、Parent Plan record、Planning Review、Parent planning refresh与启动就绪回读。用户目标包含创建、准备、拆分Parent或准备到可启动Child，且active Parent Task Record创建成功后，`task-manager` MUST自动交接`task-development`；`task-development` MUST持续消费current `buildr task next`和Parent Coordination事实，调用每个typed next的专业owner，直到`start-child-contribution`或遇到真实blocker。Skills MUST在启动就绪后停止Parent普通实现推进，等待用户选择eligible Contribution；MUST NOT把Task Record创建成功本身报告为Parent已准备好。

#### Scenario: active Parent创建后自动交接
- **WHEN** 用户明确要求创建并准备Parent，且`task-manager`成功创建active Task Record
- **THEN** `task-manager` MUST保留Task Record单一writer边界，并把Task ID、canonical Workspace、scope与已知Parent规划输入交接给`task-development`
- **AND** Agent MUST继续当前工作，不得仅报告Task Record已创建或要求用户再次发出准备指令

#### Scenario: 已知信息足以形成Parent Plan
- **WHEN** 用户已提供可明确写入的Parent outcome、architecture decisions、Contribution Map、dependencies、boundaries与final acceptance
- **THEN** `task-development` MUST在Environment与Development current后记录完整Parent Plan，并继续完成current Planning Review与planning refresh
- **AND** MUST不重复询问已知事实、创建占位Contribution或把Child状态与实现清单写入Parent Plan

#### Scenario: Parent准备循环消费typed next
- **WHEN** Parent准备尚未到达Child前停止点，且`buildr task next`返回`prepare`、`begin`、`planning-review`或`refresh-parent-planning`
- **THEN** Agent MUST调用该next指定的专业owner并在成功后重新读取current next
- **AND** MUST不跨owner直接写Receipt、Review Result或Parent progress authority

#### Scenario: 只有真实blocker才中断默认准备
- **WHEN** 当前步骤缺少会改变Parent outcome、Contribution切分、依赖、边界或final acceptance的必要事实，或owner返回blocked并需要用户业务决定或新授权
- **THEN** Agent MUST停止对应写入并报告最小blocker与唯一下一步
- **AND** 普通recommended动作、可恢复内部登记缺口或已知信息不得被升级为要求用户重新发起准备的blocker

#### Scenario: coordination-only Parent启动
- **WHEN** Parent只承担协调且当前不修改、构建或测试交付内容
- **THEN** Agent MUST仍准备matching shared Environment，并可对完整Project/Service scope提交有理由的Preparation `not-applicable`
- **AND** MUST不因此创建独立worktree、执行不需要的依赖安装或跳过Environment authority

#### Scenario: Parent到达Child前停止点
- **WHEN** Parent Plan、Planning Review和Development planning gate current且启动投影返回`start-child-contribution`与至少一个eligible Contribution
- **THEN** Agent MUST报告Parent已准备好、展示可选择的eligible Contributions，并停止`observe`、Verification、Candidate和Finish
- **AND** 后续Child必须由用户选择Contribution后按独立Task流程启动，Agent MUST NOT自动创建第一个Child
