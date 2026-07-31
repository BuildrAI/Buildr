# 双任务并发整体验收

一句话摘要：把任务环境、独立预览、共享验证资源、目标竞态和清理组合为一个可重复的 Product Candidate 验收。

## 背景与问题

前四个批次已经交付各项基础能力，但单项测试无法证明两个任务同时运行时不会发生入口、端口、租约、目标分支或清理串扰。批次 5 需要形成长期可重复的自动验收，而不是一次性的人工操作记录。

## 目标与非目标

- 目标：在临时 Workspace 中创建两个真实任务环境，贯穿预览、资源协调、竞态和清理并输出结构化证据。
- 目标：把该场景登记为 Candidate 必需步骤。
- 非目标：不启动两个真实 Agent session，不连接外部 Git 托管、Docker 或业务系统，不替代细粒度测试。

## 核心流程

Candidate 创建临时 retained checkout，派生两个 task environment，核对绝对 CLI invocation；同时启动两个随机端口预览；让两个验证进程竞争同一容量槽；制造目标 ref observation 竞态；最后按归属停止预览、释放租约、删除任务环境，并对 retained checkout 执行 doctor。

## 关键变化

- 新增 `concurrent-task-acceptance` 组合验收脚本和版本化摘要。
- verification registry 将其登记为 Candidate required step，并通过 changed inputs 路由自身变更。
- 失败时 Candidate 失败；所有临时资源仍执行精确归属清理。

## 影响、风险与兼容性

只影响产品验证，不改变公开 CLI 行为。主要风险是进程与随机端口造成波动，因此使用公开 readiness、结构化输出、明确超时和 `finally` 清理，不以固定等待推断成功。

## 验收摘要

- 两个任务 checkout 与 invocation binding 可区分；预览实例和端口彼此独立。
- 共享容量按顺序取得并记录 owner、等待和释放。
- 目标竞态返回 `target-race` 且不覆盖新 ref。
- 预览、租约、worktree、分支均按所有权清理，retained doctor 为 ready。

## 技术入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Concurrent task acceptance spec](specs/concurrent-task-acceptance/spec.md)
- [Product verification delta](specs/product-verification-quality/spec.md)
