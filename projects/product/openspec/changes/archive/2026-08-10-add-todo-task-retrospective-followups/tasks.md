## 1. Task Record 数据与领域

- [x] 1.1 增加 SQLite migration，扩展 todo 状态并建立复盘来源关系表，覆盖既有数据迁移与约束测试
- [x] 1.2 升级 Task Record v2 domain、repository 与 query read model，支持来源正反向投影
- [x] 1.3 扩展 Application create/update/activate/complete/abandon 状态门禁与原子关系校验

## 2. 产品入口与复盘流程

- [x] 2.1 扩展 Task CLI/help/JSON schemas，支持 todo、activate、来源 flags 和 open 查询
- [x] 2.2 更新 Task Manager、Task Triage、Task Retrospective contracts/Skills 与 package binding，使 TODO 创建保持 data-only
- [x] 2.3 扩展 Retrospective inspect/handle read model 与内部 driver，返回当前承接 Task 并保护 pending-to-handled 顺序

## 3. Local App

- [x] 3.1 扩展 Local App HTTP Task/Retrospective API，复用 Application 返回 todo/open 与来源关系
- [x] 3.2 更新 React Task 列表和详情，默认 open 并展示来源与承接 Task
- [x] 3.3 补充 Local App 单元、系统和浏览器行为验证

## 4. 产品一致性

- [x] 4.1 更新公开文档、current knowledge、glossary 与 package/runtime 清单
- [x] 4.2 增补 migration、domain、application、CLI、package 和隔离 Workspace 专项测试
- [x] 4.3 运行 OpenSpec strict validation、affected checks，并修复直接反馈
