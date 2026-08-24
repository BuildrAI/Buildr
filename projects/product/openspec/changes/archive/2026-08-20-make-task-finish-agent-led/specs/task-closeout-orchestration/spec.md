## MODIFIED Requirements

### Requirement: Buildr 自举收尾必须由单一确定性 runner 编排
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
