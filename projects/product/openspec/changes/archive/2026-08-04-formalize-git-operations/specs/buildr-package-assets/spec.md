## ADDED Requirements

### Requirement: Package 必须原子交付唯一 Git Operations 能力
Buildr package MUST 原子交付一个 `git-operations` workspace Skill、一个 `buildr.git-operations@1` contract 和一个默认 binding，并 MUST 在同一 cutover 删除旧 Git capability graph。`buildr.git-worktree-provider@1` MUST 保持独立。

#### Scenario: 默认 graph 只有一个 Git Operations 入口
- **WHEN** package check、doctor 或 runtime render 解析默认 capability graph
- **THEN** graph MUST 只让 `git-operations` provide `buildr.git-operations@1` 并成为其默认 binding
- **AND** `task-finish` MUST 只以 optional mode require 该 capability，产品入口 MAY 按命中意图动态消费它

#### Scenario: 旧 graph residual gate
- **WHEN** package static verification 扫描 current manifests、Skill sources、contracts、bootstrap/docs 和 executable tests
- **THEN** `git-ops`、`buildr.git-single-operation`、`buildr.git-task-integration` 与 `buildr.git-workspace-update` 的 active provider、consumer、binding、router 和 schema residual MUST 为零
- **AND** archive 历史 MAY 保留旧事实但 MUST NOT 被 runtime 或 current docs 解析为可用入口

#### Scenario: Worktree provider 保持独立
- **WHEN** Task Environment 准备 Git checkout
- **THEN** `task-worktree` MUST 继续独立 provide `buildr.git-worktree-provider@1`
- **AND** `git-operations` MUST NOT 接管 worktree create、registration、Environment ready 或 cleanup authority

#### Scenario: Git Operations 安全语义被打包验证
- **WHEN** Buildr 验证随包 `git-operations` Skill 与 contract
- **THEN** verification MUST 覆盖独立 commit、独立 push、commit+push、无关 dirty、scope 外 unpublished commits、push rejection、共享 commit 冻结和部分失败 evidence
- **AND** verification MUST 确认该能力没有 Application、CLI、Receipt、持久状态或通用 Git transaction

## MODIFIED Requirements

### Requirement: 产品验证覆盖提交信息资产边界
Buildr product verification MUST 防止提交格式与默认语言重新耦合到同一 Skill 生命周期。

#### Scenario: 校验 Git Ops 提交格式
- **WHEN** Buildr validates the packaged Git Operations Skill
- **THEN** verification MUST confirm the concise Conventional Commits format、supported types、optional scope and breaking-change guidance
- **AND** verification MUST confirm Git Operations follows Core and more specific conventions without copying the Chinese constraint

#### Scenario: 校验 Core 默认提交语言
- **WHEN** Buildr validates the default package and a temporary initialized workspace
- **THEN** verification MUST confirm required Core contains the concise Chinese default and allowed original-form exceptions
- **AND** verification MUST confirm the Core default remains present when Git Operations is absent

### Requirement: 产品验证覆盖 task worktree 隔离与证据复用
Buildr package verification MUST 防止正式 workflow 绕过 Task Environment 直接把 task-worktree 当作环境 authority，也 MUST 防止 change artifacts 双写、合并前污染 retained self-bootstrap Workspace，或让 Git/worktree providers重新拥有 Runtime/依赖、Candidate verification 或 evidence 复用决策。

#### Scenario: 校验 Change 创建时机
- **WHEN** Buildr 验证 task-triage、OpenSpec contribution 与随包 Task Environment Skill
- **THEN** 验证 MUST 确认实现型 OpenSpec Change 在 propose 前取得 matching `ready` Environment Receipt
- **AND** 采用 Environment 后 artifacts、实现和候选验证 MUST 只有 receipt 允许的写入位置

