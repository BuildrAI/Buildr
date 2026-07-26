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

### Requirement: Task worktree 提供 change 单写入与验证证据边界
Buildr task triage 和 OpenSpec propose guidance MUST 在首次写入预计进入实现的 OpenSpec change artifacts 前完成执行位置判断，并在需要隔离开发时先创建或复用 canonical task environment；采用 environment 后必须保持唯一任务写入位置和显式 repository set。worktree lifecycle 与 Git integration providers MUST 只返回各自动作产生的 environment/candidate identity 和 transition evidence，由独立 task-verification capability 管理验证政策与 Candidate evidence。

#### Scenario: Task triage 独立判断执行形态和任务位置
- **WHEN** Agent 使用 task triage 判断修改、修复、实现或文档任务
- **THEN** task triage MUST 在语义路径之外独立判断执行形态为 implementation、metadata-only 或待确认
- **AND** it MUST 输出 task environment 创建、复用、不需要或待确认的任务位置结论、repository set 及依据

#### Scenario: 实现型 change 在 propose 前创建 task environment
- **WHEN** task triage 选择 change-flow，且任务预计包含代码修改、构建、测试或长期实现上下文
- **THEN** Agent MUST 在创建 OpenSpec change artifacts 前创建或复用 canonical task environment
- **AND** proposal、design、specs、tasks、实现和候选验证 MUST 只写入该 environment 的允许执行根

#### Scenario: 直接 propose 仍执行 task environment 门禁
- **WHEN** 用户意图直接命中 installed OpenSpec propose Skill
- **THEN** Buildr OpenSpec contribution MUST 在 `openspec new change` 或其他 artifact 写入前判断任务是否预计进入代码修改、构建、测试或长期开发上下文
- **AND** 需要隔离开发时 MUST 先创建或复用 canonical task environment 并在该 environment 中继续 propose
- **AND** 无法判断执行形态或 repository set 时 MUST 先澄清而不是提前创建 artifacts

#### Scenario: 纯元内容任务不创建 task environment
- **WHEN** 任务明确只维护 OpenSpec artifacts、规则、Skills、文档或模板，且不进入代码实现、构建或测试
- **THEN** Agent MAY 在当前 Workspace 直接维护这些元内容
- **AND** Agent MUST 在任务升级为实现前重新执行 task environment 决策

#### Scenario: code-only 实现仍使用 task environment
- **WHEN** task triage 选择 code-only 且任务预计进入代码修改、构建、测试或长期开发上下文
- **THEN** Agent MUST 创建或复用 canonical task environment
- **AND** Agent MUST NOT 因为不创建 OpenSpec change 而跳过任务隔离和 repository set 判断

#### Scenario: artifacts 任务升级为实现
- **WHEN** 未使用 task environment 的 OpenSpec 任务后来需要代码实现、构建或测试
- **THEN** Agent MUST 先创建或复用 task environment 并将 change artifacts 收敛到该唯一位置
- **AND** Agent MUST 清除原工作区的重复副本并确认原 Workspace checkout 没有该任务的开发改动后再继续

#### Scenario: 开发命令使用 environment context
- **WHEN** Agent 在 task environment 中执行 Buildr CLI、代码生成、构建、测试或启动 task-owned 本机进程
- **THEN** Agent MUST 使用 environment root 或目标成员 repository checkout 作为明确 workdir
- **AND** Buildr CLI target、checkout-local CLI source 和 task environment context MUST 相互匹配
- **AND** context mismatch MUST 在结果进入正式验证或收尾前 fail closed

#### Scenario: 最终候选 identity 交给验证 provider
- **WHEN** task environment 中的全部内容修改已经结束并准备验证最终候选
- **THEN** task-worktree provider MUST 提供当前 environment identity、repository set、各 checkout 的 clean/dirty 状态和可确认 tree/fingerprint identity 输入
- **AND** selected task-verification provider MUST 负责建立最终 multi-repository candidate identity、执行项目要求的验证并返回绑定该 environment 的 evidence

#### Scenario: Git 集成改变候选内容
- **WHEN** 任一 repository 的 rebase、冲突解决、merge、reset 或其他 Git integration 操作使集成后的内容 identity 不同于输入 candidate
- **THEN** selected Git provider MUST 返回该 repository 操作前后 identity 和 `treeChanged` evidence
- **AND** selected Git provider MUST NOT 执行 Candidate 验证或决定既有 evidence 是否可复用
- **AND** selected task-verification provider or its consumer MUST 根据当前 environment repository candidate set 决定 evidence 失效与重新验证

