# Agent Task Workflows

## Purpose

定义 Buildr 内置场景化 Skills、Agent 任务协作、OpenSpec/Git/worktree/finish 工作流和分层验证契约。
## Requirements

### Requirement: 内置场景化 Skills 引导产品工作流
Buildr MUST为依赖用户任务意图或工作流阶段的Buildr维护流程提供内置workspace Skills，并 MUST让Development与Finish保持相邻但独立的语义入口；Buildr MUST 将已有 formal Task 的正式收尾与无 active Task 的直接 Git 收尾保持为两个独立入口。

#### Scenario: Agent 需要任务分流指引
- **WHEN** 用户要求修bug、实现或调整功能、改需求、重构、优化、补文档、补测试、调整API、契约、权限、状态流、数据语义，或询问某项改动是否需要spec/change管理
- **THEN** Buildr MUST通过内置Skill提供任务意图分流能力
- **AND** 该Skill MUST帮助Agent先理解意图和影响范围，再选择后续处理方式

#### Scenario: Agent 需要 OpenSpec 工作流指引
- **WHEN** Agent需要探索、提案、实现、同步或归档OpenSpec Change
- **THEN** Buildr MUST依赖可用的`openspec-*` Skills匹配该意图
- **AND** Buildr MUST NOT要求Agent读取optional OpenSpec Rule来执行该工作流

#### Scenario: Agent 需要代码开发工作流指引
- **WHEN** 用户要求代码开发、构建、测试、多仓协作、隔离任务分支或长期任务上下文
- **THEN** Buildr MUST通过Task Environment及适用实现Skill提供执行边界
- **AND** 内容稳定后 MUST路由`task-development`完成Verification、Candidate、Completion Review与handoff

#### Scenario: Agent 需要 Git 操作指引
- **WHEN** 用户已经选择独立 commit、push、commit+push 或其他明确 Git Operation，或上游 consumer 已提供该动作
- **THEN** Buildr MUST通过唯一 `git-operations` Skill消费 `buildr.git-operations/v1`
- **AND** Git Operations MUST NOT自行扩展动作目录、选择交付顺序、接管Development Candidate或完整Task Finish

#### Scenario: Agent 在无 active Task 时需要直接收尾
- **WHEN** Workspace 没有 active Task，用户表达“收尾”或等价的当前 Git 交付意图，且当前 Git facts 能唯一解析 repository、目标 ref、owned scope 和 push destination
- **THEN** Buildr MUST 将该意图路由到 `git-operations`，由产品入口选择直接 Git 交付顺序
- **AND** 该路径 MUST NOT 创建临时 Task、Environment、Verification、Candidate 或 Finish Result

#### Scenario: Agent 需要完整任务收尾
- **WHEN** 用户对已有current Development handoff表达“收尾”或交付意图
- **THEN** Buildr MUST通过独立Task Finish Skill消费handoff并编排carrier、integration、retained与cleanup
- **AND** Finish MUST NOT编排OpenSpec、formal Verification、Review、Candidate generation或Development risk decision

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

### Requirement: task-triage 明确 OpenSpec 中文文档约束
Buildr 的 task-triage Skill MUST 在选择或继续 OpenSpec 工作流时，要求 Agent 使用中文编写 Buildr 自有 OpenSpec 文档和用户可见说明，并说明允许保留英文的格式与技术内容。

#### Scenario: task triage 选择 OpenSpec
- **WHEN** task triage 选择或继续 OpenSpec change-flow
- **THEN** 其面向用户的 guidance MUST 要求 Buildr 自有文档正文使用中文
- **AND** 它 MUST 允许 English commands、paths、code identifiers、protocol fields、YAML/frontmatter 和 OpenSpec format keywords

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
- **AND** Agent MUST NOT 因 selected provider 的具体 Skill id 不同而跳过检查

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
Buildr 的 `task-triage` Skill MUST 先核对任务相关事实，再分别判断语义治理和执行形态；输出 MUST 包含选择、repository set、task environment、最小依据、未决冲突和 next provider/action，并 MUST 只在适用时追加 OpenSpec 或正式 Task 状态。任务进度 MUST 由对话、Task Record、Parent/Child 与各专业公开 read model 表达，不得创建第二份 Board authority。

#### Scenario: 已有契约的实现任务
- **WHEN** canonical spec 已定义目标行为且任务需要代码修改、构建、测试或长期实现上下文
- **THEN** triage MUST 选择 `code-only + implementation`
- **AND** MUST 解析完整 repository set 并通过 selected task-environment provider 创建或复用 task environment

#### Scenario: 独立收敛当前事实文档
- **WHEN** canonical specs、当前实现与 registries 已能确认现行事实，任务只让 current knowledge 追上该事实且不进入代码、构建或测试
- **THEN** triage MUST 选择 `spec-maintenance + metadata-only`
- **AND** MUST 使用 selected current-knowledge provider 的 `maintain` operation，不得为既有事实补造 OpenSpec Change

#### Scenario: Authority 或执行范围不明确
- **WHEN** 可信事实源冲突、授权边界不明、repository set 无法确认或是否进入实现无法判断
- **THEN** triage MUST 返回 `blocked` 或 `unknown` 并提出改变长期语义所需的最少问题
- **AND** MUST NOT 预先写入 change artifacts、current knowledge 或 task environment 内容

### Requirement: task-triage 必须通过条件能力依赖交接专业动作
`task-triage` MUST optional 依赖 `buildr.current-knowledge-maintenance/v2` 和 `buildr.task-worktree-lifecycle/v2`，并 MUST 只在相应决策分支执行前读取 contract 与 selected provider；任何 provider 不 ready MUST 只阻塞或降级对应分支，不得使无关 triage 结论不可用。

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

### Requirement: 内置任务 Skills 只按 current capability contract 协作
Buildr内置任务Skills MUST依赖capability contracts而不是硬编码optional Skill identity。`task-development` MUST required消费Task Record、Task Environment、Task Review、Task Verification与current knowledge capabilities；`task-triage` MAY optional消费`buildr.task-development/v2`以在首个正式研发动作建立聚合事实；`task-finish` MUST required消费`buildr.task-development@2`与Task Environment。Task Development与Task Finish MUST NOT消费Task Retrospective或已退役task-asset-review authority。

#### Scenario: Task Development使用required providers
- **WHEN** Buildr声明`task-development` builtin
- **THEN** manifest MUST声明`buildr.task-record/v1`、`buildr.task-environment/v1`、`buildr.task-review/v1`、`buildr.task-verification/v3`与`buildr.current-knowledge-maintenance/v2` required dependencies
- **AND** 任一required provider missing/ambiguous/blocked MUST使Development readiness fail closed

#### Scenario: 首个正式研发动作建立聚合事实
- **WHEN** task-triage已经建立active Task与matching ready Environment，并即将进入proposal、design或直接实现
- **THEN** routing MUST调用selected `buildr.task-development/v2` provider的begin action
- **AND** provider缺失或blocked MUST在内容写入前fail closed，不得形成第二个Development writer

#### Scenario: Task Finish消费Development
- **WHEN** Buildr声明`task-finish` builtin
- **THEN** manifest MUST required依赖`buildr.task-development@2`与`buildr.task-environment/v1`
- **AND** MUST不依赖Task Review、Task Verification、current knowledge、Task Retrospective或task-asset-review

#### Scenario: provider替换
- **WHEN** compatible provider替换任一默认Skill
- **THEN** consumer MUST按capability identity与selected binding继续工作
- **AND** MUST NOT按Skill ID、目录或store path硬编码调用

#### Scenario: 没有复盘不影响研发交接
- **WHEN** terminal Task 尚无Task Retrospective Result
- **THEN** Development与Finish applicability MUST保持不变
- **AND** MUST NOT创建空复盘或等待复盘完成

### Requirement: OpenSpec workflow 必须通过能力契约组合当前认知维护
Buildr MUST通过capability dependencies和OpenSpec Component-owned Skill Contributions将当前认知维护组合进外部OpenSpec workflow，并 MUST保持external `openspec-*` Skill源可独立升级。OpenSpec planning/apply/sync与Task Development MUST消费current knowledge capability；Task Finish MUST不再解释或收敛knowledge impact。

#### Scenario: Explore 使用可选术语治理
- **WHEN** installed `openspec-explore` consumer可解析`buildr.terminology-governance/v1`
- **THEN** Agent MUST在发现重要术语、别名或作用域冲突时读取selected provider并记录对齐结果
- **AND** provider缺失时consumer MUST保持degraded可用并显式标注未治理术语

#### Scenario: Planning 和实现 consumers 使用 required 当前认知维护
- **WHEN** Buildr声明`openspec-propose`、`openspec-update-change`、`openspec-apply-change`或`openspec-sync-specs` builtin consumers
- **THEN** 每个consumer MUST required依赖`buildr.current-knowledge-maintenance/v1`
- **AND** required provider未ready时consumer MUST按现有capability readiness fail closed

#### Scenario: Task Development使用required当前认知维护
- **WHEN** Buildr声明`task-development` builtin
- **THEN** manifest MUST将`buildr.current-knowledge-maintenance/v2`声明为required dependency
- **AND** Development MUST在stable Content Target与Candidate前消费selected provider的inspect/reconcile result

#### Scenario: Task Finish不再消费当前认知
- **WHEN** Buildr声明P0.5 `task-finish` builtin
- **THEN** manifest MUST不包含current knowledge dependency
- **AND** Finish MUST只消费Development handoff，不得读取Change knowledge impact

#### Scenario: Task Finish 使用 required 当前认知维护
- **WHEN** 旧runtime manifest仍把current knowledge声明为Task Finish required dependency
- **THEN** P0.5 package切换 MUST移除该Finish dependency，并由Task Development required消费`buildr.current-knowledge-maintenance/v2`
- **AND** runtime MUST NOT保留Finish与Development双重knowledge consumer

#### Scenario: Archive 保持纯归档职责
- **WHEN** Buildr声明`openspec-archive-change` builtin
- **THEN** archive consumer MUST NOT为归档后knowledge或glossary写入声明直接dependency
- **AND** archive MUST只移动已完成前置对齐的Change