#### Scenario: 校验 Git provider 只交接 Git 事实
- **WHEN** Buildr 验证 Product Project 开发规则、task-environment、task-worktree 和 git-operations
- **THEN** 验证 MUST 确认 task-worktree 只提供 repository/checkout/branch/HEAD/clean 与 Git transition evidence
- **AND** task-environment MUST 独占 Runtime/CLI/依赖、projection、资源、restore 与总 cleanup，Task Verification MUST 独占 Candidate/evidence

#### Scenario: 校验 Skill 文本没有重复职责
- **WHEN** Buildr 执行 package 静态验证和任务能力专项测试
- **THEN** verifier MUST 拒绝 task-worktree 中的 Environment ready、runtime preparation、session adoption 或总 cleanup 说明
- **AND** verifier MUST 拒绝 git-operations/task-worktree 重新声明 Candidate 验证命令、保证级别或 evidence 复用决策

#### Scenario: 候选验证保持 retained Workspace 干净
- **WHEN** 产品 E2E 从 Task Validation Workspace 验证未合并候选版本
- **THEN** 验证 MUST 使用 receipt 绑定的验证根或无关临时 Workspace
- **AND** 验证前后的 retained Workspace 与 peer task worktree status/runtime MUST 保持不变

#### Scenario: 不要求 post-merge 重复 E2E
- **WHEN** Buildr 验证产品开发流程文本
- **THEN** 验证 MUST 确认相同 Candidate identity 集成后不要求在 retained 开发分支重复产品 E2E
- **AND** MUST 区分 Candidate E2E 与集成后 retained sync/render/doctor 的正式激活检查

### Requirement: 产品验证覆盖 Git 工作区转换后的环境检查契约
Buildr package verification MUST 防止 selected Git Operation 或任务 Skill 丢失一般工作区转换后的 Buildr 环境诊断边界，并 MUST 通过可执行产品验证证明 canonical task worktree 创建后的 doctor 与安全自动 sync 确定性发生；该验证 MUST NOT 把 `git-operations` 扩展成完整命令 router。

#### Scenario: 校验 Git Ops 触发与排除范围
- **WHEN** Buildr 验证随包 Git Operations Skill 和 manifest description
- **THEN** 验证 MUST 确认入口只在直接用户或 consumer 已选定 Git Operation 时加载，并覆盖明确的 commit、push 与组合语义
- **AND** 验证 MUST 确认 description 不预扩 checkout、reset、cherry-pick、stash、branch deletion 等完整命令集
- **AND** provider 对实际改变 checkout 的已选 operation MUST 返回 `treeChanged: true`，普通 commit/push MUST 返回 `false`

#### Scenario: 校验一般 Agent-first 同步交互
- **WHEN** Buildr 验证 worktree create 之外的 Git 工作区转换处理文本
- **THEN** 验证 MUST 确认 doctor 无需处理时不提醒 `render` 或 `sync`
- **AND** 验证 MUST 确认 doctor 发现问题时按 Rules、Skills、Commands、Components、Contributions 和 runtime 分类说明
- **AND** 验证 MUST 确认可由 sync 修复时先询问用户、同时提供手动命令，并在用户确认后由 Agent 执行 sync 和最终 doctor
- **AND** 验证 MUST 确认没有用户确认时不会执行一般 workspace sync，且不会默认要求用户自行运行命令
- **AND** 验证 MUST 确认 Agent 无法执行或用户选择手动方式时才使用手动操作兜底

#### Scenario: 校验 task worktree 产品入口
- **WHEN** Buildr 验证 `worktree create` CLI、帮助、JSON schema、随包 `task-worktree` Skill 和 capability routing
- **THEN** 验证 MUST 确认 Agent 负责提供 task id、branch、start point、Agent 和 workspace root，Buildr 负责 canonical create/reuse 与环境 bootstrap
- **AND** 验证 MUST 确认 task-worktree Skill 要求通过该产品入口创建新 checkout，而不是自行执行 `git worktree add` 后依赖文本提醒
- **AND** 验证 MUST 确认该入口不接管任务理解、OpenSpec 选择、merge、rebase、push 或 cleanup policy

