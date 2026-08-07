# 无 Task 的直接 Git 收尾

## 一句话摘要

让没有 active Task 的 Workspace 在用户说“收尾”时，能够通过现有 Git Operations 安全完成当前 Git 交付，同时保持 Formal Task Finish 的任务证据门禁不变。

## 背景与问题

当前“收尾”默认命中 Task Finish。没有 Task Record、Development handoff 或 ready Environment 时，Task Finish 正确拒绝，但也使本来可以完成的 rebase、精确 commit、push 被一起阻止。缺少的是路由分离，而不是 Formal Finish 门禁放宽。

## 目标与非目标

目标是增加无 active Task 的直接 Git 收尾路由，由产品入口从 Workspace/Git 当前事实解析目标并调用现有 `buildr.git-operations/v1`。非目标是创建临时 Task、伪造正式验证证据、扩展 Git 命令目录、默认 force push 或修改共享历史。

## 受影响用户或角色

- 在没有 Task Record 跟踪的对话中收尾当前 Workspace 改动的 Agent/用户。
- 使用 Formal Task Finish 完成交付、环境清理和 Task terminal status 的 Buildr 用户。
- 维护 Buildr runtime Skill、Git Operations provider 和 Task Finish 路由的开发者。

## 核心流程

没有 active Task 时，“收尾”先读取当前 repository、分支、remote、目标 ref、dirty/index 和 exact scope。事实唯一时按 `fetch → 必要时精确 commit → rebase → push` 的选定顺序执行，冲突、scope 外 dirty、目标歧义、共享历史和 force push 继续停止。成功只产生 Direct Git Delivery Result；正式 Task 仍只进入 Task Finish。

## 关键变化

- Task Finish description 不再独占“收尾”意图，明确只匹配正式 Task handoff。
- Product runtime Buildr Skill 增加无 active Task 的直接 Git 收尾路由。
- Git Operations Skill 明确产品入口负责直接工作流顺序，provider 只执行独立 operation。
- 新增直接 Git 收尾 spec 与 agent workflow 路由回归证据。

## 影响、风险与兼容性

不新增 structured store、Task writer、Finish receipt 或 capability major version。主要风险是“收尾”意图或目标 ref 歧义、rebase 冲突和共享历史改写；通过唯一事实解析、精确 ownership、完整 push range 检查和 fail-closed 处理控制。Formal Task Finish 的五阶段、handoff、Environment cleanup 和 Task terminal 语义保持兼容。

## 验收摘要

Skill/manifest/package consistency tests 能区分两种收尾入口；OpenSpec strict validation 通过；Task Finish contract 仍要求 formal Task/Environment/handoff；直接 Git spec 覆盖历史 Task 不复用、dirty scope、rebase 冲突、普通 push 和无正式生命周期副作用。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [direct-git-closeout spec](specs/direct-git-closeout/spec.md)
- [agent-task-workflows delta](specs/agent-task-workflows/spec.md)
- [tasks.md](tasks.md)
