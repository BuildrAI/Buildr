# Buildr 产品架构

随包 [工作空间入口](../../../services/buildr/resources/workspace/AGENTS.md) 的受管区块（Managed Block）是唯一核心规则源，包含智能体优先原则及其适用范围，以及责任、沟通、工作资产职责和不可绕过边界；本文只解释当前产品架构，不复制原则。独立核心规则已退役，专业规则仍通过 `rules/manifest.yml` 登记并按需读取。

## 用户与协作角色

人通过自然语言表达目标、提供业务判断、授权和确认重要决策；Agent 消费组织工作资产，形成 Task Context 并推进专业工作；Buildr 不成为另一个 Agent，而是治理长期资产与确定性边界。

Buildr 采用宽而薄的治理：Buildr 应该约束 Agent 不要做错事，而不是要求 Agent 必须通过 Buildr 才能做事。硬门禁只保护 authority、目标对象、外部或不可逆副作用、证据真实性与完成结论等结果边界。缺失的若只是辅助 provenance、推荐流程、工具偏好、Buildr 内部登记或自动化信心，而当前事实仍可从权威来源检查、验证并诚实报告，则 Buildr 提供诊断与 Agent 指引，不规定 Agent 或协作者必须采用唯一工作方式，也不阻断专业工作与其他无关工作的安全推进。

产品治理结果统一区分硬门禁（Hard Gate）、待处理（Attention）与建议（Advice）；`ready|required|blocked` 只表示具体 consumer 的具体 action 是否就绪，不是 Workspace、Task 或 Agent 的全局许可。新增或保留硬门禁必须明确 action、consumer、invariant、harm、authority、scope、fallback 与 classification；无法说明放行会破坏什么结果不变量时，应降级为 attention、advice 或更窄动作的局部前置。完整分类与迁移边界见[门禁分类与有界审计](governance-gate-taxonomy.md)。

## 核心产品模型

```text
Work Information Space
  ├─ Buildr Workspace（范围与发现入口）
  │    └─ governed Work Assets → Shared Work Environment
  └─ 数据库 / API / 网页 / 用户输入 / 工具结果
                 ↓ Agent 发现、检索、判断、选择、组织、压缩
             Task Context
                 ↓ 当前调用的有限投影
             Context Window
```

Buildr 主要建设 Task Context 所依赖的长期资产基础与共享工作环境。位于 Workspace 不等于被 Buildr 治理；Task 使用 Buildr 资产也不表示 Task 本身由 Buildr 接管。

## 领域与能力模块

