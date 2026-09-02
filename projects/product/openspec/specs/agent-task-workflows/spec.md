# Agent Task Workflows

## Purpose

定义 Buildr 内置场景化 Skills、Agent 任务协作、OpenSpec/Git/worktree/finish 工作流和分层验证契约。
## Requirements

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
Buildr task 和 OpenSpec Skills MUST 在改变 task state 前，以及已报告状态发生实质变化时，明确 workflow selection、实际工作位置、repository set 和当前 OpenSpec change status。

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

#### Scenario: 创建或复用Worktree前说明位置
- **WHEN** Agent决定创建或复用独立Worktree
- **THEN** Agent MUST在task edits前说明实际Workspace root、task id、worktree root、任务分支和repository set
- **AND** 不需要隔离时 MUST允许直接使用已确认Workspace

#### Scenario: Worktree lifecycle remains a Skill concern
- **WHEN** Buildr 打包 task worktree guidance
- **THEN** placement、repository selection、disclosure、reuse、retention 和 cleanup procedures MUST 保留在 task Skills 中
- **AND** required Core Rule MUST NOT 复制Worktree操作手册

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

### Requirement: squash 发布候选以 tree identity 幂等衔接回 dev
Buildr Product Project的发布引导 MUST先把通过完整Candidate的current release tree经唯一受保护release→main PR以当前发布策略收敛到`main`；对于发生main reconciliation的release，PR MUST使用merge commit并记录main与release的父提交关系，且要求tree完全一致。正式Publication成功后，再以current frozen selection和remote Git facts核验全部发布内容的dev provenance。两次动作 MUST分别核验identity和授权，且post-publication reconciliation MUST只读、允许`dev`保留release冻结后的新内容并保持线性历史。

#### Scenario: Finish 后先完成 self-bootstrap activation
- **WHEN** 一个被release选择的release/support Task已经通过Finish交付，且其Workspace contribution适用self-bootstrap
- **THEN** Agent MUST在冻结release Candidate与构造transaction correlation前取得matching runner的`passed`或带完整plan的`not-applicable`结果
- **AND** correlation MUST核验Task、Finish run、delivered ref、plan、status和result identity
- **AND** runner blocked、failed或identity不匹配 MUST只阻塞消费该Activation的后续动作，不得改写已成立Delivery

#### Scenario: reconciliation 后以 merge commit 收敛
- **WHEN** release→main PR已完成一次有证据的main reconciliation并按仓库保护策略使用merge commit
- **AND** `origin/main^{tree}`与current release tree identity相同
- **THEN** Agent MUST把main source记录为matching publication input，并保留两个父提交与reconciliation identity
- **AND** MUST NOT仅因最终main commit identity不同而重复Candidate或重建tarball

#### Scenario: squash 后候选 tree 完全一致
- **WHEN** release→main PR使用squash merge，且`origin/main^{tree}`与冻结release tree identity相同
- **THEN** Agent MUST NOT把tree相等单独记录为满足merge-commit reconciliation的publication input
- **AND** readiness MUST要求重新建立merge-commit父提交证据后才能继续publication或closeout

#### Scenario: squash 结果与已验证候选 tree 不一致
- **WHEN** release→main PR使用squash merge，且`origin/main^{tree}`不等于冻结release tree
- **THEN** Agent MUST停止publication和后续reconciliation并报告expected/actual identities及错误合入方式
- **AND** MUST NOT使用`ours`、force push、reset或历史重写掩盖内容差异

#### Scenario: self-bootstrap evidence 缺失或不匹配
- **WHEN** release correlation需要的self-bootstrap result缺失，或schema、Task、Finish run、delivered ref、plan、status与current facts不匹配
- **THEN** readiness MUST在Candidate/publication实际消费该事实前失败关闭并报告matching owner恢复方向
- **AND** MUST NOT从聊天、临时stdout、近似Git ancestry或caller摘要推断Activation完成

#### Scenario: main 已是 dev 祖先
- **WHEN** Publication成功后current frozen selection identity与transaction一致，且baseline和全部`sourceDevCommit`均由current remote `dev`包含
- **THEN** Agent MUST将post-publication reconciliation视为幂等完成并保留current dev HEAD
- **AND** MUST NOT要求published main成为dev祖先、重复Candidate或重新publish

#### Scenario: reconciliation 结果与已验证候选 tree 不一致
- **WHEN** `origin/main^{tree}`不等于current release tree，或main merge commit缺少current reconciliation的父提交关系
- **THEN** Agent MUST停止publication和后续reconciliation并报告expected/actual identities
- **AND** MUST NOT使用`ours`、force push、reset或历史重写掩盖内容差异

#### Scenario: 远端 ref 在衔接前发生竞争更新
- **WHEN** identity检查后、release→main merge或publication前相关remote ref不再指向已检查值，或reconciliation读取到不匹配的current selection/main/release/dev事实
- **THEN** Agent MUST停止尚未执行的mutation、重新fetch并从current release/context事实重新评估
- **AND** Publication已成立时 MUST保持公开事实并在dev来源无法安全证明时报告`published-but-dev-reconciliation-blocked`
- **AND** MUST NOT自动解决冲突、写入dev、force push、删除tag或unpublish

