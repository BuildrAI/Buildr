# 让正式发布物成为唯一权威

一句话摘要：正式 tag workflow 只生成、验证并发布一个不可变 npm tarball，发布后再从官方 registry 回读同一制品和公开 Release 事实。

## 背景与问题

冻结 Candidate 已在 `dev → main` 完成跨平台开发回归，但 tag workflow 仍重复完整 Candidate，并从 checkout 隐式重新打包发布。发布前 smoke 与 registry bytes 没有显式 identity 绑定，npm publish 后的中断也缺少安全重跑边界。

## 目标与非目标

- 目标：pack once、同 tarball smoke/publish、registry integrity、GitHub Release ensure、官方 registry 发布后 smoke。
- 非目标：不改变 Candidate/Host Node/Windows 预检，不改变 trusted publisher 配置，不采用 staged publishing，不实际发布版本。

## 受影响角色

- Buildr 维护者：获得更短、可恢复且可审计的正式发布流程。
- npm 用户：安装到的公开 tarball 与发布前验证制品具有同一 identity。

## 核心流程

tag contract → pack once → manifest/digest → tarball smoke → registry gate → publish same tarball → registry/dist-tag readback → GitHub Release ensure → official registry smoke。

## 关键变化

- 删除 tag workflow 的完整 Candidate。
- 一个 manifest 绑定本地 tarball、npm publish 和远端 integrity。
- 已存在 npm version 或 GitHub Release 时核对并复用，不重复不可逆动作。

## 影响、风险与兼容性

不改变公开 CLI、package 内容或 Node 支持范围。主要风险是 registry 可见性延迟和重跑时 artifact identity 不一致；分别用有界重试与 fail-closed integrity 比较处理。

## 验收摘要

- workflow 只有一次 pack，`npm publish` 明确接收该 tarball。
- 发布前和发布后 smoke 使用同一生命周期断言。
- 已发布版本只有 integrity 一致时才能跳过 publish。
- 已存在 Release 只核对不覆盖。
- 实现验证期间不创建 tag、不发布 npm、不创建 GitHub Release。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/product-verification-quality/spec.md)
- [Implementation tasks](tasks.md)
