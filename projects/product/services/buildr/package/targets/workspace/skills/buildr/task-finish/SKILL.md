---
name: task-finish
description: 用户在 task worktree 中要求“收尾”、完成任务、自动收尾，或要求自动完成已验证 change 的归档、提交、集成、推送和本地清理时使用。
---

# Task Finish Skill

本 Skill 是 `buildr.task-finish/v1` 的默认编排 provider。它组合 OpenSpec、已绑定的 `buildr.task-verification/v2`、`buildr.git-task-integration/v1` 和 `buildr.task-worktree-lifecycle/v2` providers，把已完成任务安全推进到目标分支已推送、本地任务环境已按 provider 契约处理的状态。它拥有“收尾”意图、阶段顺序和失败停止条件，不复制验证、Git 集成或 task environment lifecycle provider 的 policy。

## “收尾”的授权

用户在当前轮次明确说“收尾”、完成任务或自动收尾，表示一次性授权以下常规动作：

- 对已完成的 OpenSpec change 默认同步 delta specs 并归档。
- 修复可证明由 OpenSpec archive/specs sync 产生的 Markdown 文件末尾多余空行。
- 调用已绑定 task-verification provider 核对或补齐当前最终候选的项目验证证据。
- 提交当前任务直接相关改动。
- 调用已绑定 task-integration provider 执行其 contract 和执行前披露覆盖的常规提交、集成，以及向已确认目标分支的推送动作。
- 调用已绑定 worktree-lifecycle provider 执行其 contract 和执行前披露覆盖的本机入口迁移与安全本地清理。

该授权只在当前轮次有效。执行验证或 Git 写操作前，必须向用户一次性说明任务/change、提交范围、commit message、目标分支、远端、三个 required selected provider identities、provider 声明的实际验证/集成/清理策略和本地清理范围；上下文清楚时不再逐项等待确认。

“收尾”不授权 force push、创建或推送远端任务分支、删除远端任务分支、丢弃改动、改写已推送或共享分支历史，也不授权替用户解决需要业务或语义判断的冲突。merge commit 是否属于常规动作由 selected task-integration contract、provider policy 和执行前披露决定，不由本 Skill 全局禁止。出现固定排除项时停止并请求对具体动作的明确授权或决策。

## 1. 收尾前置检查

在任何归档、提交、merge、push 或 cleanup 前确认：