#### Scenario: 发布授权覆盖发布专用历史衔接
- **WHEN** 用户当前轮次明确授权准备或发布对应版本
- **THEN** Buildr Release Skill MAY执行本契约明确的release create/update/freeze、一次性main reconciliation、受保护merge-commit PR、只读dev provenance reconciliation和已授权closeout动作
- **AND** 每个remote mutation或远端release branch删除仍 MUST满足各自current identity与授权门禁
- **AND** 该授权 MUST NOT扩展为通用Git Ops、dev写入、force push、共享历史改写或自动冲突解决

### Requirement: task-triage 必须输出正交且有证据的任务决策
Buildr 的 `task-triage` Skill MUST先核对任务相关事实，再分别判断语义治理和执行形态；输出 MUST包含选择、repository set、实际工作位置选择、最小依据、未决冲突和next provider/action，并 MUST只在适用时追加OpenSpec或正式Task状态。任务进度 MUST由对话、Task Record、Parent/Child与各专业公开read model表达，不得创建第二份Board或Environment authority。

#### Scenario: 已有契约的实现任务
- **WHEN** canonical spec已定义目标行为且Agent已核对当前checkout、repository/ref、owned scope与副作用
- **THEN** triage MUST选择`code-only + implementation`并允许直接工作
- **AND** MUST NOT仅因缺少Environment、Plan、Receipt或projection而阻塞编辑、构建或有界测试

#### Scenario: 实现任务需要独立Git位置
- **WHEN** Agent根据并发、隔离或用户要求决定使用Worktree
- **THEN** triage MUST把明确Workspace、Task ID、branch、start point与repository selectors交给Worktree provider
- **AND** MUST使用provider返回的实际checkout path继续工作，不得把Worktree evidence冒充统一Environment ready

#### Scenario: 独立收敛当前事实文档
- **WHEN** canonical specs、当前实现与registries已能确认现行事实，任务只让current knowledge追上该事实且不进入代码、构建或测试
- **THEN** triage MUST选择`spec-maintenance + metadata-only`
- **AND** MUST使用selected current-knowledge provider的`maintain` operation，不得为既有事实补造OpenSpec Change

#### Scenario: Authority 或执行范围不明确
- **WHEN** 可信事实源冲突、授权边界不明、repository set或实际工作位置无法确认
- **THEN** triage MUST返回`blocked`或`unknown`并提出改变长期语义所需的最少问题
- **AND** MUST NOT预先写入Change、代码、Task或任何位置记录

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
Buildr的Task Triage与OpenSpec Skills MUST在写入前核对实际Git checkout、Project/Service registry、owned scope和适用Worktree evidence。workflow MUST NOT要求matching Environment Receipt、统一`ready`、runtime projection或session adoption作为普通proposal、实现、构建、Review、Verification或交付前置。

#### Scenario: Triage选择实际工作位置后在原对话继续
- **WHEN** triage完成实际工作位置选择，且Agent已证明当前checkout或matching Worktree、branch/ref、dirty与owned scope适合本任务
- **THEN** workflow MUST在该真实位置继续并重新观察当前文件和Git事实
- **AND** MUST NOT创建空Environment、Plan或共享根占用记录

#### Scenario: 明确工作目录绑定Worktree
- **WHEN** matching Worktree evidence证明Task、Workspace、repository selector、checkout、branch和registration
- **THEN** workflow MUST只在对应checkout及其明确Project/Service根内写入
- **AND** evidence漂移只阻止依赖该位置的动作，不得撤销已成立的Review、Verification或Delivery

#### Scenario: Execution binding 漂移
- **WHEN** checkout、registry、Worktree evidence或owned scope任一冲突
- **THEN** workflow MUST停止对应写入并保留现场
- **AND** MUST NOT从cwd、分支名、路径相似、旧Receipt或相同HEAD猜测归属

#### Scenario: 只有 retained manager content identity 改变
- **WHEN** 实际checkout、Worktree evidence与owned scope仍匹配，但retained Buildr源码版本已经前进
- **THEN** workflow MUST按当前动作重新观察实际工具入口，不得自动改写Task checkout
- **AND** MUST NOT仅因工具版本变化而失效Review、Verification或已成立Delivery

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
- **WHEN** 另一个Task Worktree中存在同名server或使用相同默认端口的进程
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
Agent MUST 将 Buildr 的确定性收敛结果视为产品事实：`passed`直接继续后续工作，`blocked`只处理最小语义冲突，`recovery-unprovable`只在当前实际工作位置仍保留恢复现场时使用OpenSpec Convergence Inspect或进行人工核对。Agent MUST NOT手工恢复Canonical Specs、刷新baseline、选择内部恢复stage、拼装旧门禁命令，或把Inspect变成正常验收门禁。

#### Scenario: 产品报告状态无法证明
- **WHEN** `buildr openspec converge`返回`recovery-unprovable`且当前Change工作根仍保留
- **THEN** Agent MAY调用`buildr openspec convergence inspect`读取逐文件事实，并停止其他正式文件写入
- **AND** MUST NOT删除恢复现场、刷新baseline或从旧stage继续

#### Scenario: 产品报告确定性通过
- **WHEN** `buildr openspec converge`返回`passed`与`archived`
- **THEN** Agent MUST直接消费该结果继续current knowledge检查、Content Target、Verification与后续Task流程
- **AND** MUST NOT再次运行Convergence Inspect或要求内部恢复记录进入Git交付