#### Scenario: OpenSpec Component 更新或卸载
- **WHEN** Buildr更新或卸载OpenSpec Component并重新render runtime
- **THEN** Buildr-owned contributions MUST按Component lifecycle更新或移除
- **AND** external OpenSpec Skill source bytes MUST保持与受支持上游版本一致，binding readiness MUST由manifest/runtime evidence表达

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
Buildr 的 task triage、Task Environment 与 OpenSpec Skills MUST 在写入前核对 matching Environment Receipt、实际 execution binding、Task checkout/provider evidence 与可信 retained Environment Manager。普通 workflow MUST NOT 要求 retained manager content identity 与 Receipt 创建指纹永久匹配，也 MUST NOT 以 session root 等于 environment root 或 Agent session adoption receipt 作为执行前置条件。

#### Scenario: Triage 准备 Environment 后在原对话继续
- **WHEN** task triage 取得 matching `ready` Environment Receipt，且当前 Agent 能使用结果中的明确 target/workdir 与执行 CLI
- **THEN** Task Environment MUST 返回 task、Workspace、工作范围、允许执行根、Task checkout/provider、CLI 与 runtime projection identity
- **AND** 当前用户对话 MUST 能在 binding 通过后继续写入，不要求迁移 Agent session或匹配 retained manager content hash

#### Scenario: 明确工作目录绑定 Environment
- **WHEN** 命令 target、workdir、scope membership、provider/Task checkout、执行 CLI、Runtime/依赖和 projection identity 匹配 Environment Receipt 的最新真实 probe
- **THEN** workflow MUST 将其视为有效 execution binding
- **AND** MUST NOT 因 Agent session 从 canonical Workspace 启动或 retained Buildr 已升级而阻塞 proposal、实现、构建、测试或验证

#### Scenario: Execution binding 漂移
- **WHEN** target、workdir、scope/provider/Task checkout identity、Runtime/CLI、依赖或 runtime projection 不再匹配 receipt
- **THEN** workflow MUST fail closed 并报告精确差异
- **AND** MUST NOT 通过直接调用 worktree provider、创建第二份 checkout 或沿用旧 `ready` 规避 mismatch

#### Scenario: 只有 retained manager content identity 改变
- **WHEN** Task execution binding 全部匹配，当前 retained Environment Manager 可信且 source clean，但其 content identity 与 Receipt 创建指纹不同
- **THEN** workflow MUST 继续使用同一 Task Environment binding
- **AND** MUST NOT 自动更新 Task checkout、失效 Review/Verification evidence 或建立新的 lifecycle generation

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
Agent MUST 将 Buildr 的确定性收敛结果视为产品事实：`passed`直接继续Development后续阶段，`blocked`只处理最小语义冲突，`recovery-unprovable`只在当前Task执行位置仍保留恢复现场时使用OpenSpec Convergence Inspect或进行人工核对。Agent MUST NOT手工恢复Canonical Specs、刷新baseline、选择内部恢复stage、拼装旧门禁命令、把Inspect变成正常验收门禁，或在Formal Task Finish/Environment cleanup后追索Receipt。

#### Scenario: 产品报告状态无法证明
- **WHEN** `buildr openspec converge`返回`recovery-unprovable`且当前Task Environment尚未清理
- **THEN** Agent MAY调用`buildr openspec convergence inspect`读取逐文件事实，并停止其他正式文件写入
- **AND** MUST NOT删除Receipt、刷新baseline或从旧stage继续

#### Scenario: 产品报告确定性通过
- **WHEN** `buildr openspec converge`返回`passed`与`archived`
- **THEN** Agent MUST直接消费该结果继续current knowledge检查、Content Target、Verification与后续Task流程
- **AND** MUST NOT再次运行Convergence Inspect或要求Receipt进入Git交付

#### Scenario: Task Environment已经清理
- **WHEN** Formal Task Finish已经成功且Task Environment cleanup完成
- **THEN** Agent MUST使用Archived Change、Canonical Specs、Git交付事实和Formal Finish Result回答正常历史问题
- **AND** MUST NOT要求恢复Worktree、读取Receipt或把Receipt缺失报告为`recovery-unprovable`

#### Scenario: Inspect返回not-applicable
- **WHEN** Convergence Inspect报告事务尚未开始或Change已经终结
- **THEN** Agent MUST按reason code分别启动Converge或停止恢复检查
- **AND** MUST NOT把`not-applicable`解释为同步失败、归档失败或长期证据缺失

### Requirement: Task Finish Skill 必须收窄为授权与单命令入口
Buildr MUST提供实现`buildr.task-finish/v1`的Task Finish Skill。Skill MUST解析用户交付意图、Task ID与execution context，优先启动canonical `buildr task finish run --task <task-id>`并消费产品返回的入口聚合结果或五阶段Result；不得在调用产品前用自行链式Environment→handoff检查替代产品聚合分类回报。当产品返回入口聚合缺口时，Skill MUST按`development`/`environment`/`delivery`分类向用户说明，并在存在研发缺口时路由`task-development`。Receipt-bound Task 的 normal path MUST NOT收敛Change、运行Review/Verification、生成Candidate、领取checkpoint、构造recovery JSON或从普通PATH选择runtime。产品返回target-race resume token时，Skill MAY只用该精确token恢复同一run，不得把它解释为新的Development/Candidate流程。

#### Scenario: 用户要求收尾
- **WHEN** 用户在canonical Task Environment中明确要求收尾且Development handoff current
- **THEN** Agent MUST披露Task、Candidate/handoff、Task Contribution、Delivery Baseline、目标分支、远端、常规副作用与未授权动作
- **AND** 没有待人工语义决定时 MUST只启动canonical Task Finish executor并消费最终结果

#### Scenario: Development handoff缺失
- **WHEN** Task Development Application报告missing、blocked或stale，或产品入口聚合在`development`分类返回缺口
- **THEN** Task Finish Skill MUST停止并路由`task-development`
- **AND** MUST NOT从Change、Git、Review或Verification facts自行拼装finish-ready Candidate

#### Scenario: 产品一次返回多模块入口缺口
- **WHEN** `task finish run`返回`task_finish.entry_gaps`且`gaps`同时含环境与研发缺口
- **THEN** Skill MUST完整转述各模块缺口，不得只报告第一项
- **AND** MUST优先路由`task-development`处理研发缺口

#### Scenario: 目标分支前进但贡献等价
- **WHEN** 产品证明最新Delivery Baseline上的Task Contribution无冲突且identity等价，并完成同一Candidate的delivery/cleanup
- **THEN** Skill MUST报告复用了原Candidate、Verification、Completion Review与handoff，generation未增加且formal Verification执行数为0
- **AND** MUST不把机械等价表述为语义安全或业务验收

#### Scenario: target-race精确恢复
- **WHEN** 产品在deliver前观察到target再次前进并返回current resume token
- **THEN** Skill MUST只以该token恢复同一run，让产品重做隔离carrier的`prepare → verify → deliver → cleanup`
- **AND** MUST不手写token、重启Development、生成Candidate或执行Verification/Completion Review

#### Scenario: Retained metadata-only 候选正式 handoff
- **WHEN** 用户在retained canonical Workspace对已完成且已验证的metadata-only任务要求收尾，且任务文件、目标分支和无关改动可精确区分
- **THEN** Task Finish Skill MAY将产品执行器标记不适用并披露精确任务文件/排除项/commit/push影响
- **AND** MUST只把明确Git Operation交给selected `buildr.git-operations/v1` provider

#### Scenario: Retained handoff 无法证明文件隔离
- **WHEN** metadata-only候选的任务文件范围、验证identity、目标ref或Git provider readiness无法证明
- **THEN** Task Finish Skill MUST blocked并报告缺失输入/provider reason
- **AND** MUST NOT使用`git add -A`、stash、回滚、虚假Change或手写Git回退绕过边界

#### Scenario: 产品返回完整结果
- **WHEN** current result为complete
- **THEN** Skill MUST直接报告handoff/contribution/baseline/carrier/delivery/retained/cleanup与效率证据
- **AND** MUST NOT为确认已完成动作再次调用inspect或同等验证命令

### Requirement: Task Finish workflow 必须把产品缺陷退回研发
Task Finish workflow MUST把current Development handoff作为前置条件。只有Task Development Application报告原Task source、Task Context、verification policy、gate或handoff真实stale，或者Task Contribution source identity无法由原Task source复算时，当前Finish run才 MUST终止并回到Task Development。Delivery Baseline前进、Git机械应用冲突、Delivery Adaptation、target-race、retained activation或cleanup暂态阻塞 MUST NOT单独使Candidate/generation/Verification/Completion Review/decision/handoff失效；它们 MUST在run-owned Delivery Carrier与产品生成exact resume token边界内处理。Skill MUST NOT把修复原Task内容、重新Formal Verification、Completion Review或Candidate generation描述为Finish恢复步骤。

#### Scenario: 最终保证发现产品缺陷
- **WHEN** Task Development Application报告current handoff、source、context、policy或gate真实stale，且Task Finish result返回`failureClass: upstream-candidate-defect`或`nextWorkflow: task-development`
- **THEN** Agent MUST明确说明不再current的Development applicability fact
- **AND** MUST结束当前Finish run并回到Development重新建立必要的Content Target/gates/Candidate/handoff

#### Scenario: Git conflict进入Delivery Adaptation
- **WHEN** 原Task source与Development handoff仍current，但Task Contribution不能机械应用到最新Delivery Baseline
- **THEN** Agent MUST只在匹配run-owned Delivery Carrier处理语义兼容，并以产品生成的current exact token恢复同一run
- **AND** MUST NOT修改或rebase原Task worktree、重启Development、生成Candidate或执行Formal Verification/Completion Review

#### Scenario: 只观察到路径不重叠
- **WHEN** Agent或产品只知道目标分支与任务修改路径没有重叠
- **THEN** Skill MUST NOT据此声称语义安全或绕过Project verification policy
- **AND** 只能继续消费产品返回的Git/identity equivalence facts与已有Development handoff决定

#### Scenario: 用户要求在收尾中顺手修复
- **WHEN** Finish发现原Task source或handoff真实stale，且用户没有明确授权继续研发修正
- **THEN** Agent MUST结束当前Finish并请求或使用已有授权进入Development workflow
- **AND** MUST NOT在当前Finish run修改原Task内容、接受风险或重跑Formal Verification

### Requirement: Task Finish handoff 必须保持 Git 单项能力边界
Task Finish 的 retained metadata-only handoff MUST 只在该分支把 optional `buildr.git-operations/v1` dependency 提升为 required，并 MUST 让 selected provider 保持精确 repository、operation、path/ref、授权、完整 push range 与最小 Result。完整“收尾”意图和 commit/push 顺序仍由 Task Finish 解释；Git Operations MUST NOT 接管 OpenSpec、验证政策、retained sync 或 task cleanup。

