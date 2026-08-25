# project-test-capabilities Specification

## Purpose
定义 Project 可选测试能力声明的模型、成熟度、执行阶段、门禁强度、授权边界与验证证据要求，使团队能逐步发现、试运行并确认稳定门禁，同时保持未声明项目的零配置兼容。
## Requirements

### Requirement: Invocation 必须引用既有且有界的验证操作
`invocation.kind` MUST 为 `command|agent`。command MUST 提供非空 argv 与不逃逸 Project root 的 cwd；agent MUST 提供非空、可移植的 bounded instructions。Buildr MUST 只引用已有命令、脚本、CI 对应本地入口或 Agent 操作，不得把 declaration 当作测试实现，也不得为所有capability隐式注入Node runtime。

#### Scenario: command invocation
- **WHEN** capability 使用 `kind: command`
- **THEN** runner MUST 从 Project root 解析 cwd 并按声明argv与当前受控执行环境启动命令
- **AND** cwd 逃逸、不存在或首个executable不可解析时 MUST 在启动前失败
- **AND** failure MUST只归属于该capability execution，不得把Workspace标记为不健康

#### Scenario: bounded Agent invocation
- **WHEN** capability 使用 `kind: agent`
- **THEN** instructions MUST 明确有限操作与完成事实
- **AND** command runner MUST 不尝试自动执行该 capability

### Requirement: 环境、副作用和资源只按真实边界声明
capability MAY 声明运行所需环境、预期 writes、external systems、authorization 与 resource claims。resource catalog MUST 只允许当前 Project 实际使用的 coordinated 或 external boundary；external action MUST 要求显式 authorization。

#### Scenario: coordinated browser capacity
- **WHEN** 浏览器 capability 声明并请求容量有限的 coordinated resource
- **THEN** execution runner MUST 在命令启动前取得 claim 并在完成后精确释放

#### Scenario: 未被引用的资源
- **WHEN** resource catalog entry 没有任何 capability claim
- **THEN** doctor MUST 报告无效或冗余声明
- **AND** Product declaration MUST 删除该 entry，而不是把资源平台当作未来占位

### Requirement: Capability 声明指导必须核对真实测试边界
Task Verification 的声明指导 MUST 读取真实 Project / Service 测试、package 或 POM scripts、CI 和项目约定，并核对 invocation、scope、环境、副作用及可用的实际成本证据。指导 MUST NOT 根据 capability id、`fast`、`unit`、目录名或技术栈惯例推断执行成本和证明范围。

#### Scenario: 名称为 fast 的重型入口
- **WHEN** 现有入口名为 `fast`，但真实调用包含大量子进程、完整 Workspace 或端到端环境
- **THEN** 声明指导 MUST 如实识别其执行边界与成本风险
- **AND** MUST NOT 仅按名称把它推荐为高频低成本能力

### Requirement: Declaration 必须只暴露稳定能力接口
Task Verification 的声明指导 MUST 将 `verification.yml` 限定为少量、稳定、可独立选择的 Project / Service Test Capability Family，不得复制每个测试文件、内部 registry step 或 Project Testing 分类卡。具体测试、Tag、Suite、dependency graph、编排场景与成本数据 MUST 保留在 Project 自身测试源码、构建配置或高级 provider registry；v3 只声明 evidence、target、discovery、affected/full入口及执行边界。

#### Scenario: Candidate 内部包含多个 step
- **WHEN** 一个稳定 Candidate provider 内部编排多个测试 step
- **THEN** declaration MAY 只声明该稳定能力族与provider入口
- **AND** MUST NOT 因内部 step 数量创建等量 capability 或通用 DAG 字段

#### Scenario: 项目缺少适用测试
- **WHEN** 声明审查发现目标事实没有现有测试入口
- **THEN** Task Verification MUST 报告 coverage gap
- **AND** 测试建设 MUST 作为 Project Testing 或后续实现工作处理，不得在声明更新中暗中生成测试

### Requirement: Verification capability 必须显式声明准备依赖
Project Verification capability MAY在既有environment边界中引用同一Project `preparation.yml`的一个或多个Recipe。每个引用 MUST绑定Project、Project-wide或已登记Service scope与Recipe id，并进入v3 declaration identity；Buildr MUST NOT从discovery、invocation、capability id、目录或技术栈推断准备Recipe。

#### Scenario: Browser capability引用辅助Service Recipe
- **WHEN** `product.browser-smoke`引用`service:product/buildr-web`的`buildr-web.npm-ci`
- **THEN** declaration parser MUST验证Project、Service与Recipe当前存在且scope匹配
- **AND** 该引用 MUST只表达执行准备，不得把`buildr-web`加入Task scope、Change scope或交付内容