#### Scenario: Worktree已经清理
- **WHEN** Formal Task Finish已经成功且具体owner cleanup完成
- **THEN** Agent MUST使用Archived Change、Canonical Specs和Git交付事实回答正常历史问题
- **AND** MUST NOT要求恢复Worktree或把临时现场缺失报告为`recovery-unprovable`

#### Scenario: Inspect返回not-applicable
- **WHEN** Convergence Inspect报告事务尚未开始或Change已经终结
- **THEN** Agent MUST按reason code分别启动Converge或停止恢复检查
- **AND** MUST NOT把`not-applicable`解释为同步失败、归档失败或长期证据缺失

### Requirement: 正式执行必须先建立 Task Record
Buildr 的 `task-triage` MUST optional 依赖 `buildr.task-record/v1`，并 MUST 在已确认进入正式持久交付的分支、首次交付写入前调用 selected provider 创建或恢复 Task Record。路径已明确而无需重新 Triage 的正式执行也 MUST 遵守同一前置条件。

#### Scenario: Triage 选择已有契约实现
- **WHEN** task-triage 选择 implementation，且任务即将创建分支或修改交付物
- **THEN** Agent MUST 先创建或恢复 Task Record，再进入当前实际工作位置
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

### Requirement: task-review Skill 必须作为 Task Review 语义入口
Buildr MUST交付一个`task-review` workspace Skill，并通过selected`buildr.task-review/v2`支持`planning|completion`。Agent理解Task Intent、重新观察真实subject、动态选择工具和范围并形成结论；Application只负责inspect与CAS record。

#### Scenario: 用户要求审查正式 Task 的方案
- **WHEN** 用户或Agent目标需要Planning Review并能取得真实方案identity
- **THEN** Agent MUST路由到task-review并在完整结束后可选记录Planning Result

#### Scenario: 用户要求审查完成候选
- **WHEN** 用户要求审查真实完成结果
- **THEN** Agent MUST路由到同一Skill并自行从代码、Git、文件、部署或外部系统取得subject
- **AND** MUST不要求Candidate或Development Receipt

#### Scenario: Task 外普通审查
- **WHEN** 用户只要求一次性评论且没有正式Task
- **THEN** Agent MAY返回会话内意见
- **AND** MUST不创建Task Review Result或伪subject

### Requirement: Task Review 必须如实记录执行方式和覆盖边界
`task-review` MUST 如实选择 `self|independent-agent|human`，动态记录实际 reviewed、相关但 uncovered 的对象与原因、findings 和结论。Skill MUST NOT 把自审描述为独立审查，也 MUST NOT 把固定 OpenSpec artifacts、代码目录、测试命令或 review checklist 强制为所有 Task 的统一范围。

#### Scenario: 当前 Agent 自审
- **WHEN** 当前 Agent 自己执行 Review
- **THEN** Result method MUST 为 `self`，即使 Agent 使用工具或 Project evidence 也 MUST NOT 标为 independent-agent

#### Scenario: 只覆盖部分相关对象
- **WHEN** 某个相关对象因不可用、越权或明确范围限制没有被审阅
- **THEN** Skill MUST 把对象与真实原因写入 uncovered
- **AND** MUST NOT 以空列表或概括性 passed 隐藏覆盖缺口

### Requirement: Task Review 与 Task Retrospective 必须保持独立 authority
`task-review` MUST只拥有当前方案/完成目标的Review Result；`task-retrospective` MUST只拥有terminal Task的执行效率复盘current Result。两个Skill MUST NOT互写store、互相别名或形成lifecycle dependency。

#### Scenario: Task 同时存在 Review 与 Retrospective
- **WHEN** 同一正式Task已有Planning/Completion Review并在terminal后形成Retrospective
- **THEN** 两类Result MUST由各自provider独立维护
- **AND** Development与Finish MUST不读取、替换或等待Retrospective Result

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

### Requirement: OpenSpec apply、sync 和 archive 必须使用单一 convergence authority
Buildr MUST在apply入口执行apply-ready、strict validation与proposal/delta门禁，并 MUST让独立sync/archive consumers拒绝canonical写入或归档旁路，统一转交`buildr openspec converge`。Convergence target MUST是Agent已核对的实际Change工作根，可以是当前Workspace或matching Worktree，不要求Task Environment。

#### Scenario: Apply 开始实现
- **WHEN** `openspec-apply-change`准备进行首个实现编辑
- **THEN** prepend MUST验证apply-required artifacts complete、上游strict validation、semantic preflight与实际工作根
- **AND**门禁未通过时 MUST blocked，delta Requirement identity或工作根发生变化后 MUST重新检查

#### Scenario: 用户直接调用 sync
- **WHEN**用户要求`openspec-sync-specs`在Buildr Workspace写入canonical specs
- **THEN**prepend MUST拒绝上游agent-driven sync并转用`buildr openspec converge`
- **AND**sync consumer MUST NOT要求Environment、旧研发或旧Finish状态

