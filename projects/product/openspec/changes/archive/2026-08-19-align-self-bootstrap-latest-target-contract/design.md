## Context

同一 canonical spec 已有较新的 `Runner 必须可从可重算事实幂等恢复` Requirement，明确普通 published linear descendant 不依赖 `Buildr-Task` trailer；当前 runner、Skill、tests 与 current knowledge 也已采用这一语义。较早的 latest-target Requirement 仍要求每个 commit 具有 Buildr provenance，形成单文件内部矛盾并阻断 Candidate audit。

本次只恢复 delta 与 canonical contract 的一致性，不重新设计 self-bootstrap，也不修改生产实现。

## Goals / Non-Goals

**Goals:**

- 用完整 MODIFIED Requirement 收敛 latest-target 语义，确保 OpenSpec archive 能安全替换原 Requirement 而不丢失既有恢复场景。
- 保留 frozen ref 祖先关系、无 merge、clean checkout、fast-forward、精确 remote/branch 回读、target lease 与最多两次 same-run resume 门禁。
- 让 OpenSpec candidate audit 能证明本次 canonical 修改来自 matching Archived Change delta。

**Non-Goals:**

- 不修改 self-bootstrap runner、Finish projector、Task/Review/Verification schema、SQLite 或 Git 历史。
- 不重写或补改已经归档的 `broaden-self-bootstrap-successor-activation` Change。
- 不把普通 successor 解释为某个本机 Task，也不继承旧 Candidate 或 Verification 证据。

## Decisions

1. **创建新的窄 Change，而不改写旧 archive。** 已归档 Change 是历史 provenance；新的 delta 只修复遗留 canonical Requirement，保持 archive 不可变。
2. **复制并修改完整 Requirement block。** 更新第一段 latest-target 前置条件与第一个场景的约束内容，但保留全部场景身份以及 Doctor blocked target-race、Delivery Adaptation 与有界恢复场景，避免 MODIFIED archive 丢失原约束。
3. **以真实 Git/remote 事实替代 provenance 条件。** frozen ref 必须是 latest remote target 的 ancestor，后继无 merge，retained checkout clean，HEAD 已等于或可 fast-forward 到精确 remote/branch，并在前进后重新验证一致性；普通作者、工具和 trailer 不参与 admission。

## Risks / Trade-offs

- [MODIFIED Requirement 复制不完整会删除既有场景] → delta 保留原 Requirement 的全部四个场景，并由 strict validation、convergence preflight 与 candidate audit 检查。
- [措辞放宽成任意本地 descendant] → 明确限定 published、无 merge、精确 remote/branch、clean 与 fast-forward，不接受未发布 HEAD 或 remote drift。
- [规范修复被误解为新实现] → proposal、design、tasks 与 release notes 均声明生产实现不变，本次只恢复 canonical contract 一致性。

## Migration Plan

1. 严格验证并 convergence/archive 新 Change。
2. 运行 changed/affected Product verification，确认 OpenSpec audit 与现有 contract tests 通过。
3. Formal Finish 集成到 `dev`；随后让 rc.20 发布 Task消费同一 canonical after-state。

回滚只需恢复该 canonical Requirement 与新 archive；没有数据或运行时迁移。

## Open Questions

无。
