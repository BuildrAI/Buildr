## Context

当前 `dev → main` 候选由 macOS、Windows 两个完整作业分别执行同一 Candidate profile。Candidate 内部已有统一 registry、DAG、资源容量、System owner、单次 tarball 和 timing，但这些能力只在单个 runner 进程内生效：便宜的静态失败不会阻止已经启动的昂贵 owner，Windows 作业晚期失败也只能整体重跑。与此同时，正式 tag workflow 已经围绕最终 `main` commit 构建和发布一个不可变 tarball，PR 候选不能替代该发布物。

本设计把 CI 作业拓扑建模为现有 Product verification registry 的分布式投影，不引入第二套测试清单，也不把 GitHub job 名称变成行为 authority。

## Goals / Non-Goals

**Goals:**

- 让确定性的低成本错误在 1–2 分钟内阻止所有昂贵候选作业启动。
- 一个冻结 PR head SHA 只构建一个候选 tarball，全部需要安装包的分片和 Host Node 作业复用并验证同一 bytes。
- 将 Windows 高成本验证拆为 runtime/launcher、Workspace/Task lifecycle 和 fresh build 三个可独立重跑的作业。
- 用稳定聚合 Result 证明完整 Candidate coverage、平台覆盖和 evidence currentness，分支保护只依赖这个稳定门禁。
- 保留本地完整 `test:candidate` 作为验证框架改动、诊断或 GitHub 不可用时的入口，但普通开发和发布准备不再无条件重复本地完整候选。

**Non-Goals:**

- 不删除 Candidate step、System 文件、平台 Launcher、Host Node 或发布生命周期断言。
- 不把 PR 候选 tarball 发布到 npm，也不让它替代最终 `main`/tag tarball。
- 不实现跨 workflow、跨 commit 的可变 Workspace checkpoint。
- 不因性能预算超限改变正确性结果；预算继续只产生观察性 warning。

## Decisions

### 1. CI shard registry 是统一 verification registry 的闭合投影

在现有 registry 中增加 CI Candidate shard/coverage 声明。每个 Candidate step 必须映射到至少一个 primary coverage unit；只有明确需要双平台证明的 step 才能映射到多个平台。契约检查在启动任何 verifier 前证明：

- 完整 Candidate step 集合与各 shard primary step 并集相等；
- 非平台复验 step 没有重复 primary owner；
- artifact consumer 只映射到会取得同一候选 artifact 的 shard；
- shard 的 runner OS、资源边界和 Host Node 要求合法。

本地 `test:candidate` 继续直接展开完整 profile。CI runner 只从同一 registry 选择 shard，不维护手写测试文件列表。

备选方案是在 workflow 内直接写多个 `test:focus` selector；它无法证明完整集合，也容易在 registry 改动后静默遗漏，因此不采用。

### 2. Preflight 是昂贵作业的显式 phase boundary

`candidate-preflight` 在 macOS 上先运行 registry/architecture、OpenSpec strict/quality/audit、contract、managed mutation、docs 等低成本确定性 owner，并产出绑定 source SHA 和 registry identity 的 evidence。artifact producer 必须 `needs` preflight；其余候选/Host Node 作业必须 `needs` artifact producer。

这不是给所有 step 伪造 `dependsOn`。Product 内部 DAG 仍只表达真实输出依赖；GitHub job phase boundary 表达“已知确定性失败时不购买昂贵 runner 时间”的候选运行策略。

### 3. 候选 tarball 由一个 producer 生成，consumer 只读验证

artifact producer 使用最低 Host Node 从精确 source SHA 创建现有 `buildr.release-artifact/v1` tarball、`npm-pack.json` 与 manifest，上传为 workflow-scoped Actions artifact。consumer 下载后必须重新校验 filename、size、SHA-256、SHA-512、application payload digest 和 `sourceCommit`，并把绝对路径通过现有 `BUILDR_CANDIDATE_*` 环境变量交给 executor。

executor 在收到外部 artifact 时不得重新 pack；没有外部 artifact 的本地完整 Candidate 仍由唯一 `candidate-tarball` step 生成一次。PR artifact 只在该候选 workflow 内流转；正式 tag workflow仍从最终 `main` commit 构建一次发布 tarball。

### 4. Windows 使用三个高成本 shard，macOS 持有 portable/core

第一版 shard 拓扑：

- `preflight-macos`：便宜确定性 owner；
- `artifact-macos`：唯一 candidate tarball；
- `core-macos`：其余 portable/macOS core，并执行macOS Launcher/release smoke；
- `runtime-windows`：runtime recovery、runtime adapter、npm/Launcher与release smoke；
- `workspace-windows`：Workspace、Task、OpenSpec recovery、concurrent Task 和 Task Finish 生命周期；
- `fresh-build-windows`：真实 clean dependency install 与 `build:web`；
- `host-{minimum,current}-{macos,windows}`：最低24.15.0与当前24.x在两个平台对同一tarball的Host Node compatibility。

