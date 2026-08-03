## Context

P0.1—P0.4 已分别建立 Task Record、Task Environment、Task Review Result 与 Task Verification Result 的唯一 Application authority。当前缺口位于两者之间：内容修改完成后没有 Development owner 来定义稳定目标、解释验证政策、冻结 Candidate/generation、消费 Completion Review 并形成 Finish handoff；这些职责目前散落在 Task Finish，且 Verification Result 的文档仍把 target 描述为 Candidate。

本设计必须同时适用于 Buildr 自举 workspace 和普通用户 Workspace。Project/Service 名称、源码类型、集成分支、verification capability 与 Change 数量都来自现有 Task/registry/Application read model，Development 不能预设 `product`、`buildr`、Git、Node/npm 或 OpenSpec。Task Environment、Review、Verification 与 Finish 继续拥有各自事实；P0.5 只新增一个 Development authority 并迁移重叠路径。

## Goals / Non-Goals

**Goals:**

- 用一个 Task-scoped Development Receipt 表达当前 Content Target、Task/context identity、verification policy decision、Candidate/generation、最小 gate references、风险决策与 Finish handoff。
- 让 formal Verification 先绑定稳定 Content Target；Result target/declarations current 且 policy 所需事实完整后才能冻结 Candidate，结论不由 freeze 改写。
- 让 Completion Review 绑定 Candidate，并让 Finish 只消费已闭合 handoff及内容等价 delivery carrier。
- 在内容、Task context、policy、declaration 或 gate 变化时 fail closed，并由 Development 生成下一代 Candidate。
- 删除 Finish 的 Change 收敛、内容 mutation、Candidate writer 与 Verification executor 路径，不保留第二 reader/writer。

**Non-Goals:**

- 不增加公开 Development CLI、Local App projection、Task Core、通用 planner/state machine/event bus/database。
- 不增加 Result/Receipt history、revision、CAS、锁、租约或多 writer 协议。
- 不设计新的测试框架、verification registry 或 verification capability schema。
- 不实现 P0.6 Task Git Integration、P0.7 Metadata Publication 或 P0.8 Finish 的最终替代架构。

## Decisions

### 1. Development Application 是唯一 Receipt authority

新增 `buildr.task-development-receipt/v1` 与一个 Application。Application 独占 normalization、Task/Environment resolution、identity 派生、repository 调用、失效、Candidate generation、gate applicability、decision 与 handoff。Skill 和 Finish 只调用 Application action/read model；任何消费者都不能直接读取 `.buildr/tasks/<task-id>/development.yml`。

Receipt 使用 closed schema，只保留当前事实：`taskId`、Environment Receipt 逻辑引用、`taskContext`、`contentTarget`、`verificationPolicy`、`generation`、`candidate`、`gates`、`decision`、不可变 `handoffs` 与系统时间。它不保存 diff、命令输出、时长、临时路径、Environment 资源、Result body、聊天或完整 Candidate history。每次写入都是完整 normalization 后的原子整值替换。

选择单一 Receipt 而不是 Candidate/Decision/Handoff 多文件，是为了让同一 writer 能原子清除全部派生 current facts；这不是通用 lifecycle state machine，Application 仍只暴露窄业务 action。

### 2. 身份图保持单向且 Candidate 不包含 Result identities

所有 identity 都对规范化、排序后的可移植 JSON 计算 `sha256`：

```text
Task intent/scope/change context ──> taskContextIdentity
Environment scopes/current bytes ─> contentTargetIdentity
Verification declarations/choice ─> policyIdentity

(contentTargetIdentity, taskContextIdentity, policyIdentity, generation)
                         └──────────────> candidateIdentity

Verification Result ──binds──> contentTargetIdentity
Completion Review ───binds───> candidateIdentity
Planning/Verification/Completion refs + decision + Candidate ──> handoffIdentity
```

