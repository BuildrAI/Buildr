# 优化长流程输出与可恢复观测

## 摘要

让 Buildr 长流程默认输出有界紧凑摘要，并在输出丢失后从各专业 authority 精确回读，避免重复启动唯一 runner 或昂贵验证。

## 背景与问题

self-bootstrap、正式 Verification 和 release transaction 会产生大型结构化结果；Agent 工具截断 stdout、客户端断连或等待超时后，当前响应无法可靠说明流程仍在运行、已经失败，还是已经成功但展示丢失。Retrospective 批量查询虽已有数量上限和摘要默认值，仍缺少整体字节预算。

## 目标与非目标

目标是统一 compact terminal summary、显式 full detail、primary failure、cleanup、展示截断和唯一 inspect/resume 指针，并确保 terminal truth 先进入既有专业 authority。非目标是建设事件平台、实时看板、通用日志库、自动 retry、第二套 Result authority或新的生命周期门禁。

## 受影响用户或角色

主要使用者是通过 CLI/Skill 执行 Buildr 正式研发、验证、自举和发布的智能体（Agent）；维护者仍通过既有完整 evidence 完成专项诊断与审计。

## 核心流程

producer 打开或执行专业 run → 专业 owner 保存 open/terminal/evidence事实 → 默认 stdout返回compact summary → 调用方在需要时按唯一 pointer inspect同一run/record → 只有owner明确允许时才resume或创建独立run。

## 关键变化

- 长流程默认 stdout 从完整 Result 改为公共 compact summary。
- formal Verification复用Task Execution Record；self-bootstrap复用Finish maintenance；release复用output/hosted evidence；Retrospective list复用current row并增加字节预算。
- 完整专业结果仅在显式full或单对象inspect时展开。

## 影响、风险与兼容性

默认JSON变化是明确breaking change，bundled Skills与自动parity测试会同步迁移；旧专业Result、Execution Record、Finish maintenance和release artifact无需数据迁移。compact投影失败不能覆盖已经成立的业务终态。

## 验收摘要

成功、失败、running、超大输出和断连恢复均能通过有界summary与同一authority回读区分；matching active/terminal run不会被默认重复执行；批量列表同时满足数量和字节边界；full evidence继续可审计。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Delta Specs](specs/)