- 使用 `git rev-parse --show-toplevel`、`git worktree list --porcelain` 和当前分支解析真实仓库、Buildr workspace root、canonical task worktree 与本地任务分支。
- 当前任务/change、目标分支和远端均唯一可确认；不得根据目录名猜测仓库边界或目标分支。
- 默认推送计划只包含已集成的目标分支；任务分支未推送。只有用户在当前轮次明确要求 PR、远程备份、交接或其他具体目的时，才把远端任务分支及其目的纳入披露与执行计划。
- `buildr.task-verification/v2`、`buildr.git-task-integration/v1` 与 `buildr.task-worktree-lifecycle/v2` 均已解析为 `ready`；任一 required dependency 为 `blocked` 时，只报告 reason、candidates 和 nextActions，不继续 provider-dependent action。
- task worktree 中的改动都属于当前任务；存在无关 dirty changes 时不 stage、不丢弃，并在破坏性动作前停止。
- 主 workspace 可用于集成且没有未处理改动。
- 如果存在 active OpenSpec change，使用 `openspec status --change <id> --json` 和 apply instructions 确认 artifacts、tasks 与 action context；未完成、blocked 或 workspace planning context 不得自动归档。
- 将任务/change、发布意图、高风险信号、变更路径、当前候选 identity 与已有 evidence 交给 selected task-verification provider，由 provider 返回 `requiredAssurance`。只有 `status: passed`、`level == requiredAssurance`、`reusable: true`，且 `candidateIdentity` 与当前 `implementationCandidateIdentity` 一致时，才把它作为本次收尾证据；Task Finish 不自行选测试。普通收尾通常为 affected，发布、高风险或显式完整收尾为 candidate。
- 有可信 evidence 时调用 selected provider `inspect` 并复用，`taskVerificationExecuteCalls: 0`、`candidateExecutorCalls: 0`；summary verifier 或 provider inspection 不得描述为重新执行验证。
- 当前会话没有满足 `requiredAssurance` 的 evidence、证据不可读/不可复用，或 implementation content 已改变时，才调用 selected task-verification provider `execute` 执行该保证；失败或仍为 incomplete 时停止后续集成、推送和清理。
- 若 Candidate 成功后唯一变化是 active change 中明确的最终 Candidate 任务由 `- [ ]` 精确变为 `- [x]`，仅在 Project policy 明确定义且当前会话可证明 source identity、target identity、change/task identity、精确 marker transition 及无其他 diff 时，记录 `closeout-metadata-only` / `verification-result-metadata-only`。该 transition evidence 标记为 `session-only`；原 Candidate evidence 继续绑定 source implementation identity。任务歧义、额外编辑、identity 不匹配或跨会话缺少证据时不得仅凭最终 diff 推断，按 implementation content 已改变处理。
- evidence 必须包含整体 `totalDurationMs`、`timingSource`、最慢检查、失败项、跳过项和 reference。不得引用其他 run，也不得把并行 check duration 相加推算 wall-clock。
- 落盘 evidence 还必须包含 `evidenceRetention`、`cleanupAfter`、`cleanupStatus` 和可用时的 `cleanupReference`。当前有效 Candidate evidence 在所有 consumer 使用完毕前不得清理。
- Buildr Product 的 Candidate 输出 `buildr.verification-timing/v1` 时，继续使用 `node test/verification/timing/verify-summary.mjs <summary-path> <product-root> candidate` 做 fail-closed 专项核对；只有 summary status、run kind、`source.repositoryRoot`、`source.productRoot`、`source.head` 和 `source.candidateFingerprint` 与最终候选一致时，才标记 `timingSource: verifier-reported`。Changed 或 Focus summary 不能替代 Candidate。
- 对照用户已经确认的目标、纠正和决策，检查当前 change 的 proposal、design、delta specs 和 tasks、最终实现、Git diff 与验证结果是否语义完整对齐。任务范围内仍有未记录语义、实现偏差或验证缺口时，在资产审查门控前停止收尾并回到修正流程。
- OpenSpec contract sidebar 只证明已记录契约、baseline、canonical specs、active conflict 和同步结果的一致性；它不能替代上述用户决策与实现语义检查，selected asset-review provider 也不重复承担当前 change 完整性判断。

### 1.1 Candidate 前 closeout readiness checkpoint

在把 implementation tree 交给 selected task-verification provider 前，先判断当前任务是否触及受管 Component、Skill、Command、lockfile、外部命令声明或 OpenSpec 升级信号。报告触发信号、实际检查和跳过理由；信号不明确时先诊断，不得静默跳过。本 checkpoint 是 closeout workflow check，不计作 task-verification `execute` 或 Candidate executor invocation，也不改变 requiredAssurance。

触发时按以下顺序收敛：

1. 读取当前 Project/Component 声明的外部命令版本，并核对实际可用 command。外部 CLI 不匹配时停止，报告声明版本、实际版本和明确的安装/升级路径；“收尾”不授权安装、升级或降级 user/system 级外部 CLI，Buildr 也不自动安装它。
2. 区分 checkout-local dependency 与外部 CLI。仅当当前 Project 的 lockfile 已声明该依赖、且在 canonical task environment 中运行既有依赖准备入口属于已知安全路径时，才在 Candidate 前执行该入口（例如该 Project 已规定的 `npm ci`）并复核实际版本。依赖准备失败、不存在已声明入口或版本仍不一致时停止；不得把 Buildr Product 的命令硬编码为其他 Project 的收尾要求。
3. 在 Candidate 前运行 `git diff --check`，并为任务触及的每个受管 Component 运行 `buildr component check <id> --target <dir> --json`。只修复可证明属于当前任务且已获既有收尾授权的格式或生成问题；每次修复后重新运行相应检查。Component integrity/receipt 不匹配、无法证明来源或复查失败时停止，不得把之后的 generated asset 更新归类为 archive-only delta。
4. 只有上述运行时、格式和生成完整性均收敛后，才冻结 implementation Candidate 并交给 selected task-verification provider。普通任务没有相关资产信号时，记录未触发理由并继续既有流程。

如果此前正式验证失败，收尾前必须确认 selected task-verification provider 在修复期间优先重跑失败项和受影响专项检查，并在候选重新稳定后完成一次新的 `requiredAssurance`。不得把仍在修复循环中的专项检查结果当作正式验证证据。

