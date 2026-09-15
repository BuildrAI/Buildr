# current-knowledge-maintenance Specification

## Purpose
定义 Buildr Project 当前认知的文档职责、事实来源边界、按真实影响维护机制，以及 current-knowledge capability 的行为契约。
## Requirements

### Requirement: Project 当前认知必须按信息职责组织
Buildr Project MUST 允许在 Product 根 `knowledge/` 按 `docs/overview.md`、`docs/glossary.md`、`docs/architecture/index.md`、`docs/architecture/product.md`、`docs/architecture/technical.md`、`docs/flows/<flow-id>.md`、`docs/services/<service-code>.md` 和职责清晰的 `archify/` 组织当前认知，`code-map/` 表达实现映射、`archify/` 保存技术图、`docs/` 保存解释文档；文件 MUST 只在存在已确认真实内容或当前 Change 真实影响时创建或更新，MUST NOT 机械生成空文档。

#### Scenario: Change 首次影响技术架构
- **WHEN** 已确认 Change 改变 Service 拓扑、模块边界、数据所有权、接口依赖、runtime、部署或安全事实，且技术架构文档尚不存在
- **THEN** Agent MUST 根据理解、维护与协作价值判断建设范围，并在已有建设授权内创建 `knowledge/docs/architecture/technical.md`；尚未授权时 MUST 提出具体建设建议，不阻止无关实施
- **AND** MUST NOT 同时为空白产品架构、流程或 Service 创建占位文件

#### Scenario: 产品与技术架构同时存在
- **WHEN** Project 已有产品架构和技术架构文档
- **THEN** `knowledge/docs/architecture/index.md` MUST 提供面向人的架构摘要和两个稳定入口
- **AND** 产品架构 MUST 负责用户、角色、业务能力、领域模块、产品边界和信息架构，技术架构 MUST 负责系统、Service、模块、数据、接口依赖和运行边界

#### Scenario: 核心流程横跨产品与技术视角
- **WHEN** 当前事实描述跨角色、模块或 Service 的关键顺序、状态或异常路径
- **THEN** Agent MUST 优先在 `knowledge/docs/flows/<flow-id>.md` 维护该流程并由相关架构文档引用
- **AND** MUST NOT 在产品架构和技术架构中复制两份完整流程作为并列事实源

### Requirement: 当前认知必须保持事实来源边界
Current knowledge MUST 解释 Product 根 `knowledge/` 中有来源的当前说明与映射但 MUST NOT 替代 canonical specs；发生冲突时 MUST 依次核对 canonical specs、当前实现与 registries、active Change artifacts、已确认 evidence，并只能将 archived Changes 与既有历史任务页面作为历史来源线索。

#### Scenario: knowledge 与 canonical spec 冲突
- **WHEN** 当前认知陈述与 canonical Requirement 不一致
- **THEN** Agent MUST 先确认规范或实现哪一方需要修正
- **AND** MUST NOT 通过只改 `knowledge/` 掩盖规范冲突

#### Scenario: archive 包含旧行为
- **WHEN** archived Change 描述的行为已被后续 canonical spec 或实现替代
- **THEN** current knowledge MUST 表达当前行为
- **AND** MUST NOT 因历史 Change 存在而继续把旧行为当作当前事实

#### Scenario: task board 表达任务认知
- **WHEN** `openspec/knowledge/task-boards/` 或 `openspec/knowledge/task-cockpits/` 历史页面与 `knowledge/` 当前认知同时存在
- **THEN** current knowledge maintenance MUST 将这些页面仅作为历史旁证，不得继续维护其工作状态
- **AND** `knowledge/README.md`、`knowledge/docs/overview.md`、`knowledge/docs/architecture/`、`knowledge/docs/flows/`、`knowledge/docs/services/`、`knowledge/docs/glossary.md`、canonical specs 与各专业 read model MUST 保持各自当前事实职责

### Requirement: 当前认知必须支持独立事实收敛
Buildr MUST 允许 Agent 在没有 OpenSpec Change 时，对已由 canonical specs、当前实现、registries 或已确认决定证明的 Project 当前事实执行 `maintain`；该 operation MUST 只更新真实受影响的 current knowledge，MUST NOT 引入新业务语义、创建 Brief 或 Change sidecar。

