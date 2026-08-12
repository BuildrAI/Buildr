## Context

Task Finish run 在创建时冻结 Development handoff、Candidate、generation 与 Content Target identity。当前 Product executor 只先确认 Development 存在某个 current handoff，再从历史 handoffs 查找 run 冻结的旧 identity；Application 也只替换 `failed` 且 handoff 已变化的 run，而 `blocked` run 可以继续恢复。与此同时，run factory 在同 Task 已有 current run 时直接返回旧 run，不比较请求 identity。

这三处行为叠加后，旧 run 可能在 Development 已推进到新 generation 后，从变化后的 Task source 形成新 carrier，却继续声明旧 Candidate 的确定性等价。修复必须统一 Development assertion、Finish phase guard、旧 run 处置和 run factory 入口，单独修补任一处分支都不能建立完整身份围栏。

## Goals / Non-Goals

**Goals:**

- 让 Development Application 成为 current handoff 精确身份断言的唯一 owner。
- 在 Finish 的 preflight、prepare、verify、deliver 与 resume 边界核对同一冻结 identity。
- 安全终结尚无副作用事实的陈旧 run；对已有恢复资源或交付事实的陈旧 run 保留现场并失败关闭。
- 阻止 run factory 和显式 resume 静默复用不同 identity 的 current run。
- 保持同 identity retained Doctor、target race 与 cleanup 恢复能力。

**Non-Goals:**

- 不改写已完成的历史 Finish Result 或手工修改 SQLite。
- 不新增 run 状态、数据库表、Receipt 或第二套 handoff currentness 计算。
- 不让 Finish 重新执行正式 Verification、Completion Review 或生成 Candidate。
- 不自动删除 carrier、撤销远端事实或把已有副作用 run 换绑到新 handoff。

## Decisions

### 1. Development 提供精确 handoff assertion

`carrier` operation 接受 `handoffIdentity`、`candidateIdentity`、`candidateGeneration` 与 `contentTargetIdentity`。Application 只在 `observed.currentHandoff` 存在且四项全部一致时返回 `equivalent`；缺字段、current handoff 不存在或任一字段不一致均返回 handoff 失效及可诊断的 mismatch。

Finish 不再遍历 Development 历史 handoffs自行判断 currentness。Product executor 在 preflight、prepare、verify、deliver 和任何会复用这些阶段输出的 resume 前调用同一 assertion，并传入 run 冻结 identity。

该 operation 属于随同一 package 交付的内部 provider/consumer contract。保持 `buildr.task-development@2`，同时更新全部已知 consumer、契约声明和测试；旧的无 identity 调用不再被视为有效 carrier assertion。

### 2. 阶段输出只在冻结 identity current 时复用

首次进入 preflight、创建或复用 carrier、verify 与 push 前都重新断言冻结 identity。断言失败后，Finish 不得重新观察当前 Task source 来替旧 run 形成 carrier，也不得复用旧 prepare/verify/deliver 输出。

Cleanup 继续以已持久化的 delivery/retained facts 为 authority。它不重新依赖已交付后可能变化的 Development handoff，避免身份漂移阻止必要清理。

### 3. 陈旧 current run 按副作用事实分级处置

若旧 run 只在 preflight 阻塞，且没有 carrier、target lease、delivery、retained 或 cleanup 事实，Application 将其终结为类型化 `task-finish.development-handoff-superseded`，保留 Execution Record，并要求调用方为 current handoff 重新提供 commit message；下一次创建的新 run 冻结新 identity 和独立 message identity。

若旧 run 已有 carrier、lease、delivery、retained 或 cleanup 事实，Application 不删除、不终结、不换绑。它返回 `task-finish.current-run-identity-conflict`，保留 run、resume evidence 和资源 ownership，要求先按旧 run 的恢复/清理事实处理冲突。

该分级依据持久化 run facts，而不是仅依据 `blocked`/`failed` 状态。这样既允许纯 preflight 陈旧 run 前进，也不会丢掉已推送或待清理的权威事实。

### 4. Run factory 是最后一道失败关闭保护

`createFinishRun` 先规范化请求 identity；若同 Task 已有 current run，只有 identity digest 完全相等才可幂等返回。不同 identity 必须抛出 `task_finish.current_run_identity_conflict`。显式 `--run` 恢复也必须先取得 current Development handoff，并执行同一 identity assertion，不能绕过 entry readiness。

Application 可在确认“无副作用陈旧 run”后显式终结旧 run，再以 current handoff 创建新 run；factory 本身不承担资源判断或自动替换。

### 5. 类型化诊断保持 owner 边界

Development assertion mismatch 返回 `nextWorkflow: task-development`。Finish current-run identity 冲突返回旧 run identity、current handoff identity、已存在的副作用类别和可执行 next action，但不复制专业 Result、重新解释 Verification 或修改 Development Receipt。

## Risks / Trade-offs

- [收紧 carrier contract 使旧调用失败] → 同一 package 内原子更新全部 consumer，并用 operation contract 与系统测试拒绝缺失 identity。
- [过早终结旧 run 丢失恢复事实] → 只有明确无 carrier、lease、delivery、retained、cleanup 事实时允许终结；任何未知或不完整状态都失败关闭。
- [频繁 assertion 增加读取次数] → 读取复用 Development read model，不执行 Verification 或生成 Candidate；身份正确性优先于少量本地查询成本。
- [Development 在 delivery 后变化阻塞 cleanup] → cleanup 只消费已持久化 delivery/cleanup authority，不重新要求 handoff current。
- [相同文本 commit message 被误认为复用] → 新 run 独立冻结 message identity；文本可相同，但调用方必须重新提交。

## Migration Plan

1. 扩展 Task Development carrier operation contract、Application result 与测试。
2. 将 Product executor 的各阶段 currentness 检查统一切换到精确 assertion。
3. 增加旧 run 副作用分类、Application 处置与 run factory identity 冲突保护。
4. 补齐显式 resume、retained Doctor、carrier/remote facts 和新 commit message 的系统测试。
5. 同步 capability contract、随包 Skill 与 current knowledge，运行 affected assurance 后形成新 Candidate。

无需数据迁移。历史 terminal Result 保持只读；现存 identity 冲突 run 在下一次操作时按新规则失败关闭。

## Open Questions

无。
