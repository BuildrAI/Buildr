## MODIFIED Requirements

### Requirement: Package 必须原子交付 Task Manager 能力
Buildr package MUST 原子交付 Task Record Domain/Application/repository、`buildr.task-record/v2` capability contract、默认 `task-manager` provider、workspace binding、Skill source、CLI/help/runtime 接线、Local App Task routes/API/Web assets 和公开 JSON identity；任一 identity、path、version、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr 将包含 Task Manager 的 package 初始化或同步到 Workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-record@2` contract、`task-manager` Skill 与 default binding
- **AND** task-manager MUST 通过 `provides` 声明 `buildr.task-record@2`

#### Scenario: capability contract identity 不一致
- **WHEN** package manifest、workspace baseline manifest、contract frontmatter、provider provides 或 binding 对 capability id/version 的声明不一致
- **THEN** package check 和 doctor MUST 报告 identity integrity error
- **AND** runtime projection MUST NOT 猜测其中一份 identity 继续绑定

#### Scenario: 支持的 Agent runtime 投射 Task Manager
- **WHEN** retained Workspace 从已集成的产品 source 对支持的 Agent runtime 执行 sync/render
- **THEN** runtime MUST 收到完整 task-manager Skill、更新后的 task-triage 与受管 source/binding evidence
- **AND** doctor MUST 只在 contract、provider、consumer binding 和 runtime source 都可解析时报告 structurally ready

#### Scenario: bundled Local App 加载 Task 页面
- **WHEN** checkout、npm tarball 或平台 bundle 启动 Local App 并打开已登记 Workspace
- **THEN** server MUST 交付 Task route shell、Task Web feature 与对应 Workspace-scoped API
- **AND** Local App 与 CLI MUST 绑定同一 Task Record Application，不得各自携带独立 validator 或 filesystem writer

### Requirement: task-manager routing 与职责边界必须由 package verification 保护
Buildr package MUST 让 task-manager frontmatter、package manifest 与 workspace baseline manifest 使用完全一致的单句 description，并 MUST 通过静态与行为 fixture 防止它退化为全局 dispatcher、专业阶段执行器或复盘分析 owner。

#### Scenario: routing description 正向覆盖
- **WHEN** fixture 表达创建、查看、更新、激活、结束 todo/active Task Record 或按 Task ID 恢复顶层事实
- **THEN** task-manager description MUST 覆盖该意图
- **AND** Skill 正文 MUST 要求使用 selected `buildr.task-record/v2` provider 和实际 result evidence

#### Scenario: routing description 负向覆盖
- **WHEN** fixture 只表达普通修复/实现意图、纯讨论、只读探索、单次测试、临时服务或 Agent host task/thread 管理
- **THEN** package verification MUST 确认 task-manager 不自动创建 Task
- **AND** task-triage 或其他适用入口 MUST 不因新 Skill id 被遮蔽

#### Scenario: 专业职责渗入
- **WHEN** task-manager Skill 或 contract 包含 Environment 创建/记录、研发计划/实现、Review 判断、Verification 执行、Git policy、Finish 编排、Board 状态或复盘内容分析
- **THEN** package verification MUST 失败并报告越界内容
- **AND** provider MUST 只拥有 Task Record 六个 action、最小来源关系与结果证据

#### Scenario: Local App 前端复制产品逻辑
- **WHEN** Task Web feature 自行实现状态迁移、关系校验或直接接受 filesystem path
- **THEN** package/static verification MUST 失败并报告重复 authority
- **AND** Web feature MUST 只调用登记的 Workspace Task API 并展示 Application result

### Requirement: task-triage 必须条件消费 Task Record capability
Buildr package MUST 为 task-triage 提供 optional `buildr.task-record@2` consumer edge。todo 创建分支 MUST 只调用 Task Record provider；active 创建或 todo 激活分支 MUST 在首次正式执行写入前完成 Git Operations 基线门禁，再调用 selected provider。

#### Scenario: 检查 capability graph
- **WHEN** package verification 检查当前 capability graph
- **THEN** graph MUST 包含 `buildr.task-record@2`、default task-manager provider/binding 和 task-triage optional consumer edge
- **AND** MUST NOT给专业阶段增加 Task Record consumer edge

#### Scenario: todo data-only 分支
- **WHEN** 用户只接受未启动意向
- **THEN** task-triage MUST 创建 todo Task 而不消费 Git Operations
- **AND** MUST 不创建 Environment、Change 或专业 placeholder

#### Scenario: 正式分支 provider 不 ready
- **WHEN** active 创建或 todo 激活所需 provider/Git baseline blocked
- **THEN** execution/write 分支 MUST fail closed 并报告 next action
- **AND** todo MUST 保持原状态且语义分流结果可见

#### Scenario: 旧专业模块继续运行
- **WHEN** active Task 调用 worktree、Verification、Task Finish 或其他专业路径
- **THEN** 它们 MUST 继续只维护自己的专业 receipt/result/store
- **AND** MUST NOT 自动回填专业字段到 Task Record

### Requirement: 产品验证必须覆盖 Task Manager package、CLI 与 Local App parity
Buildr package verification MUST 在 checkout、初始化 Workspace、同步 Workspace、隔离 runtime、Local App browser 与 npm tarball 场景覆盖 contract/Skill、todo/active 状态、来源关系、CLI registry/help、Local App route/API/assets、public JSON、filesystem effect 和失败分支，并 MUST 在任一入口行为漂移时失败。

#### Scenario: checkout 与 tarball 成功路径
- **WHEN** verifier 分别使用 checkout CLI 与 npm tarball CLI 对等执行 create/inspect/update/activate/complete/abandon 及来源关系 mutation
- **THEN** 两者 MUST 使用相同 command help、record/result schema 与状态语义
- **AND** todo 创建 MUST 证明除 SQLite owner rows 外无 filesystem 或专业副作用

#### Scenario: checkout 与 tarball 失败路径
- **WHEN** verifier 分别触发重复 ID、非法状态/来源、todo Change、终态改写与损坏 record
- **THEN** 两者 MUST 返回等价 stable code、blocked status、effects 与 nextActions
- **AND** 原 record 与 sibling owner records MUST 保持不变

#### Scenario: package source 与 runtime drift
- **WHEN** Skill source、contract、manifest description、binding、CLI schema registry 或 runtime 投射中的任一项缺失或过期
- **THEN** affected/package verification MUST 报告精确资产和 identity drift
- **AND** Buildr MUST NOT把结构 ready 冒充为行为已验证

#### Scenario: CLI 与 Local App 行为漂移
- **WHEN** CLI 与 Local App 对相同 open Task mutation 产生不同 record、validation code 或 state transition
- **THEN** affected/browser/package verification MUST 失败并指出发生漂移的 Application client
- **AND** 两个入口同时错误 MUST NOT掩盖 canonical contract 失败

## ADDED Requirements

### Requirement: Package 原子交付 Task Retrospective v2
Buildr package MUST 原子交付 `buildr.task-retrospective/v2` contract、默认 provider、内部 driver、workspace binding、产品入口路由、Task Record v2 consumer binding 以及 Local App 投影，并 MUST 不建立 lifecycle gate。

#### Scenario: Package 安装 Task Retrospective
- **WHEN** Buildr 初始化或同步 workspace
- **THEN** package MUST 安装 v2 contract 与完整 task-retrospective Skill
- **AND** default binding 与 Task Record consumer MUST 指向兼容 provider

#### Scenario: Package 校验 v2 边界
- **WHEN** Agent 运行 package check 或产品 affected verification
- **THEN** verifier MUST 检查 contract、provider、binding、driver、SQLite repositories、Local App route、Result schema 与 Task 来源关系
- **AND** verifier MUST拒绝 history、自动采集、action item store、自动执行 Task 或 lifecycle gate

### Requirement: Package 必须原子交付 todo Task 与复盘承接能力
Buildr package MUST 原子交付升级后的 Task Record 与 Task Retrospective contracts/providers、SQLite migration、Application/repository、CLI/help/JSON、Local App API/Web assets、capability bindings 和验证。任一版本、状态、来源关系、runtime projection 或客户端行为漂移时 package check 与 Doctor MUST fail closed。

#### Scenario: 初始化新 Workspace
- **WHEN** 新 package 初始化 Workspace 并创建带多个来源的 todo Task
- **THEN** CLI、Application 与 Local App read model MUST 返回一致的 v2 record、todo status 和来源关系
- **AND** filesystem 与其他专业 current tables MUST 保持无新增

#### Scenario: 迁移既有 Workspace
- **WHEN** migration 遇到现有 active/completed/abandoned Task 与 retrospective rows
- **THEN** 所有既有 Task status、result、scope、references 与复盘内容 MUST 原样保留
- **AND** MUST NOT从缺失 artifacts、pending disposition 或文本内容推断 todo/来源关系

#### Scenario: package/runtime parity
- **WHEN** verifier 比较 source、npm package、workspace runtime 与 Local App bundle
- **THEN** contract major、Skill routing、CLI action/filter、JSON schema、migration 和 Web labels MUST 一致
- **AND** 旧 runtime 读取更新后的 store MUST 按现有 migration version 边界 fail closed

## REMOVED Requirements

### Requirement: Package 原子交付 Task Retrospective 第一版
**Reason**: Task Retrospective 已升级为 v2，并以 Task Record 来源关系承接有效改进方向。

**Migration**: package 原子退役 v1 contract/provider/binding，并安装 v2；已有复盘正文与处置状态原样保留。
