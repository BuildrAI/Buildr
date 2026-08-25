# Workspace 测试能力与任务验证目标架构

> Implemented architecture. 本文解释已经交付并由 canonical specs、Skills 和 runtime 实现的 Workspace 测试验证架构；规范性行为仍以 OpenSpec specs 和对应能力契约为准。Buildr Product 已采用v3，外部Workspace按各自发布与迁移节奏采用。

## 目标

Buildr 帮助 Agent 完成三件事：为 Project / Service 建设有用测试，发现并声明已有测试能力，以及针对具体任务正确选择、执行和记录验证。

一句话模型：

> 测试能力说明“能证明什么、怎么证明”；Verification Plan 说明“这次证明哪个目标、选择多少”；Verification Result 只记录实际执行事实和结论。

## 三个正交问题

| 问题 | 取值 | 含义 |
|---|---|---|
| 验证目标：这次证明什么？ | Task Delivery、Product Artifact Candidate、Published Release | 被验证对象与支持的交付决定 |
| 选择范围：需要证明多少？ | affected、full | 本次选择相关证据还是完整证据 |
| 验证证据：用什么证明？ | Static、Unit、Component、Integration、System | 实际穿过的执行边界 |

Agent 按“目标 → 范围 → 证据”形成计划。Quick 只表示开发期低成本反馈，focus 只用于诊断；两者都不冒充正式 Task Verification。

## 核心对象

```text
Test Capability Family
→ Verification Request
→ Verification Plan
→ Execution Record
→ Verification Result
```

- **测试能力族（Test Capability Family）**：Project / Service 长期具备的稳定证明入口，以及发现具体测试所需的有界事实。它不是测试类清单。
- **验证请求（Verification Request）**：本次冻结目标、交付决定、changed paths 和明确风险输入。
- **验证计划（Verification Plan）**：本次 selected capabilities、具体测试或 suite、直接触发、依赖扩张、full reason 与 coverage gap。
- **执行记录（Execution Record）**：实际运行过程、输出、耗时、资源和清理事实。
- **验证结果（Verification Result）**：从 matching execution authority 提炼的可移植事实和结论。

## Agent 与模块职责

| Owner | 职责 | 不负责 |
|---|---|---|
| `project-testing` | 从待证明事实建设测试；选择 Static/Unit/Component/Integration/System；建立可发现的 module、Tag、Suite、命名和稳定入口 | 正式声明写入、Verification Result |
| `declaration-intake` | 只读发现真实测试、scripts、CI 和构建配置；展示能力候选或精确 diff；取得长期写入授权 | 开发测试、执行正式验证、持有统一 store |
| 声明 owner | 把已确认的稳定能力族写入 `verification.yml` 并验证 schema | 一次性测试选择、Task Result |
| `task-verification` | 确定目标，选择 affected/full，形成可解释计划，调用 Runner，并从 Execution Record 对账 Result | 开发缺失测试、决定风险接受或 Task 完成 |
| Runner / Application | 环境 admission、授权、资源、执行、去重、记录、清理和 Result 原子写入 | 测试语义设计和选择判断 |

Task Verification 发现没有可信能力时只报告 coverage gap，并交回 `project-testing` 与 `declaration-intake`；不得在正式 Verification 阶段临时生成测试或静默扩大声明。

## `verification.yml` 的目标定位

`verification.yml` 是 Project / Service 已有测试能力族的权威目录，不是测试文件索引、通用 DAG、Task Plan、Candidate 定义或 Result。

每项能力族只需表达：

- 稳定 identity 与 Project / Service scope；
- 能证明的公共结果；
- 支持的证据边界和验证目标；
- 发现具体测试的可信来源；
- affected 与 full 的可执行入口或 provider contract；
- 环境、副作用、授权和资源边界。

目标形态示意：

```yaml
schemaVersion: buildr.project-verification/v3

capabilities:
  - id: freshx-pigs.tests
    scope:
      project: freshx
      services: [freshx-pigs]
    evidence: [unit, component, integration]
    proves:
      - FreshX 生猪业务逻辑与服务契约
    usableFor: [task-delivery]
    discovery:
      sources: [pom.xml, "**/src/test/**"]
    invocation:
      full:
        kind: command
        argv: [mvnd, -Punit-tests, test]
        cwd: .
```

该示例展示当前closed v3的核心字段；完整字段和约束以`task-verification`随包reference/template为准。具体测试仍由源码、构建配置、JUnit metadata、Tag、Suite 或项目自有 registry 持有。

