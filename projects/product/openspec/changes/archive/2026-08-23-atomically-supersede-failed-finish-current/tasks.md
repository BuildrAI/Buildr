## 1. 契约与当前认知

- [x] 1.1 定义 failed current row 的事务 fencing 与普通 finalize 兼容边界
- [x] 1.2 更新 Buildr Service current knowledge 与术语 disposition

## 2. 实现与验证

- [x] 2.1 让 reconciliation 传递 Product-owned superseded current fence
- [x] 2.2 在 SQLite terminal finalize 中校验旧 run ID、kind、status 与 digest
- [x] 2.3 增加 Application fence 与 SQLite 原子替换/漂移拒绝测试
- [x] 2.4 运行 focused Finish tests、strict validation 与 convergence preflight

## 3. 收敛

- [x] 3.1 确认 convergence 输入、写后确认条件与 archive readiness
