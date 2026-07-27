---
name: openspec-contract-guard
description: 创建、收敛或归档 OpenSpec change，且需要检查 active change 冲突、隔离验证、canonical 并发漂移或恢复事实时使用。此 Skill 是 Buildr 的 OpenSpec sidebar，不修改外部 openspec-* Skills。
metadata:
  author: buildr
  version: "1.1"
  supportedOpenSpec: "1.6.0"
---

# OpenSpec Contract Guard

本 Skill 只保留 OpenSpec 1.6 未提供的 Buildr 契约保证：并行 active change 冲突、确定性 expected tree、隔离严格验证、条件式 canonical 写入、写后确认和基于文件事实的断点恢复。

OpenSpec 1.6 负责 delta 格式与 Requirement 结构、单个 change 的规范校验、canonical spec 重建和 archive 的场景保全检查。先运行上游 `openspec validate <change> --strict`；本 Skill 不重复实现这些解析或 archive 安全规则。

本 Skill 不修改外部 `openspec-*` Skills、外部 OpenSpec CLI 或本机 CLI 安装。

## 1. Proposal 检查

change artifacts complete 且上游严格验证通过后运行：

```bash
openspec validate <change> --strict
buildr openspec check <change> --stage proposal --project <project> --target <workspace> --json
```

历史 change 的 baseline/create 和阶段型 check 只保留兼容诊断；新收敛事务不创建、刷新或依赖这些 sidecar。

## 2. 单一收敛事务

```bash
openspec validate <change> --strict
buildr openspec converge <change> --project <project> --target <workspace> --json
```

产品计算单一 identity/plan，在临时 Project 投射 expected files并运行 `validate --all --strict`；随后重验 delta、executable 与全部 canonical before digests，条件一致才替换文件。写后只确认 expected digests 与真实 strict validation，再执行 `archive --skip-specs`。正常路径只写 `.buildr/convergence-receipt.json`。

## 3. 失败处理

- `blocked`：列出语义冲突、冲突 change/Requirement 或 strict validation 诊断，修订 artifacts 后重试。
- `recovery-unprovable`：canonical 出现 before/expected 之外的值、混合状态或旧 identity 链不完整；停止并人工核对，禁止自动覆盖。
- delta identity 变化：丢弃旧 plan，以当前 canonical 重新规划，不恢复旧 before。
- executable identity 变化：旧 validation 不复用，以当前 executable 重新投射验证。
- archive 失败：canonical 保持 `applied-and-matched`，重试只做确认和 archive。
- upstream strict validation 失败：修复上游诊断后再运行 Buildr 门禁。
- CLI/Component version 不一致：使本机 OpenSpec CLI 与 Component 声明一致；Buildr 不代为安装。

用户可见状态必须包含 change、`passed|blocked|recovery-unprovable`、receipt identity/disposition、耗时、命令次数和 `nextActions`。Agent 不拼装内部 guard 命令，也不解释多个 receipt。外部 `openspec-*` Skills 继续承担 explore、propose、update 和 apply；确定性 sync/archive 由 Buildr 事务持有。
