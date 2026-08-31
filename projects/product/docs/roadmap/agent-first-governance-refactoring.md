# Buildr 智能体优先治理重构纲领

> 本文描述尚未完成的目标架构与分阶段重构方向，不是当前产品事实、规范行为契约、规则（Rule）、技能（Skill）或智能体运行时（Agent Runtime）资产。每个工作项进入实现前，必须由独立子任务（Child Task）和适用的 OpenSpec Change 收敛需求、设计、规范、实现与验证。

## 一句话目标

> Buildr 约束智能体（Agent）不要做错事，但不要求智能体必须通过 Buildr 才能做事。

Buildr 要从“工作许可和流程控制者”退回到“长期工作资产治理者、确定性安全边界提供者和结果事实登记者”。人负责目标、业务判断和授权；Agent 负责理解、推理、选择路径和执行；Buildr 负责保护少量结果不变量、维护可复用资产、观察权威事实、登记结果并提供诊断与恢复。

## 文档目的

本文用于统一后续产品设计、架构审查、子任务拆分和验收判断，覆盖：

- 工作空间（Workspace）、项目（Project）与服务（Service）；
- 规则、技能、命令（Command）、组件（Component）和运行时投射；
- 正式任务（Formal Task）、任务环境（Task Environment）与父子任务（Parent/Child Task）；
- 任务研发（Task Development）、任务候选（Task Candidate）、任务审查（Task Review）与任务验证（Task Verification）；
- 任务收尾（Task Finish）、Git/PR 交付、激活（Activation）、清理（Cleanup）和诊断（Diagnostics）；
- OpenSpec、当前认知（Current Knowledge）与术语治理（Terminology Governance）；
- 健康诊断（Doctor）、Buildr Web、能力绑定（Capability Binding）和 Workspace 同步；
- 测试体系、产品候选验证（Product Candidate Verification）、发布候选版（Release Candidate，RC）与正式发布。

本文不是第二套规范。它定义稳定的设计判断和重构工作包；具体行为仍由各子任务的 OpenSpec 规范决定。

## 依据与现状

随包 [内联核心规则](../../services/buildr/resources/workspace/AGENTS.md) 是最高层产品哲学与通用边界。[当前产品架构](../../openspec/knowledge/architecture/product.md) 已经明确：Buildr 采用宽而薄的治理，不成为另一个智能体（Agent），不把推荐流程变成唯一合法路径。

但当前产品仍有一批历史契约和实现沿用“先满足 Buildr 内部流程，才能继续工作”的模型：

| 领域 | 当前遗留行为 | 主要风险 |
|---|---|---|
| Workspace 资产维护 | 默认规则要求 Agent 先使用 Buildr Skill，并通过 manifest-backed CLI 维护源资产 | 工具不可用或自身缺陷会阻止本来安全的资产工作 |
| Project / Service | Domain 强制固定物理目录，外部仓库必须被物化到 canonical path | Buildr 反向要求用户重组已有仓库和目录 |
| Task Environment | 正式 Task 在修改、构建、测试前必须取得整体 `ready` | 环境登记问题被扩大为工作许可问题 |
| Task Development | Verification、Candidate、Completion Review 和 handoff 存在固定顺序 | Agent 无法根据风险、成本和上下文选择更优路径 |
| Task Verification | 内部 Execution Record 容量或重复登记可以阻止验证进程启动 | Buildr 记录能力反向限制真实测试工作 |
| Doctor | 一个聚合 `ready` 由全部 actionable finding 决定 | 无关模块的 warning/error 可能阻止当前安全动作 |
| Workspace sync | 单个 Component 冲突或 optional 资产决策停止整个同步 | 局部问题扩大为全局停摆 |
| OpenSpec / Current Knowledge | 自动收敛路径或任意 unresolved 可能阻止 Git、推送和清理 | 解释性或内部流程问题变成交付许可 |
| 测试 | 部分测试断言必须出现固定流程措辞或固定入口 | 测试保护流程服从，而不是保护结果不变量 |

这些行为并非都要删除。需要重构的是“阻塞范围、责任归属和安全降级”，而不是放弃身份、授权、证据与删除安全。

## 责任边界

