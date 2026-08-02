# Agent Task Workflows

## Purpose

定义 Buildr 内置场景化 Skills、Agent 任务协作、OpenSpec/Git/worktree/finish 工作流和分层验证契约。
## Requirements

### Requirement: 内置场景化 Skills 引导产品工作流
Buildr MUST 为依赖用户任务意图或工作流阶段的 Buildr 维护流程提供内置 workspace Skills。

#### Scenario: Agent 需要任务分流指引
- **WHEN** 用户要求修 bug、实现或调整功能、改需求、重构、优化、补文档、补测试、调整 API、契约、权限、状态流、数据语义，或询问某项改动是否需要 spec 或 change 管理
- **THEN** Buildr MUST 通过内置 Skill 提供任务意图分流能力
- **AND** 该 Skill MUST 帮助 Agent 先理解用户任务意图和影响范围，再选择后续处理方式

#### Scenario: Agent 需要 OpenSpec 工作流指引
- **WHEN** Agent 需要探索、提案、实现、同步或归档 OpenSpec change
- **THEN** Buildr MUST 依赖可用的 `openspec-*` Skills 匹配该意图
- **AND** Buildr MUST NOT 要求 Agent 读取 optional OpenSpec Rule 来执行该工作流

#### Scenario: Agent 需要代码开发工作流指引
- **WHEN** 用户要求代码开发、修 bug、实现功能、执行构建或测试、多仓协作、隔离任务分支、处理长期任务上下文，或清理已上线、已归档或已收尾的任务
- **THEN** Buildr MUST 通过内置 Skill 提供任务 worktree 生命周期指引
- **AND** 该 Skill MUST 覆盖任务 worktree 的创建、使用、保留和清理边界

#### Scenario: Agent 需要 Git 操作指引
- **WHEN** 用户表达提交、commit、推送、push、提交并推送、合并、merge、rebase、发布、release、删除分支或清理远端分支的意图，或 Git 操作授权、提交范围、amend、远端改写、分支删除存在歧义
- **THEN** Buildr MUST 通过内置 Skill 提供 Git 协作策略
- **AND** 该 Skill MUST 覆盖意图消歧、授权边界、提交范围、amend 策略、远端安全默认值和失败处理
- **AND** 该 Skill MUST NOT 成为通用 Git 命令教程

#### Scenario: Agent 需要完整任务收尾
- **WHEN** 用户在 task worktree 中表达“收尾”、完成任务或自动完成剩余归档与集成动作的意图
- **THEN** Buildr MUST 通过独立的 Task Finish Skill 编排 OpenSpec、验证、Git 集成和本地 worktree 清理
- **AND** Git Ops Skill MUST NOT 同时把完整任务收尾解释为只检查状态并等待逐项授权

### Requirement: Buildr Skill 引导场景化内置 Skills
产品内置 Buildr Skill MUST 在用户意图匹配相关工作流时，引导 Agent 使用场景化内置 Skills。

#### Scenario: 用户询问 Rules 与 Skills
- **WHEN** 用户询问如何维护或重组 Buildr rules 和 skills
- **THEN** Buildr Skill MUST 说明任务触发型流程应归入 Skills
- **AND** Buildr Skill MUST 将 required Rules 视为 ontology、源资产边界和常驻 invariants 的承载位置

#### Scenario: Agent runtime 找不到场景化 Skill
- **WHEN** 某个工作流应由内置场景化 Skill 处理，但当前 Agent runtime 找不到该 Skill
- **THEN** Buildr Skill MUST 引导 Agent 检查 workspace Skills 源资产和 runtime 投射状态
- **AND** Buildr Skill MUST 优先引导 `skills render`、`sync` 或 doctor 指导的修复，而不是把工作流文本复制到 Rules

### Requirement: 任务工作流必须显式可见
Buildr task 和 OpenSpec Skills MUST 在改变 task state 前，以及已报告状态发生实质变化时，明确 workflow selection、task environment location、repository set 和当前 OpenSpec change status。

#### Scenario: 使用 OpenSpec 前说明 change
- **WHEN** Agent 决定 create、explore、apply、sync 或 archive OpenSpec change
- **THEN** Agent MUST 在执行动作前说明正在使用 OpenSpec
- **AND** Agent MUST 在已知时尽快明确 change id、resolved change path 和 intended action

#### Scenario: 采用 OpenSpec 时说明当前 change 状态
- **WHEN** task triage 选择或继续 OpenSpec change-flow
- **THEN** Agent MUST 在面向用户的回复中包含当前 change status
- **AND** status MUST 在已知时标识 change id、resolved change path、current action，以及 change 是 planned、active、blocked、apply-ready、complete 还是 archived
- **AND** 在可用时，status MUST 汇总 artifact 或 task progress，并明确 next executable action 或 blocking reason
- **AND** Agent MUST 在首次采用 OpenSpec、状态发生实质变化、工作暂停或完成，或用户询问进度时刷新该 status

#### Scenario: 创建或复用 task environment 前说明位置
- **WHEN** Agent 决定 create 或 reuse task environment
- **THEN** Agent MUST 在 task edits 前说明正在创建还是复用 environment
- **AND** Agent MUST 明确当前 Buildr Workspace root、task id、environment root、任务分支和显式选择的 repository set

#### Scenario: Task environment canonical location
- **WHEN** Agent 在 Buildr Workspace 中创建 task environment
- **THEN** 其 canonical root MUST 为 `<workspace-root>/.worktrees/<task-id>`
- **AND** Agent MUST NOT 静默回退到 `/tmp` 或其他任意位置
- **AND** 同一 task MUST reuse 其现有 environment
- **AND** multi-repository task MUST 在同一 environment identity 下使用 registry-qualified repository selectors，MUST NOT 用彼此无关联的 repo-qualified task ids 冒充统一环境

#### Scenario: Task environment lifecycle remains a Skill concern
- **WHEN** Buildr 打包 task worktree guidance
- **THEN** placement、repository selection、disclosure、reuse、retention 和 cleanup procedures MUST 保留在 task Skills 中
- **AND** required Core Rule MUST NOT 复制 task environment operation manual

### Requirement: 发布 worktree 在远端候选确认后默认清理
Buildr task-worktree guidance MUST 将发布 worktree 与需要持续联调的普通开发 worktree 区分，并在发布目标完成后默认清理不再需要的本地发布环境。

#### Scenario: 推送并确认发布分支后清理本地发布环境
- **WHEN** Agent 使用临时 worktree 制作发布分支
- **AND** 远端发布分支已推送且远端 ref 与候选提交一致
- **AND** worktree 干净且没有明确的后续本地构建、部署、修复或验证动作
- **THEN** Agent MUST 删除本地发布 worktree 和已由远端安全承载的本地发布分支
- **AND** Agent MUST NOT 因普通开发任务的保守保留策略继续保留该发布 worktree
- **AND** Agent MUST NOT 自动删除远端发布分支

#### Scenario: 存在后续本地发布动作时保留
- **WHEN** 发布分支推送后仍有明确的本地构建、部署、修复或验证动作
- **THEN** Agent MUST 保留发布 worktree
- **AND** Agent MUST 向用户说明保留原因和下一项本地动作

### Requirement: Buildr Skill 统一表达 doctor 生命周期
Buildr Skill MUST 通过统一执行循环表达 Buildr 状态变更后的 doctor 验证流程，并避免在每个资产章节重复相同要求。

#### Scenario: 状态变更后的统一验证
- **WHEN** Agent 通过 Buildr Skill 完成 workspace 状态变更
- **THEN** Buildr Skill MUST 要求运行 `buildr doctor --agent <agent> --target <dir> --json`
- **AND** 完成标准 MUST 要求不存在需要立即处理的 error

#### Scenario: 资产章节避免重复
- **WHEN** Buildr Skill 分别说明 Workspace、Project、Service、Rules 或 runtime 维护动作
- **THEN** 各资产章节 MUST 依赖共享执行循环完成通用 doctor 验证
- **AND** 只有该资产存在额外诊断语义时才能补充专项检查说明

#### Scenario: Bootstrap 兜底一致
- **WHEN** Buildr Skill 不可用且 Agent 使用 bootstrap guide
- **THEN** bootstrap MUST 保留状态变更后运行当前 Agent doctor 的最小兜底流程

### Requirement: Buildr 通过声明式 Skill Contribution 编排 OpenSpec 契约门禁
Buildr MUST 由 OpenSpec Component 向通用 workspace Skills 的稳定 slot 贡献门禁说明，在 change 建立、同步和归档边界调用契约门禁，并保持通用 Skills 与外部 OpenSpec Skills 可独立更新。

#### Scenario: Change artifacts 达到 apply-ready
- **WHEN** task triage 选择 change-flow 且 proposal、design、specs 和 tasks 已达到 apply-ready
- **THEN** installed OpenSpec Component MUST 在 `task-triage` runtime Skill 的 change-ready slot 贡献建立基线和 proposal stage check 的说明
- **AND** Agent MUST 使用 `openspec-contract-guard` 建立契约基线并运行 proposal stage check
- **AND** 门禁未通过时 Agent MUST 将 change 报告为 blocked 而不是开始实现

