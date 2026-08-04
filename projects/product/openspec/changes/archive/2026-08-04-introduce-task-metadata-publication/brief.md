# Task Metadata Publication

## 一句话摘要

以唯一Skill把canonical Workspace中一个明确Task的portable exact owned paths独立发布到Git，并把所有record语义、Candidate、Finish与Git执行authority留给现有owner。

## 背景与问题

P0.1至P0.5已经形成五个portable record paths，P0.6已经形成唯一Git Operations；两者之间仍缺少一个能证明publication scope与同一bytes snapshot的独立边界。目录扫描或把metadata混入Candidate都会破坏writer ownership与生命周期分层。

## 目标

- 组合真实writer声明的五个exact paths，缺失optional records保持缺失。
- 以无状态helper在commit前后验证presence/bytes/commit diff，revision drift时fail closed。
- commit和push分别调用Git Operations，保留完整range gate、部分失败与安全重试事实。
- 无Git时保留local records；退役引用只返回最小diagnostic，不改写历史。

## 非目标

- 不新增公共Application/CLI、数据库、registry、transaction、锁或publication history。
- 不发布Environment、Finish、asset-review、mutations、worktree/runtime、Candidate、delivery source、其他Task或Board/Retrospective。
- 不恢复旧Git routes，不自动stash/reset/rebase/merge/force push或改写共享commit。

## 受影响角色

- Agent：通过唯一Skill选择Task、repository/ref与允许effects，并消费两个独立Git Results。
- Workspace维护者：获得只包含portable lifecycle metadata的独立commit与可解释失败边界。

## 核心流程

Agent确认canonical Workspace、Task与Git授权 → writer read models/declarations给出eligible exact paths与reference diagnostics → helper生成snapshot → Git Operations创建独立metadata commit → helper复核live bytes与commit tree → Git Operations核验完整range并push → 返回commit/push独立Result；任一失败保留已发生effects且不改变Task lifecycle authority。

## 关键变化

- 新增 `task-metadata-publication` / `buildr.task-metadata-publication/v1`。
- 四类writer contracts声明五个portable exact paths。
- 新增无状态helper、package/runtime投射与覆盖Git fixture的测试。

## 影响、风险与兼容性

现有record schemas与writers不变，现有Git Operations继续是唯一executor。主要风险是snapshot与commit间drift、declaration漂移及scope外unpublished commits；分别通过post-commit bytes验证、package静态一致性测试和完整range gate处理。

## 验收摘要

五个paths的存在组合、明确排除项、dirty/index保留、path冲突、drift、commit/push/部分失败、等价重试、共享Candidate冻结、无Git与历史reference diagnostics均有自动化证据；集成后retained Codex runtime只出现一个新入口且Doctor ready。

## 技术artifacts入口

- `proposal.md`
- `design.md`
- `specs/task-metadata-publication/spec.md`
- `tasks.md`
