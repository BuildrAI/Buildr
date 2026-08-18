# 协调并发 Task Finish 与自举激活

一句话摘要：多个正式Task可以并行准备各自Delivery Carrier，只有同一target的delivery与Buildr self-bootstrap activation临界区互斥。

## 背景与问题

Formal Finish已经通过run-owned carrier隔离各Task的准备和适配，但Buildr自举runner仍把任何foreign carrier当作全局predecessor，并可能在sync、安装或重启之后才发现target-race。这让互不冲突的任务也停下来等待，且Delivery Adaptation缺少完整冻结commit message与可移植依赖准备提示，容易产生无效resume。

## 目标 / 非目标

目标是复用Task Finish target lease协调同一`remote + branch`的交付和自举激活、让proven foreign carrier隔离共存、在activation前收敛latest target，并提供可直接执行的Delivery Adaptation guidance和有限remote readback retry。

非目标是不引入Workspace全局Finish锁、任务队列、通用scheduler或第二套状态机；不把self-bootstrap加入普通用户Workspace，也不改变Candidate、Formal Verification、Completion Review和Task Record authority。

## 受影响用户或角色

- 同时推进多个正式Task的Agent：carrier preparation/verify/适配可以继续并行，只在共享target mutation时自动等待。
- Buildr自举Workspace维护者：runner在target lease内完成latest-target、sync、安装和Doctor收敛，不再人工清理无关foreign carrier后重试。
- 普通Buildr用户：Finish五阶段与安装内容保持不变，不获得self-bootstrap runner。

## 核心流程

Task Finish继续执行`preflight → prepare → verify → deliver → cleanup`。不同Task独立形成carrier；到deliver时才竞争短target lease。Buildr自举runner消费complete或retained Doctor blocked Result，先证明carrier inventory，再获取相同target lease、收敛latest target和必要的same-run target-race，随后执行适用activation；另一owner占用时保留现场并自动重试。

## 关键变化

- matching terminal Finish row可以临时持有self-bootstrap activation lease，且过期可接管、release有token fencing。
- proven foreign carrier只作为隔离observation和精确untracked ignored root；unprovable entry仍fail closed。
- target-race恢复前移到sync、安装和重启之前，最多两次Product resume。
- Delivery Adaptation compact/full Result在blocked窗口返回exact message和portable Preparation hints。
- Task Finish与self-bootstrap的push readback只对非零观察做固定小次数重试，不重复push。

## 影响 / 风险 / 兼容性

主要风险是terminal row lease约束迁移和activation lease horizon。实现以连续SQLite migration、每阶段refresh、过期terminal接管和Doctor观察控制风险。普通Finish仍用既有短lease，用户Workspace和npm package不包含self-bootstrap资产。既有carrier与run继续由原owner负责，不做跨owner删除或恢复。

## 验收摘要

- 同一target已有Task处于self-bootstrap时，另一个Task仍能准备并验证carrier，只在deliver等待。
- complete与doctor-blocked自举都在任何activation副作用前持有lease；不同target互不阻塞。
- proven foreign carrier不阻塞，unprovable carrier保持零副作用blocked。
- latest target变化在sync/安装前收敛；需要Delivery Adaptation时返回exact message、hints、carrier和token。
- readback暂态失败可恢复，持续失败保留真实commit/push/run evidence且不重复push。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/task-closeout-orchestration/spec.md`
- `tasks.md`