#### Scenario: 用户直接调用 archive
- **WHEN**用户要求`openspec-archive-change`跳过未完成tasks、spec sync或convergence直接归档
- **THEN**prepend MUST拒绝确认绕过并转用`buildr openspec converge`
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
本条研发顺序仅约束显式采用的研发能力；收尾独立触发，MUST不消费研发交接或通过 task next 推荐，已有验证能力只保护自身动作。
Buildr 内置任务 Skills MUST 引导 Agent 只在当前动作成为 next executable action 时读取该动作所需的 Skill、capability contract、selected provider 与直接 authority，并 MUST 将后续阶段的专业上下文延后到对应动作开始前。该引导 MUST NOT允许跳过已触发 Skill、required Rule、provider contract、授权或 result evidence。

#### Scenario: Triage 正在选择任务路径
- **WHEN** Agent 正在判断语义治理、执行形态、repository set 与下一 provider action
- **THEN** `task-triage` MUST只要求读取当前分支决策和立即执行动作所需的 binding
- **AND** MUST不要求在 proposal 前预先读取 Verification、Completion 等尚未到达阶段的完整 provider 指引

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

### Requirement: workflow guidance 必须保留用户调整边界
Buildr guidance MUST把Snapshot `required`解释为不可安全绕过的authority前置，把`recommended`解释为可由用户根据实际情况调整的默认路径。guidance MUST不把wall-clock参考目标、调用次数或recommendation编码为gate、自动推进或成功条件。

#### Scenario: 用户选择合法替代动作
- **WHEN** 用户基于当前事实调整recommended顺序、验证范围或专业provider
- **THEN** Agent MUST通过对应owner contract核验并执行该选择
- **AND** MUST不要求修改Snapshot、伪造next或绕过既有fail-closed authority

### Requirement: 协作者更新必须与本地 self-bootstrap activation 排他路由
Buildr Agent workflow MUST 将已检出 canonical Workspace 因远端协作者提交而前进、但当前会话不存在与该更新匹配的 Formal Finish Result 的情况归类为普通 Workspace update。Agent MUST 使用 Git transition evidence 与当前 Doctor findings 路由既有 Buildr workspace sync，不得从 commit author、缺失本地 Task、HEAD、dirty tree 或 runtime drift 反推 self-bootstrap activation；`buildr-self-bootstrap-sync` MUST 只消费匹配的 Formal Finish Result/run。

#### Scenario: 协作者提交使 canonical tree 前进且本地没有匹配 Finish
- **WHEN** selected Git provider 已证明 canonical Workspace 的 checkout 因 `origin/dev` 上的提交而 `treeChanged: true`
- **AND** 当前会话不存在绑定该 Workspace、Task、run 与 delivered ref 的 matching Formal Finish Result
- **THEN** Agent MUST 将该状态归类为普通 Workspace update，并运行当前 Agent 的 post-transition Doctor
- **AND** 本地没有该协作者 Task MUST 被视为正常事实，不得作为异常、回滚或 self-bootstrap 依据
- **AND** Agent MUST NOT 启动 `buildr-self-bootstrap-sync`

#### Scenario: 协作者更新只造成当前 Agent managed projection stale
- **WHEN** 普通 Workspace update 后的 Doctor 仅将 actionable findings 归因于当前 Agent 的 managed workspace 或 runtime projection stale
- **THEN** Agent MUST 通过产品入口 Buildr Skill 路由 `buildr sync <agent> --target <workspace-root>`
- **AND** 用户已明确要求更新或同步 workspace 时 MUST 复用该授权，否则 MUST 按既有 workspace transition 契约取得一次同步确认
- **AND** sync 的最终 Doctor MUST 成为本次环境收敛证据

#### Scenario: Doctor 报告非 workspace sync blocker
- **WHEN** 普通 Workspace update 后的 Doctor 同时或单独报告不能由 workspace sync 正确处理的 CLI、Component、Command、Git 或其他 blocker
- **THEN** Agent MUST NOT 把一次 sync 宣称为完整修复
- **AND** Agent MUST 按对应 authority 的下一动作处理或停止并请求所需授权

#### Scenario: 当前会话存在 matching Formal Finish Result
- **WHEN** 当前会话持有绑定同一 canonical Workspace、Task、run、delivered ref 与retained Node的eligible Formal Finish Result
- **THEN** Buildr 自举 Workspace MAY 按 `buildr-self-bootstrap-sync` 的既有 contract 执行唯一 runner
- **AND** 普通 Workspace update 路由 MUST NOT替代、伪造或修改该 Finish Result

#### Scenario: workspace sync 不产生 Task 或 Finish authority
- **WHEN** Buildr Skill 为协作者更新执行 workspace sync
- **THEN** sync MUST 只收敛 workspace destination 与当前 Agent runtime 并返回最终 Doctor
- **AND** sync MUST NOT 创建 Task、Verification、Candidate、Finish Result 或 self-bootstrap evidence

### Requirement: Buildr 工作流门禁必须保持宽而薄
Buildr required Core MUST 将“宽而薄”定义为通用治理原则：只有继续推进会造成越权、错误对象写入、未经授权的外部或不可逆副作用、证据失真或完成误报时才关闭式失败；其他可恢复不确定性 MUST 如实报告事实、风险与下一步，并保留 Agent 的安全判断和推进空间。Product scope MUST要求新增硬门禁明确其保护的 authority 或结果不变量及放行造成的具体伤害，MUST NOT仅因缺少辅助 provenance、推荐流程、特定工具身份或统一工作方式而阻断原本可安全检查和继续的工作。