| 角色 | 负责 | 不负责 |
|---|---|---|
| 人（Human） | 表达目标、业务判断、优先级、授权、风险接受和重要决策 | 诊断 Buildr 内部状态机、补写回执（Receipt）、理解续跑令牌（resume token）或替 Buildr 恢复内部登记 |
| 智能体（Agent） | 理解目标、调查事实、选择工作路径、执行专业工作、处理语义冲突、解释结果并推进恢复 | 伪造证据、绕过明确授权、覆盖他人工作或把未知误报为完成 |
| Buildr | 治理长期资产、提供确定性写入、维护身份与所有权、观察权威事实、登记结果、诊断和安全恢复 | 替 Agent 做专业判断、垄断 Git/PR/测试路径、把内部登记当作外部事实的上位权威 |

### 唯一写入者不等于唯一工作路径

Buildr 应用（Buildr Application）可以继续作为某类持久结果的唯一写入者，例如正式任务记录（Task Record）、环境回执（Environment Receipt）、验证结果（Verification Result）或交付证据（Delivery Evidence）。其含义是：

- 所有客户端通过同一 Application 校验并登记事实；
- 不允许页面、Skill 或 Agent 直接修改 SQLite；
- 不允许多个 writer 产生互相冲突的状态。

它不意味着：

- 代码、测试、Git 或 PR 必须由 Buildr 自动化执行；
- Buildr 没有事先创建内部记录，外部事实就不存在；
- Application 无法写入时，Agent 必须停止全部专业工作；
- Buildr 可以用内部状态否定 Git remote、文件内容、测试产物或用户授权等权威事实。

## 目标架构

```text
用户目标与授权
       ↓
Agent 调查事实并选择工作路径
       ├─ Buildr 自动化
       ├─ Git / PR / CI / 外部工具
       └─ 直接编辑、构建和测试
       ↓
权威事实观察与结果对账（Reconciliation）
       ↓
独立专业结果
       ├─ 交付（Delivery）
       ├─ 激活（Activation）
       ├─ 环境清理（Environment Cleanup）
       ├─ 诊断（Diagnostics）
       ├─ 审查结果（Review Result）
       └─ 验证结果（Verification Result）
       ↓
Buildr 登记、展示、诊断和恢复
```

目标结构有四个关键性质：

1. Agent 选择合法工作路径，Buildr 不预先垄断路径。
2. 自动执行与外部完成后的对账是同等合法的入口。
3. 专业结果彼此独立；一个结果的待处理状态（attention）不撤销另一个已经成立的结果。
4. 门禁只放在危险效果发生前或完成结论形成前，不放在所有工作的统一入口。

## 门禁设计规则

### 硬门禁（Hard Gate）的成立条件

新增或保留硬门禁时，设计必须同时回答：

1. 保护的结果不变量是什么？
2. 放行会造成什么具体、不可接受的伤害？
3. 为什么诊断、待处理、局部失败或事后对账不足以保护它？
4. Buildr 自身不可用时，Agent 的安全降级路径是什么？

无法完整回答时，该规则只能是诊断、建议或当前动作的局部前置，不得成为全局阻塞。

### 三类产品结果

| 级别 | 含义 | 行为 |
|---|---|---|
| `blocked` | 继续当前具体动作会越权、写错对象、造成危险副作用、覆盖他人工作、伪造证据或误报完成 | 只停止当前危险动作，返回权威事实与安全恢复方向 |
| `attention`（待处理） | 目标结果已经成立，或问题可独立处理，但仍有维护、激活、清理、诊断或登记事项 | 保留已成立结果，允许处理无关工作，交给 Agent 恢复 |
| `advice`（建议） | 推荐路径、效率建议、最佳实践、缺少增强能力或非当前范围债务 | 不改变动作合法性和结果状态 |

### 动作局部就绪（Action-local Readiness）

任何 `ready`、`blocked` 或 capability readiness 都必须绑定具体动作和消费方：

- Workspace identity 损坏，只阻止依赖该 identity 的 Workspace 写入；
- Runtime stale，只阻止声称 runtime 已投射或依赖该投射的动作；
- 某个 Component 冲突，只阻止该 Component 及共享 registry 的冲突写入；
- 某个 Project/Service 声明缺失，只影响要求 Buildr 执行对应准备或正式验证的路径；
- Release authority 不成立，只阻止 tag、publish 和公开发布结论。

产品不得再用一个全局 `ready` 作为所有 Agent 工作的许可位。

