# task-closeout-orchestration Specification

## Purpose

定义 Agent 调用 Formal Finish 的长等待语义，以及 Buildr 自举 Workspace 在 Finish 后以单一确定性 runner 完成结构化、幂等、可恢复的收尾编排。

## Requirements

### Requirement: Buildr 自举收尾必须由单一确定性 runner 编排
Buildr 自举 Workspace MUST由 `buildr-self-bootstrap-sync` Skill 自身携带的单一确定性 runner 消费同一 Formal Finish run的current或terminal Result，并按固定阶段完成适用的plan、workspace sync、精确successor commit、普通push、development Buildr Web安装、retained checkout显式开发入口验证与最终Doctor或same-run resume。Runner MUST通过Product只读入口取得Finish Result与`resolvedContext`，MUST NOT依赖Buildr npm package内部Application模块。Runner源码和入口 MUST NOT进入Buildr用户npm package、`package/targets/**`或普通Workspace Skill集合。Runner MUST NOT要求调用方提交frozen paths、动作分类、成功布尔值、recovery manifest或可编辑execution capsule，MUST NOT把这些动作加入Formal Finish五阶段或普通Workspace，也 MUST NOT安装、删除或验证PATH默认development CLI。

#### Scenario: Complete Result进入自举收尾
- **WHEN** Formal Finish Result为complete且冻结Task Contribution命中至少一个self-bootstrap动作
- **THEN** Agent MUST启动Skill bundled runner入口并由runner形成去重plan、执行适用阶段和返回结构化结果
- **AND** 除精确foreign-carrier零副作用阻断解除后的同run一次自动重试外，Agent MUST只调用一次runner
- **AND** runner MUST从同一run的Finish Result读取frozen paths、Agent、target branch、remote与final ref

#### Scenario: 普通Workspace或无匹配动作
- **WHEN** canonical Workspace没有匹配的`buildr-self-bootstrap` Component，或frozen paths没有命中任何专属动作
- **THEN** runner MUST返回`not-applicable`且不得执行sync、Git、Buildr Web安装、开发入口验证、Doctor或Finish resume

#### Scenario: Buildr用户包发布
- **WHEN** Buildr npm package执行发布内容规划或dry-run
- **THEN** package内容 MUST不包含self-bootstrap closeout runner或其命令入口
- **AND** 普通用户安装Buildr或初始化Workspace时 MUST不获得`buildr-self-bootstrap-sync` Skill

### Requirement: Runner 必须保持阶段authority与部分成功事实
Runner MUST把sync、commit、push、Buildr Web install、development entry verification、Doctor和Finish resume表达为独立阶段结果与effects；一次调用只负责确定性排序和交接，MUST NOT把多项结果伪装成原子transaction或写入新的Receipt、数据库、Task Record、Development、Verification、Finish Result或聚合store。任一阶段blocked时 MUST保留已经发生的effects并停止后续不安全动作。

#### Scenario: Commit成功但push失败
- **WHEN** runner已经创建合法successor commit，但普通push被拒绝或远端读回失败
- **THEN** commit阶段 MUST保持passed并报告本地history effect，push阶段 MUST为blocked并报告remote未完成
- **AND** runner MUST NOT reset、amend、force push、切换remote/ref或把整体结果报告为零effect

#### Scenario: 安装失败
- **WHEN** sync/Git阶段已经完成而development Buildr Web安装失败
- **THEN** runner MUST保留已经完成的commit/push/readback事实并停止开发入口验证与finalize
- **AND** MUST NOT重跑Formal Finish、改写Task终态或回滚已经发布的successor commit

#### Scenario: 显式开发入口验证失败
- **WHEN** sync/Git与适用的Buildr Web安装已经完成，但retained `projects/product/buildr`无法启动或身份不一致
- **THEN** development entry verification阶段 MUST为blocked并保留前序effects
- **AND** runner MUST NOT回退到PATH默认`buildr`或进入最终Doctor/Finish resume

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

### Requirement: Runner 必须为并存 Finish carrier 生成 owner-ordered 恢复计划
Buildr 自举 Workspace 的 bundled self-bootstrap runner MUST在任何 sync、Git、安装、Doctor或Finish resume副作用前，只读枚举固定Finish carrier根的直接子项，并通过现有Product `task finish inspect`入口核对每个候选的owning run。目录名 MUST只作为inspect候选；runner MUST以Finish Result证明run、canonical Workspace、真实非symlink carrier路径、carrier identity、状态与matching resume identity。存在任意foreign carrier时，当前invocation MUST返回带全部observations与ordered steps的ephemeral recovery plan并保持blocked，MUST NOT忽略、删除、修改或替其他owner恢复资源，也 MUST NOT写入新的Product Application、Receipt、SQLite row、队列或聚合store。

