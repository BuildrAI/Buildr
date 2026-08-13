# 用 GitHub OIDC Probe 替换本机 npm trust 发布门禁

一句话摘要：Release tag 前改由正式 GitHub 发布身份完成 npm OIDC token exchange，并以短期 hosted evidence 证明 current 发布权威。

## 背景与问题

现有门禁依赖 maintainer 本机 `npm trust list`，它证明的是本机会话并受 npm CLI/read endpoint 稳定性影响，与正式 `publish.yml` 使用的 GitHub OIDC 身份不同。当前实际环境已出现 owner、2FA 和登录状态正确但 endpoint 持续返回 `E400` 的阻塞。

## 目标与非目标

- 目标：用同一 repository、workflow、`npm-production` Environment 和 OIDC 权限完成 package token exchange；证据绑定当前 `main`、workflow digest、唯一 run 和 package，15 分钟内消费。
- 非目标：不创建 tag、不 pack/publish、不创建 GitHub Release，不修改 npm 或 GitHub 控制面配置，不引入长期 npm token。

## 受影响角色

- Buildr release maintainer：不再准备 npm 11.15+ authenticated session 或运行 `npm trust list`，改为触发并校验 hosted probe。
- Buildr release workflow：新增无发布副作用的 `workflow_dispatch` probe job；tag publish 路径保持独立。

## 核心流程

`main` 收敛后冻结 commit 和 `publish.yml` digest → dispatch authority probe → GitHub job 核对冻结身份并以 OIDC 调用 npm exchange → 上传不含 token 的 evidence → 本机 preflight 读取 GitHub current run 并生成 v2 evidence → post-main convergence 在 15 分钟内消费 → 停在 tag 授权边界。

## 关键变化

- 发布权威 evidence producer 从 maintainer 本机 npm session 迁移到 GitHub-hosted OIDC identity。
- 旧 `buildr.release-authority-preflight/v1` 不再可用于 tag 门禁，改用绑定 hosted run 的 v2 evidence。
- exchange 或 current run readback 不可用时继续 fail closed，不允许回退本机 token publish。

## 影响、风险与兼容性

旧 evidence 不兼容，需要重新运行 probe。短期 token 只在 probe 进程内验证后丢弃，禁止进入日志和 artifact。GitHub/npm 临时不可用会阻断 tag，但不会产生公开写入或控制面 mutation。

## 验收摘要

- Workflow dispatch 只执行 probe，tag jobs 不运行；tag push 只执行既有发布路径。
- 成功 evidence 精确绑定当前 commit、workflow、run 和 package，且不含任何 token。
- drift、过期、exchange 拒绝或 run readback 不一致均阻止 convergence。
- contract、integration、workflow contract、affected/full regression 和完整 GitHub candidate matrix（含 Windows）通过。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/open-source-release-governance/spec.md`
- `tasks.md`