#### Scenario: Git provider 对 handoff 可用
- **WHEN** retained metadata-only handoff 命中且 selected Git Operations provider ready
- **THEN** Task Finish MUST 为 commit 与 push 分别提供 repository、任务 paths、source/destination ref 和当前授权
- **AND** provider MUST 保留所有无关 dirty changes并分别返回适用的 identity、range、effects 与变化维度

#### Scenario: 普通产品 run 不依赖 Git handoff provider
- **WHEN** Task Finish 在 receipt-bound task environment 中启动 canonical product run
- **THEN** optional Git Operations provider 不 ready MUST NOT 阻塞产品 run
- **AND** 产品执行器 MUST 继续自行持有固定五阶段内的 Git effects

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

### Requirement: P0.1 必须切换 Task Record authority，但不抢占专业 authority
P0.1 实现完成、集成并投射到 retained runtime 后，新正式 Task MUST 使用 Task Record Application 与 canonical Task Record 作为顶层 Task authority；`task-manager` 与 Buildr Web 只是两个客户端，该能力 MUST NOT 标记为 preview。当前 Environment、Verification、Finish、Board、Asset Review 与 Git 模块 MUST 继续拥有各自专业事实，直到对应模块 Change 当场完成替换。

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
Buildr task triage、OpenSpec propose contribution与已知正式执行入口 MUST在首次修改交付物、构建、测试或创建Task-owned持久资源前取得matching `ready` Environment Receipt。采用环境后，planning、实现、Content Target观察、formal Verification与Candidate准备 MUST只发生在receipt允许根。

#### Scenario: Triage 选择 Change Flow
- **WHEN** Task Record已建立且即将创建首份预计进入实现的OpenSpec artifact
- **THEN** Agent MUST先通过Task Environment准备或恢复实际执行位置
- **AND** 只有ready后才 MUST在允许根创建Change artifacts

#### Scenario: 直接命中 OpenSpec propose
- **WHEN** 用户意图直接命中installed `openspec-propose`且任务预计持久交付
- **THEN** contribution MUST在`openspec new change`前核对Task与ready Environment
- **AND** MUST通过`task-environment`而非直接调用Git provider

#### Scenario: Code-only 实现
- **WHEN** 正式Task不需要OpenSpec Change但即将修改、构建或测试
- **THEN** Agent MUST取得同样ready Environment
- **AND** MUST NOT因没有Change而跳过执行根、依赖与资源边界

#### Scenario: 只有 lifecycle metadata 写入
- **WHEN** 已有Task的Environment/Development/Review/Verification/Finish Skill只在canonical Workspace维护自己的receipt/result且不触发新环境效果
- **THEN** workflow MUST NOT为metadata写入重新准备已清理环境
- **AND** MUST保持各专业writer的canonical metadata authority

#### Scenario: Stable Content Target交给Task Verification
- **WHEN** Environment中的内容修改、Change convergence、current knowledge与受管生成资产已达到stable target
- **THEN** Task Development MUST观察完整Content Target并明确verification policy
- **AND** Task Verification MUST只绑定该Content Target、declarations、execution与evidence，不得拥有Candidate/policy/proceed

#### Scenario: Candidate 交给 Task Verification
- **WHEN** 旧consumer尝试把Candidate identity直接交给Task Verification
- **THEN** P0.5 workflow MUST拒绝该顺序，并先由Development观察stable Content Target、记录policy并完成formal Verification
- **AND** Task Verification MUST NOT接收、生成或持久化Candidate identity

### Requirement: 任务 Skills 必须消费新的 Environment capability topology
Buildr package/runtime capability graph MUST让`task-environment`提供`buildr.task-environment/v1`，让`task-worktree`只提供`buildr.git-worktree-provider/v1`，并让`task-development`required消费Environment、让`task-finish`通过Development handoff与Environment cleanup协作。Git provider MAY对无需Git的Environment降级。

#### Scenario: task-triage 进入正式执行
- **WHEN** task-triage已确认formal execution分支
- **THEN** 它 MUST optional消费`buildr.task-environment/v1`并在该分支要求provider ready
- **AND** 纯讨论、只读或Task外分支 MUST不因Environment provider缺失而阻塞

#### Scenario: Task Environment 选择 Git isolation
- **WHEN** receipt plan需要一个或多个Git worktrees
- **THEN** task-environment MUST解析selected `buildr.git-worktree-provider/v1`并只消费其Git evidence
- **AND** provider missing/ambiguous/blocked MUST使prepare blocked

#### Scenario: Task Development取得执行context
- **WHEN** Development观察Content Target或请求formal Verification
- **THEN** MUST通过selected `buildr.task-environment/v1`取得matching scopes/allowed roots
- **AND** MUST NOT依赖Git worktree Skill identity或手写execution roots

#### Scenario: Task Finish 清理环境
- **WHEN** Finish已交付equivalent carrier并进入cleanup
- **THEN** Finish MUST调用selected`buildr.task-environment/v1`交接delivery/cleanup eligibility
- **AND** MUST NOT直接扫描资源或调用Git provider cleanup

#### Scenario: provider 替换
- **WHEN** compatible internal providers替换默认Environment/worktree
- **THEN** consumers MUST按capability identity与binding继续工作
- **AND** MUST NOT根据Skill ID、目录名或旧receipt schema硬编码调用

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
Planning与Completion MUST继续是两个可选current Result槽位；Task Record、Environment、Review Application自身 MUST不因缺失而失败。P0.5 Task Development MAY依据Task/Project policy把Planning和Completion设为Candidate/handoff gate，但 MUST只通过Task Review Application applicability判断，MUST不改变Review schema。

#### Scenario: 正式 Task 只有一种 Result
- **WHEN** Task只有Planning Result、只有Completion Result或两者都没有
- **THEN** Task Review/Task Record/Environment read path MUST正常工作
- **AND** Development MUST单独返回missing gate，不写skipped/not-applicable placeholder

#### Scenario: Review method 不满足未来政策
- **WHEN** Result target仍current但policy要求human或independent-agent而现有method为self
- **THEN** Development MUST单独判定gate不满足
- **AND** Task Review MUST NOT把policy mismatch持久化为target stale

### Requirement: Task Review 与 Task Retrospective 必须保持独立 authority
`task-review` MUST只拥有当前方案/完成目标的Review Result；`task-retrospective` MUST只拥有terminal Task的执行效率复盘current Result。两个Skill MUST NOT互写store、互相别名或形成lifecycle dependency。

#### Scenario: Task 同时存在 Review 与 Retrospective
- **WHEN** 同一正式Task已有Planning/Completion Review并在terminal后形成Retrospective
- **THEN** 两类Result MUST由各自provider独立维护
- **AND** Development与Finish MUST不读取、替换或等待Retrospective Result

### Requirement: task-verification Skill 必须作为语义验证入口
Buildr MUST交付`task-verification` Workspace Skill并通过selected `buildr.task-verification/v3` provider工作。Skill MUST理解Task Intent与Development提供的stable Content Target，读取Task scope内Project v2 declarations、选择适用已有能力、取得transient execution evidence、提炼current facts，并只在完整结论形成后调用Task Verification Application record。

#### Scenario: 用户要求验证正式 Task
- **WHEN** 用户或Task Development提供正式Task、明确stable Content Target identity与policy decision
- **THEN** Agent MUST先inspect existing current Result/declarations
- **AND** stale、missing或policy要求额外能力时 MUST执行适用能力并形成完整replacement

#### Scenario: Development请求formal Verification
- **WHEN** Task Development提供正式Task、明确Content Target identity与policy decision
- **THEN** Agent MUST先inspect existing current Result/declarations
- **AND** stale、missing或policy要求额外能力时 MUST执行适用能力并形成完整replacement

#### Scenario: Finish请求Verification
- **WHEN** Task Finish已经开始消费Development handoff
- **THEN** task-verification MUST不再被Finish路由或调用
- **AND** 任何Verification需求 MUST返回Task Development重新建立stable target

#### Scenario: 普通一次性测试
- **WHEN** 用户只要求运行一条测试且没有正式Task/target identity
- **THEN** Skill MAY执行并报告transient facts
- **AND** MUST NOT创建空Task、伪Content Target或Task Verification Result

### Requirement: Skill 必须区分 Capability Declaration、Execution 与 Result
Skill MUST 把 Project declaration 作为已有能力事实，把完整 stdout/stderr、耗时、资源等待和诊断作为 transient Execution Evidence，把current Result作为Workspace-local Task fact。Skill MUST NOT将三者合并成一个schema，也 MUST NOT把execution summary path写入Result。

#### Scenario: command execution 成功
- **WHEN** Skill 通过 `buildr verification run` 执行显式 command capabilities
- **THEN** Skill MUST读取transient summary并提炼每项capability的current facts
- **AND** 全部 consumer 完成后 MUST 请求 cleanup exact execution boundary

#### Scenario: execution 中断
- **WHEN** runner 或 Agent operation 中断且完整结论未形成
- **THEN** Skill MUST 保留已有 current Result
- **AND** MUST 如实报告本次 transient execution 未形成新 current

### Requirement: P0.4 workflow 不得抢占 Development 或其他专业 authority
`task-verification` MUST NOT创建Candidate/generation、改变Task Record status、决定verification policy或proceed/blocked、接受风险、实现缺失测试或替代Task Review/Environment/业务验收。P0.5 Task Development MUST独占这些consumer decisions并只通过Verification Application read model消费Result。

#### Scenario: 存在 coverage gap
- **WHEN** 当前Content Target缺少能证明所需事实的capability
- **THEN** Skill MUST将gap写入完整Result或会话报告
- **AND** MUST将“是否继续”留给Task Development，同时不得允许risk绕过not-passed事实

### Requirement: Buildr 产品入口必须路由 v3 Verification authority
Buildr product Skill、task-triage 和相关 builtin descriptions MUST 将测试、验证、能力声明和实现完成验证意图路由到 selected `buildr.task-verification/v3` provider，并 MUST 删除 v2、成熟度晋级、三层 assurance 与 Candidate reuse 的路由文本。

