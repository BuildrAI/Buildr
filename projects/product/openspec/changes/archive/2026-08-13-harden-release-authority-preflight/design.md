## Context

Buildr 的 npm-only release workflow 已固定 package、GitHub repository、`publish.yml` 和 `npm-production` Environment，但这些事实分散在 release contract、workflow、checklist 与测试中。它们不能证明 npm Trusted Publisher 当前控制面仍接受同一组 GitHub OIDC claims；rc.8 曾因此在 tag 创建后才以 npm `E404` 暴露 owner 漂移。

npm 11.15 以后提供 `npm trust list <package> --json`，可以由已认证 maintainer 只读回读 Trusted Publisher。该能力使 tag 前同时校验本地声明、GitHub current 状态与 npm current 状态成为可能。发布控制面仍由 GitHub/npm 拥有，本 Change 只读取并形成 evidence，不修改 credential、Environment 或 Trusted Publisher。

## Goals / Non-Goals

**Goals:**

- 为 release contract 增加唯一、机器可读的发布权威元组。
- 在 tag 授权前对本地、GitHub 和 npm current 状态执行只读、fail-closed 的 preflight。
- 让 preflight evidence 与本次 release source commit 和 workflow bytes 绑定，不能复用漂移前的旧结果。
- 在 Trusted Publishing 认证失败时保留 npm 原始失败，并给出 expected authority 和最小恢复路径。

**Non-Goals:**

- 不创建或推送 tag，不执行真实 publish，不创建 GitHub Release。
- 不修改 npm Trusted Publisher、GitHub Environment、repository ownership 或凭证。
- 不把历史 npm provenance、checklist 文本或 workflow 测试当成 current npm 控制面证明。
- 不提供本机 token publish 作为 OIDC 失败的回退路径。

## Decisions

### 1. 发布权威元组是 release contract 的加法字段

`buildr.release-contract/v2` 增加 `publishAuthority`：

- `provider: github-actions`
- `repository: BuildrAI/Buildr`
- `workflow: publish.yml`
- `environment: npm-production`
- `allowedActions: [npm publish]`

这是 v2 的向后兼容加法，不改变 tag/version/tarball 等既有身份。选择 contract 作为唯一声明源，而不是再建独立配置文件，可以让 workflow、preflight、诊断和测试消费同一事实。checklist 只解释流程，不复制另一份可执行 authority。

### 2. preflight 分为本地静态事实与外部 current 事实

新增 `release-authority-preflight.mjs`，输出 closed `buildr.release-authority-preflight/v1`：

- 本地：package name/repository、Git remote、workflow filename、job Environment、`id-token: write` 和唯一 publish action；
- GitHub：current repository identity 与目标 Environment 存在；
- npm：`npm trust list @buildr-ai/buildr --json` 的 current publisher。

命令均使用参数数组执行，不经过 shell；输出不包含认证 token。任一来源无法读取、格式未知或不一致都返回 `blocked`/非零，不把 unavailable 写成 verified。相比仅做静态测试，这能在 tag 前发现控制面漂移；相比直接调用 Registry 私有 endpoint，复用 npm 官方 CLI 可减少认证与响应格式耦合。

### 3. npm Trusted Publisher 使用精确映射

npm current publisher 必须归一化为：`type=github`、`repository=BuildrAI/Buildr`、`file=publish.yml`、`environment=npm-production`，且 `permissions` 精确为 `[createPackage]`。`createPackage` 对应唯一允许的 `npm publish`；`createStagedPackage` 或未知 permission 都视为漂移。

preflight 要求 npm CLI 至少为 11.15。旧版本不支持 `trust list`、未登录导致的 `E401/ENEEDAUTH`、package 不可见或其他 API 错误都形成可区分的 blocked finding，并提示在 maintainer authenticated session 中重跑；不得转而要求 Agent 猜测 UI 状态。

### 4. post-main convergence 消费新鲜 authority evidence

独立 preflight 先生成 evidence file，`release-convergence.mjs --stage post-main` 必须接收并校验该 evidence。evidence 绑定 source commit 与 workflow SHA-256；post-main convergence 要求：

- evidence 状态为 `ready`、无 findings，且 `observedAt` 距当前检查不超过 15 分钟；
- source commit 与实际 release source `origin/main` commit 相同，且 convergence 已证明该 commit 被 `origin/dev` 包含；
- workflow digest 与该 main commit 中的 `publish.yml` bytes 相同；
- expected tuple 与 current release contract 相同。

`pre-main` 仍可不带 live evidence，用于可逆候选收敛；只有 `post-main` 是 tag 前硬门禁。相比把 live 网络调用直接嵌入 convergence，这种方式保留可测试边界和可审计 evidence，同时不能靠旧结果绕过。

### 5. workflow 通过 trusted publish wrapper 保留原始失败并补充诊断

新增 wrapper 以原参数调用 npm CLI，完整转发 stdout、stderr 与退出码。仅当输出/错误属于 `E401`、`ENEEDAUTH`、OIDC/Trusted Publisher 相关 `E404` 时，追加 expected tuple、preflight 重跑命令和“修复 npm/GitHub current authority 后 rerun hosted workflow”的恢复路径。wrapper 不重试、不写凭证、不切换本机 publish，也不删除已有 tag。

### 6. 测试只使用 fixture 与 fake executables

归一化/比较使用纯函数单测；CLI 使用 fake `git`、`gh`、`npm` 或注入 executor；workflow contract 测试确认 wrapper 和 Environment/OIDC 权限。测试不得读取开发者真实 npm 登录态或访问真实 GitHub/npm 控制面。

## Risks / Trade-offs

- [preflight 需要 maintainer npm 登录态] → 未登录明确 blocked；release maintainer 在 tag 授权前提供 authenticated readback，不降低为静态推断。
- [npm CLI/响应字段未来变化] → closed normalization 对未知字段/permission fail closed，并通过 fixture 锁定当前兼容范围。
- [evidence 在生成后过期] → 绑定 source commit 与 workflow digest，限定 15 分钟有效期并由 post-main convergence 现场复核；控制面在检查后仍可能变化的残余风险由紧邻 tag 的操作顺序和 protected publish 再次暴露。
- [wrapper 改变 workflow 的 publish 入口] → 保留 npm 原始 argv、stdio 和退出码，增加成功与三类失败 fixture 测试。
- [release contract v2 新字段影响旧消费者] → 字段仅加法；本仓库消费者更新为显式验证，外部宽松 JSON reader 保持兼容。

## Migration Plan

1. 增加 contract 字段、preflight、evidence 校验和 wrapper，并通过 fixture/CLI/workflow 测试。
2. 更新 buildr-release Skill、release checklist 与 current release knowledge，使 post-main/tag 前顺序显式要求 live evidence。
3. 下一次 release preparation 在 authenticated npm maintainer session 中首次运行 preflight；若 blocked，只修复 current authority 后重跑，不创建 tag。
4. 回滚只需恢复 workflow wrapper和本地工具；已形成的 evidence 是只读文件，不产生外部控制面回滚。

## Open Questions

无。npm maintainer 登录态属于每次发布的外部前置条件，不在本 Change 中持久化。
