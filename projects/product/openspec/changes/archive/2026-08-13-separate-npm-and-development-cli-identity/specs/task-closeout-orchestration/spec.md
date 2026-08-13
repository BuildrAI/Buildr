## MODIFIED Requirements

### Requirement: Buildr 自举收尾必须由单一确定性 runner 编排
Buildr 自举 Workspace MUST由 `buildr-self-bootstrap-sync` Skill 自身携带的单一确定性 runner 消费同一 Formal Finish run的current或terminal Result，并按固定阶段完成适用的plan、workspace sync、精确successor commit、普通push、development Buildr Web安装、retained checkout显式开发入口验证与最终Doctor或same-run resume。Runner MUST通过Product只读入口取得Finish Result与`resolvedContext`，MUST NOT依赖Buildr npm package内部Application模块。Runner源码和入口 MUST NOT进入Buildr用户npm package、`package/targets/**`或普通Workspace Skill集合。Runner MUST NOT要求调用方提交frozen paths、动作分类、成功布尔值、recovery manifest或可编辑execution capsule，MUST NOT把这些动作加入Formal Finish五阶段或普通Workspace，也 MUST NOT安装、删除或验证PATH默认development CLI。

#### Scenario: Complete Result进入自举收尾
- **WHEN** Formal Finish Result为complete且冻结Task Contribution命中至少一个self-bootstrap动作
- **THEN** Agent MUST只调用一次Skill bundled runner入口并由runner形成去重plan、执行适用阶段和返回结构化结果
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
