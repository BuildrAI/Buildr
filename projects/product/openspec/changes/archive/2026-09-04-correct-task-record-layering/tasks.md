## 1. 通用事务基础设施

- [x] 1.1 增加同步 `TransactionManager` 与 `TransactionContext`，覆盖提交、回滚、嵌套拒绝、Promise 拒绝和连接关闭
- [x] 1.2 将 Task Review 与 Task Verification 的普通写事务迁移到通用事务管理器

## 2. Task Record 后端分层

- [x] 2.1 将 Task Domain 重写为普通数据类，并把 Task 内部模型保留在 `task.ts`
- [x] 2.2 将四个 Repository 收敛为各自单表 SQL、Row mapping 和批量查询
- [x] 2.3 将业务校验、摘要、父子关系、四表事务与输出组装迁入 `TaskRecordApplication`
- [x] 2.4 调整 module、HTTP、CLI 与专业调用方，只通过 Application 使用 Task Record

## 3. Buildr Web 前端分层

- [x] 3.1 将 Task Record client 与生成 DTO 迁入 `api/`，删除全局 API 对 feature 的反向依赖
- [x] 3.2 抽取列表、详情、mutation、evidence 和请求生命周期 Hooks
- [x] 3.3 将页面收敛为路由与组装，将组件收敛为 props/callback，并删除 `logic/`

## 4. 契约、知识与验证

- [x] 4.1 更新生成路径、源码边界检查、测试与相关当前知识文档
- [x] 4.2 运行后端、前端、Contract、CLI、SQLite 与浏览器验证，记录正式 Task Verification
- [x] 4.3 对当前实现执行 Completion Review，并完成 OpenSpec convergence
