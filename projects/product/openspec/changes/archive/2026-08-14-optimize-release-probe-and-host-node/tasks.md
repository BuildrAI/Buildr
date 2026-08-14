## 1. 发布授权阶段收敛

- [x] 1.1 将 release convergence 明确拆分为无 hosted evidence 的 `post-main` 与强制 current v2 evidence 的 `pre-tag`，补齐缺失、过期、source/workflow 漂移回归。
- [x] 1.2 更新 Buildr Release Skill，使候选准备停在 `post-main`，只有明确发布授权后才运行唯一 probe 并立即进入 `pre-tag`。
- [x] 1.3 同步 release checklist 与发布流程 current knowledge，移除准备阶段真实 OIDC exchange 和重复审批语义。

## 2. Tag publish Host Node 隔离修复

- [x] 2.1 在 `publish.yml` 的每个 Host Node matrix job 中，以对应 Node 和 package lockfile 独立执行 `npm ci`，保持唯一正式 tarball bytes 不变。
- [x] 2.2 扩展 workflow/release 契约测试，证明依赖安装位于 Host Node verifier 前、job 不复用其他 runner 的 `node_modules`，且最终 tarball consumer 边界不变。

## 3. rc.10 发布材料

- [x] 3.1 将 Buildr package 与 lockfile 版本无 tag 更新到 `0.1.0-rc.10`，并确认全部 resolved URL 仍来自 npm 官方 Registry。
- [x] 3.2 新增唯一 rc.10 CHANGELOG 章节并更新公开当前版本入口，准确记录 rc.9 未发布 tag、发布修复与 probe 去重范围。
- [x] 3.3 使用 release notes 提取器验证 rc.10 正文完整且不包含相邻版本内容。

## 4. 直接反馈与收敛准备

- [x] 4.1 运行 OpenSpec strict validation、相关 contract/integration tests 与 changed plan，修复全部当前 finding。
- [x] 4.2 收敛 Brief、发布流程 current knowledge 与术语影响，确认没有 unresolved current knowledge。
- [x] 4.3 核对最终 change diff、rc.9 外部事实保持不变，并完成 deterministic convergence/archive readiness。