## 必须保留的硬边界

本次重构不能削弱以下边界：

- Workspace、Project、Service、repository、branch、remote、ref 或目标对象存在歧义；
- 写入对象不属于当前授权范围，或路径逃逸允许根；
- capability/provider identity 有歧义且当前动作确实依赖该能力；
- force push、覆盖他人提交、改写共享历史、自动解决语义冲突；
- 发布、部署、凭证、tag、远端删除等外部或不可逆动作缺少明确授权；
- 声称远端已交付，但真实 remote target 不包含任务贡献；
- 验证、审查或交付证据与当前内容身份不匹配；
- 删除 worktree、分支、资源或源文件时无法证明 ownership、范围与安全性；
- 把失败、未知、未执行、stale 或不完整事实报告为通过或完成；
- Buildr Web、Skill、CLI 或其他客户端绕过同一持久化 Application 直接写内部 store。

## 领域重构方向

### 1. Workspace、Project 与 Service

目标：Workspace 是治理和发现根，不是所有代码与资产的物理容器。

重构方向：

- 区分 Workspace 内受管根（Managed Root）与外部附接根（Attached Root）；
- Project/Service registry 保存稳定 identity、关系、来源和 ownership，不强制搬迁已有仓库；
- Git 边界始终按真实 repository topology 判断，不按目录形状猜测；
- 外部根只读发现与普通工作不要求 Buildr ownership；受管写入、迁移和删除才要求明确 ownership；
- Workspace 内固定路径继续作为默认创建位置，而不是唯一合法位置；
- registry closed schema 评估是否支持 namespaced extension，避免删除其他 owner 的合法扩展信息。

验收重点：既有 canonical layout 保持兼容；已有外部仓库可以附接；Buildr 不复制、移动或接管未授权内容。

### 2. Rules、Skills、Commands、Components 与 Runtime

目标：资产系统提供组织、发现、完整性和可重建投射，不强迫 Agent 只能通过某个维护命令工作。

重构方向：

- 默认 Workspace Rule 不再要求所有相关任务“先使用 Buildr Skill”；
- manifest-backed CLI 是受管 registry 的推荐与权威写入入口，不是正文编辑和外部安全工作的唯一入口；
- 外部修改后提供 inspect、adopt、reconcile 或明确冲突诊断；
- `rules remove` 默认只取消登记并保留文件，删除源文件需要显式授权；
- Component install/update/render 按 ownership unit 原子处理；无关 Component 不因局部冲突停摆；
- capability binding 只阻止实际依赖该 provider 的消费动作；
- Runtime 投射失败不扩大为 Workspace、Project、Service 或 Task 全局不可用。

验收重点：required Core 与 ownership/integrity 继续受保护；alternate path 不产生第二 registry authority。

### 3. Task Record 与任务准入

目标：Task Record 是长期任务事实，不是开始工作的许可证。

重构方向：

- Agent 可以在用户授权的明确仓库和目标上直接工作；需要长期跟踪、协作、恢复或正式结果时再创建 Formal Task；
- Task Record 创建、激活、更新和终态继续由同一 Application 管理；
- 终态交付事实不可改写，但允许可审计的 metadata correction、关系修复和 successor/reopen 模型；
- Buildr 自身登记缺陷不得把 Task 永久锁死；
- todo、active、completed、abandoned 的用户语义保持简洁，不向人暴露内部专业状态。

验收重点：不会从普通对话或临时操作自动创建 Task；不会通过修复接口篡改已成立交付事实。

### 4. Task Environment

目标：Environment 管理 Buildr 实际拥有的执行环境、共享资源和清理责任，不管理 Agent 的工作许可。

重构方向：

- `ready` 只约束由 Buildr 准备、执行或声明正式证据的环境路径；
- Agent 在已有明确代码仓中编辑、构建和测试，不以环境回执为普遍前提；
- Preparation Declaration 是可复用 Recipe，不是所有 Task 的准入材料；
- 只有请求 Buildr 确定性准备、租约、共享资源、隔离 runtime 或正式环境证据时，才要求完整 Plan；
- 缺失计划、回执或投射时，返回局部诊断和可选准备路径；
- cleanup 继续只删除可证明属于该 Task 的资源；无法证明删除安全仍然硬阻断。

