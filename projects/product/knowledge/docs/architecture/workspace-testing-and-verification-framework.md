# Buildr 项目与服务测试验证框架

Buildr 帮助用户建设和使用适合自身项目（Project）与服务（Service）的测试验证体系：智能体（Agent）理解目标、建设测试、声明稳定入口、选择执行并解释结果；项目拥有真实测试和工具；Buildr 保存可共享的测试地图与任务验证报告（Task Verification Report）。完整性来自目标所需证据的闭环，不要求所有服务采用相同工具或配齐所有测试层级。

本文解释当前通用能力、协作方法与限制。依据是产品随包技能（Skill）的源文件、规范和实现，具体落点见[实现地图](../../code-map/verification-framework.md)。下文用一个假设的订单项目贯穿说明，示例不代表已经存在的测试能力。Buildr 自身的测试体系是文末的采用实例。

![Buildr 如何引导测试建设与使用：使用主线、按需补建与能力分工](../../archify/flows/verification-framework.html)

图中主线是智能体（Agent）根据目标查阅已有能力、选择执行并交付结果；缺少所需测试时，才进入补建与声明分支。图下三项技能（Skill）说明 Buildr 如何支持这些工作。项目（Project）及各服务（Service）拥有实际测试、工具和环境，跨服务业务流程需要自己的验证证据。

## Buildr 提供的能力与用途

直接指导智能体（Agent）的三项能力是技能（Skill）。它们各自回答一个问题，按当前需要组合：

| 能力 | 解决什么问题 | 指导智能体（Agent）完成什么 |
| --- | --- | --- |
| [测试建设（project-testing）](../../../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md) | 缺什么测试？怎样写出有效测试？ | 从目标和风险设计能捕获错误的用例，建设或完善测试、夹具（Fixture）、执行入口与选择映射；成果留在项目或服务中 |
| [声明接入（declaration-intake）](../../../services/buildr/resources/workspace/skills/buildr/declaration-intake/SKILL.md) | 已有能力怎样准确声明？入口变化影响什么？ | 核对各服务的真实入口与声明差异，确认范围和已有授权，将测试地图更新交给任务验证（task-verification） |
| [任务验证（task-verification）](../../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md) | 本次该执行哪些检查？结果能证明什么？ | 维护 `verification.yml`，依据目标、改动和环境选择并直接调用项目工具，核对证据与缺口，按需保存正式任务验证报告（Task Verification Report） |

配套的软件能力负责保存与校验工作事实：

- **项目测试地图维护**：通过 `project verification inspect|validate|update` 读取、校验和安全更新项目文件 `verification.yml`，解析各测试族（Testing Family）的项目或服务位置。地图描述稳定入口与适用范围，执行仍由智能体（Agent）调用项目工具。
- **任务验证报告维护**：通过 `task verification inspect|record` 保存正式任务（Task）的实际检查、内容身份、结论及未覆盖项，并检查报告适用性。没有正式任务（Task）时可直接交付验证结果。
- **可选测试上下文运行时（Test Context Runtime）**：Node.js 项目可使用 `@buildr-ai/buildr/test-context` 复用昂贵准备，并管理案例隔离和清理；其他技术栈按自身工具建设。接入条件见[运行时说明](../guides/node-test-context-runtime.md)。

三项技能（Skill）提供方法，前两项软件能力维护事实，可选运行时（Runtime）帮助具体测试运行。实现位置见[代码地图](../../code-map/verification-framework.md)：其中的软件模块 `project-testing` 负责地图维护，与同名测试建设技能（Skill）职责不同。

## 先确定用户要建设什么

不同目标进入同一责任链，但不要求从头重建：

| 用户目标 | 智能体（Agent）的起点 | 本次应交付什么 |
| --- | --- | --- |
| 从零建立测试体系 | 业务结果、技术栈、交付边界和环境条件 | 最小有效测试、可重复入口、使用说明与适用声明 |
| 补齐一个服务或业务流程 | 已有能力、关键风险和明确缺口 | 能捕获目标错误的测试及必要入口、选择映射更新 |
| 整理已有测试体系 | 真实测试、脚本、耗时、环境与重复覆盖 | 准确的职责划分、稳定测试地图和选择说明 |
| 验证当前改动 | 目标、改动、已有测试地图与执行事实 | 必要检查、有效证据、未覆盖项与完成结论 |

人负责目标、约束、必要授权与结果验收。智能体（Agent）在已授权范围内完成调查、建设和验证；分析请求先形成建议，建设请求才修改相关资产。新增外部环境或长期测试边界时，先把具体影响说明清楚，既有授权继续适用。

## 项目与服务如何分工

