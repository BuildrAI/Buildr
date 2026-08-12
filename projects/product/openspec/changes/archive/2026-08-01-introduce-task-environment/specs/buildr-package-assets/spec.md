## ADDED Requirements

### Requirement: Package 必须原子交付 Task Environment authority
Buildr package MUST 原子交付 `buildr.task-environment/v1` contract、Task Environment Application、`task-environment` Skill、公共 CLI/JSON、Environment Receipt writer、Task-scoped Change Reference Resolver、Local App Environment reader/API、`buildr.git-worktree-provider/v1` contract、更新后的 `task-worktree` provider、default bindings、consumer edges、runtime source mappings 与迁移验证。任一 identity、version、provider、binding、CLI/schema 或 source mapping 不一致时 package check 与 doctor MUST fail closed。

#### Scenario: 初始化或同步新 package
- **WHEN** Buildr 初始化或同步包含 P0.2 的 Workspace
- **THEN** workspace Skills manifest MUST 登记两个新 contracts、enabled/installed 的 `task-environment` 与收窄后的 `task-worktree`
- **AND** default bindings MUST 分别选择 `task-environment` 和 `task-worktree`，不得保留 `buildr.task-worktree-lifecycle@2`

#### Scenario: capability graph 解析
- **WHEN** doctor 解析 task-triage、task-environment、task-worktree 与 task-finish
- **THEN** graph MUST 显示正式 workflow 消费 `buildr.task-environment/v1`，Environment 按需消费 `buildr.git-worktree-provider/v1`
- **AND** 旧 capability、缺失 provider、歧义或版本冲突 MUST 产生精确 blocked/degraded 诊断

#### Scenario: 公共 Task Environment CLI 完整登记
- **WHEN** package verification 检查 root help、topic help、CLI registry 与 public JSON schema registry
- **THEN** `buildr task environment prepare|inspect|cleanup` MUST 全部出现并使用 `buildr.task-environment-result/v1`，内部 `resource register/release` MUST NOT 出现
- **AND** `worktree create|inspect|cleanup` MUST 只使用 `buildr.git-worktree-result/v1` 描述 Git provider evidence，`worktree context|adopt` 与 Environment ready/restore/runtime/cleanup authority MUST 不再存在

#### Scenario: 候选 package 在自身验证工作区测试
- **WHEN** task worktree 中的候选新增 Task Environment Skill、contracts、Application/CLI 或 runtime assets
- **THEN** candidate CLI MAY 只向同一 receipt 绑定的任务验证工作区或其内隔离 user destination 投射
- **AND** MUST 在写入前阻止 retained Workspace、peer task worktree 和验证根外共享 user runtime target

#### Scenario: 集成后激活
- **WHEN** P0.2 候选已进入 retained checkout
- **THEN** Agent MUST 从 retained Product source 执行适用 sync/render/doctor
- **AND** 只有 retained package/runtime identity 匹配且专项验证通过后，Task Environment authority 才 MUST 被报告为正式生效

### Requirement: 产品验证必须覆盖 Environment authority 迁移与清理
Buildr product verification MUST 覆盖 Task Record gate、共享执行根、单/多 repo Git provider、Runtime/CLI/依赖准备、runtime projection、Task-scoped Change 解析、Local App Environment inspect、资源登记、串行恢复、Finish cleanup handoff、明确放弃与一次性 legacy migration，并 MUST 证明旧新 authority 不会同时写入或路由。

#### Scenario: checkout 与 npm package 正常路径
- **WHEN** verifier 分别从 checkout 和 npm tarball 初始化临时 Workspace 并执行正式 Task 环境流程
- **THEN** 两者 MUST 产生等价的 Task Environment contract/result、v2 receipt、provider evidence 与 ready/cleanup 语义
- **AND** 只允许 machine path、时间、进程和下载缓存等真实本机事实不同

#### Scenario: Buildr 自举依赖准备
- **WHEN** 干净 task checkout 没有 `node_modules` 且候选 CLI probe 失败
- **THEN** retained stable controller MUST 使用 Workspace Node/npm 与 checkout 自己的 lockfile 完成 `npm ci` 后重新 probe
- **AND** verifier MUST 证明 retained/peer `node_modules` 未被复用、链接或修改

#### Scenario: 动态资源登记失败
- **WHEN** preview/dev server 已启动但 Environment writer 拒绝登记
- **THEN** creator MUST 停止刚创建的 owned process/resource 并返回失败
- **AND** receipt、其他 previews、默认 Local App 与其他任务 MUST 保持不受影响

#### Scenario: active legacy receipt 迁移
- **WHEN** fixture 具有正式 Task、真实 registered worktree 和 identity-matching v1 receipt
- **THEN** retained new version MUST 生成 v2 Environment Receipt 与窄 Git evidence，再移除旧 receipt/adoption state
- **AND** 迁移后所有正式 consumer MUST 只读取新 Environment authority

#### Scenario: orphan、stale 与 conflicting legacy receipt
- **WHEN** fixtures 分别覆盖无 Task 的 live worktree、没有 live resource 的 receipt 与 identity/ownership 冲突
- **THEN** verifier MUST 证明前两类只保留必要 Git evidence或删除陈旧 receipt，且不会创建 Task/v2 Receipt；冲突类 MUST 原样保留并阻止 authority 切换
- **AND** 正常 CLI/Application/runtime routing MUST 不存在 permanent legacy inspect/cleanup adapter

#### Scenario: Task-scoped Change 与 Local App Environment
- **WHEN** Change 只存在于 matching Task Environment Project root，且用户打开该 Task 详情
- **THEN** Task Record reference 与 task-scoped Change detail MUST 返回 candidate provenance，环境页签 MUST 通过 Application `inspect` 返回当前机器的有界 probe
- **AND** 全局 Change list MUST 保持 retained-only，Web/HTTP MUST 不直接读取 Receipt 或接受任意 filesystem path

