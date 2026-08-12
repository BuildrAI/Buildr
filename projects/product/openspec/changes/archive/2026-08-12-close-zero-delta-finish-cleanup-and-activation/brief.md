# 闭合零差异 Task Finish cleanup 与自举激活

## 一句话摘要

让 Agent-reviewed zero-delta 的已交付 run 能被 retained cleanup 正确复核并完成，同时让多个待激活 Finish Result 在可证明的 Buildr-owned retained 后继链上顺序收敛。

## 背景与问题

零差异交付使用专用 containment proof，但 cleanup 仍调用要求非空 changed paths 的通用观察器，合法 run 因而卡在 `cleanup_pending`。另一方面，自举 runner 只接受 frozen ref 或本 run 的单一 successor；新的正式 Task 交付后，较早 Result 即使仍需激活也会被永久阻塞。

## 目标与非目标

目标是复用同一专用 zero-delta proof 观察器完成真实 cleanup，并把 self-bootstrap frozen ref 与动态 activation base 分开，在无 merge、clean、remote-aligned、Buildr provenance 完整的后继链上逐个执行各自 plan。非目标是接受任意 descendant、建立持久 activation queue、重跑 Formal Verification、修改 Candidate/Task Contribution、迁移 SQLite 或扩大普通 Workspace 能力。

## 受影响用户或角色

- 恢复 `cleanup_pending` 与执行 Buildr 自举激活的 Agent。
- 维护 Task Finish、Task Environment 与 Buildr self-bootstrap runner 的产品开发者。

## 核心流程

deliver 与 retained cleanup 从真实 run-owned carrier、baseline 和 target ref 重建同一 zero-delta proof；匹配后 cleanup 继续消费 Environment owner 并完成 terminal transition。Formal Finish 终态后，自举 runner 从 frozen ref 到当前 retained HEAD 核验 Buildr-owned first-parent provenance、clean tree 与 remote；选择 activation base，按当前 Result 的 frozen paths执行 sync/安装/identity/finalize。需要 sync delta 时只在 activation base 上创建带当前 run/plan trailer 的直接 successor。

## 关键变化

- 新增共享的专用 zero-delta containment 观察器，普通 changed-path containment 不变。
- self-bootstrap runner 新增 `fresh-descendant` 执行事实，区分 frozen ref、activation base 与 current-run successor。
- 多个已完成 Finish/self-bootstrap commit 可按顺序被后续 runner 消费；merge、未知 trailer、dirty、remote drift继续失败关闭。
- `buildr-self-bootstrap` Component 版本与 Skill 成员完整性同步更新，使 Task Environment/runtime 投射仍可由 Component authority 验证。
- 增加真实 cleanup 子进程与多 Result 顺序激活回归。

## 影响、风险与兼容性

变更只影响 Buildr Service 的 Task Finish cleanup、Workspace 自举 Skill runner及测试。现有 v2 run 已具备重建 proof 的 carrier/baseline/delta facts，无 schema 或数据迁移。commit trailer 只作为受控 Git history provenance，并结合 ancestry、无 merge、clean 与 remote 对齐，不成为业务 authority。

## 验收摘要

- 当前真实 zero-delta `cleanup_pending` 类型可完成 owner cleanup 与 Task terminal transition。
- proof、carrier、baseline或target 任一漂移均在 cleanup 副作用前 blocked。
- 多个已完成 Result 可在当前 retained HEAD 上顺序激活，sync successor parent与remote readback正确。
- 未知 commit、merge、错误 trailer、dirty与remote/local分叉不被接受。
- 默认 CLI 绑定当前 retained checkout且最终 Doctor ready；没有新增 Formal Verification 执行。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
