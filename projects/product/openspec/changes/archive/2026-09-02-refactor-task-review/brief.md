# 按智能体优先原则重构 Task Review

## 一句话摘要

Agent针对当前真实方案或完成结果做审查，Buildr只安全保存两个可选审查结论，不再替Agent判断是否可推进。

## 为什么要改

当前Review由Application比较调用方target并给出current/stale，又被Development当成Candidate和Handoff门禁；同时没有防止两个Agent覆盖同一结果。它把专业意见扩大成了流程状态。

## 人和Agent如何协作

- 人：说明目标、业务约束，处理真正授权，验收结果。
- Agent：读取Task、真实代码/Git/文件/测试/外部系统和已有Review，决定是否审查、审查什么、用什么工具。
- Skill：指导Agent区分Planning/Completion、形成真实subject identity、完整证据和CAS写入。
- Buildr：只提供inspect/record、closed Result、并发冲突与原子写入。
- Project/Service：继续拥有代码、架构、测试和业务规则。

## 用户会看到什么

Task证据页仍有方案审查和完成审查两个可选卡片，只显示“已记录/未记录”、审查对象、方法、覆盖、未覆盖、发现和局部结论。没有current/stale、Development gate、adopted或统一下一步。

## 数据与迁移

现有v1 current rows一次迁为v2：target改成subject，结论改为accepted/changes-requested。旧Finish/Development日志不转换为新current，只保留原始历史证据。不会增加Review历史表、revision、执行日志或审批数据。

## 验收重点

- 没有Development或Candidate的active Task可以独立记录Review。
- 两个Agent并发写同一slot时，陈旧写入被拒绝且不覆盖新结果。
- Review新增、替换或缺失不改变Development Candidate/generation/handoff。
- 后端Review prompt接口完全删除，Web仍可交给Agent。
- v1真实数据迁移、损坏回滚、TypeScript、CLI/HTTP/Web与完整受影响验证通过。
