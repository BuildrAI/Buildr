## Context

当前 Buildr 发布把 `origin/dev` 的最新 tree 直接冻结为 `dev → main` Candidate。这个模型能发布全部已交付内容，但不能表达维护者只选择部分 `dev` commit 进入某个版本；后续流程只能用版本、近似 Git ref 或历史 stdout 拼接 Candidate、Task、Finish、自举和 publish 事实。

当前 `dev` 已完成服务架构拆分：Bootstrap 是唯一 composition root；`tools/release`、`system/installation`、`verification`、`task` 和 self-bootstrap 已有各自 owner。Hosted Windows、Host Node、Launcher、exact Node/PATH、primary evidence owner、affected/full、bounded scheduling、heartbeat/checkpoint、timing、唯一 Candidate tarball和受保护 npm transaction也是当前基线。本设计只定义 release 集合引入的差量，不迁移这些 owner。

## Goals / Non-Goals

**Goals:**

- 给 `release-<version>` 建立唯一集合语义、授权边界、生命周期和可验证 provenance。
- 让 release HEAD/tree 成为 Product Candidate、唯一 tarball、release→main 与 transaction context 的共同 source。
- 让 Task、Finish、self-bootstrap、Verification、GitHub 和 npm 事实通过窄 read model/digest 关联，不复制专业 Result。
- 明确跨模块 owner/consumer 和禁止写入边界，使后续 P1-A、P1-B、P1-C 可以并行实现。

**Non-Goals:**

- 不在本 Change 实现 selection CLI、Candidate workflow、evidence adapter、readiness runner、Git 收敛或 publish mutation。
- 不改变公开 Buildr CLI/HTTP/JSON、npm package 格式、SQLite migration、Project Verification declaration 或 Task Result schema。
- 不把 Parent Plan、Brief、current knowledge、Skill 或 checklist 变成规范 authority。

## Decisions

### 1. Release 是人工选择集合，不是自动追随分支

一个版本只有一个逻辑 `release-<version>`。创建时必须绑定维护者指定且当前可从 `dev` 证明的精确 baseline commit/tree；后续只有两类合法内容变化：维护者明确选择的 `dev` commit 通过 `cherry-pick -x` 纳入，或 release owner 为同一版本写入明确授权的 release-only metadata。普通 `dev` 前进不会改变 release。

选择 `cherry-pick -x` 而不是 merge/rebase，是为了让每个纳入项保留 source commit provenance，并让冲突在产生成功 release commit 和 remote update 前暴露。release branch 不接受直接编辑、自动冲突解决、reset、force push 或隐式“跟上最新 dev”。

### 2. 身份链只组合 owner facts

共同链路为：

`dev baseline → ordered selection chain → release HEAD/tree → Candidate generation → frozen tarball manifest/integrity → main tree → post-publish dev convergence → release transaction context/evidence`。

每个节点保存或返回其 owner 的稳定 identity；下游只引用 identity/digest和必要的 portable summary。release HEAD 或 tree 一旦变化，旧 Candidate、artifact、readiness 和 transaction context立即 stale。Candidate generation由 Verification owner管理，Task Candidate generation与 Product release Candidate run仍是不同 authority，不得互相伪造。

不建立 release 专属 SQLite 旁路 slot。Selection 的 closed read model从 release owner可验证的 Git/ref/provenance事实形成；Task、Finish、self-bootstrap和Verification继续由现有 Application/store提供 current read model；正式 transaction evidence继续进入既有 GitHub release evidence artifact。

### 3. 生命周期动作独立授权且失败隔离

- `create`：创建本地 release ref/checkout前核验version、baseline、branch冲突与授权；不隐含push。
- `update`：只对维护者明确列出的 `dev` commit逐个执行 `cherry-pick -x`；每个成功项形成新的 release HEAD，冲突立即停止并保留可诊断现场，不自动解决或继续后续项。
- `freeze`：只读冻结current release HEAD/tree与selection chain，供Candidate lease消费；内容变化自动使冻结结果stale。
- `abandon`：只标记当前选择流程不再推进，不删除已共享ref、Task/Finish/Verification或公开发布事实。
- `cleanup`：只在已证明不再需要恢复、且精确owner/ref可复核时清理本地资源；远端release branch删除始终需要独立明确授权。

这些动作不组合成跨Git/GitHub/npm原子事务。部分成功必须如实保留；Publication成功后Activation、Cleanup、Diagnostics或dev convergence失败不撤销公开发布事实。

### 4. 模块 owner/consumer 矩阵