第一版继续以 Project 根 `verification.yml` 为兼容入口，并允许 capability 使用 Service scope；是否增加 Service 物理分文件由实现 Change 根据复杂度和迁移证据决定，不在目标文档提前制造第二套声明发现规则。

## 能力发现与选择

普通 Workspace 不需要先建设自定义 planner。Agent 或通用 provider 从以下事实形成计划：

- Task Intent、验收标准和冻结 changed paths；
- Project / Service / module ownership；
- Maven、Gradle、npm 等构建图和现有 test scripts；
- 测试对生产代码与公共契约的引用；
- JUnit Tag、Suite、package、测试约定和显式 evidence owner；
- capability 的 proves、目标适用性、环境和副作用。

每个 selected item 必须说明由什么变化触发、证明什么、为什么需要该执行边界，以及是否由依赖闭包带入。不能可信收窄时，低成本 Unit 可以扩大到完整 module；关键输入、未知 owner 或选择机制变化必须扩大到 full 或形成 coverage gap，不能 fail-open。

复杂 Project 可以声明项目自有 plan/run provider。它可以内部维护 registry、ownership、dependency closure 或 DAG，但只向通用框架返回统一的 Verification Plan 与执行事实；这些内部结构不进入所有 Workspace 的默认 schema。

## 三类验证目标

| 目标 | 默认范围 | 对象 | 证据要求 |
|---|---|---|---|
| Task Delivery | affected | frozen Task Content | 受影响的日常开发证据；高风险时显式 full |
| Product Artifact Candidate | full | exact source + candidate artifact | 完整日常证据，加 package、install、compatibility 等制品证据 |
| Published Release | release-only | published artifact / result | publish、install、launcher、smoke、readback 等发布结果证据 |

Candidate 与 Release-only 证据不能为简化日常验证而下放到普通 Task；日常测试通过也不能冒充发布成功。

## 唯一 authority

```text
测试源码与构建配置  → 具体测试事实
verification.yml    → 稳定测试能力族
Verification Plan   → 本次选择与理由
Execution Record    → 实际执行过程
Verification Result → 正式事实与结论
```

任何层都不复制相邻层的完整内容。尤其不能把所有测试写入声明、把 plan preview 当执行证据、把 stdout/stderr 塞进 Result，或让 Product 自身 registry 成为通用 Workspace authority。

## 真实试点验证

首轮架构工作先验证模型能否解释真实项目事实；后续实现已经交付v3 schema、planner、provider、runner和Execution Record/Result对账。外部试点仍以只读事实矩阵保留，迁移必须由各Workspace自己的正式authority执行：

```text
真实测试与构建事实
→ 能力族及其 owner
→ Verification Request
→ Verification Plan 的直接选择、依赖扩张、full reason 或 coverage gap
→ 现有 Execution Record / Result authority
```

模型通过试点必须同时满足：

1. 每项事实只落入一个主要 authority，不把具体测试、一次性 Plan 或执行日志复制进声明；
2. 每个 selected item 都能说明直接变化、依赖扩张或 full 的理由；
3. 没有适用能力或 owner 不可信时形成 coverage gap，不把 build、lint 或未知测试冒充通过；
4. Task Delivery、Product Artifact Candidate 与 Published Release 的对象和结论不混用；
5. 普通 Project 不需要采用 Buildr Product 的 registry、DAG 或 Context Runtime；
6. 现有 v2 capability 只经封闭legacy adapter读取、诊断并按full Task Delivery执行；它不获得affected、Candidate、Release或高级provider语义。新声明只使用v3，runtime不要求删除v2 reader。

### 试点事实矩阵

以下事实观察于 2026-08-24。集鲜来源均为其 Workspace 中的 Project 声明、Service registry 和对应 Service 构建配置；Buildr 来源均为当前 Product checkout。它们是架构输入，不是本 Task 产生的 Verification Result。

| 证据范围 | Source identity | 主要读取入口 |
|---|---|---|
| 集鲜 Workspace | `83bf135f` | `projects/{pig,freshx,foundation}/verification.yml`、Project/Service registry |
| 集鲜 Pig 前端 | customer `52697cb3`；platform `bf5155a5`；小程序 `392c9cb7` | 各 Service `package.json` scripts |
| 集鲜 FreshX / Foundation 后端 | pigs `d9ae2442`；nm `227c4632`；base `3ed4134c`；business-common `13ce8721` | Maven POM、测试源码与 Project verification declaration |
| Buildr Product | `bddcebb0` 加本 Task tree | `verification.yml`、`test/verification/registry.mjs`、changed/full/Candidate runner 与现有 Task authority |

