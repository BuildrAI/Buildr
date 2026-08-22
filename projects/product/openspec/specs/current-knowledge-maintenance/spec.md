# current-knowledge-maintenance Specification

## Purpose
定义 Buildr Project 当前认知的文档职责、事实来源边界、按真实影响维护机制，以及 current-knowledge capability 的行为契约。
## Requirements

### Requirement: Project 当前认知必须按信息职责组织
Buildr Project MUST 允许在 `openspec/knowledge/` 按 `overview.md`、`glossary.md`、`architecture/index.md`、`architecture/product.md`、`architecture/technical.md`、`flows/<flow-id>.md` 和 `services/<service-code>.md` 组织当前认知；文件 MUST 只在存在已确认真实内容或当前 Change 真实影响时创建或更新，MUST NOT 机械生成空文档。

#### Scenario: Change 首次影响技术架构
- **WHEN** 已确认 Change 改变 Service 拓扑、模块边界、数据所有权、接口依赖、runtime、部署或安全事实，且技术架构文档尚不存在
- **THEN** Agent MUST 创建 `architecture/technical.md` 并写入本次影响对应的当前事实
- **AND** MUST NOT 同时为空白产品架构、流程或 Service 创建占位文件

#### Scenario: 产品与技术架构同时存在
- **WHEN** Project 已有产品架构和技术架构文档
- **THEN** `architecture/index.md` MUST 提供面向人的架构摘要和两个稳定入口
- **AND** 产品架构 MUST 负责用户、角色、业务能力、领域模块、产品边界和信息架构，技术架构 MUST 负责系统、Service、模块、数据、接口依赖和运行边界

#### Scenario: 核心流程横跨产品与技术视角
- **WHEN** 当前事实描述跨角色、模块或 Service 的关键顺序、状态或异常路径
- **THEN** Agent MUST 优先在 `flows/<flow-id>.md` 维护该流程并由相关架构文档引用
- **AND** MUST NOT 在产品架构和技术架构中复制两份完整流程作为并列事实源

### Requirement: 当前认知必须保持事实来源边界
Current knowledge MUST 解释 Project 当前事实但 MUST NOT 替代 canonical specs；发生冲突时 MUST 依次核对 canonical specs、当前实现与 registries、active Change artifacts、已确认 evidence，并只能将 archived Changes 与既有历史任务页面作为历史来源线索。

#### Scenario: knowledge 与 canonical spec 冲突
- **WHEN** 当前认知陈述与 canonical Requirement 不一致
- **THEN** Agent MUST 先确认规范或实现哪一方需要修正
- **AND** MUST NOT 通过只改 knowledge 掩盖规范冲突

#### Scenario: archive 包含旧行为
- **WHEN** archived Change 描述的行为已被后续 canonical spec 或实现替代
- **THEN** current knowledge MUST 表达当前行为
- **AND** MUST NOT 因历史 Change 存在而继续把旧行为当作当前事实

#### Scenario: task board 表达任务认知
- **WHEN** `task-boards/` 或 `task-cockpits/` 历史页面与当前认知同时存在
- **THEN** current knowledge maintenance MUST 将这些页面仅作为历史旁证，不得继续维护其工作状态
- **AND** overview、architecture、flows、services、glossary、canonical specs 与各专业 read model MUST 保持各自当前事实职责

### Requirement: 当前认知必须支持独立事实收敛
Buildr MUST 允许 Agent 在没有 OpenSpec Change 时，对已由 canonical specs、当前实现、registries 或已确认决定证明的 Project 当前事实执行 `maintain`；该 operation MUST 只更新真实受影响的 current knowledge，MUST NOT 引入新业务语义、创建 Brief 或 Change sidecar。

#### Scenario: 已有事实缺少解释性文档
- **WHEN** 当前行为和 authority 已明确，但 overview、architecture、flow、service 或 glossary 缺失、陈旧或表述错误
- **THEN** provider MUST 依据明确 fact sources 创建或更新真实受影响的当前认知
- **AND** MUST 返回 changed assets、source identities 与当前 tree identity