#### Scenario: runtime 发现 Task Verification
- **WHEN** supported Agent runtime 完成 Buildr sync/render
- **THEN** runtime MUST 发现 v3 `task-verification` Skill、contract、Project v2 reference/template 与 binding
- **AND** 不得同时投射 v2 contract 或 v1 reference

### Requirement: 测试建设与 Task Verification 必须使用独立入口
Buildr product Skill、task-triage 和 builtin descriptions MUST 将测试框架设计、测试分层、编排策略和为实现任务开发测试的意图路由到 `project-testing`；将 Project 能力声明、已有能力执行、transient evidence 和 current Task Verification Result 路由到 selected `buildr.task-verification/v3` provider。两个 Skill MAY 在同一任务中先后使用，但 MUST NOT 互相维护状态、声明 provider dependency 或接管对方 authority。

#### Scenario: 实现完成后补充测试再验证任务
- **WHEN** Agent 完成功能实现，需要先开发项目测试，再形成正式 Task Verification Result
- **THEN** Agent MUST 先使用 `project-testing` 按项目约定补充适量测试
- **AND** 测试入口稳定并已由 Project 声明后 MUST 使用 `task-verification` 选择和执行 capability

#### Scenario: runtime 发现两个独立 Skill
- **WHEN** supported Agent runtime 完成 Buildr sync 或 render
- **THEN** runtime MUST 同时发现 `project-testing` 与 `task-verification`
- **AND** `project-testing` MUST 不提供 Task Verification capability binding 或 Result authority

### Requirement: task-development Skill 必须编排P0.5 authority顺序

Buildr MUST交付`task-development` Workspace Skill并提供`buildr.task-development@2`。Skill MUST从proposal、design或直接实现等首个正式研发动作开始维护planning current snapshot，在内容稳定后建立Content Target与policy、调用formal Verification、冻结Candidate、按适用性调用或明确处置Completion Review，并形成decision/handoff；它 MUST通过内部Application driver工作且 MUST NOT新增公共CLI或Buildr Web writer。

#### Scenario: OpenSpec planning入口登记事实
- **WHEN** active Task在ready Environment中创建或更新proposal/design
- **THEN** 若该文档属于尚未绑定的OpenSpec变更，OpenSpec sidebar MUST先完成脚手架与`add-change`，再调用Development begin，然后才写入artifact，并在artifact形成后登记其专业authority、portable reference与identity
- **AND** MUST NOT把artifact正文复制到Development Receipt
- **AND** MUST NOT对空变更列表 begin 后再绑定同一变更

#### Scenario: Change任务进入Candidate准备
- **WHEN** active Task包含0..N Change且实现已完成
- **THEN** Skill MUST在Content Target观察前完成适用Change sync/archive/current knowledge/runtime fixed point，并把已有proposal/design/Review等专业facts登记到current planning snapshot
- **AND** 任一内容mutation发生后 MUST重新观察target，不能复用先前Verification

#### Scenario: 无Change普通Workspace进入Candidate准备
- **WHEN** active Task没有OpenSpec且首个正式研发动作为代码实现
- **THEN** Skill MUST以空planning nodes建立Development Receipt并允许实现继续
- **AND** MUST NOT要求proposal、Planning Review、Product code、Service code、Git ref、Node/npm或OpenSpec executable

#### Scenario: runtime发现Development
- **WHEN** supported Agent runtime完成Buildr sync/render
- **THEN** runtime MUST发现`task-development` Skill、`buildr.task-development@2` contract与binding
- **AND** MUST不同时投射v1 provider或旧Finish-owned Candidate/Verification路由

### Requirement: Git Operations 只执行 consumer 已选定的 Git Operation
Buildr MUST 交付唯一 Skill-only `git-operations`，并 MUST 通过 selected `buildr.git-operations/v1` provider 为一次已选定 Git Operation 提供授权边界、安全默认值、操作前后 identity 与最小 Result。直接用户或上游 consumer MUST 决定 repository、operation、相关 ref、scope、目标和顺序；provider MUST NOT 接管 Task Development、Task Finish、验证、交付编排或语义决策。

#### Scenario: 输入不足时零写入
- **WHEN** repository、operation、相关 local/remote ref、精确 scope 或当前授权不能唯一确定
- **THEN** provider MUST 在任何 Git 写入前返回 `blocked` 与缺失事实
- **AND** MUST NOT 自行选择 repository、ref、remote、operation 或策略

#### Scenario: 独立 commit
- **WHEN** consumer 只授权 `commit` 并提供精确 owned paths 或可可靠分离的 hunks
- **THEN** provider MUST 只 stage 授权内容并创建或安全 amend 尚未共享的当前 scope commit
- **AND** MUST NOT push、使用 `git add -A`、stage 无关 dirty 或覆盖其他改动

#### Scenario: 独立 push
- **WHEN** consumer 只授权 `push` 并提供 source ref、destination remote/ref 与 commit scope
- **THEN** provider MUST 只推送已有 commit，并在写远端前核验实际 remote/ref 和完整 unpublished commit range
- **AND** MUST NOT 把 dirty 内容自动 commit 或只检查 range 的 tip commit

#### Scenario: commit 后 push
- **WHEN** consumer 明确选择 `commit+push`
- **THEN** caller MUST 依次请求独立 commit 与 push operation，并分别消费两个 Result
- **AND** Git Operations MUST NOT 把两步伪装成原子 transaction

#### Scenario: 工作区存在无关 dirty
- **WHEN** operation scope 外存在 modified、staged 或 untracked 内容
- **THEN** provider MUST 保留这些内容的 index 与 working tree 状态
- **AND** 只有授权内容可精确隔离时 operation MAY 继续，否则 MUST 返回 `blocked`

#### Scenario: Push range 包含 scope 外提交
- **WHEN** destination remote/ref 与 source ref 之间将被发布的完整 commit range 含有 consumer scope 外的 unpublished commit
- **THEN** provider MUST 在 push 前返回 `blocked` 并列出不匹配的 range facts
- **AND** MUST NOT 自动扩大授权、改推其他 ref、rebase、merge 或 force push

#### Scenario: Push 被拒绝
- **WHEN** remote 拒绝普通 push 或 destination identity 已漂移
- **THEN** provider MUST 停止并返回当前 local/remote facts 与已发生 effects
- **AND** MUST NOT 自动 force push、改写历史、切换 destination 或改变集成策略

#### Scenario: 共享 commit 冻结
- **WHEN** 当前 scope commit 已 push 或以其他方式共享
- **THEN** provider MUST NOT amend、rebase 或改写该 commit
- **AND** 后续变更 MUST 创建新 commit；撤销共享内容默认由 caller 明确选择新 revert operation

#### Scenario: 操作部分失败
- **WHEN** 一个 operation 失败前已经产生 local history、working tree 或 remote effect，或 commit+push 的 commit 已成功而 push blocked
- **THEN** Result MUST 如实报告已发生 effects、当前 repository identity 和未发生的 effect
- **AND** provider MUST NOT 静默回滚、stash、reset、换策略或把部分成功报告为零 effect

#### Scenario: 最小 Result
- **WHEN** provider 完成或阻止一个 Git Operation
- **THEN** Result MUST 包含 repository、实际 operation、`succeeded | blocked`、reason、适用的 before/after branch 与 commit identity、remote/ref、变化维度和已发生 effects
- **AND** Result MUST 只在 push 适用时包含完整 commit range，且 MUST NOT 要求所有 operation 填充统一的大 schema 或创建 Receipt

#### Scenario: 默认不自动执行高风险策略
- **WHEN** operation 遇到 dirty、divergence、冲突、目标竞争或共享历史
- **THEN** provider MUST NOT 自动 stash、reset、rebase、merge、force push、改写共享历史或切换策略
- **AND** 语义或重大风险决定 MUST 由 Agent 交还用户，恢复或重试 MUST 先重新核验事实

### Requirement: Task Development 必须区分任务贡献与交付基线适用性

Task Development MUST是 Content Target、Candidate、Verification Result、Completion Review、decision 与研发交接（Development Handoff）是否 current/stale 的唯一 authority。Git-backed Development MUST只读观察原 Task source snapshot、Task Context、policy 与 gates；交付基线（Delivery Baseline）前进或 Task Finish 的机械应用冲突 MUST NOT自动改变这些 applicability facts。只有原 Task source/任务贡献（Task Contribution）、Task Context、policy或gate真实变化时，Development `observe`才使旧facts stale并要求重新Verification、Completion Review、handoff与新Candidate freeze。Buildr MUST NOT以路径不重叠、clean apply、resume动作或调用方boolean推断语义安全。

#### Scenario: rebase 只引入无关交付基线前进

- **WHEN** current Development handoff形成后Delivery Baseline前进，但原Task worktree/source snapshot、Task Context、policy与gates均未变化
- **THEN** Development只读inspect MUST保持Content Target、Candidate、Verification Result、Completion Review、decision与handoff current
- **AND** MUST不调用observe覆盖Content Target、不重跑formal Verification且Candidate generation不增加
- **AND** Agent MUST只在隔离Delivery Carrier处理需要的Delivery Adaptation

#### Scenario: 任务贡献或同路径基线事实变化

- **WHEN** 原Task source/Task Contribution、Task Context、policy或gate真实变化
- **THEN** Development MUST派生相应Content Target、Candidate或gate stale并阻止旧handoff继续交付
- **AND** Agent MUST在Development重新完成formal Verification、Completion Review与handoff后才能freeze新generation

#### Scenario: Finish conflict不写Development authority

- **WHEN** Finish报告`delivery-adaptation-required`或`semantic-review-required`，且Development只读inspect仍证明原Task source与全部applicability inputs未变
- **THEN** Development MUST保持全部gates与handoff current
- **AND** Finish result或Agent resume MUST NOT写Development Receipt或宣称Candidate stale

#### Scenario: 无法判断是否改变任务行为

- **WHEN** Agent无法判断Delivery Adaptation是否改变任务行为或验收目标
- **THEN** workflow MUST保持blocked且不得交付
- **AND** MUST NOT伪造复用evidence或静默调用Development observe

#### Scenario: 真实 Development 到 Finish 的适用性覆盖

- **WHEN** Product验证目标分支前进后的Candidate复用
- **THEN** 测试 MUST使用真实Task Development Application形成并只读检查current gates与handoff
- **AND** MUST覆盖clean reuse、same-path conflict adaptation、真实source drift rebuild、generation与formal Verification执行次数

