## MODIFIED Requirements

### Requirement: 产品验证必须提供分层入口
Buildr 产品验证 MUST 将测试证据层、主要门禁和故障定位入口明确分离：维护者主要工作流 MUST 收敛为 fast、changed、core 和 candidate 四种门禁，Unit、Component、Contract、Integration 与 System MUST 保留直接定位入口；Fast MUST 只包含可频繁执行的低成本证据，需要多轮真实 Workspace/Git 演进、大量 CLI 子进程或失败恢复矩阵的 verifier MUST 使用独立 affected/full step identity，并 MUST 仍可由 changed/focus 定点选择。Core MUST 表达日常完整回归的 primary evidence，Candidate MUST 在冻结目标上保留完整 Product Candidate 与正式 Release artifact evidence。

#### Scenario: 普通任务运行默认测试
- **WHEN** 维护者或 Agent 在 Product checkout 运行 `npm test` 或 `npm run test:fast`
- **THEN** verifier MUST 运行 Unit、Component、低成本 Contract、架构、canonical spec quality/strict 和全部 runtime adapter 低成本契约
- **AND** verifier MUST NOT 执行完整 CLI/Workspace/System、多轮真实 Git 演进、npm pack/install、网络访问或发布生命周期

#### Scenario: 根据改动运行验证
- **WHEN** 维护者或 Agent 运行 `npm run test:changed`
- **THEN** verifier MUST 根据 Git diff 或显式 Product 路径选择最小验证 DAG
- **AND** 实现路径命中重型 System、recovery/migration 主 owner 时 MUST 选择对应 focused step，不得因其不属于 Fast 或 Core 而跳过
- **AND** 选择与执行语义变化触发 Full 时 MUST 执行 core profile，不得隐式扩展为完整 Candidate/Release lane
- **AND** 计划 MUST 解释每个 step 的选择原因并对未映射路径 fail closed

#### Scenario: 运行日常核心 Full
- **WHEN** 维护者、普通冻结 Task 或 Parent integration feedback 显式运行 `npm run test:core`
- **THEN** verifier MUST 从唯一 registry 运行全部 core profile steps并执行启动前预算准入
- **AND** core MUST NOT生成 Candidate tarball，也不得执行 package、Launcher、Host Node、open-source candidate 或 release smoke primary evidence
- **AND** core 中每个 step MUST 同时属于完整 candidate profile

#### Scenario: 定点重跑 step 或领域
- **WHEN** 维护者运行 `npm run test:focus -- <step-id|group:<group>>...`
- **THEN** verifier MUST 从统一 registry 选择并去重对应 step
- **AND** verifier MUST 只展开真实执行依赖，不得无条件附加完整 Fast、Core 或 Candidate
- **AND** 未知 selector MUST 在启动验证进程前 fail closed

#### Scenario: 定位测试层
- **WHEN** 维护者直接运行 Unit、Component、Contract、Integration 或 System script
- **THEN** 每个入口 MUST 只执行对应证据边界
- **AND** 这些入口 MUST NOT 被描述为独立发布门禁

#### Scenario: 最终候选运行完整验证
- **WHEN** 实现、自然语言资产、生成资产和 review 修订已经冻结
- **THEN** 维护者或 CI MUST 运行 `npm run test:candidate`
- **AND** candidate verifier MUST 直接编排全部 candidate profile steps，包括真实 Integration、System、recovery/migration、Workspace/Git、package 和 Release artifact steps
- **AND** candidate verifier MUST NOT 使用 diff、group、core membership 或 step selector 缩小覆盖范围
- **AND** candidate verifier MUST 保留产品要求的文档、安全、onboarding、package、runtime adapter、release、managed data、Workspace E2E、OpenSpec 门禁及 timing summary

## ADDED Requirements

### Requirement: 核心 Full 与正式 Candidate/Release 必须保持唯一证据责任
Buildr Product MUST 在同一 verification registry 中维护 daily core 与 complete candidate membership，并 MUST 让本地 Candidate、Candidate CI aggregate 和正式 Release workflow 消费同一 candidate graph与唯一 tarball identity。Lane 分离 MUST NOT 创建第二个 Candidate producer、复制 release source/generation，或用 core 结果替代 Hosted Windows、Host Node、Launcher、npm integrity 和公开 readback evidence。

#### Scenario: 执行日常核心 Full
- **WHEN** changed Full 或 `product.full-regression` 选择 daily core lane
- **THEN** plan MUST 返回 core scope reason、core step 集合和 core budget feasibility
- **AND** plan MUST NOT选择 candidate-only artifact、package、Launcher、fresh-install 或 Release smoke step

#### Scenario: Parent 最终集成需要完整 Product Candidate
- **WHEN** Parent integration 或维护者需要验证完整冻结 Product source
- **THEN** verification policy MUST 显式选择 `product.candidate`
- **AND** 该 capability MUST执行原有 complete candidate profile，不得把 `product.full-regression` 的 core 结果重标记为 Candidate evidence

#### Scenario: 正式 Release 消费 Candidate
- **WHEN** publish workflow 接收 matching Candidate run 与 release context
- **THEN** workflow MUST下载并验证 Candidate aggregate 和同一次 Candidate 生成的唯一 tarball
- **AND** Hosted Windows、Host Node、Launcher、npm publish、GitHub Release 与 Registry readback MUST继续绑定该 Candidate source、generation、registry和artifact identities
- **AND** workflow MUST NOT重跑 core 来替代任一正式 Candidate/Release evidence

#### Scenario: 定点验证 release group
- **WHEN** 维护者运行 `product.release-artifact-set` 或 `test:focus -- group:release`
- **THEN** verifier MUST复用统一 registry 的 release owners及其真实依赖
- **AND** 该 focused 结果 MUST NOT被描述为完整 Candidate aggregate或正式 publication evidence