#### Scenario: 已有事实缺少解释性文档
- **WHEN** 当前行为和 authority 已明确，但 overview、architecture、flow、service 或 glossary 缺失、陈旧或表述错误
- **THEN** provider MUST 在明确建设或维护授权内依据 fact sources 创建或更新真实受影响成果；只有检查授权时 MUST 报告建议与实际未完成范围
- **AND** MUST 返回 changed assets、source identities 与已观察来源版本与目标范围

#### Scenario: 维护中发现需要新业务决定
- **WHEN** 候选文档内容会改变 canonical Requirement、API、状态流、权限、业务规则或数据语义
- **THEN** provider MUST 返回 `change-required` 并停止写入该候选事实
- **AND** consumer MUST 重新进入 `change-flow`

#### Scenario: Authority 无法确认
- **WHEN** canonical specs、实现、registries 或已确认决定之间存在当前授权无法解决的冲突
- **THEN** provider MUST 返回局部 `blocked`、冲突来源和最少决策问题
- **AND** MUST NOT 通过只改 knowledge 选择任意一方

### Requirement: Buildr 必须提供当前认知维护能力契约
Buildr MUST 提供 `buildr.current-knowledge-maintenance/v3` 协作约定（Capability Contract）和默认技能（Skill），支持 `assess|reconcile|inspect|maintain`；内置调用方 MUST 同步采用 v3，默认包 MUST 退役 v1/v2 的提供与绑定声明。术语治理 MUST 作为可选依赖，仅在实际术语影响需要时消费已选提供者（Provider）。

#### Scenario: 评估 Change 影响
- **WHEN** v3 consumer 请求 `assess`
- **THEN** provider MUST 分类本次 Brief、代码地图、技术图和解释文档的可能影响、目标与理由
- **AND** 无真实影响的目标 MUST NOT 被转化为空文档任务

#### Scenario: 收敛最终事实
- **WHEN** implementation content 已完成且 v3 consumer 请求 `reconcile`
- **THEN** provider MUST 按最终 specs、实现、registries、Brief 和现有 knowledge 完成已授权的实际受影响资产；新建授权以明确成果范围为准
- **AND** provider MUST 仅在真实术语影响下使用绑定的 terminology capability 解决或披露术语影响

#### Scenario: 检查收尾就绪
- **WHEN** Task Finish 请求 `inspect`
- **THEN** provider MUST 核对 assess impacts 已处理、Brief 与权威 artifacts 一致、current knowledge 对应最终 tree ，并按实际术语影响检查适用结果
- **AND** 仅会导致相关动作产生错误结论、越权或覆盖他人工作的问题 MUST 返回局部阻塞和具体下一步；辅助记录缺失或非关键漂移 MUST 作为提醒

#### Scenario: 独立维护当前事实
- **WHEN** v3 consumer 请求 `maintain` 并提供 Project、targets、fact sources、授权范围和 tree identity
- **THEN** provider MUST 只维护已确认且真实受影响的 current knowledge
- **AND** result MUST 逐项明确为 `aligned`、`updated`、`attention`、`blocked`、`not-applicable` 或 `change-required`

### Requirement: Knowledge impact sidecar 必须只承载工作流证据
Provider MAY 在 Change 的 `.buildr/knowledge-impact.yml` 保存版本化 evidence；sidecar MUST 记录 change、动作、影响类型、目标、理由、处理状态、来源 identity 和 unresolved items，MUST NOT 作为 Project 当前事实或规范行为来源。

#### Scenario: assess 产生影响清单
- **WHEN** provider 识别到当前 Change 影响一个或多个知识目标且选择使用 sidecar
- **THEN** sidecar MUST 记录每个影响的稳定类型、目标、理由和 pending 状态
- **AND** tasks MUST 将真实维护工作表达为可执行任务

#### Scenario: reconcile 完成维护
- **WHEN** provider 已更新或确认一个目标且已有 sidecar
- **THEN** sidecar MUST 记录对应状态和用于判断的 source identities
- **AND** evidence MUST 保留逐项处理状态和未解决项，不能替代实际成果

