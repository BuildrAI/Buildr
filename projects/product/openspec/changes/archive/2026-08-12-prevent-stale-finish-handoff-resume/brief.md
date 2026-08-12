# 阻止陈旧 Finish handoff 恢复

## 一句话摘要

让 Task Finish 的每次运行和恢复都严格绑定创建时冻结的 current Development handoff，阻止旧 run 在新 generation 上交付内容却继续声明旧 Candidate 等价。

## 背景与问题

现有 Finish preflight 先确认 Development 存在某个 current handoff，再从历史 handoffs 中查找 run 冻结的旧 identity；blocked run 和 run factory 也可能静默复用旧 identity。Development 推进到新 Candidate 后，旧 run 因此仍可能从变化后的 Task source 形成 carrier，破坏 Result 的身份关联和确定性等价证明。

## 目标与非目标

目标是由 Development 精确断言 handoff、Candidate、generation 与 Content Target identity，让 Finish 在有副作用的阶段和 resume 前统一失败关闭，并按是否已有副作用事实安全处置陈旧 run。非目标是不改写历史 Result、不新增状态机或存储、不自动丢弃 carrier/远端/cleanup 事实，也不把正式 Verification 或 Candidate 生成搬进 Finish。

## 受影响用户或角色

- 使用 Task Finish 交付和恢复正式 Task 的 Agent。
- 依赖 Finish terminal association、Execution Record 与 Development handoff 审计交付身份的维护者。
- 维护 Task Development、Task Finish capability contract 和 Buildr Service 的开发者。

## 核心流程

新 run 冻结 current handoff 的四项核心 identity。preflight、prepare、verify、deliver 和复用阶段输出的 resume 都调用 Development 的同一精确 assertion。handoff 已变化时，无 carrier、lease、delivery、retained、cleanup 事实的 preflight-only旧 run保留记录后安全终结；已有任一事实的旧 run保留现场并返回类型化冲突。Cleanup 继续按已持久化的交付事实完成必要清理。

## 关键变化

- carrier assertion 从宽松 currentness 收紧为四项冻结 identity 精确匹配。
- Finish 不再自行遍历历史 handoffs，也不从新 Task source 为旧 run 重建 carrier。
- run factory 对不同 identity 的 current run 失败关闭。
- 显式旧 run 恢复不能绕过 Development currentness。
- 新 handoff 的新 run 必须重新提交并冻结 commit message；同 identity retained Doctor resume 保持可用。

## 影响、风险与兼容性

变更影响 Task Development operation contract、Finish Application/Product executor/run factory、diagnostic、测试和随包 capability/Skill 资产。正常首次 Finish 与同 identity 恢复保持兼容；依赖历史 handoff 或不同 identity 静默复用的行为属于缺陷行为。最主要风险是错误终结已有恢复事实的 run，因此任何未知事实都失败关闭，仅明确无副作用时允许 supersede。

## 验收摘要

- 历史 handoff A 与 current B 并存时，A 不能通过 preflight。
- prepare 后 handoff 漂移会在 deliver 前停止且零 push。
- existing current run identity 不同不能被 factory 静默复用。
- 已有 carrier、remote 或 cleanup 事实的旧 run不得自动删除、终结或换绑。
- retained Doctor 的同 identity resume 继续复用原 run。
- 新 handoff 创建新 run并独立冻结 commit message。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