#### Scenario: Delta 实现期间改变触达范围
- **WHEN** Agent 修改 delta 使其新增或改变 Requirement identity
- **THEN** Agent MUST 再次运行 proposal stage check
- **AND** Agent MUST 显式更新不完整基线而不是由普通 check 自动采用当前事实

#### Scenario: Task Finish 同步前后执行门禁
- **WHEN** `task-finish` 准备同步并归档带 delta specs 的 change
- **THEN** installed OpenSpec Component MUST 分别向 `task-finish` runtime Skill 的 pre-sync 和 post-sync slot 贡献对应门禁说明
- **AND** Task Finish MUST 在 canonical spec sync 前运行 pre-sync check
- **AND** Task Finish MUST 在 sync 后、archive 前运行 post-sync check
- **AND** 任一检查失败时 MUST 停止尚未执行的 archive、commit、push 和 cleanup

#### Scenario: OpenSpec Component 已卸载
- **WHEN** OpenSpec Component 为 disabled 或 uninstalled 且 Agent runtime 被重新渲染
- **THEN** `task-triage`、`task-finish` 和产品入口 Buildr Skill MUST NOT 包含 OpenSpec contract guard 的专用命令或路由
- **AND** 通用 Skills MUST 继续支持其不依赖 OpenSpec Component 的既有职责

#### Scenario: 外部 OpenSpec workflow 保持原样
- **WHEN** Buildr 发布或升级契约门禁
- **THEN** Buildr MUST 通过 Component-owned contribution、自有 Skill 和 CLI 编排门禁
- **AND** Buildr MUST NOT 要求修改外部 `openspec-*` Skills 来承载 Buildr 检查逻辑

#### Scenario: 门禁诊断对用户可见
- **WHEN** 契约检查阻塞 change-flow 或 task finish
- **THEN** Agent MUST 报告 change、stage、冲突或陈旧 Requirement、当前状态和可执行下一步
- **AND** Agent MUST NOT 把 warning 或未验证状态描述为门禁通过

### Requirement: task-triage 明确 OpenSpec 中文文档约束
Buildr 的 task-triage Skill MUST 在选择或继续 OpenSpec 工作流时，要求 Agent 使用中文编写 Buildr 自有 OpenSpec 文档和用户可见说明，并说明允许保留英文的格式与技术内容。

#### Scenario: task triage 选择 OpenSpec
- **WHEN** task triage 选择或继续 OpenSpec change-flow
- **THEN** 其面向用户的 guidance MUST 要求 Buildr 自有文档正文使用中文
- **AND** 它 MUST 允许 English commands、paths、code identifiers、protocol fields、YAML/frontmatter 和 OpenSpec format keywords

### Requirement: Git Ops 默认保持线性任务历史
Buildr Git Ops Skill MUST 对任务分支采用 rebase-first、fast-forward-only 的默认集成策略，并保留 Git 写操作授权边界。

#### Scenario: 本地未推送任务分支发生分叉
- **WHEN** 任务分支包含本地未推送提交且目标分支出现新提交
- **THEN** Agent MUST 先 fetch 最新目标分支
- **AND** Agent MUST 默认将任务分支 rebase 到最新目标分支
- **AND** Agent MUST 比较 rebase 前后的 Git tree
- **AND** 仅当 tree 改变时，Agent MUST 在集成前重新运行受影响的验证

#### Scenario: 集成任务分支到目标分支
- **WHEN** Agent 已获当前轮次的合并授权并准备把任务分支集成到目标分支
- **THEN** Agent MUST 默认使用 fast-forward-only 集成
- **AND** Agent MUST NOT 自动创建 merge commit

#### Scenario: 用户明确要求 merge commit
- **WHEN** 用户当前轮次明确要求 merge commit，或项目规则明确要求 non-fast-forward merge
- **THEN** Agent MAY 使用 merge commit
- **AND** Agent MUST 在执行前报告目标分支和集成方式

#### Scenario: 已推送或共享任务分支
- **WHEN** 任务分支提交已经推送或被多人共享
- **THEN** Agent MUST NOT 自动 rebase 或 force push
- **AND** Agent MUST 等待用户明确授权历史改写或选择其他集成方式

#### Scenario: Rebase 冲突需要语义决策
- **WHEN** rebase 冲突无法通过保持双方既有语义机械解决
- **THEN** Agent MUST 停止并报告冲突
- **AND** Agent MUST 等待用户确认后继续

### Requirement: OpenSpec apply 保持 canonical specs 直到受控同步阶段
Buildr OpenSpec apply guidance MUST 要求 Agent 在 active change 的实现阶段只修改 change artifacts 与实现内容，MUST NOT 在当前会话的 `pre-sync` contract guard 成功前写入该 change 的 canonical specs。Agent MUST 在 pre-sync 成功后执行 agent-driven canonical sync，并在 `post-sync` guard 返回 `ok: true` 后才使用 `openspec archive <change> --skip-specs --yes`。

#### Scenario: apply 阶段尚未进入受控同步
- **WHEN** Agent 正在实现 active OpenSpec change，且当前会话尚未取得该 change 的成功 pre-sync receipt
- **THEN** Agent MUST NOT 将该 change 的 delta 预写入 canonical specs
- **AND** MUST 保持 canonical Requirement 与 baseline 可比较，直到 Task Finish 进入受控同步阶段

#### Scenario: 受控同步与归档
- **WHEN** pre-sync guard 返回 `ok: true`，Agent 已按该 change 的 delta 完成 canonical sync，且 post-sync guard 返回 `ok: true`
- **THEN** Agent MUST 记录同步证据并使用 `openspec archive <change> --skip-specs --yes`
- **AND** archive 后 MUST 继续执行 strict validation、status 与现有 closeout workflow checks

#### Scenario: pre-sync 或 post-sync 未通过
- **WHEN** pre-sync 或 post-sync guard 未返回 `ok: true`
- **THEN** Agent MUST 停止 canonical sync 后续动作或 archive
- **AND** MUST NOT 通过 baseline adopt、重跑 pre-sync 或 `--skip-specs` 掩盖失败

### Requirement: 实现任务采用分层验证门禁
Buildr 任务流程 MUST 由 selected task-verification provider 将实现期间的验证分为单任务最小反馈、任务组受影响范围验证和最终候选完整验证，并 MUST 防止同一候选状态重复执行已被上层入口覆盖的检查。

#### Scenario: 单任务只做最小反馈检查
- **WHEN** Agent 完成任务组内的一个实现任务且没有跨越高风险边界
- **THEN** selected provider MUST 只运行语法、类型或与该任务直接相关的小范围检查
- **AND** provider MUST NOT 默认运行当前 workspace 或 Project 定义的完整验证入口

#### Scenario: 任务组集中运行受影响验证
- **WHEN** 共享实现区域、验证入口或失败影响面的任务组全部完成
- **THEN** selected provider MUST 集中运行一次受影响范围验证
- **AND** provider MUST NOT 为组内每项任务机械重复同一专项检查

#### Scenario: Workspace 定义具体验证入口
- **WHEN** Buildr 将任务流程 Skills 交付到用户 workspace
- **THEN** task-verification Skill MUST 使用通用的最小反馈、受影响范围和完整验证语义
- **AND** 具体检查命令 MUST 由当前 workspace 或 Project 的规则、OpenSpec 或开发文档定义
- **AND** Skill MUST NOT 将 Buildr 产品仓的 package check、临时 workspace E2E 或产品总验证命令规定为所有项目的固定入口

#### Scenario: 最终候选完成全部修订
- **WHEN** 全部实现、自然语言资产、生成资产同步和 review 修订已经完成
- **THEN** selected provider MUST 冻结候选并运行一次项目要求的完整验证
- **AND** Agent MUST NOT 使用较早候选的验证结果声称当前实现完成

### Requirement: Git 工作区转换后诊断 Buildr Agent 环境
Buildr required Core MUST 固化“成功改变已检出 Git tree 后检查 Buildr Agent 环境”的 workspace transition invariant；执行一般 Git 工作流的 Agent MUST 通过产品入口 Buildr Skill 完成具体诊断与修复边界，创建 canonical task worktree 时 MUST 使用 Buildr 的确定性 worktree bootstrap 入口，而不依赖某个 optional Git Skill 的身份。

#### Scenario: Git 操作成功改变已检出内容
- **WHEN** Agent 通过任一 Git capability provider 成功完成 `pull`、`merge`、`rebase`、切换 tree 的 `checkout` 或 `switch`、改变工作区的 `reset`、`cherry-pick`、`revert`、`stash apply` 或 `stash pop`
- **AND** 当前仓库位于包含 `.buildr/workspace.yml` 的已初始化 Buildr workspace 中
- **THEN** Agent MUST 针对当前 Agent 和 Buildr workspace root 运行 `buildr doctor --agent <agent> --target <workspace-root> --json`
- **AND** 检查 MUST 发生在 Git 操作成功且工作区不存在未解决冲突之后

