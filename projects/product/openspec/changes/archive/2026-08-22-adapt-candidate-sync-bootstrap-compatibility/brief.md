# 保持候选 Sync 的自举兼容

## 一句话摘要

旧 retained controller 调用候选 `sync` 时自动执行安全的 projection-only 兼容路径，既不污染 task checkout，也不把本次修复变成无法自举的硬门禁。

## 背景与问题

首个方案让 linked candidate/self-checkout 的完整 sync 在写入前失败。真实 Environment prepare 随即证明：升级前 retained controller 仍调用这一命令，导致候选无法完成自己的正式验证。

## 目标与非目标

- 目标：旧调用成功投射 runtime，同时零 Workspace source/store mutation，并提示迁移。
- 非目标：不恢复候选 self-checkout 完整 sync，不放宽 retained/peer/shared target 边界。

## 受影响角色与核心流程

Buildr 自举维护者在跨版本交付期间受影响。candidate sync preflight 识别 source/target 是同一 linked checkout后，直接运行 `render --product-skill` 等价投射并返回；新版 Task Environment 仍使用显式 render。

## 关键变化、风险与兼容性

- 失败式 guard 改为安全自动降级，不形成 Task 生命周期硬门禁。
- 手工运行者会看到实际 disposition、推荐命令和独立 Workspace 指引。
- retained canonical 与隔离 Workspace 的完整 sync 保持原行为。

## 验收摘要

上一版 retained controller 能重新把当前 Environment 准备为 ready；compatibility path 不进入 Workspace 初始化/source mutation；快速验证通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Runtime projection delta](specs/workspace-first-runtime-projection/spec.md)
- [Tasks](tasks.md)