#### Scenario: 缺少辅助证明但结果边界仍可检查
- **WHEN** 工作流缺少推荐的 metadata 或 provenance hint，但 authority、目标、授权、副作用和真实完成条件仍能由当前事实检查
- **THEN** Buildr MUST提供诊断与 Agent 指引并允许安全推进
- **AND** MUST NOT把辅助证明升级为唯一硬门禁或要求 Agent 伪造证明

#### Scenario: 推进会造成错误写入或完成误报
- **WHEN** 当前 identity、authority、授权或结果 evidence 不完整，继续动作可能写入错误对象、产生未经授权副作用或把未验证结果报告为完成
- **THEN** Buildr MUST在对应副作用或完成声明前关闭式失败
- **AND** MUST报告实际 blocker 与可恢复入口，不得用“宽而薄”绕过真实边界

#### Scenario: Product 设计新增硬门禁
- **WHEN** Product Change 准备新增会阻断 Agent 工作流的硬门禁
- **THEN** proposal、design 或 specification MUST明确该门禁保护的 authority/结果不变量和放行的具体伤害
- **AND** 若只有自动化信心降低或工作方式不同、但存在可检查的安全继续路径，Product MUST选择 typed diagnostic、风险报告或 Agent guidance

### Requirement: Agent必须按release身份链消费专业provider
Agent MUST按release selection、Task/Environment/Development/Finish/self-bootstrap、Product Candidate、release readiness、protected transaction和Git convergence的owner顺序消费current结果。任一provider暂不可用只阻塞实际消费该事实的受管动作，不得阻止安全只读调查或通过另一个owner补造成功。

#### Scenario: P1实现Child并行开发
- **WHEN** 发布集合契约Child形成current Contribution Handoff
- **THEN** selection/provenance、Candidate/artifact与Task correlation三个Child MAY按Parent依赖图并行开发
- **AND** 每个Child MUST只修改自身owner范围、形成独立Candidate/evidence/handoff并禁止写入其他模块store

### Requirement: Buildr Release必须分离Readiness与Publication授权
`buildr-release` MUST默认先执行无副作用release readiness并向维护者展示全部findings、hosted deferred checks与next actions。只有维护者对当前frozen context明确授权publication后，Agent才可调用显式dispatch动作；Task完成、Candidate通过、历史发布授权或命令成功 MUST NOT替代本次publication授权。

#### Scenario: 维护者只要求准备或检查
- **WHEN** 维护者要求准备候选版、检查release或查看是否可发布但未明确授权publication
- **THEN** Agent MUST停在readiness Result并报告`effects: []`与hosted deferred checks
- **AND** MUST NOT dispatch workflow、请求`npm-production`approval或执行任何公共mutation

#### Scenario: 维护者明确授权publication
- **WHEN** 维护者在看到current frozen context后明确要求发布
- **THEN** Agent MUST把该授权交给唯一dispatch adapter并跟踪同一workflow run/attempt
- **AND** 不得另行创建tag、调用本机npm publish、dispatch第二workflow或生成第二tarball

#### Scenario: 发布attempt失败
- **WHEN** hosted transaction返回partial或failed evidence
- **THEN** Agent MUST先回读current attempt evidence并按`same-attempt`、`new-attempt`或`blocked-new-version`恢复分类解释已成立事实与下一步
- **AND** MUST NOT把Publication、Delivery、Activation、Environment Cleanup、Diagnostics或dev convergence互相改写

### Requirement: 候选版准备Task必须覆盖完整准备结果并与support交付分离
Buildr Release workflow MUST让唯一`release-<version>` Task表达维护者要求的完整发布生命周期，并将需要在Candidate前独立完成Development、Verification与Finish的版本材料、测试修复或owner修复建模为窄release support Task。协调Task MUST从selection持续保持active到Publication、post-publication dev provenance reconciliation与必需closeout完成；support Task terminal、Task Finish delivery、self-bootstrap activation、单次Candidate运行或readiness通过 MUST NOT单独使release Task completed。

#### Scenario: release材料需要在Candidate前交付
- **WHEN** package version、CHANGELOG、README、测试修复或release owner修复必须进入当前release集合
- **THEN** Agent MUST在基于current `dev`的独立support Task worktree完成该内容自己的Development、Verification、Finish与适用self-bootstrap
- **AND** delivered dev commit MUST再以`cherry-pick -x`选择到既有release集合；Agent MUST NOT直接在release worktree修复后把整条release历史合并回dev

#### Scenario: Candidate失败
- **WHEN** current release source的完整Candidate aggregate失败、缺失或与selection identity不匹配
- **THEN** release Task MUST保持active或blocked并报告失败run/source和同一Task恢复动作
- **AND** Agent MUST NOT调用release Task Finish/complete、把support delivery当成发布完成或创建第二个同version协调Task

#### Scenario: 候选版准备达到授权终点
- **WHEN** current release selection已冻结、完整Candidate aggregate通过、唯一tarball成立、release→main tree相等且dispatch-check readiness以`effects: []`通过
- **THEN** release workflow MUST保持同一协调Task active并报告等待current frozen context的publication授权
- **AND** Task状态、Candidate通过或历史授权 MUST NOT替代维护者本次明确授权

