# 优化 Task Finish 收尾编排

## 一句话摘要

保持 Formal Task Finish 固定五阶段和现有权威边界不变，以只读解析证据、宿主长等待语义和 Buildr 自举 Workspace 专属确定性 runner，显著减少 Agent 在收尾阶段的重复上下文装载与机械工具调用。

## 背景与问题

最近一次正式任务复盘显示，“收尾”共发生 17 次 Agent 工具调用：Formal Finish 产品执行器只运行一次且五阶段全部一次通过，但调用前的 contract/context 装载和 Finish 后的 self-bootstrap sync、commit、push、安装、Doctor与读回仍由Agent逐条拼接。该模式增加Token和往返开销，并可能因猜错contract版本、短等待轮询或部分成功后重复命令而产生无效动作。

## 目标与非目标

目标是让Finish Result报告只读的已解析最小上下文，让Task Finish Skill使用有界长等待至终态，并为当前Buildr自举Workspace提供一个结构化、幂等可恢复的post-Finish closeout runner。

非目标是不改变Formal Finish五阶段，不新增execution capsule、Receipt、数据库、后台队列或普通Workspace能力，也不合并sync、Git、安装、Doctor等authority与失败边界。

## 受影响用户或角色

- 使用Buildr完成正式Task交付的Agent：减少重复读取、短轮询和手工命令拼接。
- Buildr维护者：获得可测试的self-bootstrap部分成功恢复与结构化结果。
- 普通Workspace用户：行为不变，不安装或暴露self-bootstrap runner。

## 核心流程

Agent在用户明确授权“收尾”后直接启动canonical `task finish run`，使用宿主支持的有界长等待消费同一session直到终态。Formal Finish complete或满足唯一Doctor-blocked例外后，当前Buildr自举Workspace Skill只调用一次Product内部runner；runner从同一run读取Finish Result，确定性形成plan并依次执行适用的sync、successor commit、push、安装与最终Doctor/same-run resume。任何阶段失败均保留已发生事实并在当前边界停止。

## 关键变化

- `buildr.task-finish-result/v2` additive增加`resolvedContext`，不形成新authority。
- `buildr-self-bootstrap-sync`新增确定性Node runner和结构化Result。
- successor commit以run/plan identity trailer支持幂等恢复。
- Task Finish Skill采用长等待语义，不承诺固定秒数或固定调用次数。

## 影响、风险与兼容性

旧v2 terminal Result可以没有`resolvedContext`，不迁移历史数据。Runner只存在于当前Buildr自举Workspace Component；无法证明owned delta、单一后继或remote identity时fail closed。第一次交付该runner时，已加载的旧Skill仍可使用既有手工self-bootstrap路径完成自举，随后runtime投射才采用新入口。

## 验收摘要

- Formal Finish Result稳定返回只读`resolvedContext`，旧Result仍可读取。
- runner覆盖fresh、not-applicable、commit后恢复、remote已完成与identity漂移场景。
- sync、commit、push、安装和finalize保持独立结果，部分失败不被抹平。
- Task Finish长运行只等待同一session，不重复启动、不高频轮询。
- OpenSpec、package/static、Skill projection与受影响产品验证全部通过。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Closeout Orchestration Delta](specs/task-closeout-orchestration/spec.md)
- [Task Finish Execution Delta](specs/task-finish-execution/spec.md)
- [Tasks](tasks.md)