#### Scenario: Git 操作不改变已检出内容
- **WHEN** Agent 只执行 `fetch`、`push`、普通 `commit`，或复用未发生 tree 转换的既有 worktree
- **THEN** Agent MUST NOT 仅因该操作运行 Git 工作区转换后的 Buildr 环境检查

#### Scenario: 当前环境无需处理
- **WHEN** 工作区转换后的 doctor 没有报告需要用户处理的环境问题
- **THEN** Agent MUST NOT 提醒用户执行无必要的 `render` 或 `sync`

#### Scenario: 当前环境存在漂移或依赖问题
- **WHEN** 工作区转换后的 doctor 报告 Rules、Skills、capability bindings、Commands、Components、Contributions 或当前 Agent runtime 存在需要处理的问题
- **THEN** Agent MUST 向用户汇总当前环境问题及 doctor 指向的可执行下一步
- **AND** Agent MUST NOT 将全部问题笼统解释为 runtime 渲染问题
- **AND** Agent MUST 说明当前 session 是否重新发现新资产由 Agent runtime 决定

#### Scenario: 当前 provider 已报告 treeChanged
- **WHEN** 已绑定 Git provider 的结果证据包含 `treeChanged: true`
- **THEN** consumer 或 orchestrator MUST 触发 required workspace transition invariant
- **AND** Agent MUST NOT 因 provider id 不等于 `git-ops` 而跳过检查

#### Scenario: 一般环境漂移可由 workspace sync 修复
- **WHEN** 非 worktree-create 工作区转换后的 doctor 指出当前 Agent 的 workspace sync 是合适修复动作
- **THEN** Agent MUST 询问用户是否由 Agent 立即同步当前 workspace 和 Agent runtime
- **AND** Agent MUST 同时提供 `buildr sync <agent> --target <workspace-root>` 作为手动同步备选
- **AND** 面向用户的手动命令 MUST 使用已解析的实际 Agent 和 workspace root，不得保留占位符
- **AND** Agent MUST NOT 在用户确认前执行 sync
- **AND** Agent MUST NOT 把要求用户自行运行命令作为默认处理方式

#### Scenario: 用户确认由 Agent 同步
- **WHEN** 用户确认由 Agent 处理 workspace sync
- **THEN** Agent MUST 调用 Buildr Skill 执行 `buildr sync <agent> --target <workspace-root>`
- **AND** Agent MUST 使用 sync 的最终 doctor 或追加 doctor 确认当前环境结果
- **AND** Agent MUST 报告实际同步与诊断结果，而不是仅重复手动命令

#### Scenario: 用户选择手动同步或 Agent 无法执行
- **WHEN** 用户明确选择手动同步，或 Agent 因工具不可用、权限、登录态或外部环境无法完成同步
- **THEN** Agent MUST 提供准确的手动同步命令
- **AND** Agent MUST 在无法执行时说明具体原因
- **AND** 用户选择手动同步后，Agent MUST NOT 在缺少诊断证据时假设同步成功
- **AND** 用户报告完成且 Agent 能运行 doctor 时，Agent MUST 再次验证当前环境

#### Scenario: 诊断问题不应由 sync 修复
- **WHEN** doctor 报告 Commands、Components、CLI 或其他不能由 workspace sync 正确修复的问题
- **THEN** Agent MUST 按对应 Buildr 生命周期询问并在取得授权后执行可完成的动作
- **AND** Agent MUST 仅在自身无法完成或用户选择手动方式时要求用户操作

#### Scenario: 无法确认当前 Agent 环境
- **WHEN** Agent 无法匹配受支持的 runtime adapter，或 post-transition doctor 无法执行
- **THEN** Agent MUST 报告环境状态尚未确认及具体原因
- **AND** Agent MUST NOT 猜测本地 Agent runtime 已经同步

#### Scenario: 产品创建新 task worktree 并自动准备环境
- **WHEN** Agent 已明确 task id、task branch、start point、当前 Agent 和 Buildr workspace root，并调用 Buildr worktree create 入口
- **THEN** Buildr MUST 在 canonical `<workspace-root>/.worktrees/<task-id>` 创建 checkout 并确定性运行目标 checkout doctor
- **AND** 只有目标为本次刚创建、已初始化、Git clean、identity 未变化且全部 actionable findings 仅为当前 Agent runtime projection stale 时，Buildr MUST 自动执行该目标 workspace sync
- **AND** sync 后 Buildr MUST 再次确认 Git identity/clean 状态并以最终 doctor 判定 bootstrap 结果
- **AND** 上述自动 sync 授权 MUST 由 worktree create 命令本身承载，不再逐次请求用户确认

#### Scenario: 新 task worktree 不满足安全自动 sync 条件
- **WHEN** 新 checkout doctor、Git 状态或 sync preflight 包含 mutation、dirty、identity 变化、Commands、Components、CLI、builtin ownership、capability graph、workspace source decision 或任意未知 actionable finding
- **THEN** Buildr MUST NOT 自动执行 sync 或 doctor 返回的任意修复命令
- **AND** Buildr MUST 保留已创建 worktree、返回 blocked 原因和可执行 nextActions
- **AND** Buildr MUST NOT 自动删除 checkout、丢弃内容或扩大 Git 授权

#### Scenario: 幂等复用既有 task worktree
- **WHEN** canonical task path 已注册为同一 repository 与 branch 的既有 worktree
- **THEN** Buildr MUST 返回 `reused` 与 `treeChanged: false`
- **AND** Buildr MUST NOT 仅因复用重复运行创建后的 doctor 或自动 sync
- **AND** path、repository 或 branch identity 不匹配时 MUST fail closed 且零写入

#### Scenario: 任务 Skill 内部发生其他工作区转换
- **WHEN** `task-finish` 通过绑定 provider 改变目标 workspace tree，或 task workflow 执行 worktree create 之外的 tree transition
- **THEN** 对应任务 Skill MUST 复用 required Core invariant 与产品入口 Buildr Skill 的环境检查、同步询问、Agent 执行和手动兜底边界
- **AND** 检查 MUST NOT 改变既有验证证据、Git 授权或 worktree 清理契约

#### Scenario: Git 操作由 Agent 之外执行
- **WHEN** 用户或其他程序绕过 Agent Skill 和 Buildr worktree create 入口直接改变 Git 工作区
- **THEN** Buildr MUST NOT 声称能够即时感知该操作
- **AND** 后续 Buildr 工作流 MUST 继续通过执行循环中的基线 doctor 检查当前环境

### Requirement: Buildr 发布准备使用版本化任务环境
Buildr Product Project 的发布引导 MUST 从目标 package version 派生唯一发布任务 identity，并在新发布 worktree 中先准备 lockfile 定义的依赖，再修改或验证候选内容。

#### Scenario: 创建发布任务分支和 worktree
- **WHEN** Agent 为目标版本 `<version>` 准备 Buildr 候选版或稳定版
- **THEN** 发布 task id MUST 为 `release-<version>`
- **AND** 发布任务分支 MUST 为 `tasks/release-<version>`
- **AND** canonical worktree path MUST 为 `<workspace-root>/.worktrees/release-<version>`
- **AND** `<version>` MUST 是不带 `v` 前缀的完整 package version

#### Scenario: 新发布 worktree 先准备依赖
- **WHEN** Agent 创建了新的 Buildr 发布 worktree
- **THEN** Agent MUST 在该 worktree 的 `projects/product` 中执行 `npm ci`
- **AND** `npm ci` MUST 发生在版本文件修改、发布材料修改和候选验证之前
- **AND** `npm ci` 失败时 Agent MUST 停止发布准备并报告依赖准备阻塞

#### Scenario: 继续已有版本的发布任务
- **WHEN** `tasks/release-<version>` 和对应 canonical worktree 已存在
- **THEN** Agent MUST 复用该分支和 worktree
- **AND** Agent MUST 在依赖缺失或 lockfile 已变时重新执行 `npm ci`
- **AND** Agent MUST NOT 为同一版本创建第二个发布任务 identity

### Requirement: squash 发布候选以 tree identity 幂等衔接回 dev
Buildr Product Project 的发布引导 MUST 在 `dev -> main` 发布 PR squash merge 后，以已验证候选的 Git tree identity 为内容门禁，将 squash `main` 的历史幂等衔接回 `dev`。

#### Scenario: squash 后候选 tree 完全一致
- **WHEN** `dev -> main` 发布 PR 已按仓库策略 squash merge
- **AND** `origin/main^{tree}` 与已通过完整验证的 candidate tree identity 相同
- **AND** `origin/dev^{tree}` 与该 candidate tree identity 相同
- **THEN** Agent MUST 将 `origin/main` 的历史衔接到 `dev`
- **AND** 衔接 commit MUST 保持与 candidate tree identity 相同的 Git tree
- **AND** Agent MUST 普通 push `dev` 并确认远端 `dev` 包含该衔接
- **AND** Agent MUST NOT 仅因 squash commit 或衔接 commit 的 commit identity 不同而重复执行已通过的完整候选验证

