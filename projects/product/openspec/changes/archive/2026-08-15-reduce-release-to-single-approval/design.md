## Context

当前 `publish.yml` 同时支持 `workflow_dispatch` probe 和 `push.tags` publish。两个 job 分别声明 `environment: npm-production`，因此 GitHub 将它们视为两个独立 deployment；即使 probe 只在正式发布阶段运行，维护者仍需先批准 probe，再批准 tag workflow 的 publish。更关键的是，最终 `pre-tag` convergence 与 tag 创建发生在本机，受保护 job 只拥有 publish，这使一次审批无法覆盖完整不可逆边界。

现有正式发布已经具备必须保留的约束：最终 `main` commit 重新构建一次唯一 tarball；Host Node 与 Launcher 在隔离 runner 中完成可逆验证；Trusted Publishing 使用 GitHub OIDC；tag、npm version/integrity、dist-tag 和 GitHub Release 支持 fail-closed 恢复；本机不得持有 npm publish 凭证。

## Goals / Non-Goals

**Goals:**

- 正常发布路径只产生一个 `npm-production` deployment 和一次维护者审批。
- 同一个 protected job 在审批后按固定顺序完成 OIDC authority probe、最终 pre-tag convergence、tag ensure、npm publish、Registry/GitHub Release readback 与安装 smoke。
- 本机只负责验证准备事实、dispatch 一次正式 workflow 并跟踪结果，不再创建或推送 release tag。
- 所有可逆且无需发布权威的高成本验证在审批前完成，并把同一冻结 tarball交给 protected transaction。
- 对已有相同 tag/npm version 的中断恢复保持幂等；任何 source、workflow、tag target 或 integrity 漂移都停止。

**Non-Goals:**

- 不把 `npm-production` 审批提前到 tarball/Host Node/Launcher 验证之前。
- 不取消 OIDC token exchange probe，也不把静态 workflow 检查当作 current control-plane authority。
- 不引入本机 npm token、OTP、PAT publish 或 tag force-update 回退。
- 不复用 pre-main PR Candidate tarball作为正式 npm bytes。
- 不保证失败后新的 protected job attempt 无需再次审批；“一次审批”约束的是一次正常正式发布事务，而不是绕过 GitHub 对新 deployment/attempt 的保护。

## Decisions

### 1. 以单次 `workflow_dispatch` 取代 probe dispatch 加 tag-push workflow

本机 `release-transaction-runner.mjs` 对 current `origin/main` 解析 version、candidate base/tree 与 workflow digest，使用唯一 release invocation id dispatch `publish.yml`，定位并跟踪同一个 run。Workflow 不再监听 `push.tags`，也不再包含独立 `authority-probe` job。

相比尝试复用两次 Environment approval，单次 dispatch 从根源上只创建一个 protected deployment；相比让本机先建 tag 再 dispatch，workflow 可以在同一受保护权限边界内证明并创建 tag。

### 2. 将 workflow 分为审批前可逆阶段和唯一 protected transaction

`contract`、`candidate`、`host-node` 与 `launcher` jobs 只持有 read permissions，不声明 Environment。它们 checkout `inputs.source_commit`，解析 `v<inputs.version>` contract，冻结一次 tarball并完成可逆 smoke。

唯一 `release` job依赖全部可逆 jobs，声明 `environment: npm-production`、`id-token: write` 与 `contents: write`。GitHub 只在该 job 即将启动时请求审批；批准后该 job消费已冻结 artifacts，不重新 pack。

### 3. Hosted probe evidence 在同一 job 内直接进入 pre-tag gate

`release-authority-oidc-probe.mjs` 继续交换并立即丢弃 npm OIDC token，只输出 credential-free metadata。`release-convergence.mjs --stage pre-tag` 改为接受同一 run 生成的 hosted probe evidence，验证 repository、workflow ref、event、run id/attempt、source commit、workflow digest、package、exchange status/expiry，以及 dev/main version/tree/ancestry。

