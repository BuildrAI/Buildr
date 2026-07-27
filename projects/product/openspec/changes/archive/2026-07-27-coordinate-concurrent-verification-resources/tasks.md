## 1. Project 资源声明

- [x] 1.1 扩展 `verification.yml` schema，支持资源目录和 capability claims
- [x] 1.2 校验四种资源策略、容量、namespace、cleanup、authorization 与引用闭包
- [x] 1.3 更新 Product 声明、JSON/CLI 文档和 doctor 契约测试

## 2. 跨任务资源协调

- [x] 2.1 实现 Workspace 级 slot lease、heartbeat、expiry、原子接管和 owner-token release
- [x] 2.2 将 coordinator 接入 verification DAG/executor，并为命名资源传递 task/run namespace
- [x] 2.3 为 Product browser 与 workspace-saturating 验证登记跨进程资源
- [x] 2.4 在 timing evidence 中记录 resource wait、claims、release 和 recovery 状态

## 3. 验证与知识收敛

- [x] 3.1 增加并发进程、容量、超时、异常释放和 ownership mismatch 测试
- [x] 3.2 更新 Buildr Service、验证流程和并发任务看板的当前事实
- [x] 3.3 完成 Brief、current knowledge reconcile、术语核对与 task asset review

## 4. 交付

- [ ] 4.1 运行 OpenSpec guard、affected 和最终 Candidate 验证
- [ ] 4.2 归档 Change、集成并推送 `dev`
- [ ] 4.3 从 retained checkout 核验 runtime 并安全清理 task environment
