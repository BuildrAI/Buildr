## Context

当前 selection owner 使用单一 `refs/buildr/release/<version>/frozen` ref 表达冻结状态，并在 `update` 前永久拒绝 `frozen`。这能阻止 Candidate 运行期间静默变更 source，却没有提供“Candidate 失败后明确追加修复”的恢复动作。现有 read model 已要求 release HEAD 变化使 Candidate、artifact、readiness 和 transaction context stale，因此永久冻结并不是保护该不变量的唯一方式。

当前 `buildr-release` 又让 `release-<version>` Task 直接承担版本材料交付，并在 Candidate 前执行 Task Finish。Task Finish 按通用契约必然把 Task Record 置为 completed；但同一 Task 的 intent 和用户看到的标题却是“准备候选版”，包含 Candidate、release→main 与 readiness。release/support Task 已是现有 correlation 模型的一等角色，可用来分开“可独立交付的内容贡献”和“完整准备协调”。

## Goals / Non-Goals

**Goals:**

- 提供显式、可审计、零远端副作用的 `reopen`，让 failed Candidate 对应的 frozen selection 能继续追加明确选择的 `dev` commit。
- 保留每次历史 freeze 的 commit/generation，使旧 Candidate 仍可定位但绝不被 current consumer 接受。
- 让 `release-<version>` Task 表达完整候选版准备；需要提前 Finish 的版本材料或修复由窄 support Task 独立交付。
- 让 failed Candidate 保持 release preparation active/blocked，并从同一 selection 的新 generation 继续。

**Non-Goals:**

- 不让 release 自动追随 `dev`，不允许批量 cherry-pick、自动冲突解决、rebase、reset 或 force push。
- 不改变 Product Candidate、唯一 tarball、release→main、protected publish workflow 或 npm/GitHub 公共事实的 owner。
- 不给 selection owner 增加 GitHub/npm 凭证或旁路 publication store。
- 不通用化重开 completed/abandoned Task；历史错误终态保持不可改写审计事实，通过新的 active recovery Task 继续。

## Decisions

### 1. 新增独立 `reopen`，而不是让 `update` 隐式突破 freeze

`update` 对 `frozen` 仍然 fail closed。维护者必须先显式调用 `reopen --confirm --reason <text>`；owner 核验 clean checkout、current branch/head、current frozen ref 和 selection provenance，随后才释放 current freeze。这样一次 update 授权不会被扩大为 lifecycle 变更，失败 Candidate 后的恢复决定也可单独报告。

替代方案是 `update --force` 或自动把 Candidate failure 当成 reopen。前者把两个授权合并并弱化审计，后者让 selection owner错误接管 Verification authority，因此不采用。

### 2. 用不可变 generation ref 保存历史 freeze，current ref 只表示当前租约

每次 `freeze` 同时确保：

- `refs/buildr/release/<version>/freezes/<generation>` 不可变地指向该 generation 的 release commit；
- `refs/buildr/release/<version>/frozen` 指向 current Candidate source。

`reopen` 保证 legacy/current freeze 已写入对应历史 ref后，按 expected old value删除 current `frozen` ref。read model 返回按 generation 排序的 `freezeHistory`；selection identity 包含 current freeze 与历史摘要。reopen 后状态回到 `ready`，旧 Candidate 因 current selection identity/status 不匹配而 stale；追加 commit 后 generation 递增，再次 freeze 形成新 source。ref 写入使用 Git update-ref 的 compare-and-swap/transaction 语义，remote branch、Candidate 和公共事实均不在该动作内变化。

替代方案是直接移动单一 frozen ref。它会丢失旧冻结点，无法解释失败 Candidate 的来源，因此不采用。

### 3. publication 边界由 release workflow 核验，selection owner不接受 caller-claimed success

`reopen` 本身只改变本地 lifecycle refs，是可恢复的 checkout-only Git 动作；它不声称 npm/tag/GitHub Release不存在。`buildr-release` 在调用前必须从 GitHub、Git tag、npm registry 和 protected workflow current facts证明尚未产生公开/不可逆 publication。若版本、tag、GitHub Release或已开始公共 mutation 的 protected transaction存在，workflow 停止并要求新版本，不能把布尔参数当成证明。

这保持了 owner 窄边界：selection 管本地选择和 provenance，publication owner 管公共事实。即使外部调用方绕过 Skill 执行本地 reopen，下游 readiness 仍必须按 source identity 和已存在公共事实 fail closed。

### 4. release Task 与 support Task 分开完成语义

新的 release 准备中：

- `release-<version>` 是完整准备协调 Task，intent覆盖 selection、Candidate、唯一 tarball、release→main 与零副作用 readiness；上述事实未全部 current 时保持 active/blocked，不调用 Task Finish/complete。
- 版本、CHANGELOG、测试修复或 owner修复等可独立形成 Development/Verification/Finish 的内容使用窄 support Task；完成 support Task不传播为 release Task completed。
- release preparation 达到既定终点后，协调 Task 才以其完整结果摘要进入 terminal；publication 仍是后续独立授权，不能因 Task completed 自动 dispatch。

通用 Task Record 不理解 release domain，也不增加 release-specific字段；硬边界由 `buildr-release` 的流程和契约测试保护。当前已经错误 completed 的 `release-0.1.0-rc.22` 不重写、不伪造 reopening；本修复交付后使用明确标识的 active recovery Task承载剩余准备，并在报告中同时保留旧终态与恢复关系。

## Risks / Trade-offs

- [Risk] 只靠 Skill 约束 release Task 完成时机，通用 Task CLI 仍可被人工提前调用 → release contract tests固定 owner顺序，release readiness/correlation必须展示真实 Task角色；提前终态按恢复事实报告，不能被 readiness 当成完整准备成功。
- [Risk] 历史 freeze refs 增长 → 每个 selection generation最多一个小型 Git ref，cleanup 在独立授权下枚举并删除全部本地 lifecycle refs。
- [Risk] reopen 与 concurrent ref mutation竞争 → 所有 current ref 删除/创建绑定 expected commit，漂移时零后续 update并返回 current facts。
- [Risk] legacy release 只有单一 frozen ref → 首次 reopen/freeze时幂等补建该 generation 的历史 ref，不回填不存在的 Candidate正文。
- [Trade-off] 当前 rc.22 的错误 completed Task保持历史事实 → 用 active recovery Task继续比通用重开 terminal Task更安全，但用户界面会同时看到原错误终态和清晰的恢复记录。

## Migration Plan

1. 扩展 selection read model、CLI 和测试，支持 history refs、`reopen`、legacy freeze迁移与cleanup。
2. 更新 canonical specs、`buildr-release` 和 contract tests，固定 support/coordination Task边界与 Candidate失败恢复。
3. 完成正式验证与自举交付后，在 rc.22 release worktree回读公开事实，显式 reopen，依次选择 preflight修复与本 owner修复，重新 freeze/push并运行新 Candidate。
4. rc.22 使用新的 active recovery Task承载剩余准备；旧 completed Task只作为历史异常事实保留。

## Open Questions

无。
