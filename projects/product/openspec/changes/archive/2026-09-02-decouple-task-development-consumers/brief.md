# 解除 Task Development 消费者依赖

## 一句话摘要

任务入口、总览、终态展示、任务审查、父子历史和 Buildr Web 改为直接读取各自权威事实，不再依赖 Candidate、Development Handoff 或统一推进状态。

## 背景与问题

Task Verification 已完成独立化，但其余消费者仍把 Task Development 当作任务系统中心。没有 Development Receipt 的普通任务因此无法获得完整的 Review、展示或历史交付体验，旧聚合记录损坏也会扩大影响。

## 目标与非目标

- 目标：退役 `task next`；隔离 Overview、Terminal、Review 和 Parent 历史；让 Buildr Web 分别读取专业事实；保留旧历史。
- 非目标：不删除 Task Development 本体，不重新设计 Review/Verification Result，不新增统一流程或授权系统。

## 受影响用户与角色

- 人：继续在 Task 页面查看目标、专业结果和历史交付，不需要理解 Candidate/Handoff。
- 智能体（Agent）：依据用户目标和当前 Skill 直接选择专业动作。
- 维护者：旧 Development/Finish payload 保持历史可读，current 逻辑不再依赖它们。

## 核心流程

1. Agent读取Task Record和真实产物。
2. 需要环境、审查、验证、父子管理或收尾时直接使用对应Skill与Interface。
3. Buildr Web分别读取专业read model。
4. 旧Parent Plan和Finish run只在历史区域展示。

## 关键变化

- 删除`task next`与Task Entry Snapshot。
- Overview和Terminal不再解释Development gate或Handoff。
- Parent历史迁移到Task-owned只读字段。
- Review GET不再包装Terminal projection。
- 保留且修改的实现和测试迁移到TypeScript。

## 影响、风险与兼容性

- 旧自动化调用`task next`将收到unknown command，随包Skills在同一交付中切换。
- 旧Review adoption和Development snapshot不再出现在current页面，但原始历史payload保留。
- SQLite migration必须验证旧Parent Plan数量、Task身份和JSON完整性。

## 验收摘要

- 无Development任务可独立审查、验证、展示、完成和读取历史。
- Parent inspect不查询Development current。
- Terminal Delivery不依赖Development或Review。
- Overview不计算gate match或统一完成状态。
- TypeScript、migration、CLI、HTTP与Browser受影响验证通过。

## 技术产物入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Delta specs](specs/)