#### Scenario: 维护中发现需要新业务决定
- **WHEN** 候选文档内容会改变 canonical Requirement、API、状态流、权限、业务规则或数据语义
- **THEN** provider MUST 返回 `change-required` 并停止写入该候选事实
- **AND** consumer MUST 重新进入 `change-flow`

#### Scenario: Authority 无法确认
- **WHEN** canonical specs、实现、registries 或已确认决定之间存在当前授权无法解决的冲突
- **THEN** provider MUST 返回 `unresolved` 和最少决策问题
- **AND** MUST NOT 通过只改 knowledge 选择任意一方

### Requirement: Buildr 必须提供当前认知维护能力契约
Buildr MUST 提供兼容的 `buildr.current-knowledge-maintenance/v1` 与 `v2` capability contracts 和默认 workspace Skill provider；v1 MUST 保持 `assess`、`reconcile` 和 `inspect` 三种 Change lifecycle actions，v2 MUST 增加独立 `maintain` 及其授权、副作用、失败语义和 result evidence。默认 provider MUST 同时提供 v1/v2，并 required 依赖 `buildr.terminology-governance/v1`。

#### Scenario: 评估 Change 影响
- **WHEN** v1 或 v2 consumer 请求 `assess`
- **THEN** provider MUST 分类 Brief、overview、product architecture、technical architecture、flows、services 和 glossary 的可能影响、目标与理由
- **AND** 无真实影响的目标 MUST NOT 被转化为空文档任务

#### Scenario: 收敛最终事实
- **WHEN** implementation content 已完成且 v1 或 v2 consumer 请求 `reconcile`
- **THEN** provider MUST 按最终 specs、实现、registries、Brief 和现有 knowledge 创建或更新实际受影响资产
- **AND** provider MUST 使用绑定的 terminology capability 解决或披露术语影响

#### Scenario: 检查收尾就绪
- **WHEN** Task Finish 请求 `inspect`
- **THEN** provider MUST 核对 assess impacts 已处理、Brief 与权威 artifacts 一致、current knowledge 对应最终 tree 且没有 unresolved terms
- **AND** 任一 required 条件不满足时 MUST 返回阻塞结果和可执行下一步

#### Scenario: 独立维护当前事实
- **WHEN** v2 consumer 请求 `maintain` 并提供 Project、targets、fact sources、授权范围和 tree identity
- **THEN** provider MUST 只维护已确认且真实受影响的 current knowledge
- **AND** result MUST 明确为 `aligned`、`updated`、`unresolved`、`not-applicable` 或 `change-required`

### Requirement: Knowledge impact sidecar 必须只承载工作流证据
Provider MAY 在 Change 的 `.buildr/knowledge-impact.yml` 保存版本化 evidence；sidecar MUST 记录 change、动作、影响类型、目标、理由、处理状态、来源 identity 和 unresolved items，MUST NOT 作为 Project 当前事实或规范行为来源。

#### Scenario: assess 产生影响清单
- **WHEN** provider 识别到当前 Change 影响一个或多个知识目标
- **THEN** sidecar MUST 记录每个影响的稳定类型、目标、理由和 pending 状态
- **AND** tasks MUST 将真实维护工作表达为可执行任务

#### Scenario: reconcile 完成维护
- **WHEN** provider 已更新或确认一个目标
- **THEN** sidecar MUST 记录对应状态和用于判断的 source identities
- **AND** evidence MUST 能区分 `aligned`、`updated`、`unresolved` 和 `not-applicable`

#### Scenario: Change 归档
- **WHEN** 已对齐的 Change 被 OpenSpec archive
- **THEN** sidecar MUST 随 Change 一起归档作为过程证据
- **AND** archive 后 MUST NOT 触发对 glossary 或 current knowledge 的写入