| 模块/入口 | 唯一 owner | 提供给下游 | 禁止行为 |
|---|---|---|---|
| `services/buildr/tools/release` | release selection、readiness/convergence adapters和checkout-only Git provenance | baseline、selection chain、release HEAD/tree、freeze/cleanup read model | 写Task/Verification/Finish/self-bootstrap store；执行未经授权公共mutation |
| `src/system/installation` | SemVer、package/version、release track与installation identity | version/tag/dist-tag语义 | 拥有release branch、Candidate或publish transaction |
| `src/verification` 与 Candidate workflow | Product verification registry、execution、Candidate run/generation、唯一tarball evidence | matching source、coverage、artifact manifest/integrity | 修改release branch或Task专业事实；在publish中重跑完整Candidate |
| `src/task` | Task Record、Environment、Development、Task Verification、Finish、Execution Record与Parent Coordination | current Task/handoff/Delivery/Result read model | 保存release selection正文、GitHub/npm事实或self-bootstrap完成声明 |
| `buildr-self-bootstrap-sync` runner | matching retained Activation、development entry和Doctor closeout | stable self-bootstrap result/readback | 修改Delivery、Publication或release selection；成为第二Finish writer |
| Bootstrap | 唯一模块装配与公开入口 wiring | requires/provides绑定 | 实现release业务规则或创建第二composition root |
| `.github/workflows/publish.yml` protected transaction | tag、npm、dist-tag、GitHub Release与Registry readback公共mutation | terminal transaction evidence artifact | 创建第二tarball、重跑完整Candidate、写本地Task/Finish/self-bootstrap store |

### 5. Candidate 与 publish 复用当前验证基线

完整 Product Candidate 改为绑定 current release HEAD/tree。现有 macOS/Windows/Host Node/Launcher、exact Node/PATH、primary evidence owner、bounded scheduling、heartbeat/checkpoint和timing不重建；只调整 source/ref admission和currentness。Candidate artifact producer只为一个source生成一个tarball，正式publish验证matching Candidate/context后消费相同bytes。

开发feedback仍针对普通feature/`dev`变化运行affected；它不是完整Candidate。release内容变化产生新SHA后必须重新形成完整Candidate，旧run或旧artifact不能拼接复用。

### 6. release→main 与发布后 main→dev 分为两个收敛点

Candidate通过后只允许一个受保护release→main PR。仓库策略可以squash，因此commit identity可以不同，但`main^{tree}`必须等于冻结release tree。正式publication只对matching current main/release Candidate授权。

公开发布成功后才执行main→dev收敛。该动作必须保留publication期间已经进入dev的新内容，拒绝`ours`、reset、force push和静默冲突解决。收敛失败返回独立的`published-but-dev-convergence-blocked`事实，不回滚tag/npm/GitHub Release。

## Risks / Trade-offs

- [选择链与release-only metadata混合导致来源不清] → read model区分selected dev commit与release-owned metadata，并为两类写入分别要求授权和provenance。
- [并行Child各自发明identity或store] → 本Change固定身份链、owner矩阵与禁止写入边界；P1-A/P1-B/P1-C只实现各自公开read model。
- [release SHA变化后误用旧Candidate] → 所有Candidate、artifact、readiness与transaction context绑定release HEAD/tree，任一不等即stale。
- [发布后dev已经前进] → main→dev作为独立P3收敛动作，保存新内容并在冲突时停止，不用历史形状替代tree/content判断。
- [契约先行而当前实现仍是旧流程] → active Change、Skill和checklist明确标注迁移中；只有后续实现Change收敛后canonical knowledge才描述新流程为已实现。

## Migration Plan

1. 本P0 Change建立canonical delta、owner矩阵、术语和维护者入口边界。
2. P1-A实现selection/provenance；P1-B实现release HEAD Candidate与唯一artifact；P1-C实现Task/Finish/self-bootstrap correlation。三者依赖P0后可并行。
3. P2在三个read model稳定后实现共享readiness与受保护transaction。
4. P3实现release→main、发布后main→dev与branch closeout。
5. 最终Parent集成验收后，移除旧`dev → main`准备路径及兼容代码；任何阶段发现规范冲突都停止后续公共mutation。

回滚仅回退尚未公开的实现和branch工作流；已成立的tag/npm/GitHub Release事实不可通过回滚代码抹除，必须走新版本或明确恢复流程。

## Open Questions

无。Selection read model的具体closed schema字段名由P1-A在本契约身份链和owner边界内确定；字段命名不得改变scope、authority或新增store。