能由一个服务（Service）的公开行为或独立交付物判定的事实，由该服务负责；跨服务业务流程、用户旅程和组合交付物由项目（Project）负责。声明位于项目根，并不把服务测试的实现责任搬到项目层。依据见[测试指导规范](../../../openspec/specs/project-testing-guidance/spec.md)。

以下假设订单项目包含 Java 后端、React 前端和 Python 数据处理三个服务（Service）。表中是按目标选择的建设示例，不是统一要求：

| 责任范围 | 待证明结果 | 合适的测试能力 | 可采用的真实工具与入口 |
| --- | --- | --- | --- |
| 订单后端 | 金额计算正确；下单失败不会留下半笔订单 | 单元测试（Unit）、真实数据库集成测试（Integration） | 服务已有 Maven/Gradle 测试入口及隔离数据库 |
| 管理前端 | 表单状态正确；用户能看到提交成功或失败 | 组件测试（Component）、浏览器行为检查 | 服务已有组件测试工具及 Playwright 等页面入口 |
| 数据处理 | 转换规则正确；重复导入不产生错误数据 | 单元测试（Unit）、文件或数据库集成测试（Integration） | 服务已有 pytest 等入口及受控数据样本 |
| 订单项目 | 页面下单后，订单可查询且统计结果正确 | 跨服务系统测试（System）及来自需求的业务验收（Acceptance） | 项目拥有的组合环境、业务数据与旅程检查 |

服务可以采用不同语言、工具和执行环境，也可以暂时缺少某类测试。智能体（Agent）分别核实每个服务的事实，不从目录名猜能力，不把后端检查通过复制成前端或数据处理的结论。各服务局部检查通过，也不能代替组合业务流程的证据。

## 前端工具环境不同如何继续

先按[前端协作与证据](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/frontend-verification.md)核对测试依赖、能力绑定（Capability Binding）与现场工具。自动化检查、智能体（Agent）交互检查和视觉审查（Visual Review）分别报告；缺少某项工具能力只限制相关要求。Buildr 自身的可重复入口、清理与实际采用见[前端验证说明](../../../services/buildr-web/test/browser/README.md)。

## 从零建设到可持续使用

从零建设时，先由测试建设（project-testing）指导形成真实可重复的入口；入口稳定后，声明接入（declaration-intake）核对差异，任务验证（task-verification）维护地图。后续改动可直接使用已声明的能力；选测或执行发现覆盖缺口时，再按目标补建。

没有测试框架时，先围绕一个关键公共结果建立最小入口。例如先使订单金额测试可以重复运行，再补事务回滚；前端和数据处理分别按各自目标建设。只有需要且已经授权时才增加工具、数据或环境，不提前声明尚不存在的能力。

入口稳定意味着能找到应有测试、具备真实准备条件、结果可判读，且相关副作用受控。测试、脚本、环境与说明属于项目（Project）或服务（Service）；Buildr 不提供统一技术栈适配器来代替这些工作。

## 引导智能体生成什么样的测试

质量闭环是：**待证明事实 → 公共结果 → 风险案例 → 最低充分边界 → 能区分正确与错误的断言 → 有效性证据**。先描述结果，再选工具；文件名、工具名和覆盖率数字不能替代行为证明。

| 事实类型 | 优先采用的边界 | 订单示例中的断言 |
| --- | --- | --- |
| 纯计算、校验和状态判断 | 单元测试（Unit） | 金额、边界输入与错误结果 |
| 一个有界模块的真实组装 | 组件测试（Component） | 表单校验后公开的状态与反馈 |
| 真实数据库、文件、进程或服务协议 | 集成测试（Integration） | 事务回滚、落盘数据与协议结果 |
| 完整公共入口或跨服务生命周期 | 系统测试（System） | 下单、查询与统计组成的真实流程 |
| 类型、声明和结构一致性 | 静态检查（Static） | 类型和声明格式正确，不冒充业务行为 |

按目标风险覆盖正常、失败、边界和必要状态转换，不机械穷举。新增测试必须能够发现目标错误；缺陷回归应说明捕获了哪个旧错误，安全可行时通过修复前或受控错误实现证明其会失败。无法取得可信对照时说明替代证据和限制。

替身（Mock/Fake）用于隔离外部协作者，不能替换被测决策后仅验证预设调用。涉及数据库、文件或共享状态时，按目标检查隔离、必要幂等、失败清理和重复运行；准备结果的复用不能抹去本次要证明的初始化、恢复或清理行为。

业务验收（Acceptance）从需求标准派生；系统测试（System）是一种执行边界，两者不等同。低成本反馈（Quick）、定向检查（focus）、受影响范围（affected）、完整范围（full）和候选（Candidate）分别涉及成本、选择或验证对象，不能混成一套等级。详见[测试模型](../../../services/buildr/resources/workspace/skills/buildr/project-testing/references/testing-model-v1.md)。

