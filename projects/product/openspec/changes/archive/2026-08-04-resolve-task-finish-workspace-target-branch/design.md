## Context

Workspace Task Environment 的 provider evidence 可以保存 `startPoint: HEAD`、commit 或其他 checkout 表达式；这些值描述“候选从哪里创建”，不保证是 retained 中可交付的 local branch。Task Finish 当前把 `repository.startPoint` 当作默认 target branch，因而冻结了错误 identity。

## Goals / Non-Goals

**Goals:**

- 在任何 carrier/delivery mutation 前冻结真实 retained target branch。
- 默认调用与 retained checkout 当前分支一致，显式输入只允许确认同一分支。
- 保持 remote 解析、push 后回读和五阶段 authority 不变。

**Non-Goals:**

- 不修改 Task Environment provider evidence 或把 target branch 写入 Receipt。
- 不自动切换 retained branch，不从 commit、remote ref 或候选 branch 猜测交付目标。
- 不恢复已 blocked 且绑定错误 target identity 的旧 Finish run。

## Decisions

### Decision: retained 当前符号分支是默认 target authority

Application 在创建新 run 时读取 retained checkout 的 `git symbolic-ref --short HEAD`。没有显式输入时直接使用该 local branch；`HEAD`、commit 或 Environment `startPoint` 不进入 target branch 解析。

### Decision: 显式输入只能确认 retained 当前分支

若调用方传入 `--target-branch`，Application 要求其非空且与 retained 当前符号分支完全相等。detached checkout 或不一致值在 run 创建前返回输入诊断，不创建可恢复 run，也不修改候选或 retained tree。

### Decision: 旧 blocked run 不迁移

Finish run identity 是冻结事实。已绑定 `targetBranch: HEAD` 的旧 run 不改写、不 resume；修复后从 current Development handoff 创建新 run。第一版不建设 run migration 或 identity patch。

## Risks / Trade-offs

- retained checkout 必须已在预期交付分支；这是现有 preflight 本就要求的事实，提前到 run 创建期能减少无效 run。
- 不使用 Environment `startPoint` 会失去一个看似方便的提示，但避免把 checkout 表达式升级为 lifecycle authority。
