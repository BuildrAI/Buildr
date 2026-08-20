## Context

rc.20 首次 Candidate 的 `core-macos` 启动 39 个 capability；artifact 只留下 38 组 stdout/stderr，没有最终 shard evidence，唯一缺失 `integration-task-finish-delivery`。修复递归入口后，同一完整 Candidate 为 6 分 03 秒，core-macos 为 4 分 08 秒，其中 `integration-task-finish-delivery` 90.1 秒、`integration-self-bootstrap` 77.8 秒。当前 runner 只在整个 DAG 结束后输出完成结果，没有 capability wall timeout；进程组只发 SIGTERM；最终 evidence 只在全部 step 返回后写入。

当前进程树 tracker 每约 50ms 同步执行 `ps -axo`，40ms 内共享快照。新增同一基准入口后，在精确Node 24.15.0、每轮1秒、各3轮中，50ms配置的1/4/8 trackers中位值分别为19/20/20次实际共享快照与34/55/69ms CPU；250ms候选分别为3/8/16次与30/35/50ms CPU。采样有可测成本，但不能证明它是 rc.20 根因。将默认周期/缓存实际改为250ms/200ms后，150ms内启动并reparent的确定性后代未被观察且发生残留，因此该优化已回退，继续保留50ms/40ms正确性边界。

Release Task Finish 按 Task Environment contract 清理执行根；已清理的 Environment Receipt 仍保留 Plan、declaration、recipe、step 与 identity，因此 publication 可以从冻结 commit 和这些权威 preparation facts 重建，而无需让 Finish 改成无限期保留 worktree。当前 `buildr-release` 另行要求在没有 lockfile 的 Product 根执行 `npm ci`，与该模型冲突。

Task Record 只拥有顶层 Task、Parent/Child 与 retrospective source；Task Execution Record 只允许 Verification/Finish owner。发布关联不应把任一模型扩张成通用关系图。现有 release transaction runner 和 workflow artifact 已是发布证据 authority，适合承载 closed correlation contract。

## Goals / Non-Goals

**Goals:**

- capability 挂起在独立墙钟上限内可定位、可取消、可完整回收，已完成 evidence 不丢失。
- core macOS 故障半径缩小，同时保持原 capability 集合和 fail-closed aggregate gate。
- exact Node executable 与子进程 PATH 共同冻结并可审计。
- Release publish 只从完成 Task 的 Environment Plan/Receipt 和权威 Service recipe 重建。
- 一份正式 release transaction evidence 可关联发布任务、支持任务、Candidate/publish runs、Git 收敛与公共发布事实。

**Non-Goals:**

- 不把 runner 暂态、`integration-self-bootstrap` 或 `ps` 采样描述为 rc.20 根因。
- 不减少 Candidate 测试、不跳过 macOS、不扩大外层 timeout 掩盖挂起。
- 不修改 Retrospective disposition，不把报告正文复制进 Task Record。
- 不新增通用 Task relation、Task Execution Record owner 或旁路数据库/JSON store。
- 不在本 Task 中发布新 npm version、tag 或 GitHub Release。

## Decisions

### 1. capability timeout 是 registry contract，不复用 timing budget

每个 Candidate step 取得显式 `timeoutMs`。timeout 与非阻断 `budgetMs` 分离：budget 只评价性能，timeout 是 correctness/cleanup 边界。按 rc.20 成功时序和至少约 4 倍波动余量分三档：workspace-saturating 生命周期 6 分钟、重 package/runtime/release 5 分钟、其他 3 分钟；所有档位明显早于 35 分钟 job timeout。contract test 要求 Candidate step 全部有合法 timeout，且外层 job timeout 大于 capability timeout 与清理 grace。

备选的统一延长 job timeout 会继续制造黑盒窗口；从历史单次耗时动态推导 timeout 会让同一 tree 的执行 contract 漂移，均不采用。

### 2. runner 拥有 TERM→KILL、心跳和原子 step completion

runner 在 spawn 后登记 PID/进程组；每 15 秒由 plan runner 输出 active capability、elapsed、PID/PGID 与 completed/total。step 完成时立即先写 stdout/stderr/phase diagnostics，再发出 `passed|failed|timed-out|cancelled` completion event，包含 elapsed、PID/PGID、diagnostic 相对文件和 digest。

超时或取消先对 owned process group 发 SIGTERM，等待有界 grace，再对仍存活的组和已观测后代发 SIGKILL并确认退出；Windows 继续使用 `taskkill /t /f`。任何残留或无法确认的 ownership 都让 step 失败。确定性 fixture 会让根进程派生后代并永久等待，验证超时、evidence 保留与后代回收。

### 3. checkpoint 是 Candidate evidence contract 的非聚合中间态

Candidate shard 在每个 completion event 后以临时文件+rename 原子重写 `buildr.candidate-ci-checkpoint/v1`，绑定 source commit、registry identity、artifact、shard、expected step IDs 和已完成 results。checkpoint 可诊断中止 run，但永远不是 aggregate 输入；aggregate 仍只接受 `buildr.candidate-ci-evidence/v1` 的完整 terminal shard evidence。这样不降低 closed gate，也不让部分通过被误认成 Candidate。

### 4. core-macos 保留统一 registry，CI 投影为四个语义 shard

