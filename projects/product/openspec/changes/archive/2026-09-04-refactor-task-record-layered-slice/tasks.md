## 1. 保护现有契约

- [x] 1.1 补充 Task Record 领域、四表读取写入、事务回滚、并发摘要和 CLI blocked 结果的回归测试
- [x] 1.2 补充 HTTP 请求校验、成功/错误响应 Schema、生成 DTO 与前端请求竞态的回归测试

## 2. 后端领域与应用 DTO

- [x] 2.1 建立 `Task`、`TaskProject`、`TaskService`、`TaskChange` 领域文件并迁移现有规范化规则
- [x] 2.2 从 Task HTTP Schema 生成后端 Application DTO，移除 Application 公开 `Record<string, unknown>` 输入输出

## 3. 四表 Persistence 与 Application

- [x] 3.1 将 `tasks`、`task_projects`、`task_services`、`task_changes` 拆为四个 Repository，保留批量查询、SQL 顺序和内部 Row/JSON 映射
- [x] 3.2 让 Task Record Application 组装完整 Task 并在同一同步 SQLite transaction 中协调四个 Repository
- [x] 3.3 保持父子副作用、引用诊断、结果历史、复盘文档和 `recordDigest` 页面数据有效性语义

## 4. 后端接口与调用方

- [x] 4.1 让 HTTP 直接使用同形 Application DTO，删除 `task-record-http-mapping.ts`，保持只校验运行时请求
- [x] 4.2 让 CLI 通过 Application 取得 blocked 当前值并移除 Persistence 类型依赖
- [x] 4.3 更新 `task/module.ts`、Task 专业能力、Change、Worktree、Preview、Daily Progress 和架构端口调用方

## 5. Buildr Web feature

- [x] 5.1 将 Task 页面、页面内组件、typed Client 与 generated DTO 迁入 `src/features/task-record`
- [x] 5.2 建立 `useTaskRecord`，保留请求取消、旧响应隔离、专业事实局部失败和稳定 DOM selector
- [x] 5.3 更新路由、共享 transport、Service 规则、generator、ignore 与 generated inventory

## 6. 认知与验证

- [x] 6.1 更新 Service 架构和 Buildr/Buildr Web 当前认知，核对术语与全部旧路径引用
- [x] 6.2 运行 TypeScript、Unit、Component、HTTP Contract、SQLite、Task System、Web build 与 Browser 验证并修复发现的问题
- [x] 6.3 完成当前认知 reconcile、全局残留扫描和 Change checklist