#### Scenario: 校验创建后 doctor 与安全自动 sync
- **WHEN** 产品 E2E 在临时已初始化 Git workspace 调用 `worktree create`
- **THEN** 验证 MUST 证明新 canonical checkout 一定执行当前 Agent doctor
- **AND** runtime healthy 时 MUST 跳过 sync
- **AND** 唯一 actionable finding 为当前 Agent runtime stale、checkout clean 且 identity 未变化时 MUST 自动 sync 并通过最终 doctor
- **AND** JSON MUST 返回 created/reused、treeChanged、doctor before/after、sync decision、blocked reason 和 nextActions

#### Scenario: 校验安全分类 fail closed
- **WHEN** 临时 workspace 分别构造 occupied path、branch 已被占用、dirty/identity 变化、mutation blocked、非 runtime actionable finding、sync preflight 决策或 sync 后 doctor 失败
- **THEN** 验证 MUST 确认产品不会执行不安全 sync、不会执行 doctor 输出中的任意命令、不会删除已创建 checkout或丢弃内容
- **AND** 创建前冲突 MUST 零写入，创建后 bootstrap 阻塞 MUST 保留现场并返回结构化 nextActions

#### Scenario: 校验幂等复用
- **WHEN** 同一 task id、repository 与 branch 再次调用 `worktree create`
- **THEN** 验证 MUST 返回 `reused`、`treeChanged: false`，且不重复 doctor 或 sync
- **AND** identity 不匹配 MUST fail closed

#### Scenario: 校验无需 Git hook
- **WHEN** Buildr 验证工作区转换后的环境检查实现
- **THEN** 验证 MUST 确认随包资产不要求安装或维护 Git hook、daemon、文件 watcher 或定时任务
- **AND** 验证 MUST 保留绕过 Buildr worktree create 的外部 Git 操作只能由后续 Buildr 基线 doctor 兜底的边界

### Requirement: 产品验证覆盖 Git-first workspace 更新编排
Buildr product verification MUST 防止产品入口 Buildr Skill 和随包引导退回到只执行本地 `buildr sync` 的 workspace 更新语义，同时 MUST 保证更新 operation 由产品入口选择而不是 Git Operations 自行推断。

#### Scenario: 校验 Git 管理 workspace 的更新顺序
- **WHEN** Buildr 验证产品入口 Buildr Skill、bootstrap guide、CLI reference 和 runtime 提示
- **THEN** 验证 MUST 确认“更新 workspace”与“同步 workspace”由 Buildr Skill 先向 selected `buildr.git-operations/v1` provider 提供 workspace、upstream 和明确 update operation，再执行 `buildr sync <agent> --target <workspace-root>`
- **AND** 验证 MUST 确认该意图不会先运行 `buildr update`
- **AND** 验证 MUST 确认 Git 更新成功后无需再次询问 sync 授权

#### Scenario: 校验 Git 更新失败边界
- **WHEN** Buildr 验证 Git 管理 workspace 的更新决策点
- **THEN** 验证 MUST 确认本地改动、分叉、冲突、缺少 upstream 或其他 Git 决策点会阻止后续 sync
- **AND** 验证 MUST 确认 Agent 不会自动 stash、reset、rebase、merge 或覆盖用户内容

#### Scenario: 校验非 Git workspace 和 CLI 职责边界
- **WHEN** Buildr 验证非 Git workspace 或 `buildr sync` 命令说明
- **THEN** 验证 MUST 确认非 Git workspace 直接执行 sync
- **AND** 验证 MUST 确认 Git 更新属于 Buildr Skill 的 consumer 编排，而不是 `buildr sync` CLI 或 Git Operations provider 的隐式行为

### Requirement: 产品验证覆盖 capability provider replacement
Buildr product verification MUST 覆盖默认 provider、内部 provider 替换、provider 卸载、歧义、版本冲突和 optional degradation，并 MUST 验证所有 supported runtime adapters 获得一致 binding 语义。