#### Scenario: main 已是 dev 祖先
- **WHEN** Agent 准备执行 squash 后历史衔接
- **AND** `origin/main` 已是 `origin/dev` 的祖先
- **THEN** Agent MUST 将历史衔接视为已完成
- **AND** Agent MUST NOT 重复创建历史衔接 commit

#### Scenario: squash 结果与已验证候选 tree 不一致
- **WHEN** `origin/main^{tree}` 或 `origin/dev^{tree}` 与已记录的 candidate tree identity 不同
- **THEN** Agent MUST 停止自动历史衔接、push 和后续 tag 动作
- **AND** Agent MUST 报告实际 tree identity、预期 candidate tree identity 和需要重新评估的 ref
- **AND** Agent MUST NOT 使用 `ours` merge、force push、reset 或其他历史操作掩盖内容差异

#### Scenario: 远端 ref 在衔接前发生竞争更新
- **WHEN** tree identity 检查后、历史衔接或 push 前 `origin/main` 或 `origin/dev` 不再指向已检查的 ref
- **THEN** Agent MUST 停止尚未执行的历史衔接和 push
- **AND** Agent MUST 重新 fetch 并从 tree identity 门禁开始重新评估

#### Scenario: 发布授权覆盖发布专用历史衔接
- **WHEN** 用户当前轮次明确要求准备 Buildr 候选版或稳定版
- **AND** 历史衔接的 tree identity 门禁已通过
- **THEN** Buildr Release Skill MAY 自动创建仅衔接 squash `main` 历史且不改变 tree 的 merge commit
- **AND** 该授权 MUST NOT 扩展为通用 Git Ops 或 Task Finish 的 merge commit 授权
- **AND** 该授权 MUST NOT 包含 force push、改写共享分支历史或解决内容冲突

### Requirement: task-triage 必须输出正交且有证据的任务决策
Buildr 的 `task-triage` Skill MUST 先核对任务相关事实，再分别判断语义治理、执行形态和任务跟踪；输出 MUST 包含选择、repository set、task environment、最小依据、未决冲突和 next provider/action，并 MUST 只在适用时追加 OpenSpec 或任务看板状态。

#### Scenario: 已有契约的实现任务
- **WHEN** canonical spec 已定义目标行为且任务需要代码修改、构建、测试或长期实现上下文
- **THEN** triage MUST 选择 `code-only + implementation`
- **AND** MUST 解析完整 repository set 并通过 selected task-worktree provider 创建或复用 task environment

#### Scenario: 独立收敛当前事实文档
- **WHEN** canonical specs、当前实现与 registries 已能确认现行事实，任务只让 current knowledge 追上该事实且不进入代码、构建或测试
- **THEN** triage MUST 选择 `spec-maintenance + metadata-only`
- **AND** MUST 使用 selected current-knowledge provider 的 `maintain` operation，不得为既有事实补造 OpenSpec Change

#### Scenario: Authority 或执行范围不明确
- **WHEN** 可信事实源冲突、授权边界不明、repository set 无法确认或是否进入实现无法判断
- **THEN** triage MUST 返回 `blocked` 或 `unknown` 并提出改变长期语义所需的最少问题
- **AND** MUST NOT 预先写入 change artifacts、current knowledge 或 task environment 内容

### Requirement: task-triage 必须通过条件能力依赖交接专业动作
`task-triage` MUST optional 依赖 `buildr.current-knowledge-maintenance/v2`、`buildr.task-worktree-lifecycle/v2` 和 `buildr.task-board-maintenance/v1`，并 MUST 只在相应决策分支执行前读取 contract 与 selected provider；任何 provider 不 ready MUST 只阻塞或降级对应分支，不得使无关 triage 结论不可用。

#### Scenario: Implementation 分支缺少 worktree provider
- **WHEN** triage 已确认 `implementation` 但 `buildr.task-worktree-lifecycle/v2` 未 ready
- **THEN** execution 分支 MUST fail closed 并报告 capability readiness 与 next action
- **AND** semantic decision MUST 保持可见

#### Scenario: 当前事实 maintain provider 不可用
- **WHEN** triage 选择独立 `spec-maintenance` 但 `buildr.current-knowledge-maintenance/v2` 未 ready
- **THEN** current knowledge 写入 MUST 停止
- **AND** triage MUST NOT 回退为无 evidence 的直接文档编辑或伪造 Change

#### Scenario: Verification provider 暂时不可用
- **WHEN** triage 只为实现任务规划验证节点
- **THEN** triage MUST NOT 因 `buildr.task-verification/v2` 暂时不可用而阻塞语义和位置判断
- **AND** 实际验证开始前仍 MUST 由相应 consumer 解析 selected verification provider

### Requirement: task-triage 路由任务看板
Buildr 的 task-triage Skill MUST 在理解任务意图和影响范围后判断任务看板是“不需要”“创建”还是“继续维护”，并 MUST 在需要看板时通过 selected `buildr.task-board-maintenance/v1` provider 执行，而不是在 task-triage 中复制完整可视化流程；OpenSpec change MUST 作为可选真实关联，MUST NOT 成为创建任务看板的前置条件。

#### Scenario: 复杂任务需要任务看板
- **WHEN** task triage 发现任务跨批次、跨 change、跨服务或团队，存在交叉依赖、长期跟踪或多次用户判断
- **THEN** task triage MUST 将任务看板判定为“创建”或“继续维护”
- **AND** Agent MUST 使用 selected task-board provider 执行创建或维护

#### Scenario: 看板需要先建立 change 锚点
- **WHEN** task triage 判定复杂任务需要创建任务看板但尚无已创建的 OpenSpec change
- **THEN** task triage MUST 基于任务语义保持 `code-only`、`spec-maintenance` 或 `change-flow` 决策，并以稳定 task identity 创建或维护看板
- **AND** Agent MUST NOT 用未来 change 名称、普通计划或虚假 change 代替真实关联

#### Scenario: 复杂 code-only 任务没有 change
- **WHEN** 复杂任务需要任务看板但当前工作不改变业务语义且没有 OpenSpec change
- **THEN** task triage MUST 保持 `code-only` 并允许以稳定 task identity 创建看板
- **AND** MUST NOT 为满足看板格式而创建虚假 change 或 planned change 关联

#### Scenario: task triage 输出看板状态
- **WHEN** task triage 选择创建或继续维护任务看板
- **THEN** 面向用户的路径判定 MUST 在可确认时包含 task id、看板路径、真实 change 关联或 `none`、当前状态和 provider result
- **AND** task triage MUST NOT 猜测尚未解析的 Project、change 或文件路径

### Requirement: 任务进展回复保持任务看板可发现
Buildr task workflow guidance MUST 要求 Agent 在任务看板首次创建、迁移、实质更新、用户询问进度、任务暂停或完成时提供任务看板入口，并 MUST 避免在没有状态变化的每条短暂中间消息中机械重复链接。

#### Scenario: 实质状态变化后回复
- **WHEN** 任务看板对应任务的批次、目标、方案、完成项、阻塞或验证结论发生实质变化
- **THEN** Agent MUST 先更新任务看板再汇报进展
- **AND** 回复 MUST 包含任务看板入口

#### Scenario: 短暂中间动作
- **WHEN** Agent 仅执行没有改变任务认知的短暂命令或检查
- **THEN** Agent MAY 省略任务看板链接
- **AND** 任务看板 MUST 在下一次实质状态回复中继续可发现

### Requirement: 内置任务 Skills 按 capability contract 协作
Buildr 内置任务 Skills MUST 依赖 capability contracts 而不是硬编码 optional Skill identity；Task Finish MUST 通过 optional `buildr.task-asset-review/v2` dependency 触发 observation finalize，并将全部审查政策保留在 provider。

#### Scenario: Task Finish 使用 optional v2 provider
- **WHEN** Buildr 声明 `task-finish` builtin
- **THEN** manifest MUST 将 `buildr.task-asset-review/v2` 声明为 optional dependency
- **AND** provider 替换后 Task Finish MUST 保持同一 finalize/result contract

#### Scenario: Optional provider 缺失
- **WHEN** v2 provider 不可用
- **THEN** Task Finish readiness MUST 保持 non-blocking degraded
- **AND** 其他 required providers MUST 不受影响

### Requirement: 最终 Candidate 任务勾选作为可审计验证结果元数据
Buildr Product MUST 允许 Task Finish 将严格限定的最终 Candidate task checkbox transition 分类为 `closeout-metadata-only`，并 MUST 使用 `verification-result-metadata-only` subtype 组合原 Candidate evidence 与独立 transition evidence，而不得声称原 Candidate 直接验证了变化后的 delivery tree。

#### Scenario: 同一会话勾选唯一最终 Candidate 任务
- **WHEN** 当前会话的 Candidate 对 implementation identity 成功产生可复用 evidence，随后 active change 中唯一明确的最终 Candidate 任务仅由 `- [ ]` 变为 `- [x]`
- **THEN** Task Finish MUST 保留原 implementation Candidate evidence，并记录 source/target identity、change/task identity、精确 old/new marker 和 `verification-result-metadata-only` subtype
- **AND** Task Finish MUST NOT 调用 task-verification `execute` 或 Candidate executor
- **AND** 最终报告 MUST 分别说明 Candidate 验证的树与 metadata transition 覆盖的 delivery tree

