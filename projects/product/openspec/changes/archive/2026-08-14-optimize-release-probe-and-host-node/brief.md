# 收敛单次发布授权并修复 Host Node 隔离验证

一句话摘要：候选准备不再提前执行真实 OIDC probe，正式发布只在 tag 前取证一次，同时让每个 tag Host Node runner 独立准备 lockfile-bound 验证依赖。

## 背景与问题

`0.1.0-rc.9` 准备与发布阶段在八分钟内对同一 `main` 与 `publish.yml` 连续执行了两次 authority probe，形成重复审批；随后 tag workflow 的两个 Host Node job 因隔离 runner 缺少 checkout `yaml` 依赖而确定性失败。rc.9 tag 已公开，但 npm version、dist-tag 与 GitHub Release 均未创建。

## 目标与非目标

- 目标：准备阶段只证明候选和发布结构收敛；正式发布授权后执行唯一一次 hosted probe，并由强制 evidence 的 `pre-tag` convergence 立即消费。
- 目标：tag workflow 的每个 Host Node job 使用当前 package lockfile 自行准备 verification harness 依赖，同时继续验证唯一冻结正式 tarball。
- 非目标：不删除或移动 rc.9 tag，不回退本机 npm token/OTP publish，不移除最终 tarball 的 Host Node 或 Launcher smoke。

## 受影响角色

- Buildr release maintainer：准备候选时不再审批 `npm-production` probe；只有明确发布后才在 tag 前审批一次。
- Buildr release workflow：Host Node matrix runner 不再假设 candidate runner 的 `node_modules` 可见。
- Buildr Agent：`buildr-release` 必须区分 post-main candidate readiness 与 pre-tag authority readiness。

## 核心流程

准备：最新 dev → release Task → affected/full validation → `dev → main` Candidate gate → bridge → `post-main` source convergence → 停在 tag 前。

发布：用户明确授权 → 唯一 hosted authority probe → `pre-tag` evidence convergence → tag push → 唯一正式 tarball → isolated Host Node/Launcher smoke → protected publish/readback。

## 关键变化

- convergence 新增强制 authority evidence 的 `pre-tag` stage；`post-main` 不再消费 hosted evidence。
- 发布 Skill、检查清单和 current release flow 移除准备阶段真实 token exchange。
- tag publish Host Node job在 verifier 前执行 lockfile-bound `npm ci`。
- workflow contract tests 同时保护依赖准备顺序、runner 隔离与单次 probe 语义。

## 影响、风险与兼容性

每个 Host Node tuple 增加一次依赖安装，但保持 runner 与 Node ABI 隔离，且不改变 tarball bytes。旧 automation 若把 `post-main` 当作 tag 授权必须迁移到 `pre-tag`；缺少 current evidence 时会 fail closed。rc.9 保留为未完成发布尝试，rc.10 使用新版本继续。

## 验收摘要

- 准备 rc.10 全程不 dispatch authority probe，也不请求 `npm-production` probe 审批。
- 正式发布路径只有一个 probe 调用点，`pre-tag` 对缺失、过期和漂移 evidence 全部拒绝。
- 两个 Host Node tag jobs 都在独立 runner 安装依赖后验证同一冻结 tarball。
- OpenSpec、Skill、workflow、契约测试、current knowledge 与 release materials 一致。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/open-source-release-governance/spec.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