#### Scenario: publication和必需closeout完成
- **WHEN** protected transaction、正式readback、matching dev provenance reconciliation与全部必需local/intermediate closeout成立，且正式远端release ref已按默认保留策略核验
- **THEN** Agent MAY以no-change完成唯一`release-<version>`协调Task并报告完整发布与closeout事实
- **AND** 可选正式远端release ref删除未授权 MUST NOT要求第二协调Task

#### Scenario: 历史release Task被提前完成
- **WHEN** 旧版本在本Requirement生效前已有错误terminal协调Task
- **THEN** Agent MUST保留历史记录，不得改写SQLite、伪造Task reopening或把旧事实迁移为current
- **AND** 新的唯一Task约束 MUST适用于后续version，产品不得继续把resume、refresh或finalize作为正常恢复模型

### Requirement: Buildr Release Skill必须消费current lifecycle与closeout结果
`buildr-release` MUST按release lifecycle read model恢复同一version和Task，只在阶段需要时调用selection、Candidate、readiness、protected transaction、Git reconciliation与closeout owner。Skill MUST报告Publication与后续维护的正交状态，并 MUST NOT通过聊天摘要、Task标题或新建协调Task补造阶段。

#### Scenario: 等待授权后继续发布
- **WHEN** lifecycle为`awaiting-publication-authorization`且维护者明确授权matching context
- **THEN** Skill MUST以同一Task、generation与context dispatch protected transaction并继续跟踪后续阶段
- **AND** MUST NOT创建finalize Task、重新pack或沿用其他context授权

#### Scenario: main→dev或closeout受阻
- **WHEN** Publication已成立但dev provenance reconciliation或必需closeout返回blocked及recovery identity
- **THEN** Skill MUST保留同一active Task并从该identity恢复对应owner
- **AND** MUST NOT撤销Publication、写入dev、重跑已通过Candidate或创建resume Task

### Requirement: Buildr Release Skill必须消费统一发布编排结果
`buildr-release` MUST使用release orchestration runner推进merge后readiness、显式授权dispatch与Publication后closeout，同时继续把selection、transaction、Git convergence、Task Record、Worktree、Release Preparation和Doctor视为独立owner。Skill MUST在每次暂停或恢复时报告current action、context/timeline identity、已成立effects与唯一next action，不得用聊天摘要补造阶段或成功事实。

#### Scenario: readiness完成后请求唯一publication授权
- **WHEN** release→main已合并且orchestration `prepare-dispatch`返回current frozen context与`awaiting-publication-authorization`
- **THEN** Skill MUST向维护者展示该context digest和唯一publication授权决定并停止
- **AND** MUST NOT自动dispatch、把历史授权当作current授权或完成release Task

#### Scenario: 授权后dispatch发现context漂移
- **WHEN** 维护者授权的expected context digest与dispatch时重新读取的current context不一致
- **THEN** Skill MUST保持同一active release Task并返回readiness owner的blocked事实
- **AND** MUST NOT重建近似context、沿用旧授权或dispatch第二workflow

#### Scenario: Publication后恢复closeout
- **WHEN** Publication已成立但reconciliation、release resource closeout、Task completion、Environment cleanup或Doctor尚未完成
- **THEN** Skill MUST以同一orchestration identity只恢复尚未完成的owner步骤
- **AND** MUST NOT重跑Publication、撤销已成立effects或创建resume/finalize协调Task

### Requirement: Agent 必须从同一 Execution Record 恢复正式验证运行状态
Task Verification Skill与Agent workflow MUST把running progress、timed-out、cancelled与cleanup failure视为同一formal invocation的Execution Record事实。Agent MUST先inspect该record并消费其recovery；除非用户或当前owner明确选择`--retry`，不得因stdout丢失、等待超时或progress heartbeat陈旧启动替代run。

#### Scenario: formal Verification仍在运行
- **WHEN** matching invocation返回open record与current progress
- **THEN** Agent MUST报告当前capability、phase、最后heartbeat与record inspect入口并等待或继续只读inspect
- **AND** MUST不启动第二份capability execution

#### Scenario: capability timed out并已terminal
- **WHEN** record terminal summary显示timed-out且owned cleanup已完成
- **THEN** Agent MUST报告timeout capability、deadline、cleanup与显式retry入口
- **AND** MUST不把timeout描述为人工取消、unknown或自动重试成功

#### Scenario: cancellation或cleanup failure
- **WHEN** record显示cancelled或process cleanup failure
- **THEN** Agent MUST分别报告已取消事实或剩余owned process诊断，并按同一owner next action恢复
- **AND** MUST不按端口、进程名或Workspace文本自行清理进程

#### Scenario: progress存在但producer失联
- **WHEN** open record只有last progress且没有可验证terminal summary
- **THEN** Agent MUST把progress作为最后观察事实并使用existing recover/unknown流程
- **AND** MUST不从heartbeat时间推断terminal outcome或Verification Result

