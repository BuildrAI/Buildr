# Parent Task 启动与 Child 前交接优化

## 一句话摘要

让新的 Parent Task 沿一条可发现、可验证且保持专业 writer 分离的路径，稳定推进到首个可启动 Child 之前。

## 背景与问题

Parent Plan、Planning Review、Task Entry Snapshot 和 Parent Coordination 已分别具备权威边界，但启动过程仍需要Agent自行连接多个动作。Planning Review形成后，Agent必须重构完整Development planning输入才能保存gate；通用`task next`随后又会返回普通Task的`develop-and-observe`，无法表达协调型Parent已经可以启动Child。

## 目标与非目标

目标是提供response-only Parent启动就绪、eligible Contribution和Parent-aware next，并提供安全消费current Planning Review的公开refresh动作，同时固化内置Agent workflow。

非目标是不创建一键跨authority事务，不自动Review、创建Child、选择Environment Plan或新增Parent lifecycle状态。

## 受影响用户或角色

- 通过Agent创建和推进Parent/Child Task的Buildr使用者。
- 负责组合Task Record、Environment、Development、Review与Parent Coordination能力的Agent。

## 核心流程

Git基线与Parent激活后，Agent准备coordination-only Environment、建立Development、记录Parent Plan、完成Planning Review，再调用受控refresh消费Review。Parent-aware Task Entry随后返回依赖已满足的eligible Contribution，Agent停在Child创建之前等待用户选择。

## 关键变化

- Parent Coordination派生启动就绪和eligible Contribution。
- `task parent refresh-planning`安全消费saved Plan与current Review。
- `task next`在Parent场景返回planning review、refresh或start-child recommendation。
- Parent Plan CLI提供schema/example，内置Skills固定安全顺序与停止条件。

## 影响、风险与兼容性

变化只增加公开read model和窄mutation action，不迁移历史Receipt，不改变普通Task或legacy Parent。主要风险是额外owner读取、Plan/Review并发漂移和JSON surface漂移，分别通过条件装配、expected current identity与package parity测试控制。

## 验收摘要

- Review缺失、Review未消费、Parent ready、依赖blocked和legacy/普通Task均返回正确next。
- refresh不接收caller planning JSON，并在identity漂移或candidate provenance错误时零写入。
- checkout、npm package、public JSON registry、CLI help/schema/example和内置Skill投射保持一致。

## 技术 Artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