#### Scenario: 正常 Finish 与放弃 cleanup
- **WHEN** fixture 分别提供已交付 normal handoff、明确 abandon authorization 和 ownership 不明 shared root
- **THEN** Environment MUST 分别完成安全清理、清理可证明的 Task-owned dirty 资源、对不明 shared content 返回 blocked/retained
- **AND** Task Finish MUST 不直接调用 worktree cleanup、重复交付或写第二份 cleanup 结论

#### Scenario: 防止双 authority 回退
- **WHEN** package/static/runtime verification 发现旧 contract/binding、旧 environment writer、`worktree context/adopt` guidance、adoption receipt、environment-shaped worktree JSON/help 或 consumer direct edge 任一仍可达
- **THEN** verification MUST 失败并报告具体冲突入口
- **AND** legacy identity 只 MAY 出现在明确 migration module/fixture 与 OpenSpec delta/history，Buildr MUST NOT 把 reader 当作允许旧 mutation/routing 的理由

## MODIFIED Requirements

### Requirement: 产品验证覆盖 task worktree 隔离与证据复用
Buildr package verification MUST 防止正式 workflow 绕过 Task Environment 直接把 task-worktree 当作环境 authority，也 MUST 防止 change artifacts 双写、合并前污染 retained self-bootstrap Workspace，或让 Git/worktree providers重新拥有 Runtime/依赖、Candidate verification 或 evidence 复用决策。

#### Scenario: 校验 Change 创建时机
- **WHEN** Buildr 验证 task-triage、OpenSpec contribution 与随包 Task Environment Skill
- **THEN** 验证 MUST 确认实现型 OpenSpec Change 在 propose 前取得 matching `ready` Environment Receipt
- **AND** 采用 Environment 后 artifacts、实现和候选验证 MUST 只有 receipt 允许的写入位置

#### Scenario: 校验 Git provider 只交接 Git 事实
- **WHEN** Buildr 验证 Product Project 开发规则、task-environment、task-worktree 和 git-ops
- **THEN** 验证 MUST 确认 task-worktree 只提供 repository/checkout/branch/HEAD/clean 与 Git transition evidence
- **AND** task-environment MUST 独占 Runtime/CLI/依赖、projection、资源、restore 与总 cleanup，Task Verification MUST 独占 Candidate/evidence

#### Scenario: 校验 Skill 文本没有重复职责
- **WHEN** Buildr 执行 package 静态验证和任务能力专项测试
- **THEN** verifier MUST 拒绝 task-worktree 中的 Environment ready、runtime preparation、session adoption 或总 cleanup 说明
- **AND** verifier MUST 拒绝 git-ops/task-worktree 重新声明 Candidate 验证命令、保证级别或 evidence 复用决策

#### Scenario: 候选验证保持 retained Workspace 干净
- **WHEN** 产品 E2E 从 Task Validation Workspace 验证未合并候选版本
- **THEN** 验证 MUST 使用 receipt 绑定的验证根或无关临时 Workspace
- **AND** 验证前后的 retained Workspace 与 peer task worktree status/runtime MUST 保持不变

#### Scenario: 不要求 post-merge 重复 E2E
- **WHEN** Buildr 验证产品开发流程文本
- **THEN** 验证 MUST 确认相同 Candidate identity 集成后不要求在 retained 开发分支重复产品 E2E
- **AND** MUST 区分 Candidate E2E 与集成后 retained sync/render/doctor 的正式激活检查

### Requirement: 随包 task-worktree guidance 必须简洁且结构化
Buildr package MUST 以单一 routing description 和结构化正文交付窄 `task-worktree` guidance；description MUST 只匹配明确 Git worktree/本地任务分支意图或 selected Environment provider handoff。正文 MUST 只覆盖 Git plan、创建/复用/检查/保留/清理、evidence、授权与停止条件，并 MUST NOT 声明 Environment 生命周期、Runtime/依赖、session adoption、验证政策或总 cleanup。

#### Scenario: 静态验证简洁结构
- **WHEN** Buildr 验证随包 `task-worktree` Skill
- **THEN** verifier MUST 确认 description 为单句 routing index，且 package/workspace/frontmatter 完全一致
- **AND** verifier MUST 确认正文只消费/提供 `buildr.git-worktree-provider/v1` 的 Git 事实

#### Scenario: Environment 调用 Git provider
- **WHEN** selected Task Environment plan 需要创建或复用 worktree
- **THEN** guidance MUST 要求 provider 返回 repository plan 与真实 Git evidence
- **AND** MUST 将 Environment `ready`、依赖、runtime projection、动态资源和总 cleanup 留给上游 `task-environment`

#### Scenario: 用户只要求 Git worktree 操作
- **WHEN** 用户明确要求定位、创建、复用、保留或清理特定 task worktree/本地任务分支
- **THEN** `task-worktree` MUST 披露精确 repository、branch、path、Git effects 与未授权破坏性动作
- **AND** MUST NOT 自动创建 Task Record、Environment Receipt 或把 provider result 报告为正式执行 ready

#### Scenario: capability 拓扑完成破坏性切换
- **WHEN** Buildr 交付 P0.2 package
- **THEN** `task-worktree` MUST 提供 `buildr.git-worktree-provider/v1`，旧 `buildr.task-worktree-lifecycle@2` provider/binding MUST 不再存在
- **AND** runtime/doctor MUST 不得保留能够让正式 consumer 选择旧 contract 的兼容拓扑
