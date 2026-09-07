# 建立百万级任务查询方案

## 一句话摘要

让 Buildr standalone 的 Task 信息流在百万条记录下仍通过 SQLite 索引和键集游标稳定查询，同时保持日常测试轻量。

## 背景与问题

当前 50 条分页已经限制响应规模，但默认跨状态排序仍会全表临时排序，Project/Service 会物化全部匹配 ID，关键词会无索引扫描。它们在数百条数据上不明显，却会随完整数据量增长。

## 目标与非目标

目标是默认按进行中、待办、已完成、已放弃顺序查询全部 Task，并让默认、深游标、结构过滤和关键词路径在百万级代表性数据上具有可复核的索引与耗时证据。非目标是保证未来任意新查询永不需要评估，或引入远程数据库和常驻服务。

## 受影响用户或角色

长期使用 standalone Buildr、积累大量 Task 的个人和团队；普通日常开发者不会承担百万级 fixture 的测试成本。

## 核心流程

Web 首批请求全部四态的前 50 条和一次统计/筛选选项；浏览到第 40 条后使用游标续载，后续只查询 51 个边界 row 并批量组装 50 条。结构过滤由 SQL/索引求交，至少三字符关键词由 FTS5 trigram 索引处理。

## 关键变化

- 四态固定可索引排序与 v2 内部游标。
- 独立只读 Task list repository，不创建查询框架或第二 authority。
- Project/Service 等过滤直接进入 SQL。
- FTS5 external-content 派生索引随 Task 事务同步。
- 百万级 benchmark 为显式独立命令，永不进入日常门禁。

## 影响、风险与兼容性

默认状态和短关键词行为发生可见变化；HTTP response schema 同步升级。SQLite migration 只新增可重建索引、FTS table 与 triggers，不改 Task 业务字段。FTS 增加数据库体积与写开销，将在本次百万级 benchmark 中记录。

## 验收摘要

日常回归证明四态顺序、游标、过滤、FTS 同步和查询计划；本次显式百万级 benchmark 记录默认/续载/深游标/结构过滤/关键词 P50/P95、数据库体积和准备耗时，并在结束后清理临时数据。

## 技术 artifacts 入口

- [提案](proposal.md)
- [设计](design.md)
- [Task Record 规范](specs/task-record/spec.md)
- [Buildr Web 规范](specs/buildr-web-workspace-application/spec.md)
- [Structured Store 规范](specs/workspace-structured-data-store/spec.md)
- [验证质量规范](specs/product-verification-quality/spec.md)