Candidate 的 closed value 只含 `identity`、`generation`、`contentTargetIdentity`、`taskContextIdentity` 与 `policyIdentity`，不含 Review/Verification Result digest。最小 Result refs 只出现在 Receipt gate/handoff 中，因此不存在 `Candidate → Result → Candidate` 循环。

`taskContextIdentity` 绑定 Task ID、intent、完整 scope、0..N Change references 与由 Development 明确记录的每个 Change disposition；它不绑定 Task Record 的时间戳或文件路径。`policyIdentity` 绑定当前 declaration observations、被选择的 capability identities、必需性与明确 coverage gap，不复制 declaration body。

### 3. Content Target 通过 Application port 观察，不由 Development 假设 SCM

Application 从 ready Task Environment read model 获取全部 Task scopes，再调用 `ContentTargetObserver` port。观察结果按 selector 排序，并为每个 scope保存逻辑 `sourcePath`、observer capability 与可移植 content identity；aggregate identity 绑定完整 component set。绝对 execution root、branch、commit、worktree path 与本机时间不进入 identity。

默认 infrastructure observer 可按已登记 source capability 选择受管源码 inventory，无法使用 SCM evidence 时回退到确定性 filesystem inventory。控制面 metadata 不属于交付内容；重叠 scope 可以分别形成 component identity，以便证明 Task 声明的 Workspace、Project 与 Service 全部被观察。Development Application 不分支判断 Git/OpenSpec/Node/npm，非 Git、无 Change 的 Workspace 使用同一 Application action。

选择 content-based identity 而不是 HEAD/commit，是因为 formal Verification 必须能验证尚未提交的稳定目标，Finish 又需要在提交 delivery carrier 后证明 bytes 等价。任何 rebase、sync、archive 或生成资产导致的 bytes 变化都会得到新 Content Target，并返回 Development 重新验证。

### 4. Verification 在 Candidate freeze 之前完成

Development 先记录 verification policy decision，再观察稳定 Content Target。Agent/Skill 使用现有 Verification runner 取得 transient evidence，并只通过 Task Verification Application 记录 target 为该 Content Target 的 current Result。Development 再通过 Task Verification Application inspect read model 检查 target/declarations current、结论与 policy coverage；它不直接读 Result store，也不执行 formal Verification。

Planning Review 同样只通过 Task Review Application inspect 消费。Planning ready、Verification target/declarations current 且 policy facts 完整后，Development 才递增自己拥有的 generation 并冻结 Candidate。`not-passed` 或 coverage gap 保持原 Verification 事实，并留到 Candidate 后的 Development decision 处理。冻结后如 Content Target、Task context、policy/declarations 或前置 gate applicability 变化，Application 清空 current Candidate、Completion gate与decision；旧 Result 文件和已固化 handoff snapshot 分别保留在其 owner store/Receipt 中，但不再作为 current handoff。

### 5. Completion Review、风险与 handoff 由 Development 闭合

Candidate 形成后，Agent 使用 Task Review Application 记录 `completion` Result，target 必须等于 Candidate identity。Development inspect 后只缓存 Result digest、target、outcome 与 applicability 等最小 reference。

Development decision 使用 `proceed|blocked`，并只允许记录与 Task Intent/用户授权相关的可移植 scoped risk；它不能改写 Verification conclusion。默认正向路径要求 Planning ready、Verification current/passed/policy-complete、Completion ready；若 Verification 为 `not-passed`、存在 coverage gap 或 Completion 为 `changes-required`，只有绑定精确 gate Result digest、范围与授权来源的风险接受才允许 `proceed`。只有 current Candidate、三个 current gate、policy facts complete 与合法 `proceed` 同时成立时才能追加 immutable handoff snapshot；任何上游漂移都会使旧 snapshot 非 current，但不得改写或删除它。

### 6. Finish 是 handoff consumer 与 carrier adapter