#### Scenario: Worktree provider 只报告 lifecycle transition
- **WHEN** task-worktree provider 创建、复用、检查、保留或清理 canonical task environment
- **THEN** it MUST 返回 lifecycle state、environment root、repository set、任务分支和由本次 checkout 操作产生的 transition evidence
- **AND** it MUST NOT 监控普通编辑、判断 Git integration 内容等价性或决定验证复用与重跑

#### Scenario: 上游 OpenSpec Skill 保持原文
- **WHEN** Buildr 为 OpenSpec propose 增加执行位置门禁
- **THEN** Buildr MUST 通过 Component-owned Skill contribution 组合该 guidance
- **AND** Buildr MUST NOT 修改外部 `openspec-propose` Skill 的上游正文

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

### Requirement: Task Finish 自动编排已验证任务收尾
Buildr MUST 提供实现 `buildr.task-finish/v1` 的 `task-finish` 默认 workspace Skill，将用户当前轮次明确的“收尾”意图作为受限的一次性授权，并通过绑定的 `buildr.task-verification/v2`、`buildr.task-worktree-lifecycle/v1` 和 `buildr.git-task-integration/v1` providers 自动完成可安全确定的剩余任务动作；Task Finish MUST NOT 固定所有任务均要求 Candidate。

#### Scenario: 收尾前置检查
- **WHEN** 用户在 canonical task worktree 中要求收尾
- **THEN** Agent MUST 解析当前 task/change、仓库边界、目标分支、远端、工作区改动、发布意图、已知验证 evidence 和三个 required providers
- **AND** Agent MUST 在 Git 写操作前披露 selected provider identities、实际验证/集成/清理策略、提交范围、目标分支、远端和清理范围
- **AND** 存在无关 dirty changes、多个无法消歧的 change/目标分支、required provider readiness 为 `blocked` 或不可信验证状态时，Agent MUST 在破坏性动作前停止

#### Scenario: 普通收尾要求 affected 保证
- **WHEN** Task Finish 提交非发布、未命中 Project 高风险政策的任务上下文
- **THEN** selected verification provider MUST 返回 `requiredAssurance: affected`
- **AND** Task Finish MUST 只在成功 evidence 的 level 匹配 affected、candidate identity 匹配且 evidence 可复用时继续

#### Scenario: 发布高风险或显式完整收尾要求 candidate 保证
- **WHEN** Task Finish 提交发布任务、Project 高风险任务或用户明确要求完整验证的上下文
- **THEN** selected verification provider MUST 返回 `requiredAssurance: candidate`
- **AND** Task Finish MUST 只在成功 Candidate evidence 完整、identity 匹配且可复用时继续

#### Scenario: 收尾复用可信 evidence
- **WHEN** 当前候选已有 selected verification provider 产生或核对的成功 evidence，且 level 满足 `requiredAssurance`、candidate identity 未改变
- **THEN** Task Finish MUST 复用该 evidence
- **AND** Task Finish MUST NOT 重复运行相同验证
- **AND** provider evidence inspection MUST NOT 被计作 verification execution

#### Scenario: 收尾补齐验证 evidence
- **WHEN** 所需 evidence 缺失、级别不足、不可读、不可复用或与当前候选 identity 不匹配
- **THEN** Task Finish MUST 调用 selected task-verification provider 对当前最终候选执行 `requiredAssurance` 对应的项目验证
- **AND** 新验证失败或仍不完整时 MUST 停止 integrate、push 和 cleanup

#### Scenario: Closeout metadata 改变 delivery tree
- **WHEN** delivery tree 与已验证 implementation identity 的差异完全来自可归因的 OpenSpec sync/archive、归档格式规范、Project 明确定义的 closeout-only artifacts，或符合 runtime projection-only 条件的 Buildr sync 投影与 receipt
- **THEN** Task Finish MUST 将 transition 标记为 `closeout-metadata-only`，保留原 evidence，并运行 closeout workflow 已要求的 focused checks
- **AND** Task Finish MUST NOT 调用 task-verification `execute`，最终报告 MUST 分别说明已验证 identity、delivery tree identity 和 closeout delta checks