<!-- buildr:skill-contributions pre-verification -->

多个 change、多个 worktree、多个远端或目标分支无法消歧时停止，不替用户选择。

当前任务包含已完成的 active OpenSpec change 时：

<!-- buildr:skill-contributions pre-spec-sync -->

1. 先通过 Component contribution 的 pre-sync guard；不得把 apply 阶段预写的 canonical specs 作为已同步事实。仅在当前会话 pre-sync 成功后，使用外部可用的 OpenSpec CLI/Skills 执行 agent-driven canonical sync；随后必须通过 post-sync guard，才可进入 archive。不得直接修改 Buildr 随附的 `openspec-*` Skill 源来加入收尾逻辑。

<!-- buildr:skill-contributions post-spec-sync -->

## 2. 任务资产审查 finalize

当前任务语义完成、canonical specs 同步结果和 contract sidebar 结论可确认、候选 tree 与最终验证证据有效后，且 cleanup 尚未使来源证据消失时：

1. 调用 `buildr.task-asset-review/v3` selected provider 的 finalize。Task Finish 只传递 canonical Workspace root、来源 task identity、task owner、当前 change identity 和最终证据引用，不汇总 observation 信号、不执行资格门禁、不判断最终应沉淀什么。
2. provider 返回 `no-observation` 或 `discarded` 时继续正常收尾，不增加形式化复盘。
3. provider 返回 `awaiting-human` 时，在 worktree cleanup 前等待用户明确 accept 或 reject。accept 只建立 identity 不同的后续新 `task-triage` handoff，不改变原任务内容，也不构成 Rule、Skill、capability Contract 或产品实现授权。
4. provider 未解析为 ready、已卸载、本地 observation 状态不可写或 finalize 失败时，记录 readiness/reason 和降级原因并继续既有收尾；Task Finish 不自行实现备用审查。
5. Task Finish 不创建、编辑或删除 observation，不生成 `asset-maintenance` 记录，也不决定 product follow-up 的 OpenSpec 内容。全部审查和去向政策属于 selected provider。

## 3. OpenSpec 归档与格式收敛

当前任务包含已完成的 active OpenSpec change 时：

1. 使用外部可用的 OpenSpec CLI/Skills 归档 change。若当前会话已经通过 agent-driven 路径完成 canonical spec sync，且 post-sync contract guard 返回 `ok: true`，使用 `openspec archive <change> --skip-specs --yes`；记录 canonical specs 已同步、archive 未重复更新 specs 和后续 strict validation。缺少当前会话的 sync evidence、post-sync 未通过或状态不明时，不得使用 `--skip-specs`，必须停止或走既有默认 sync/archive 路径。
2. 归档后立即运行 `git diff --check`。
3. 只有全部诊断都是本次 archive/specs sync 修改的 OpenSpec Markdown 文件中的 `new blank line at EOF` 时，才自动删除多余结尾空白行，使每个文件恰好以一个换行结束。
4. 自动规范后重新运行 `git diff --check` 和当前 planning root 的 OpenSpec strict validation。
5. 使用当前 OpenSpec CLI 的 status 和 strict validation 确认 archive 后不存在 active change。若仅本次 change 仍被识别为 active，且逐层检查证明遗留 change scaffold 及其子目录均为空，才只移除这些已证明为空的目录；记录残留路径和空目录证据后再次运行 strict validation。非空内容、其他 change 或无法归因的状态一律停止自动清理，不得根据目录名、空父目录假设或批量删除扩大范围。
6. 任何其他 whitespace error、非 OpenSpec 文件或无法确认来源的问题都停止自动修复并报告。

归档改变 delivery tree，但不自动改变 `implementationCandidateIdentity`。只运行归档直接影响的格式、OpenSpec 或项目专项检查；这些 closeout workflow checks 不得计作 task-verification `execute` 或 Candidate executor invocation。

## 4. 提交与验证 tree

