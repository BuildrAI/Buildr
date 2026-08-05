## Context

Task Record、Development Receipt、Review Result 与 Verification Result 的 current records 由 Workspace SQLite 中各自唯一 Application 管理；Formal Task Finish Result 则由现有文件 repository 保存在 `.buildr/task-finish/runs` 与 `.buildr/task-finish/completed`。当前 Local App 分别调用这些 Application：Development inspect 在 Environment cleanup 后无法重新观察 Content Target，于是整体 applicability 为 unknown；Review/Verification 未获得目标 identity，也按契约返回 unknown。

terminal Task 需要展示的是已经冻结并交付的历史事实，不是重新判断 live currentness。HTTP/Web 不能直接读取任何 store 或重新计算 identity，因此组合必须发生在 Application 层。

## Goals / Non-Goals

**Goals:**

- 以既有 records 派生 terminal delivery status，并严格核验 completed Finish 与 immutable handoff/Candidate/Content Target 的一致性。
- 同时返回 live applicability 与 delivery snapshot 两种不同语义；terminal 页面只把后者作为主结论。
- 让 Review/Verification 的交付时关联绑定 handoff 中保存的 digest/target identity，不改变其 current Result schema。
- 保持 Local App workspaceId/Task ID 安全边界和四个一级页签。

**Non-Goals:**

- 不迁移 Finish Result、不新增 SQLite 表、writer、聚合 store、缓存、事件系统或 history framework。
- 不改变 Development、Review、Verification、Finish 的写入 authority。
- 不恢复已 cleanup 的 Environment，不从 Git HEAD、branch、dirty tree、时间或普通 Candidate presence 推断 currentness。

## Decisions

1. 增加窄 `Task Terminal Delivery` Application read model。它依次读取 Task Record、Development Receipt、Review/Verification Result 与 Finish Result repository，返回 `active|delivered|completed-no-change|completed-unproven|abandoned|unavailable` 以及最小 snapshot/evidence。选择 Application composer 而不是 HTTP presenter，可保证身份判断只有一个产品入口且能被 HTTP、测试和未来 consumer 复用。
2. 为 Finish repository/Application 增加 `list/read completed results by task` 的只读能力。repository 只扫描现有固定目录中的普通 `.json` 文件并复用当前 schema normalization；Application 只选 status/completion complete 且身份匹配的结果。失败/blocked run 仅在没有匹配成功结果时返回诊断，避免旧失败覆盖后来成功。
3. `delivered` fail closed：Task 必须 completed 且非 noChange；Finish status 与 completion 完整；taskId、handoff、Candidate identity/generation、Content Target 一致；carrier equivalence、remote readback、retained activation/Doctor 与 Environment cleanup 均满足。损坏或关键字段不可核验返回 unavailable；仅缺少匹配成功结果返回 completed-unproven。
4. Development Receipt 是 terminal snapshot 的身份索引。Application 不调用 Environment 重新观察，而是读取 immutable handoff 与冻结 planning/content/policy/candidate/gates。live applicability 仍保留原 inspect 输出，二者不合并为 current。
5. Review/Verification Application 继续派生 current/stale/unknown；terminal composer 额外按 handoff gate digest 与 target identity 对 current slot bytes 做 exact association，输出 `adopted-at-delivery` 或明确不匹配。Planning gate 为 not-applicable/waived 且 slot missing 时只展示 gate disposition，不伪造 Result。
6. Local App HTTP 只调用 terminal composer，仍只接受已登记 workspaceId 与合法 Task ID。Web 只做展示：中文结论优先，技术 identity 收入 details；Verification 单卡限制宽度。

## Risks / Trade-offs

- [旧 Finish JSON 存在损坏或 schema 漂移] → 单文件解析 fail closed；若无法安全证明 terminal 结论则返回 unavailable，不跳过损坏去猜 delivered。
- [同一 Task 存在多次 Finish run] → 只按完整身份选择成功 completed Result；匹配成功优先，失败 run 仅作为无成功结果时的诊断。
- [读取目录随历史增长] → 首版采用窄的按 Task 扫描，不建索引/缓存；当前规模和只读页面访问可接受，后续只有实测瓶颈才另立 Change。
- [用户误把快照当 current] → API 与文案显式区分 `liveApplicability` 和 `deliverySnapshot`，六个轴不显示 current。

## Migration Plan

无需数据迁移。发布后既有 SQLite 与 Finish JSON 原样可读；回滚代码即可恢复旧视图，不修改持久数据。实现完成后同步 specs、归档 Change，并由 Formal Task Finish 交付。

## Open Questions

无。
