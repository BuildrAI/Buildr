## 1. SQLite 查询基础

- [x] 1.1 新增连续 migration，创建四态 feed expression index、FTS5 trigram external-content table、同步 triggers 和既有 Task 回填
- [x] 1.2 增加 migration/FTS capability、回填、事务同步、回滚和可重建性测试，并更新受控 SQLite inventory

## 2. 百万级 Task list read model

- [x] 2.1 新增窄 Task list repository，使用索引化排序、键集边界和 SQL 原生 Project/Service/Child/复盘过滤返回最多 51 个边界 row
- [x] 2.2 接入 FTS5 安全关键词查询和完整 Task ID 精确查询，拒绝不足三字符的普通关键词且不回退全表扫描
- [x] 2.3 重构 Task Query Application，通过 list repository 选择 ID、现有四个 repository 批量组装最多 50 条，并让 cursor 复用首批 count
- [x] 2.4 升级 Task list HTTP response schema/DTO，后续批次返回空 filter options 且保持未分页 Application 兼容

## 3. Buildr Web 默认信息流

- [x] 3.1 将 Task 列表默认和重置状态改为 all，按 active、todo、completed、abandoned 服务端顺序直接追加
- [x] 3.2 让 Hook 只在首批更新 filter options/count，并正确处理后续批次、短关键词提示、精确 Task ID 和请求竞态

## 4. 日常测试与显式百万级基准

- [x] 4.1 增加小数据行为测试，覆盖四态跨页、相同时间边界、所有过滤组合、FTS同步、短关键词和 cursor mismatch
- [x] 4.2 增加查询计划测试，证明默认/单状态/关系/FTS路径使用目标索引且没有 OFFSET、完整 ID 物化或默认全表临时排序
- [x] 4.3 实现 `benchmark:task-query-million` 显式临时数据库入口，记录环境、数据分布、体积、准备耗时及各查询 cold/warm/P50/P95并保证清理
- [x] 4.4 证明百万级 benchmark 未进入 verification registry、changed/core/candidate/release/Browser 与默认 npm script链
- [x] 4.5 在当前开发机显式运行一次百万级 benchmark，核对默认/续载/深游标/结构过滤 P95 200ms和关键词 P95 500ms观察目标

## 5. 当前认知与直接验证

- [x] 5.1 更新公开 JSON 契约说明并按最终职责核对技术架构文档，处理 Brief、knowledge impact 和术语影响
- [x] 5.2 运行契约生成检查、类型检查、定向 Unit/Integration/System、Web生产构建、Browser Task流程和受影响验证，修复全部直接反馈
