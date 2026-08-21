## 1. Task 核心实现归位

- [x] 1.1 将 Environment、Development、Verification、Execution Record、Planning Identity 与 Parent Coordination 的 Domain 文件迁入扁平 `src/task/domain`
- [x] 1.2 将八项核心能力的 Application 与业务 Persistence/Body Store 迁入扁平 `src/task/application` 和 `src/task/persistence`，保持事务与 writer authority
- [x] 1.3 将 CLI、HTTP 业务 adapter 及 Development/Planning Identity internal drivers 迁入 `src/task/interfaces`，修正全部生产 imports

## 2. 模块装配与旧入口退出

- [x] 2.1 在 `src/task/module.mjs` 建立独立专业 descriptors、requires/provides、CLI/HTTP/internal contributions 与有限 compatibility ports
- [x] 2.2 按真实依赖顺序更新 Bootstrap runtime，并从 legacy runtime 与旧 persistence 聚合删除核心能力直接 registration
- [x] 2.3 让 CLI/HTTP Host 消费 Task module contributions/ports，删除重复 routes 和直接内部 imports，同时保持 Finish 集群为未迁移 consumer

## 3. 发布、文档与验证闭包

- [x] 3.1 更新 Application Payload、Verification owner、架构边界与 managed mutation 检查，使 `src/task/**` 新路径被唯一覆盖
- [x] 3.2 更新 Buildr 服务架构文档与 current knowledge，记录 Task 生命周期核心已迁移及 Finish/HTTP Host 剩余边界
- [x] 3.3 更新并运行 module、Domain、Repository、CLI/HTTP/internal、Environment、Development、Verification、Execution Record、Overview、Planning Identity 和 Parent Coordination 的 focused/affected 测试反馈
- [x] 3.4 运行 typecheck、OpenSpec strict/preflight 与架构检查，修复本 Change 引入的问题，并确认新增文本 EOF、旧入口退出及 schema/migration 清单无漂移，达到 convergence/archive readiness