### Requirement: OpenSpec Change checklist 必须止于 Change disposition 边界
Buildr-owned OpenSpec propose、update与apply contributions MUST引导Agent只把Change disposition前可完成的实现、知识收敛、验证反馈和archive readiness动作写入`tasks.md`。Contributions MUST NOT把Formal Development、Task Finish、Environment cleanup、Task terminal state或其他只能在archive后发生的Task lifecycle动作写为Change checkbox；convergence/archive MUST在Task Development观察stable Content Target之前完成，Task Finish MUST不拥有或解释Change checklist。

#### Scenario: Agent创建或修订Change计划
- **WHEN** `openspec-propose`或`openspec-update-change`生成或修改`tasks.md`
- **THEN** Buildr contribution MUST要求每个checkbox都能在Change disposition前完成
- **AND** MUST把Formal Verification、Task Candidate、Completion Review、Task Finish、Environment cleanup与Task terminal state留给Change外的Task Development lifecycle

#### Scenario: Agent准备收敛Change
- **WHEN** `openspec-apply-change`完成实现并准备调用`buildr openspec converge`
- **THEN** contribution MUST要求先完成全部Change-owned checkbox并说明convergence/archive属于Development stable Content Target之前的Change处置
- **AND** MUST NOT声称Task Finish调用或拥有convergence/archive

#### Scenario: checklist含有archive后动作
- **WHEN** Agent发现现有checkbox只能在Change converge/archive后完成
- **THEN** Agent MUST在implementation前修订该checkbox而不是让convergence自动勾选或绕过
- **AND** Change仍必须在全部真实Change-owned checkbox完成后才能进入convergence

### Requirement: task-manager 必须作为 Parent Task 的薄管理入口
`task-manager` MUST 只通过 Task Record Application 创建、检查和明确修改 Parent Task 关系，并 MUST 使用 canonical Workspace Task identity。Skill MUST NOT 直接操作 SQLite、构建通用关系图、自动修改 Child lifecycle 或冒充 Task Board writer。

#### Scenario: Agent 创建受 Parent 管理的 Task
- **WHEN** 用户明确要求一个 Task 管理另一个正式 Task
- **THEN** Agent MUST 通过 Task Manager create/update 动作保存 Parent relationship
- **AND** MUST 保持 Parent 与 Child 的 Environment、Development、Review、Verification、Finish 和终态决定独立

#### Scenario: Agent 判断协调 Task 完成
- **WHEN** Agent 根据 Child 状态与专业 evidence 判断 Parent 整体 Intent 是否满足
- **THEN** 该语义判断 MUST 通过 Parent 自己的明确 completion summary 或适用专业 Result 表达
- **AND** MUST NOT 仅因所有 Child terminal 而自动 complete Parent

#### Scenario: 层级不足以表达协调需求
- **WHEN** 真实需求需要未 Task 化规划、多协调归属、显式依赖条件、排序分组或跨 Task 决策记录
- **THEN** task-manager MUST 保持 Parent Task 边界并把缺口交回任务分流
- **AND** MUST NOT 把自由文本或临时推理伪装成新的关系字段

### Requirement: Task Finish 必须只按 Workspace 根 runtime source 选择 render
Task Finish MUST在交付前从冻结Task Contribution形成`none | render-runtime`计划。canonical Workspace根的Rule、Skill、Component、Command和相关runtime source变化 MUST选择`render-runtime`，其他变化 MUST选择`none`。Task Finish MUST NOT读取Project/Service activation声明、执行`buildr sync`、生成自举convergence commit或接受任意executable、args、env和shell。

#### Scenario: 用户 Workspace 开发 Skill
- **WHEN** Task Contribution修改canonical Workspace根Skill source
- **THEN** Task Finish MUST从已交付retained source执行当前Agent render与Doctor
- **AND** MUST NOT更新Builtin source、执行sync或把Agent runtime当作Git交付内容

#### Scenario: 普通代码变化
- **WHEN** Task Contribution没有命中canonical Workspace根runtime source
- **THEN** Task Finish MUST选择`none`
- **AND** MUST NOT仅因Project、Service或宽泛目录身份执行sync或render

#### Scenario: Project声明不能扩展Finish动作
- **WHEN** Project或候选内容包含Task Finish activation配置
- **THEN** 通用Task Finish MUST忽略该配置且不得获得sync资格
- **AND** Project MUST通过自身Workspace工作资产组合处理特有的交付后维护

### Requirement: Workspace 可以通过 Skill Contribution 扩展 Task Finish 后续维护
Workspace Component MAY通过`task-finish@append`追加Workspace专属维护。Contribution可以在Formal Task Finish成功后执行后续维护，也可以对交付和remote readback已完成、唯一当前失败为retained Doctor且产品提供matching resume token的run覆盖默认停止规则：先执行专属维护，再恢复同一Finish run。Contribution MUST NOT改写产品固定五阶段、伪造Doctor通过、重建Candidate/Verification/Review/decision或创建第二个Finish authority。通用`task-finish` Skill MUST NOT为Workspace专属维护声明命名slot或依赖自举Skill。

#### Scenario: 自举 Workspace 安装扩展
- **WHEN** Buildr自举Workspace安装同时拥有专属Skill与Contribution的Workspace Component
- **THEN** runtime MUST把Contribution追加到有效`task-finish` Skill末尾，并让Agent在执行前将其作为整份Skill的更具体规则读取
- **AND** 普通用户Workspace未安装该Component时 MUST保持原Task Finish内容和Doctor失败行为，且通用Skill不包含自举slot

#### Scenario: retained Doctor阻塞由自举增强恢复
- **WHEN** Finish已经完成carrier交付和remote readback、唯一当前失败为retained Doctor、冻结贡献命中自举动作且Result包含matching resume token
- **THEN** append MAY覆盖普通停止规则，先调用专属Self-bootstrap Skill，再恢复同一Finish run
- **AND** 最终指定Agent Doctor未通过时 MUST保持Formal Finish blocked且不得cleanup

#### Scenario: 自举收敛未完成
- **WHEN** Formal Task Finish已经成功但Workspace专属自举收敛失败
- **THEN** Agent MUST报告主任务已交付且Workspace收敛未完成，并保留精确恢复现场
- **AND** MUST NOT改写或撤销Formal Task Finish Result与上游研发事实

### Requirement: OpenSpec 直接 consumers 必须表达真实 capability 停止条件
Buildr OpenSpec Component MUST通过结构化 dependency contributions 与对应 fragments 统一声明直接和条件依赖，使直接命中外部 OpenSpec Skill 的正式持久交付仍满足 Task、Environment、Development 与 current knowledge 边界。

#### Scenario: 直接调用 propose
- **WHEN**用户意图直接命中 `openspec-propose` 并准备创建 Change artifacts
- **THEN** consumer MUST required依赖 `buildr.task-record/v1`、`buildr.task-environment/v1`、`buildr.task-development@2` 与 `buildr.current-knowledge-maintenance/v1`
- **AND** Environment MAY选择共享执行根但 MUST返回 matching ready evidence

#### Scenario: 直接调用 apply
- **WHEN**用户意图直接命中 `openspec-apply-change` 并准备修改实现或 Change tasks
- **THEN** consumer MUST required依赖 Task Record、Task Environment、Task Development 与 current knowledge capabilities
- **AND**任一 provider 未 ready 或 Task/Environment/Development context 不匹配时 MUST在实现编辑前停止

#### Scenario: 纯 planning update
- **WHEN** `openspec-update-change` 只修订既有 planning artifacts且不产生新的执行效果
- **THEN** current knowledge dependency MUST为 required，Task Environment与Task Development dependencies MUST为 optional
- **AND**若修订发生在正式 Task 中，Development provider ready时 MUST更新planning snapshot

#### Scenario: Update 产生执行效果
- **WHEN** update 需要新的实现、构建、测试、资源或执行位置变化
- **THEN** fragment MUST要求 Environment和Development provider ready并转入`openspec-apply-change`
- **AND**不得在 update consumer 中继续实现或把 optional dependency 当作绕过理由

### Requirement: OpenSpec apply、sync 和 archive 必须使用单一 convergence authority
Buildr MUST在 apply 入口执行 apply-ready 和 proposal/delta 门禁，并 MUST让独立 sync/archive consumers 拒绝 canonical 写入或归档旁路，统一转交 `buildr openspec converge`。

#### Scenario: Apply 开始实现
- **WHEN** `openspec-apply-change` 准备进行首个实现编辑
- **THEN** prepend MUST验证 apply-required artifacts complete、上游 strict validation 与 proposal/delta classification check
- **AND**门禁未通过时 MUST blocked，delta Requirement identity改变后 MUST重新检查

#### Scenario: 用户直接调用 sync
- **WHEN**用户要求 `openspec-sync-specs` 在 Buildr Workspace 写入 canonical specs
- **THEN** prepend MUST拒绝上游 agent-driven sync并转用 `buildr openspec converge`
- **AND** sync consumer MUST NOT机械声明完整Task lifecycle dependencies或运行旧pre-sync/post-sync序列

#### Scenario: 用户直接调用 archive
- **WHEN**用户要求 `openspec-archive-change` 跳过未完成tasks、spec sync或convergence直接归档
- **THEN** prepend MUST拒绝确认绕过并转用 `buildr openspec converge`
- **AND**只有converge返回passed或幂等archived结果时才 MUST报告canonical sync/archive完成

### Requirement: 通用 Task Finish 不得执行 Buildr development 产品安装
通用 Task Finish MUST只保留current Development handoff消费、Task Contribution、Delivery Baseline、Delivery Carrier、carrier equivalence、fast-forward或普通push、远端回读、必要retained runtime render、指定Agent retained Doctor与Environment cleanup。它 MUST NOT安装默认Buildr CLI、安装或更新`Buildr Web Dev.app`、硬编码development launcher channel，或根据Product源码路径推断本机产品安装。retained Doctor MUST使用run identity绑定的Agent并要求`health.ready: true`；通用Product executor MUST不识别self-bootstrap Component、执行sync或自动改变Doctor失败结论。

#### Scenario: 普通用户 Workspace 完成交付
- **WHEN** 未安装`buildr-self-bootstrap` Component的用户Workspace完成Formal Task Finish
- **THEN** Finish MUST执行通用交付、指定Agent Doctor与cleanup，并观察到CLI installer和Buildr Web installer调用次数都为零
- **AND** Doctor不ready时 MUST保持blocked，不要求`projects/product/buildr`存在或访问`/Applications/Buildr Web Dev.app`

