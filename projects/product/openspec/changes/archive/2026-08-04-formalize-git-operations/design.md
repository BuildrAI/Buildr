## Context

当前 package graph 把同一个 `git-ops` Skill 绑定为三项 capability：

| 现有能力 | 当前真实 consumer | 处置 |
|---|---|---|
| `git-ops` Skill | direct Git intent 的 runtime discoverability；三个旧 contract 的默认 provider | **替换并删除**：改为唯一 `git-operations`，不保留 alias 或双入口 |
| `buildr.git-single-operation/v1` | `task-finish` 的 retained metadata-only optional dependency；Buildr 产品入口的独立 Git 动态路由 | **合并并替换**：迁移到 `buildr.git-operations/v1` |
| `buildr.git-task-integration/v1` | 无 manifest consumer；仅剩文档示例和 capability replacement 测试 | **删除**：P0.5 Task Finish 已不消费它，不为旧测试保留孤儿 contract |
| `buildr.git-workspace-update/v1` | 产品入口 Buildr Skill 的 Git-managed workspace update 动态路由 | **合并并替换**：Buildr Skill 继续决定 update 动作与 sync 顺序，Git Operations 只执行已选定动作 |
| `buildr.git-worktree-provider/v1` | Task Environment 通过 `task-worktree` 取得 checkout/branch/HEAD/registration evidence | **保留**：它是确定性窄 provider，不属于本 Change 的行为入口 |
| 三项旧 bindings、bootstrap/CLI routing 和旧测试 schema | capability resolver、runtime evidence 与 package verification | **删除或迁移**：只验证新 contract/provider，不保留兼容双轨 |

当前没有可迁移的 Git Operations Receipt、Application state 或数据库。P0.6 的权威内容因此只需要 Product source 中的一份 Skill playbook、一份 capability contract、manifest graph 和 consumer routing。

## Goals / Non-Goals

**Goals:**

- 为 consumer 已选定的一次 Git Operation 提供一致的输入、授权、安全默认值和最小 Result。
- 让 commit、push 和 commit+push 的边界可预测，并保护无关 dirty、scope 外 unpublished commits 与共享历史。
- 失败后保留并报告已发生 effects，不自动换策略或掩盖部分成功。
- 一次性迁移真实 consumers，并让旧 Skill、contracts、bindings、router、docs 和 tests 的 current residual 为零。

**Non-Goals:**

- 不新增 Application、公共或内部 Git CLI、Receipt、持久 schema、数据库、状态机、锁、CAS、scheduler 或 transaction coordinator。
- 不把 Skill 写成 Git 教程或 checkout/reset/cherry-pick/stash/branch-delete 命令全集。
- 不让 Git Operations 选择 operation、remote/source/target ref、组合顺序、冲突语义或交付策略。
- 不自动 stash、reset、rebase、merge、force push、改写共享历史或切换策略。
- 不实现 P0.7 metadata publication，不扩展 P0.8 Task Finish 的产品执行器。

## Decisions

### 1. 一个 Skill 配一份薄 capability contract

新增 `git-operations`，只提供 `buildr.git-operations/v1`。contract 只固定 consumer/provider 之间不可丢失的行为信封；执行仍由 Agent 使用现有 Git 工具完成，因此建设形态仍是 Skill-only。

保留 contract 而不是只留裸 Skill，是因为 Task Finish 已有真实 optional dependency，产品入口也需要在 provider 被替换或卸载时 fail closed。把三项旧 contract 原样重命名会继续暴露重叠 authority；完全删除 contract 则会让真实 consumer 失去 readiness 和替换边界。

### 2. Consumer 先选动作，provider 不做意图编排

调用前必须明确 repository、operation、相关 local/remote refs、精确内容或 commit scope，以及获准 effects。直接用户指令可以充当 consumer；Task Finish 与 Buildr Skill 则分别拥有自己的组合解释和顺序。

- `commit` 只提交，不 push。
- `push` 只发布已有 commit，不把 dirty 自动提交。
- `commit+push` 是 caller 依次请求两个 operation，不是原子 transaction；每步分别返回 Result。
- workspace update 仍由 Buildr Skill 选择明确 update operation、upstream 和后续 sync；出现 dirty、divergence、冲突、缺失 upstream 或策略选择时 Git Operations 返回 `blocked`。

### 3. 写入前观察 identity 与授权范围

每次 operation 在写入前观察实际 repository、branch/HEAD、working tree、相关 local ref，并在远端动作适用时观察 remote/ref。输入或事实不完整、repository/ref 不匹配、授权不足时零写入 `blocked`。

