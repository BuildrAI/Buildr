## Context

当前 `verify.yml` 已把完整候选版拆为唯一产物、macOS core、Windows runtime/lifecycle、宿主 Node 和最终 aggregate，但每个作业自行执行依赖与生成物准备。正式 `release-<version>` 冻结后才会运行这张完整图，因此干净检出或平台作业的准备缺口会迫使维护者反复 `reopen`。

本设计在正式发布集合之外引入发布演练（Release Rehearsal）。演练源从 current frozen release commit 开始，按维护者给出的有序 `dev` commits 执行与正式选择相同的 `cherry-pick -x`，形成可由 GitHub 检出的临时载体。演练和最终候选版使用同一 workflow、registry、分片与 aggregate，只以显式 purpose 和身份区分。

## Goals / Non-Goals

**Goals:**

- 在正式发布集合变化前，用精确预期发布 commit/tree 完成全平台完整演练。
- 同一支持任务可以持续更新演练源并重复运行，失败不产生正式 selection generation。
- 全绿演练结果可以原子提升为正式 release HEAD，保证最终候选版验证的是同一 commit/tree。
- 所有候选作业通过统一候选环境准备入口恢复其声明档位需要的依赖、DTO、测试上下文和 `web-dist`。
- 演练与最终候选版共用一张 `fail-fast: false` 的验证图和同一 aggregate 契约。

**Non-Goals:**

- 不自动发布 npm、创建标签、GitHub Release 或请求 Environment 审批。
- 不让演练结果替代正式候选版验证、`main` coverage 或发布授权。
- 不把临时演练分支变成长期发布集合、下载渠道或第二套制品权威。
- 不让普通开发反馈自动升级为发布演练。

## Decisions

### 1. 演练源使用可提升的精确 Git commit

`release-rehearsal.ts prepare` 在 owner 管理的临时 worktree 中，从 current frozen release commit 按顺序执行 `cherry-pick -x`，生成演练 commit chain，并推送确定性 `codex/release-rehearsal-<version>-<identity>` 载体。它不移动 `release-<version>`、freeze refs 或协调任务状态。

选择这一方式，是因为仅在 `dev` HEAD 上演练会包含未选择内容，单纯比较 patch 也不能证明最终发布树。演练 commit chain 可以在全绿后由 selection owner 以 fast-forward 原子提升，正式 release commit/tree 与演练完全相同。

### 2. 全绿后使用单一 `promote-rehearsal` 动作

`release-selection.ts promote-rehearsal` 接收 current rehearsal evidence、显式确认和原因，重新读取 frozen selection、GitHub run/aggregate、remote carrier 与 current dev provenance。全部匹配时，它保留旧 freeze history，一次性把 Task release branch 与正式本地 release ref fast-forward 到演练 commit，并写入新的 current/history freeze。任何漂移均零写入失败。

这代替“reopen → 多次 update → freeze”的修复路径，避免正式集合在未全绿时处于 open 状态。普通首次选择仍保留既有 create/update/freeze 行为；失败候选的修复必须走演练提升。

### 3. 一张 workflow，两种用途

`verify.yml` 的 `workflow_dispatch` 增加 `purpose`、`expected-source-tree` 与 `rehearsal-identity` 输入。`candidate` 与 `release-rehearsal` 使用完全相同的 jobs、matrix、唯一 tarball、evidence 和 aggregate。入口在任何测试前核验 checkout commit/tree 与输入；aggregate记录 purpose 与 rehearsal identity。

不用复制第二个 workflow，避免演练与最终候选版覆盖范围漂移。最终候选版仍要求 current frozen selection；演练只证明 prospective release source。

### 4. 候选环境准备成为唯一 owner

新增 `tools/verification/candidate-environment.ts`，提供闭合档位：

- `base`：安装 Buildr Service 依赖并生成 DTO 与 Test Context；
- `artifact`：`base` 加 Buildr Web 依赖，供唯一产物构建；
- `source-runtime`：`artifact` 加源码 checkout 的 `web-dist`；
- `host`：只安装运行 Host Node consumer 所需依赖。

workflow job 只调用一个档位，不再直接组合 `npm ci`、`artifacts:prepare` 或 `prepare-development-web.ts`。工具使用当前 Node 相邻 npm、两个锁文件和明确 Service root，输出无凭证的准备结果；重复执行必须收敛到同一逻辑状态。

### 5. 失败保留完整证据并回到同一支持任务

matrix 保持 `fail-fast: false`。产物构建失败时，真正依赖产物的作业仍不可运行，但 preflight 与 bootstrap 必须输出完整诊断；产物成功后所有并列分片尽量完成并由 aggregate 一次列出失败。演练失败只更新演练历史，不触碰正式 selection。

## Risks / Trade-offs

- [演练成本接近完整候选版] → 只对准备进入发布集合的提交运行；支持任务内可先用 focused/affected 缩短反馈，准备结束前再运行完整演练。
- [远端演练载体增加临时分支] → 使用确定性命名与 owner evidence；提升或放弃后由 rehearsal owner 精确清理，绝不删除正式 release ref。
- [GitHub 成功状态被伪造或陈旧] → promotion 时重新读取 run、attempt、head SHA、aggregate、artifact 和 carrier，不信任调用方布尔值。
- [统一准备入口增加每个作业耗时] → 通过档位避免无关作业安装 Buildr Web；缓存仍绑定对应锁文件。
- [首次迁移需要兼容既有 release] → 已冻结但尚未公开的集合保留历史；只有后续失败修复使用 rehearsal promotion，旧 Candidate evidence 不复用。

## Migration Plan

1. 新增统一候选环境准备及测试，迁移 `verify.yml` 的所有候选作业。
2. 扩展 Candidate evidence/aggregate 的 purpose 与 source tree identity。
3. 新增 rehearsal prepare/inspect/cleanup owner及闭合 evidence。
4. 新增 selection rehearsal promotion 与漂移测试。
5. 更新发布 Skill、检查清单、当前知识和术语。
6. 在当前 `rc.30` frozen generation 7 上，以待选支持提交构造演练源并运行到全绿；全绿前不改变正式集合。

回滚时可以恢复旧 workflow 调用，但不得把未通过演练的提交提升到正式集合；已有正式 freeze history、失败 Candidate run 和公开事实保持不变。

## Open Questions

- 无。首版明确支持一个或多个有序 `dev` source commits，并以 exact rehearsal commit/tree 作为提升对象。