### Requirement: task-triage 必须在正式 Task 创建前收敛逐repository权威基线
当 `task-triage` 已确认进入正式持久交付且需要创建新 Task Record 时，Agent MUST 在调用 Task Record `create` 前解析完整 repository set，并为每个repository从Project/Service registry声明、当前branch/upstream或用户明确选择中取得唯一integration branch与remote。Agent MUST通过selected `buildr.git-operations/v1` provider将每个clean local integration branch收敛到本次fetch后的matching remote ref。只有全部仓库成功且适用的Workspace transition check已ready时才能创建Task；Task Record Application与Task Environment MUST NOT因此获得Git mutation authority。

#### Scenario: 不同repository使用不同integration branch
- **WHEN** Workspace与两个Service repository分别声明`dev`、`dev-pigs`与`dev-nm`及各自matching upstream
- **THEN** task-triage MUST逐repository核对并使用声明的local/remote refs执行fetch与适用rebase
- **AND** MUST不要求全部repository切换为`dev/origin/dev`

#### Scenario: 全部仓库已对齐或成功收敛
- **WHEN** 完整repository set均处于各自clean integration branch、upstream匹配权威remote ref，且fetch与适用rebase全部成功
- **THEN** task-triage MUST核对每个仓库的before/after branch、HEAD与实际effects
- **AND** MUST仅在适用的Workspace transition check ready后调用selected Task Record provider的`create`

#### Scenario: 本地未push commit与远端同时前进
- **WHEN** 仓库clean、本地integration branch含未push且未共享的commit，并且fetch后matching remote ref已前进
- **THEN** task-triage MUST将repository、`rebase` operation、local branch与matching remote ref明确交给selected Git Operations provider
- **AND** rebase成功后 MUST以新的local commit identity继续创建前门禁

#### Scenario: repository目标无法唯一解析
- **WHEN** registry、当前branch/upstream与用户选择无法形成唯一integration branch或remote/ref
- **THEN** task-triage MUST在该repository tree/history零写入状态阻塞Task创建并报告冲突来源
- **AND** MUST NOT猜测`dev`、自动checkout、stash、merge、force push或改变策略

#### Scenario: repository前置事实不满足
- **WHEN** 任一仓库不在已解析的符号integration branch、upstream不匹配、working tree/index dirty、存在进行中的Git operation，或remote/ref/共享风险无法证明
- **THEN** task-triage MUST在该仓库tree/history零写入状态阻塞Task创建并报告当前事实
- **AND** MUST NOT自动checkout、stash/autostash、merge、force push、选择其他分支或改变策略

#### Scenario: fetch或rebase失败
- **WHEN** 任一仓库fetch失败、remote/ref漂移、rebase失败或出现冲突
- **THEN** task-triage MUST不调用Task Record `create`，并报告全部仓库已经发生的effects与当前Git facts
- **AND** MUST NOT把多仓库部分成功报告为零变化或原子回滚

#### Scenario: clean pre-state的rebase冲突可恢复
- **WHEN** rebase在已证明clean的仓库发生冲突，且`rebase --abort`能恢复精确pre-rebase branch、HEAD与clean状态
- **THEN** selected Git Operation MUST报告conflict与recovered abort effects，Task创建仍 MUST blocked
- **AND** abort无法完成或恢复identity无法证明时 MUST保留并报告真实冲突现场

#### Scenario: Git Operations provider不可用
- **WHEN** 新正式Task创建分支无法解析ready `buildr.git-operations/v1` selected provider
- **THEN** task-triage MUST只阻塞Git基线收敛与Task Record create
- **AND** 纯讨论、只读探索、已有Task inspect和不依赖该动作的语义判断 MUST保持可用

### Requirement: 收尾技能检查不得固化过程文案
技能检查 MUST只执行通用结构、资源完整性与能力绑定约束，不要求旧流程关键字、最低字数或最低行数。

#### Scenario: 合法短技能
- **WHEN** 收尾技能内容满足通用格式及真实能力契约，但没有旧交接文案且少于旧字数下限
- **THEN** 静态检查 MUST允许通过，不要求补回已退役流程或无意义文字。

### Requirement: 默认收尾必须由技能指导智能体完成目标
默认收尾 MUST由智能体（Agent）依据用户目标和真实现场组合原生 Git、系统工具和现有 Buildr 接口；技能（Skill）MUST不要求候选、交接、五阶段运行、完整环境或对账结果。专项能力只在实际适用时触发。

#### Scenario: 已有任务
- **WHEN** 目标实际达成且用户授权范围明确
- **THEN** 智能体 MUST复用 `task complete` 保存结果，分别说明交付、验证、激活和资源残留；不得为完成记录补造交接。

#### Scenario: 没有任务或非代码成果
- **WHEN** 当前工作没有匹配任务或没有 Git 变化
- **THEN** 智能体 MUST直接完成适用交付及善后，不创建临时任务、不制造提交。

#### Scenario: 多仓库部分成功
- **WHEN** 一个仓库已交付，另一个仓库受阻
- **THEN** 智能体 MUST保留已成立结果，只处理剩余仓库，不重复推送成功项。

#### Scenario: 内部缺口
- **WHEN** 内部记录缺失但真实结果可观察
- **THEN** 智能体 MUST继续其他安全工作；仅在越权、错误对象、数据丢失或完成误报风险处停止相关动作。

