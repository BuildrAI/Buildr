## Context

Buildr 当前在创建 release tag 前，由 maintainer 本机执行 `npm trust list` 读取 Trusted Publisher current 配置。该接口依赖本机 npm 版本、登录态和 npm 控制面读接口；即使 package owner、2FA 与发布配置正确，也可能返回不可诊断的 `E400`。真正发布则由 GitHub-hosted `publish.yml`、`npm-production` Environment 和 GitHub OIDC 身份完成，两者不是同一个认证主体。

本变更涉及 release contract、GitHub workflow、证据格式、post-main convergence、Skill、文档和测试。安全边界是：不能用静态配置、历史 provenance 或本机登录态替代 current 发布身份证明，也不能为了 probe 创建 tag、构建 tarball、发布 package 或持久化短期 token。

## Goals / Non-Goals

**Goals:**

- 由与正式 npm publish 相同的 GitHub repository、workflow、Environment 和 OIDC 权限证明 current Trusted Publisher authority。
- 形成绑定当前 `origin/main`、workflow bytes、GitHub run 与 package 的短期机器证据。
- exchange 失败、证据过期、远端 run 漂移或 token 泄漏风险时 fail closed。
- 保留 tag 驱动发布、候选矩阵和发布后 readback 的既有边界。

**Non-Goals:**

- 不自动创建或推送 release tag，不执行 `npm publish`，不创建 GitHub Release。
- 不修改 npm owner、2FA、Trusted Publisher 或 GitHub Environment 配置。
- 不引入长期 npm token，也不让 maintainer 本机模拟 GitHub OIDC 身份。

## Decisions

### 1. 在同一个 `publish.yml` 中增加独立的手动 authority probe

`workflow_dispatch` 只激活 `authority-probe` job；tag 发布 jobs 只在 `push` tag 事件执行。Probe job 使用正式发布相同的 repository、workflow、`npm-production` Environment 与 `id-token: write`，但不运行 pack、publish 或 release。

选择同一 workflow 而不是新建 workflow，是为了让被证明的 workflow filename 与正式发布权威元组相同。选择独立 job 而不是给 publish job 增加 dry-run 分支，是为了缩小误触发 publish 的风险面。

### 2. 用 npm OIDC package token exchange 证明 current authority

Probe 从 GitHub Actions OIDC endpoint 获取 audience 为 `npm:registry.npmjs.org` 的 ID token，再调用 npm package token exchange API。只有 npm 接受该 GitHub 身份并返回短期 registry token，probe 才为 `ready`。

返回 token 只在进程内用于确认响应完整性，随后立即丢弃；stdout、artifact、GitHub output 和最终 evidence 均不得包含 token。Evidence 只保留 package、exchange 状态、token type、签发/过期时间和 GitHub run identity。

本机 `npm trust list`、`npm whoami` 与交互式 OTP 不再属于发布权威门禁，因为它们证明的是 maintainer session，而不是正式发布主体。

### 3. 采用两层 evidence 并由本机 preflight 做远端绑定

GitHub job 生成 `buildr.release-authority-oidc-probe/v1` artifact；本机 preflight 下载后，通过 GitHub current API 读取对应 run，核对 repository、workflow、event、head SHA、conclusion、run ID/attempt 与 artifact 内容，再形成 `buildr.release-authority-preflight/v2`。

最终 evidence 同时绑定 source commit、`publish.yml` SHA-256、authority tuple、GitHub run URL/identity 与 npm exchange metadata。Post-main convergence 只接受 15 分钟内且仍匹配 `origin/main` 和当前 workflow bytes 的 v2 evidence。

选择保留本机最终 preflight 层，是为了复用现有 post-main convergence 输入边界，并把静态 checkout、GitHub current run 与 hosted exchange 三类事实汇合为一个可消费结论。

### 4. Dispatch 输入必须冻结候选身份

手动 workflow 输入包含完整 source commit 与 workflow SHA-256。Probe job 必须确认 checkout SHA 和 workflow bytes 与输入一致后才能 exchange。Skill 使用唯一 probe run 定位、等待、下载和 preflight 校验，不接受“最近一次成功 run”替代本次候选。

这避免 main 竞争更新后，旧 run 被误用于新候选。

## Risks / Trade-offs

- [npm exchange API 或 GitHub OIDC 暂时不可用] → Probe 非零退出并阻止 tag；保留原始 HTTP 状态和不含凭证的诊断后重跑，不回退本机 token publish。
- [短期 registry token 泄漏] → 不打印响应体、不写 token、不上传原始响应；测试扫描 evidence 与日志字段，脚本只提取允许的 metadata。
- [workflow_dispatch 与 main 并发更新] → 输入完整 commit/digest，job 和本机 preflight 双重核对，任何漂移阻止收敛。
- [手动 probe 增加一次 hosted run] → 这是证明最终发布身份的必要成本；probe 不执行候选矩阵或制品构建。
- [旧 v1 evidence 失效] → 这是有意的 fail-closed schema 迁移；重新运行 OIDC probe 生成 v2 evidence。

## Migration Plan

1. 合并 workflow、probe/preflight/convergence、Skill、文档与测试到 `main`。
2. 以新的 `main` commit 和 `publish.yml` digest dispatch authority probe。
3. 下载本次 run artifact，生成并消费 v2 preflight evidence。
4. 重新形成 rc.9 candidate，并运行完整 GitHub candidate matrix（含 Windows）。
5. 停在 tag/npm 发布授权边界，等待单独授权。

回滚时整体回退本变更；但旧本机 `npm trust list` 已被证实不能可靠提供 current evidence，因此回滚后不得绕过门禁发布，必须先另行修复权威证明方案。

## Open Questions

无。
