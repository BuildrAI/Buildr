## ADDED Requirements

### Requirement: 测试选择必须对空执行集合失败关闭
Buildr Product MUST 在 registry `node-test` 或受管测试 glob 启动 Node test runner 前解析实际测试文件集合，并 MUST 在集合为空、路径不存在或 selector 只命中非文件时以非零状态失败；Candidate evidence MUST NOT 把零测试执行记录为 passed。

#### Scenario: Registry node-test 引用了不存在的文件
- **WHEN** Candidate、Changed 或 Focus 选择一个 `node-test` step，且其全部登记文件均不存在
- **THEN** executor MUST 在启动 Node test runner 前失败
- **AND** 诊断 MUST 标识 step identity 与未解析到测试文件

#### Scenario: 受管测试 glob 没有匹配文件
- **WHEN** package script 或 verification adapter 展开一个受管测试 glob且匹配集合为空
- **THEN** invocation MUST 以非零状态结束
- **AND** timing/evidence MUST NOT生成 passed 的零测试 primary owner

#### Scenario: 退役空测试 owner
- **WHEN** 维护者确认某个旧 step 的关键事实已经由其他 primary owners 持有且原测试集合已删除
- **THEN** registry、shard、package script、文档和 aggregate expected set MUST 一致退役该 step
- **AND** 契约测试 MUST 证明剩余 owner 集合没有覆盖缺口或重复 primary owner

### Requirement: 正式验证能力必须保持单一 required primary delivery owner
Buildr Product MUST 只把 `product.delivery` 声明为普通 Task 的 required delivery capability；release artifact 专项 MAY 保持可独立选择，但 MUST NOT 在同一普通正式 delivery execution 中自动与已经覆盖相同 registry steps 的 `product.delivery` 叠加。

#### Scenario: Release Task 形成正式验证 policy
- **WHEN** stable Content Target 包含 release metadata、package、Launcher 或 publish workflow 变化
- **THEN** policy MUST 选择 required `product.delivery` 并由 changed planner覆盖适用 release primary owners
- **AND** optional `product.release-artifact-set` MUST NOT仅因同一 applicability path 自动成为第二个 required command

#### Scenario: 独立诊断 release artifact set
- **WHEN** 维护者明确要求独立核验 release artifact set且不使用普通 delivery capability代替该专项
- **THEN** `product.release-artifact-set` MAY 被显式选择
- **AND** 其 invocation、proves、effects 与 Result fact MUST 保持独立可读

### Requirement: 版本元数据变化必须与依赖图变化分开选择
Buildr Changed planner MUST 在拥有可验证 base/current JSON 时把仅版本字段变化按 affected范围处理，并 MUST 对依赖图、scripts、engines、bundle、lockfile结构、验证拓扑、解析失败或无法取得base的 package metadata 变化保持 full-scope。

#### Scenario: 只更新 package 与 lockfile 版本字段
- **WHEN** `package.json` 只改变顶层 `version`，且 `package-lock.json` 只改变顶层 `version` 与根 package `version`
- **THEN** planner MUST 不以 full-scope owner 为由选择全部 Candidate steps
- **AND** planner MUST 继续按真实 changed paths选择 package、release与文档 primary owners

#### Scenario: 依赖或脚本同时改变
- **WHEN** package metadata 还改变 dependency graph、scripts、engines、bundle、lockfile dependency或其他字段
- **THEN** planner MUST 选择 full-scope
- **AND** plan reason MUST 指明 package metadata 包含非版本变化

#### Scenario: 显式路径没有可比较 base
- **WHEN** 调用方仅传入 `package.json` 或 `package-lock.json` path而没有可验证 base/current 内容
- **THEN** planner MUST 保守选择 full-scope

### Requirement: Candidate CI 必须最小化串行前置与无效制品依赖
Buildr Candidate CI MUST 在不合并 evidence owner 的前提下复用 preflight 与 artifact runner setup，并 MUST 只让真实 artifact consumers等待和下载候选制品；互相隔离的 Windows Workspace/Task primary owners MUST 按资源压力拆成多个有界 shard。

#### Scenario: Candidate bootstrap 成功
- **WHEN** dev→main 或手工 Candidate run 启动
- **THEN** 一个 bootstrap job MUST 在同一 checkout、Node、依赖与 Workspace Node 上先完成 `preflight-macos`再完成`artifact-macos`
- **AND** job MUST 分别上传两份 shard evidence与一个不可变 Candidate artifact

#### Scenario: Preflight 失败
- **WHEN** bootstrap 中 cheap preflight 返回非零状态
- **THEN** artifact 构建和全部下游 verification shard MUST 不启动
- **AND** stable `Candidate gate` MUST 聚合为失败

#### Scenario: Windows shard 不消费 artifact
- **WHEN** `workspace-lifecycle-windows`、`task-workflow-windows` 或 `fresh-build-windows` 启动
- **THEN** workflow MUST NOT 下载或向 runner声明 Candidate artifact目录
- **AND** `runtime-windows` 与其他真实消费者 MUST 继续使用同一 bootstrap artifact

#### Scenario: Workspace 与 Task owner 并行
- **WHEN** Candidate 在资源受限 CI profile运行 Windows Workspace/Task验证
- **THEN** Workspace lifecycle owners与Task workflow owners MUST 位于独立 runner shard并可并行
- **AND** 每个 runner内部的`workspace-saturating`容量 MUST保持一
- **AND** 两个 shard 的 primary step并集 MUST 等于旧完整 owner集合减去已正式退役的 stale owner，且不得重复

### Requirement: Candidate aggregate gate 必须保持轻量且闭合集合
Buildr Candidate aggregate gate MUST 只依赖 pinned Node、checkout 内聚合源码与下载的 closed evidence set，并 MUST NOT需要安装 Product npm dependencies；优化 MUST 保持稳定 job name、source SHA、registry identity、artifact identity、primary coverage 与结果完整性检查。

#### Scenario: 聚合完整 Candidate evidence
- **WHEN** 全部 required shard evidence已下载
- **THEN** aggregate MUST 在没有 `node_modules` 的 checkout上运行
- **AND** aggregate MUST 接受精确一次的全部 expected evidence并输出 passed closed result

#### Scenario: Evidence 缺失或重复
- **WHEN** 任一 required shard evidence缺失、重复、source SHA漂移、registry不匹配或 artifact identity冲突
- **THEN** aggregate MUST 以非零状态失败
- **AND** `Candidate gate` MUST 保持 branch protection可见的稳定失败结论