验收重点：外部/直接工作不伪装成 Buildr-managed Environment；Buildr-managed resource 仍可恢复和精确清理。

### 5. Task Development、Candidate、Review 与 Verification

目标：Development 聚合当前研发结果，不规定 Agent 必须按固定顺序工作。

重构方向：

- 先形成稳定内容目标（Content Target）与任务候选身份；
- Agent 根据成本和风险选择 Planning Review、Completion Review、Verification 的顺序或并行方式；
- 各专业结果继续由独立责任方保存，Development 只引用当前身份与处置；
- handoff 只检查当前 Candidate 所需证据、风险授权和完成条件，不检查执行顺序；
- Candidate 内容变化时使相关证据 stale；无关 planning metadata 变化不应机械递增 generation；
- 区分“Buildr-managed formal verification execution”和“Agent 运行测试”；
- Execution Record 容量不足可以阻止受管正式执行，但不能阻止 Agent 运行外部测试；
- 增加可独立核验的验证对账（Verification Reconciliation），将外部 CI/测试事实登记为正式结果；
- coverage gap 保持真实负向事实，但不自动发展成测试或全局工作阻塞。

验收重点：不能导入调用方声称的成功；所有结果必须绑定精确任务候选、内容目标与声明身份。

### 6. Task Finish 与 Git/PR 交付

目标：继续完成已经启动的“自动交付 + 外部交付对账”架构收敛。

重构方向：

- 自动 Finish、直接 Git、PR 和其他已授权路径都消费同一 Development Handoff；
- Buildr 从真实 remote target 验证 Task Contribution 并登记 Delivery；
- Delivery、Activation、Environment Cleanup 与 Diagnostics 保持正交；
- 激活或 Doctor 待处理不撤销交付，也不阻止可独立证明安全的清理；
- 多 repository 各自保存 delivery/activation/cleanup 事实，局部失败不撤销其他 repository 的结果；
- Buildr 内部遗漏的可重建 evidence 通过重新观察修复，不要求重新交付业务代码；
- 清理无法证明 ownership 或 remote containment 时继续硬阻断；
- 清理失败只保留现场和待处理，不把已交付 Task 重新变成未交付。

验收重点：清理、激活、诊断和 Delivery 的状态与 UI 表达一致；旧规范中与新正交模型冲突的条款全部清理。

### 7. OpenSpec、Current Knowledge 与 Terminology

目标：提供确定性自动化与一致性检查，但不把某个自动路径变成唯一合法语义路径。

重构方向：

- `openspec converge` 继续作为安全、原子、可恢复的自动收敛路径；
- Agent 可以直接完成语义修订，再由 Buildr 观察 canonical specs 是否已经满足 Change；
- 增加 OpenSpec Reconciliation，登记外部/manual convergence 与 archive eligibility；
- 真实 canonical conflict、identity ambiguity 和覆盖风险继续 fail closed；
- Current Knowledge unresolved 按行为契约冲突、解释性漂移、无关历史债务分级；
- 只有会造成错误完成结论的当前契约冲突阻止 handoff；
- 解释性文档问题形成待处理，无关债务进入后续任务，不阻止安全推送或清理；
- 中文术语首次使用“中文（English Term）”，后续使用中文；glossary 只维护稳定长期定义。

验收重点：Roadmap、current knowledge、canonical specs 和 archive 各自保持权威边界，不建立第二套规范。

### 8. Doctor、Capability 与 Workspace Sync

目标：从全局健康许可改为动作局部诊断和局部收敛。

重构方向：

- Doctor 输出 Workspace、Project/Service、Runtime、Component、Command、Git 等分域健康结果；
- 保留可用于摘要展示的总体 health，但任何消费方必须声明自己读取哪些 findings；
- 删除“所有 actionable finding 为零才允许工作”的通用含义；
- final Doctor 只对明确要求整体完成的产品动作构成验收，例如 `init`、完整 `sync` 或正式自举激活；
- Workspace sync 按资产 ownership unit 规划和提交；
- optional 资产需要决定时只保留该资产，不阻止 required/无关资产同步；
- 共享 manifest 或 transaction 确实无法局部分离时，才停止对应原子批次；
- capability route blocked 只影响当前 consumer，不扩大为 Buildr Skill 或 Workspace blocked。

验收重点：所有 `health.ready` 消费方完成审计，不再隐式把聚合值当作全局许可。

