# 稳定 OpenSpec deltaHash 的跨 checkout 身份

## 一句话摘要

让同一 OpenSpec Change 在不同 clone 或 task worktree 中基于逻辑 delta 内容获得相同 `deltaHash`，不再把本机绝对路径误当作变更语义。

## 背景与问题

Buildr 当前在解析 delta 时保留每个 `spec.md` 的绝对路径，并将它直接纳入 hash。相同的 committed Change 因 checkout 根不同而产生不同 identity，进而让 receipt、convergence plan 与 delta-change 判断发生无意义的失效。

## 目标与非目标

目标是将 `deltaHash` 固定为排序后的逻辑 delta 文件路径和规范化内容的身份，并保持旧的本机路径 hash fail-closed 后重新规划。

非目标是不改变 OpenSpec Requirement parser、canonical 同步、CLI 参数、receipt schema、上游版本或测试性能；也不建立旧哈希迁移表。

## 受影响用户或角色

- 在不同 clone、task worktree 或主机路径中执行 OpenSpec Change 的 Agent。
- 消费 delta identity 的 Buildr convergence planner、receipt 与 Task Finish preflight。

## 核心流程

Parser 从当前 checkout 读取 delta 文件，但只将 `specs/<capability>/spec.md` 的逻辑路径及规范化内容写入可移植 hash 输入。后续 convergence 使用该 hash 比较 delta；若遇到旧 receipt 的本机路径 hash，则按既有 identity 不匹配流程基于当前 canonical 重新规划，而不改写历史 receipt。

## 关键变化

- 绝对 `file` 路径继续用于本次进程的 I/O 与诊断，不再参与 `deltaHash`。
- hash 输入改为稳定排序的结构化逻辑文件集合，避免 checkout 根和平台分隔符影响身份。
- 增加跨绝对根相同 delta 相等、逻辑输入变化不等的回归覆盖。

## 影响、风险与兼容性

升级后的活跃 Change 若带有旧 hash receipt，会安全地重新规划一次；不会把旧 proof 伪装成新 portable identity。CLI 和 receipt schema 保持不变，未引入额外 migration 或性能工作。

## 验收摘要

- 两个不同绝对根的相同 delta 生成相同 `deltaHash`。
- capability 逻辑路径或规范化内容变化生成不同 hash。
- 旧 receipt 不会被改写以匹配新 hash，而是触发既有的安全重规划。
- 受影响的 parser/contract 测试与 OpenSpec strict validation 通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [OpenSpec contract guard delta](specs/openspec-contract-guard/spec.md)
- [Implementation tasks](tasks.md)