#### Scenario: Capability没有准备引用
- **WHEN** v3 capability未声明任何preparation reference
- **THEN** declaration MUST有效且该capability的准备集合为空
- **AND** Buildr MUST不扫描Project猜测隐含依赖

#### Scenario: 引用越界或缺失Recipe
- **WHEN** capability引用其他Project、未登记Service或当前声明不存在的Recipe
- **THEN** Doctor与Verification admission MUST在执行前返回精确invalid或preparation gap
- **AND** MUST不自动改写`verification.yml`、`preparation.yml`或Task scope

### Requirement: Capability准备引用不得形成测试DAG
Capability preparation references MUST只形成“该capability执行前所需Recipe current”的平面集合，MUST NOT表达capability间`dependsOn`、执行顺序、supersedes、scheduler或Candidate阶段。

#### Scenario: 多个capability引用同一Recipe
- **WHEN** 两个selected capabilities引用同一Project、scope与Recipe identity
- **THEN** admission MUST按identity去重为一个准备要求
- **AND** MUST不据此创建capability依赖边或改变两者的执行顺序

### Requirement: Project v3 必须声明稳定 Test Capability Families

已登记 Project SHOULD在根目录提供 closed `buildr.project-verification/v3` `verification.yml`。每项 v3 capability MUST具有唯一 id、Project/Service scope、非空 proves、非空 evidence、非空 usable targets、可信 discovery sources、full invocation 与可选 affected invocation。过渡 runtime MAY只读接受closed v2 declaration以完成Buildr self-bootstrap，但 MUST将它标记为待迁移输入，不得把它作为新声明作者模型。

#### Scenario: v2 声明进入 v3-only runtime

- **WHEN** retained/self-bootstrap过渡期读取合法 `buildr.project-verification/v2`
- **THEN** MUST严格校验旧closed shape并规范化为Plan输入
- **AND** MUST只把`requiredForDelivery: true`映射为`task-delivery`
- **AND** MUST把单一invocation作为full入口，不得虚构affected入口
- **AND** MUST以`legacy-declared`保留未知evidence边界并给出迁移notice

#### Scenario: 声明普通能力族

- **WHEN** Project 声明一个覆盖 Service unit 与 component evidence 的v3能力族
- **THEN** schema MUST校验scope、proves、evidence、usableFor、discovery与invocation
- **AND** 具体测试类、Tag和suite membership MUST继续由测试源码或构建配置持有

#### Scenario: v2 尝试获得新目标语义

- **WHEN** v2 capability请求`product-candidate`或`published-release`
- **THEN** MUST不自动选择该capability并形成明确coverage gap

### Requirement: Capability invocation 必须区分 affected、full 与高级 provider
每项 capability MUST提供可执行 full 入口，并 MAY提供可信 affected 入口；入口 kind MUST为 `command|agent|provider`。command/agent MUST保持既有有界执行约束；provider MUST引用Task Environment中可解析的稳定 adapter，并只接受/返回 closed Request、Plan 与 execution facts。

#### Scenario: 没有 affected 入口
- **WHEN** Task Delivery 请求 affected 但 selected capability只声明full入口
- **THEN** planner MUST选择full入口并记录稳定full reason
- **AND** MUST NOT把full命令伪装成affected或静默跳过

#### Scenario: 高级 provider
- **WHEN** capability使用provider入口
- **THEN** planner MUST通过注册adapter取得统一Plan与execution units
- **AND** provider内部registry、DAG、Context与scheduler字段 MUST NOT进入通用declaration或公开Plan

### Requirement: Doctor 必须只读校验 v3 declaration

Project没有`verification.yml`时Doctor MUST零finding；文件存在时 MUST只读校验closed v3 schema，或在有界过渡期严格校验closed v2 schema并返回非阻塞migration notice。无效声明 MUST在执行前阻塞，Doctor不得运行测试或改写声明。

#### Scenario: 合法过渡 v2 declaration

- **WHEN** v2 declaration满足旧closed schema
- **THEN** Doctor MUST报告declaration有效
- **AND** MUST返回指向v3迁移和已登记删除Contribution的notice

#### Scenario: 非法 v2 declaration

- **WHEN** v2 declaration字段、scope、invocation、resource或preparation引用非法
- **THEN** Doctor MUST返回blocking closed-schema finding

#### Scenario: v3 declaration 有效

- **WHEN** 已登记Project提供有效v3 declaration
- **THEN** Doctor MUST报告valid、path与实际capabilityCount
- **AND** declaration bytes MUST保持不变

#### Scenario: 声明含未知或v2字段

- **WHEN** v3 declaration包含`applicability`、`requiredForDelivery`或其他不属于v3的字段
- **THEN** Doctor MUST返回精确closed-schema finding与迁移指引
- **AND** MUST NOT忽略字段后继续执行
