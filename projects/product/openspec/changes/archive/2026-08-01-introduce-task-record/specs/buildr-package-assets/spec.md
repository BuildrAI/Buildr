## ADDED Requirements

### Requirement: Package 必须原子交付 Task Manager 能力
Buildr package MUST 原子交付 Task Record Domain/Application/repository、`buildr.task-record/v1` capability contract、默认 `task-manager` provider、workspace binding、Skill source、CLI/help/runtime 接线、Local App Task routes/API/Web assets 和公开 JSON identity；任一 identity、path、version、binding 或 Application client 接线不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr 将包含 Task Manager 的 package 初始化或同步到 Workspace
- **THEN** workspace Skills manifest MUST 登记 `buildr.task-record@1` contract、`task-manager` Skill 与 default binding
- **AND** `task-manager` MUST 是 enabled、installed、optional builtin，并通过 `provides` 声明 `buildr.task-record@1`

#### Scenario: capability contract identity 不一致
- **WHEN** package manifest、workspace baseline manifest、contract frontmatter、provider `provides` 或 binding 对 capability id/version 的声明不一致
- **THEN** package check 和 doctor MUST 报告 identity integrity error
- **AND** runtime projection MUST NOT 猜测其中一份 identity 继续绑定

#### Scenario: 支持的 Agent runtime 投射 Task Manager
- **WHEN** retained Workspace 从已集成的产品 source 对支持的 Agent runtime 执行 sync/render
- **THEN** runtime MUST 收到完整 `task-manager` Skill、更新后的 `task-triage` 与受管 source/binding evidence
- **AND** doctor MUST 只在 contract、provider、consumer binding 和 runtime source 都可解析时报告 structurally ready

#### Scenario: bundled Local App 加载 Task 页面
- **WHEN** checkout、npm tarball 或平台 bundle 启动 Local App 并打开已登记 Workspace
- **THEN** server MUST 交付 Task route shell、Task Web feature 与对应 Workspace-scoped API
- **AND** Local App 与 CLI MUST 绑定同一 Task Record Application，不得各自携带独立 validator 或 filesystem writer

### Requirement: task-manager routing 与职责边界必须由 package verification 保护
Buildr package MUST 让 `task-manager` frontmatter、package manifest 与 workspace baseline manifest 使用完全一致的单句 description，并 MUST 通过静态与行为 fixture 防止它退化为全局 dispatcher、Task Core 或专业阶段执行器。

#### Scenario: routing description 正向覆盖
- **WHEN** fixture 表达创建、查看、更新、结束正式 Task Record 或按 Task ID 恢复顶层事实
- **THEN** `task-manager` description MUST 覆盖该意图
- **AND** Skill 正文 MUST 要求使用 selected `buildr.task-record/v1` provider 和实际 result evidence

#### Scenario: routing description 负向覆盖
- **WHEN** fixture 只表达普通修复/实现意图、纯讨论、只读探索、单次测试、临时服务或 Agent host task/thread 管理
- **THEN** package verification MUST 确认 `task-manager` 不自动创建正式 Task
- **AND** `task-triage` 或其他适用入口 MUST 不因新 Skill id 被遮蔽

#### Scenario: 专业职责渗入
- **WHEN** `task-manager` Skill 或 contract 包含 Environment 创建/记录、研发计划/实现、Review 判断、Verification 执行、Git policy、Finish 编排、Board 状态或 Retrospective 逻辑
- **THEN** package verification MUST 失败并报告越界内容
- **AND** provider MUST 只拥有 Task Record 五个 action 与结果证据

#### Scenario: Local App 前端复制产品逻辑
- **WHEN** Task Web feature 自行解析/render `task.yml`、实现状态迁移、解析 Project/Service/Change identity 或直接接受 filesystem path
- **THEN** package/static verification MUST 失败并报告重复 authority
- **AND** Web feature MUST 只调用登记的 Workspace Task API 并展示 Application result

### Requirement: task-triage 必须条件消费 Task Record capability
Buildr package MUST 为 `task-triage` 增加 optional `buildr.task-record@1` consumer edge，并 MUST 更新 Skill source，使 formal execution 分支在首次持久写入前调用 selected provider；该依赖 MUST NOT 阻塞纯讨论、只读或 Task 外操作。

#### Scenario: 检查 capability graph
- **WHEN** package verification 比较变更前后 capability graph
- **THEN** graph MUST 新增 `buildr.task-record@1`、default `task-manager` provider/binding 和 `task-triage` optional consumer edge
- **AND** MUST NOT 给 task-worktree、task-verification、task-finish、task-board、task-asset-review 或 git-ops 增加 Task Record consumer edge