Task Finish Application 先按 Task ID 调用 Development Application 取得 current handoff。Finish 不再解析 Change、Review/Verification stores 或 verification declarations，也不调用 Verification runner。

`prepare` 仍可执行提交等只改变 delivery carrier 的机械动作，但动作后必须通过 Development Application 对 carrier root 重观测 complete Content Target，并与 handoff Candidate 精确相等。若 bytes、scope component、Task context 或 policy发生任何变化，run 结束并返回 `task-development`；Finish 不生成新 Candidate。目标 ref 竞争若要求 rebase 也返回 Development，不能在同一 Finish run 自动吸收并重验。

交付成功后，Finish 保留现有普通 push、retained sync/install/doctor 与 Task Environment cleanup handoff。现有 run store继续作为 Finish 自己的执行事实，但旧 Candidate freeze/Verification/Change operations 从实现、contract、Skill 与测试中删除。

### 7. 首版只通过 bundled Skill 与内部 driver 暴露 Development workflow

交付 `task-development` Skill 与 `buildr.task-development@1` capability contract。Skill 负责语义顺序、调用 Review/Verification 专业 Skill，并通过随产品交付的内部 Application driver 执行 Development actions；该 driver 不注册为公共 `buildr task development` CLI，也不增加 Local App HTTP route。

这使 Agent 能执行真实 P0.5 flow，同时避免在 authority 尚未稳定时承诺长期公共命令面。System tests直接调用同一 runtime Application，保证 driver 没有第二套业务逻辑。

### 8. 一次性迁移并保持旧记录 fail closed

实现同一 Change 内完成消费者、Skill/contract、文档、static validation 与测试迁移，并删除旧 Finish writer/executor路径。新 Development Receipt 没有旧 schema migration；不存在 Receipt 的 Task 从首次 observe 开始。升级后遇到依赖旧 Candidate/Verification authority 的未完成 Finish run 必须 fail closed，不创建 v2 并行目录，也不尝试推进旧语义。

## Risks / Trade-offs

- [大型 Workspace 的 content inventory 成本较高] → observer 使用已登记 source capability 的有界 inventory，结果只保存 digest/component，不把文件列表写入 Receipt；Product Candidate 覆盖性能回归。
- [提交 carrier 后误把 metadata 变化当内容变化] → identity 只由 source content components组成，commit/branch/path 不进入；任何真实 bytes变化一律返回 Development。
- [Receipt 缓存 gate reference 可能与 owner Result 漂移] → 每次 freeze/decision/handoff/Finish preflight 都通过 owner Application重算 applicability，缓存只作可移植 snapshot。
- [旧 Finish run 无法恢复] → 显式 fail closed并要求从 Development 形成 handoff；不维护双 writer 或迁移状态机。
- [无 Git filesystem inventory 可能包含用户不希望交付的文件] → 只观察 Task Environment 声明 scope并排除 Workspace控制面 metadata；首版不引入隐式语言/工具目录规则，用户需通过真实 scope表达内容边界。

## Migration Plan

1. 新增 Domain、Application、repository、observer port、Skill/contract 与纯逻辑/Component测试。
2. 将 Verification target术语与 Application消费者迁移到 Content Target；保留 Result v1 closed fields。
3. 将 Finish preflight/prepare/verify改为 Development handoff与 carrier equivalence，删除 Change convergence、Candidate freeze和formal Verification路径。
4. 更新 current specs、Roadmap、术语、静态门禁和测试 fixture；运行无 Git/无 OpenSpec code-only完整 journey。
5. 先在稳定 Content Target上执行 formal Verification，再用新 Development Application生成本 Change Candidate、Completion Review与 handoff，最后用窄 Finish adapter交付。

回滚只允许在交付前撤销整个 Change。交付后若发现问题，创建新的 Task/Change；不得恢复旧双 authority。

## Open Questions

无。P0.5 的六个边界已固定；P0.6—P0.8 的 Git、metadata publication 与最终 Finish协议留给各自独立 Change。