### 9. Buildr Web 与人机界面

目标：人看到目标、结果、风险和必要决定，Agent 处理内部流程与恢复细节。

重构方向：

- 页面优先展示“已交付”“激活需处理”“清理待处理”等用户可理解结果；
- 候选代次、结果摘要、续跑令牌、回执身份等仅在诊断详情中提供给 Agent；
- 人不需要选择内部 workflow 分支或理解 Buildr 缺陷；
- Buildr Web 继续调用同一 Application，不建立第二 writer；
- 页面 mutation 只承载适合人的业务操作，不暴露内部状态机 patch；
- 所有页面面向用户展示的内部文档引用统一使用具名的 Workspace 相对 Markdown 链接，不以裸路径冒充引用；
- 所有页面复用同一文档引用解析、Project/Service scope 校验、可读性检查和打开方式，不在各页面重复实现私有规则；
- 文档当前不可读时保留具名引用并展示真实状态与原因，不静默降级为普通文字，也不声称正文存在；
- 恢复建议默认面向 Agent，可复制命令只作为人工兜底。

验收重点：用户无需理解内部模块即可判断任务是否交付、是否仍有风险、是否需要授权；任一页面中的内部文档引用都能一致打开或明确说明当前为何不可读。

### 10. 测试、Product Candidate 与 Release

目标：测试保护不变量和多路径结果，发布门禁保护不可逆公共副作用，同时降低无价值重复执行。

重构方向：

- 删除只验证 Skill 包含固定流程措辞的脆弱测试；
- 契约测试改为验证 authority、authorization、scope、evidence、effects 和 failure isolation；
- 为 Buildr 自动路径、Agent 直接路径、PR/CI 路径和 Reconciliation 建立等价结果测试；
- 增加无关模块失败不阻塞当前动作的反例测试；
- 开发阶段使用 focused/affected 反馈，内容冻结后只运行一次完整 Product Candidate；
- 同一次 Candidate 内继续复用唯一 tarball、去重 DAG 和并行 shard；
- 优化 Environment、worktree、Finish journey、Workspace lifecycle 等重型 fixture；
- 任务候选（Task Candidate）与产品候选验证（Product Candidate Verification）保持术语和生命周期分离；
- Release Candidate 与正式发布继续完整验证 authority、tag、OIDC、npm integrity、公开 readback 和安装后 smoke；
- 不以性能优化为由削弱不可逆发布门禁。

验收重点：最终发布证据仍严格、完整、可追溯；普通任务和开发反馈不重复承担发布级验证成本。

## 重构工作包

后续子任务按以下贡献（Contribution）拆分。每个子任务只承担一个清晰结果，可再根据实现规模拆成更窄的 Change，但不得混合无关领域。

| ID | 优先级 | 工作包 | 依赖 |
|---|---|---|---|
| `gate-taxonomy` | P0 | 建立门禁分类、动作局部就绪和安全降级规范，清理互相冲突的基础契约 | 无 |
| `finish-contract-convergence` | P0 | 收敛 Finish 正交结果、多仓库续跑与旧规范冲突 | `gate-taxonomy` |
| `task-admission-environment` | P0 | 解除 Formal Task/Environment 的通用工作许可，保留资源与清理 authority | `gate-taxonomy` |
| `development-evidence-flow` | P0 | 重构 Development、Candidate、Review、Verification 顺序和外部验证对账 | `gate-taxonomy`、`task-admission-environment` |
| `doctor-sync-isolation` | P0 | 将 Doctor、capability、Component 和 sync 改为动作局部阻塞 | `gate-taxonomy` |
| `workspace-source-model` | P1 | 支持 Project/Service attached roots，调整资产维护与安全删除默认值 | `gate-taxonomy`、`doctor-sync-isolation` |
| `openspec-knowledge-reconciliation` | P1 | 增加 OpenSpec/manual reconciliation，分级 Current Knowledge 影响 | `gate-taxonomy`、`development-evidence-flow` |
| `task-coordination-and-ui` | P1 | 优化终态修复、Parent/Child 使用边界、Declaration Intake 和人机界面 | 前述 Task 模块工作包 |
| `verification-candidate-release-quality` | P1 | 重写流程服从型测试、补多路径反例、降低 Candidate/Release 重复成本 | 所有改变公共行为的工作包 |

