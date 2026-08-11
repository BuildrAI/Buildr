# 收敛 Windows 平台语义与候选 CI

## 一句话摘要

用 Windows 两版本定向预检承担开发反馈，用 macOS/Windows 四个完整 Candidate 承担最终发布证明，并把 Buildr 的公开 Node 支持明确限定为已验证的 24.15.0 至 25 之前。

## 背景与问题

此前 Windows 路径身份、Node 脚本启动、路径断言和 executable mode 分散在多个入口，缺陷只能在几十分钟的完整发布 CI 中逐个暴露。CI 还重复运行独立 release smoke，而 `engines.node >=24.15.0` 又无上限承诺尚未验证的未来 Node 主版本。

## 目标与非目标

- 目标：统一 Windows 平台语义；为任务分支提供快速、完整失败可见的 Windows 定向预检；保留最终候选四矩阵；限定 Node 24 支持范围。
- 非目标：不减少 Candidate 内置发布包生命周期，不适配 Node 25，不在本 Change 中创建 tag 或发布候选版。

## 核心流程

任务分支合入 `dev` 前，Windows Node 24.15.0/当前 24.x 运行 `group:windows-platform-preflight`。两个作业全部完成后统一汇总失败。通过并完成正式交付后，`dev -> main` 在 macOS/Windows × Node 24.15.0/当前 24.x 运行四个完整 `test:candidate`；每个 Candidate 自身包含 `release-tarball-smoke`。

## 关键变化

- 文件系统身份统一由平台感知 helper 判定，短路径、长路径和大小写差异不再被误判为不同目录。
- Product Node 脚本通过 Node executable 加脚本参数启动；Windows 不使用 POSIX executable bit 判定 runtime stale。
- 删除两个重复的独立 `release-smoke` 作业，但保留 standalone verifier 和 Candidate 内置 smoke。
- `engines.node`、安装入口和开发入口统一为 `>=24.15.0 <25`；Workspace 继续保存精确受管版本。

## 风险与恢复

任务分支不运行 macOS 完整 Candidate，最终 `dev -> main` 四矩阵继续阻断发布。若 Windows 预检失败，保留两个矩阵的完整结果后在同一独立 Task 中整批修复；若最终矩阵失败，重新汇总全部失败，不在单个作业内即时修改。Node 25 通过独立适配 Change 加入，不自动扩大承诺。

## 验收摘要

- Windows 定向组必须覆盖 Integration、System、并发 Task、runtime parity、Workspace lifecycle 和 release tarball smoke。
- 最终 CI 必须只有四个完整 Candidate 矩阵且禁用 fail-fast。
- Node 24.15.0 和更高 24.x 可用，Node 25 被兼容边界拒绝。
- 本 Change 停在候选发布准备之前，不创建 tag、npm 发布或 GitHub Release。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Implementation tasks](tasks.md)