- 将已披露的任务范围、目标分支、远端、commit message 和授权交给 selected task-integration provider；由 provider 决定其 rebase、fast-forward 或 merge policy，本 Skill 不复制这些策略。
- provider 必须返回 `deliveryTreeIdentity`，例如 `git rev-parse HEAD^{tree}`，以及集成前后的 tree/commit/ref evidence；Task Finish 同时保留已验证的 `implementationCandidateIdentity`。
- `same-content`：delivery tree 的内容与 implementation Candidate 相同。调用 selected provider `inspect` 并复用 evidence；不得启动验证 executor，两个 execute count 均为 `0`。
- `closeout-metadata-only`：差异完全来自当前 Task Finish 已执行且可归因的 OpenSpec sync/archive、归档格式规范、Project 明确定义的 closeout-only artifacts，或满足下述严格条件的 Buildr runtime projection/receipt delta。保留 implementation Candidate evidence，只运行 closeout workflow 已要求的 focused checks；不得调用 task-verification `execute`，两个 execute count均为 `0`。
- `runtime-projection-only` 是 `closeout-metadata-only` 的严格 subtype：只允许已集成且保留 checkout 上的 `buildr sync` 生成受管 runtime projection 与对应 receipt，要求 `git diff` 精确限定于该同步输出、全部对应 Component integrity 和 doctor 通过、implementation source identity 未改变。记录 sync 来源、implementationCandidateIdentity、deliveryTreeIdentity 与 runtime/receipt focused checks；任一条件缺失，或出现 lockfile、非受管生成内容、手工修复或 source diff 时，按 `implementation-changed` fail closed。
- `verification-result-metadata-only` 是 `closeout-metadata-only` 的严格 subtype：只允许同一会话内刚成功的 Candidate 对应的唯一最终任务 checkbox 由 `- [ ]` 变为 `- [x]`，并要求 source/target identity、change/task identity、精确 marker transition 与唯一 diff 证据。调用 provider `inspect`，两个 execute count 均为 `0`；最终报告必须明确 Candidate 只验证 source implementation identity，metadata transition 单独解释 target delivery identity。
- `implementation-changed`：rebase 冲突解决、代码/配置/runtime source 资产变化、lockfile 或非 `runtime-projection-only` 的生成资产更新，或任何无法完全证明属于 closeout-only scope 的差异。原 evidence 失效，在集成完成前调用 selected provider `execute` 重新运行同一 `requiredAssurance`；Candidate 时 `candidateExecutorCalls: 1`，Affected 时保持 `0`，失败时停止尚未执行的 integrate、push 和 cleanup。
- transition classification 必须基于动作来源、实际 diff 和 Project policy，不得仅按目录名、扩展名、“看起来像文档”或最终 checkbox 状态判断；无法证明 `closeout-metadata-only` 时按 `implementation-changed` fail closed。`verification-result-metadata-only` 没有当前会话的完整 transition evidence 时也必须 fail closed。
- provider 返回 `treeChanged: true` 时，直接遵守 required Core workspace-transition invariant，并通过产品入口 Buildr Skill 执行具体 doctor、sync 询问和修复边界；不依赖 provider id。
- selected provider 的验证命令仍返回 session、cell、process id 或运行中状态时，继续 wait、poll 或 resume 同一进程；暂时无输出不得启动第二个相同验证。
- implementation evidence 必须随 implementation content 一起复用或失效。closeout-only delta 只增加独立 focused evidence；implementation content 改变并重跑时，以 selected provider 返回的同级新 evidence 替换旧证据。

## 5. 集成与推送

在验证证据仍有效且目标 workspace 满足 selected provider 的前置条件时，调用 task-integration provider 完成已披露的集成和推送计划，并核对其 result evidence。默认计划只推送已集成的目标分支，并记录任务分支未推送；不得因为任务分支存在、已提交或已合入而创建或推送其远端 ref。只有用户在当前轮次明确要求远端任务分支时，才可在披露分支、远端、目的和待推送提交后将其纳入计划。provider 报告冲突、远端状态变化、授权不足或写入失败时停止；不得由 Task Finish 改用另一套 Git policy 或扩大授权。

## 6. 本地清理

OpenSpec 和 task-integration 阶段成功后，把 integration/push evidence、当前工作区状态和本机入口信息交给 selected worktree-lifecycle provider。placement、retention、cleanup preconditions 和删除顺序由该 provider contract 与正文决定，本 Skill 不复制。

多仓 task environment 必须按 receipt 逐仓完成验证、提交、集成和 push evidence 核对；这些远端动作不是跨仓原子事务。任一仓库失败时停止 cleanup，报告已完成与未完成仓库并保留整个 environment。只有全部成员 checkout clean、已安全集成且没有 preview/CLI/runtime 依赖时，才按由内到外顺序清理 nested worktrees 与 root worktree。

