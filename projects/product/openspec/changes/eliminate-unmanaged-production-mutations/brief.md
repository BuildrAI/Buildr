# 消除未受管生产写入

一句话摘要：让 OpenSpec 临时投射、清理和 Task Finish 诊断落盘统一使用受审阅的文件系统入口，恢复完整 Candidate。

## 背景与问题

并发任务组合验收已经通过，但完整 Candidate 被 6 处 `managed-mutations` finding 阻塞。问题集中在新增的 OpenSpec 临时验证/归档投射和 Task Finish 大诊断文件：功能行为正确，但 application 层绕过了统一文件系统入口。

## 目标与非目标

- 目标：消除 6 处直接 mutation，并保留可注入、atomic write 和精确清理边界。
- 目标：保持现有 OpenSpec 收敛、Task Finish JSON 输出与失败行为兼容。
- 非目标：不重构全部文件系统层，不改变公开命令或状态机。

## 核心流程

1. application 通过 runtime 获取目录创建、atomic write 与精确删除能力。
2. OpenSpec 临时投射使用这些入口创建、写入并在 `finally` 清理当前临时根。
3. Task Finish 大诊断文件通过 atomic writer 提交，再返回既有诊断引用。
4. `managed-mutations` 与相关契约测试验证边界和兼容性，最终 Candidate 确认全产品无回归。

## 验收摘要

- 现有 6 处 finding 全部消失。
- 相关路径不新增 allowlist 例外。
- OpenSpec 收敛与 Task Finish 诊断行为保持通过。
- 完整 Candidate 通过。

## 技术入口

- `proposal.md`
- `design.md`
- `specs/managed-data-integrity/spec.md`
- `tasks.md`
