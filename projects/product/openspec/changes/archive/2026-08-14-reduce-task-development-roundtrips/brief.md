# 压缩 Task Development 工作流往返

## 摘要

Buildr 为 Agent 提供同次 Task Development action 的紧凑 current/next-action 反馈，拒绝含糊的 planning omission，并在 OpenSpec Scenario 遗漏时返回精确 identity；Agent 仍负责选择和执行专业动作。

## 背景与问题

完整 Development result 是正式 read model，但日常推进常只需少量 current identities、applicability 与下一步方向。当前 Agent 往往追加 inspect 或自行重建状态；`begin|planning` omission 还会静默形成空 snapshot。OpenSpec convergence 虽会阻塞 Scenario 遗漏，却没有把已发现的遗漏 identities 返回给 Agent。

## 目标与非目标

- 目标：减少 routine transition 的额外读取，显式化 planning 整值输入，提升 semantic blocker 可处理性。
- 非目标：不自动编排 Agent，不合并专业 authority，不新增效率门禁、公共 CLI、数据模型或 verification preview。

## 受影响角色

- Agent：可按需选择 compact 反馈，并依据精确 blocker 修订专业 artifact。
- Buildr：只输出事实绑定的 current/guidance，不替 Agent 做语义或授权决定。

## 核心流程

1. Agent执行现有Task Development action，可显式请求compact投影。
2. Buildr用同一次Application result返回current摘要和建议性next actions，不追加观察。
3. `begin|planning`必须提交完整snapshot；omission零写入失败。
4. OpenSpec发现Scenario遗漏时返回遗漏identity列表，Agent修订完整delta后重试converge。

## 关键变化

- 新增opt-in `buildr.task-development-driver-compact/v1` response projection。
- Application以shared action contract拒绝缺失`planning`。
- semantic blocker增加`scenario-identities-omitted`与`omittedScenarioIdentities`。

## 影响、风险与兼容性

默认完整Development result、Receipt/repository、Candidate、Verification、Finish与capability binding保持兼容。唯一收紧是旧内部调用不能再省略`planning`；显式空snapshot仍受支持。没有migration或历史记录重写。

## 验收摘要

- compact action只执行一次Application action，并保留必要current/effect/diagnostic/next-action信息。
- metrics不进入gate、状态、Candidate或自动推进。
- planning omission零写入失败且不清空既有事实。
- omitted Scenario identities确定、完整、可移植，canonical保持零写入。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Development delta](specs/task-development/spec.md)
- [OpenSpec deterministic sync delta](specs/openspec-deterministic-sync/spec.md)
- [Tasks](tasks.md)
