# 任务环境 CLI 调用绑定

一句话摘要：任务环境在核验 Buildr 产品身份的同时，直接提供与 receipt 绑定、从任意 cwd 可执行的绝对 CLI 调用信息。

## 背景与问题

当前任务环境只披露 `cliSource` 和源码摘要。调用方仍需判断当前目录、产品位置和 Node 入口，再拼装实际命令；并发任务中这会造成路径试错，甚至误用另一个 checkout 的产品。

## 目标与非目标

目标是同时保留产品源码身份和结构化 invocation，让自举 Workspace 使用任务 checkout 内已有 bridge，让普通 Workspace 使用已声明的外部产品入口。非目标是创建短路径别名、修改全局 `PATH`、安装全局开发 CLI，或立即删除兼容字段。

## 受影响用户或角色

- 在同一 Workspace 并发开发多个任务的 Agent。
- 调用任务环境上下文、Task Finish Action Registry 和验证框架的产品消费者。

## 核心流程

`worktree create` 解析并核验产品源码身份与调用方式，将两者写入 receipt；`worktree context` 重新核验并返回 `cliInvocation`；消费者使用 invocation 的 command 与固定参数前缀，再追加自己的子命令参数。

## 关键变化

- receipt 和 execution binding 新增绝对 `command` 与 `argsPrefix`。
- environment-local 产品使用 task checkout 内现有 Node-aware bridge。
- external-product 使用当前已核验 Node 与绝对产品入口，不依赖消费者 Workspace 布局。
- Action Registry 以 invocation 为标准输入，旧 `cliSource` 仅保留兼容。

## 影响、风险与兼容性

这是兼容性扩展；旧 receipt 和 caller 仍可读取。外部 Node 或入口漂移时 context 会 fail closed 并要求刷新绑定。不会增加全局状态或新的环境清理负担。

## 验收摘要

- 从 Workspace、Product 或 Service cwd 使用同一 context 返回的 invocation 均可执行。
- 两个并发 task environment 分别绑定自己的产品入口。
- 普通 Workspace 的产品位置任意时仍能得到完整外部 invocation。
- Action Registry 不再从 root 猜测产品路径，并正确组合固定前缀与动作参数。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-environments/spec.md`
- `specs/task-finish-execution/spec.md`
- `tasks.md`
