## Context

`worktree context` 已根据共享 Git receipt 确定性解析 environment，并公开 `workspaceRoot`、`environmentRoot`、membership、CLI/runtime identity 与 `executionReady`。task-board 再读取 receipt 或要求显式 identity 会复制定位逻辑并产生不一致分支。

## Goals / Non-Goals

**Goals:**

- task environment 内使用单一产品接口取得 retained Workspace root。
- 消除 Agent 路径扫描、receipt 解析和输入选择。
- context 无效时明确阻塞写入。

**Non-Goals:**

- 不新增 task-board CLI 或自动写看板实现。
- 不改变非 task environment 的普通 Workspace discovery。
- 不改变 `worktree context` schema。

## Decisions

### 1. `worktree context.workspaceRoot` 是唯一 environment 内 authority

Agent 使用当前 environment 的 receipt-bound `cliInvocation` 调用 `worktree context`，并只消费成功结果中的 `workspaceRoot`。相比读取 receipt，该接口封装了 receipt 位置、schema、identity 和 stale 检查；相比显式 identity，它避免调用者重复提供产品已知事实。

### 2. Context 无效时 fail closed

缺少 `workspaceRoot`、context blocked、environment identity 不匹配或 CLI/runtime binding 无效时，task-board 返回 `blocked`。不得扫描父目录、读取 receipt JSON、回退到 environment checkout 或要求用户补一个 Workspace path。

### 3. 非 environment 调用保持普通 Workspace discovery

只有调用路径属于 task environment 时强制 context；直接在 retained Workspace 中调用时继续使用当前 Workspace registry/discovery，避免为无 environment 的 tracking 任务制造额外命令。

## Risks / Trade-offs

- [context 因 runtime stale 阻塞看板] → 这是预期的 fail-closed；先修复 environment binding，避免写错 Workspace。
- [自然语言 Skill 仍由 Agent执行命令] → 用唯一命令、唯一字段和负向测试将自由度降到最低，不另建重复产品 API。