### Requirement: 当前认知维护必须按真实变更触发
Provider MUST 使用稳定影响规则判断维护目标：项目定位、用户、核心能力或全局入口影响 overview；角色、业务能力、领域模块、产品边界或信息架构影响 product architecture；Service 拓扑、模块边界、数据所有权、接口依赖、runtime、部署或安全影响 technical architecture；用户旅程、业务状态、跨模块/Service 顺序或关键异常影响 flows；Service 职责、API/事件、数据、依赖、配置或运行要求影响 services；新增、重定义、重命名、歧义、中英不一致或所有权变化影响 glossary。

#### Scenario: 普通内部重构不改变长期事实
- **WHEN** Change 只调整内部实现且不改变任何已声明影响类型
- **THEN** provider MUST 返回 `not-applicable` 或确认现有资产 aligned
- **AND** MUST NOT 为该重构机械改写 overview、architecture、flows、services 或 glossary

#### Scenario: 实现中发现新影响
- **WHEN** apply 阶段发现 proposal assess 未识别的真实长期事实变化
- **THEN** Agent MUST 把新影响加入 sidecar 和 tasks 并维护对应权威资产
- **AND** reconcile MUST 覆盖更新后的完整影响集合

#### Scenario: 当前 Change 暴露无关历史知识债务
- **WHEN** Agent 发现与本 Change 无直接关系的缺失或陈旧知识
- **THEN** provider MUST 记录可追踪 follow-up 信号而不是扩大当前 Change 范围
- **AND** 当前 Change 仍 MUST 修复会直接导致其 Brief、术语或受影响知识错误的冲突

### Requirement: Current Knowledge 必须按完成结论影响分类
Current Knowledge provider MUST在`reconcile|inspect`结果中区分`aligned|not-applicable|attention|blocked`。只有canonical spec、实现、registry、Brief或current knowledge冲突会造成当前Task错误完成结论时 MUST返回`blocked`；解释性漂移、无关历史债务或不改变当前行为与authority的缺口 MUST返回`attention`并提供portable follow-up摘要。

#### Scenario: completion-critical conflict
- **WHEN** 当前知识与authority冲突会让handoff遗漏必要行为、风险、兼容性或验收事实
- **THEN** provider MUST返回`blocked`、冲突source identities与最小unresolved items
- **AND** consumer MUST阻止handoff但不得阻止无关开发或只读调查

#### Scenario: explanatory drift
- **WHEN** 文档表述陈旧但不改变当前Task行为、authority、风险或完成判断
- **THEN** provider MUST返回`attention`与follow-up摘要
- **AND** consumer MUST允许当前Task继续完成，不得把attention升级为全局ready/blocked

#### Scenario: current tree已对齐
- **WHEN** Brief、受影响current knowledge、terminology与权威facts均对应current tree
- **THEN** provider MUST返回`aligned`或真实`not-applicable`
- **AND** MUST包含tree identity与source identities供Development保存最小disposition

### Requirement: Current Knowledge 不得规定固定研发顺序
Current Knowledge provider MUST允许consumer在实现、Review或Verification前后按需调用`assess|reconcile|inspect`，并 MUST以current tree identity决定结果适用性。Provider MUST NOT把自己的调用顺序、sidecar存在或文档完整度提升为Candidate、Verification或Review authority。

#### Scenario: Verification后发现解释性漂移
- **WHEN** matching Formal Verification已完成后provider发现只构成attention的解释性漂移
- **THEN** Development MAY保存attention并继续handoff
- **AND** MUST不要求重复Verification或改变Candidate generation

#### Scenario: reconcile改变delivery bytes
- **WHEN** provider修订Brief或current knowledge并改变Content Target
- **THEN** consumer MUST重新观察Content Target并使旧Candidate、Verification、Completion与handoff失效
- **AND** MUST不以provider aligned声明复用旧bytes绑定的证据
