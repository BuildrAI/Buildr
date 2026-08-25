## Context

现有 release owner 分散拥有 selection、Candidate/readiness、protected transaction 与 Git convergence，但协调 Task 在 readiness 后提前结束。rc.22 的同一 version 因 Candidate 与 cleanup 修复产生多个协调 Task；同时，同一 `release-<version>` head 在前一代 PR 已合并后不能再次创建新的同 head PR，现场通过 `codex/release-main-<version>-gN` 中间 branch 完成后续 generation，却没有产品 owner。当前本地 selection cleanup 把 remote-tracking ref 当成正式远端删除前置，main→dev 又直接创建双父 merge commit并依赖 `dev` 管理员绕过线性历史保护。

约束包括：publication 必须继续独立获得维护者授权；Task Record 不增加发布状态字段；已成立的 tag/npm/GitHub Release 不可因后续维护失败回滚；support Task 保持独立；正式远端 release branch 默认保留。

## Goals / Non-Goals

**Goals:**

- 从各 owner current facts 派生一个 version-scoped lifecycle read model和稳定 recovery identity。
- readiness 后保持唯一协调 Task active，直到 publication、main→dev 与必需 closeout 全部成立。
- 原生创建和清理 generation-scoped release→main carrier，并为 main→dev blocked 恢复提供确定性 identity。
- 区分正式 release ref、remote-tracking projection 与中间资源，形成幂等 closeout。
- 在 remote mutation 前验证 `dev` 允许产品拥有的 merge commit，不依赖管理员绕过。

**Non-Goals:**

- 不修改通用 Task Record schema或允许 terminal Task reopening。
- 不自动取得 publication、PR、push或正式远端 release branch删除授权。
- 不回写历史 rc.22 Task，也不执行真实发布。
- 不把 support 修复内容并入协调 Task Development/Finish。

## Decisions

### 1. Lifecycle 是派生 read model，不是 Task Record 状态机

新增 release lifecycle projector，输入唯一 Task、selection、Candidate/artifact、readiness context、publish evidence、Git convergence与closeout facts，输出阶段：`selection`、`candidate`、`awaiting-publication-authorization`、`publishing`、`published-convergence-pending`、`closeout`、`closed`。recovery identity绑定 version、Task ID、selection generation/identity、context digest和适用publish run；不增加旁路SQLite writer。

选择派生模型而不是持久阶段表，是为了让 GitHub/npm/Git current facts仍是不可逆步骤authority，并避免 Task Record成为发布workflow store。

### 2. 唯一 Task 在 readiness 后保持 active

release correlation接受且要求current协调 Task为`active`直到 lifecycle `closed`。readiness 只形成 `awaiting-publication-authorization`，不调用Task Finish/complete。protected publication、main→dev和必需closeout完成后，Release Skill才完成该无代码协调 Task。terminal历史异常只读保留，产品不为其补造reopen；新规则适用于后续版本。

### 3. generation-scoped release→main carrier 由 Git convergence owner持有

carrier branch固定为`codex/release-main-<version>-g<generation>`，必须精确指向冻结release HEAD。owner以compare-and-swap创建/复用本地与远端carrier，PR head使用carrier而不是正式release branch；同generation至多一个PR。main tree等价后，closeout删除owner可证明的本地/远端carrier，而正式远端`release-<version>`保留。

该设计允许同version新generation在旧PR已合并后创建新PR，同时保持正式release ref作为长期审计入口。

### 4. main→dev使用确定性 recovery identity并显式检查策略

main→dev继续以普通merge保留main ancestry与publication期间的dev新内容。recovery identity绑定publication evidence、main/dev before refs和预期merge tree；冲突、remote race或push拒绝均返回同一version-scoped恢复事实。执行push前必须消费branch policy observation并要求merge commit可被目标策略接受；`required_linear_history=true`时在push前blocked，不把管理员绕过当成功路径。

保留线性历史但同时要求main ancestry需要重写dev，违反现有禁止force push与保留dev内容约束，因此本设计明确选择“允许产品拥有的merge commit”作为长期策略。

### 5. Closeout区分必需资源与可选正式ref删除

必需closeout包含：本地release branch、`refs/buildr/release/<version>/**`、owned release worktree、generation carrier和临时convergence worktree。remote-tracking ref只是投影，不阻塞本地清理。正式远端`release-<version>`默认保留且必须等于冻结release commit；删除它继续使用独立显式授权，不属于 Task completion门禁。

closeout返回逐资源 disposition与整体`passed|blocked`，重复调用必须幂等，未知ownership或ref漂移保持零删除。

### 6. 黄金生命周期使用隔离Git/GitHub adapter测试

新增一个集成fixture串联 lifecycle projector、selection、carrier PR、publication evidence、main→dev与closeout。GitHub/branch policy通过窄adapter注入，不访问真实仓库；测试同时证明Task在授权等待期active、恢复不产生第二协调Task、正式remote release ref保留且中间资源为零。

## Risks / Trade-offs

- [现有 `dev` 仍要求线性历史] → 在产品代码中预检并明确blocked；交付后由仓库维护者把策略调整为允许merge commit，测试不得依赖管理员绕过。
- [旧release Task已terminal，无法复用] → 保留历史异常，不迁移或重开；统一生命周期从新版本开始生效。
- [跨GitHub操作的ownership证据不足] → carrier命名、generation、commit、PR head/base全部纳入read model，任何漂移零删除失败关闭。
- [closeout扩大删除风险] → 只接受确定性owner ref、精确expected commit与受控临时根；正式remote release ref默认永不删除。
- [等待授权使Task长期active] → Environment可幂等inspect/恢复，发布阶段从冻结commit和保存的recipe重建；active不等于持续占用运行进程。

## Migration Plan

1. 先增加兼容active release Task的lifecycle/correlation read model和测试。
2. 切换release→main到generation carrier，并增加幂等closeout。
3. 修改selection本地cleanup和main→dev策略预检。
4. 更新Release Skill、checklist与current knowledge，后续版本只创建唯一协调Task。
5. 不迁移或修改既有terminal Task；旧调用若未提供generation/policy observation则明确blocked，不执行remote mutation。

## Open Questions

无。`dev`长期策略采用允许产品拥有的merge commit；正式远端release branch默认保留。