commit 只 stage consumer 明确归属的 paths/hunks；禁止 `git add -A`。同一文件混有不同归属时，只有 hunk 边界可可靠分离才允许继续，否则 blocked。无关 dirty 保持原样。

同一 Task 在两次 push 之间默认只维护一个尚未共享的可变 commit：只有能够证明当前 commit 未共享、归属当前 scope 且 operation 允许时才 amend；一旦 push 或以其他方式共享，该 commit 冻结，后续变化创建新 commit。撤销共享提交默认新增 revert，但本版不把 revert 扩展成独立命令手册。

### 4. Push 校验完整 publication range

push 前以实际 destination remote/ref 和 source ref 计算本次将新增到远端的完整 commit range，并逐个确认处于 consumer 授权 scope。任何 scope 外 unpublished commit、remote/ref 漂移、无法建立可信 range 或 push rejection 都 blocked；不得只检查 tip commit，也不得自动改为其他 ref、force push、rebase 或 merge。

### 5. Result 按 operation 最小化，部分失败显式化

Result 不是 Receipt，也不持久化。每次 operation 只返回适用字段：

- `repository`、实际 `operation`、`succeeded | blocked` 与 reason；
- before/after branch 与 commit identity；
- 适用的 remote/source/target ref 和完整 push range；
- `treeChanged`、`historyChanged`、`remoteChanged`；
- 已经发生的 `effects` 与当前 repository 状态。

不要求所有 operation 填充统一大 schema。`commit+push` 中 commit 成功而 push 被拒绝时，caller 保留 commit Result，并得到 push 的 blocked Result；后者明确 remote 未变、local history 已在前一步改变。恢复和重试由 caller/Agent 重新核验事实后决定。

### 6. 一次性 capability graph cutover

同一 Change 内完成：新增 contract/Skill → 迁移 Task Finish 与 Buildr Skill → 更新 manifests/bindings/bootstrap/docs/tests → 删除旧 Skill/contracts/bindings。`task-worktree` 只把文字中的 integration provider 名称改为 `git-operations`，其 contract、Application 调用和 evidence 不变。

不提供 alias、compatibility binding 或双 provider。provider replacement 测试只替换 `buildr.git-operations@1`；旧 ID 在 active source、current specs、current docs 和可执行测试中必须归零，archive 历史不作为 runtime residual。

## Risks / Trade-offs

- **[Risk] Skill-only 无确定性 Git engine，无法由产品代码强制每条命令。** → 用 contract、明确 playbook、静态语义测试、provider replacement/System tests和真实临时仓库验证共同保护；不伪装成 Application guarantee。
- **[Risk] 合并 workspace update 后 provider 可能重新选择策略。** → Buildr Skill 必须提供已选 operation/upstream；遇到 divergence 或任何策略选择一律 blocked，不自动 rebase。
- **[Risk] 完整 push range 可能让原本“只看 tip”的推送被阻止。** → 这是预期 breaking safety gate；caller 显式扩大授权后才能重试。
- **[Risk] 删除旧 IDs 会阻塞自定义 provider。** → package update 是 breaking cutover；诊断明确报告新 contract，用户必须迁移 provider，不能由 builtin alias 隐式掩盖。
- **[Trade-off] Result 不持久化，无法提供操作历史查询。** → P0.6 只需调用期 evidence；需要持久 publication/delivery effects 时分别由 P0.7/P0.8 证明。

## Migration Plan

1. 先提交规划 artifacts 并通过 proposal conflict check、strict validation 和 Planning Review。
2. 新增 `git-operations` contract/Skill 与新 graph entry，同时迁移 Task Finish、Buildr Skill、bootstrap/docs/tests。
3. 删除三个旧 contracts、旧 `git-ops` Skill 与全部 bindings/residual assertions，保留 worktree provider。
4. 运行 focused、affected 与完整 Candidate verification，覆盖 commit、push、组合、dirty/range/rejection/freeze/partial failure。
5. 由 Task Development freeze Candidate 并形成 current handoff；Task Finish fast-forward 集成并普通 push。
6. 从 retained Product source sync Codex runtime，以 Doctor 证明唯一新入口生效，再 cleanup Environment。

回滚只允许通过新 commit revert 整个 cutover；不得在同一 retained runtime 同时恢复旧、新入口。

## Open Questions

无。P0.7/P0.8 若需要持久 evidence 或额外 operation，再以各自窄 Change 决定。
