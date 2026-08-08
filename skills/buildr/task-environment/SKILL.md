---
name: task-environment
description: 正式 Task 需要准备、检查、恢复或清理实际执行环境，或按 Task ID 取得 Environment Receipt 的当前机器事实时使用；不用于任务分流、Task Record、验证结论或 Git 集成。
---

# Task Environment Skill

本 Skill 是 `buildr.task-environment/v1` 的默认 provider。它调用公开 CLI，不手写或解析 Environment Receipt。

## 使用方式

必须已有正式 Task Record，并明确 canonical Workspace：

```bash
buildr task environment prepare <task-id> --target <canonical-workspace> --json
buildr task environment prepare <task-id> --plan <json-file> --target <canonical-workspace> --json
buildr task environment plan record <task-id> --input <json-file> --target <canonical-workspace> --json
buildr task environment plan inspect <task-id> --target <canonical-workspace> --json
buildr task environment inspect <task-id> --target <canonical-workspace> --json
buildr task environment cleanup <task-id> --target <canonical-workspace> --json
```

- Agent先读取Task Record的全部Service scope，并审查各Service的构建、验证和工具链事实，然后登记closed `buildr.task-environment-plan/v1`。每个Service必须声明一个或多个有序Step，或显式`not-applicable`；Buildr核心不猜技术栈、不扫描package manifests。
- `prepare --plan`可一次完成登记与准备；若Agent必须先检查Task checkout，可先运行无Plan的`prepare`取得受控执行根（结果明确blocked），再运行`plan record`和`prepare`。
- `prepare` 同时承担首次准备和幂等恢复；只重跑输出缺失或 executable/input identity 漂移的 Step，没有单独 `restore`。
- `inspect`只读重新观察已保存Plan的executable、inputs和outputs；它不执行Step、不创建或修复输出、不回写Receipt。
- `cleanup` 只在 Task 已明确 abandon，或由 Task Finish 提交 durable handoff 时成立。普通 Agent 不绕过授权。

## 执行边界

取得 `ready` 后，只在结果的实际 execution roots / validation root 中写入、构建和测试，并使用结果指定的执行 CLI。Environment Receipt 独占 Runtime、CLI、依赖、projection、动态资源、ready、恢复和总 cleanup；v4 中的依赖事实由 Plan 及逐 Service/Step 事实表达，Task Record 不保存这些字段。Plan 只允许无 shell 的明确 executable、args、Service 相对 cwd、input 与预期 output；受管 Node/npm 等使用 `workspace-foundation` executable，其他技术栈使用 Service 内或明确绝对 executable。不得提交 env、secret、stdin 或任意 shell。Local App Environment GET 只展示已保存 current，不等同于 CLI live inspect。

候选 Skill、CLI 与 runtime 可以在自身任务验证工作区测试，但候选不能写 retained Workspace、其他 Task worktree 或共享 user runtime，也不能认领或清理自己的 Environment。真实 Agent session 是否采用候选 runtime 属于 Task Verification，不在这里证明。

## 停止条件

Task/Workspace 不匹配、Plan 缺失或未完整覆盖 Task Service scope、Receipt 损坏、retained Environment Manager 不可信或源码 dirty、provider/resource identity 漂移、required Step 缺失/漂移/执行失败、必需 probe blocked、执行根越界或 cleanup 未授权时停止，保留现场并报告具体 Service/Step diagnostic 与 next action。Task checkout/provider evidence 决定源码版本；不要从 cwd、分支、同一 HEAD 或旧 worktree receipt 猜 ownership，retained Buildr hash 同样不是 ownership；也不要由 Environment 自动 fetch/rebase。
