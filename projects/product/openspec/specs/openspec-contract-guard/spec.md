# OpenSpec contract guard 规范

## Purpose

定义 Buildr 对 OpenSpec change 的 Requirement 基线、跨 change 冲突、同步前后验证、上游兼容性和 Agent-readable CLI 契约。

## Requirements

### Requirement: Buildr 维护 OpenSpec change 契约基线
Buildr MUST 为受保护的 OpenSpec change 提供版本化契约基线，记录 delta 创建时所依据的 canonical Requirement，而不修改 OpenSpec 自有 artifact schema。

#### Scenario: 新 change 创建基线
- **WHEN** Agent 对已有完整 delta specs 的 active change 运行 baseline create
- **THEN** Buildr MUST 在该 change 的 `.buildr/contract-baseline.json` 写入版本化 sidecar
- **AND** sidecar MUST 记录 change、OpenSpec 上游版本、capability、delta operation、Requirement identity 和规范化基线内容或 absent 状态

#### Scenario: 基线随 change 归档
- **WHEN** OpenSpec 将 active change 移入 archive
- **THEN** 契约基线 MUST 随 change 一起移动
- **AND** Buildr MUST NOT 将 sidecar 解释为 canonical spec 或 OpenSpec 自有 artifact

#### Scenario: 历史 change 缺少基线
- **WHEN** active change 已存在但没有契约基线
- **THEN** Buildr MUST 阻止受保护的同步或归档流程
- **AND** Buildr MUST 只在 Agent 显式指定采用当前 canonical facts 后创建 adopted baseline
- **AND** Buildr MUST 在 sidecar 和 JSON 输出中标记该采用事实

### Requirement: Proposal capability、delta 与基线保持一致
Buildr MUST 在 proposal 阶段校验声明的 capability、delta spec 和契约基线形成完整且无歧义的集合。

#### Scenario: Proposal 与 delta 对齐
- **WHEN** Agent 对 change 运行 proposal stage check
- **THEN** proposal 中的 new 和 modified capability MUST 与 delta spec capability 目录一一对应
- **AND** new 或 modified 分类 MUST 与 baseline 创建时 canonical capability 是否存在一致

#### Scenario: 基线覆盖全部操作
- **WHEN** delta 声明 ADDED、MODIFIED、REMOVED 或 RENAMED Requirement
- **THEN** baseline MUST 覆盖该操作涉及的全部 Requirement identity
- **AND** ADDED target MUST 记录为 absent，其他已有 target MUST 记录规范化内容

#### Scenario: Delta 在基线后扩张
- **WHEN** delta 在 baseline 创建后新增或改变触达的 Requirement identity
- **THEN** Buildr MUST 报告 baseline incomplete
- **AND** Buildr MUST 要求显式更新基线后才能通过

### Requirement: 同一 Requirement 的活动 change 冲突必须阻塞
Buildr MUST 在同步前扫描同一 Project 的全部 active changes，并以 capability 与 Requirement identity 识别并行契约冲突。

#### Scenario: 两个 change 修改同一 Requirement
- **WHEN** 两个 active changes 的 delta 触达相同 capability 和 Requirement identity
- **THEN** pre-sync check MUST 失败
- **AND** JSON diagnostics MUST 列出全部冲突 change、capability、Requirement 和可执行的排序或合并下一步

#### Scenario: 同 capability 的不同 Requirement
- **WHEN** 两个 active changes 只触达同一 capability 中不同的 Requirement identity
- **THEN** Buildr MUST NOT 仅因 capability 相同而报告冲突

#### Scenario: Rename 占用两个 identity
- **WHEN** change 将 Requirement 从旧名称重命名为新名称
- **THEN** conflict detection MUST 同时将旧名称和新名称视为该 change 触达的 identity

### Requirement: 陈旧 Requirement 基线必须阻塞同步
Buildr MUST 在同步前比较当前 canonical Requirement 与 change baseline，并在 touched Requirement 已变化时 fail closed。

#### Scenario: 基线仍然有效
- **WHEN** 当前 canonical touched Requirements 与 baseline 的规范化事实全部相同
- **THEN** pre-sync check MUST 将 baselineState 报告为 current

#### Scenario: 较早 change 已改变主规格
- **WHEN** 当前 canonical touched Requirement 不再匹配 baseline
- **THEN** pre-sync check MUST 失败并将 baselineState 报告为 stale
- **AND** Buildr MUST NOT 自动刷新、覆盖或继续同步该 change

#### Scenario: 新增目标已被占用
- **WHEN** baseline 将 ADDED Requirement 记录为 absent 但当前 canonical spec 已存在同名 Requirement
- **THEN** Buildr MUST 将该 change 视为 stale 或 conflicting 并阻塞同步

### Requirement: 同步结果必须符合 delta 且保持未触达契约
Buildr MUST 使用成功 pre-sync 产生的 receipt 验证同步结果，只有 delta 结果成立且未触达 Requirement 保持不变时才能通过 post-sync。post-sync failure finding MUST 提供 capability、Requirement、operation、可比较的 expected/actual 摘要与确定性的 next action；诊断不得自动修改 canonical specs、delta 或 baseline。

#### Scenario: 安全同步完整通过
- **WHEN** ADDED、MODIFIED、REMOVED 和 RENAMED 结果均符合 delta，且 receipt 中未触达 Requirement 未变化
- **THEN** post-sync check MUST 成功
- **AND** JSON 输出 MUST 将 change 状态报告为 contract-applied

#### Scenario: 未声明的 Requirement 被删除或改写
- **WHEN** 同步结果删除、增加或改变 delta 未触达的 Requirement
- **THEN** post-sync check MUST 失败
- **AND** finding MUST 标识 capability、Requirement 和预期/实际摘要

