## Context

CLI `task environment prepare` 把 `--agent` 写成可选，解析时用 `values.get('--agent') || 'codex'`。Application 首次准备同样 `options.adapter || 'codex'`，默认分支硬编码 `codex/${taskId}`。Finish Doctor 跟随 Environment Receipt 的 `controller.adapter`，不跟随当前聊天宿主。Cursor Agent 省略 `--agent` 后会把本机 Cursor 任务登记成 Codex，随后 Doctor 按 Codex 检查共享 `.agents/skills` 收据并 fail-closed。

调用方已经知道当前宿主；产品不得猜测。本 Change 只堵住 prepare 入口的默认值，不探测 host、不改 Finish 预检、不修共享 Skill receipts。

## Goals / Non-Goals

**Goals:**

- prepare 省略 `--agent` 必须在 CLI 解析失败，零环境写入。
- Application 首次 prepare 缺少 adapter 必须 fail closed，不得默认任何 runtime。
- 未给 `--branch` 时默认 `${adapter}/${taskId}`。
- 帮助、Skill 与测试与上述契约一致。

**Non-Goals:**

- 不根据进程、会话或 runtime 文件静默检测当前宿主。
- 不改变 `init`/`doctor`/`sync`/`finish` 的 `--agent` 语义。
- 不处理 Finish 与 retained/`origin` 对齐、共享 Skill 陈旧收据或 GitHub probe。
- 不迁移已存在 Environment Receipt 或已创建的 `codex/<task-id>` 分支。
- 不把 inspect/cleanup 改成也要求 `--agent`；它们继续读取 Receipt。

## Decisions

### 1. CLI 必填，而不是换一个更“安全”的默认值

省略 `--agent` 与 `plan-record` 省略 `--input` 相同：syntax error、非零退出、打印 usage。不得默认 `cursor`、不得按 PATH/`BUILDR_AGENT` 猜测。Cursor 与 Codex 只要写出自己的 id 都能准备成功。

不采用“帮助里警告但默认仍是 Codex”：那正是当前事故路径。

### 2. Application 与 CLI 双重 fail-closed

Buildr Web 与内部调用可绕过 CLI。Application 在没有 Receipt adapter 且 `options.adapter` 为空时必须失败；有 Receipt 时以登记值为准，传入值不一致则既有 mismatch。`assertEnvironmentManager` 删除 `|| 'codex'`，缺少 adapter 时不得假装 Codex manager。

### 3. 默认分支跟随实际 adapter

首次 Git worktree 且未给 `--branch` 时使用 `` `${adapter}/${taskId}` ``。显式 `--branch` 仍优先。恢复路径继续要求与已保存 evidence 一致，不得因为 adapter 名称变化改写已有分支。

不把分支前缀做成独立配置：adapter id 已是宿主身份，前缀与登记值保持同一来源。

### 4. 破坏范围只限 prepare 省略行为

这是对“可省略 --agent”的破坏。已经写出 `--agent` 的调用、测试与脚本保持兼容。Skill 示例必须带 `--agent <agent>`；不得再给出可省略的 prepare 命令。

## Risks / Trade-offs

- [风险] 旧脚本省略 `--agent` 会突然失败。→ 这是目标行为；帮助与 syntax 明确要求 `--agent`。
- [风险] 已有 `codex/<task-id>` 分支的 Cursor 任务不会自动改名。→ 恢复匹配已保存 evidence；新任务才用新前缀。
- [风险] Agent 仍可能写错宿主。→ 产品只要求显式声明，不探测；错误声明仍走既有 mismatch。
- [风险] inspect/cleanup 仍不收 `--agent`。→ Receipt 已有 adapter；扩大 CLI 表面超出本 Change。

## Migration Plan

1. 更新 specs、帮助、Skill 与 CLI Reference。
2. CLI 解析与 Application 去掉 Codex 默认值，默认分支改用实际 adapter。
3. 修正省略 `--agent` 或断言 `codex/` 默认前缀的测试。
4. 收敛 Brief 与受影响 current knowledge；不改无关 Doctor/Finish 文档。

## Open Questions

无。宿主切换仍awkward，共享 Skill receipts 另案处理。