registry 保留一个权威 `core-macos` step 集合，并增加四个互斥 owner 投影：

- Task Environment / Task Finish / self-bootstrap；
- Project / OpenSpec / Task state 与 coordination；
- package / runtime / release；
- 其余 contract / system / CLI。

workflow 从 registry 导出的 shard IDs 运行四个 macOS jobs；contract test 比较并集与原 `core-macos` 集合，要求每项恰好一次，同时核对 artifact name、`needs` 与 aggregate expected shards。`integration-task-finish-delivery` 与 `integration-self-bootstrap` 都声明 `workspace-saturating`，scheduler test 证明 capacity 1 下不会并发；不把每个 test 变成独立 job。

### 5. 采样优化必须有同一 benchmark harness

增加 process lineage sampler benchmark，记录 interval、tracker 数、样本次数与 wall/user/system 时间。先保存 50ms baseline，再将默认采样改为 250ms、共享缓存改为 200ms，仅在相同 harness 显示明显下降且后代回收测试仍通过时保留；否则回退采样参数。进程追踪和 timeout cleanup 不依赖该性能结论。

### 6. exact Node environment 由一个 infrastructure helper 生成

新增 closed helper 接收权威 Node executable 和 inherited env，验证 executable 为绝对可执行文件，返回该 executable、同目录 npm shim、`PATH` 首项、Node version/identity 与审计摘要。Candidate executor、release smoke、release transaction/helper 和 Task Finish 子进程环境复用它；调用方不得仅传绝对 executable 却沿用未冻结 PATH。

错误 cwd、缺失 Service lockfile、PATH 首项不匹配或子进程 `node` identity 不同均在实际 npm/build/smoke 前失败。测试把另一个 fake Node 放入 inherited PATH，仍要求父子 identity 一致。

### 7. Publication 采用可重建环境，不延长 Task Environment 生命周期

Release Task Finish 继续按现有 contract cleanup。`buildr-release` 在准备阶段只消费 matching Task Environment Plan/Receipt：要求 `service:product/buildr/buildr.npm-ci` ready，记录 plan/declaration/recipe/lockfile identities；不再在 Product 根执行 `npm ci`。正式 publish runner 从完成 Task 的 Application read model读取同一 facts，并把 closed environment binding 交给 workflow。hosted job 在冻结 source 的 Buildr Service root按同 recipe 语义执行锁定安装并核对 recipe inputs/identity，不复用已清理的本机 worktree。

备选的“Environment 保留到发布完成”会让已完成 Task 的 cleanup 和发布授权边界耦合，且放大本机遗留资源，因此不采用。

### 8. 关联证据扩展现有 release transaction，不扩张 Task Record

`buildr.release-transaction-context/v1` 由 runner 从 Task Record/Application、Environment read model 和显式 GitHub Candidate readback形成，包含 release Task、其 retrospective sources、显式 support Task IDs、Candidate source/run、main/dev bridge commits 与 environment binding。runner dispatch 时将 canonical context 作为一个 closed workflow input并绑定 digest。

workflow 在既有 `release-evidence-*` artifact 内写 `buildr.release-transaction-evidence/v1`，追加 publish run/attempt、tag、npm version/dist-tag、GitHub Release、Registry integrity 与 smoke outcome。runner 的 `inspect` read model按 run ID下载同一 artifact、校验 context digest、workflow/source/run 和公共事实后返回 portable closed result。该 JSON 是既有发布 evidence artifact 的正式 schema，不是 Workspace 旁路 store；Task Record 只保留原有 retrospective/Parent 事实。

## Risks / Trade-offs

- [timeout 档位在极慢 runner 上误杀] → 以 rc.20 成功数据、分档余量和多轮 Candidate 结果校准；外层 job timeout 仍保留为最后防线。
- [四个 macOS jobs 增加 setup 开销] → 每个 shard 继续消费同一 Candidate artifact，比较整体 wall-clock与资源使用；不牺牲覆盖换速度。
- [SIGKILL 误伤 PID 复用进程] → 优先 process group ownership并保留 start-time lineage校验；无法证明 identity 时 fail closed。
- [release context 输入过大或被篡改] → canonical closed schema、稳定序列化、sha256 digest和 workflow/source/run 双向校验。
- [GitHub run 完成但 evidence artifact 暂不可见] → inspect 有界重试；不据此重发 workflow或移动 tag。
- [sampling benchmark 受机器噪声影响] → 同 tree、多轮、中位数报告；正确性测试独立于性能阈值。

## Migration Plan

1. 先增加 runner lifecycle/cleanup/checkpoint contract 与测试，再启用 timeout。
2. 增加四 shard registry projection和 workflow contract，保持 aggregate fail closed。
3. 引入 exact Node helper并迁移 Candidate/release consumers；删除 Product 根 `npm ci` 指引。
4. 增加 release context/evidence/inspect schema与 fixture tests，不 dispatch真实发布。
5. 运行 focused、affected、完整 Candidate，多轮记录 timing；任何 coverage 或 cleanup 漂移立即回退对应实现而不放宽 gate。

## Open Questions

无；若多轮 Candidate 证明某个 timeout 档位或 shard 组合不稳定，只调整 registry 数据，不改变上述 ownership 与 fail-closed contract。
