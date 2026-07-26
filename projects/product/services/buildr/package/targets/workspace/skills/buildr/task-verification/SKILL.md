---
name: task-verification
description: 用户要求测试、验证、耗时报告、初始化或更新测试声明、推进测试能力成熟度，或者实现型任务到达验证节点、Agent 准备判断或声称开发完成、Task Finish 需要核对或补齐正式验证 evidence 时使用；用户无需主动点名本 Skill。
---

# Task Verification Skill

本 Skill 是 `buildr.task-verification/v2` 的默认 provider。它负责发现当前 workspace 或 Project 已定义的验证政策，决定正式所需保证，以最低充分范围执行验证，把结果绑定到候选身份，测量验证自身的 wall-clock，并向直接调用者或 finish consumer 返回统一证据。它不拥有 task worktree placement、Git integration、部署或业务验收 policy。

本 Skill 不是只在用户主动说“验证”时使用：用户直接要求测试、检查或耗时报告时由 runtime description 发现；实现型任务到达验证节点或 Agent 准备声称完成时，由适用 Rule 的完成边界触发；Task Finish 需要正式 evidence 时通过 capability binding 调用 selected provider。binding 只选择实现，不替代首次意图发现。

## 1. 确认输入与政策 authority

执行前确认：

- 任务范围、当前 workspace、实际仓库或非 Git 工作边界，以及明确的 Project context。
- operation：`inspect` 只核对已有 evidence，`execute` 才运行验证命令，`cleanup` 只处理 evidence 生命周期。不得因为 consumer 调用 provider 就默认选择 `execute`。
- 正式保证由本 provider 决定：普通开发与普通收尾返回 `requiredAssurance: affected`；发布、高风险或用户明确要求完整验证返回 `requiredAssurance: candidate`。consumer 不替 provider 选测试或级别。
- 当前候选 identity 和已有验证 evidence。Git 候选优先记录 repository root、tree 或包含未提交内容的稳定 fingerprint；非 Git 候选记录当前工具可证明的 snapshot identity。无法建立可比较 identity 时，将 evidence 标记为不可跨状态复用。
- consumer 声明 task environment 时，必须提供 environment receipt、repository membership/identity、allowed execution roots、receipt-bound CLI/runtime projection identity 与明确 target/workdir；自举环境使用 environment-local CLI，普通消费 workspace 可使用 receipt 绑定的 external-product CLI。只有 context 返回 `executionReady: true` 才执行正式验证，不得要求 session root 等于 environment root。
- 变更路径是否命中 Change lifecycle、Change path resolution 或 OpenSpec sync/archive；命中时记录 `archive-sensitive` signal，并从 Project policy 选择 active/archive capability。无法确认覆盖时在 `coverageSummary` 披露 gap；OpenSpec archive rehearsal 不等于应用层测试覆盖。
- 重新执行是否携带可验证的前序 evidence 与 `implementation-changed`、`target-race` 或 `verification-failed` 原因；存在时保留前序 run 的独立状态与耗时，在新 result 中返回 `supersedesEvidence`、`invalidationReason` 和 `supersessionRelationship`。
- 按 authority 顺序读取当前 scope 的 Rules/AGENTS、明确 Project context 及可选 `projects/<project>/verification.yml`、OpenSpec change/tasks、项目开发或发布文档、公开脚本与帮助。只读取任务相关范围，不按技术栈名称猜测命令。

Project 测试声明不存在时使用 `policyMode: legacy`，完全保持现有发现行为：继续读取 AGENTS、POM、项目文档和已有测试命令；不因缺少新声明产生失败、阻塞或 warning，不自动启动新的 Spring、端到端、容器、数据库或外部环境。声明存在时先按 `references/project-verification-v1.md` 核对；无效声明不得执行。

声明的 `mode: augment` 表示已确认能力增强 legacy policy discovery，未声明范围仍继续发现；`mode: authoritative` 表示团队确认声明是 Project 测试政策 authority。具体命令由当前 workspace 或 Project 定义。不得把 Buildr Product 的 package check、临时 workspace E2E、`npm run test:candidate` 或 timing schema固定为其他项目的默认入口。

需要 Candidate 但找不到适用 Candidate policy 时返回 `status: incomplete`，说明缺失的政策、入口或候选 identity；不得把 `minimal` 或 `affected` 结果表述为完整候选验证。

## 2. 两级正式保证与内部快速反馈