## 如何按服务声明稳定能力

`verification.yml` 使用 `buildr.project-verification/v4`，把真实体系归纳为少量稳定测试族（Testing Family）。订单项目可以分别声明后端逻辑、后端数据库、前端组件、前端页面、数据处理和项目业务旅程；具体如何拆分取决于入口、目的、选择方式与环境，不按测试文件逐项登记。

| 字段或位置 | 说明什么 | 不能替代什么 |
| --- | --- | --- |
| `id`、`title`、`purpose` | 稳定身份与能证明的结果 | 本次测试结果 |
| `scope.project`、`scope.services` | 适用项目（Project）与服务（Service） | 路径根与执行目录 |
| `location` | 选择项目根或一个已登记服务的代码根；省略时为项目根 | 环境准备或测试覆盖证明 |
| `sourcePaths`、`testRoots` | 相关源码范围与测试发现位置 | 已覆盖范围或已执行清单 |
| `full.kind: command` | 以 `cwd` 和无命令解释器的参数数组 `argv` 描述完整入口 | 测试质量与环境可用性证明 |
| `full.kind: agent` | 以 `instructions` 描述需要智能体（Agent）执行的真实检查 | 尚不存在的测试或访问能力 |
| `selection`、`requirements` | 选择方法与环境要求的说明 | 自动选择器、资源分配或授权 |
| `preparation.yml` | 已确认的安装、构建等准备入口 | 测试通过事实 |

字段及维护顺序见[声明参考](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/project-verification-v4.md)和[地图维护说明](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/maintain-map.md)：读取当前地图与身份，形成完整候选，校验并核对差异，通过 `project verification update --expected-identity` 更新后回读。已确认入口的普通维护可在当前授权内继续；范围、外部效果或长期边界变化由声明接入（declaration-intake）核对具体决定。

新增测试文件通常只需接入原有发现和选择机制；只有稳定能力、范围或入口变化时才改地图。完整入口必须兑现该测试族（Testing Family）的声明范围，不能把只运行数据库测试的命令写成整个后端的完整验证。

每个测试族（Testing Family）只有一个路径根。`location: {kind: project}` 使用项目根，`location: {kind: service, service: orders-api}` 使用登记服务 `orders-api` 的真实代码根；服务必须属于该族的 `scope.services`。`sourcePaths`、`testRoots`、`full.cwd` 都相对这个根。省略 `location` 时保持项目根含义，原有声明无需改写；使用新字段前须有支持它的 Buildr。

假设已登记的订单后端拥有下列 Maven 入口，即使其代码在项目目录之外，也可声明：

```yaml
id: orders-api-unit
title: 订单后端单元测试
scope: {project: orders, services: [orders-api]}
location: {kind: service, service: orders-api}
purpose: 验证订单金额与状态规则
sourcePaths: [src/main/**]
testRoots: [src/test/**]
full: {kind: command, argv: [./mvnw, test, -Punit], cwd: .}
requirements: [jdk]
```

前端和数据处理服务分别绑定自己的根与真实入口。跨服务业务旅程可绑定项目根下已存在的组合入口；没有组合入口时，分别执行各服务测试并说明尚缺的组合证据，不能把多个根塞进同一个相对路径。

地图读取、校验和更新返回的 `locations` 给出每族当前 `root`、命令 `cwd` 与 `ready|unavailable`。缺失服务目录、不可用工作目录或真实目录越出绑定根，只形成该族的局部诊断；结构有效地图仍可维护，其他服务继续验证。`kind: agent` 保留根，`cwd` 为 `null`，由具体指引决定执行方式。本机绝对位置不写回声明，位置可用也不证明命令、通配符覆盖或环境准备已通过。字段校验见[地图领域模型](../../../services/buildr/src/modules/project-testing/domain/project-verification.ts)，当前位置见[地图应用](../../../services/buildr/src/modules/project-testing/application/project-verification-application.ts)。

## 每次任务如何选择和执行

智能体（Agent）先核对当前目标、实际改动、服务依赖和用户使用的交付物，再读取地图、测试实现与环境条件。选择是基于事实的判断；地图提示和项目自动选择结果只能辅助。

1. 列出本次改变的公共结果及受影响边界，包含必要的构建、资源、安装后入口和平台差异。
2. 分别找到服务局部检查与项目组合检查，确认它们实际能证明什么。
3. 核对已有结果的内容、环境、目标与覆盖；仍适用则复用并保留原执行事实。
4. 补足必要检查；不能可信缩小范围时运行相关完整集合，不随意猜定向参数。
5. 缺测试、测试失配或漏选时回到测试建设（project-testing）；环境不可用或超出授权时准确记录缺口。