#### Scenario: Buildr runtime projection-only delivery delta
- **WHEN** implementation source 已由可复用 evidence 覆盖，已集成保留 checkout 上的 `buildr sync` 只修改受管 runtime projection 与对应 receipt，且 `git diff`、component integrity 与 doctor 均证明没有其他 source 或生成资产变化
- **THEN** Task Finish MUST 将该 delta 作为 `closeout-metadata-only` 处理并复用原 verification evidence
- **AND** MUST 运行并记录 runtime/receipt focused checks、sync 来源、implementationCandidateIdentity 和 deliveryTreeIdentity

#### Scenario: 实现内容改变时重新验证同一所需保证
- **WHEN** provider integration、冲突解决、lockfile 或非 projection-only 的生成资产更新、其他步骤改变 implementation content，或差异无法完全证明属于 closeout-only scope
- **THEN** Task Finish MUST 将 transition 标记为 `implementation-changed`，使原 evidence 失效，并在集成前请求新的 `requiredAssurance`
- **AND** 普通任务 MUST 重跑 affected，发布、高风险或显式完整验证任务 MUST 重跑 candidate，新验证失败时 MUST 停止尚未执行的 integrate、push 和 cleanup

#### Scenario: 完成 OpenSpec 归档
- **WHEN** 当前任务包含 artifacts 和 tasks 均完成的 active OpenSpec change
- **THEN** Task Finish MUST 先通过 pre-sync guard，再执行 canonical sync，并在 post-sync guard 通过后归档 change
- **AND** Task Finish MUST 通过外部可用的 OpenSpec CLI/Skills 完成该步骤，不修改外部 `openspec-*` Skill 源
- **AND** OpenSpec strict、contract guard 和 `git diff --check` MUST 作为 closeout workflow checks 记录，不得计作 verification executor invocation

#### Scenario: 归档后规范 EOF 空白行
- **WHEN** OpenSpec archive 或 specs sync 后 `git diff --check` 仅报告本次修改的 OpenSpec Markdown 文件存在 `new blank line at EOF`
- **THEN** Task Finish MUST 将这些文件规范为恰好一个结尾换行
- **AND** Task Finish MUST 重新运行 `git diff --check` 和 OpenSpec strict validation

#### Scenario: 归档后存在其他格式问题
- **WHEN** `git diff --check` 报告非 EOF 空白行、非 OpenSpec 文件或无法确认来源的问题
- **THEN** Task Finish MUST 停止自动修复
- **AND** Agent MUST 报告问题并等待用户决定

#### Scenario: 收尾授权覆盖 provider 声明的常规动作
- **WHEN** 前置检查、所需验证和归档相关检查通过
- **THEN** 用户的“收尾” MUST 授权提交当前任务范围、调用已绑定 task-integration provider 完成其 contract 与执行前披露中声明的常规集成动作、推送已确认目标分支，以及删除已安全合入的本地 worktree 和本地任务分支
- **AND** Task Finish MUST 遵循 provider contracts，且 MUST NOT 复制或覆盖 verification、Git integration 或 worktree lifecycle provider 的内部 policy

#### Scenario: 默认 Git provider 保持现有集成策略
- **WHEN** `git-ops` 是已绑定的 `buildr.git-task-integration/v1` provider
- **THEN** 默认 task integration MUST 继续使用无语义冲突的必要 rebase 和 fast-forward-only 集成
- **AND** MUST NOT 因验证保证变化扩大 Git 授权

#### Scenario: 默认收尾授权的固定排除项
- **WHEN** 收尾需要 force push、删除远端任务分支、丢弃改动、改写共享分支历史或解决语义冲突
- **THEN** “收尾” MUST NOT 授权这些动作
- **AND** Agent MUST 停止并取得用户对具体动作的明确授权或决策

#### Scenario: Optional 资产审查 provider 缺失
- **WHEN** `buildr.task-asset-review/v1` optional dependency 未绑定
- **THEN** Task Finish MUST 跳过资产审查阶段并明确记录该降级
- **AND** 收尾的其他 required 阶段 MUST 继续执行

#### Scenario: 安全清理 task worktree
- **WHEN** 目标分支已包含任务提交、远端目标分支已推送且 task worktree 干净
- **THEN** Task Finish MUST 调用已绑定 worktree-lifecycle provider 确认 cleanup preconditions 和本机入口迁移要求
- **AND** Task Finish MUST 按 provider contract 清理并检查清理后的 worktree 列表和仓库状态

