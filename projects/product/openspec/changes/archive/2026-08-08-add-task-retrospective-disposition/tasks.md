## 1. 处置数据与 Application

- [x] 1.1 追加 Workspace SQLite migration，在同一 `task_retrospective_current` row 保存处置状态、说明和时间，并覆盖既有 row 的 `pending` 迁移与约束测试
- [x] 1.2 扩展 Task Retrospective repository/read model，保留 Result v1 并增加规范化处置元数据、`currentDigest`、原子重置和乐观并发保护
- [x] 1.3 为 Task Retrospective Application 与 internal driver 实现 `handle`，覆盖已处理、无需处理、重新打开、缺失复盘和陈旧 digest 诊断

## 2. Task 列表与 Local App HTTP

- [x] 2.1 为 Task query Application/repository 增加闭合 `retrospectiveState` 过滤并保留 `hasRetrospective` 兼容行为
- [x] 2.2 为 Workspace-scoped Retrospective endpoint 增加受同源/session/JSON/字段白名单保护的处置 PATCH，并补齐 HTTP 与 Application 测试

## 3. Local App 页面

- [x] 3.1 将任务列表复盘控件统一为未复盘、待处理、已处理、无需处理状态筛选，并处理默认 active 的不相容组合
- [x] 3.2 在复盘 Tab 展示处置状态、说明和时间，提供“已处理”“无需处理”“重新打开”入口及冲突刷新体验
- [x] 3.3 补齐 React、Local App system 与 Browser smoke 中的选择器、页面 mutation 和只读 Markdown 边界覆盖

## 4. Agent 能力与当前认知

- [x] 4.1 更新 `buildr.task-retrospective/v1` contract、随包 `task-retrospective` Skill 与静态 package 校验，让 Agent 通过 inspect + handle 处置 current 复盘
- [x] 4.2 更新 Change Brief、知识影响 evidence、Project glossary、产品/技术架构与 Buildr Service 当前说明，统一“复盘处置状态”及非门禁边界

## 5. 收敛反馈

- [x] 5.1 运行 Task Retrospective domain/repository/Application、Workspace migration、Task query 与 Local App Web 直接相关测试并修复失败
- [x] 5.2 构建正式 Web dist，运行 changed-path/Browser 相关反馈并验证 checkout 与 package 托管路径一致
- [x] 5.3 严格校验 OpenSpec Change，核对 checklist、Brief、知识影响和实现一致并准备 deterministic convergence/archive