| 试点 | 当前真实事实 | 代表性请求与目标 Plan | 结论与实现缺口 |
|---|---|---|---|
| 集鲜 Pig | `projects/pig/verification.yml` 只声明 Project-scoped `pig-openspec.strict`；三个前端 Service 的 `package.json` 有 eslint、stylelint 和多环境 build scripts，但没有测试 script，也没有对应 capability | Pig spec 变化直接选择 strict capability；前端实现变化只能报告“存在可发现的 static/build 候选，但当前无已确认测试能力”的 coverage gap | 模型能区分“可发现入口”和“已声明能力”，不会从 script 名称伪造测试。后续 Intake 可提出候选，是否声明及其 evidence boundary 仍需确认 |
| 集鲜 FreshX | `verification.yml` 已声明 `freshx-nm` 的 unit/build，以及 `freshx-pigs` 的 logistics/evaluation 聚焦 unit 与 build；Maven profile、具体测试名和 path 条件仍由真实构建配置持有 | FreshX 单 Service 变化按 path 与 proves 选择聚焦能力；无法命中可信 owner 的路径不能静默跳过，必须扩大到模块级 full 入口或形成 gap | 能力族可以包住稳定入口而不索引全部测试。当前 v2 未一等表达 evidence boundary、目标适用性、affected/full 和选择理由 |
| 集鲜 Foundation | `verification.yml` 已声明 `base` onboarding 与 `business-common` logistics/evaluation 能力；`freshx-pigs` 真实依赖 Foundation 的 `saas-common-api` | Foundation API 与 FreshX consumer 同时变化时，Request 合并两个 Project/Service scope；Plan 分别选择 Foundation owner 与 FreshX consumer evidence，并把后者标为依赖扩张 | 跨 Project 组合不需要复制 capability，但通用 planner 必须消费 Service/module ownership 或显式依赖事实；当前 path-only applicability 不足以独立证明依赖闭包 |
| Buildr 自举 Workspace与普通声明入口 | Product 根 `verification.yml` 已采用v3 `product.verification`高级provider与独立Browser能力；Quick仍只属于开发反馈；正式Task继续由Task、Environment、Development、Execution Record和Result authority分别管理 | 普通Task以frozen Content和changed paths请求affected；关键planner/ownership变化显式升级full；Candidate选择exact source与artifact evidence；自举激活和最终Doctor不回写为Task Verification通过 | Product live声明证明v3可用于真实高级Project，同时没有创建自举专用的第二套Verification authority |
| Buildr Product 高级 provider | `test/verification/registry.mjs` 内部维护 step identity、inputs、profiles/groups、真实 `dependsOn`、资源和并发约束；changed、daily-full、Candidate 与 release focus 复用该内部事实 | 通用 Request 交给 Product provider 后，provider 返回统一 Plan：selected step、直接/依赖/full reason、资源需求和目标；Candidate tarball 依赖仍留在内部 DAG。Release contract focus 不执行真实 publish，不能产生 Published Release 结论 | 高级 provider 可保留，不应把 registry/DAG 字段推广到通用 `verification.yml`。通用 contract 只约束输入、Plan 输出与 matching execution facts |

### 代表性演算

#### 1. 无适用测试不是空计划通过

Pig 前端变化可以从 `package.json` 发现 lint 与 build，但当前声明没有确认它们能证明什么，也没有测试入口。Declaration Intake 可以返回候选和精确差异；Task Verification 只能记录 coverage gap。只有后续由 `project-testing` 建设可信测试、再由声明 owner 确认稳定能力后，计划才能选择它。该反例证明“发现”和“声明”必须分离。

#### 2. 跨 Project 变化按 owner 组合

Foundation 的 `business-common` 拥有通用评价 API 与实现，FreshX 的 `freshx-pigs` 消费该 API 并拥有生猪订单评价行为。若同一 Task 同时改变两侧，Plan 不创建“Pig 评价总测试”副本，而是分别选择 Foundation capability 与 FreshX capability；前者是直接 owner，后者由 consumer 变化或依赖闭包带入。若依赖关系无法从构建图或显式 owner 事实确认，Plan 必须报告 unknown owner 并扩大或阻断，不能只运行命中的 path capability。