### Requirement: Task Finish 在相关资产变更中先完成收尾就绪检查
Buildr `task-finish` MUST 在将当前实现 tree 交给 selected task-verification provider 之前，对触及受管 Component、Skill、Command、lockfile、外部命令声明或 OpenSpec 升级信号的任务执行 closeout readiness checkpoint。checkpoint MUST 报告触发信号、实际检查、跳过理由和阻塞的下一步，且 MUST NOT 把该 workflow check 计作 task-verification provider 的 `execute` 或 Candidate executor invocation。

#### Scenario: 相关资产变更具有可收敛的本地依赖
- **WHEN** checkpoint 发现当前 Project 已由 lockfile 声明的 checkout-local dependency 与声明版本不一致，且 Project 既有环境准备入口允许在 canonical task environment 中执行依赖安装
- **THEN** Task Finish MUST 在 Candidate 前通过该 Project 的既有入口收敛本地依赖并重新核对版本
- **AND** 任何依赖安装失败 MUST 阻止 Candidate、archive、integrate、push 和 cleanup

#### Scenario: 外部 CLI 版本不匹配
- **WHEN** checkpoint 发现受管资产声明的外部 CLI 版本与当前可用 command 不匹配
- **THEN** Task Finish MUST 停止后续收尾并报告声明版本、实际版本和可执行修复路径
- **AND** “收尾” MUST NOT 隐式授权安装、升级或降级用户级或系统级外部 CLI

#### Scenario: 生成完整性或格式尚未收敛
- **WHEN** checkpoint 检测到相关受管资产的 Component integrity/receipt 不匹配，或 `git diff --check` 报告可归因于当前任务的格式问题
- **THEN** Task Finish MUST 在 Candidate 前完成允许的修复并重新执行对应检查
- **AND** 无法证明修复范围或重新检查失败时 MUST 停止后续收尾

#### Scenario: 普通任务没有相关资产信号
- **WHEN** 当前任务不触及受管资产、lockfile、外部命令声明或 OpenSpec 升级信号
- **THEN** Task Finish MUST 记录 checkpoint 未触发的理由
- **AND** MUST 继续遵循既有 requiredAssurance、OpenSpec、Git integration 和 worktree lifecycle 流程

### Requirement: Task Finish 在 OpenSpec archive 后检查空 active-change scaffold
Buildr `task-finish` MUST 在完成 active OpenSpec change archive 后，以当前 OpenSpec CLI 的 status 与 strict validation 检查 archive 结果；该检查属于 closeout workflow check，不得替代 canonical spec sync/post-sync contract guard 或 task-verification evidence。

#### Scenario: archive 后遗留本次 change 的空 scaffold
- **WHEN** archive 后当前 CLI 仍将本次 change 识别为 active，且逐层检查证明遗留目录及其子目录均为空
- **THEN** Task Finish MUST 只删除该已证明为空的 scaffold 并再次运行 OpenSpec strict validation
- **AND** 最终报告 MUST 记录残留路径、空目录证据和复查结果

#### Scenario: archive 后残留非空或无法归因的状态
- **WHEN** active change 残留非空内容、属于其他 change，或无法证明由本次 archive 产生
- **THEN** Task Finish MUST 停止自动清理并报告状态与下一步
- **AND** MUST NOT 用目录名、空的父目录假设或批量删除扩大清理范围

### Requirement: Task Finish 归档已手动同步的 OpenSpec change 时跳过重复 spec update
当 Task Finish 已在当前会话中通过 agent-driven 路径同步 active change 的 canonical specs，且 `post-sync` contract guard 返回 `ok: true` 时，Task Finish MUST 使用当前 OpenSpec CLI 的 `archive --skip-specs` 归档该 change。该选项只跳过重复 spec update，不得跳过 strict validation、archive 后状态检查或现有 closeout workflow checks。

#### Scenario: 已同步且 post-sync 通过的 change
- **WHEN** 当前会话已记录 canonical spec sync 和 `post-sync` guard 的成功结果
- **THEN** Task Finish MUST 使用 `openspec archive <change> --skip-specs --yes`
- **AND** MUST 记录 canonical specs 已同步、archive 未重复更新 specs 以及后续 strict validation 结果

