## Context

Task Finish 已同时支持五阶段自动 `run`、Agent 直接 Git/PR 后的 `reconcile`、多 repository Delivery、Delivery Adaptation、self-bootstrap Activation 和 Environment cleanup。现有实现积累了许多可靠的安全检查，但部分恢复分支仍把“产品能够识别的事故形态”与“Agent 应选择的策略”绑定在一起，并通过唯一 `nextAction` 暗示产品拥有全局恢复决策。

这造成两个结构性问题：未知情况只能继续增加专用分支；同一组 handoff、repository、carrier、remote 与 side-effect 事实不能稳定地被 `run`、`reconcile`、`task next` 和 Agent 共同消费。本设计保留既有 writer authority 和安全不变量，只重划事实、原语、策略与结果的边界。

## Goals / Non-Goals

**Goals:**

- Buildr 提供可信、只读、可移植的 Finish current facts，并明确事实的 source、identity、applicability 与 blocker。
- Buildr 继续保护 ownership、identity、side-effect containment、remote containment、fencing 和完成真实性等确定性安全不变量。
- Buildr 只提供少量、封闭、可幂等验证的安全原语；Agent 组合原语并选择 Git、PR、重新开发、恢复、对账或放弃策略。
- 自动 `run`、直接交付后的 `reconcile` 与 `task next` 消费同一个事实模型，但保持各自 writer 和副作用边界。
- 未知交付情况仍能通过事实和能力被 Agent 处理，而不是因产品缺少事故枚举就进入无出口状态。

**Non-Goals:**

- 不穷举所有恢复状态，不引入通用工作流引擎、规则引擎或策略 DSL。
- 不让 Buildr 自动决定 Git、PR、重新开发、恢复或放弃。
- 不跨 generation 自动复用旧 Candidate、handoff 或人工适配结论。
- 不为每次历史事故增加专用 migration、兼容 reader 或开放式旧 run 重写接口。
- 不改变 Task Development、Task Verification、Task Review、Git Operations、Task Environment 或 Task Record 的 writer authority。

## Decisions

### 1. 以单一 Finish current facts 投影作为读取边界

在 Task Finish Application 内形成一个 Product-owned read model，聚合 current Development handoff applicability、Task Contribution、repository topology、current/terminal Finish association、run/carrier ownership、已发生 side effects、remote containment、Activation/Cleanup/Diagnostics 状态及可用安全原语。投影只引用各 authority 的 current identity 和必要事实，不复制专业 Result 正文，也不新增第二个 SQLite writer。

`run`、`reconcile`、`task finish inspect` 和 Task Entry Snapshot 通过同一 Application port 消费该模型。CLI `full|compact` 可以裁剪字段，但不得重新推断策略或改变事实。

备选方案是让每个入口继续独立读取 Task/Environment/Development/Finish/Git。该方案短期改动更小，但会继续产生不一致的 blocker、身份判断和恢复建议，因此不采用。

### 2. 将安全不变量与策略选择显式分层

安全不变量只覆盖能够确定性证明的伤害边界：错误 owner、identity 漂移、越界或 symlink 路径、未经授权的远端写入、force push/共享历史改写、无法证明的 remote containment、重复副作用、错误 Task 完成与不安全删除。违反这些不变量时 Product 继续 fail closed，并返回精确 blocker 与当前 facts。

“应该继续旧 run、改走 PR、重新开发、直接 Git、放弃还是仅清理”属于 Agent 策略。Product 可以报告 capability availability、required prerequisites 和 recommended hint，但不得把推荐投影为唯一合法动作。

备选方案是继续扩展 `nextAction` 枚举。它会把 Agent 推理收回状态机，并要求产品预知开放世界中的交付策略，因此不采用。

### 3. 安全原语保持少量、封闭和幂等

本次只保留或引入两类原语：

- 精确 carrier 清理：仅删除当前 Task/run 已登记、真实非 symlink、受预期 container 包含且没有未交付内容的 carrier/container；逐项报告 effects，部分成功可幂等重试。
- 旧 run 退休：仅在 current Handoff 已由真实 remote containment 完整证明、旧 run 停止于 delivery 前、没有 lease/delivery/retained/prepared-completion/cleanup 或后续 phase facts，且 topology 与全部 carrier ownership/cleanup 可证明时，用 run ID + digest fence 原子退休旧 row。

这些原语不接受 claimed success、任意 path、调用方构造的等价证明或通用状态 patch。任何资格无法证明时零写入返回 blocker。

备选方案是开放 `reset run`、`delete carrier` 或 migration API。该方案无法维持 ownership、identity 与 side-effect containment，不采用。

### 4. `task next` 只投影 blocker 与能力

Task Entry Snapshot 继续指出 required 的 authority/identity 安全前置；Finish 阶段则返回 current blockers、facts summary 与 available capabilities，例如 `finish-run`、`finish-reconcile`、`git-operations`、`task-development`、`cleanup-carrier` 或 `retire-run`。`recommended` 仅表示默认推进提示，不构成唯一正确动作或执行授权。

当只有一个安全前置能解除确定性 blocker 时，可以返回 required owner/action；当存在多个合法策略时不得压缩成唯一 `nextAction`。旧字段若需兼容，只能由同一 typed projection 派生为非规范性提示，并计划在兼容窗口后移除。

### 5. Delivery 仍由真实远端结果对账

无论 Agent 选择自动 `run`、直接 Git、PR 或其他授权路径，Task Finish terminal association 只由 Product 从真实 remote target 重建 containment proof 后写入。Finish current facts 可以帮助 Agent决策，但不能充当 Delivery evidence。Activation、Environment Cleanup 与 Diagnostics 继续与 Delivery 正交。

## Risks / Trade-offs

- [Risk] 事实投影过宽会成为第二 authority → 只保存/返回 identity、applicability、blocker 和 bounded facts；正文与 writer 仍回到各专业 Application。
- [Risk] `task next` 从唯一动作改为能力集合会影响旧消费者 → 保留有界兼容投影，新增契约测试证明 recommended 不等于授权，required 只用于安全前置。
- [Risk] 安全原语被误用为通用删除/重置 → 输入只接受 Product 解析的 Task/run identity；路径和成功声明不由 caller 提交。
- [Risk] 自动 `run` 与 Agent 路径产生不同 Delivery 事实 → 两者统一经过同一 Finish facts 与 remote containment/terminal persistence port。
- [Trade-off] Product 不再给出所有事故的单一路径，调用 Agent 需要承担更多策略解释；这是 Agent 主导架构的有意选择。

## Migration Plan

1. 先增加只读 Finish facts 与 typed capability projection，不改变既有 Delivery writer。
2. 将 `run`、`reconcile`、`inspect` 与 Task Entry Snapshot 迁移到同一 facts port，并保持旧 compact 字段的有界兼容。
3. 把 carrier cleanup 与旧 run retirement 收敛为封闭原语，删除调用路径中的事故专用策略判断。
4. 用旧 run、未知 blocker、直接 Git/PR reconciliation、多 repository partial delivery 和 unsafe cleanup 旅程验证。
5. 通过同一 OpenSpec convergence 归档规范；若回滚，回退消费者切换但保留既有 SQLite schema 和 Delivery facts，不迁移或删除用户现场。

## Open Questions

无。能力集合的具体字段名由实现沿用现有 Task Entry Snapshot typed route 约定，但其语义边界由本 Change 固定。
