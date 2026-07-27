## Context

Buildr 已把 OpenSpec 收敛（convergence）收敛为规划、隔离验证、条件式原子应用、写后确认和仅移动 Change 的归档事务，并只保留一份正式回执。剩余风险位于事务外层：任务收尾的 `resume` 会无条件清除当前阻塞；外部提供者完成动作时，attempt 的检查点等待时间会被当作验证执行时间；历史 CLI 仍与新入口并列展示；`state-unknown` 只有分类，没有逐文件只读解释。

此次变更横跨任务收尾状态机、OpenSpec CLI、兼容策略、计时模型和测试。安全约束是：不能通过新增授权模型降低关闭式失败（fail closed）强度，也不能为了计时而信任调用方手写的普通 `durationMs`。

## Goals / Non-Goals

**Goals:**

- 将语义冲突、正式保证失败和重要集成冲突建模为产品强制停止边界。
- 只允许可验证输入变化或绑定阻塞身份的显式授权解除停止边界。
- 以产品观测或受信验证摘要统计执行时间，并显式报告不可观测区间。
- 提供 `before`、`expected`、`actual` 的逐文件只读审计。
- 让旧接口进入可测试的弃用、零消费者、再删除流程。

**Non-Goals:**

- 不取消隔离验证、原子写入、并发检查、写后确认或 `archive --skip-specs`。
- 不让 Buildr 自动解决语义冲突、修改未知正式文件或扩大用户授权。
- 不在本 Change 立即删除仍需兼容的旧命令和旧回执解析器。
- 不让任务收尾加载全部 OpenSpec 领域模块后才能写检查点。

## Decisions

### 1. 阻塞身份与恢复策略由产品持久化

每次动作进入 `blocked` 时，状态机生成稳定的 `blockIdentity`，绑定 run、step、输入摘要、阻塞代码和产品动作身份，并持久化 `resumePolicy`：

- `input-change`：只有当前步骤输入摘要变化后才能重试，例如收敛语义冲突或状态不明。
- `authorization-or-input-change`：重要集成冲突可由新目标/候选事实或显式解决授权恢复。
- `repair-recovery-only`：正式保证失败只能走现有、绑定失败身份的修复授权与类型化恢复。
- `retry`：租约占用、归档失败等不涉及语义决定的可重试故障可普通恢复。

新增通用解决授权 `buildr.task-finish-resolution-authorization/v1`，绑定 task、change、step、`blockIdentity`、授权类型和证据标识。`resume` 在清除阻塞前验证策略；旧 run 没有策略时按阻塞代码重新分类，未知代码关闭式失败。现有正式保证修复授权继续兼容，但不能被通用授权替代。

替代方案是继续依赖 Skill 文案要求 Agent 停止。该方案无法阻止普通 `resume`，因此不采用。

### 2. 产品阻塞不能由新 attempt 的任意成功证据覆盖

产品执行动作失败后，原 attempt 已终结并记录阻塞身份。没有合法恢复时，状态机不发放新 attempt token；调用方因而无法用任意 `passed` evidence 覆盖失败。合法恢复只创建新 attempt，历史失败证据保留。

### 3. 执行计时采用分层可信来源

attempt 继续记录产品检查点的 wall-clock，但正式保证阶段汇总只接受：

1. 产品执行命令账本的实测时间；或
2. `buildr.verification-timing/v1` 摘要中、与当前候选身份匹配且状态可核验的 `totalDurationMs`。

普通 completion 的手写 `durationMs` 不进入验证时间。结果新增 `providerExecutionMs`、`checkpointWaitMs`、`timingCoverage` 和按步骤的 `timingSource`；`orchestrationGapMs` 继续表达产品不可观测区间，但不再把它误称为执行耗时。

验证摘要可以作为 evidence 内嵌的精简事实提交；产品只消费版本、状态、候选身份、总时长和摘要身份，不长期复制诊断正文。

### 4. 收敛审计复用观察器，不建立第二套恢复状态

新增 `buildr openspec audit <change> --project <project> --target <workspace> --json`。命令只读取唯一回执和实际文件，为每个正式文件输出相对路径、`beforeDigest`、`expectedDigest`、`actualDigest`、`before|expected|unknown` 分类，并汇总 `planned-not-applied|applied-and-matched|state-unknown|archived`。

审计不写回执、不创建临时投射、不运行归档；回执缺失或无效时返回 `recovery-unprovable`。实现位于收敛观察器附近，领域入口只负责解析上下文与输出公开结构。

### 5. 旧接口以登记表和零消费者门禁退役

旧命令保留兼容执行，但统一附加结构化 `deprecation`：替代命令、状态、兼容窗口和移除条件；文本模式输出一次警告。新增内部退役登记表作为唯一事实源，并由契约验证扫描当前产品入口、Skills、Components、Commands 和非历史文档：除兼容实现与专用夹具外不得消费旧命令或旧旁路文件。

当扫描结果为零消费者、所有新 journey 只生成唯一回执且兼容窗口满足时，登记表才报告 `removalEligible: true`。实际删除放到后续发布，避免本 Change 产生未声明的破坏性变更。

## Risks / Trade-offs

- [旧 run 缺少阻塞策略] → 读取时按稳定代码迁移；未知代码默认需要显式授权，绝不无条件恢复。
- [授权被复制到另一阻塞] → 授权绑定 `blockIdentity`、step、task 和 change，消费后仍保留审计记录但不能匹配新阻塞。
- [验证摘要伪造] → 只接受既有版本化摘要与当前候选身份，状态不通过或身份不匹配时拒绝作为正式保证时间。
- [旧命令长期不删除] → 零消费者检查进入必跑契约；登记表明确移除条件，后续发布无需重新盘点。
- [审计泄露内容] → 默认只输出相对路径与摘要，不输出正式文件正文或绝对路径。

## Migration Plan

1. 先扩展 run 读取兼容、阻塞分类和授权验证；旧 run 自动获得派生恢复策略。
2. 接入可信验证摘要计时，并保持原字段向后兼容。
3. 增加只读审计和旧接口弃用登记表；旧命令继续工作但发出结构化提示。
4. 更新 Skills、当前认知和契约夹具，确保正常调用只使用 `openspec converge` / `openspec audit`。
5. 在后续发布满足零消费者和兼容窗口后删除旧写路径；如需回滚，本 Change 可保留读取器并关闭新 CLI 路由，不影响已有唯一回执。

## Open Questions

无。阻塞分类、授权结构、计时可信来源和兼容窗口均由本 Change 的契约与测试固定。
