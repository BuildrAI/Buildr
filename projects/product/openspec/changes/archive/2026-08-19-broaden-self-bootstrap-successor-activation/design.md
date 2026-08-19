## Context

Formal Finish 冻结 `baseRef=A` 后，self-bootstrap runner 可能在 retained `dev` 已经前进到 `B` 时才执行。当前 runner 虽然已经检查 A 是 B 的祖先、链路无 merge、Workspace clean 且本地/remote 对齐，却继续要求 A..B 的每个 first-parent commit 携带 Buildr trailer。这个附加条件把“谁用什么工具提交”错误地当成“当前 canonical target 是否可以安全激活”，并使合法协作者提交阻断旧 Finish 的本机自举收尾。

稳定 Finish projector 已经提供 Task/run、remote、branch、frozen ref、Task Contribution paths 与 target lease identity；runner 也会在实际 retained HEAD 上重新执行 sync、development entry identity 和 Doctor。因此不需要新增 adoption record、Candidate re-freeze 或第二套 lifecycle authority。

## Goals / Non-Goals

**Goals:**

- 把“宽而薄”固化为 Core 价值边界和 Product 的门禁设计判断。
- 让 runner 在精确 remote/branch 的已发布线性 successor 上继续 activation，即使 commit 由人、IDE 或其他 Agent 创建且没有 Buildr trailer。
- 保留 current run successor 的精确幂等恢复、target lease、foreign carrier、same-run resume、dirty/remote drift、Development entry 和最终 Doctor 语义。
- 让结果诚实区分 Finish frozen ref 与实际 activation base，不把 activation 成功误报为 successor 的 Formal Verification。

**Non-Goals:**

- 不证明外部 successor 属于某个本机 Task，也不采纳或重建协作者生命周期证据。
- 不允许 merge、dirty、未发布 descendant、分叉、remote drift 或任意 detached/错误 branch HEAD。
- 不改变稳定 Finish projector schema、Task Development/Candidate/Verification/Review authority 或普通 Workspace update。
- 不执行发布。

## Decisions

### 1. 门禁保护结果边界，而不是规定工作方式

Core Rule 增加通用不变量：只有继续推进会造成越权、错误对象写入、未经授权的外部或不可逆副作用、证据失真或完成误报时才关闭式失败。Product Rule 增加设计检查：新增硬门禁必须说清保护的 authority/结果不变量与放行的具体伤害；辅助 provenance、推荐流程、工具偏好或可恢复不确定性优先形成诊断与 Agent 指引。

该原则不弱化现有 authority。它要求严格性绑定可说明的伤害，而不是绑定某种提交工具或 Agent 执行顺序。

### 2. 普通 descendant 使用已发布线性历史证明 activation base

runner 将 descendant 检查收敛为：

1. `baseRef` 必须是目标 HEAD 的祖先；
2. `baseRef..HEAD` 不得包含 merge commit；
3. retained working tree/index/untracked 必须满足既有 clean 规则；
4. HEAD 必须与 Finish 绑定的精确 remote/branch 回读一致；本地落后时只能在 target lease 内 fetch 后 `merge --ff-only` 到同一远端值，并重新检查；
5. runner 记录 frozen ref、实际 activation base 和 descendant commit 列表，但不推断作者、Task 或 Verification 身份。

替代方案是 External Successor Adoption / Candidate Re-freeze store。该方案被拒绝：本机 Task/SQLite 无法证明协作者提交来源，而且会建立第二套与 Git canonical target、Task lifecycle 并行的 authority。

### 3. Trailer 只保留 current-run successor 的幂等身份

runner 自己在 sync 产生 delta 时仍创建带 `Buildr-Finish-Run` 与 `Buildr-Closeout-Plan` 的 successor。重跑时只有 HEAD trailer 精确匹配本 run/plan，才把其 parent 作为 activation base，并在 remote 为 parent 时继续 push、remote 已为 HEAD 时直接继续后续阶段。

普通 A..B descendant 不再读取或要求 `Buildr-Task` trailer。这样不会伪造别人的 Task 身份，也不会把任意 clean HEAD 视为 current-run successor。

### 4. Activation 验证实际 B，但不重写 A 的研发证据

runner 在实际 activation base B 上执行适用 sync、development Buildr Web、显式 retained Project bridge identity 和最终 Doctor/same-run resume，并在结果中同时报告 A 与 B。它只证明“当前本机自举在 B 上完成”，不声明 B 继承 A 的 Verification、Completion Review 或 Candidate。

## Risks / Trade-offs

- [A 是 B 的祖先不保证 A 的行为未被后续 commit 修改] → runner 不承担 successor 研发验收，只在 canonical B 上执行真实 activation/identity/Doctor，并诚实报告 A/B；B 的代码质量由其自身交付流程负责。
- [错误 remote/branch 的 clean HEAD 被误用] → 继续绑定 Finish 投影中的 exact remote、target branch、lease identity，并要求 HEAD/remote 精确一致。
- [merge 隐藏多父历史，难以保持现有 first-parent恢复语义] → 本次继续 fail closed，不扩大到 merge topology。
- [结果字段仍使用 provenance 命名造成误解] → 将普通链 evidence 改为 published linear descendant 事实，不再输出 Task owner 推断；稳定 result major 不变，只调整未持久化 runner evidence 的语义和测试。
- [Core 原则被用来随意放宽门禁] → Product Rule 要求每次新增或移除硬门禁都明确 authority、具体伤害与可安全继续路径，实际行为仍由 OpenSpec/Skill/测试定义。

## Migration Plan

1. 同一 Change 更新 Core/Product Rule、canonical specs/current knowledge、self-bootstrap Skill、runner 与 tests。
2. 更新 Component integrity，验证 workspace runtime 投影一致。
3. Formal Finish 合并到 `dev` 后只运行唯一 self-bootstrap runner，使 retained Workspace 和 development entry 在最终 successor 上收敛。
4. 不迁移 SQLite、Finish Result 或历史 commit；旧 Result 继续通过稳定 projector 读取。

回滚时恢复 runner trailer 门禁及对应 Skill/spec 文案即可；没有持久数据需要回退。

## Open Questions

无。
