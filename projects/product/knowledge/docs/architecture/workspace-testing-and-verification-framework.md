# 怎样为项目选择和建设测试

Buildr 帮助智能体（Agent）找到项目（Project）已有的测试、补齐必要缺口并解释结果。真实测试、工具和环境仍由项目（Project）及服务（Service）拥有；Buildr 保存稳定入口和正式任务（Task）的验证报告，不要求所有项目采用相同技术栈。

![测试建设、选择执行与结果记录](../../archify/flows/verification-framework.html)

使用主线是查阅已有能力、选择检查、实际执行并交付结论；只有缺少所需测试时，才补建能力和声明。下面的订单项目是说明方法的假设例子，不代表已经存在的测试。

## 先用已有测试，再决定补建什么

| 当前目标 | 应交付的结果 |
| --- | --- |
| 验证当前改动 | 必要检查、实际证据、未覆盖范围与结论 |
| 修复一个已知缺陷 | 能捕获该错误的回归测试，以及修复后的结果 |
| 补齐服务或业务流程 | 有效测试、可重复入口和必要选择映射 |
| 从零建设测试 | 围绕关键公共结果的最小有效测试、入口与使用说明 |

三项技能（Skill）各有分工：[测试建设（`project-testing`）](../../../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md)设计测试与工具；[声明接入（`declaration-intake`）](../../../services/buildr/resources/workspace/skills/buildr/declaration-intake/SKILL.md)核对入口变化和声明差异；[任务验证（`task-verification`）](../../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md)选择并直接运行检查，维护测试地图和报告。

同名软件模块 `project-testing` 只管理 `verification.yml`，不执行用户测试。`project verification inspect|validate|update` 负责地图读写，`task verification inspect|record` 负责正式报告。没有正式任务（Task）时仍可测试并直接交付结果，不必为了登记而创建任务。

从零建设时，先围绕一个关键公共结果做出最小可重复入口。例如先验证订单金额，再按风险补充事务回滚；前端与数据处理分别建设各自所需的检查。入口稳定后再写入测试地图，后续改动直接选择已有能力，发现缺口时按目标补建，避免先登记一套尚不存在的测试体系。

入口稳定意味着能找到声明范围内的测试、具备真实准备条件、结果可判读，且副作用受控。测试、脚本、环境与说明由项目（Project）或服务（Service）维护；Buildr 提供共同的描述和结果记录方式，各技术栈继续使用适合自己的工具。

## 让每项检查证明明确的结果

一个服务（Service）能独立判定的行为由该服务负责；跨服务业务流程和组合交付物由项目（Project）负责。假设订单系统有后端、前端和数据处理：金额计算可以单独检查，失败下单需要真实数据库回滚证据，页面下单后统计正确则需要组合流程证据。三个服务各自通过，不自动证明最后一件事。

| 要证明什么 | 合适的边界 |
| --- | --- |
| 计算、校验和状态判断 | 单元测试（Unit Test），断言输入边界与公开结果 |
| 一个模块的真实组装 | 组件测试（Component Test），检查实际状态和反馈 |
| 数据库、文件、进程或协议 | 集成测试（Integration Test），保留要证明的真实技术边界 |
| 完整公共入口或跨服务生命周期 | 系统测试（System Test），按用户场景观察结果 |
| 类型、声明和结构一致性 | 静态检查（Static Check），不能冒充业务行为证据 |

先写清待证明的结果和错误风险，再选择最低充分边界。缺陷回归应能发现旧错误；安全可行时用修复前行为或受控错误作对照。替身（Mock/Fake）可以隔离外部协作者，但不能把被测决策替换掉，再只断言预设调用。

涉及共享状态时，按需要检查隔离、幂等、失败清理和重复运行。复用准备不能抹掉本次要证明的初始化、恢复或清理行为。业务验收（Acceptance）来自需求标准，与系统测试（System Test）的执行边界并不等同；覆盖率数字也不能代替行为证明。

检查成本、选择范围和验证对象也应分别理解：低成本反馈（Quick）描述成本，定向检查（Focus）、受影响范围（Affected）与完整范围（Full）描述选择，候选验证（Candidate Verification）关注待交付产物。它们不构成一条从低到高的测试等级，具体分类见[测试模型](../../../services/buildr/resources/workspace/skills/buildr/project-testing/references/testing-model-v1.md)。

## 测试地图记录稳定入口

`verification.yml` 使用 `buildr.project-verification/v4`，按少量稳定测试族（Testing Family）组织真实能力，不按每个测试文件登记。一个测试族（Testing Family）应有明确用途、覆盖范围、完整入口和环境要求。

