# 优化 Task Worktree Skill

## 摘要

在不改变 `buildr.task-worktree-lifecycle/v2` 行为和协作拓扑的前提下，把随包 `task-worktree` Skill 收敛为更短、更结构化且无歧义的操作手册。

## 背景与问题

当前 Skill 的生命周期边界正确，但正文重复 contract 和 Guardrails，创建流程占比过高，部分表述可能让 Agent 跳过复用检查或未经证明删除 artifacts 副本。

## 目标与非目标

- 目标：精简 description 和正文，明确决策、生命周期、交接、授权与停止条件。
- 非目标：不修改 CLI、capability contract、bindings、Git integration、Candidate policy 或 Task Finish 编排。

## 核心流程

Agent 先决定 create、reuse、none 或 blocked；采用 environment 后依次完成 plan、创建或复用、context gate、受限执行和 retain/cleanup，并向验证或收尾 consumer 交接 lifecycle evidence。

## 关键变化

- 单句 routing description。
- 五段式正文结构。
- 复用只跳过 create-time doctor/sync。
- artifacts 收敛前必须证明 ownership 和唯一目标。
- 保留发布 worktree、远端授权和 fail-closed 边界。

## 影响与风险

影响随包 Skill 和相应静态/契约测试。主要风险是压缩时遗漏安全语义，通过 v2 contract、canonical specs 和 capability graph 对照降低风险。

## 验收摘要

Skill 明显缩短且无重复 Guardrails；关键决策与停止条件可被静态测试验证；v2 provider 和 consumers 保持 ready。

## 技术入口

- `proposal.md`
- `design.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