- Workspace：Organization/root 范围、identity、资产治理和 runtime 投射入口。
- Workspace Structured Store：Buildr Local中每个canonical Workspace独立的local-only SQLite，用于索引、关系、聚合和事务；是Task Record、Verification与Planning/Completion Review的本机持久化authority，不属于portable工作资产，也不进入Git或同步。
- Project：业务事实、OpenSpec、capability/applicability context 和 Service 关系。
- Service：职责与代码/资产边界。
- Buildr Web：当前通过默认浏览器使用的本机 Web 界面，由 Buildr Web Frontend Service 交付前端产物、Buildr Web Runtime 同源托管，并可由 Buildr Web Launcher 启动。三者不建立第二个数据或 Application authority；Buildr Web 为未来桌面产品保留，当前未实现。
- Buildr Application Payload 与分发载体：CLI、Core/Application、Buildr Web Runtime和正式静态资源、SQLite migrations、package baseline、生产依赖、版本与协议identity只形成一份公共负载；唯一正式载体是npm package。本机Launcher只是显式安装的图形投射，绑定同一npm安装，不复制Node、Buildr或业务实现。
- Work Assets：工作事实与工作方法；Rules、Skills、Commands、Specs 等只是当前示例。
- Change：规范驱动的变更管理；Brief 提供人类入口，标准 artifacts 保持规范 authority。
- Task Record：正式Task的最小顶层事实。closed v3表达todo/active/终态、直接`parentTaskId`、显式`isParent`、结果摘要、更正历史，以及可选本机复盘文档摘要；反向Children只查询派生。todo只是data-only意向，`open`是todo + active查询。Buildr Web只观察和有限维护已有Task，不创建/激活。
- 项目每日演进：按已登记 Project 保存的本机日历日 Git 提交摘要；权威是 ignored YAML 文件，不进 Structured Store。日摘要回答新增、更新、删除与弊端；自己的提交可挂 0..N 个本机 Task，他人提交必须展示且禁止挂 Task。产品读取路径不生成摘要、不扫描 Git、不内置 cron；Web 只读展示。
- Task-scoped Change Reference Resolver：只在明确 Task context 中从 matching Worktree或retained Project解析限定Change；全局Change索引保持retained-only。
- Task Review：一个 `buildr.task-review/v2` capability 通过同一 Result 模型维护 Planning/Completion 两个可选 current 槽位。Agent依据真实方案或完成结果动态审查，确定性 Application只负责inspect、带摘要比较的原子record和最小Result；它不判断适用性，也不依赖Development或成为其他模块门禁。
- Task Verification：`buildr.task-verification/v4`指导Agent从Project测试地图选择并直接执行已有前后端测试；Project Verification Application只维护`verification.yml`，Task Verification Application只保存开发完成后的有意义报告。报告绑定内容版本和测试地图identity，不创建计划、runner、Candidate、Execution Record或Task门禁。
- 开发执行：Agent直接读取Task目标、OpenSpec、代码、Git、文件、环境和专业结果，按适用Skill完成开发；Buildr不建立任务级研发聚合Application。
- Task Retrospective：可选纯Skill。用户明确要求后，Agent只基于当前可见事实生成`.buildr/local/task-retrospectives/<task-id>.md`；Task Record只登记文档SHA-256和`pending-decision|decided`。查看零写入，建议不自动修改资产或创建Task；用户决定继续时复用或创建普通Task并在目标中说明来源。
- 任务收尾（Task Finish）：由智能体依据技能组合已有工具完成成果交付、已有任务结果登记和安全善后。无任务不创建，多仓库逐项保留结果；参与者和实现职责见 [任务收尾](../flows/task-closeout.md)。
- Git Operations：一个 Skill-only `buildr.git-operations/v1` capability，为 consumer 已选定的单次 Git Operation 提供授权、安全默认值、前后 identity 与最小 Result；它无状态，不选择操作、目标或顺序，也不拥有 Task Finish 编排。
- 父任务协调（Task Parent Coordination）使用目标、可读计划与真实任务结果，不传播工作位置、验证或交付事实。人明确授权父任务完成，完整说明见[父任务协调](../flows/task-parent-coordination.md)。
- Task coordination：当前只组合普通Task、父任务/子任务关系、各专业公开read model与Buildr Web页面投影，不提供统一下一步、跨专业门禁、独立Board Domain或静态Board writer。独立Task Overview已删除；旧Parent Plan只作为Task-owned历史字段读取。

## 产品边界

Buildr 负责长期治理、跨 Agent 复用、确定性状态变更、完整性保护、诊断和 evidence；Agent 负责理解、检索、选择、组织、推理和执行。具体 `rg`、SQL、API、语义检索或 MCP 是 Agent 可采用的工具，不是 Buildr Context 模型本身。

Buildr Local是单机产品形态：SQLite只保存当前机器、当前Workspace的本地structured data，不同步数据库文件。未来组织协作应由独立Buildr Server或Buildr Cloud持有共享authority、身份与协调事实，而不是把本地SQLite扩展为同步协议。


## 按需设计方法

软件引入智能体（Agent）参与产品结果交付时，开始向智能体软件（Agentic Software）演进。相关产品设计及智能体工作系统改造可使用 [智能体优先设计技能](../../../services/buildr/resources/workspace/skills/buildr/agent-first-design/SKILL.md)：根规则保存原则，技能提供职责划分、能力取舍和产物接续的方法。仅使用智能体开发普通业务软件，不自动要求业务产品采用这种架构；渐进引入时只指导相关部分，普通开发或收尾不增加必读前置。

产物（Artifact）涵盖中间成果和最终结果，各入口围绕同一对象、当前版本及变化接续；用户查看成果不必阅读完整执行过程，目标完成仍需验收。代码、Git、文件、数据及外部系统可以各自承载权威事实，无需新建统一产物数据库；这些成果也不自动成为工作资产（Work Asset）。这描述设计方向与边界，不声称当前 Buildr 已实现任意外部成果的实时同步或统一编辑。