### Requirement: 收尾必须独立于研发交接且按动作检查安全
收尾与交付在日常意图中 MAY表示同一结束目标；task-finish MUST根据真实目标处理成果、已有记录及安全清理，MUST不要求候选、交接或统一验证链。

#### Scenario: 四类组合
- **WHEN** 任务有无 Buildr 记录与有无 Git 管理形成四种组合
- **THEN** 仅调用实际适用能力，无记录不建记录，无 Git 不制造提交

#### Scenario: 已有检查仍适用
- **WHEN** 内容和检查相关条件未改变
- **THEN** MUST复用已有结果，不因收尾、生成新提交或提交编号改变而追加验证

#### Scenario: 具体检查缺口
- **WHEN** 存在相关内容变化或已知错误
- **THEN** MUST选择覆盖实际影响的最小充分已有检查；如确需补测，MUST在推进目标分支前执行并通过，再集成推送。不得按测试条数代替风险和执行成本判断，不创建统一门禁

#### Scenario: 部分成功
- **WHEN** 交付成立但登记或清理失败
- **THEN** 保留交付，继续安全必要动作，说明遗留

### Requirement: 正式研发必须由 Agent 直接组合专业能力
Buildr MUST让Agent依据Task目标和真实现场按需组合实际工作位置、OpenSpec、Current Knowledge、Task Review、Task Verification、Git与默认`task-finish` Skill，MUST NOT要求Environment Receipt、统一`ready|blocked`、Development Receipt、Task Candidate或Development Handoff。

#### Scenario: 带OpenSpec的实现任务
- **WHEN** active Task在已核对的当前Workspace或matching Worktree中创建、实施并收敛OpenSpec Change
- **THEN** Agent MUST可直接完成strict validation、semantic preflight、实现、Current Knowledge、convergence、Review、Verification与交付
- **AND** 全程 MUST不创建Environment许可或研发聚合事实

#### Scenario: 内容变化后重新检查
- **WHEN** Review或Verification后真实内容变化
- **THEN** Agent MUST根据实际subject/content identity判断并重做受影响检查
- **AND** MUST不创建统一stale状态、候选代次或Environment恢复动作

### Requirement: 内置场景化 Skills 必须围绕真实产物协作
Buildr内置Task与OpenSpec Skills MUST让Agent依据目标和真实现场按需选择Task Record、Environment、Current Knowledge、Review、Verification、Git与默认task-finish能力，不得路由已退役工作流。

#### Scenario: 普通实现达到可交付状态
- **WHEN** Agent已完成实现并取得任务所需的实际检查结果
- **THEN** Agent MUST可直接进入适用的审查、验证或交付动作
- **AND** MUST不创建Task Candidate、generation或Development Handoff

### Requirement: 内置任务 Skills 只依赖实际需要的能力契约
Task Triage MAY按需消费Task Record、Git Operations、Current Knowledge与Worktree；task-finish MAY调用Task Record、Git Operations、Worktree和具体资源owner。Capability graph MUST不包含普通OpenSpec、Review、Verification或Finish对Task Environment的依赖。

#### Scenario: 解析任务能力图
- **WHEN** package或runtime解析内置Task/OpenSpec Skills
- **THEN** 每个consumer MUST只因实际动作需要而声明依赖
- **AND** Worktree、Preview或其他可选专业能力缺失 MUST只影响对应动作，不得扩大为全局阻塞

### Requirement: OpenSpec workflow 必须直接组合当前认知维护
OpenSpec propose、update、apply、sync与archive contributions MUST按真实知识影响调用Current Knowledge provider；Current Knowledge结果直接交给Agent解释，不经研发聚合模块转发。

#### Scenario: Change实现改变当前知识
- **WHEN** Agent完成实现并准备收敛Change
- **THEN** Agent MUST按impact完成reconcile并重新观察交付内容
- **AND** OpenSpec convergence MUST不依赖任务研发回执

### Requirement: Task Review 与 Task Verification 必须保持独立
Review与Verification MUST分别记录真实审查和验证结果。Agent MUST依据目标、当前对象和风险判断是否调用及如何消费；Application MUST不生成统一推进决定。

#### Scenario: 内容在检查后变化
- **WHEN** 已审查或验证对象的真实identity发生变化
- **THEN** Agent MUST只重做受影响的检查
- **AND** MUST不建立统一stale状态或候选代次

### Requirement: OpenSpec Change checklist 必须止于 Change disposition
Buildr-owned OpenSpec contributions MUST只把归档前可完成的实现、知识收敛、验证反馈和convergence readiness写入`tasks.md`。交付、Task terminal transition与Environment cleanup由Agent在Change外按实际需要完成。

#### Scenario: Change checklist全部完成
- **WHEN** Change已满足convergence和archive条件
- **THEN** checklist MUST允许Change归档
- **AND** MUST不要求Task Candidate、Development Handoff或旧Finish运行

### Requirement: 受管内部入口必须只覆盖仍存在的专业能力
受管Skills调用Task Retrospective等仍存在的内部能力时 MUST使用matching retained controller。Runtime和文档 MUST不发现Task Development或Task Planning Identity route。

#### Scenario: 从Task worktree记录复盘
- **WHEN** Agent需要调用Task Retrospective内部入口
- **THEN** MUST使用Environment或Workspace解析的retained controller
- **AND** MUST不恢复任何已退役内部route
