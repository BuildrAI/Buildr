## 1. 公共Context定义与Runtime

- [x] 1.1 在发布源码中建立runner-independent的Context definition、稳定配置identity、依赖图与closed validation。
- [x] 1.2 实现worker/suite/test cache、lease、shared/exclusive/isolated并发、reset、dirty/evict、逆序destroy与结构化事件。
- [x] 1.3 提供稳定npm子路径入口，并用非Buildr内存Context契约证明组件不依赖Workspace或CLI。

## 2. Node测试注册与持久Host

- [x] 2.1 实现`node:test`注册adapter，让测试按alias/config声明Context并自动获取、release和标记dirty。
- [x] 2.2 实现Context-aware runner与持久Worker Host，按稳定规则分配文件并用non-process isolation复用Host内cache。
- [x] 2.3 验证多Host不超过外层grant、多文件cache hit、Host失败汇总、direct-file fallback与cleanup失败语义。

## 3. Buildr首个真实接入

- [x] 3.1 建立Buildr Task Application和Task Workspace providers，分别复用worker Application state与为test materialize隔离sandbox。
- [x] 3.2 把Task Development Application集合迁移到注册式API和Context runner，移除手写shard/runtime/cleanup责任。
- [x] 3.3 接通verification registry/executor的Host grant与Context timing evidence，保留未迁移owner的process isolation。

## 4. 兼容与边界收敛

- [x] 4.1 让旧`test/context` filesystem Pool委托公共生命周期或收敛为Buildr adapter，确保不存在两个通用Runtime authority。
- [x] 4.2 补齐Application、SQLite、Git/Workspace、CLI/Finish/Release最低充分边界contract与Candidate membership反例。
- [x] 4.3 验证npm pack公共入口、CLI bin、唯一tarball和Release专属证据不受影响。

## 5. 文档、认知与性能证据

- [x] 5.1 按真实代码完整更新验证框架文档，包含架构、API、注册、Host/cache、scope、隔离、并发、affected/Core/Candidate/Release与排障。
- [x] 5.2 更新technical/service/glossary与canonical specs，形成Brief和knowledge impact并完成current knowledge reconcile。
- [x] 5.3 运行公共Runtime/Node Host/Buildr adapter focused验证、Task owner多轮与Core多轮，记录create/hit/materialize/body/reset/wall-clock和残余长尾。
- [x] 5.4 完成strict validation、deterministic convergence preflight与archive readiness，并在实现及直接验证全部通过后收敛Change。
