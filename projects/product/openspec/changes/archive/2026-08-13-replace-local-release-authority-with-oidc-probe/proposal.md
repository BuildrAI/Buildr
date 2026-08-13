## Why

当前 tag 前发布权威门禁依赖 maintainer 本机执行 `npm trust list`，但真实 npm owner、2FA 与 CLI 前置条件全部满足时，官方 trust endpoint 仍可能返回无可诊断的 `E400`，导致发布候选被本机登录态和不稳定控制面读接口永久阻塞。npm 已提供 GitHub OIDC token exchange API，应改由最终发布身份本身证明 Trusted Publisher current 配置，而不是要求维护者提供本机 npm session。

## What Changes

- **BREAKING**：tag 前 authority evidence 的生产者从本机 authenticated maintainer session 改为 GitHub-hosted `publish.yml` 中的 OIDC probe run；本机 `npm trust list` 不再是发布前置条件。
- 在现有 `publish.yml` 增加不创建 tag、不打包、不发布的手动 authority probe 模式，并继续使用 `npm-production` Environment 与 `id-token: write`。
- probe 以 GitHub OIDC ID token 调用 npm 官方 package token exchange API；只保留 source commit、workflow digest、run identity、exchange metadata 与过期时间，不保存或输出任何 token。
- post-main convergence 只接受绑定当前 `origin/main`、当前 workflow bytes、预期 package 与未过期 GitHub run 的 ready evidence。
- 对 exchange 拒绝、workflow/Environment 漂移、证据过期、远端竞争和 token 泄漏风险保持 fail closed；发布仍只能由 tag 驱动的 GitHub-hosted workflow 执行。
- 更新 release Skill、checklist、current knowledge 与测试，移除本机 npm 11.15+/login/OTP 操作要求。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `open-source-release-governance`: 将 tag 前发布权威证明从本机 npm Trusted Publisher readback 改为同一受保护发布 workflow 的 GitHub OIDC token exchange evidence。

## Impact

- `projects/product/services/buildr/scripts/release/` 的 authority contract、probe、evidence 校验与 convergence。
- `.github/workflows/publish.yml` 的手动 probe 入口、OIDC token exchange 和 evidence artifact。
- `skills/buildr-release/`、release checklist、OpenSpec canonical spec 与发布流程 current knowledge。
- GitHub Actions、`npm-production` Environment 与 npm Registry OIDC exchange API；不新增长期 secret，不修改 npm package 或 Trusted Publisher 配置。