执行前先解析声明能力的 applicability、maturity、stage、enforcement、dependsOn/supersedes、环境、副作用与授权，形成 `availableCapabilities`、`selectedCapabilities`、`skippedCapabilities` 和 `blockedCapabilities`。只有显式 `supersedes` 或可信上层入口覆盖证据才能去重；不得根据测试名称、技术栈或看似更高的层级自行推断覆盖。

### 内部快速反馈（minimal）

实现循环中只运行语法、类型、静态检查，或直接相关、低成本、环境就绪且已授权的 stable 能力。它不作为 Task Finish 的正式 evidence。安全边界、不可逆迁移或用户明确要求的即时检查不受默认批量节奏限制。

### 受影响验证（affected）

共享实现区域、验证入口或失败影响面的任务组完成后，集中运行一次受影响范围验证。选择影响面内的 stable required 能力；环境和授权允许时可以运行 trial/advisory 能力积累证据，但其失败不得单独冒充 required gate 失败。同一候选状态下，只有能证明上层入口覆盖底层检查时才去重；无法证明覆盖关系时保留必要检查。

当多个 required 能力彼此独立、执行根与副作用允许并行时，向 Task Finish consumer 返回一次 `formal-verification` composite execution plan，由产品 executor 在同一 execution 内并行调度并汇总整体 wall-clock。不得为此生成临时 shell、手工轮询日志、重复启动相同 verifier，或用外部包装再次计算已有可信 timing。

### 完整候选验证（candidate）

全部实现、自然语言资产、生成资产同步和 review 修订完成后冻结候选，再运行项目要求的完整验证。`authoritative` 模式必须运行全部适用的 stable required Candidate gates，不得按 Git diff、固定能力数量或技术栈分层缩小；`augment` 或 legacy 无法确认完整范围时设置 `candidateCompleteness: unconfirmed`。只有 `level: candidate`、`status: passed`、`candidateCompleteness: confirmed`、candidate identity 匹配且 evidence 可复用时，才能把结果作为实现完整验证或 Task Finish 的完成证据。

完整验证失败后退出候选冻结状态。修复期间优先重跑失败项与受影响检查；候选重新稳定后再执行一次新的 Candidate 验证。

## 3. 初始化与演进测试声明

用户说“初始化测试声明”或等价表达时：

1. 确认已登记 Project 和实际 asset repo ownership，目标固定为该 Project 的 `verification.yml`；不写入 `capabilities.yml` 或 Service repo。
2. 读取 `references/project-verification-v1.md` 和 `templates/project-verification.yml`，扫描当前 scope 的 AGENTS、POM、package scripts、CI、项目文档和可访问 Service 测试入口。
3. 生成 `mode: augment` 候选。尚未确认命令、覆盖、环境或副作用的能力保持 `maturity: discovered`、advisory 和 explicit authorization；不得在初始化过程中自动运行新的 Spring、端到端或外部环境测试。
4. 向团队展示候选、来源、unknown 项和建议的首批低风险能力；团队确认后才可提升 maturity 或 enforcement。

用户说“更新测试声明”“自动补充测试声明”或普通任务发现新入口时执行增量流程：

- 保留已有 capability id 和全部团队确认字段，只补充新的 discovered/trial 候选或新增来源证据；不整文件重建覆盖。
- 普通任务只发现但没有写入授权时，提出候选和建议，不自动修改声明。
- 用户明确授权自动补充时可以写入 discovered 或 trial/advisory；不得自动设为 stable 或 required。
- Agent 根据真实任务的重复成功、耗时、环境稳定和副作用证据建议 `discovered → trial → stable`。技术成熟度提升可以由团队确认；从 advisory 提升为 required 必须单独确认其覆盖和阻断价值。
- 新能力实际副作用高于声明、命令失效、覆盖漂移或长期不稳定时，停止自动执行并建议降级、修复或补充声明。

## 4. 执行与 wall-clock

每次验证作为一次 execution 记录真实整体 wall-clock：

- 只有 operation 为 `execute` 时启动验证命令。`inspect` 和 `cleanup` 的 `taskVerificationExecuteCalls`、`candidateExecutorCalls` 必须为 `0`，其自身核对/清理耗时不得冒充验证耗时。