#### Scenario: checkbox transition 伴随其他变化
- **WHEN** 勾选 Candidate task 的同时存在任务文本、顺序、其他 task、文件或实现内容变化
- **THEN** Task Finish MUST 将 transition 归类为 `implementation-changed`
- **AND** Task Finish MUST 在交付前重新运行 Candidate

#### Scenario: transition 来源或任务身份不可证明
- **WHEN** 当前会话无法关联刚成功的 Candidate evidence、存在多个可能任务、source identity 不匹配或 transition evidence 已丢失
- **THEN** Task Finish MUST NOT 仅凭 `tasks.md` 最终 diff 推断 `verification-result-metadata-only`
- **AND** Task Finish MUST fail closed 并重新运行 Candidate

### Requirement: OpenSpec apply 协调最终验证任务标记
Buildr OpenSpec apply sidebar MUST 指导 Agent 在最终 Candidate 成功后捕获 Candidate evidence，再仅勾选对应验证任务并捕获精确 transition evidence；Buildr MUST NOT 通过修改外部 `openspec-*` Skill 源实现该协调。

#### Scenario: Candidate 是 tasks 中最后一个验证任务
- **WHEN** Agent 按 OpenSpec apply 执行 active change，且未完成任务是最终 Candidate 验证
- **THEN** Agent MUST 先对未勾选状态运行 Candidate并捕获 identity/evidence，再将对应 checkbox 由 `- [ ]` 改为 `- [x]`
- **AND** Agent MUST 立即确认该 checkbox 是唯一内容差异并记录 target identity

#### Scenario: 最终标记不满足严格条件
- **WHEN** OpenSpec apply 需要同时更新多个任务、修正文案或产生其他内容变化
- **THEN** Agent MUST 按普通 implementation change 处理
- **AND** Agent MUST NOT 创建可复用的 verification-result metadata transition

### Requirement: OpenSpec workflow 必须通过能力契约组合当前认知维护
Buildr MUST 通过 capability dependencies 和 OpenSpec Component-owned Skill Contributions 将当前认知维护组合进外部 OpenSpec 1.6.0 workflow，并 MUST 保持 external `openspec-*` Skill 源可独立升级。Consumers MUST 依赖 capability identity 和 result evidence，不得依赖默认 provider Skill id 或声明静态方法调用。

#### Scenario: Explore 使用可选术语治理
- **WHEN** installed `openspec-explore` consumer 可解析 `buildr.terminology-governance/v1`
- **THEN** Agent MUST 在发现重要术语、别名或作用域冲突时读取 selected provider 并记录对齐结果
- **AND** provider 缺失时 consumer MUST 保持 degraded 可用并显式标注未治理术语

#### Scenario: Planning 和实现 consumers 使用 required 当前认知维护
- **WHEN** Buildr 声明 `openspec-propose`、`openspec-update-change`、`openspec-apply-change` 或 `openspec-sync-specs` builtin consumers
- **THEN** 每个 consumer MUST required 依赖 `buildr.current-knowledge-maintenance/v1`
- **AND** required provider 未 ready 时 consumer MUST 按现有 capability readiness fail closed

#### Scenario: Task Finish 使用 required 当前认知维护
- **WHEN** Buildr 声明 `task-finish` builtin
- **THEN** manifest MUST 将 `buildr.current-knowledge-maintenance/v1` 声明为 required dependency
- **AND** Task Finish MUST 使用 selected provider 的 inspect result，而不是在自身正文复制术语和 knowledge policy

#### Scenario: Archive 保持纯归档职责
- **WHEN** Buildr 声明 `openspec-archive-change` builtin
- **THEN** archive consumer MUST NOT 为归档后 knowledge 或 glossary 写入声明直接 dependency
- **AND** archive MUST 只移动已完成前置对齐的 Change

#### Scenario: OpenSpec Component 更新或卸载
- **WHEN** Buildr 更新或卸载 OpenSpec Component 并重新 render runtime
- **THEN** Buildr-owned contributions MUST 按 Component lifecycle 更新或移除
- **AND** external OpenSpec Skill source bytes MUST 保持与受支持上游版本一致
- **AND** dependency readiness MUST 通过 workspace manifest 和 runtime binding evidence 表达

### Requirement: Change lifecycle 必须在最终验证前收敛 Brief 与当前认知
Buildr OpenSpec workflow MUST 在 propose/update 阶段 assess，在 apply 阶段执行真实维护任务并 reconcile，在 sync 和 Task Finish 阶段检查 evidence；所有可能修改 delivery content 的 reconcile MUST 在对应最终验证之前完成。OpenSpec archive 后 MUST NOT 再维护 glossary 或 current knowledge。

#### Scenario: Propose 创建人类入口与影响任务
- **WHEN** `openspec-propose` 完成 proposal、design、specs 和 tasks
- **THEN** Agent MUST 使用 selected current-knowledge provider 创建或更新 Brief 并运行 assess
- **AND** assess 识别的真实维护目标 MUST 进入 tasks 和 knowledge-impact evidence
- **AND** 无真实影响的目标 MUST NOT 产生空文档任务

#### Scenario: Update 修订 planning artifacts
- **WHEN** `openspec-update-change` 修改 scope、流程、影响、验收或 delta requirements
- **THEN** Agent MUST 更新 Brief 并重新运行 assess
- **AND** tasks 和 knowledge-impact evidence MUST 与修订后的 planning artifacts 保持一致

#### Scenario: Apply 发现并处理当前认知影响
- **WHEN** `openspec-apply-change` 实现 Change tasks
- **THEN** Agent MUST 执行已识别的 Brief、knowledge 和 terminology tasks，并把实现中新发现的真实影响加入 tasks/evidence
- **AND** implementation content 完成后 MUST 运行 reconcile，再进入最终 verification

#### Scenario: Sync 前核对 reconcile evidence
- **WHEN** `openspec-sync-specs` 准备把 delta specs 同步到 canonical specs
- **THEN** Agent MUST 核对 reconcile result 对应当前 Change、canonical candidate 和 delivery tree identity
- **AND** evidence 缺失、陈旧或 unresolved 时 MUST 停止 sync 并报告 next actions

#### Scenario: Archive 不补写当前认知
- **WHEN** Change 已完成 sync、verification、current-knowledge inspect 并准备 archive
- **THEN** archive MUST 只移动 Change 及其 companion/sidecar artifacts
- **AND** archive 完成后 MUST NOT 触发 glossary、overview、architecture、flows 或 services 写入

### Requirement: 实现型 workflow 必须绑定 task execution context
Buildr 的 task triage、Task Environment 与 OpenSpec Skills MUST 在写入前核对 matching Environment Receipt、实际 execution binding 和稳定 controller identity。普通 workflow MUST NOT 以 session root 等于 environment root 或 Agent session adoption receipt 作为执行前置条件。

#### Scenario: Triage 准备 Environment 后在原对话继续
- **WHEN** task triage 取得 matching `ready` Environment Receipt，且当前 Agent 能使用结果中的明确 target/workdir 与执行 CLI
- **THEN** Task Environment MUST 返回 task、Workspace、工作范围、允许执行根、controller/CLI 与 runtime projection identity
- **AND** 当前用户对话 MUST 能在 binding 通过后继续写入，不要求迁移 Agent session

#### Scenario: 明确工作目录绑定 Environment
- **WHEN** 命令 target、workdir、scope membership、执行 CLI、Runtime/依赖和 projection identity 匹配 Environment Receipt 的最新真实 probe
- **THEN** workflow MUST 将其视为有效 execution binding
- **AND** MUST NOT 因 Agent session 从 canonical Workspace 启动而阻塞 proposal、实现、构建、测试或验证

#### Scenario: Execution binding 漂移
- **WHEN** target、workdir、scope/provider identity、Runtime/CLI、依赖或 runtime projection 不再匹配 receipt
- **THEN** workflow MUST fail closed 并报告精确差异
- **AND** MUST NOT 通过直接调用 worktree provider、创建第二份 checkout 或沿用旧 `ready` 规避 mismatch

### Requirement: Workflow 按任务影响验证 adapter activation
只有任务修改 runtime adapter 的 discovery、loading、activation mode、投射路径或相关 metadata，且专项验收要求证明新机制已激活时，workflow MUST 消费 adapter activation metadata。普通 Rule/Skill 内容、contract 或 description 修改 MUST NOT 触发新 session 门禁；该专项 evidence MUST NOT 阻塞普通 workflow。

#### Scenario: 普通 Skill 内容完成交付
- **WHEN** 任务修改 Skill 正文、contract 或 description，但没有改变 Agent runtime 的发现或激活机制
- **THEN** workflow MUST 使用 source、package、render/sync、projection 与 doctor evidence 验证交付
- **AND** MUST NOT 要求当前开发 session 重新加载新版 Skill

