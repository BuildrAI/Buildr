## Context

Task Finish 当前把正式保证作为状态机中的一个 step，但 completion receipt 的顶层 wall-clock 覆盖从 run 创建到 cleanup 完成的全部时间。验证失败后若 Agent直接修改候选并 recover，同一 run 会同时包含 verification、repair、re-verification 和 closeout；现有 `productExecutionMs`、`attributableWasteMs` 与 unobserved intervals 虽能提供原始信号，却没有形成用户可直接理解的阶段口径。

最近一次真实 run 证明了两个关联缺口：convergence receipt 将绝对 `openspecExecutable` 持久化进候选树；Task Finish Skill 的精确静态契约没有在完整 affected 前被聚焦执行。两者都在约60秒的正式保证末端才暴露，并由 Agent在没有用户 repair 授权的情况下直接修复。

## Goals / Non-Goals

**Goals:**

- 将 verification failure 变成明确的用户决策边界，默认停止，授权后才进入 repair。
- 让 finish run 保持可恢复，同时为 verification、repair、re-verification 和 closeout 提供互斥或可解释的阶段计量。
- 在完整正式保证前执行由候选路径和 registry 确定的低成本 preflight，提前发现直接契约回归。
- 让持久化 OpenSpec receipt 可移植，同时保留运行时 executable/version 的可核验 identity。
- 让 compact failure 优先展示真正失败项，不被 warning 淹没。

**Non-Goals:**

- 不让 Buildr 自动理解或修复任意测试失败。
- 不把所有实现循环、开发测试或用户思考时间纳入 closeout。
- 不保证所有缺陷都能被 preflight 捕获，也不以 preflight 替代 affected/Candidate。
- 不要求普通 Skill 内容变更通过新 session 验证激活。

## Decisions

### 1. 将 formal failure 与 repair 授权建模为独立边界

`formal-assurance` 失败后 run 保持 `blocked`，返回 `repairDecision.status = required`、失败摘要、候选 identity、允许的下一动作和已有授权状态。没有明确 repair authorization 时，executor 不得产生 delivery tree 写入，也不得自动调用修复工具。

用户可以在开始收尾前明确授权“发现问题直接修复并继续”，或在失败后单独授权。授权形成版本化 evidence，限定当前 task/change、失败 identity 和允许的 repair scope。repair 完成后必须提交 typed recovery，使旧 assurance 失效，再进入 `re-verification`；不得把 repair 表述为 closeout。

选择这一设计而不是强制新 Change，是因为本 Change 内的小缺陷是否原地修复仍是用户决策；Buildr 只固定停止和证据边界，不替用户决定任务拆分。

### 2. Completion receipt 同时保留端到端时间与阶段分解

保留 `wallClockMs` 作为从 run 创建到 completion 的真实端到端时间，新增稳定 phase summary：

- `verificationMs`：首次正式保证 execute；
- `repairMs`：从 repair 授权/开始到候选 transition 提交；
- `reverificationMs`：repair 后的正式保证 execute，可含多次 attempt 明细；
- `closeoutMs`：最后一个有效正式保证通过之后，到 cleanup complete；
- `orchestrationGapMs` 与 coverage：无法由 Buildr invocation直接观察的阶段间隔。

`closeoutMs` 不包含 preflight、首次 verification、repair 或 re-verification。用户说“这次收尾耗时”时，报告必须同时给出 closeout-only 与端到端 workflow，避免用其中一个替代另一个。

### 3. Preflight 只能来自登记的确定性选择

task-verification 根据候选 changed paths、Project verification registry 的 owner/selector 与显式 artifact dependencies生成 preflight plan。只有声明为低成本、无共享副作用、可独立判定且被当前候选直接命中的 capability 才进入 preflight；未知路径、选择歧义或 preflight 失败均 fail closed，不启动完整正式保证。

Preflight evidence 绑定同一 candidate identity，但不满足 affected/Candidate assurance，也不因通过而省略 required capabilities。相比硬编码 `task-finish-sequencing.test.mjs`，registry-driven 选择可扩展且保持 Project authority。

### 4. Receipt 保存逻辑 identity，不保存宿主位置

convergence 执行期间仍可使用绝对 executable path，但落盘 receipt 只保存：来源类别、相对 Product/Service reference（适用时）、OpenSpec version 和 executable content/package identity。旧 receipt 的绝对字段继续可读，任何重写或新 receipt 必须输出 portable schema；open-source/contract verification 覆盖历史 tracked receipts 和新生成结果。

不简单删除 executable evidence，因为 deterministic sync 仍需证明 planner/apply/validator 使用同一工具身份。

### 5. Compact diagnostic 以 failure 为主、warning 为辅

safe executor 从登记 child summary或测试输出中提取 failed stage、failed check/test、exit code 和 bounded findings；`diagnostics.primaryFailure` 必须优先于 warnings。解析失败时保留原 diagnostic digest/path并明确 `structured: false`，但不得只返回 warning 文本来解释非零退出。

## Risks / Trade-offs

- [Preflight registry 标记不完整会漏掉低成本检查] → 未映射候选继续由 affected fail closed；用 ownership contract tests保证新增关键路径有 selector。
- [阶段边界依赖部分 Agent evidence] → 明确 coverage，不从无观测区间推断 token 或精确 repair duration。
- [旧 receipt 兼容造成双 schema 分支] → 读取兼容、写入单一新 schema，并提供迁移/fixture tests，不批量改写无关 archive。
- [用户预授权 repair 可能范围过宽] → evidence 绑定 task/change 与允许 scope；遇到语义冲突、跨任务历史资产或授权扩大仍必须停住。
- [增加 preflight 会让成功路径略变慢] → 只允许低成本 selector，并单独记录时长；目标是用亚秒/秒级成本避免分钟级完整重跑。

## Migration Plan

1. 扩展 JSON contracts、run model 与 completion receipt，保持旧 run/receipt 兼容读取。
2. 实现 failure boundary、repair authorization/recovery evidence 和 phase timing 聚合。
3. 增加 registry-driven preflight，再接入 Task Finish formal execution plan。
4. 升级 convergence receipt writer/reader，并补历史绝对路径与新 portable receipt fixtures。
5. 更新 Skill、capability contracts、current knowledge 与测试；用真实 finish benchmark验证 closeout-only 口径。

回滚时可停止生成新字段并继续读取旧 receipt；不得把已记录的 repair/re-verification 历史折叠回 closeout。

## Open Questions

无。repair 是否执行始终由用户授权决定；具体修复策略不进入产品自动判定。