#### 3. affected、full 与 Candidate 不在同一轴

FreshX 的聚焦 capability 可以支持一次 Task Delivery affected 计划，但现有声明没有证明它等于 Service full。Buildr Product 的 `product.delivery`、`product.full-regression` 与 `product.candidate` 则展示了三种不同决策：affected 是本次选择范围，full 是完整日常证据范围，Candidate 还要求 exact source 和制品证据。后续 schema 不应把三者压成一个 `profile` 或 capability 类型。

#### 4. Release contract 不能冒充 Published Release

Buildr Product 的 release focus 可以验证 tarball、Launcher、安装与 readback contract，但不执行受保护 publish transaction。它适合作为 Candidate 或 Release 前置证据，不能生成 Published Release Result。Published Release 必须绑定真实发布物、外部 transaction 和 readback authority。该反例要求 Verification Result 同时保留验证目标和 matching execution identity。

### 试点结论

五个试点没有发现需要推翻核心对象或三个正交问题的场景。首轮试点暴露的四个缺口已经成为后续实现与迁移的验收输入：

- v2 capability 缺少一等的 evidence boundary、验证目标和 affected/full contract；
- 普通 Workspace 缺少统一、可解释的 Verification Plan 输出；
- 跨 Service/Project 的 owner 与依赖扩张需要可信来源和 fail-closed 规则；
- 高级 provider 需要统一 plan/run adapter，但其 registry、DAG 和 runtime 不能成为通用 schema。

该结论证明模型适用于已观察的异构场景；当前Product实现和验证证据另由live v3声明、provider tests与正式Task Verification负责，外部Workspace是否完成迁移仍不得从本矩阵推断。

## 当前应用与兼容迁移

v3、Verification Request/Plan、普通planner、高级provider、plan-driven run与Execution Record/Result对账已经实现。Buildr Product live声明使用v3；Skill、template、reference和所有新增声明也只生成v3。

runtime长期保留closed v2 reader作为历史兼容。adapter只做保守映射：`applicability.paths`成为discovery source，单一invocation只成为`full`，`requiredForDelivery: true`只获得`task-delivery`，evidence固定为`legacy-declared`。它不推断affected、Product Artifact Candidate、Published Release或provider能力。合法v2可继续使用并由Doctor给出非阻塞、能力受限的迁移提示；非法v2继续阻断；请求v3-only目标时形成coverage gap。

该兼容不需要“何时删除”的人工记忆：v2 schema不再扩展、没有writer/template，新功能只进入v3；兼容reader由fixtures、package static validation和Doctor tests持续保护。若未来确需删除，必须另有明确产品决策和可验证的使用面证据，不能由本架构的旧Contribution名称自动触发。

集鲜Pig、FreshX、Foundation不在Buildr Product自举任务中直接迁移。先发布包含v3与兼容reader的正式Buildr并完成正式安装，再由集鲜Workspace自己的Task、Change、Environment与Git authority迁移live声明并保存gap/affected/dependency/full证据。

当前实现继续遵守以下架构决定：

- 保持“验证目标、选择范围、执行证据”三个正交问题；
- 保持 Capability Family → Request → Plan → Execution Record → Result 的单向 authority；
- Project 根 `verification.yml` 继续作为声明入口，具体测试仍由源码与构建配置持有；新增和迁移后的声明只使用 v3；
- 普通 Workspace 使用通用选择能力，高复杂度 Project 通过统一 provider contract 接入内部 planner；
- coverage gap、unknown owner 与 full reason 是正式 Plan 输出，不以空选择或 claimed success 代替；
- Task Delivery、Product Artifact Candidate 与 Published Release 必须绑定不同对象和 matching execution evidence。

以下细节继续由各Workspace迁移根据真实运行证据定稿：

- 各试点 v3 capability 的精确 evidence、usable target 与 affected/full 入口；
- 是否以及何时增加 Service 级物理声明文件；
- 普通 planner 的 module/owner/dependency discovery 优先级；
- Verification Plan 的持久化、identity 与 current/stale 细节；
- 高级 provider 的具体 API、资源 lease 与 failure mapping。

外部迁移验收至少要用真实fixture或隔离Workspace证明：Pig前端形成gap、FreshX affected可解释、Foundation跨Project依赖扩张、unknown owner fail closed、full不升级Candidate、Candidate不冒充Release，以及Execution Record与Result仍由现有唯一writer对账。该验收不要求删除Buildr runtime的v2 reader。