#### Scenario: Buildr源码路径进入共用Finish
- **WHEN** Task Contribution包含Buildr CLI、Product Skill或Buildr Web实现路径
- **THEN** 共用Finish MUST仍只执行通用activation与指定Agent Doctor
- **AND** MUST NOT自行执行development CLI、Buildr Web或package sync；是否尝试自举恢复只由Workspace append决定

#### Scenario: 通用 Workspace Doctor 不 ready
- **WHEN** retained指定Agent Doctor返回非零或`health.ready`不为true
- **THEN** Common Finish MUST阻塞deliver且不得进入cleanup
- **AND** MUST保留Doctor findings、partial delivery与精确resume事实，不得自行把self-bootstrap可能性解释为成功

### Requirement: Task Finish v2 delivered证明必须兼容旧安装字段但解除其门禁权责
`buildr.task-finish-result/v2` MUST继续作为Finish JSON authority，并 MUST让delivered证明绑定Task、handoff、Candidate/generation、Content Target、carrier equivalence、remote readback、通用retained activation、Doctor与cleanup。`runtimeInstall`和`localAppDelivery`若继续输出 MUST为deprecated兼容字段且不拥有delivered gate authority；产品 MUST NOT仅为重命名创建新schema或把self-bootstrap evidence复制到其他store。

#### Scenario: 新Finish Result不含产品安装成功
- **WHEN** 新v2 run完成通用delivery与cleanup且兼容字段为`not-applicable`或缺失
- **THEN** terminal projection MUST认定该handoff已delivered
- **AND** MUST NOT要求self-bootstrap activation evidence存在

#### Scenario: 读取旧已完成v2 Result
- **WHEN** terminal reader读取包含`runtimeInstall: passed`与development `localAppDelivery: passed`的旧完整v2 Result
- **THEN** reader MUST安全保持其既有delivered判断
- **AND** MUST NOT迁移、重写或复制该Result

### Requirement: self-bootstrap 最终候选验证必须按实质身份变化重建或复用 evidence
Buildr self-bootstrap workflow MUST 将候选验证绑定到 Content Target、runtime identity、migration identity、verification declaration 与 validation-store baseline。rebase、冲突解决或集成准备后，若这些输入发生实质变化，workflow MUST 在最终候选上重新执行受影响验证；migration identity 改变时 MUST 丢弃旧 validation store 并从最新 retained baseline 重建完整 migration chain。若 workflow 能证明所有绑定输入未变，MUST 只执行最终 identity check 并可复用既有验证 evidence。

#### Scenario: migration 重编号后准备集成
- **WHEN** 并发 Task 使 candidate migration 的文件名、编号或 identity 在 rebase/冲突解决中变化
- **THEN** workflow MUST 丢弃旧 validation store 并在最新 retained baseline 上重建它
- **AND** MUST 重跑完整 migration chain、SQLite 验证和受影响功能验证后才可形成最终 Candidate

#### Scenario: retained baseline 前进但最终候选未变
- **WHEN** retained branch 前进，但 Task 的 Content Target、runtime identity、migration identity、verification declaration 与受影响范围可证明均未变化
- **THEN** workflow MUST 记录最终 identity check 并可复用既有验证 evidence
- **AND** MUST NOT 仅因 rebase 动作机械要求全量 Candidate 验证

### Requirement: 终态 Task 提供非阻塞任务复盘提示
Buildr MUST 在正式 Task 成功进入 `completed` 或 `abandoned` 终态后，让结束任务的 Agent 使用稳定名称“任务复盘”询问用户是否复盘；该提示 MUST 发生在终态结果成立之后，且 MUST NOT 自动运行复盘或改变终态结果。

#### Scenario: Task Record 完成后提示复盘
- **WHEN** Task Record Application 成功完成 active Task
- **THEN** terminal operation result MUST 提供非阻塞“任务复盘”建议
- **AND** `task-manager` MUST 要求 Agent 在用户可见终态响应中询问是否进行任务复盘
- **AND** 用户未同意复盘时 MUST NOT 调用 `task-retrospective`

#### Scenario: Task Record 放弃后提示复盘
- **WHEN** Task Record Application 成功放弃 active Task
- **THEN** terminal operation result MUST 提供非阻塞“任务复盘”建议
- **AND** 复盘缺失或用户拒绝 MUST NOT 改变 `abandoned` 状态

#### Scenario: Formal Finish 成功后提示复盘
- **WHEN** Task Finish 成功完成 retained Task Record 与 cleanup
- **THEN** complete result MUST 提供非阻塞“任务复盘”建议
- **AND** `task-finish` MUST 要求 Agent 在最终响应中询问是否进行任务复盘
- **AND** 该建议 MUST NOT成为 Finish operation、cleanup 或 Task terminal transition 的门禁

#### Scenario: 终态操作失败或阻塞
- **WHEN** Task Record terminal transition 或 Task Finish 未成功到达目标终态
- **THEN** Agent MUST NOT提示当前 Task 已可进行终态复盘
- **AND** blocked result MUST 继续优先提供其确定性恢复动作

#### Scenario: 任务复盘提示说明当前重点
- **WHEN** Agent 展示终态任务复盘提示
- **THEN** 提示 MUST 使用长期名称“任务复盘”
- **AND** MUST 说明当前重点包括 Agent 执行耗时、Token 消耗、重复尝试和人机协作效率
- **AND** MUST 说明 Token 数据仅在 Agent 可取得时记录且缺失不影响复盘

### Requirement: task-triage 必须在正式 Task 创建前收敛统一 dev 基线
当 `task-triage` 已确认进入正式持久交付且需要创建新 Task Record 时，Agent MUST 在调用 Task Record `create` 前解析完整 repository set，并通过 selected `buildr.git-operations/v1` provider 将每个仓库的 clean `dev` 收敛到本次 fetch 后的 `origin/dev`。只有全部仓库成功且适用的 Workspace transition check 已 ready 时才能创建 Task；Task Record Application 与 Task Environment MUST NOT 因此获得 Git mutation authority。

#### Scenario: 全部仓库已对齐或成功收敛
- **WHEN** 完整 repository set 均处于 clean `dev`、upstream 为 `origin/dev`，且 `fetch origin dev` 与 `rebase origin/dev` 全部成功
- **THEN** task-triage MUST 核对每个仓库的 before/after branch、HEAD 与实际 effects
- **AND** MUST 仅在适用的 Workspace transition check ready 后调用 selected Task Record provider 的 `create`

#### Scenario: 本地未 push commit 与远端同时前进
- **WHEN** 仓库 clean、本地 `dev` 含未 push 且未共享的 commit，并且 fetch 后 `origin/dev` 已前进
- **THEN** task-triage MUST 将 repository、`rebase` operation、`dev` 与 `origin/dev` 明确交给 selected Git Operations provider
- **AND** rebase 成功后 MUST 以新的 local commit identity 继续创建前门禁

#### Scenario: repository 前置事实不满足
- **WHEN** 任一仓库不是符号分支 `dev`、upstream 不是 `origin/dev`、working tree/index dirty、存在进行中的 Git operation，或 remote/ref/共享风险无法证明
- **THEN** task-triage MUST 在该仓库 tree/history 零写入状态阻塞 Task 创建并报告当前事实
- **AND** MUST NOT 自动 checkout、stash/autostash、merge、force push、选择其他分支或改变策略

#### Scenario: fetch 或 rebase 失败
- **WHEN** 任一仓库 fetch 失败、remote/ref 漂移、rebase 失败或出现冲突
- **THEN** task-triage MUST 不调用 Task Record `create`，并报告全部仓库已经发生的 effects 与当前 Git facts
- **AND** MUST NOT 把多仓库部分成功报告为零变化或原子回滚

#### Scenario: clean pre-state 的 rebase 冲突可恢复
- **WHEN** rebase 在已证明 clean 的仓库发生冲突，且 `rebase --abort` 能恢复精确 pre-rebase branch、HEAD 与 clean 状态
- **THEN** selected Git Operation MUST 报告 conflict 与 recovered abort effects，Task 创建仍 MUST blocked
- **AND** abort 无法完成或恢复 identity 无法证明时 MUST 保留并报告真实冲突现场

#### Scenario: Git Operations provider 不可用
- **WHEN** 新正式 Task 创建分支无法解析 ready `buildr.git-operations/v1` selected provider
- **THEN** task-triage MUST 只阻塞 Git 基线收敛与 Task Record create
- **AND** 纯讨论、只读探索、已有 Task inspect 和不依赖该动作的语义判断 MUST 保持可用

### Requirement: Task Finish 与 Task Record complete 必须保持不同用户语义
Buildr MUST继续以`task-finish`解释“收尾、交付、合并、推送、retained检查与清理”，并以`task-manager`的complete operation表达Task Record terminal transition。`task-finish` Skill、`buildr.task-finish/v1` capability和`buildr task finish run|inspect`名称 MUST保留；Skill MUST只消费Task Finish Application Result，不得直接访问SQLite、SQL、migration、lease或transient files。

#### Scenario: 用户要求收尾有交付内容的 Task
- **WHEN** current Development handoff存在且用户要求提交、合并、推送、清理或完整收尾
- **THEN** Agent MUST路由`task-finish`并启动canonical五阶段执行器
- **AND** MUST NOT以`task complete`替代delivery、remote readback、Doctor或Environment cleanup

#### Scenario: Finish 成功结束 Task
- **WHEN** 产品执行器完成delivery、cleanup与SQLite terminal transaction
- **THEN** Agent MUST报告Task Finish complete及其compact delivery evidence
- **AND** Task Record completed MUST作为同一产品结果的终态事实，不得由Agent额外重跑complete

#### Scenario: 无变更 Task 直接完成
- **WHEN** Task Record Application已证明`noChange`且不存在需要交付的Content Target
- **THEN** `task-manager` MAY直接执行complete并记录no-change result
- **AND** MUST NOT伪造Task Finish run、completion、commit、push或cleanup evidence

#### Scenario: Agent 检查 Finish 状态
- **WHEN** Skill或Agent需要查看current/terminal Finish状态
- **THEN** MUST调用`buildr task finish inspect --task <task-id>`或绑定Application能力
- **AND** MUST NOT扫描`.buildr/task-finish`、查询SQLite或自行删除transient目录

