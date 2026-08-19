# 放宽自举后继提交门禁

## 一句话摘要

Buildr 将以“宽而薄”的治理原则约束工作流门禁，并允许 self-bootstrap runner 在精确远端已发布、无 merge 且包含 Finish 基准的线性 successor 上继续激活，不再要求协作者 commit 携带 Buildr trailer。

## 背景与问题

Formal Finish 冻结 `baseRef` 后，retained `dev` 可能已经包含其他人、IDE 或 Agent 的合法提交。当前 runner 即使已经证明 retained tree clean、`baseRef` 是最新 HEAD 的祖先、本地与目标 remote/branch 一致，仍因某个 successor 缺少 `Buildr-Task` 或 closeout trailer 返回 `self-bootstrap-closeout.successor-identity-unprovable`。这把提交方式当成安全边界，阻断了本可通过实际 activation 和 Doctor 诚实判断的工作。

## 目标与非目标

目标是只在真实 authority、目标、授权、副作用或完成证据不完整时关闭式失败；普通已发布线性 descendant 使用 Git/remote 事实选择 activation base。runner 继续报告 Finish frozen ref 与实际 activation base，并在后者上执行适用 sync、development entry identity 和 Doctor。

本次不建立 External Adoption store，不重建协作者 Task，不重新形成 successor Candidate/Verification/Review，不允许 merge、dirty、未发布 descendant、分叉或 remote drift，也不执行发布。

## 受影响用户或角色

- 在 Buildr 自举 Workspace 中连续交付多个任务或接受协作者提交的 Agent 与维护者。
- 设计 Buildr Rules、Skills、OpenSpec 与产品门禁的贡献者。

## 核心流程

1. Finish projector 继续提供同一 Task/run、remote、branch、frozen ref、Task Contribution paths 与 target lease identity。
2. runner 取得 target lease，证明 Workspace clean，并收敛到精确 remote/branch 的 latest HEAD。
3. 若 frozen ref 是 latest HEAD 的祖先且链路无 merge，runner 把 latest HEAD 作为普通 activation base，不检查每个 commit 的 trailer。
4. 若 HEAD 是当前 run/plan 自己生成的 successor，仍通过精确 closeout trailer 判断未 push/已 push 幂等恢复。
5. runner 在实际 activation base 上完成适用阶段并报告 A/B；结果不继承或改写 successor 的研发证据。

## 关键变化

- Core Rule 固化宽而薄的结果边界；Product Rule 要求每个硬门禁说明保护对象与具体伤害。
- 普通 descendant evidence 从 Buildr owner/trailer 推断改为 published linear Git/remote facts。
- current-run closeout trailer、target lease、foreign carrier、same-run resume、Development entry 与最终 Doctor 保持不变。
- 测试新增无 trailer 的协作者 successor 成功路径，并保持 merge、dirty、未 push、remote drift 等失败路径。

## 影响、风险与兼容性

祖先关系不证明后续 commit 保留了旧行为，因此 runner 只证明本机在 latest canonical target 上完成自举激活，不把旧 Verification/Review/Candidate 归给 successor。稳定 Finish projector、SQLite 和普通 Workspace 均无 schema 或迁移变化。

## 验收摘要

- 原 Finish ref 和带 Buildr provenance 的 descendant 继续工作。
- 无 trailer、已发布、线性包含 Finish ref 的协作者 successor 可以成为 activation base。
- merge、dirty、未发布 descendant、remote drift、identity 不完整继续阻断。
- runner 重跑与 same-run resume 保持幂等。
- Core/Product Rule、OpenSpec/current knowledge、Skill、runner、Component integrity 和测试一致。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/agent-task-workflows/spec.md`
- `specs/task-closeout-orchestration/spec.md`
- `tasks.md`
