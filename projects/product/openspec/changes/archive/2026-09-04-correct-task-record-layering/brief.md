# 纠正 Task Record 前后端分层

Task Record 将采用 Java Spring Boot 常见分层：Domain 只保存数据，Application 负责业务规则和事务范围，Repository 只访问各自数据表，Infrastructure 提供全产品复用的 SQLite 事务能力。

后端的 `Task`、结果、历史、父任务完成和复盘模型统一放在 `task.ts`；三类关系模型各自对应关系表。四张表由 `TaskRecordApplication` 在同一事务中协调保存，列表使用批量关系查询。Task Review 与 Task Verification 复用同一个业务事务管理器，Migration 保留专用编排。

前端固定为 `pages/hooks/components/api` 四个平级目录。页面只读取路由并组装，Hook 管理请求、状态和竞态，组件只通过 props/callback 交互，Task Record API 与生成 DTO 留在 feature 内。

本次不改变 SQLite schema、HTTP/CLI JSON、页面视觉或业务行为；`recordDigest` 只继续保证陈旧页面不能覆盖新数据，不兼容旧摘要字节值。
