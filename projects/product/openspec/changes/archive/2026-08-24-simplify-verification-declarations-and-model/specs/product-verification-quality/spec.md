## ADDED Requirements

### Requirement: Product 验证模型必须使用三个正交问题
Buildr Product MUST 将验证模型分别表达为证据执行边界、选择范围和验证对象/决策节点。证据边界 MUST 使用 Static、Unit、Component、Integration、System；选择范围 MUST 使用 affected 或 full；验证对象 MUST 区分 frozen Task Content、Product Artifact Candidate 和 Published Release。Quick MUST 只表示开发期低成本反馈，不得作为正式 Task Verification Result。

#### Scenario: 用户解释普通 Task Delivery
- **WHEN** 用户查询一次普通 Product Task 为什么执行这些验证
- **THEN** 系统和权威文档 MUST 能分别说明使用的证据边界、affected/full 选择范围、frozen Task Content 对象和 Task Delivery 决策
- **AND** 用户 MUST NOT 需要把 Core、Candidate 或 Release 当作与 affected 并列的选择类型

#### Scenario: Quick 开发反馈完成
- **WHEN** 开发者运行 `product.fast` 或 `test:fast`
- **THEN** 结果 MUST 明确只提供低成本开发反馈
- **AND** 该结果 MUST NOT 被投射为 formal Task Verification Result、完整 daily-full 或 Product Artifact Candidate evidence

### Requirement: 公开 capability 必须声明验证对象、选择范围和决策
Product `verification.yml` 中每个稳定公开 capability MUST 让用户识别验证对象、默认选择范围、支持的决定、环境和副作用；registry MUST 继续唯一持有具体 evidence step、dependency、profile membership、resource、budget 与 primary owner。声明、文档或兼容入口 MUST NOT复制第二份 execution graph authority。

#### Scenario: Task Delivery 默认选择 affected
- **WHEN** `product.delivery` 验证 frozen Task Content 且 changed inputs 未命中必须 full 的 authority
- **THEN** planner MUST 默认选择可信 affected evidence
- **AND** capability 说明 MUST 将结果绑定 Task Delivery 决策而不是 Product Artifact Candidate 或 Published Release

#### Scenario: Task Delivery 合法升级 full
- **WHEN** changed inputs 修改 planner、registry、execution ownership authority 或其他无法安全局部判断的关键输入
- **THEN** planner MUST fail closed 地选择完整 daily-full evidence set 或阻断
- **AND** plan MUST 输出稳定 reason code、触发 path 与用户可理解的 authority 原因

#### Scenario: 声明不复制 execution graph
- **WHEN** 维护者审查 `verification.yml` 与 verification registry
- **THEN** 声明 MUST 只描述 capability 级对象、选择、决策、环境与副作用
- **AND** 具体 step membership、dependency、resource、budget 与 primary evidence owner MUST 只从唯一 registry 取得

### Requirement: Task Content 与 Product Artifact Candidate 必须语义隔离
Product 验证用户模型 MUST 将普通 Task Delivery 的内容对象称为 frozen Task Content 或 Task Content Target，并 MUST 将 Product Artifact Candidate 限定为 exact source 与唯一候选制品。内部 Task Development 的 Task Candidate identity MAY 继续作为 lifecycle 兼容 authority，但不得被描述为 Product Artifact Candidate 或发布制品。

#### Scenario: 冻结普通 Task 内容
- **WHEN** Task Development 冻结 Content Target 并形成内部 Task Candidate identity
- **THEN** Product verification capability MUST 将待证明对象描述为 frozen Task Content
- **AND** MUST NOT 暗示已经生成 Product Artifact Candidate、tarball 或发布资格

#### Scenario: 验证 Product Artifact Candidate
- **WHEN** `product.candidate` 对 exact Product source 和唯一候选制品执行
- **THEN** plan MUST 包含完整 daily evidence 与适用 artifact/package/install compatibility evidence
- **AND** 结果 MUST 与内部 Task Candidate identity、affected feedback 和正式 Published Release evidence 区分