具体 step 映射由 registry 和契约测试决定。分片数量以失败隔离收益为目标，不继续拆成大量只重复 checkout/npm ci 的小作业。

### 5. 每个分片写 closed evidence，聚合门禁只认 current 完整集合

分片 evidence 至少绑定 schema、shard、runner OS、source SHA、artifact identity（适用时）、registry identity、primary coverage units、实际 step results、timing 和 outcome。聚合器读取所有预期 evidence 并验证：

- source SHA、registry identity 和 artifact digest 全部一致；
- 每个预期 shard/Host Node tuple 恰好一份 evidence；
- Candidate coverage units 无遗漏、无未授权重复；
- 全部 required result passed，blocked/missing/stale 均失败。

GitHub job `candidate-gate` 使用稳定名称并在 `if: always()` 下运行。失败 job 没有 evidence 时，聚合器明确报告 missing；同一 SHA 通过 GitHub“重新运行失败作业”只重跑失败 shard及依赖它的 gate。每个逻辑 shard 使用唯一 artifact 名，重跑时通过 `overwrite: true` 删除旧 artifact 后上传新 evidence，避免不可变 artifact 的同名冲突或旧失败 evidence 与新 evidence 并存；evidence additive记录workflow run/attempt。新 commit 会产生新 SHA，旧 evidence 不能复用。

### 6. 清理失败按 ownership 和正确性影响分类

测试 harness 最外层、已完成断言后的临时目录删除遇到 Windows `EPERM` 时记录 warning、保留诊断路径，不推翻已经通过的产品行为；Launcher、进程、端口、资源协调、Task Environment 或任何 ownership cleanup 失败仍是 correctness failure。release smoke 与 fresh build 输出阶段 timing，至少区分准备、安装/构建、启动/漂移/修复、卸载/最终 doctor 和 harness cleanup。

### 7. 开发反馈、正式候选和发布物 authority 分离

`dev` push 运行 changed/受影响反馈，尽早发现 Task Finish 合入后的 CI/Windows 风险；`dev → main` PR 运行完整分布式 Candidate。`buildr-release` 默认先消费 current changed/affected evidence，再以 GitHub `candidate-gate` 作为最终候选门禁；只有验证框架本身变化、诊断或 GitHub 不可用时才要求本地完整 Candidate。

## Risks / Trade-offs

- [Risk] shard 映射遗漏或把平台敏感测试错误归为 portable → registry contract 对完整集合、平台要求和允许重复做 fail-closed 校验；同一冻结 tree 与旧完整 Candidate 做覆盖对比。
- [Risk] Actions artifact 被替换或来自错误 SHA → 每个 consumer 重新读取 manifest并校验 source SHA 与所有 digest；聚合 evidence 再次绑定同一 identity。
- [Risk] 同一run重跑失败job时不可变evidence artifact同名冲突 → 每个shard使用唯一逻辑名称并显式overwrite；aggregate仍拒绝下载集合内的重复evidence和stale identity。
- [Risk] 过度分片增加 checkout/npm ci 总 runner 成本 → 只保留三个 Windows 高成本 shard并共享 npm cache；以 wall-clock、runner minutes、失败重跑成本共同评估。
- [Risk] aggregate job 因上游失败被跳过 → 使用 `if: always()`，missing evidence 明确失败，branch protection只要求稳定 gate。
- [Risk] GitHub check 名迁移造成暂时无法合并 → 新旧 contexts 并存；新 gate 首次绿色并完成回读后才移除旧 contexts。
- [Trade-off] 同 SHA 的 Actions artifact 不是跨 workflow 长期缓存 → 保持证据简单和不可变；重跑失败 job可复用同一 workflow artifact，重新运行整个 workflow则重新构建但仍绑定同一 SHA。

## Migration Plan

1. 先实现 registry shard 声明、artifact consumer、closed evidence/aggregate 和契约测试，不修改 branch protection。
2. 增加 phase timing 与清理分类回归；运行本地 fast、changed/focus、完整 Candidate 并核对旧新覆盖集合。
3. 修改 `verify.yml`，在精确 PR head SHA 上运行 preflight、artifact、shards、Host Node 与 aggregate；保留旧 Required Checks。
4. 冻结同一 tree，至少完成三轮分布式绿色候选，记录中位数、波动、最长 Windows shard和失败重跑成本；与旧完整作业覆盖/耗时比较。
5. 新 `candidate-gate` 稳定后迁移 `main` branch protection，再删除旧四个 contexts。
6. 更新 release Skill、checklist、验证声明和 current knowledge；随后重新准备 rc.9，但发布仍需独立明确授权。

回滚时恢复旧 workflow job 拓扑和 branch protection contexts；本地完整 Candidate、原 registry step、tag workflow和 npm 公开事实均不需要回滚。

## Open Questions

无。具体 shard step 列表以实现后的 registry 完整性检查和同 tree 实测为准，可在不改变上述责任边界的情况下调整。
