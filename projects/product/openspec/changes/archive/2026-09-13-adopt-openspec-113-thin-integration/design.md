## Context

Buildr 对规范转换与写入维护了独立实现，OpenSpec 1.13.0 已提供同类标准能力。当前命令仍在自行写入后调用 archive --skip-specs，单独升级不能获得上游写入保护。

## Goals / Non-Goals

目标是使用锁定上游处理标准规范，保留相关变更协调、正确工作根及可观察恢复。只同步保持 active，归档显式执行。当前认知维护独立保持，不涉及发布和主环境激活。

## Decisions

- 上游适配位于 OpenSpec 模块：从已验证的外部安装解析对应包，按固定版本调用上游解析和归档能力；不复制其算法，也不依赖 PATH 上另一个版本。
- preflight 只读核对当前变更与相关活跃变更，使用上游解析及验证；不复制全项目做 projected validation。
- converge 使用上游归档写入，保留真实前后文件观察和必要恢复记录。不能安全恢复的混合状态必须报告，不自行覆盖。
- 删除旧规划、写入和全量验证的正常消费者；只有历史恢复确需的旧类型或读取保持兼容，不继续生产旧阶段记录。
- 独立 sync 由上游技能负责语义合并，Buildr 提供适用的只读检查，不转向归档。上游 CLI archive 的程序保证不得误报成智能体直接写入的保证。
- 外部技能按发布版本原样刷新，Buildr 差异只写自身 contribution。依赖、声明和完整性同步更新。

## Code Map

`openspec-application.ts`：解析目标与版本、相关变更检查和命令装配。
`upstream-openspec` 适配：复用锁定上游解析、验证、规范写入与归档。
`openspec-converge.ts` 与恢复观察：保留跨进程记录、当前文件比对和保守恢复。
`openspec-convergence-preflight.ts`：只读结果与冲突诊断。
上游取代标准 delta parser、convergence planner、canonical applier 与默认全目录 projected validator。

## Risks / Trade-offs

- 上游内部接口可能变化：固定版本与包身份，用真实上游组合测试保护升级。
- 上游 archive 失败可能回滚，强制中断可能留下部分结果：观察当前文件，不假设正常异常等于跨进程恢复。
- 旧恢复记录必须保留：不为迁移删除未交付数据，不把未知状态称作成功。
- 只同步仍是智能体写入：保留明确范围与读后核对指引，不声称享有 archive 的全部程序保护。

## Migration Plan

在隔离工作目录升级、替换正常路径并验证；通过后交付可审阅源码。不修改主工作空间外部安装或运行时。上游重复章节、并发内容、普通失败及中断恢复通过后才删除被替代实现。

## Open Questions

没有待用户决定的新目标；上游接口与恢复细节通过实现和测试确定。