#### Scenario: 默认 providers 完成现有工作流
- **WHEN** a temporary workspace uses package defaults
- **THEN** Git Operations、worktree and task consumers MUST resolve to the declared builtin providers
- **AND** existing workspace update、worktree and retained metadata-only finish behavior MUST remain available

#### Scenario: 内部 provider 替换 Git Ops
- **WHEN** a temporary workspace installs one compatible internal `buildr.git-operations@1` provider、binds it and uninstalls `git-operations`
- **THEN** product entry and `task-finish` MUST resolve the internal provider，且 `task-worktree` MUST 继续解析自己的独立 provider
- **AND** render and doctor MUST identify the internal provider without restoring `git-operations` or any removed legacy capability

#### Scenario: Required provider 缺失或有歧义
- **WHEN** a test removes the only compatible required provider or leaves multiple unbound providers in the nearest scope
- **THEN** doctor MUST report `blocked` with `missing_provider` or `ambiguous_provider` reason、affected consumers、candidates and nextActions
- **AND** runtime render MUST retain affected consumers with blocked safety guidance and retain unrelated Skills

#### Scenario: Optional provider 缺失
- **WHEN** `task-asset-review` is unavailable to `task-finish`
- **THEN** doctor MUST report non-blocking degradation
- **AND** rendered Task Finish binding evidence MUST declare the skipped optional stage

#### Scenario: Runtime adapters 接收相同解析结果
- **WHEN** Buildr renders the same scope for each supported Agent adapter
- **THEN** every adapter MUST project equivalent capability status、selected provider and provenance
- **AND** adapter-specific paths MUST NOT change provider resolution

#### Scenario: Transitive provider dependency 被阻断或成环
- **WHEN** selected provider 的 required dependency blocked，或 capability graph contains a required cycle
- **THEN** product verification MUST confirm blocked readiness propagates to every affected upstream consumer
- **AND** doctor MUST report `provider_not_ready` root cause chain or `dependency_cycle` path without hanging or selecting an arbitrary edge

### Requirement: task-triage 必须条件消费 Task Record capability
Buildr package MUST 为 `task-triage` 增加 optional `buildr.task-record@1` consumer edge，并 MUST 更新 Skill source，使 formal execution 分支在首次持久写入前调用 selected provider；该依赖 MUST NOT 阻塞纯讨论、只读或 Task 外操作。

#### Scenario: 检查 capability graph
- **WHEN** package verification 比较变更前后 capability graph
- **THEN** graph MUST 新增 `buildr.task-record@1`、default `task-manager` provider/binding 和 `task-triage` optional consumer edge
- **AND** MUST NOT 给 task-worktree、task-verification、task-finish、task-board、task-asset-review 或 git-operations 增加 Task Record consumer edge

#### Scenario: 正式分支 provider 不 ready
- **WHEN** task-triage 已确认即将进入正式持久交付但 Task Record provider 不 ready
- **THEN** execution/write 分支 MUST fail closed 并报告 readiness 与 next action
- **AND** semantic triage result MUST 保持可见

#### Scenario: 旧专业模块继续运行
- **WHEN** P0.1 后正式 Task 调用当前 worktree、Verification、Task Finish、Board、Asset Review 或 Git 路径
- **THEN** 它们 MUST 继续只维护自己的专业 receipt/result/store
- **AND** MUST NOT 自动回填专业字段到 `task.yml`

## REMOVED Requirements

### Requirement: 产品验证覆盖 Git Ops 集成契约
**Reason**: 旧 requirement 固化自动 rebase-first 和集成 workflow authority，与 P0.6 consumer-selected、fail-closed Git Operations 边界冲突。

**Migration**: 使用“Package 必须原子交付唯一 Git Operations 能力”和 `agent-task-workflows` 中的新 Git Operations requirement，验证精确 scope、完整 push range、共享冻结和部分失败 evidence。
