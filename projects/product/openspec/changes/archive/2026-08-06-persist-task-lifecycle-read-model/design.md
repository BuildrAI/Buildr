## Context

当前 Task Record、Development Receipt、Review Result 和 Verification Result 已经分别由 Workspace SQLite 保存，但 Local App 的研发、证据和终态交付读取仍会重新观察 Environment、Git、Content Target、verification declaration，并扫描 Finish Result。这个读取路径把“动作时形成的事实”重新变成了“读取时推导的事实”，导致一次页面读取触发多次文件、Git 和 Environment 访问，也使不同页面重复执行相同观察。

本 Change 需要在不改变各专业 Application authority 的前提下，增加一个由生命周期动作维护的 SQLite current read model。它只保存跨专业读取所需的状态摘要、identity、digest、时间和诊断；Development Receipt、Review/Verification Result、Environment Receipt 和 Finish completion 仍由各自 owner 保存。

## Goals / Non-Goals

**Goals:**

- 生命周期动作接受并确认事实后，更新 Task lifecycle current read model。
- Local App 的 Development、Review、Verification、Terminal Delivery 读取只查询 SQLite，不重新观察 Git、文件、Environment 或 Finish 目录。
- 保留“最后一次生命周期确认”的时间和来源，让页面明确区分已保存快照与当前动作。
- 让 Task Record、Environment、Development、Review、Verification、Finish 的状态在 SQLite 中可被单次查询取得。
- 对已有专业读取接口保持兼容，继续由各 Application 负责返回其公开 read model。

**Non-Goals:**

- 不把 read model 变成 Task、Development、Review、Verification 或 Finish 的第二个专业权威。
- 不把完整 Result、命令输出、diff、Environment secret 或 Finish 文件正文复制进 read model。
- 不在 GET 请求中为了“刷新 currentness”偷偷执行 lifecycle mutation。
- 不改变 Candidate、Verification、Review、Finish 的决策 authority 和生命周期顺序。

## Decisions

### 1. 使用单表 JSON current read model

新增连续 SQLite migration，建立 `task_lifecycle_current`，每个 Task 一行，保存 schema version、Task ID、current read model JSON 和更新时间。使用单表而不是为每个摘要再增加表，原因是 Local App 需要跨专业原子读取，而现有专业表继续保存各自完整事实。

read model 保存 Task status、Environment 摘要、Development applicability、Review/Verification applicability 与 digest、Finish terminal summary、observedAt 和 diagnostics。Result/Receipt 正文不复制；读取时仍从现有 SQLite current 表获取专业正文，绝不读取旧 YAML、Finish 目录或 Git。

### 2. 由生命周期 Application 在成功动作后写入

新增 `Task Lifecycle Read Model Application` 和 SQLite repository。Task Record、Task Development、Task Review、Task Verification、Task Environment 与 Task Finish 在各自动作完成专业写入后调用它更新对应 section。更新使用 read-modify-write，并以最新 Task Record status 为顶层状态。失败的专业动作不得覆盖已有 section；projection 写失败必须返回可诊断错误，不静默成功。

这样保持单一专业 authority：生命周期 Application 产生事实，read-model Application 只负责投影；Local App 只能调用各 Application inspect，不可直接写 projection。

### 3. inspect 读取保存的 applicability，不再实时观察

Development、Review、Verification 和 Terminal Delivery 的 inspect 改为读取专业 current record 加上 lifecycle current snapshot。没有 snapshot 时返回明确的 `unknown`/`unavailable` 诊断，而不是回退执行实时观察。外部 Git、文件或 declaration 变化只有在下一次相应的正式 lifecycle action 中被确认并写入 read model。

### 4. Finish 只投影已确认的 terminal summary

Task Finish 成功完成并清理后写入 terminal summary，包括 run、handoff/candidate identity、远端 ref、target branch、cleanup 和 semantic equivalence。Terminal Delivery inspect 只消费这一摘要和已保存的 Development/Review/Verification facts，不扫描 Finish Result 目录，也不恢复 Environment。

### 5. 对旧数据采用显式缺失语义

Migration 不猜测旧 Finish、Git 或 Environment 状态，也不在 GET 中回填。已有专业 current record 但没有 lifecycle snapshot 的 Task 返回“尚未形成生命周期快照/当前状态未知”，直到下一次正式生命周期动作成功写入。这避免把一次读取变成隐式 mutation，也避免伪造历史 currentness。

## Risks / Trade-offs

- [Risk] projection 写入与专业事实写入不是同一个跨 Application SQLite transaction。→ 先完成专业写入，再立即写 projection；projection 失败显式返回诊断，Doctor/下一次 lifecycle action 可修复，不在读取时偷偷补写。
- [Risk] 外部文件或 Git 在两次正式动作之间变化时，页面显示的是最后确认状态。→ read model 暴露 `observedAt`/`source`，页面文案明确这是生命周期快照；需要重新确认时执行对应正式 action。
- [Risk] 旧 Task 缺少 read model。→ 返回稳定 unknown/unavailable，而不是扫描旧来源；新增迁移只建表，不进行不可证明的回填。
- [Risk] 多个页面各自查询 SQLite 仍有少量重复打开连接。→ 通过 Workspace operation scope 内 memoization 复用，后续可在不改变 authority 的情况下优化成一次 application query。

## Migration Plan

1. 增加 migration 并实现 repository/Application。
2. 在各生命周期成功动作写点接入 projection，失败动作保留原有错误语义并报告 projection 失败。
3. 将 Local App 使用的 Application inspect 改为纯 SQLite 读取，删除 terminal GET 的 Finish/Environment/Git 观察路径。
4. 添加缺失 snapshot、生命周期写入和 GET 不触发观察的测试。
5. 在候选 Environment 中运行定向测试、Doctor 和性能复测；确认 migration、runtime assets 与自举 workspace 同步。

回滚时可以回退应用代码并保留新增表；旧 runtime 会按数据库 version newer 保护性拒绝，不删除数据、不从旧文件重建。

## Open Questions

- 当前 Change 只投影已执行成功的 lifecycle action；是否要在后续 Change 中增加失败 attempt 的独立历史记录，不属于 current read model。
- 是否将复盘摘要纳入同一 read model，当前先保持现有复盘 Application 读取路径不变。