#### Scenario: 缺少已同步证据或 post-sync 失败
- **WHEN** canonical sync 尚未完成、无法证明属于当前会话，或 `post-sync` guard 未通过
- **THEN** Task Finish MUST NOT 使用 `--skip-specs`
- **AND** MUST 停止或按既有默认 archive/sync 流程处理，不得以该选项绕过 guard

### Requirement: Task Finish 默认不推送远端任务分支
Buildr Task Finish MUST 将当前轮次“收尾”授权中的默认推送范围限制为包含已集成任务内容的目标分支。Task Finish 与兼容的 Git 任务集成 provider MUST NOT 因任务分支存在、已提交或已合入而自动创建或推送对应的远端任务分支。

#### Scenario: 普通收尾只推送目标分支
- **WHEN** 用户要求收尾，任务分支已经安全集成到已确认的目标分支，且用户没有明确要求远端任务分支
- **THEN** Agent MUST 只披露并推送目标分支
- **AND** MUST NOT 执行 `git push -u <remote> <task-branch>` 或其他会创建、更新远端任务分支的动作
- **AND** 最终收尾结果 MUST 说明目标分支推送结果与任务分支未推送状态

#### Scenario: 用户明确要求远端任务分支
- **WHEN** 用户在当前轮次明确要求为 PR、远程备份、交接或其他具体目的推送任务分支
- **THEN** Agent MAY 在执行前披露任务分支、远端、目的和待推送提交后推送该分支
- **AND** MUST 继续遵守 force push、远端删除和共享历史改写的既有授权边界

### Requirement: Task Finish 必须报告可信的完整验证 timing 证据
Buildr `task-finish` MUST 消费 selected task-verification provider 返回的 `requiredAssurance` 与匹配 evidence，并将验证状态和 timing 作为收尾 Result Evidence 的一部分。

#### Scenario: 所需验证成功
- **WHEN** `task-finish` 使用当前候选 identity、满足 requiredAssurance 的成功 evidence
- **THEN** `task-finish` MUST 核对 status、level、requiredAssurance、candidate identity 和 timing source
- **AND** 最终报告 MUST 说明受影响验证或完整候选验证、总耗时、最慢检查、失败项、跳过项和 evidence reference

#### Scenario: Buildr Product 提供 verifier summary
- **WHEN** 当前 Project 是 Buildr Product 且 verifier 输出 `buildr.verification-timing/v1` summary
- **THEN** `task-finish` MUST 使用产品专项 verifier 核对 summary status、run kind、source identity 和 candidate fingerprint
- **AND** 核对通过后 MUST 将 timing source 记录为 `verifier-reported`

#### Scenario: timing evidence 不可信
- **WHEN** evidence 缺失、不可读、已被其他 run 覆盖或 identity 无法匹配当前候选
- **THEN** `task-finish` MUST NOT 引用其他 run 的耗时或根据并行检查耗时推算整体 wall-clock
- **AND** 在仍可安全重跑时 MUST 请求 selected task-verification provider 生成满足 requiredAssurance 的可信 evidence，否则停止完整收尾

#### Scenario: 收尾消费后清理 transient evidence
- **WHEN** 最终 evidence 标记为 transient，摘要已捕获、集成与推送完成且没有后续 consumer
- **THEN** Task Finish MUST 请求 selected verification provider 清理该 evidence
- **AND** 最终报告 MUST 说明 cleanup status；清理失败时报告保留路径与原因，不回滚已完成交付

#### Scenario: evidence 级别低于所需保证
- **WHEN** 当前 evidence level 低于 `requiredAssurance`
- **THEN** Task Finish MUST NOT 将其表述为满足收尾门禁
- **AND** MUST 请求补齐验证或报告 incomplete

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

### Requirement: 内置任务资产审查与任务收尾保持分层
Buildr MUST 将持续观察、资格审查、候选分类、人工决定和去向交接交给 selected `buildr.task-asset-review/v2` provider；`task-finish` MUST 只在 cleanup 前触发 finalize 并等待 provider 结果。

#### Scenario: Task Finish 触发 finalize
- **WHEN** `task-finish` 已确认当前任务语义、候选 tree 和验证证据有效
- **THEN** `task-finish` MUST 调用 selected asset-review provider finalize
- **AND** `task-finish` MUST NOT 汇总观察信号、执行资格门禁或判断最终应沉淀什么

#### Scenario: 没有 observation
- **WHEN** provider finalize 返回 `no-observation` 或 `discarded`
- **THEN** `task-finish` MUST 继续正常收尾