#### Scenario: MODIFIED 使用不完整结果
- **WHEN** post-sync canonical Requirement 不匹配 delta 中声明的完整 MODIFIED Requirement
- **THEN** post-sync check MUST 失败
- **AND** finding MUST 返回 operation、expected/actual 摘要和“从 delta Requirement 全文重建 canonical 后重跑 post-sync”的 next action

#### Scenario: Delta 在 pre-sync 后变化
- **WHEN** receipt 记录的 delta hash 与 post-sync 时 delta 不同
- **THEN** post-sync check MUST 失败
- **AND** Buildr MUST 要求重新执行 pre-sync

#### Scenario: canonical 在 pre-sync 前已被写入
- **WHEN** pre-sync 发现 touched canonical Requirement 不再匹配 baseline，且没有当前 change 的有效 receipt
- **THEN** finding MUST 明确要求恢复或审阅 canonical facts 后再创建新的 pre-sync receipt
- **AND** Buildr MUST NOT 将现有 canonical 内容自动采纳为该 Change 的同步结果

### Requirement: OpenSpec 契约门禁提供稳定 CLI 和 Agent-readable 输出
Buildr MUST 提供 project-scoped baseline 与三阶段 check CLI，并为成功、阻塞和错误返回确定性的文本及 JSON 结果。

#### Scenario: 通过 workspace 与 Project 解析 planning root
- **WHEN** Agent 指定 `--target <workspace>`、`--project <project>` 和 change id
- **THEN** Buildr MUST 通过 Project registry 解析对应 OpenSpec planning root
- **AND** Buildr MUST NOT 依赖调用者当前目录猜测 Project

#### Scenario: Agent-readable check 输出
- **WHEN** Agent 使用 `--json` 运行 proposal、pre-sync 或 post-sync check
- **THEN** 输出 MUST 包含 stage、change、project、upstreamVersion、baselineState、conflicts、findings、ok 和 nextActions
- **AND** 任一 error finding MUST 使命令返回非零状态

#### Scenario: Planning root 或 change 不合法
- **WHEN** Project、OpenSpec planning root、change 或 sidecar 无法安全解析
- **THEN** Buildr MUST 在任何写入前失败
- **AND** 输出 MUST 提供具体诊断而不是创建猜测路径

### Requirement: 未验证的 OpenSpec 上游版本不得绕过门禁
Buildr MUST 将 contract parser 与 OpenSpec Component 声明的上游版本绑定，并对未知或不一致版本 fail closed。

#### Scenario: 上游版本受支持
- **WHEN** workspace OpenSpec Component、OpenSpec Command 声明、本机 CLI、baseline 和 guard 支持的上游版本一致
- **THEN** Buildr MUST 继续执行对应阶段检查

#### Scenario: 上游版本未知或不一致
- **WHEN** OpenSpec Component 或 Command 声明缺失、本机 CLI 不满足声明、upstream version 未被 guard 支持，或 baseline version 与当前版本不一致
- **THEN** Buildr MUST 阻止门禁通过
- **AND** nextActions MUST 引导升级或重新验证 Buildr/OpenSpec Component，而不是自动安装外部 CLI

### Requirement: OpenSpec 契约 sidecar 原子写入
Buildr MUST 通过受管数据完整性 atomic writer 提交 contract baseline 和 pre-sync receipt，使 sidecar 不会以截断或半写入状态替代上次有效事实。

#### Scenario: Baseline 写入成功
- **WHEN** baseline create 或显式 update 通过全部契约和路径预检
- **THEN** Buildr MUST 原子替换 `contract-baseline.json`
- **AND** 成功结果 MUST 对应完整可解析的版本化 sidecar

#### Scenario: Receipt 写入失败
- **WHEN** pre-sync receipt 写入发生 I/O 失败
- **THEN** pre-sync check MUST 返回失败
- **AND** Buildr MUST 保留上次完整 sidecar 或保持 receipt 不存在，不得留下截断 JSON

#### Scenario: OpenSpec Component 卸载
- **WHEN** workspace OpenSpec Component 被卸载
- **THEN** Component transaction MUST NOT 删除任何 Project change 内的 `.buildr/` sidecar 或其他 `openspec/` 内容

### Requirement: Contract guard必须与sync receipt共享identity
Pre-sync guard、deterministic sync plan/apply与post-sync guard MUST消费同一change、delta、baseline、canonical和OpenSpec executable identity。Receipt MUST记录每次合法stage transition并拒绝跳步、事后baseline或identity漂移。

#### Scenario: Guard与apply正常衔接
- **WHEN**pre-sync通过且planner/apply消费相同identity
- **THEN**post-sync guard MUST核对actual canonical digest等于receipt expected digest
- **AND**未触达Requirements MUST保持不变

#### Scenario: Agent fallback后恢复
- **WHEN**deterministic plan blocked且Agent完成语义sync
- **THEN**consumer MUST以原pre-sync authority核对delta与actual canonical结果
- **AND**identity变化时MUST重新进入允许的pre-sync边界，不得直接伪造post-sync receipt

### Requirement: Convergence receipt必须持久化阶段恢复证据
产品orchestrator MUST持久化compatibility scan、rehearsal、pre-sync、plan、apply、strict validation与post-sync的status、timing、input/output digests和diagnostic references。单个命令退出码MUST NOT替代阶段契约。

#### Scenario: 中间阶段失败后resume
- **WHEN**apply或strict validation失败
- **THEN**receipt MUST保留最后成功阶段和失败diagnostic
- **AND**resume MUST只重做失败阶段及其真实下游
