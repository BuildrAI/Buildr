## MODIFIED Requirements

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