#### Scenario: 正式分支 provider 不 ready
- **WHEN** task-triage 已确认即将进入正式持久交付但 Task Record provider 不 ready
- **THEN** execution/write 分支 MUST fail closed 并报告 readiness 与 next action
- **AND** semantic triage result MUST 保持可见

#### Scenario: 旧专业模块继续运行
- **WHEN** P0.1 后正式 Task 调用当前 worktree、Verification、Task Finish、Board、Asset Review 或 Git 路径
- **THEN** 它们 MUST 继续只维护自己的专业 receipt/result/store
- **AND** MUST NOT 自动回填专业字段到 `task.yml`

### Requirement: 候选 package 变更不得提前激活 retained runtime
task worktree/branch 内的 Task Manager、task-triage、contract、manifest 和 generated package 变更 MUST 视为候选 self-bootstrap 内容；候选 source MAY 更新同一 task worktree 所承载的任务验证 Workspace runtime，也 MAY 在任务验证 Workspace 或无关临时 Workspace 内向隔离的模拟用户目录投射以验证 user destination，但 MUST NOT 更新共享同一 Git common-dir 的 retained checkout、另一个 task worktree 或验证 Workspace 之外的用户级共享 runtime。隔离模拟投射 MUST NOT 被报告为 retained runtime 或真实用户 runtime 已生效。只有实现完成并集成到 retained checkout 后，从 retained product source 执行的 sync/render 才能更新 retained Agent runtime。

#### Scenario: 开发阶段验证候选资产
- **WHEN** Agent 在 task worktree 中实现或测试 Task Manager
- **THEN** verifier MAY 使用无关临时 Workspace，或把 receipt-bound candidate CLI 投射到同一 task worktree 的任务验证 Workspace root
- **AND** 产品 MUST 在写入前阻止候选 source 以 retained checkout 或 peer task worktree 为 runtime target，且 verifier MUST NOT 把任务级候选 runtime 报告为 retained runtime 已生效
- **AND** user destination 只有在实际 runtime target 位于验证 Workspace 根内时 MAY 作为隔离模拟投射执行；验证 Workspace 外的共享用户 runtime MUST 在写入前被阻止

#### Scenario: retained source 准备任务验证 Workspace
- **WHEN** retained Product source 为一个 task worktree 准备 workspace-scoped runtime
- **THEN** sync/render MAY 以该 task worktree 为 target
- **AND** 该动作 MUST NOT 把 task worktree 升格为 canonical Task Record authority 或正式 retained runtime

#### Scenario: 集成后激活
- **WHEN** 最终候选已验证并进入 retained checkout
- **THEN** Agent MUST 从 retained `projects/product/buildr` 执行适用 sync/render/doctor
- **AND** activation evidence MUST 匹配 retained source identity、受管 runtime source 与 Task Manager/task-triage 专项验收

### Requirement: 产品验证必须覆盖 Task Manager package、CLI 与 Local App parity
Buildr package verification MUST 在 checkout、初始化 Workspace、同步 Workspace、隔离 runtime、Local App browser 与 npm tarball 场景覆盖 contract/Skill 投射、task-triage consumer、CLI registry/help、Local App route/API/assets、public JSON、filesystem effect 和失败分支，并 MUST 在任一入口行为漂移时失败。

#### Scenario: checkout 与 tarball 成功路径
- **WHEN** verifier 分别使用 checkout CLI 与 npm tarball CLI 对等执行 create、inspect、update、complete 和 abandon
- **THEN** 两者 MUST 使用相同 command help、record schema、result schema、canonical YAML 与状态语义
- **AND** 输出 MUST 只允许 machine-specific canonical path 和时间不同

#### Scenario: checkout 与 tarball 失败路径
- **WHEN** verifier 分别触发重复 Task ID、终态改写、无效引用、Task 路径占用和损坏 record
- **THEN** 两者 MUST 返回等价的 stable code、blocked status、effects 与 nextActions
- **AND** 原 record 与同目录其他 owner 的 bytes MUST 保持不变；原子替换失败的精确文件保证由 shared repository integration fixture 验证，不伪造 CLI fault injection

#### Scenario: package source 与 runtime drift
- **WHEN** Skill source、contract、manifest description、consumer/binding evidence、CLI schema registry 或 runtime 投射中的任一项缺失或过期
- **THEN** affected/package verification MUST 报告精确资产和 identity drift
- **AND** Buildr MUST NOT 把结构 ready 冒充为 Task Record 行为或 retained runtime 已验证

#### Scenario: CLI 与 Local App 行为漂移
- **WHEN** CLI 与 Local App 对相同 create/update/complete/abandon input 产生不同 canonical record、validation code 或 state transition
- **THEN** affected/browser/package verification MUST 失败并指出发生漂移的 Application client
- **AND** 两个入口同时写出相同错误结果 MUST NOT 掩盖 canonical Task Record contract 失败
