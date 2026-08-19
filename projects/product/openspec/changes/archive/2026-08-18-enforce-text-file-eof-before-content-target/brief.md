# 明确并落实文本文件 EOF 规则

## 一句话摘要

用明确正反例消除结尾换行符与末尾空白行的混淆，并让 Task Development 在形成 Content Target 前检查本次新增文本文件，包括 untracked 文件。

## 背景与问题

required Buildr Core 已规定新建或重写文本文件只能保留一个结尾换行符，也明确正文段落空行不受影响，但缺少 `...\n` / `...\n\n` 示例。Task Development 当前在内容固定后直接调用 `observe`，没有明确要求 Agent 先检查新增文本文件，实际工作中可能到正式验证后才发现末尾空白行并导致 Content Target 变化。

## 目标与非目标

目标是强化现有 Core 表述，并在 Task Development 中加入可执行的 Content Target 前置检查。非目标是不新增 Application 自动校验、CLI、Receipt 字段或 verification capability，也不批量清理未触达的存量文件。

## 受影响用户或角色

- 创建或重写文本文件的 Agent。
- 通过 Task Development 收敛正式 Content Target、Verification 与 Candidate 的产品维护者。

## 核心流程

Agent 创建或重写文本文件时直接遵守 Core。正式 Task 内容固定后，Task Development 在 `observe` 前检查本次新增的全部文本文件；Git-backed scope 合并 tracked-added 与未忽略的 untracked inventory。检查发现问题时先修正 bytes，再形成 Content Target；未触达存量文件不进入本次清理范围。

## 关键变化

- Core 增加 `...\n` 正确、`...\n\n` 错误的明确示例。
- Task Development 增加新增文本文件 EOF 前置检查，并明确 untracked 覆盖。
- 静态契约测试锁定 Rule 结果不变量与 Skill 执行动作的职责分离。

## 影响、风险与兼容性

变化只涉及随包 Rule、Skill 和对应测试，不改变公开 API、Application、SQLite、Content Target identity 或 runtime adapter。检查仍由 Agent 执行，主要风险是手工遗漏；required Core、明确时点和契约测试共同降低该风险。旧 workspace 通过现有 package update/sync 生命周期获得新资产。

## 验收摘要

- Core 同时包含 EOF 正反例和正文合理空行不受限说明。
- Task Development 在 `observe` 前检查本次新增文本文件，包括 tracked-added 与未忽略的 untracked 文件。
- 检查不扩大为未触达存量文件清理。
- 相关静态契约测试和 package checks 通过。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