1. 验证入口输出可信 summary 时，核对 status、验证级别或 run kind、source/candidate identity 和 summary 归属；使用其整体耗时并标记 `timingSource: verifier-reported`，保留绝对 summary path 或等价 reference。
2. 普通命令没有 summary 时，从启动验证进程前到该进程退出后使用单调时钟测量，标记 `timingSource: wrapper-measured`。只报告实际可测的整体与单命令耗时，不声称不存在的逐阶段数据。
3. 并行执行时不得把各检查 `durationMs` 相加推算 `totalDurationMs`；总耗时必须来自整体 execution 的 wall-clock。
4. 工具返回 session、cell、process id 或运行中状态时，继续 wait、poll 或 resume 同一进程；暂时无输出不得启动第二个相同验证。
5. consumer 已提供产品持有的 composite executor 时，优先让 executor 持有 required capability 的进程、阶段状态和 timing；Agent 只消费其结构化结果并处理异常分支，不逐命令接管正常路径。

验证命令需要修改外部系统、部署环境、持久业务数据或共享状态时，停止并取得该具体副作用的授权。构建产物和项目政策明确允许的本地测试临时文件仍属于常规验证效果。

## 5. Candidate evidence 有效性

- evidence 必须记录验证时的候选 identity、dirty/snapshot 状态和 policy sources。
- task environment evidence 还必须记录 execution binding 与 runtime projection identity；任一 environment、repository、target/workdir 或 CLI identity stale/mismatch 时 evidence 不可复用。普通 Rule/Skill 内容修改不要求 activation evidence；只有任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求证明该机制已在真实 Agent host 生效时才记录。
- commit、checkout、分支名或 push 变化但候选内容等价时，可以复用 evidence。
- rebase 冲突解决、后续编辑、生成资产更新或其他内容变化后，旧 evidence 失效。
- Project policy 可以把同一会话内、刚成功的最终 Candidate 任务唯一 `- [ ]` → `- [x]` 变化定义为 `verification-result-metadata-only`。此时 Candidate evidence 仍绑定 source implementation identity；consumer 只能组合独立的 source/target identity、change/task identity 和精确 marker transition，不得改写 `candidateIdentity` 或声称 Candidate 直接验证 target delivery tree。
- 上述 transition evidence 没有 versioned 持久化 receipt 时标记为 `session-only`。存在额外内容变化、任务歧义、source identity 不匹配或跨会话证据缺失时，不得从路径、文件类型或最终 checkbox 状态反推可复用性。
- provider 无法证明当前候选与 evidence 等价时，必须标记 `reusable: false` 并重新验证或返回 incomplete。
- 不引用其他 worktree、其他 run、被覆盖 summary 或无法匹配 source identity 的耗时。

## 6. Result Evidence

向 consumer 返回以下字段；没有独立 summary 文件时可以作为当前会话结构化证据返回，不要求为所有项目创建新文件：

```text
level: minimal | affected | candidate
requiredAssurance: affected | candidate
status: passed | failed | incomplete
policySources: <实际采用的规则、Project 或文档>
policyMode: legacy | augment | authoritative
candidateIdentity: <repository/snapshot 与 tree/fingerprint>
availableCapabilities: <已解析能力及 maturity/stages>
selectedCapabilities: <本阶段实际选择的能力>
skippedCapabilities: <跳过能力 id 与原因>
blockedCapabilities: <阻塞能力 id 与环境/副作用/授权原因>
coverageSummary: <已声明并实际覆盖的范围；未知项>
environmentReadiness: <ready/unready/unknown 与依据>
authorizationDecisions: <implicit/explicit/denied 与依据>
candidateCompleteness: confirmed | unconfirmed | not-applicable
checks: <名称、命令摘要、状态、exitCode、durationMs>
totalDurationMs: <真实整体 wall-clock>
timingSource: verifier-reported | wrapper-measured
slowestCheck: <名称与 durationMs，未知时明确 unknown>
failedChecks: <失败项，成功时 none>
skippedChecks: <跳过项与原因，未跳过时 none>
reusable: true | false
operation: inspect | execute | cleanup
taskVerificationExecuteCalls: <本次启动验证 execution 的次数>
candidateExecutorCalls: <本次启动 Candidate executor 的次数>
supersedesEvidence: <可选；被本次 run 替代的前序 evidence reference>
invalidationReason: <可选；implementation-changed | target-race | verification-failed>
supersessionRelationship: <可选；前序状态、失败项与当前 run reference>
evidenceReference: <summary 绝对路径或当前会话 evidence>
evidenceRetention: transient | caller-managed | session-only
cleanupAfter: consumer-finished | caller-policy | not-applicable
cleanupStatus: retained | cleaned | not-applicable
cleanupReference: <仅 transient 落盘 evidence 的精确、安全清理引用>
verificationResultMetadataTransition: <可选；subtype、source/target identity、change/task identity、精确 old/new marker 与 session-only retention>
```

