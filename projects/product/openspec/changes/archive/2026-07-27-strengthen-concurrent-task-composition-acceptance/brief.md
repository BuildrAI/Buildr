# 多任务组合验收补强

一句话摘要：让多任务组合验收通过真实产品入口证明 CLI、多仓、并发启动、竞态恢复和安全清理边界。

## 背景与问题

现有 Candidate 门禁已经组合两个任务环境、预览、资源协调、目标竞态和清理，但部分结论仍来自字段形状、底层原语或测试脚本直接操作。它能说明核心能力存在，尚不能完整证明 Agent 实际使用路径在多仓和失败场景中仍然成立。

## 目标与非目标

- 目标：真正执行任务专属 CLI，并覆盖不同 cwd 和嵌套独立仓库。
- 目标：证明两个预览及可并行验证确实重叠运行，共享资源仍按容量协调。
- 目标：通过产品入口验证竞态恢复、归属保护和失败清理。
- 非目标：不改变并发开发架构，不新增 OS 沙箱，不处理 CLI identity 自动刷新或收尾证据输入优化。

## 核心流程

Candidate 在最小多仓 Workspace 中创建两个真实任务环境，从不同执行目录调用各自 receipt 绑定 CLI；并发启动预览和验证 worker；制造目标分支竞态并通过正式收尾入口恢复；最后使用产品生命周期动作清理各任务资源，对 retained Workspace 执行 doctor。

## 关键变化

- 单仓、结构性 CLI 检查升级为多仓、真实 CLI 执行。
- 顺序启动升级为带就绪证据的并发启动。
- 直接 Git 清理升级为带归属校验的产品化清理。
- 新增 `buildr worktree cleanup`，按 receipt、owner、clean 和每仓 integrated ref 安全删除本地多仓任务环境，不删除远端或丢弃未集成工作。
- 状态机原语检查升级为正式收尾恢复路径。
- 子进程输出和退出竞态升级为确定性诊断。

## 影响、风险与兼容性

只增强产品验证与证据，不改变公开 CLI 行为。主要风险是组合门禁耗时和并发波动增加，因此采用最小 fixture、事件屏障和统一子进程 supervisor，不使用固定 sleep 推断并发。

## 验收摘要

- 两个任务从不同 cwd 实际执行各自 CLI，且完整多仓 membership 可区分。
- 两个预览与可并行 worker 有真实重叠证据，共享资源有排队证据。
- `target-race` 经正式入口恢复，只重跑失效范围。
- 成功和失败路径都只清理任务自有资源，retained doctor 为 ready。
- worker 异常具有完整终态诊断且不残留进程或租约。

## 技术入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Concurrent task acceptance delta](specs/concurrent-task-acceptance/spec.md)
