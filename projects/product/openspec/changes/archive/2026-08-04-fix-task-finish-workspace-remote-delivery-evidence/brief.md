# 修复 Task Finish workspace 远端交付证据

## 一句话摘要

让 Task Finish 在 workspace-source Project 中解析真实 Git remote，并只在普通 push 后远端回读与 carrier 一致时报告交付完成。

## 背景与问题

Environment 对 workspace scope 可以不声明 remote。Task Finish 直接消费这个空值时只推进 retained 本地分支，却仍把 carrier ref 写成 `remoteAfterRef`；结果看似 complete，实际 `origin/dev` 没有变化。

## 目标与非目标

目标是冻结可验证的 delivery remote、执行真实普通 push、回读远端 ref，并让缺失、歧义或竞争 fail closed。非目标是不重设计五阶段执行器，不增加新 schema、远端选择状态机、Candidate/Verification authority、force push 或远端任务分支。

## 受影响用户或角色

主要影响使用 Buildr 自动收尾的 Agent、维护者和消费 Finish result 的客户端；普通 Project 测试与 Task Verification 不变。

## 核心流程

Product adapter 在创建 run 时依次使用显式 remote、Environment evidence、target branch upstream 或唯一配置 remote，并验证其存在。deliver 在 push 前观察 remote ref、完成 fast-forward 与普通 push，再独立回读；只有 after ref 等于 carrier 才继续 retained convergence 和 cleanup。

## 关键变化

- workspace source 不再因声明缺少 remote 而退化为本地-only delivery。
- `remoteAfterRef` 来自真实 push 后回读。
- 回读失败可在同一 carrier 上恢复；回读不一致按 target race 返回 Task Development。

## 影响、风险与兼容性

没有 upstream 且配置多个 remotes 的 checkout 需要显式 `--remote`，这是避免猜测的安全收紧。低层 run schema 和现有五阶段、resume、cleanup authority 均保持兼容。

## 验收摘要

真实 bare remote 场景必须证明 Environment remote 为空时仍解析 `origin`、实际推送并回读；缺失/歧义必须零 delivery mutation；push 后回读失败或不一致不得产生远端完成证据或 cleanup。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Finish execution delta](specs/task-finish-execution/spec.md)
- [Tasks](tasks.md)
