## Context

当前 `task-verification` 同时指导 Agent 读取 `verification.yml`、执行已有能力并维护 Task Result，但它明确不负责开发测试。Buildr 缺少一个独立入口，帮助 Agent理解 Project / Service 的测试框架、为任务开发测试并设计开发期与交付期编排。

本 Change 只增加自然语言工作资产和既有 Skill 指导，不增加 CLI、schema、存储或执行框架。

## Goals / Non-Goals

**Goals:**

- 提供技术栈无关、可映射到 Node.js、Java 等项目的最小测试设计模型。
- 分离测试意图、执行边界和编排场景，避免用 `fast` 等名称代替真实成本判断。
- 明确 Project / Service owner，以及 Project Testing 与 Task Verification 的交接。

**Non-Goals:**

- 不建设测试框架、通用 registry、DAG、调度器或 QA 平台。
- 不要求用户采用固定目录、命令名或测试库。
- 不为 Project Testing 创建 Result、Receipt、Application、contract provider 或持久状态。
- 不修改 `verification.yml` v2、Task Verification Result 或 Finish 状态机。

## Decisions

### 1. `project-testing` 是无状态指导 Skill

Skill 直接读取项目已有源码、测试、脚本、CI 和约定，指导 Agent 在当前任务授权范围内设计或实现测试。它不提供 capability contract，也不维护自身记录；需要长期保留的内容仍是项目测试、脚本和文档本身。

相比扩展 `task-verification`，独立 Skill 能保持“测试建设”与“已有能力声明、执行、Result”两种责任清晰。

### 2. 使用三个正交维度

- 主要意图：Development、Acceptance、Static Conformance、Delivery / Release。
- 执行边界：Static、Unit、Component、Integration、System。
- 编排场景：Quick、Task-affected、Candidate、Release。

`System` 不自动等于 Acceptance，`Static` 不塞入行为测试层，`focus` 只用于故障诊断和定向选择。第一版不把这些字段加入任何 schema，只作为 Agent 判断和项目 registry 审查卡。

### 3. owner 由待证明事实决定

一个 Service 的代码、公开技术契约或独立交付物可以判定的事实归 Service；跨 Service 行为、Project 治理资产、用户旅程和组合交付物归 Project。允许低成本辅助证据重复覆盖，但每项关键事实保留一个主要证据 owner。

### 4. 先覆盖研发测试，验收测试只留边界

功能实现后，Agent 优先在最低充分执行边界补充 Development Tests；只有真实技术边界或完整系统行为需要时才上移到 Integration / System。提案和设计阶段可以识别需求驱动的验收案例，但第一版不自动建设浏览器、性能或其他 QA 体系。

### 5. Task Verification 只声明稳定能力接口

`task-verification` 继续发现 Project 已有入口并写入 `verification.yml`，但必须核对真实命令、环境、副作用和可用成本事实，不能根据 `fast`、`unit` 或目录名推断。声明保持为少量稳定、可选择的 capability，不复制项目内部每个测试或三轴分类。

## Risks / Trade-offs

- [分类变成形式负担] → 第一版只使用最小审查卡，不要求重命名目录或新增 registry。
- [技术栈示例被误当强制框架] → reference 明确示例只用于映射，Project 约定始终优先。
- [Project Testing 与 Task Verification 重复选测] → routing 和 Skill 正文明确前者建设项目测试，后者消费已声明能力并维护 Result。
- [Acceptance 占位被误报为业务验收] → 只有从需求验收标准派生并实际执行的测试才可称为 Acceptance evidence。