#### Scenario: Codex Skills 在 session start 激活
- **WHEN** 任务改变 Codex Skills 的 discovery、session-start loading 或投射机制，且验收需要证明新机制已激活
- **THEN** workflow MUST 说明 Rules 与 Skills 各自 activation mode
- **AND** Codex App 不能绑定既有 Buildr worktree 时 MUST 报告 evidence 缺口，不得伪造自动 handoff

#### Scenario: Runtime 支持显式 reload
- **WHEN** adapter activation 机制专项验收中声明 `explicit-reload`、提供 reload guidance 且 Agent/runtime host 返回匹配的 reload evidence
- **THEN** workflow MUST 接受 reload activation evidence
- **AND** 该 evidence MUST 与 execution readiness 分开记录

### Requirement: 验证执行必须回收 task-owned descendant processes
Buildr Product verification runner MUST 为自身启动的 step 建立可识别 ownership，并在 step 完成或 runner 异常结束时清理仍存活的 owned descendants，包括运行期间已由 owned lineage 观察到、随后 detached 或 reparented 的 descendants。清理 MUST 限于该 runner 创建的进程组或运行期间由精确 parent-child lineage 建立的 ownership，不得按端口、进程名或宽泛 workspace 匹配终止其他任务进程。

#### Scenario: verification step 留下 server descendant
- **WHEN** Candidate 或 affected step 的主命令结束但其 owned server descendant 仍存活
- **THEN** runner MUST 终止该 owned descendant 并记录 cleanup status
- **AND** 最终 verification evidence MUST 报告是否存在 cleanup failure

#### Scenario: 其他任务存在同名进程
- **WHEN** 另一个 task environment 中存在同名 server 或使用相同默认端口的进程
- **THEN** 当前 runner MUST 保留该进程
- **AND** cleanup evidence MUST 只引用当前 runner 的 ownership identity

#### Scenario: descendant 在主命令结束前 detached
- **WHEN** runner 在 step 运行期间已观察到 descendant 属于 owned lineage，随后该进程脱离原 process group 或被重新托管
- **THEN** runner MUST 在 step 结束时仍核对并终止该存活 descendant
- **AND** cleanup evidence MUST 区分 process group 与 tracked descendant 的处理结果

#### Scenario: 未被 owned lineage 观察的同名进程
- **WHEN** 另一个任务存在同名进程，但它从未出现在当前 step 的 owned parent-child lineage 中
- **THEN** runner MUST 保留该进程
- **AND** MUST NOT 用名称、端口或 workspace 文本匹配补充 ownership

### Requirement: Agent只处理OpenSpec收敛语义结果
Buildr MUST 让 Agent 只处理 `blocked` 的语义冲突或 `recovery-unprovable` 的人工事实检查；确定性路径 MUST 完全由产品执行。Agent MUST NOT 被要求手工恢复 canonical spec、刷新 baseline、选择内部恢复 stage、拼装多条 guard 命令或解释多个 sidecar 不一致。

#### Scenario: 确定性事务通过
- **WHEN** `buildr openspec converge` 返回 `passed`
- **THEN** Agent MUST 将 canonical收敛与Change归档视为产品已安全完成
- **AND** 不得额外运行旧pre-sync/post-sync或手工sync命令

#### Scenario: 语义冲突阻塞
- **WHEN** converge返回`blocked`并列出冲突Change、Requirement或不完整delta
- **THEN** Agent MUST只修订语义authority或请求用户决定
- **AND** 修订后 MUST重新调用同一converge入口

#### Scenario: 状态不可证明
- **WHEN** converge返回`recovery-unprovable`
- **THEN** Agent MUST停止自动收尾并报告真实文件与receipt证据缺口
- **AND** MUST NOT通过删除sidecar、采用当前baseline或覆盖canonical绕过失败

### Requirement: Agent 只能处理收敛事务外的语义决定
Agent MUST 将 Buildr 的确定性收敛结果视为产品事实：`passed` 继续收尾，`blocked` 只处理最小语义冲突，`recovery-unprovable` 停止并进行人工检查。Agent MUST NOT 手工恢复正式规范、刷新基线、选择内部恢复阶段、拼装旧门禁命令，或用自报成功证据覆盖产品失败。

#### Scenario: 产品报告状态无法证明
- **WHEN** `buildr openspec converge` 或只读审计返回 `recovery-unprovable`
- **THEN** Agent MUST 停止正式文件写入并向用户报告逐文件事实
- **AND** MUST NOT 删除回执、刷新 baseline 或尝试从旧阶段继续

#### Scenario: 产品报告确定性通过
- **WHEN** `buildr openspec converge` 返回 `passed`
- **THEN** Agent MUST 直接消费该结果继续 Task Finish
- **AND** MUST NOT 重演 planner、validator、applier、observer 或 archive 内部步骤

### Requirement: Task Finish Skill 必须收窄为授权与单命令入口
Buildr MUST 提供实现 `buildr.task-finish/v1` 的 Task Finish Skill。Skill MUST 解析用户的收尾意图、候选种类和 execution context，披露常规 commit/convergence/verification/integration/push/retained/cleanup 授权与明确排除项。Receipt-bound task environment 中的 Change 或 code-only 候选 MUST 只调用一次 canonical `buildr task finish run`；retained canonical Workspace 中明确的 metadata-only 候选 MAY 正式交接给 selected `buildr.git-single-operation/v1` provider。正常路径 MUST NOT 领取或完成产品 checkpoint、构造 recovery JSON、从普通 PATH 选择 runtime，或把 retained dirty tree 伪装成 task environment。

#### Scenario: 用户要求收尾
- **WHEN** 用户在 canonical task environment 中明确要求收尾，且候选有 Change 或已确认是无 Change code-only task
- **THEN** Agent MUST 披露目标 task、candidate kind、可选 Change、目标分支、远端、常规副作用和未授权动作
- **AND** 在没有待人工语义决定时 MUST 只启动一次 canonical Task Finish executor 并消费其最终结果

#### Scenario: Retained metadata-only 候选正式 handoff
- **WHEN** 用户在 retained canonical Workspace 对已完成且已验证的 metadata-only 任务要求收尾，`worktree context` 返回 `worktree.not_task_environment`，且任务文件、目标分支和无关改动可以精确区分
- **THEN** Task Finish Skill MUST 将产品执行器标记为不适用，并披露精确任务文件、排除的无关改动、commit message、目标分支与 push 影响
- **AND** MUST 只把明确的 commit 与 push 单项动作交给 selected `buildr.git-single-operation/v1` provider，返回逐项 Git evidence 与 `completionMode: git-single-operation-handoff`

#### Scenario: Retained handoff 无法证明文件隔离
- **WHEN** metadata-only 候选的任务文件范围、验证 identity、目标 ref 或 selected Git provider readiness 无法证明
- **THEN** Task Finish Skill MUST 正式 blocked 并报告缺失输入或 provider reason
- **AND** MUST NOT 使用 `git add -A`、stash、回滚、虚假 Change 或手写 Git 回退绕过隔离边界

#### Scenario: 产品返回完整结果
- **WHEN** current result 为 complete
- **THEN** Skill MUST 直接报告交付、验证、retained、cleanup 与效率证据
- **AND** MUST NOT 为确认已完成动作再次调用 inspect、provider completion 或同等验证命令

### Requirement: Task Finish workflow 必须把产品缺陷退回研发
Task Finish workflow MUST 把 finish-ready candidate 作为前置条件。任何产品缺陷、规范语义错误、审查遗漏、测试失败或候选内容修复 MUST 退出收尾并回到研发、审查和测试验证流程；Skill MUST NOT 将 repair authorization、修复尝试、重新验证或新的实现编辑描述为 Task Finish 的恢复步骤。

#### Scenario: 最终保证发现产品缺陷
- **WHEN** Task Finish result 返回 `failureClass: upstream-candidate-defect`
- **THEN** Agent MUST 明确说明研发、审查或前序测试验证没有产生 finish-ready candidate
- **AND** MUST 结束当前 Finish run，只在新的实现任务/revision 中修复并重新建立验证 evidence

#### Scenario: 用户要求在收尾中顺手修复
- **WHEN** 产品缺陷已被 Task Finish 发现，而用户没有明确要求继续研发修正
- **THEN** Agent MUST NOT 在当前 Finish run 中编辑实现或重跑正式验证
- **AND** MUST 请求或使用已有授权进入独立研发 workflow

### Requirement: 任务资产审查不得扩展 Finish 执行器
Task asset review MUST 保持独立 Skill lifecycle。存在 observation 且 finalize 需要人工 accept/reject 时，Agent MUST 在启动 Task Finish executor 前完成该决定；没有 observation 或 provider 确定性 discard 时 MUST 不增加 Finish 内部 action。Task Finish 产品 run MUST NOT 读取隐藏推理、判断长期资产候选或因 late observation revision 扩展 cleanup 前步骤。