### Requirement: Agent 必须按 Parent协调 Child独立交付工作
Agent workflow MUST先建立/审查Parent Plan，再从Contribution创建绑定Parent但不继承Parent Change/Environment的Child Task；Child MUST从最新dev/canonical specs建立窄Change并独立完成Development/Review/Verification/Finish。

#### Scenario: 从Parent Contribution启动Child
- **WHEN** 用户选择一个未交付Contribution实施
- **THEN** Agent MUST创建带Parent关系和planned Contribution binding的Child Task
- **AND** MUST在Child ready Environment中创建自己的Change

### Requirement: Agent 必须显式 reconcile 范围变化
Agent发现Child跨Contribution或改变依赖/invariant/acceptance时 MUST暂停将普通状态变化解释为进度，读取saved handoff并显式reconcile Parent Plan；无法证明交付 MUST保持未完成。

#### Scenario: 未来Child仅剩部分范围
- **WHEN** saved handoff证明未来Child部分范围已被覆盖
- **THEN** Agent MUST更新未来Child intent与Change只保留residual
- **AND** MUST重新建立其planning target与适用Review

### Requirement: OpenSpec workflow 必须消费统一 planning identity resolver
正式 Task 的 OpenSpec propose、update、apply与converge/archive workflow MUST 在apply-ready后先运行OpenSpec Contract Guard semantic readiness preflight。Preflight current且`ready`后，workflow MUST使用Task Planning Identity Application取得current target与planning nodes，并把同一target交给Task Development和Planning Review；preflight `blocked`时 MUST在resolver、Planning Review和apply前停止，由Agent处理最小语义决定。Agent MUST NOT通过 `shasum`、文件路径列表、mtime、checklist progress、Git ref或手工沿用旧值生成OpenSpec Planning Review target，也 MUST NOT让Planning Review解释或复制preflight逻辑。

#### Scenario: Apply 前建立 Planning Review target
- **WHEN** 正式 Task 的OpenSpec Change artifacts达到apply-ready并通过upstream strict validation
- **THEN** sidebar MUST先运行semantic readiness preflight；ready后再调用resolver、用返回nodes更新Development planning并对返回target执行或inspect Planning Review
- **AND** preflight或resolver blocked时 MUST停止apply且不得猜测target或把blocker写入Review Result代替处理

#### Scenario: Preflight blocker由Agent处理
- **WHEN** semantic readiness preflight报告active Change conflict、Scenario omission、rename/identity conflict或projected validation failure
- **THEN** Agent MUST只处理对应Change语义、依赖顺序或用户决定，并在事实变化后重新运行strict与preflight
- **AND** MUST不手工生成ready、修改canonical或要求Planning Review裁决OpenSpec parser结果

#### Scenario: Archive 后复核已有 Review
- **WHEN** deterministic convergence把同一Change移动到archive且resolver返回与apply前相同target
- **THEN** workflow MUST复用current Planning Review而不得仅因archive path或checklist完成态重新record
- **AND** archive前最终converge仍 MUST按最新事实重新规划，不得消费apply前preflight作为写入授权

### Requirement: task-manager Skill 必须作为 Buildr Web 与 CLI 共享的 Task Record 薄管理入口
Buildr MUST交付名为 `task-manager` 的 workspace Skill，并 MUST用精确 routing description 将它限制在 Agent 对正式 Task Record 的创建、按 Task ID 恢复、查看、更新和结束；Skill MUST通过 selected `buildr.task-record/v1` provider 执行，不得成为全局任务 dispatcher。Buildr Web MUST作为同一 Task Record Application 的独立人类客户端，不通过 Skill routing 写记录；任一客户端 MUST NOT直接访问 SQLite、SQL 或 migration scripts。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建正式 Task、查看或修改 Task 顶层事实、按 Task ID 恢复或结束 Task
- **THEN** Agent MUST使用 `task-manager` 并报告实际 operation、Task ID、status 和 effects
- **AND** 后续 Environment、Development、Review、Verification、Git、Finish、Board 与 Retrospective MUST继续由各自专业能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或 Agent 提供已有 Task ID 并要求恢复或继续
- **THEN** `task-manager` MUST先 inspect canonical Task Record
- **AND** MUST只从 title、intent、scope、changes、status 和 result 恢复顶层事实，不得从 Task Record 推断运行环境、数据库结构或专业阶段状态

#### Scenario: 人先在 Buildr Web 创建 Task
- **WHEN** 用户在 Buildr Web 创建 active Task，随后要求 Agent 按该 Task ID 继续
- **THEN** `task-manager` MUST inspect 同一 canonical logical Task Record 并核对 intent/scope
- **AND** MUST NOT重新 create、把 Buildr Web 记录视为低权威副本或要求用户重复输入顶层事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出修复、实现、重构、文档、测试、纯讨论或只读探索
- **THEN** `task-manager` MUST NOT仅因出现“任务”而抢占入口
- **AND** Agent MUST先按现有语义入口判断是否已经形成正式持久交付 Task

#### Scenario: Skill 返回存储细节
- **WHEN** Task action 成功或 blocked
- **THEN** `task-manager` MUST只报告 Application 的领域结果、digest、effects、diagnostic 和 nextActions
- **AND** MUST NOT要求用户编辑 SQLite、运行 SQL、修改 migration ledger 或处理 database path

### Requirement: Buildr Web、人、Agent 与产品必须分担语义和确定性逻辑
通过 Agent 工作时，Agent MUST 负责理解用户意图、判断是否形成正式 Task、形成 title/intent 与选择专业能力；人也 MAY 在 Buildr Web 中直接表达 Task 顶层事实。Task Record Application MUST 对所有客户端负责 schema、默认值、引用解析、字段变更、状态转换、系统时间、陈旧页面拒绝和文件 effects。Skill MUST NOT 要求 Agent 手写 YAML、持久 revision 协议或任意 next state。

#### Scenario: 创建与更新参数
- **WHEN** Agent 已确认要创建或修改 Task 顶层事实
- **THEN** Agent MUST 只提供命令要求的明确业务参数
- **AND** 产品 MUST 生成其余系统字段并拒绝非法组合

#### Scenario: 人通过 Buildr Web 管理 Task
- **WHEN** 人在 Buildr Web 创建、编辑、完成或放弃 Task
- **THEN** 页面 MUST 收集明确业务字段与终态确认，并调用同一 Application action
- **AND** MUST NOT 依赖 Agent 临场生成 YAML、校验引用、计算状态迁移或执行 filesystem 写入

#### Scenario: 专业模块返回事实
- **WHEN** Environment、Development、Review、Verification、Git、Finish、Board 或 Retrospective provider 返回结果
- **THEN** `task-manager` MUST NOT 将专业 result、path、revision 或运行状态复制到 Task Record
- **AND** 只有 title、intent、scope、Change reference 或最终 summary 真正变化时才调用相应 Task Record action

### Requirement: Formal Finish 成功后的 Buildr Web 自举 activation 失败不得改写研发与交付事实
Workspace专属self-bootstrap activation MUST位于Formal Finish成功之后。成功 MUST证明retained checkout的显式`projects/product/buildr`绑定本次delivered retained checkout、使用Environment retained Node且最终Workspace Doctor ready；Buildr Web安装失败、显式开发入口identity不一致或最终Doctor失败 MUST明确报告“主任务已交付、自举Workspace激活未完成”、失败动作与恢复事实，并 MUST NOT改写Finish Result、Candidate、Verification、Review、decision、handoff、Task Record或Environment cleanup。Self-bootstrap MUST NOT安装、删除、覆盖或验证PATH默认development CLI。

#### Scenario: CLI activation失败
- **WHEN** Formal Finish已complete且post-Finish显式开发入口identity验证或入口启动失败
- **THEN** Finish Result MUST保持complete且Environment MUST保持cleaned
- **AND** Agent MUST返回精确失败与恢复入口，不得回退PATH默认`buildr`、重跑Formal Verification、生成Candidate或重新执行Finish

#### Scenario: Buildr Web activation失败
- **WHEN** Formal Finish已complete且development Buildr Web安装失败
- **THEN** Agent MUST保留主任务已交付事实并报告自举activation未完成
- **AND** MUST NOT触碰稳定版Buildr Web、PATH默认CLI或修改共享历史

#### Scenario: 默认CLI与最终Doctor共同通过
- **WHEN** Formal Finish已complete且所有适用post-Finish动作成功
- **THEN** self-bootstrap activation MUST仅在retained `projects/product/buildr`可证明绑定delivered retained checkout、使用Environment retained Node且通过该入口运行的最终指定Agent Doctor ready时成功
- **AND** Agent MUST NOT以PATH默认`buildr`、源码文件存在、`command -v`命中同名命令或`--help`可启动替代该证明

### Requirement: 日常正式任务引导必须按阶段装配上下文
Buildr 内置任务 Skills MUST 引导 Agent 只在当前动作成为 next executable action 时读取该动作所需的 Skill、capability contract、selected provider 与直接 authority，并 MUST 将后续阶段的专业上下文延后到对应动作开始前。该引导 MUST NOT允许跳过已触发 Skill、required Rule、provider contract、授权或 result evidence。

#### Scenario: Triage 正在选择任务路径
- **WHEN** Agent 正在判断语义治理、执行形态、repository set 与下一 provider action
- **THEN** `task-triage` MUST只要求读取当前分支决策和立即执行动作所需的 binding
- **AND** MUST不要求在 proposal 前预先读取 Verification、Completion、Finish 等尚未到达阶段的完整 provider 指引

#### Scenario: 已具备进入 proposal 的事实
- **WHEN** 用户已授权实现，Task、Environment 与 Development begin 所需事实已经完整
- **THEN** guidance MUST引导 Agent 进入 proposal 或当前首个研发动作
- **AND** MUST不因收集非当前阶段信息、预读下游 Skills 或建立额外进度 authority而延迟该动作

#### Scenario: 首次修改前建立 source map
- **WHEN** Agent 准备修改 proposal、Skill、代码、测试或当前知识
- **THEN** guidance MUST要求从直接相关的 canonical specs、current knowledge、实现、测试与 registry 建立一次有界 authority source map
- **AND** 后续 MUST只在 scope、authority 或相关事实变化时增量刷新，不得把该 map 写成新的产品 authority或反复全量扫描