旧的本机 current-run/artifact preflight 不再充当 tag 授权，因为同一 protected job尚未完成时无法把自己读回为 completed。静态 preparation preflight仍检查 workflow topology 与唯一 protected owner，但不会触发 OIDC。

### 4. Tag 由 protected transaction 以 ensure 语义创建

新增 tag ensure helper，在公开 mutation 前先 `preflight`：目标 tag不存在时返回 `create`；存在时必须是合法 annotated/lightweight release ref并最终解析到 `inputs.source_commit`，否则 blocked。`ensure` 只在 preflight、authority 与 convergence全部通过后创建不可移动 tag；并发创建只在写后读回仍匹配同一 source 时视为复用。

选择 ensure 而不是无条件 `git tag && git push`，是为了让 npm publish 后失败的同一 release 可从已存在 tag恢复；任何已有 tag 漂移都不得删除、移动或覆盖。

### 5. Dispatch inputs 构成 closed transaction identity

Workflow inputs至少包含 `release_id`、`version`、`source_commit`、`candidate_base`、`candidate_tree` 与 `workflow_sha256`。Contract job验证 package version、`v<version>`、checkout SHA 与 source一致；pre-tag gate重新读取远端 `main`/`dev` 与 workflow bytes。缺失、格式错误、非 current main、tree/version不一致或 workflow drift 均在 tag 前失败。

这些 inputs 是一次调用的冻结参数，不成为新的长期 release store；公开 authority仍是 Git/GitHub/npm 与 release contract。

### 6. 恢复以同一 run artifact和公开事实为界

同一 workflow run attempt优先恢复本 run 已冻结 candidate artifact；protected transaction重跑时重新执行 current OIDC probe与 pre-tag readback。tag已存在只接受同一 source，npm version已存在只接受同一 integrity，GitHub Release已存在只接受相同 tag/commit/notes/prerelease/Latest。恢复不得重新 pack、移动 tag、覆盖 package 或创建 binary Assets。

## Risks / Trade-offs

- [受保护 job 同时拥有 tag 与 npm mutation，权限范围扩大] → 只给该 job `contents: write`/`id-token: write`，其所有依赖 jobs保持 read-only，并用静态 workflow 契约约束唯一 Environment owner和执行顺序。
- [审批后才发现 control-plane 或最终远端漂移] → OIDC probe、remote convergence、workflow digest、tag preflight与 Registry snapshot均在任何 mutation前执行；失败不会创建 tag或 publish。
- [tag 创建成功而 npm publish失败] → tag是不可逆恢复锚点；同一版本 rerun复用匹配 tag和冻结/Registry integrity，不删除 tag。
- [移除 tag push trigger改变维护者习惯] → `buildr-release` Skill 与 runner提供唯一 dispatch命令和 run URL，contract tests拒绝旧入口残留。
- [GitHub rerun可能再次要求审批] → 明确一次审批保证只覆盖正常单次 transaction；新 attempt仍遵循 Environment保护，不通过弱化 protection规避。

## Migration Plan

1. 增加 transaction runner、hosted pre-tag evidence与 tag ensure tests，再切换 workflow topology。
2. 更新 authority static preflight、release contract tests、verification registry owners和正式发布文档。
3. 在隔离 Task worktree运行 strict OpenSpec、focused release tests与 affected delivery验证。
4. 交付到 `dev` 后，后续发布准备照常通过 `dev → main` Candidate gate；准备仍停在 tag前。
5. 首次使用新路径时，维护者授权一次正式 release transaction；确认一个 run中只有 `release` job使用 `npm-production`，tag/npm/GitHub Release/readback全部匹配。

回滚只允许在尚未 dispatch 正式事务或 protected transaction未产生 tag之前回退代码。tag一旦创建，继续按恢复语义发布新 attempt或新版本，不恢复旧 tag-push架构来移动/删除 tag。

## Open Questions

无。
