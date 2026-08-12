## Context

P0.5 已把 Task Development 建成 Candidate/generation 与 Development Handoff 的唯一 authority，并把 Task Finish 替换为固定五阶段 v2 adapter。随后四个窄 Change 又交付了 retained target branch、真实 delivery remote/remote readback、target-race exact resume 和 Delivery Adaptation。当前 executor、Skill/contract、technical knowledge 与真实 journey 基本一致，但更早的 canonical workflow、package requirement、Roadmap 和 CLI help 仍保留旧 Candidate/Change/Verification/convergence 路由。

当前实现只有一个真实 receipt-bound adapter：Buildr Product 的 Git direct-to-target delivery。通用五阶段 shell 位于 `task-finish-run.mjs`，Git carrier、remote、retained activation 与 cleanup handoff 位于 Product executor。没有第二个真实 adapter，因此现在抽取 registry 或公共选择协议只会扩大架构。

## Goals / Non-Goals

**Goals:**

- 让 canonical specs、Roadmap、current knowledge、Skill/contract、CLI help、registration 和测试只表达当前 v2 authority。
- 删除仍可能让新任务走向旧 Candidate/Change/Verification/convergence writer 的路由残留。
- 保留正常路径一次 canonical CLI、同一 run exact resume、单一 next action 与 `formalVerificationExecutions = 0`。
- 用 negative verification 防止旧参数、旧 action、旧 binding 和旧说明重新出现。

**Non-Goals:**

- 不新增 non-Git、multi-repo、task-branch、PR、release、deploy 或跨 generation delivery effects。
- 不重写 Task Development、Task Environment、Git Operations 或 Metadata Publication。
- 不新建 Finish Receipt、adapter registry、插件体系、通用状态机、transaction framework、lease/CAS 或第二 capability graph。
- 不删除历史 archived Change 或只读历史文件；只清除 current runtime/current docs 中可达或可被误路由的残留。

## Decisions

### 1. 先固定最小边界，不按文件拆出抽象层

Task Finish 通用边界只表达 current handoff、carrier preparation、carrier equivalence、delivery effects、cleanup eligibility 与 run/resume facts。Git remote/branch/fast-forward/push 留在当前 Git delivery adapter；Buildr sync/Doctor/CLI/Local App install 留在 Product retained activation；Environment cleanup 继续只通过 Task Environment Application。

不选择“抽取 adapter registry”。当前没有第二种真实 adapter、selection authority 或独立 E2E fixture，提前抽象无法减少 writer，也会引入新公共决策面。

### 2. 只在 Development applicability 真 stale 时返回 Development

原 Task source、Task Context、policy、gate 或 handoff 由 Task Development Application 报告 stale 时，Finish 终止并返回 `task-development`。Delivery Baseline 前进、Git apply conflict、target-race、retained activation 和 cleanup 暂态问题都不改变 Candidate；它们在同一 run 上使用产品生成的 exact token恢复。Agent 只能在 run-owned carrier 做 Delivery Adaptation，不能修改原 Task worktree。

这直接替换 current workflow 中“Git conflict/target advancement 必然重建 Candidate”的旧句子，不增加新的状态或兼容分支。

### 3. CLI 只暴露 Task 与产品恢复 identity

首次 `task finish run` 只要求 `--task`，并从 Task Environment 与 Task Development Application 解析 handoff/Candidate/Content Target；target branch 默认来自 retained Workspace 当前符号分支，remote 来自显式参数、Environment evidence、branch upstream 或唯一 configured remote。`--project`、`--change`、assurance、Result bytes 和 caller-authored Candidate 继续被拒绝。

`openspec baseline/check/converge` 可以作为各自 OpenSpec 兼容或维护入口存在，但任何 current help、Skill 或 runtime routing 都不得把它们描述为 Task Finish stage/action。

### 4. 直接修正 current package requirement，并增加 residual gate

旧 package requirement 仍提到 worktree-lifecycle/Git task-integration providers、OpenSpec archive、EOF 修复、验证证据复用和 selected provider merge policy。它将被完整替换为 current `task-development`、`task-environment` 与 optional `git-operations` capability topology，以及五阶段 Product journey。

验证同时正向断言 current Skill/contract/help/registry/schema/runtime projection，负向扫描旧 action、旧 authority 参数、旧 capability ids 和旧路由文案。archive history 与显式 migration fixture 排除在 current residual gate 外。

### 5. Roadmap 将 P0.8 第一阶段记为边界收敛，不宣称新交付路径

Roadmap 更新为：P0.5 adapter 已经包含 Delivery Adaptation 与 exact resume；本 Change 完成 current boundary residual cleanup。P0.8 的未来扩展仍需要真实 consumer、明确目标/equivalence/authorization/cleanup 和独立 E2E，再由新的窄 Change选择，不把本次维护写成 non-Git 或多交付能力完成。

### 6. 可执行残留审计以 zero-delete 关闭

Application/CLI registry与bootstrap、compose runtime、run/result JSON schema、managed mutations、capability manifests/bindings及真实System journey均只指向current v2 Application与Product executor；不存在第二旧writer、router、binding、adapter selection或recovery executor。旧v1 run只有显式fail-closed reader测试，不是可达迁移入口。因此本Change只删除current authority文本中的旧路由，并用negative gate保持zero-delete证据，不制造空迁移或新框架。

## Risks / Trade-offs

- [旧 canonical requirement 被其他测试引用] → 先用全文 delta 替换对应 Requirement，并同步 contract/static/runtime tests，避免 archive 时丢失 Scenario。
- [只改文案而遗漏可执行 route] → 同时扫描 CLI registry/bootstrap、compose runtime、package graph、JSON schema、managed mutations 和真实 journey；residual gate 覆盖 current assets。
- [把 Product 特例误上升为通用 contract] → delta 只规定 authority 与分层，Git/Buildr 细节继续留在 current adapter；不新增公开 adapter schema。
- [清理过度影响历史 inspect] → current code 已拒绝 v1 run；历史 archive 保持不改，只有真实 current reader consumer 才允许保留。

## Migration Plan

1. 通过 proposal baseline/check 固定当前 canonical facts 与 active Change 冲突边界。
2. 更新 canonical delta、Roadmap/current knowledge、CLI help、package Skill/contract 和 residual verification。
3. 运行 focused 与 affected verification，再运行完整 Product Candidate 和 Task Finish 真实 journey。
4. 由 Task Development 形成 current Candidate/handoff，使用 Task Finish v2 交付；retained source 集成后 sync Codex runtime、安装受影响入口并运行 Doctor。
5. 若需要回滚，只回滚本 Change 的 docs/help/test residual；不迁移或重写已存在 v2 run。

## Open Questions

无。未来交付路径没有满足本 Change 的真实需求门槛，因此不在本次选择。
