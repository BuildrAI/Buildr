# task-closeout-orchestration Specification

## Purpose

定义 Agent 调用 Formal Finish 的长等待语义，以及 Buildr 自举 Workspace 在 Finish 后以单一确定性 runner 完成结构化、幂等、可恢复的收尾编排。

## Requirements

### Requirement: Buildr 自举收尾必须由单一确定性 runner 编排
Buildr 自举 Workspace MUST由 `buildr-self-bootstrap-sync` Skill 自身携带的单一确定性 runner 消费同一 Formal Finish run的current或terminal Result，并按固定阶段完成适用的plan、workspace sync、精确successor commit、普通push、development CLI/Buildr Web安装与最终Doctor或same-run resume。Runner MUST通过Product只读入口取得Finish Result与`resolvedContext`，MUST NOT依赖Buildr npm package内部Application模块。Runner源码和入口 MUST NOT进入Buildr用户npm package、`package/targets/**`或普通Workspace Skill集合。Runner MUST NOT要求调用方提交frozen paths、动作分类、成功布尔值、recovery manifest或可编辑execution capsule，MUST NOT把这些动作加入Formal Finish五阶段或普通Workspace。

#### Scenario: Complete Result进入自举收尾
- **WHEN** Formal Finish Result为complete且冻结Task Contribution命中至少一个self-bootstrap动作
- **THEN** Agent MUST只调用一次Skill bundled runner入口并由runner形成去重plan、执行适用阶段和返回结构化结果
- **AND** runner MUST从同一run的Finish Result读取frozen paths、Agent、target branch、remote与final ref

#### Scenario: 普通Workspace或无匹配动作
- **WHEN** canonical Workspace没有匹配的`buildr-self-bootstrap` Component，或frozen paths没有命中任何专属动作
- **THEN** runner MUST返回`not-applicable`且不得执行sync、Git、安装、Doctor或Finish resume

#### Scenario: Buildr用户包发布
- **WHEN** Buildr npm package执行发布内容规划或dry-run
- **THEN** package内容 MUST不包含self-bootstrap closeout runner或其命令入口
- **AND** 普通用户安装Buildr或初始化Workspace时 MUST不获得`buildr-self-bootstrap-sync` Skill

### Requirement: Runner 必须保持阶段authority与部分成功事实
Runner MUST把sync、commit、push、CLI install、Buildr Web install、Doctor和Finish resume表达为独立阶段结果与effects；一次调用只负责确定性排序和交接，MUST NOT把多项结果伪装成原子transaction或写入新的Receipt、数据库、Task Record、Development、Verification、Finish Result或聚合store。任一阶段blocked时 MUST保留已经发生的effects并停止后续不安全动作。

#### Scenario: Commit成功但push失败
- **WHEN** runner已经创建合法successor commit，但普通push被拒绝或远端读回失败
- **THEN** commit阶段 MUST保持passed并报告本地history effect，push阶段 MUST为blocked并报告remote未完成
- **AND** runner MUST NOT reset、amend、force push、切换remote/ref或把整体结果报告为零effect

#### Scenario: 安装失败
- **WHEN** sync/Git阶段已经完成而development CLI或Buildr Web安装失败
- **THEN** runner MUST保留已经完成的commit/push/readback事实并停止后续依赖动作
- **AND** MUST NOT重跑Formal Finish、改写Task终态或回滚已经发布的successor commit

### Requirement: Runner 必须可从可重算事实幂等恢复
Runner MUST只根据同一Finish Result、retained Git/ref/remote、Buildr正式交付或self-bootstrap commit provenance、带current run与plan identity的successor commit、当前sync输出、installer和Doctor事实判断fresh、fresh-descendant、resume或already-complete；MUST NOT创建持久化runner state。`plan.baseRef` MUST继续绑定Finish frozen ref；动态`activationBaseRef`只有在当前HEAD等于baseRef，或baseRef到当前HEAD为无merge、每个commit均带`Buildr-Task` trailer或成对`Buildr-Finish-Run`/`Buildr-Closeout-Plan` trailer、working tree clean且remote精确等于HEAD时才能前进。当前HEAD若是本run/plan的精确successor，其parent MUST作为activation base，remote只可等于parent或HEAD。无法证明时 MUST fail closed并保留现场。

#### Scenario: 重跑复用未push的successor commit
- **WHEN** retained HEAD是当前run/plan绑定的精确successor，其parent位于Finish frozen ref的可证明Buildr-owned descendant chain上、sync重算后tree clean且remote仍为parent
- **THEN** runner MUST复用已有commit并从push阶段继续
- **AND** MUST NOT重复commit、amend或重新stage无关内容

#### Scenario: Remote已经包含successor commit
- **WHEN** 本地successor commit满足当前run/plan且远端target回读已经等于该commit
- **THEN** commit与push阶段 MUST报告幂等passed并继续适用安装与finalize
- **AND** MUST NOT再次push或创建第二个successor commit

#### Scenario: 多个已完成Finish等待激活
- **WHEN** 当前Result的frozen ref之后存在一个或多个已push的Buildr Formal Finish commit或其他self-bootstrap successor，全部形成无merge、provenance完整的first-parent chain，retained HEAD与remote精确一致且tree clean
- **THEN** runner MUST选择当前HEAD作为activation base，并按当前Result的frozen Task Contribution paths重算和执行自身去重plan
- **AND** 若sync产生delta，新successor MUST直接以该activation base为parent；后续Result MUST能把它作为可证明descendant继续顺序收敛

#### Scenario: Buildr-owned descendant无需sync commit
- **WHEN** runner在可证明descendant上执行当前Result且sync不适用或重算后没有delta
- **THEN** runner MUST不创建空successor commit，并继续适用安装、默认CLI identity与finalize
- **AND** MUST在结果中保留frozen ref与实际activation base evidence

#### Scenario: 恢复身份无法证明
- **WHEN** descendant含merge、缺少或冲突的Buildr provenance trailer、HEAD不是baseRef的ancestor后继、working tree含无法归属内容、local与remote不一致，或current run successor的run/plan trailer不匹配
- **THEN** runner MUST在Git、安装与finalize副作用前blocked并返回实际identity与唯一人工核对入口
- **AND** MUST NOT stash、reset、rebase、merge、force push、扩大owned scope或接受任意clean descendant

### Requirement: Task Finish 调用必须使用有界长等待至终态
Task Finish Skill MUST在启动canonical `buildr task finish run`后，使用宿主支持的有界长等待读取同一进程/session，直到进程完成、失败、需要输入或等待窗口到期。等待窗口 MUST只控制Agent何时恢复控制，不得作为Finish业务timeout或固定完成时限；返回仍为running时 MAY继续长等待同一session，但 MUST NOT启动第二个Finish或对普通输出进行高频轮询。

#### Scenario: Finish超过首次yield窗口
- **WHEN** canonical Finish在首次终端yield窗口结束时仍在运行
- **THEN** Agent MUST保留同一session并进行一次有界长等待
- **AND** MUST NOT把yield解释为失败或重复执行Finish

#### Scenario: 长等待后仍未终止
- **WHEN**后续长等待达到宿主上限且进程仍为running
- **THEN** Agent MAY继续等待同一session并报告当前仍在运行
- **AND**调用次数 MUST由真实等待边界决定，不得承诺固定两次或写死45/60秒产品时限

#### Scenario: 进程需要输入或已结束
- **WHEN**同一session返回input-required、completed或failed
- **THEN** Agent MUST停止无条件等待并分别处理输入边界或消费最终结果
- **AND** MUST NOT在终态后继续poll
