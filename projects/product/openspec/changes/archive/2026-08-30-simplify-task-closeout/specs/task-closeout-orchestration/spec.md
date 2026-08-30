## MODIFIED Requirements

### Requirement: Buildr 自举收尾必须由单一确定性 runner 编排
本条仅约束显式采用旧收尾运行（Finish Run）的专用执行路径；默认技能收尾与直接交付后的自举 MUST NOT依赖该路径或补造其证据。

Buildr自举Workspace MUST由`buildr-self-bootstrap-sync` Skill自身携带的单一确定性runner消费matching Task delivery result与冻结Task Contribution paths，并按固定内部阶段完成适用的plan、target lease、workspace sync、精确successor commit、普通push、development Buildr Web安装、retained checkout显式开发入口验证与最终Doctor。Runner MAY消费自动Finish run或独立delivery reconciliation形成的稳定投影；MUST通过Product只读入口取得delivery与resolved context，并只通过retained Product内部driver协调target lease，MUST NOT直接import Buildr npm package内部Application模块。Runner失败 MUST形成activation attention并保留已完成effects，MUST NOT撤销Task交付终态。

#### Scenario: Complete Result进入自举收尾
- **WHEN** Task delivery result已证明Workspace repository交付且冻结Task Contribution命中至少一个self-bootstrap动作
- **THEN** Agent MUST启动Skill bundled runner并由runner形成去重plan、取得target lease、执行适用阶段和返回结构化结果
- **AND** Agent MUST只处理当前activation事实，不重复远端Task交付或修改Task terminal

#### Scenario: 激活失败
- **WHEN** sync、安装、development entry verification或Doctor任一步失败
- **THEN** runner MUST保留已有effects并返回activation attention与Agent next action
- **AND** Task delivery与completed终态 MUST保持不变

#### Scenario: 普通Workspace或无匹配动作
- **WHEN** canonical Workspace没有匹配的`buildr-self-bootstrap` Component，或frozen paths没有命中任何专属动作
- **THEN** runner MUST返回`not-applicable`且不得获取activation lease或执行sync、Git、Buildr Web安装、开发入口验证或Doctor

#### Scenario: Buildr用户包发布
- **WHEN** Buildr npm package执行发布内容规划或dry-run
- **THEN** package内容 MUST不包含self-bootstrap closeout runner、公开activation lease命令或普通Workspace可编排入口
- **AND** 普通用户安装Buildr或初始化Workspace时 MUST不获得`buildr-self-bootstrap-sync` Skill

### Requirement: Runner 必须保持阶段authority与部分成功事实
本条仅约束显式采用旧收尾运行（Finish Run）的专用执行路径；默认技能收尾与直接交付后的自举 MUST NOT依赖该路径或补造其证据。


The self-bootstrap runner MUST remain the sole owner of sync, development Buildr Web continuity, development entry validation, and final Doctor execution. It MUST NOT directly write Finish Result, Task Record, Development, Verification, Review, Environment Receipt, or aggregate-store persistence. After a successful closeout, it MAY invoke the Product-owned Finish maintenance reconciliation command with its structured result; that command remains the sole writer of Finish maintenance projection.

#### Scenario: runner 成功后交给 Product 刷新维护状态

- **WHEN** all applicable self-bootstrap stages and final Doctor pass
- **THEN** the runner MUST submit the structured closeout result to Product-owned Finish maintenance reconciliation
- **AND** the runner MUST NOT open or mutate Finish SQLite/JSON persistence itself

#### Scenario: runner 阶段失败保持 Delivery 不变

- **WHEN** any self-bootstrap stage fails
- **THEN** the runner MUST return `blocked` Activation facts with completed effects and diagnostic
- **AND** it MUST NOT convert an already delivered Task into an undelivered result

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

## ADDED Requirements

### Requirement: 自举激活必须支持无旧收尾运行的直接交付
同一自举技能（Skill）脚本 MUST支持以明确任务、基线、已交付提交、目标分支和远端为待核验输入。脚本 MUST重新核验任务与 Git，按真实变化选择同步、精确提交推送、开发应用更新、开发入口验证和最终诊断；MUST不创建虚假收尾运行。

#### Scenario: 直接交付
- **WHEN** 匹配任务已完成且 Git 证明交付提交在目标远端
- **THEN** 唯一脚本 MUST执行适用自举动作，不要求候选或交接。

#### Scenario: 输入不匹配
- **WHEN** 任务、工作空间、基线、提交、目标或远端不能证明一致
- **THEN** 脚本 MUST在相关副作用前停止并保留原交付结果。

#### Scenario: 激活局部失败
- **WHEN** 交付已成立但同步、安装或诊断失败
- **THEN** 脚本 MUST记录已发生动作并返回独立 attention，不撤销完成或重新推送业务内容。