#### Scenario: 可恢复 predecessor cleanup 阻塞当前 activation
- **WHEN** 当前doctor-blocked run的carrier之外还存在一个或多个foreign真实目录，且各自Finish Result均为`cleanup_pending`、failure与resume phase均为`cleanup`、Workspace/path/carrier identity与matching token全部可证明
- **THEN** runner MUST把每个foreign run表达为由其Task Finish owner执行且需要显式授权的`resume-owner-cleanup`步骤，按`taskId + runId`确定性排序，并在最后追加复用当前closeout既有授权的`retry-current-closeout`步骤
- **AND** 每步 MUST明确owner、授权要求、原owner command与预期cleanup/carrier/Task effects，当前runner MUST在所有predecessor消失前停止全部activation副作用

#### Scenario: predecessor 已由原 owner 清理
- **WHEN** 每个原Task Finish owner已在明确授权下完成cleanup，固定carrier根只剩当前doctor-blocked run精确拥有的carrier，且前次current invocation仅以foreign-carrier diagnostic和空effects停止
- **THEN** Agent MUST可在不追加current retry授权的情况下自动重跑一次同一bundled runner，并沿用现有单run preflight、activation、Doctor与same-run resume流程
- **AND** MUST NOT因为曾经存在foreign carrier而保存历史计划、跳过current carrier核验、改变run/command identity、扩大owned paths或形成自动重试循环

#### Scenario: 自动重试基于最新远端 dev
- **WHEN** foreign carrier 清除后的同run重试发现clean retained target branch落后于最新远端target ref，且本地HEAD到远端ref可无冲突fast-forward
- **THEN** runner MUST只以显式fetch和fast-forward更新retained branch，再对最新HEAD从头验证frozen ref、无mergeBuildr-owned descendant provenance、remote readback与run/plan identity
- **AND** 无法fast-forward、最新链含未知commit或merge、tree不clean或identity无法证明时 MUST在sync、安装与finalize前blocked，报告问题并等待新指令，不得merge commit、rebase、stash、reset或force push

#### Scenario: foreign carrier 状态不支持确定性 cleanup
- **WHEN** foreign Result为doctor-blocked、prepare/deliver blocked、terminal但目录残留或其他非`cleanup_pending`状态
- **THEN** recovery plan MUST展示可证明的owner与状态并把该条目标记为`manual-owner-review`
- **AND** runner MUST保持blocked，不得从目录时间、run名称、Git外观或当前run事实猜测跨owner恢复动作

#### Scenario: foreign carrier ownership或identity不可证明
- **WHEN** carrier条目是symlink、越出固定根、realpath重复，Product inspect失败，或Result的schema、run、Workspace、carrier path、carrier identity、resume phase/token任一缺失或不匹配
- **THEN** recovery plan MUST把该条目标记为`unprovable`并返回精确diagnostic
- **AND** runner MUST不生成resume command、不把该路径加入ignored roots，并在Git、sync、安装、Doctor、Finish resume与carrier删除零副作用状态停止

#### Scenario: 没有 foreign carrier
- **WHEN** 固定carrier根不存在，或只包含当前doctor-blocked run精确拥有且已验证的carrier
- **THEN** multi-run preflight MUST返回无predecessor且不得改变现有single-run closeout plan、阶段、effects或恢复语义

### Requirement: foreign-clear 自举重试必须有界承接同 run target-race
Buildr 自举 Workspace 的 bundled runner 在精确的 foreign-carrier 零副作用阻断解除后执行唯一同 run 重试时，若第一次 same-run Finish resume 返回 `task-finish.target-race`，MUST 使用该 Product Result 的 matching resume token 再承接一次既有 Task Finish target-race recovery。该承接 MUST只发生在本次 `--retry-after-foreign-clear true` invocation 内，MUST NOT为普通 closeout、其他 blocked Result或后续再次 target-race形成自动重试。

#### Scenario: target-race 可机械恢复并完成
- **WHEN** foreign carrier 已清除，runner 的唯一重试完成 latest target fast-forward、既有 activation 与 development entry gate，第一次 same-run resume 返回精确 `task-finish.target-race`及 matching deliver resume token，且第二次 resume 在最新 Delivery Baseline 上可机械完成
- **THEN** runner MUST把第二次 Product resume 作为同一 finalize 阶段的有界恢复并返回 passed
- **AND** runner MUST NOT复制 carrier reset、Git apply、containment或Task Finish状态机

#### Scenario: 最新 baseline 需要 Agent 适配
- **WHEN** runner 使用 target-race token 承接一次后，Task Finish 返回精确 Delivery Adaptation required、matching carrier与resume token
- **THEN** runner MUST返回专用 blocked diagnostic并保留 Product run、failure、carrier与matching resume evidence
- **AND** Agent MUST在该 carrier 内审核并执行可证明的适配，再由同一 Task Finish owner继续；Agent 无法安全处理时 MUST请求用户授权

#### Scenario: target-race 恢复不得形成循环
- **WHEN** 第二次 Product resume 再次返回 target-race、其他 blocked/failed Result，或 phase、code、carrier、resume token任一无法精确证明
- **THEN** runner MUST停止并报告实际 Result，不得自动调用第三次 resume、重跑 runner或改变恢复策略
- **AND** runner MUST NOT新增持久retry counter、队列、Receipt或聚合恢复store
