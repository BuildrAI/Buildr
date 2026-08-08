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
buildr task environment inspect <task-id> --target <canonical-workspace> --json
buildr task environment cleanup <task-id> --target <canonical-workspace> --json
```

- `prepare` 同时承担首次准备和幂等恢复；它按 Project `task-environment.yml` 的显式 Service 闭包逐根处理依赖，没有单独 `restore`。
- `inspect` 只读返回当前机器的最新 probe；它可以发现依赖缺失或 lockfile 漂移，但不运行 package manager、不创建 `node_modules`、不回写 Receipt。
- `cleanup` 只在 Task 已明确 abandon，或由 Task Finish 提交 durable handoff 时成立。普通 Agent 不绕过授权。

## 执行边界

取得 `ready` 后，只在结果的实际 execution roots / validation root 中写入、构建和测试，并使用结果指定的执行 CLI。Environment Receipt 独占 Runtime、CLI、依赖、projection、动态资源、ready、恢复和总 cleanup；其中依赖以逐 dependency-root 事实和 scope 聚合表达，Task Record 不保存这些字段。不要递归扫描 package manifest/lockfile；每个声明的 npm root 使用自己的 lockfile、worktree-local `node_modules` 与 Workspace Foundation 受管 npm。Local App Environment GET只展示已保存 current，不等同于 CLI live inspect。

候选 Skill、CLI 与 runtime 可以在自身任务验证工作区测试，但候选不能写 retained Workspace、其他 Task worktree 或共享 user runtime，也不能认领或清理自己的 Environment。真实 Agent session 是否采用候选 runtime 属于 Task Verification，不在这里证明。

## 停止条件

Task/Workspace 不匹配、Receipt 缺失或损坏、retained Environment Manager 不可信或源码 dirty、provider/resource identity 漂移、required dependency root 缺失/漂移/安装失败、必需 probe blocked、执行根越界或 cleanup 未授权时停止，保留现场并报告具体 root diagnostic 与 next action。Task checkout/provider evidence 决定源码版本；不要从 cwd、分支、同一 HEAD 或旧 worktree receipt 猜 ownership，retained Buildr hash 同样不是 ownership；也不要由 Environment 自动 fetch/rebase。
