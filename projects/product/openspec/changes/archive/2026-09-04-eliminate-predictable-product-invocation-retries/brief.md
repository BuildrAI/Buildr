# 消除可预测的 Product 调用重试

Buildr Product 已有精确开发 Node 和 canonical writer provenance 保护，但 Agent 面向入口仍可能先选择错误 runtime，再根据预期诊断重试。本变更让 Product 验证在第一条 npm 生命周期前选择精确 Node，并让自举 Task Verification 在第一次报告写入前选择 retained Buildr。

## 背景与问题

- 系统 PATH 可能提供兼容但不等于 `.node-version` 的 Node；显式 `NVM_DIR` 中已有精确版本却未被 development resolver 使用。
- Task worktree 可以执行真实测试，但其 candidate Buildr 不能写 canonical retained Workspace。当前 Skill 没有在调用前明确 writer invocation。

## 目标与非目标

- 目标：消除两类可预测的首次失败，保留现有 Node 精确版本与 SQLite writer provenance 保护。
- 非目标：不下载或管理 Node，不改变 npm Host Node，不恢复已退役的 Verification workflow，不改变数据 schema。

## 核心流程

1. Agent 通过 repository-owned wrapper 启动 Product 验证；resolver 从显式 authority 中选择精确开发 Node。
2. Agent 在 Task worktree 执行测试并形成 portable report。
3. Agent 使用 canonical retained Product bridge 完成 report `inspect|record`。

## 影响、风险与兼容性

- `npm run` scripts 继续兼容；Agent 指引改为 wrapper-first。
- candidate writer rejection 继续零写入；新增诊断只提供准确恢复入口。
- 显式 `NVM_DIR` 是有界候选，不扩展为用户目录扫描或 runtime 管理。

## 验收摘要

- hostile PATH 下有精确 NVM Node 时首次直接使用正确 Node。
- Task worktree 场景第一次报告写调用使用 retained Buildr。
- candidate 直写仍在任何 canonical store mutation 前被拒绝。

## 技术入口

- `design.md`
- `specs/npm-cli-package/spec.md`
- `specs/product-verification-quality/spec.md`
- `specs/task-verification/spec.md`
- `specs/agent-task-workflows/spec.md`