#### Scenario: Change 归档
- **WHEN** 已对齐的 Change 带有 sidecar 且被 OpenSpec archive
- **THEN** sidecar MUST 随 Change 一起归档作为过程证据
- **AND** archive 动作 MUST NOT 附带当前知识写入；后续独立维护 MUST 重新核对当前事实与授权，不修改 archived Change

### Requirement: 当前认知维护必须按真实变更触发
Provider MUST 从用户目标、真实事实变化或明确检查范围出发，在相关范围发现已有地图、技术图和解释文档，再判断维护目标；已知目标直接读取，普通任务 MUST NOT 全盘扫描。文件或版本变化只触发影响判断。稳定影响线索包括：项目定位、用户、核心能力或全局入口影响 overview；角色、业务能力、领域模块、产品边界或信息架构影响 product architecture；Service 拓扑、模块边界、数据所有权、接口依赖、runtime、部署或安全影响 technical architecture；用户旅程、业务状态、跨模块/Service 顺序或关键异常影响 flows；Service 职责、API/事件、数据、依赖、配置或运行要求影响 services；新增、重定义、重命名、歧义、中英不一致或所有权变化影响 glossary。

#### Scenario: 普通内部重构不改变长期事实
- **WHEN** Change 只调整内部实现且不改变任何已声明影响类型
- **THEN** provider MUST 返回 `not-applicable` 或确认现有资产 aligned
- **AND** MUST NOT 为该重构机械改写 overview、architecture、flows、services 或 glossary

#### Scenario: 实现中发现新影响
- **WHEN** apply 阶段发现 proposal assess 未识别的真实长期事实变化
- **THEN** Agent MUST 把新影响加入 tasks 及已采用的 sidecar 并维护对应权威资产
- **AND** reconcile MUST 覆盖更新后的完整影响集合

#### Scenario: 当前 Change 暴露无关历史知识债务
- **WHEN** Agent 发现与本 Change 无直接关系的缺失或陈旧知识
- **THEN** provider MUST 记录可追踪 follow-up 信号而不是扩大当前 Change 范围
- **AND** 当前 Change 仍 MUST 修复会直接导致其 Brief、术语或受影响知识错误的冲突

### Requirement: Current Knowledge 必须按完成结论影响分类
Current Knowledge provider MUST在逐项结果中区分`aligned|updated|not-applicable|attention|blocked|change-required`。只有canonical spec、实现、registry、Brief或current knowledge冲突会造成当前Task错误完成结论时 MUST返回`blocked`；结果 MUST直接交给Agent判断，不得写入Development Receipt、统一decision或handoff。

#### Scenario: completion-critical conflict
- **WHEN** 当前知识与authority冲突会遗漏必要行为、风险、兼容性或验收事实
- **THEN** provider MUST返回`blocked`、冲突source identities与最小unresolved items
- **AND** Agent MUST只停止实际依赖该冲突的动作并保留无关工作

#### Scenario: explanatory drift
- **WHEN** 文档表述陈旧但不改变当前Task行为、authority、风险或完成判断
- **THEN** provider MUST返回`attention`与follow-up摘要
- **AND** Agent MUST允许当前Task继续完成，不得把attention升级为全局ready/blocked

#### Scenario: current tree已对齐
- **WHEN** Brief、受影响current knowledge、terminology与权威facts均对应current tree
- **THEN** provider MUST返回`aligned`或真实`not-applicable`
- **AND** MUST包含scope与source identities供Agent核对

### Requirement: Current Knowledge 不得规定固定研发顺序
Current Knowledge provider MUST允许Agent在实现、Review或Verification前后按需调用`assess|reconcile|inspect`，并 MUST以明确scope与source identities表达结果范围。Provider MUST NOT把调用顺序、sidecar、文档完整度或自己的结果提升为Candidate、Verification、Review、交付或Task完成authority。

#### Scenario: Verification后发现解释性漂移
- **WHEN** Task Verification后provider发现只构成attention的解释性漂移
- **THEN** Agent MAY保留该结果并继续其他动作
- **AND** MUST不要求重复Verification或创建统一推进状态

