## 1. Task Delivery 与 Finish 实现归位

- [x] 1.1 将 Finish 私有 Application 协作者迁入 `src/task/application/finish`，将 Terminal Delivery Application 和单文件 Finish Repository 迁入 `src/task` 对应扁平技术层
- [x] 1.2 将 Task Finish、Terminal Delivery CLI 与 maintenance、retained cleanup、target lease internal adapters 迁入 `src/task/interfaces`，修正生产、package、tools 与测试中的静态和动态路径
- [x] 1.3 保持 Delivery Carrier、Adaptation、Reconciliation、Activation、Cleanup、Maintenance、diagnostics、execution evidence、bootstrap recovery 与 Git delivery contribution 的实现和 writer authority不变

## 2. 模块装配与旧入口退出

- [x] 2.1 在 `src/task/module.mjs` 建立独立 Task Finish 与 Terminal Delivery descriptors、requires/provides、CLI/internal contributions 与受限 ports
- [x] 2.2 按真实依赖顺序更新 Bootstrap runtime、legacy slot和轻量 Finish inspect composition，删除 Finish Repository/Application 与 Terminal Delivery 的旧直接 registration
- [x] 2.3 让 CLI Host、self-bootstrap、Doctor、Verification executor 与 package tooling消费新 Task module入口，删除重复 route、旧 import、动态路径和兼容转发文件

## 3. 发布、文档与验证闭包

- [x] 3.1 更新 Application Payload、installed-layout、Verification owner、managed mutation 与架构边界检查，使 `src/task/**` 的 Finish依赖闭包被唯一覆盖
- [x] 3.2 更新 Buildr 服务架构文档、technical architecture 与 Buildr Service knowledge，记录 Finish集群已迁移及 Web HTTP/System Doctor/最终 legacy convergence剩余边界
- [x] 3.3 更新并运行 Finish、Terminal Delivery、carrier/adaptation/reconciliation、activation/cleanup/maintenance、diagnostics、self-bootstrap 与 CLI/internal focused/affected测试反馈
- [x] 3.4 运行 typecheck、OpenSpec strict/preflight与架构检查，修复本 Change引入的问题，并确认新增文本EOF、旧入口退出及schema/migration清单无漂移，达到convergence/archive readiness
