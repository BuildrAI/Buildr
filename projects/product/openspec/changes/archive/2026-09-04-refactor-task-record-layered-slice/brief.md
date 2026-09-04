# Task Record 前后端分层重构

## 摘要

在不改变 Task Record 对外行为和 SQLite 数据语义的前提下，将后端整理为明确领域对象、应用 DTO、四个表 Repository 与共享事务，将前端 Task 能力收敛到 `features/task-record`。

## 背景与问题

Task Record 已完成 TypeScript 和模块迁移，但领域结构、应用输入输出、四表 Persistence、CLI/HTTP 入口与前端页面仍集中在少量大文件中。同形 mapping、匿名对象和 CLI 对 Persistence 的直接读取增加了后续维护成本。

## 目标与非目标

- 建立清楚的 Interfaces、Application、Domain、Persistence 职责和四表共享事务。
- 建立前后端同源生成 DTO 与 Task Record feature。
- 保持 HTTP、CLI、JSON、SQLite、错误语义和页面数据有效性机制。
- 不新增数据库 migration、ORM、全局 Store 或生产响应运行时校验。

## 核心流程

HTTP/CLI 将明确 DTO 交给 Application；Application 在一个同步 SQLite transaction 内读取、校验并协调四个 Repository，成功后回读当前 Task 并返回 `recordDigest`。Buildr Web 通过 feature Hook 和 typed Client 读取与修改 Task，专业事实继续独立加载和局部失败。

## 关键变化

- Task 领域对象和应用 DTO 不再集中在单个匿名结构中。
- 四张表各自拥有 Repository，但不得各自开启或提交事务。
- HTTP 删除同形 mapping；CLI blocked 分支不再直接读取 Persistence。
- Task 页面、组件、Hook、Client 与 generated DTO 进入 `features/task-record`。

## 影响、风险与兼容性

主要风险是四表部分提交、列表 N+1、CLI blocked 输出漂移和前端请求竞态。通过共享事务、批量查询、现有错误回归及生产 Web/Browser 验证控制风险。`recordDigest` 保持乐观并发语义，但不承诺重构前后具体摘要值一致。

## 验收摘要

四个 Repository 共用一个同步事务；全部公开 CLI/HTTP/JSON 和 SQLite schema 保持兼容；页面仍拒绝陈旧提交；前端 Task 交互、专业事实隔离及正式 `web-dist` 验证通过。

## 技术入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs](specs)