### Requirement: 验证范围引导必须保持计划预览与正式 evidence 分离
Buildr 任务 Skills MUST 在 Project 已提供 plan-only 或 dry-run 能力时，引导 Agent先消费该计划以判断 affected 范围、成本与补充风险，再选择必要的反馈和正式 capability；计划预览 MUST NOT作为 Verification evidence、Result fact或跳过 required capability 的依据。Project 未提供计划入口时，guidance MUST允许 Agent依据变更路径、declaration 与风险作出有证据的范围判断，不得因此阻塞。

#### Scenario: Project 提供验证计划预览
- **WHEN** Project registry 或现有命令提供不会执行测试的 affected plan
- **THEN** Agent MUST在追加 broad transient verification 前先读取该计划
- **AND** MUST结合计划覆盖与任务风险决定是否需要额外反馈，避免仅凭习惯重复整套测试

#### Scenario: 进入正式 Verification
- **WHEN** stable Content Target 已形成且 Development policy 要求正式 capabilities
- **THEN** Task Verification MUST实际执行或复用符合 invocation 语义的 required capabilities，并由 Application维护 current Result
- **AND** 先前 plan preview、CLI 输出或 Agent 推理 MUST不替代该 execution 与 repository authority

#### Scenario: Project 没有计划预览能力
- **WHEN** Project 只声明可执行 verification capability而没有 plan-only 或 dry-run 入口
- **THEN** Agent MUST基于实际变更、declaration applicability 与已识别风险选择范围
- **AND** guidance MUST不要求创建 planner、猜测命令或把缺少 preview 记录为 coverage gap

### Requirement: 日常任务效率指标必须保持非门禁
Buildr 内置任务 Skills MUST将 proposal 启动耗时、重复 Skill/authority 读取、重复命令、实现到 handoff 耗时与 verification wall-clock 仅作为 Task Retrospective 的跟踪、评估和优化参考。指标 MUST NOT进入专业 Result、Task Development gate、Task status、Candidate identity或自动 skip/advance 决策。

#### Scenario: 复盘发现任务耗时偏高
- **WHEN** Task Retrospective 使用已保存时点、execution timing或会话事实评估日常任务效率
- **THEN** Agent MAY据此提出 Skill guidance、工具或测试范围优化
- **AND** MUST不回写既有 Verification/Review Result、不改变 Task 完成事实，也不得把目标耗时解释为 pass/fail threshold

#### Scenario: 当前任务超过参考目标
- **WHEN** 某阶段实际耗时超过团队参考值但全部当前 authority 与 required action仍合法
- **THEN** workflow MUST继续依据专业事实和用户授权推进或阻塞
- **AND** MUST不因指标单独创建失败结果、跳过验证、降低审查范围或自动终止任务

### Requirement: 日常任务边界检查必须动作就近且保持 Agent 判断
Buildr 内置任务 Skills MUST 在 Agent 即将写 Change checklist、调用 OpenSpec converge、选择 focused regression 或决定 exact Verification invocation 重执行时提供动作就近的最小检查。该 guidance MUST NOT建立新的状态、关键词门禁、自动 root 选择或基于效率指标的自动推进逻辑。

#### Scenario: Agent 写入 Change checklist
- **WHEN** Agent 创建或修订 `tasks.md`
- **THEN** guidance MUST要求立即逐项确认 checkbox 能否在 Change archive 前完成
- **AND** MUST不要求预读 Verification、Candidate、Completion、Finish 或 cleanup 的完整下游流程来填充 checklist

#### Scenario: identity 输入已经变化
- **WHEN** Content Target、verification declaration、capability set 或其他 invocation identity 输入已经变化
- **THEN** Task Verification guidance MUST把后续执行视为新 identity 的首次执行
- **AND** Agent MUST不重复播报“未传 `--retry`”；只有准备重执行 exact identity 或解释复用结果时才说明显式 retry 语义

#### Scenario: 团队提供窄任务耗时参考
- **WHEN** 用户或团队为一类任务提供耗时参考区间
- **THEN** Retrospective guidance MAY将其作为当前复杂度下的跟踪、评估和优化背景
- **AND** MUST不把该数值固化为通用产品阈值、Result 字段、gate 或自动缩减验证范围的依据

### Requirement: Formal Task 启动必须优先使用 compact entry surface
Buildr内置task-triage与task-development guidance MUST在正式Task创建或恢复后优先读取Task Entry Snapshot，并只加载其current next action所指向的Skill、contract与provider。Agent MUST不把完整capability graph或下游lifecycle Skill列表当作启动依赖表。

#### Scenario: 创建 active Task 后启动
- **WHEN** Agent刚创建或恢复active formal Task
- **THEN** Agent MUST立即通过Snapshot确定Environment前置并准备或恢复Environment
- **AND** MUST不为了未来阶段预读Review、Verification或Finish provider

#### Scenario: next action 改变
- **WHEN** 一次正式动作使Snapshot的typed next发生变化
- **THEN** Agent MUST按新next加载对应action-local contract/provider
- **AND** 之前未成为next的专业能力 MUST不因完整lifecycle预想而提前加载

### Requirement: workflow guidance 必须保留用户调整边界
Buildr guidance MUST把Snapshot `required`解释为不可安全绕过的authority前置，把`recommended`解释为可由用户根据实际情况调整的默认路径。guidance MUST不把wall-clock参考目标、调用次数或recommendation编码为gate、自动推进或成功条件。

#### Scenario: 用户选择合法替代动作
- **WHEN** 用户基于当前事实调整recommended顺序、验证范围或专业provider
- **THEN** Agent MUST通过对应owner contract核验并执行该选择
- **AND** MUST不要求修改Snapshot、伪造next或绕过既有fail-closed authority

### Requirement: 正式收尾前必须轻量确认贡献与主工作区对齐

Task Finish Skill MUST 在调用产品 `task finish run` 之前，向用户或当前事实确认两件事：任务分支上的任务贡献已经提交；本机主工作区（retained Workspace）已经对齐本次交付的目标远端。该提醒 MUST NOT 替代产品入口一次聚合 Environment / Development / 交付缺口；Skill MUST 仍直接启动 canonical `task finish run`，并在返回 `task_finish.entry_gaps` 时按三个模块完整转述。

#### Scenario: 收尾前发现贡献未提交或主工作区落后

- **WHEN** 用户要求正式收尾，且任务分支仍有未提交贡献，或本机主工作区落后目标远端
- **THEN** Skill MUST 先说明这两项风险，并在用户确认处理或明确继续之前停止调用产品收尾
- **AND** MUST NOT 把该提醒实现为新的 `task_finish.entry_gaps` 缺口码

#### Scenario: 已对齐后仍走产品聚合入口

- **WHEN** 贡献已提交且主工作区已对齐目标远端，用户要求正式收尾
- **THEN** Skill MUST 直接调用 canonical `task finish run`
- **AND** MUST NOT 在调用产品前自行链式做 Environment → handoff → target/remote 的 fail-fast

### Requirement: OpenSpec 变更必须按可绑定顺序接入任务

当正式 Task 需要 OpenSpec 变更时，Buildr OpenSpec 侧栏 MUST 要求固定顺序：先创建变更脚手架，再把该变更绑定到 Task Record，再调用 Task Development `begin`（disposition 覆盖任务上的全部变更），最后才写入 proposal/design/specs/tasks。侧栏 MUST NOT 要求在变更尚未绑定到任务时，为即将绑定的变更提前 `begin`。

#### Scenario: 新建带变更的规划

- **WHEN** active Task 已有 ready Environment，即将创建 OpenSpec 变更并写入规划文档
- **THEN** Agent MUST 先 `openspec new change` 形成可解析脚手架，再 `task update --add-change`，再 Development `begin`，然后才写 artifacts
- **AND** MUST NOT 在脚手架不存在时调用 `add-change`

#### Scenario: 禁止先 begin 再绑定变更

- **WHEN** Task Record 尚无该变更引用，Agent 即将写入该变更的 proposal 或 design
- **THEN** 侧栏 MUST 阻止先对空变更列表 `begin`、写文档后再 `add-change`
- **AND** 若任务上下文因事后绑定变更而过期，Agent MUST 重新 `begin` 或 `planning`，不得沿用过期研发回执

### Requirement: Formal Verification 交接预检必须避免白跑且不干扰开发反馈
Buildr Task Development workflow MUST在进入Formal Verification前消费response-only readiness：明确Development-owned blocker MUST先处理；`unknown` MUST由selected current knowledge provider对同一current tree执行只读`inspect`。Provider返回`aligned|not-applicable`后，Agent MUST在该tree与Content Target未变化时直接进入现有Task Verification；`unresolved` MUST停止。该编排 MUST NOT修改通用`verification run`、开发期focused/affected测试、Task外transient verification或Candidate CI。

#### Scenario: 开发期测试不经过交接预检
- **WHEN** Agent在Content Target稳定前运行focused、affected、unit、integration或其他开发反馈
- **THEN** workflow MUST直接使用Project已有测试入口且不读取或写入Formal Verification readiness
- **AND** MUST不因Change pending、knowledge未知或policy缺失阻塞这些反馈或增加额外测试步骤

#### Scenario: 明确pending Change避免昂贵验证白跑
- **WHEN** Task Entry看到关联Change仍pending或stable Content Target/policy并非current
- **THEN** typed next MUST指向对应内容收敛/observe/policy动作而不是推荐Task Verification
- **AND** Agent MUST先稳定最终delivery content，再为新target形成正式验证evidence

#### Scenario: current knowledge瞬时确认后进入正式验证
- **WHEN** readiness为`unknown`且current knowledge `inspect`对同一tree返回`aligned`或`not-applicable`
- **THEN** Agent MUST将该次交接汇总为`ready`并直接调用selected Task Verification provider
- **AND** MUST不要求把inspect Result或ready摘要写入Development、Verification、Task Record或新sidecar

#### Scenario: current knowledge存在未解决项
- **WHEN** current knowledge `inspect`返回`unresolved`或tree identity与当前候选不匹配
- **THEN** Agent MUST停止Formal Verification并先由current knowledge owner完成reconcile或处理最小冲突
- **AND** 任何修订delivery content的处理 MUST使旧Content Target/verification evidence失效并重新观察

#### Scenario: 合法替代与非Task验证保持可用
- **WHEN** 用户基于已知current事实调整recommended顺序，或调用不属于正式Task交接的transient verification
- **THEN** workflow MUST按实际owner contract判断且不得把readiness recommendation升级为通用executor硬门禁
- **AND** code-only、Workspace-only、空Change与明确not-applicable场景 MUST继续通过其既有合法路径