#### Scenario: reconcile改变delivery bytes
- **WHEN** provider修订Brief或current knowledge并改变实际内容
- **THEN** Agent MUST重新核对受影响Review、Verification和交付依据；仅更新解释文档时 MUST检查文档与引用并复用仍适用于当前代码和运行条件的代码测试，不重跑无关验证
- **AND** MUST不以provider aligned声明复用旧bytes绑定的证据

### Requirement: 三类成果必须可发现并可核验
当前知识维护（Current Knowledge Maintenance）MUST 统一支持代码地图（Code Map）、技术图（Technical Diagram）和解释文档（Explanatory Documentation）的建设与维护。解释文档 MUST 按目标覆盖产品概览、核心概念与术语、产品和技术架构、关键业务流程、服务或重要模块说明，以及按需的使用、开发与运行指南，不强制每类创建文件。每份受维护成果 MUST 在自身或明确导航中说明覆盖范围、来源路径与必要符号、包含和不包含的内容以及关联成果。地图与技术图 MUST 不复制整份代码或建立逐行索引；解释文档 MUST 可以直接引用事实来源。摘录 MUST 标明来源与适用范围，来源相关内容变化时 MUST 核对摘录，避免无人维护的第二份正文。

#### Scenario: 事实变化影响已有映射
- **WHEN** 真实代码或规范变化影响已存在成果中的职责、关系或关键陈述
- **THEN** 智能体 MUST 定位相关成果并只更新实际受影响内容，核对来源与相关引用

#### Scenario: 来源变化而成果仍适用
- **WHEN** 文件版本变化但成果所表达的职责、符号与关系仍然正确
- **THEN** 智能体 MUST 记录已检查且无需修改的结论，不重建成果或重复无关测试

#### Scenario: 规范与实现存在真实冲突
- **WHEN** 规范承诺与实际实现不一致且尚未解决
- **THEN** 智能体 MUST 显式说明双方证据与不确定结论，停止依赖该确定结论的写入，不通过改写映射掩盖冲突

### Requirement: 新建成果必须按价值和具体范围承接授权
文件缺失 MUST 仅作为建设线索；智能体 MUST 根据理解、维护与协作价值提出具体覆盖、文件、视角、来源和用途。已有明确的一组成果建设授权 MUST 连续执行；日常任务发现范围外缺口 MUST 在新建前取得对应授权。持续维护 MUST 仅限用户明确指定范围，MUST NOT 从本次授权推导永久全项目授权。

#### Scenario: 有价值的缺口尚未授权
- **WHEN** 日常维护发现范围外有价值地图缺失但没有新建授权
- **THEN** 智能体 MUST 提出具体建设建议并报告尚未完成，不创建空文件，不阻止无关开发与交付

#### Scenario: 建设范围已经授权
- **WHEN** 用户明确授权为一个模块建设地图、技术图与解释文档
- **THEN** 智能体 MUST 自行确定具体文件并连续完成、验证和交付，不逐文件询问，不要求先创建 brief.md

### Requirement: 成果验证必须局部且能证明实际结果
地图 MUST 核对路径、符号、职责、调用、数据归属与副作用；技术图 MUST 核对关系依据、图源与展示一致性并实际检查必要视觉与交互；解释文档 MUST 核对关键陈述、链接与未来方向标注；迁移 MUST 更新实际消费者和入口并保留历史。结果 MUST 说明实际修改、来源、覆盖、未覆盖和必要后续动作，不用内部登记成功代替成果完成。

#### Scenario: 仅修改解释文档
- **WHEN** 修改没有改变代码、测试输入或运行条件
- **THEN** 智能体 MUST 验证修改后的文档和引用并复用适用的代码测试，不重复无关代码测试，也不将旧文档的检查冒充新文档已验证

#### Scenario: 单项成果未完成
- **WHEN** 一组成果中一项缺少事实或未通过相关检查
- **THEN** 智能体 MUST 标明该项限制与受影响动作，保留其他已完成成果和无关工作，不声称整组建设已完成