| 字段 | 怎样使用 |
| --- | --- |
| `id`、`title`、`purpose` | 说明稳定身份及待证明结果 |
| `scope.project`、`scope.services` | 说明适用范围，不代替实际执行目录 |
| `location` | 选择项目根或一个已登记服务的真实代码根；省略为项目根 |
| `sourcePaths`、`testRoots` | 给出相关源码与测试发现位置，不代表已覆盖或已执行 |
| `full.kind: command` | 使用 `cwd` 和参数数组 `argv` 表达真实完整入口，不通过命令解释器拼接 |
| `full.kind: agent` | 用 `instructions` 说明需要智能体（Agent）实际执行的检查 |
| `selection`、`requirements` | 说明怎样选择及需要什么环境，不自动提供选择器或授权 |

例如，已经存在且可运行的订单后端入口可以声明为：

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

每个测试族（Testing Family）只有一个路径根，服务位置必须属于其 `scope.services`。`sourcePaths`、`testRoots` 与 `full.cwd` 均相对该根；跨服务旅程应使用项目拥有的组合入口，不能把不同根混进一组相对路径。

读取地图返回每族当前的 `locations`、`root`、命令 `cwd` 与 `ready|unavailable`。目录不可用只影响相关族；`ready` 不证明工具、环境或测试已通过。本机绝对位置不写回声明，准备方式仍见 `preparation.yml`。声明职责见[数据与项目声明](buildr-data-design.md#工作资产与项目声明怎样使用)。

地图维护先读取当前身份，形成完整候选、校验差异，再用 `project verification update --expected-identity` 保存并回读。新增测试文件通常只接入原有发现和选择机制；稳定能力、范围或入口改变时才改地图。完整格式与顺序见[声明参考](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/project-verification-v4.md)和[维护方法](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/maintain-map.md)。

## 每次改动怎样选检查

智能体（Agent）先核对目标、实际改动、服务关系和用户最终使用的交付物，再查看地图、测试代码与环境。自动选择结果可以辅助，但不能替代影响判断。

1. 找出改变的公开行为及相关边界，包括构建、资源、安装入口或平台差异。
2. 分别选择服务局部检查和必要的项目组合检查，确认它们能证明什么。
3. 核对已有结果是否仍适用于当前内容和条件，能复用就保留原执行事实。
4. 补足必要检查；不能可信缩小时运行相关完整集合，不猜测定向参数。
5. 缺测试、漏选或环境不可用时说明具体缺口，回到相应责任处理。

命令型入口在解析出的 `cwd` 中使用声明的 `argv`，保留项目包装脚本（Wrapper）的环境约束。改变下单协议可能同时影响后端响应和前端交互；仅改金额舍入则先围绕计算边界检查，再核对外部影响。构建或类型检查不能替代真实页面交互，视觉审查（Visual Review）也不自动证明后端写入。

开发反馈不逐次登记正式报告。必要检查已通过且条件未变时，不因为进入完成阶段再全量执行。新增工具或外部环境按实际需要与已有授权处理，各技术栈继续使用自己的工具。

## 结论写清证据和缺口

正式报告使用 `buildr.task-verification-report/v1`，每个任务（Task）至多一份当前报告，保存内容身份、地图身份、实际检查、结果和未覆盖项。不同服务的局部检查分别记录；跨服务旅程按项目级检查说明参与方、目标与真实环境，不拆成多份独立成功来计算。

| 报告结果 | 格式要求与解释 |
| --- | --- |
| `passed` | 至少一个检查且全部通过；仍允许 `gaps`，需判断缺口是否影响目标 |
| `not-passed` | 至少一个检查失败，说明其影响 |
| `incomplete` | 没有失败检查，但至少有一个未覆盖项，必要证据尚不完整 |

检查不存在、未执行、环境不匹配和执行失败应分别说明。报告没有自动汇总多仓库版本的机制，`content.identity` 必须覆盖实际验证的整体内容，并说明其含义。详细字段见[报告登记方法](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/record-report.md)和[报告模型](../../../services/buildr/src/modules/task/domain/task-verification.ts)。

保存使用已观察版本，冲突后重新核对，不能盲目覆盖。读取时提供当前内容身份才可判断 `current|stale`，否则为 `unknown`；地图变化影响适用性，地图不可用则保留检查事实并报告 `map-unavailable`。保存报告不等于业务验收、任务完成、部署或发布。

Buildr 自身的独立前端检查、浏览器旅程和跨平台候选见[产品验证实例](verification-framework.md)。Node.js 项目还可按需采用[测试上下文运行时（Test Context Runtime）](../guides/node-test-context-runtime.md)复用昂贵准备；它是可选工具，不是使用本章方法的前提。实现定位见[测试与验证代码地图](../../code-map/verification-framework.md)。
