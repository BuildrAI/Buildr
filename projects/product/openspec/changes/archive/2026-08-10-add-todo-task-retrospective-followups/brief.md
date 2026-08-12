# 增加待办任务与复盘后续承接

## 摘要

让有效复盘改进先成为仅存于 SQLite 的 `todo` Task，并用来源关系连接原任务，待明确启动后再进入正式研发。

## 背景与问题

复盘可能晚于原任务结束后才处理。当前只能在复盘中留下说明或立即创建 active Task，无法既保留已接受意向，又避免过早产生 Environment、Change 和规划 artifacts。

## 目标与非目标

- 增加 `todo` 顶层状态、显式激活和 `open` 查询。
- 保存目标 Task 与复盘源 Task 的多对多信源关系。
- 让处理报告包含原始复盘、当前事实判断和实际承接结果。
- 不建立 action item、通用关系、独立 backlog 或 TODO 文件。

## 核心流程

Agent 读取原始复盘并核对当前事实；失效事项说明理由，有效方向复用已有 `todo|active` Task 或创建仅含数据的 `todo` Task，并写入来源关系。全部落地后才把复盘标记为 handled；TODO 被明确启动时，先完成正式任务前置门禁再激活。

## 关键变化与影响

Task Record contract/SQLite/CLI、Task Retrospective Skill/Application、Task 查询和 Local App 需要协同升级。既有 Task 原样迁移；旧 runtime 对新版 store 继续 fail closed。

## 验收摘要

- TODO 创建只产生 SQLite Task Record 和可选来源关系。
- 多源到一目标、一源到多目标均可查询且无 action item ID。
- Local App 默认 open，并能查看来源与承接 Task。
- 复盘处理失败时保持 pending，不把部分落地标成 handled。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