#### Scenario: 没有任务资产 observation
- **WHEN** 用户要求收尾且当前任务没有 observation
- **THEN** Agent MUST 直接进入 canonical Task Finish executor
- **AND** 产品 run MUST NOT 创建空 observation 或 asset-review checkpoint

#### Scenario: Observation 等待人工决定
- **WHEN** task-asset-review finalize 返回 `awaiting-human`
- **THEN** Agent MUST 在任何 prepare mutation 前等待 accept/reject
- **AND** 决定完成后才启动新的单命令 Task Finish run

### Requirement: Task Finish handoff 必须保持 Git 单项能力边界
Task Finish 的 retained metadata-only handoff MUST 只在该分支把 optional `buildr.git-single-operation/v1` dependency 提升为 required，并 MUST 让 selected provider 保持精确仓库、path/ref、授权与 `treeChanged` 结果契约。完整“收尾”意图仍由 Task Finish 解释；Git provider MUST NOT 接管 OpenSpec、验证政策、retained sync 或 task cleanup。

#### Scenario: Git provider 对 handoff 可用
- **WHEN** retained metadata-only handoff 命中且 selected Git provider ready
- **THEN** Task Finish MUST 为 commit 与 push 分别提供仓库、任务 paths、目标 ref 和当前授权
- **AND** provider MUST 保留所有无关 dirty changes 并返回 commit/ref/remote 与 `treeChanged` evidence

#### Scenario: 普通产品 run 不依赖 Git handoff provider
- **WHEN** Task Finish 在 receipt-bound task environment 中启动 canonical product run
- **THEN** optional Git handoff provider 不 ready MUST NOT 阻塞产品 run
- **AND** 产品执行器 MUST 继续自行持有固定五阶段内的 Git effects

### Requirement: task-manager Skill 必须作为 Task Record 的薄管理入口
Buildr MUST 交付名为 `task-manager` 的 workspace Skill，并 MUST 用精确 routing description 将它限制在 Agent 对正式 Task Record 的创建、按 Task ID 恢复、查看、更新和结束；Skill MUST 通过 selected `buildr.task-record/v1` provider 执行，不得成为全局任务 dispatcher。Local App MUST 作为同一 Task Record Application 的独立人类客户端，不通过 Skill routing 写记录。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建正式 Task、查看或修改 Task 顶层事实、按 Task ID 恢复或结束 Task
- **THEN** Agent MUST 使用 `task-manager` 并报告实际 operation、Task ID、status、canonical path 和 effects
- **AND** 后续 Environment、Development、Review、Verification、Git、Finish、Board 与 Retrospective MUST 继续由各自专业能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或 Agent 提供已有 Task ID 并要求恢复或继续
- **THEN** `task-manager` MUST 先 inspect canonical Task Record
- **AND** MUST 只从 title、intent、scope、changes、status 和 result 恢复顶层事实，不得从 Task Record 推断运行环境或专业阶段状态

#### Scenario: 人先在 Local App 创建 Task
- **WHEN** 用户在 Local App 创建 active Task，随后要求 Agent 按该 Task ID 继续
- **THEN** `task-manager` MUST inspect 同一 canonical Task Record 并核对 intent/scope
- **AND** MUST NOT 重新 create、把 Local App 记录视为低权威副本或要求用户重复输入顶层事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出修复、实现、重构、文档、测试、纯讨论或只读探索
- **THEN** `task-manager` MUST NOT 仅因出现“任务”而抢占入口
- **AND** Agent MUST 先按现有语义入口判断是否已经形成正式持久交付 Task

### Requirement: 正式执行必须先建立 Task Record
Buildr 的 `task-triage` MUST optional 依赖 `buildr.task-record/v1`，并 MUST 在已确认进入正式持久交付的分支、首次交付写入前调用 selected provider 创建或恢复 Task Record。路径已明确而无需重新 Triage 的正式执行也 MUST 遵守同一前置条件。

#### Scenario: Triage 选择已有契约实现
- **WHEN** task-triage 选择 implementation，且任务即将创建环境、分支或修改交付物
- **THEN** Agent MUST 先创建或恢复 Task Record，再进入当前 Environment provider
- **AND** Task Record provider 不 ready 或操作 blocked MUST 阻止首次交付写入，但不抹去已确认的 triage 结论

#### Scenario: Triage 选择 Change Flow
- **WHEN** task-triage 选择 change-flow 且即将创建首份 OpenSpec artifact
- **THEN** Agent MUST 先创建或恢复 Task Record
- **AND** Change 创建成功后 MUST 通过 Task Manager 将真实 `project/change` 引用加入 active Task Record

#### Scenario: 不形成正式 Task
- **WHEN** triage 选择 explore、纯只读诊断、Task 外单次操作或 metadata 写入只是已有 Task lifecycle 的一部分
- **THEN** task-triage MUST NOT 调用 Task Record create
- **AND** 其他适用的只读或专业动作 MUST 不因 Task Record capability 不 ready 而阻塞

#### Scenario: 已有 Task Record
- **WHEN** 正式执行上下文已提供 Task ID
- **THEN** Agent MUST inspect 并核对 active Task 的 intent/scope
- **AND** MUST NOT 重新 create、从 worktree 名称补造第二个 Task ID 或覆盖终态 Task

### Requirement: 人、Agent 与产品必须分担语义和确定性逻辑
通过 Agent 工作时，Agent MUST 负责理解用户意图、判断是否形成正式 Task、形成 title/intent 与选择专业能力；人也 MAY 在 Local App 中直接表达 Task 顶层事实。Task Record Application MUST 对所有客户端负责 schema、默认值、引用解析、字段变更、状态转换、系统时间、陈旧页面拒绝和文件 effects。Skill MUST NOT 要求 Agent 手写 YAML、持久 revision 协议或任意 next state。

#### Scenario: 创建与更新参数
- **WHEN** Agent 已确认要创建或修改 Task 顶层事实
- **THEN** Agent MUST 只提供命令要求的明确业务参数
- **AND** 产品 MUST 生成其余系统字段并拒绝非法组合

#### Scenario: 人通过 Local App 管理 Task
- **WHEN** 人在 Local App 创建、编辑、完成或放弃 Task
- **THEN** 页面 MUST 收集明确业务字段与终态确认，并调用同一 Application action
- **AND** MUST NOT 依赖 Agent 临场生成 YAML、校验引用、计算状态迁移或执行 filesystem 写入

#### Scenario: 专业模块返回事实
- **WHEN** Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective provider 返回结果
- **THEN** `task-manager` MUST NOT 将专业 result、path、revision 或运行状态复制到 Task Record
- **AND** 只有 title、intent、scope、Change reference 或最终 summary 真正变化时才调用相应 Task Record action

### Requirement: P0.1 必须切换 Task Record authority，但不抢占专业 authority
P0.1 实现完成、集成并投射到 retained runtime 后，新正式 Task MUST 使用 Task Record Application 与 canonical Task Record 作为顶层 Task authority；`task-manager` 与 Local App 只是两个客户端，该能力 MUST NOT 标记为 preview。当前 Environment、Verification、Finish、Board、Asset Review 与 Git 模块 MUST 继续拥有各自专业事实，直到对应模块 Change 当场完成替换。

#### Scenario: P0.1 已在 retained runtime 生效
- **WHEN** Agent 开始新的正式持久交付 Task
- **THEN** task-triage/正式执行入口 MUST 先建立 Task Record
- **AND** MUST NOT 同时创建第二份旧顶层 Task record

#### Scenario: 调用尚未替换的专业模块
- **WHEN** active Task 在 P0.2/P0.4/P0.6/P0.8/P1/P2 前调用当前 Environment、Verification、Git、Finish、Board 或 Asset Review
- **THEN** 当前 provider MUST 继续维护其专业 receipt/result/store
- **AND** Task Manager MUST 不复制、不索引、不解释这些专业数据

#### Scenario: 后续模块达到旧 authority
- **WHEN** 后续 Change 实现与现有模块事实重叠的新 authority
- **THEN** 该 Change MUST 同时迁移或保留必要历史读取、切换 consumer/routing 并删除或关闭旧 mutation path
- **AND** MUST NOT 把已知清退工作统一延迟到完整主闭环之后

### Requirement: task-environment Skill 必须作为环境生命周期入口
Buildr MUST 交付名为 `task-environment` 的 workspace Skill，并 MUST 用精确 routing description 将它限制在正式 Task 的环境准备、检查、串行恢复和 cleanup。Skill MUST 通过公共 `buildr task environment prepare|inspect|cleanup` CLI 消费 selected `buildr.task-environment/v1`；它 MUST NOT 成为 Task dispatcher、Git 集成入口、验证执行器，也 MUST NOT 指导 Agent 手写 Receipt 或调用内部资源动作。

#### Scenario: 正式 Task 请求准备或恢复环境
- **WHEN** 用户或上游 Skill 要求为已有 Task 准备、检查、恢复或清理执行环境
- **THEN** Agent MUST 使用 `task-environment` 调用对应公共 CLI，并报告 Task ID、`ready / blocked`、实际执行位置、关键 resources/effects 与 next action
- **AND** MUST NOT 直接手写 Environment Receipt 或把 `task-worktree` 结果当作最终环境结论