如果健康的 Local App 或当前 `buildr` 入口仍依赖即将删除的 task worktree，Task Finish 必须先完成入口交接：在停止旧实例前读取用户级 `instance.json`，只接受通过其 secret 的 `/api/v1/health` 验证过的 loopback URL，并记录其中的 port；从已集成、仍保留的 checkout 重装开发 CLI 与 development launcher；停止旧实例后，使用 `buildr app --port <recorded-port> --no-open` 启动或复用新实例。只有新的健康实例仍监听该记录端口、`command -v buildr` 解析到保留 checkout，且静态资源或运行身份不再指向 task worktree 时，才允许删除 worktree。没有健康实例、实例不依赖 task worktree 或没有可验证端口时，不得虚构端口，按普通入口迁移继续。

如果 `buildr app preview list --json` 显示 preview，Task Finish 必须按 owner worktree 分类：owner 等于当前 task worktree 的健康 preview 必须先使用 `buildr app preview stop <instance>` 认证停止并确认不再健康；owner 属于其他 worktree 的 preview 必须保持运行，不得迁移、停止、清理或改写其端口和状态目录。当前任务 preview 无法停止或仍健康时停止 cleanup 并保留 worktree；其他任务 preview 不构成当前任务 cleanup 的阻塞条件。最终报告必须分别列出当前任务 preview 的停止结果与未触碰的并发 preview。

记录端口无法重启、被占用、健康检查失败或新入口仍指向 task worktree 时，禁止以随机端口或其他端口替代；停止 cleanup，保留 task worktree 与任务分支，报告记录端口、失败原因和恢复路径。Task Finish 仍要求：工作目录切换到主 workspace 或其他保留目录后再执行清理；不删除远端任务分支，除非用户另行明确授权；provider 必须返回 retained/removed 状态、入口迁移、Local App 迁移前后端口与健康结果，以及清理后仓库证据。provider 判断应保留时，将保留原因纳入最终报告，不把未清理描述为收尾失败。

## 7. Verification evidence 清理

集成与推送完成、最终验证摘要已捕获、资产审查和其他 evidence consumer 已结束后：

1. `evidenceRetention: transient` 时，请求 selected task-verification provider 使用其 `cleanupReference` 清理精确 run；Task Finish 不自行把该职责转交给 worktree-lifecycle provider。
2. `caller-managed` 或 `session-only` 时不执行默认删除，按 provider 返回的 caller policy 或当前会话语义处理。
3. 清理成功后保留摘要字段并记录 `cleanupStatus: cleaned`，最终报告不得继续把已删除路径描述为可访问证据。
4. provider 无法证明安全边界、仍有 consumer 或删除失败时保留现场，记录 `cleanupStatus: retained`、路径和原因；该失败不回滚已完成的 archive、integration 或 push。

## 8. 最终报告

最终报告除交付、OpenSpec、提交/推送、doctor、active change 和 worktree 清理状态外，还必须基于已核对的 Candidate evidence 说明：`implementationCandidateIdentity`、`deliveryTreeIdentity`、transition class/subtype、provider operations、目标分支推送结果、任务分支未推送状态或其明确授权、`taskVerificationExecuteCalls`、`candidateExecutorCalls`、验证范围与状态、完整验证总耗时、timing source、最慢检查及其耗时、失败项、跳过项、closeout delta checks、evidence retention 和 cleanup status。存在 `verification-result-metadata-only` 时还要报告 source/target identity、change/task identity、marker transition 与 session-only retention，并明确 Candidate 未直接覆盖 target delivery tree。Buildr Product summary 包含预算时同时报告预算状态；summary 仍保留时报告绝对路径，已清理时报告摘要已捕获且 transient evidence 已删除，不得输出失效路径。不得只报告“测试通过”或只列各阶段耗时。

## 失败处理

任一步骤失败时：

- 停止尚未执行的 archive、commit、rebase、merge、push 或 cleanup。
- 不回滚已经成功的远端操作，不隐藏部分完成状态。
- 报告失败阶段、已完成动作、当前 Git/OpenSpec 状态和下一步。
- 保留仍可能用于修复的 task worktree 和本地任务分支。
