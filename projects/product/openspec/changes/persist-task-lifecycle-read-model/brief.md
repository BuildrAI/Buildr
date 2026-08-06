# Task 生命周期状态持久化到 SQLite

## 一句话摘要

让 Task 生命周期动作把已确认的状态摘要写入 Workspace SQLite，Local App 读取研发与证据时只查询保存的 read model。

## 背景与问题

当前 Local App 的研发、Review、Verification 和终态交付读取会重复检查 Environment、Git、Content Target、verification declaration，并扫描 Finish Result。页面读取因此承担了生命周期动作的成本，且同一 Task 的多个页签会重复执行相同观察。

## 目标与非目标

目标是新增 SQLite lifecycle current read model，由各专业生命周期 Application 在成功动作后更新；Local App 只读取 Application read model。Task、Development、Review、Verification、Finish 的 authority、Result/Receipt 正文和决策边界不变。

非目标是复制专业 Result、建立第二套状态机、在 GET 中隐式回填或实时判断外部 Git/文件变化。

## 关键变化

- 新增 `task_lifecycle_current` SQLite current row。
- 生命周期动作保存 status、identity/digest、applicability、observedAt、诊断和 terminal summary。
- Development/Review/Verification/Terminal Delivery inspect 移除 GET 路径中的实时观察和 Finish 文件扫描。
- 缺少 lifecycle snapshot 时返回明确 unknown/unavailable，不猜测或自动写回。

## 影响与兼容性

新增连续 SQLite migration；旧数据库在合法 writable action 中升级。已有没有 snapshot 的 Task 不自动回填，下一次正式生命周期动作成功后形成快照。外部变化在下一次正式动作确认前，以最近一次保存状态展示。

## 验收摘要

验证 migration、projection writer、各生命周期接线和缺失快照语义；通过 Local App contract/system 测试证明 GET 不触发 Git、文件、Environment、declaration 或 Finish scan，并复测研发与证据读取耗时。

## 技术入口

- [proposal](proposal.md)
- [design](design.md)
- [delta specs](specs/)
- [tasks](tasks.md)
