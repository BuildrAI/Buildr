## 1. 真实多任务场景

- [x] 1.1 扩展临时 Workspace fixture，登记入口仓库与嵌套独立仓库，并核对两个任务环境的完整 repository membership 和 allowed execution roots
- [x] 1.2 从 Workspace、Product 与 Service cwd 实际执行两个 receipt-bound CLI invocation，并核对任务、checkout 与 CLI identity
- [x] 1.3 使用就绪屏障并发启动两个 Local App 预览和可并行验证 worker，证明实例、状态、端口与 owner 不串扰

## 2. 竞态恢复与产品化清理

- [x] 2.1 通过正式收尾入口制造并恢复 `target-race`，断言只重跑失效步骤及其下游
- [x] 2.2 实现 receipt-bound `buildr worktree cleanup`，在写入前统一核对 owner、成员 identity、clean、integrated refs 和其他环境，并按 nested-first 顺序清理本地 worktree、分支与 receipts
- [x] 2.3 以 Buildr 生命周期入口替换验收脚本中的直接 Git worktree/branch 清理，并增加错误 owner、receipt 或 integrated ref 的 fail-closed 断言
- [x] 2.4 增加成功与注入失败两条清理路径，核对预览、租约、进程、worktree、分支和 retained doctor

## 3. 并发稳定性与证据

- [x] 3.1 建立统一子进程 supervisor，在流关闭后解析输出，并记录 timeout、exit code、signal、stdout、stderr 与 owner 诊断
- [x] 3.2 升级版本化验收摘要，记录 CLI 实际执行、多仓 membership、并发重叠、竞态恢复和产品清理证据，同时保持既有消费者兼容
- [x] 3.3 补充组合验收及资源 worker 的集成测试，重复运行并发场景以排除空输出和孤儿资源波动

## 4. 知识与正式验证

- [x] 4.1 收敛 Brief、Buildr Service 验证说明及术语影响，更新 `.buildr/knowledge-impact.yml`
- [x] 4.2 运行 OpenSpec strict validation、受影响验证和完整 Product Candidate，记录候选身份、耗时与清理结果