| 本次改动 | 订单项目中的选择判断 |
| --- | --- |
| 只修改金额舍入规则 | 相关计算与边界案例；核对金额对外输出是否影响其他服务 |
| 改变下单协议或失败返回 | 后端协议与数据检查，加上受影响的前端交互；必要时验证组合流程 |
| 改变统计字段或导入逻辑 | 数据转换、真实存取及幂等检查；若影响订单展示，再覆盖对应调用方 |
| 改变部署资源或测试选择入口 | 验证真实交付后的调用或选择完整性，不能只沿用源码层通过结果 |

执行前重读当前绑定和适用规则；命令型入口在 `locations` 解析出的 `cwd` 中原样调用声明的 `argv`，保留项目包装脚本（Wrapper）的环境约束。目录不可用时先处理相关准备或如实报告该项缺口。各技术栈使用自己的执行工具；通用框架不要求 Buildr 产品的命令、执行注册表（Registry）、依赖调度或测试上下文运行时（Test Context Runtime）。

开发反馈不逐次写正式报告。必要检查已通过且结果仍适用时，不因进入完成阶段重新全量执行；只有新改动、失败、项目必需检查或明确未解决风险才补充验证。

## 如何汇总不同服务与跨服务结果

完成结论逐项说明“哪个结果由什么证据证明，还有什么未覆盖”。区分测试不存在、未执行、环境不匹配和执行失败；不能用其他服务通过来抵消必要缺口。

正式报告使用 `buildr.task-verification-report/v1`，每个正式任务（Task）至多一份当前报告，关联任务范围、内容身份、地图身份、实际检查和未覆盖项。每项检查记录 `testing`、`focus|task-related|full`、具体 `targets`、`command|agent`、结果、摘要及可得的耗时，见[报告登记步骤](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/record-report.md)。

单项检查可选填一个 `service`。订单后端、前端和数据处理的局部结果可以分别登记；跨服务旅程按项目级检查记录，在 `targets` 与摘要中明确参与服务、组合目标和真实环境，不能伪造成三份独立证明。报告当前没有自动汇总多仓库版本的机制，`content.identity` 必须由智能体（Agent）覆盖本次实际验证的整体内容，并解释其含义。

| 结果 | 当前格式约束 | 完整性判断 |
| --- | --- | --- |
| `passed` | 至少一个检查且全部通过；允许同时存在 `gaps` | 智能体（Agent）仍须判断缺口是否影响目标，不能只看字段 |
| `not-passed` | 至少一个检查失败 | 说明失败及其影响，保留原始事实 |
| `incomplete` | 没有失败检查，但至少有一个未覆盖项 | 必要证据不足时如实说明验证不完整 |

上述约束来自[报告领域模型](../../../services/buildr/src/modules/task/domain/task-verification.ts)。Buildr 校验结构、范围与身份，不替智能体（Agent）证明覆盖充分，也不增加统一完成门禁。

报告通过 `task verification inspect|record` 按已观察版本保存；冲突后重新核对现场，不能盲目覆盖。读取时提供当前内容身份才可判断 `current|stale`，未提供则为 `unknown`；地图变化也会影响适用性。地图缺失或损坏不会抹去真实检查，但会标记 `map-unavailable` 并追加缺口。依据见[任务验证规范](../../../openspec/specs/task-verification/spec.md)。

没有正式任务（Task）也可以运行测试并如实交付结果，无需为测试本身新增状态。报告保存不等于业务验收、任务完成、提交、部署或发布；这些事实按实际目标分别成立。

## 长期如何演进

| 现场变化 | 应维护的事实 |
| --- | --- |
| 新增案例或修复缺陷 | 测试及其发现、选择机制；通常沿用原地图条目 |
| 服务入口、环境或稳定能力变化 | 真实工具和说明；核对 `preparation.yml`、`verification.yml` 的相关差异 |
| 新增跨服务业务目标 | 明确项目责任，建设组合证据，再声明已经稳定的入口 |
| 验证发现盲区或反复失败 | 分清实现、测试、选择和环境问题，回到对应建设责任 |

长期事实分别留在测试代码与工具、声明和知识文档中；本次选择与结果留在本次证据及适用报告中。入口变化后核对实际发现和调用，已有报告保留原事实，再判断是否仍适用于当前内容。

## Buildr 自身作为采用实例

Buildr 产品使用自己的测试工具、选择映射、浏览器检查及候选与发布验证来采用这套通用框架。详见[产品测试架构](verification-framework.md)、[产品测试地图](../../../verification.yml)及[测试上下文运行时说明](../guides/node-test-context-runtime.md)。其他项目按自身目标建设，不需要复制这套实现。
