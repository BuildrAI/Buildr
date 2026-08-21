## 1. Bootstrap 合约与公共 Host

- [x] 1.1 建立 closed module descriptor、依赖/贡献校验和确定性 lifecycle registry，并覆盖重复、缺失依赖、失败回滚与逆序停止测试
- [x] 1.2 将 Runtime composition 移入 `src/bootstrap/`，保留唯一旧能力注册顺序并建立有 owner、基线调用者与退出条件的兼容 Facade
- [x] 1.3 将公共 CLI main、registry、help、diagnostics、identity 与 Finish bootstrap 迁入 `src/bootstrap/cli/`，更新薄 bin、源码、测试和发布路径

## 2. Task Record 参考模块

- [x] 2.1 将 Task Record `module.mjs` 改为只接收声明依赖并提供 Application API、窄 Persistence Read Port、CLI/HTTP contributions 的显式工厂
- [x] 2.2 将六个 Task Record command descriptors 移出中央目录，并让唯一 command catalog 合并模块 CLI contributions
- [x] 2.3 让 Task CLI 与 Buildr Web HTTP Host 通过模块 contributions 调用同一 Application API，删除 Host 对 Task 内部 Adapter 的直接导入
- [x] 2.4 将既有 Task Record 消费者接入 Bootstrap 兼容 Facade，并证明没有第二 store、writer、双读或双写

## 3. 架构约束与验证

- [x] 3.1 更新架构 verifier，检查唯一 Bootstrap composition root、module descriptor 边界、Host import 与兼容 Facade 基线不增长
- [x] 3.2 增补 module registry、Task CLI/HTTP contribution、普通 CLI 退出和 Web 同进程组合的单元、契约与集成回归
- [x] 3.3 更新 verification registry 的路径 ownership，并运行 focused、Task Record、CLI、Web、npm tarball/Application Payload 与 affected 验证

## 4. 当前认知与收敛

- [x] 4.1 更新 `services/buildr/docs/cli-architecture.md`、技术架构与 Buildr Service current knowledge，准确记录 Bootstrap、模块合约、兼容边界和退出条件
- [x] 4.2 执行 current knowledge reconcile/inspect 与 OpenSpec strict validation，确保实现、规格、Brief 和任务清单一致并达到 convergence-ready
