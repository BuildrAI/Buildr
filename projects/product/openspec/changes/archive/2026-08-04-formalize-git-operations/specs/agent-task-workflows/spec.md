## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: 内置场景化 Skills 引导产品工作流
Buildr MUST为依赖用户任务意图或工作流阶段的Buildr维护流程提供内置workspace Skills，并 MUST让Development与Finish保持相邻但独立的语义入口。

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

#### Scenario: Agent 需要完整任务收尾
- **WHEN** 用户对已有current Development handoff表达“收尾”或交付意图
- **THEN** Buildr MUST通过独立Task Finish Skill消费handoff并编排carrier、integration、retained与cleanup
- **AND** Finish MUST NOT编排OpenSpec、formal Verification、Review、Candidate generation或Development risk decision

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

### Requirement: Task Finish Skill 必须收窄为授权与单命令入口
Buildr MUST提供实现`buildr.task-finish/v1`的Task Finish Skill。Skill MUST解析用户交付意图、Task ID与execution context，先通过selected `buildr.task-development@1`确认current handoff，再披露carrier commit/integration/push/retained/cleanup授权与明确排除项。Receipt-bound Task MUST只调用一次canonical `buildr task finish run --task <task-id>`；normal path MUST NOT收敛Change、运行Review/Verification、生成Candidate、领取checkpoint、构造recovery JSON或从普通PATH选择runtime。

#### Scenario: 用户要求收尾
- **WHEN** 用户在canonical Task Environment中明确要求收尾且Development handoff current
- **THEN** Agent MUST披露Task、Candidate/handoff、目标分支、远端、常规副作用与未授权动作
- **AND** 没有待人工语义决定时 MUST只启动一次canonical Task Finish executor并消费最终结果

#### Scenario: Development handoff缺失
- **WHEN** Task Development Application报告missing、blocked或stale
- **THEN** Task Finish Skill MUST停止并路由`task-development`
- **AND** MUST NOT从Change、Git、Review或Verification facts自行拼装finish-ready Candidate

#### Scenario: Retained metadata-only 候选正式 handoff
- **WHEN** 用户在retained canonical Workspace对已完成且已验证的metadata-only任务要求收尾，且任务文件、目标分支和无关改动可精确区分
- **THEN** Task Finish Skill MAY将产品执行器标记不适用并披露精确任务文件/排除项/commit/push影响
- **AND** MUST只把明确 Git Operation 交给selected `buildr.git-operations/v1` provider

#### Scenario: Retained handoff 无法证明文件隔离
- **WHEN** metadata-only候选的任务文件范围、验证identity、目标ref或Git provider readiness无法证明
- **THEN** Task Finish Skill MUST blocked并报告缺失输入/provider reason
- **AND** MUST NOT使用`git add -A`、stash、回滚、虚假Change或手写Git回退绕过边界

#### Scenario: 产品返回完整结果
- **WHEN** current result为complete
- **THEN** Skill MUST直接报告handoff/carrier/delivery/retained/cleanup与效率证据
- **AND** MUST NOT为确认已完成动作再次调用inspect或同等验证命令

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

## REMOVED Requirements

### Requirement: Git Ops 默认保持线性任务历史
**Reason**: 该要求让 provider 在发现分叉时自动选择 rebase，混入了 integration workflow authority，并与 P0.6“不自动 rebase/merge、consumer 先选 operation”的硬边界冲突。

**Migration**: 使用新增“Git Operations 只执行 consumer 已选定的 Git Operation”要求；需要 rebase、merge 或 fast-forward 时由用户、Task Finish 或其他 consumer 明确选择，provider 只执行已授权动作并在语义冲突时停止。
