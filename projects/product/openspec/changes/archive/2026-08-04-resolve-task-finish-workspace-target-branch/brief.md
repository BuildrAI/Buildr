# 修复 Workspace Task Finish 目标分支解析

## 问题

Task Environment 用 `startPoint: HEAD` 表达候选 checkout 来源，Task Finish 却把它当成远端交付分支，导致 retained 实际位于 `dev` 时 preflight 只能阻塞。

## 方案

默认 target branch 直接取 retained checkout 当前符号分支；显式值只能确认同一分支。Environment `startPoint` 不再承担交付 authority。remote 解析、普通 push、push 后远端回读与五阶段均保持不变。

## 完成标准

- `startPoint: HEAD` 的真实 Application journey 冻结 `dev`。
- 显式 target 不一致或 detached retained 在创建 run 前停止。
- 不创建新 schema、run migration 或 branch 切换机制。
