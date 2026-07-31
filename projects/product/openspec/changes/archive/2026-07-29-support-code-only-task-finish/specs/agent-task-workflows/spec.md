## MODIFIED Requirements

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

## ADDED Requirements

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