#### Scenario: 等待人工决定
- **WHEN** provider finalize 返回 `awaiting-human`
- **THEN** `task-finish` MUST 在 worktree cleanup 前等待用户 accept 或 reject
- **AND** accept MUST 只创建后续新任务 handoff，不得改变原任务范围

#### Scenario: Optional provider 不可用
- **WHEN** v2 provider 未绑定、已卸载或执行失败
- **THEN** `task-finish` MUST 报告降级并继续既有收尾
- **AND** `task-finish` MUST NOT 自行实现备用资产审查

#### Scenario: 当前能力不依赖任务 Hook
- **WHEN** Buildr 执行任务资产观察和审查
- **THEN** Buildr MUST 使用 Agent 已可见节点和 Skill 内部资源
- **AND** Buildr MUST NOT 要求 runtime Hook、daemon、watcher、事件总线或完整轨迹存储

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

### Requirement: Task Finish 必须把当前认知检查作为验证前门禁
Task Finish MUST 在把 implementation tree 交给 selected task-verification provider 前，调用 selected `buildr.current-knowledge-maintenance/v1` provider 执行 inspect。只有 assess impacts 已处理、Brief 与权威 artifacts 一致、current knowledge 对应最终 tree 且 terminology 没有 unresolved conflict 时，Task Finish 才能继续所需 assurance、spec sync、archive 和 integration。

#### Scenario: Inspect 确认已对齐且不修改内容
- **WHEN** provider 返回 aligned result 且 source identities 匹配当前 tree
- **THEN** Task Finish MUST 记录 evidence 并继续既有 requiredAssurance 流程
- **AND** inspection MUST NOT 被计作 task-verification provider execution

#### Scenario: Fallback reconcile 修改 delivery content
- **WHEN** inspect 发现可在当前授权内修复的问题并由 provider reconcile 修改 Brief、knowledge、spec 或其他 delivery content
- **THEN** Task Finish MUST 将 transition 归类为 `implementation-changed`
- **AND** 任何旧 verification evidence MUST 失效
- **AND** Task Finish MUST 对更新后的最终 tree 重新执行所需 assurance

#### Scenario: Inspect 返回 unresolved
- **WHEN** provider 返回未处理 impact、事实冲突、Brief 漂移或 unresolved terminology
- **THEN** Task Finish MUST 停止 verification、sync、archive、Git integration、push 和 cleanup
- **AND** 最终状态 MUST 报告实际冲突、受影响资产和可执行下一步

#### Scenario: Archive 后发现知识问题
- **WHEN** archive 后检查发现历史 Change 或 current knowledge 存在需要修订的问题
- **THEN** Agent MUST 保持 archive 不变并创建或路由后续任务处理当前事实
- **AND** MUST NOT 在 archive 阶段回写已归档 Change 或隐式修改 knowledge

### Requirement: Task Finish 必须在最终保证前收敛 delivery tree
Task Finish MUST 在调用 selected task-verification provider 执行最终 required assurance 前完成所有当前可预见的 implementation 与 delivery tree 收敛动作，并 MUST 将之后允许发生的动作限制为有独立证据的 closeout-only transition。Delivery convergence MUST 包含适用的 current knowledge 收敛、受管资产完整性、OpenSpec sync compatibility、canonical spec sync、候选提交、目标分支 fetch/rebase 和 tree transition runtime 对齐；不得在明知这些动作尚未完成时把一次 Candidate 表述为最终验证。

#### Scenario: 高风险 Product task 准备最终 Candidate
- **WHEN** Task Finish 为 Buildr Product 解析出 `requiredAssurance: candidate`
- **THEN** Task Finish MUST 先完成适用的 OpenSpec sync、候选提交、目标分支 fetch/rebase、doctor 和 runtime sync
- **AND** MUST 在上述动作收敛且 implementation identity 冻结后才执行最终 Candidate

#### Scenario: 普通任务只要求 affected 保证
- **WHEN** verification provider 返回 `requiredAssurance: affected`
- **THEN** Task Finish MUST 使用同一 delivery convergence 顺序准备最终 implementation identity
- **AND** MUST NOT 因本 Requirement 将普通收尾机械升级为 Candidate