#### Scenario: 用户明确管理 Git worktree
- **WHEN** 用户只要求创建、检查、保留或删除特定 Git worktree/本地任务分支
- **THEN** `task-worktree` MAY 作为窄 Git provider Skill 处理该意图
- **AND** MUST NOT 抢占 Task Environment 的 Runtime、依赖、projection、资源、恢复或总 cleanup authority

#### Scenario: Task 外临时操作
- **WHEN** 请求只是纯讨论、只读探索、单次测试、临时服务或 Agent host task/thread 管理
- **THEN** `task-environment` MUST NOT 仅因存在本机执行效果而自动创建正式 Task/receipt
- **AND** 适用入口 MUST 保持原有语义

### Requirement: 正式持久交付必须经过 Task Environment ready 门槛
Buildr task triage、OpenSpec propose contribution 与已知正式执行入口 MUST 在首次修改交付物、构建、测试或创建 Task-owned 持久资源前取得 matching `ready` Environment Receipt。任务位置判断 MUST 与 change-flow/code-only 语义判断正交；采用环境后，proposal、design、specs、tasks、实现和候选验证 MUST 只写入 receipt 允许的执行根。

#### Scenario: Triage 选择 Change Flow
- **WHEN** Task Record 已建立，task-triage 选择 change-flow 且即将创建首份预计进入实现的 OpenSpec artifact
- **THEN** Agent MUST 先通过 Task Environment 准备或恢复实际执行位置
- **AND** 只有 `ready` 后才 MUST 在该允许根创建 Change artifacts

#### Scenario: 直接命中 OpenSpec propose
- **WHEN** 用户意图直接命中 installed `openspec-propose`，且任务预计修改代码、构建、测试或保留长期实现上下文
- **THEN** Buildr-owned contribution MUST 在 `openspec new change` 前核对正式 Task 与 `ready` Environment Receipt
- **AND** MUST 通过 `task-environment` 而不是直接调用 Git worktree provider

#### Scenario: Code-only 实现
- **WHEN** 正式 Task 不需要 OpenSpec Change 但即将进入代码修改、构建或测试
- **THEN** Agent MUST 取得同样的 `ready` Environment Receipt
- **AND** MUST NOT 因没有 Change 而跳过实际执行根、依赖与资源边界

#### Scenario: 只有 lifecycle metadata 写入
- **WHEN** 已有 Task 的 Environment/Development/Verification/Finish/Retrospective Skill 只在 canonical Workspace 维护自己的 receipt/result，且不触发新的执行环境效果
- **THEN** workflow MUST NOT 为该 metadata 写入重新准备或恢复已清理环境
- **AND** MUST 保持各专业 writer 的 canonical metadata authority

#### Scenario: Candidate 交给 Task Verification
- **WHEN** Environment 中的内容修改结束并形成待验证候选
- **THEN** Task Environment MUST 提供 Task、工作范围、执行根、provider evidence refs 与 runtime source/projection identity
- **AND** Task Verification MUST 独占 Candidate identity、验证政策、实际执行和 evidence，包括适用的 Agent session proof

### Requirement: 任务 Skills 必须消费新的 Environment capability topology
Buildr package/runtime capability graph MUST 让 `task-environment` 提供 `buildr.task-environment/v1`，让 `task-worktree` 只提供 `buildr.git-worktree-provider/v1`，并 MUST 将所有正式 Environment consumers 从 `buildr.task-worktree-lifecycle@2` 切到新契约。Git provider dependency MAY 对无需 Git 的 Task Environment 降级，但在请求 Git isolation 时 MUST 成为该次 prepare 的硬前置条件。

#### Scenario: task-triage 进入正式执行
- **WHEN** `task-triage` 已确认 formal execution 分支
- **THEN** 它 MUST optional 消费 `buildr.task-environment/v1` 并在该分支要求 selected provider ready
- **AND** 纯讨论、只读或 Task 外分支 MUST 不因 Environment provider 缺失而阻塞

#### Scenario: Task Environment 选择 Git isolation
- **WHEN** receipt plan 需要一个或多个 Git worktrees
- **THEN** `task-environment` MUST 解析 selected `buildr.git-worktree-provider/v1` 并只消费其 Git evidence
- **AND** provider missing/ambiguous/blocked MUST 使该次 environment prepare 返回 `blocked`

#### Scenario: Task Finish 清理环境
- **WHEN** Task Finish 已完成适用交付并进入 cleanup
- **THEN** Task Finish MUST 调用 selected `buildr.task-environment/v1` 交接 delivery/cleanup eligibility
- **AND** MUST NOT 直接依赖 `buildr.task-worktree-lifecycle@2`、扫描环境资源或调用 provider cleanup

#### Scenario: provider 替换
- **WHEN** compatible internal providers 替换默认 `task-environment` 或 `task-worktree`
- **THEN** consumers MUST 按 capability identity 与 binding 继续工作
- **AND** MUST NOT 根据默认 Skill id、目录名或旧 receipt schema 硬编码调用

### Requirement: task-review Skill 必须作为 Task Review 语义入口
Buildr MUST 交付一个名为 `task-review` 的 workspace Skill，并 MUST 通过 selected `buildr.task-review/v1` provider 支持 `planning|completion` 两种参数化 Review。Skill MUST 负责理解 Task Intent、动态选择实际审阅对象、形成 findings 与真实结论；产品 Application MUST 只负责确定性 Result persistence/read model。

#### Scenario: 用户要求审查正式 Task 的方案
- **WHEN** 用户、Project policy 或未来 Development 请求 Planning Review，并提供正式 Task 与明确 plan target identity
- **THEN** Agent MUST 路由到一个 `task-review` Skill，以 `reviewType: planning` 执行并在完整结束后记录 Planning Result

#### Scenario: 用户要求审查完成候选
- **WHEN** 用户、Project policy 或未来 Development 请求 Completion Review，并提供 current Candidate identity
- **THEN** Agent MUST 路由到同一个 `task-review` Skill，以 `reviewType: completion` 执行并在完整结束后记录 Completion Result

#### Scenario: Task 外普通审查
- **WHEN** 用户只要求一次性阅读或评论且没有正式 Task/target identity
- **THEN** Agent MAY 返回会话内审查意见
- **AND** MUST NOT 创建 Task Review Result、空 Task 或伪 target identity

### Requirement: Task Review 必须如实记录执行方式和覆盖边界
`task-review` MUST 如实选择 `self|independent-agent|human`，动态记录实际 reviewed、相关但 uncovered 的对象与原因、findings 和结论。Skill MUST NOT 把自审描述为独立审查，也 MUST NOT 把固定 OpenSpec artifacts、代码目录、测试命令或 review checklist 强制为所有 Task 的统一范围。

#### Scenario: 当前 Agent 自审
- **WHEN** 当前 Agent 自己执行 Review
- **THEN** Result method MUST 为 `self`，即使 Agent 使用工具或 Project evidence 也 MUST NOT 标为 independent-agent

#### Scenario: 只覆盖部分相关对象
- **WHEN** 某个相关对象因不可用、越权或明确范围限制没有被审阅
- **THEN** Skill MUST 把对象与真实原因写入 uncovered
- **AND** MUST NOT 以空列表或概括性 passed 隐藏覆盖缺口

### Requirement: P0.3 不得把两种 Review 变成默认 Task 门禁
Planning 与 Completion MUST 是两个可选 current Result 槽位。Task 创建、Task Environment ready、Task Record 更新或普通 Task inspect MUST NOT 因任一 Result 缺失而失败；是否要求某种 Review、method 或结论 MUST 留给未来 Task Development/Project policy consumer。

#### Scenario: 正式 Task 只有一种 Result
- **WHEN** Task 只有 Planning Result、只有 Completion Result或两者都没有
- **THEN** P0.3 Task Review/Task Record/Environment read path MUST 正常工作
- **AND** MUST 不写 skipped/not-applicable placeholder

#### Scenario: Review method 不满足未来政策
- **WHEN** Result target 仍 current，但未来 consumer 要求 human 或 independent-agent 而现有 method 为 self
- **THEN** consumer MUST 单独判定 gate 不满足
- **AND** Task Review MUST NOT 把 policy mismatch 持久化为 target stale

### Requirement: Task Review 与 Task Asset Review 必须保持独立 authority
`task-review` MUST 只拥有当前方案/完成目标的 Review Result；`task-asset-review` MUST 继续拥有长期资产 observation、资格审查、人工 accept/reject 和独立任务 handoff。两个 Skill MUST NOT 互写 store、互相别名或因名称相似共享 capability identity。

#### Scenario: Task 同时产生 Review Result 与资产 observation
- **WHEN** 同一正式 Task 在研发中完成 Planning/Completion Review，且另有长期资产 observation
- **THEN** 两类记录 MUST 由各自 provider 独立维护
- **AND** Task Finish 的 asset observation finalize MUST NOT 读取、替换或批准 Task Review Result