### Requirement: daily-full、Product Artifact Candidate 与 Published Release 必须分离新增证据
Buildr Product MUST 让 daily-full 只包含完整日常证据；Product Artifact Candidate MUST 在完整日常证据上增加 exact artifact、package、install 和 compatibility evidence；Published Release MUST 复用 matching verified Candidate 并只增加 publish、published install/launcher smoke 与 registry/readback 等 Release-only evidence。普通 Task daily-full MUST NOT吸收 Candidate-only 或 Release-only primary evidence。

#### Scenario: 执行完整日常证据
- **WHEN** `product.full-regression` 或合法 Full 升级运行 daily-full
- **THEN** plan MUST 选择唯一 registry 中完整日常 evidence set
- **AND** MUST NOT选择 tarball、package install、Launcher、publish、release smoke 或 registry readback primary evidence

#### Scenario: 形成 Product Artifact Candidate
- **WHEN** `product.candidate` 验证 exact source 与候选制品
- **THEN** verifier MUST 运行完整 daily evidence 与 Candidate artifact evidence
- **AND** MUST 保持唯一 Candidate generation、tarball identity 和既有 Host Node/Launcher/package coverage

#### Scenario: 验证 Published Release
- **WHEN** 正式 Release workflow 消费 matching verified Candidate
- **THEN** workflow MUST 针对实际发布物和发布结果执行 Release-only evidence
- **AND** MUST NOT 重跑或重建另一份 Candidate 来替代 matching artifact、publish transaction 或 readback authority

## MODIFIED Requirements

### Requirement: 核心 Full 与正式 Candidate/Release 必须保持唯一证据责任
Buildr Product MUST 在同一 verification registry 中维护完整日常 evidence set 与 complete candidate membership，并 MUST 让本地 Candidate、Candidate CI aggregate 和正式 Release workflow 消费同一 candidate graph与唯一tarball identity。公开模型 MUST 将完整日常集合称为 daily-full；既有 `core` profile、`test:core`、plan schema和历史timing identity只作为兼容投射。Lane 分离 MUST NOT创建第二个Candidate producer、复制release source/generation，或用daily-full结果替代Hosted Windows、Host Node、Launcher、npm integrity和公开readback evidence。

#### Scenario: 执行日常核心 Full
- **WHEN** changed Full 或 `product.full-regression` 选择 daily-full evidence set
- **THEN** plan MUST 返回 full scope reason、完整日常 step 集合和 budget feasibility
- **AND** plan MUST NOT选择 candidate-only artifact、package、Launcher、fresh-install 或 Release smoke step
- **AND** 兼容输出中的 `core` identity MUST 能诊断为同一 daily-full evidence set而不是第四个验证维度

#### Scenario: Parent 最终集成需要完整 Product Candidate
- **WHEN** Parent integration 或维护者需要验证 exact Product source与候选制品
- **THEN** verification policy MUST 显式选择 `product.candidate`
- **AND** 该 capability MUST执行原有 complete candidate profile，不得把 `product.full-regression` 的 daily-full结果重标记为 Candidate artifact evidence

#### Scenario: 正式 Release 消费 Candidate
- **WHEN** publish workflow 接收 matching Candidate run 与 release context
- **THEN** workflow MUST下载并验证 Candidate aggregate 和同一次 Candidate 生成的唯一 tarball
- **AND** Hosted Windows、Host Node、Launcher、npm publish、GitHub Release 与 Registry readback MUST继续绑定该 Candidate source、generation、registry和artifact identities
- **AND** workflow MUST NOT重跑daily-full来替代任一正式Candidate/Release evidence

#### Scenario: 定点验证 release group
- **WHEN** 维护者运行 `product.release-artifact-set` 或 `test:focus -- group:release`
- **THEN** verifier MUST复用统一registry的release owners及其真实依赖
- **AND** 该focused结果 MUST NOT被描述为完整Product Artifact Candidate aggregate或正式Published Release evidence