必要检查失败时保留实际退出状态、已完成检查和耗时，停止把任务描述为验证完成。只有较低级别验证时，明确 Candidate 尚未执行。

## 7. Evidence 保留与清理

- verifier 在系统临时目录创建 summary/diagnostics 时标记 `evidenceRetention: transient`。系统临时目录不是长期存储；provider 必须返回精确 `cleanupReference`，但在当前有效 Candidate evidence 仍可能被 Task Finish 或其他 consumer 使用时保持 `cleanupStatus: retained`。
- 调用方显式指定稳定输出路径或 CI 上传 artifact 时标记 `caller-managed`；provider 不擅自删除，也不把该路径纳入默认任务清理。
- 只有当前验证摘要已经进入用户报告或 consumer evidence、没有后续 consumer，且 cleanup reference 可证明属于 provider 创建的单次 transient run 时才清理。删除必须针对精确 run 目录，禁止使用未解析变量、glob、workspace root 或系统临时目录根。
- 新 Candidate evidence 核对通过后，可以清理同一任务中已被替代且不再被引用的旧成功 transient run；失败 evidence 保留到诊断结束或被新 evidence 替代。
- Task Finish 在捕获最终摘要、完成集成与推送并确认没有后续 consumer 后，请求 selected provider 清理 transient evidence。清理失败不回滚已完成交付，返回 `cleanupStatus: retained`、实际路径和原因。
- transient evidence 清理后，最终报告保留已捕获的状态、候选、范围、耗时和失败/跳过摘要，并说明 `cleanupStatus: cleaned`；不得继续把已删除路径表述为长期可访问证据。`task-worktree` 不负责这项清理。

## 8. 面向用户报告

直接验证或实现准备完成时，报告至少包含：

```text
验证：通过 / 失败 / 不完整
候选：<identity>
范围：minimal / affected / candidate
政策：<legacy / augment / authoritative；Candidate completeness>
能力：<selected；skipped/blocked 及原因>
检查：<通过数/总数；failed；skipped>
耗时：<整体 wall-clock；timing source；最慢检查及耗时>
证据：<reference>
证据生命周期：<retention；cleanup status；仍保留时的精确 reference>
```

报告使用“受影响验证”或“完整候选验证”。只有当前政策确实要求 Candidate 时，Affected 通过后才追加“完整候选验证尚未执行”。不得只说“测试通过”，也不得把任务总耗时、排队时间或人工等待混入验证自身耗时。

正常成功路径默认返回 compact summary；只有失败诊断、审计或明确请求时才展开完整 attempts、原始命令输出和 runtime diagnostics。

## Guardrails

- 不替 workspace 或 Project 发明验证命令、覆盖关系、预算或通过阈值。
- 不把缺少 `verification.yml` 当作迁移欠账、失败或阻塞；不在初始化/刷新声明时自动执行新环境测试。
- 不把 discovered/trial 自动升级为 stable/required，不以成功次数替代团队对覆盖和阻断价值的确认。
- 不把团队名、服务名或固定测试层级写进通用 Skill；Project 特有事实只进入该 Project 声明。
- 不依赖 `task-worktree`、`git-ops` 或任何固定 provider id；有 worktree 时只消费调用方提供的候选边界与 identity。
- 不把测试通过等同于业务验收、上线、归档、提交、推送或清理授权。
- 不重复启动仍在运行的验证，不相加并行步骤推算整体耗时。
- 不把 provider 的 `inspect`、`cleanup`、summary verifier 或 consumer 的 OpenSpec guard、doctor、Git、archive rehearsal 调用表述为重新执行验证，或混入 `totalDurationMs`；已有满足 `requiredAssurance` 的可信 evidence 进入收尾时不得仅因 consumer 调用而启动 executor。
- 不在候选变化后沿用旧 evidence；唯一例外是 Project 明确定义且证据完整的 `verification-result-metadata-only` consumer composition，原 evidence identity 仍保持不变。实现内容变化后重跑同一 `requiredAssurance`，不机械升级为 Candidate。