#### Scenario: 最终保证后只发生 closeout-only transition
- **WHEN** 最终 required assurance 已成功且后续只执行最终验证任务 checkbox、已预演的 archive、归档格式收敛、候选提交 amend、目标分支 fast-forward 或 push
- **THEN** Task Finish MUST 为每项动作记录来源、精确 diff、tree-equivalence 与 focused checks
- **AND** 任一无法证明为 closeout-only 的变化 MUST 使旧 evidence 失效

### Requirement: Task Finish 必须在最终保证前预演 OpenSpec archive compatibility
当已完成 active Change 包含 delta specs 时，Task Finish MUST 在真实 canonical sync 和最终 required assurance 前，通过当前 OpenSpec CLI 在隔离 planning copy 中执行 archive rehearsal，以检查场景保全、delta merge、新 capability 建立和 archive compatibility。Rehearsal MUST 是可清理的 workflow check，不得修改真实 Change、canonical specs 或外部 OpenSpec Skill，也不得替代 Buildr pre-sync/post-sync guard。

#### Scenario: Rehearsal 发现场景 identity 风险
- **WHEN** OpenSpec archive rehearsal 报告 MODIFIED Requirement 会遗漏或重命名既有 Scenario
- **THEN** Task Finish MUST 停止真实 sync 和最终 required assurance
- **AND** 修正 delta 后 MUST 重新运行 strict validation、baseline/proposal check 和 pre-sync

#### Scenario: Rehearsal 成功
- **WHEN** 隔离副本完成 archive 且生成的 canonical specs 通过预期检查
- **THEN** Task Finish MUST 记录 OpenSpec version、Change identity、临时 owner、结果摘要和 cleanup 状态
- **AND** 真实 sync 仍 MUST 依次通过 pre-sync、agent-driven sync 与 post-sync

#### Scenario: Change 没有 delta specs
- **WHEN** active Change 不包含 delta specs
- **THEN** Task Finish MAY 跳过 archive rehearsal
- **AND** MUST 记录不适用理由而不是伪造 rehearsal success

### Requirement: Task Finish 必须在最终保证后检测目标分支竞态
Task Finish MUST 在 delivery convergence 阶段记录 fetch/rebase 所使用的目标 ref，并 MUST 在最终 required assurance 成功后、集成前重新读取远端目标 ref。目标 ref 变化时 MUST 返回 convergence 阶段；不得在已验证候选上静默 rebase、force push 或继续复用旧 evidence。

#### Scenario: 目标 ref 保持稳定
- **WHEN** 最终保证后的远端目标 ref 与 convergence observation 一致
- **THEN** Git provider MAY 按既有策略 fast-forward 目标分支并 push
- **AND** Task Finish MUST 核对 delivery tree 与已验证 implementation tree 或允许的 closeout-only delta 一致

#### Scenario: 目标 ref 在 Candidate 后变化
- **WHEN** 最终保证后发现远端目标分支已前进
- **THEN** Task Finish MUST 停止尚未执行的集成与 push，并返回 delivery convergence 执行 fetch/rebase
- **AND** rebase 后 MUST 对新 implementation identity 重新请求相同 required assurance

### Requirement: Task Finish 必须报告验证失效链和重复执行成本
当一次收尾执行多次正式验证时，Task Finish MUST 记录每次 evidence 的候选 identity、run reference、状态、真实 wall-clock、失效或失败原因和替代关系，并 MUST 在最终报告汇总 execute count、Candidate executor count、失效次数与重复验证总耗时。

#### Scenario: Rebase 使成功 Candidate 失效
- **WHEN** 成功 Candidate 后发生改变 implementation identity 的 rebase 或冲突解决
- **THEN** Task Finish MUST 记录 `implementation-changed` 失效事件和原 run 耗时
- **AND** 最终报告 MUST 将新 Candidate 与旧 run 分开，不得只报告最后一轮耗时

#### Scenario: Candidate 失败后修复
- **WHEN** Candidate 失败且修复改变 implementation content
- **THEN** Task Finish MUST 记录失败检查、失败 run 耗时、修复后的新 identity 和替代 run
- **AND** 重跑成功 MUST NOT 隐藏本次收尾已经付出的失败验证成本

#### Scenario: 最终保证一次通过且未失效
- **WHEN** 收尾只执行一次正式验证且后续没有 implementation change
- **THEN** Task Finish MUST 报告 execute count 为一、失效次数为零
- **AND** MUST NOT 为满足格式创建虚构的历史 run