## 子任务实施规则

每个 Child Task 必须：

1. 绑定本 Parent Task，并只承担一个或一组强相关 Contribution；
2. 先核对当前规范、实现、Skill、CLI、Buildr Web 和测试，不把本文直接当作行为契约；
3. 明确本次保留、删除和降级的门禁，以及各自保护的不变量；
4. 明确 Buildr 不可用或内部登记失败时的 Agent 安全降级路径；
5. 对改变可观察行为的工作建立独立 OpenSpec Change；
6. 同步规范、实现、测试、Skill 和 current knowledge 中真正受影响的资产；
7. 增加至少一条 alternate path 或 unrelated failure isolation 验证；
8. 不为追求“更智能”而放松授权、目标身份、证据真实性、共享历史和安全删除边界；
9. 完成后形成可核验 Contribution Handoff，由 Parent 动态读取结果，不手工维护第二份进度表。

## 迁移与兼容原则

- 优先增加新读模型、新 reconciliation 入口和局部状态，再移除旧全局 gate；
- 旧回执、结果和任务记录只读兼容，不批量猜测或回填不存在的事实；
- 不把一次数据库 migration 当作语义迁移的充分证据；
- 旧 CLI 参数可以在有界周期兼容，但帮助、Skill 和新输出只传播新模型；
- 任何自动修复必须从权威事实重建，不信任 caller claimed success；
- 受影响的 Buildr Web 页面与 CLI JSON contract 需要一起迁移；
- 每个 Child 都必须说明 rollback 或安全停止方式，避免半迁移状态扩大影响。

## 最终验收

Parent Task 的最终集成验收至少满足：

- 所有现存硬门禁已完成分类，并能说明不变量、伤害、作用范围和安全降级；
- Workspace、Project、Service、Task、Environment、Development、Verification、Finish、OpenSpec、Doctor 与测试不再存在互相冲突的责任描述；
- Agent 可以选择 Buildr 自动化、直接 Git、PR/CI 或其他已授权路径，并通过统一观察与对账形成相同专业结果；
- Buildr 内部登记缺失、局部模块失败或可重建 evidence 丢失，不再否定外部权威事实或阻止无关工作；
- Delivery、Activation、Cleanup 与 Diagnostics 在规范、实现、CLI JSON、Buildr Web 和测试中保持正交；
- Project/Service 能表达现有外部仓库而不要求搬迁，所有权与删除边界仍可证明；
- Review/Verification 与 Candidate 绑定当前内容，但不强制 Agent 遵循固定执行顺序；
- Doctor 与 capability readiness 只影响实际消费动作，不作为全局工作许可；
- 测试主要验证结果不变量、多路径一致性和失败隔离，不再主要验证固定流程措辞；
- Product Candidate 和 Release 的最终不可逆门禁保持完整，且没有无价值的重复完整执行；
- 人只需要理解目标、结果、风险和必要授权，不需要诊断 Buildr 内部流程；
- Buildr Core、产品架构、canonical specs、Skills、实现、测试、current knowledge 和术语表最终一致。

## 非目标

本轮重构不以以下方向为目标：

- 把 Buildr 变成通用 Agent runtime、任务调度平台或多智能体系统；
- 让 Buildr 自动做业务判断、冲突语义判断或风险接受；
- 取消所有状态、回执、结果、身份、租约或事务；
- 允许 Agent 绕过授权、ownership、远端 containment、证据真实性或安全删除；
- 用一个新的大状态机替换现有状态机；
- 把 Roadmap 文档变成规范、Rule、Skill 或实现任务清单的第二 authority；
- 为兼容旧行为永久保留互相矛盾的产品模型。

## 维护方式

本文只维护稳定目标、工作包边界和最终验收。具体 Child 状态、Change 进度、验证结果和交付事实由 Task Record、Parent/Child、Development、Review、Verification、Finish 与 OpenSpec 各自 authority 提供，不在本文勾选进度。

当某个工作包完成后：

- 以实现和 canonical specs 更新 current knowledge；
- 如果目标方向发生实质变化，显式 reconcile Parent Plan 和本文；
- 如果工作包被放弃或替代，记录原因并调整依赖，不伪装为已完成；
- 全部工作包完成后，由 Parent 执行最终集成验收，再决定 Parent Task 终态。
