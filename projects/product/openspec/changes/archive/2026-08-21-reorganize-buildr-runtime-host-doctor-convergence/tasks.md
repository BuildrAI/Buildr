## 1. Runtime Host

- [x] 1.1 将 HTTP Server、Session、安全响应、静态托管与 bounded read executor 迁入 `src/web/http/`，保持逻辑资源 identity 和外部行为
- [x] 1.2 将 Host 内剩余业务 HTTP 路由迁给所属模块 contribution，并让 `web/module.mjs` 只通过窄入口装配公共宿主

## 2. System Doctor

- [x] 2.1 将 Doctor Application、结果模型与诊断适配迁入 `src/system/doctor/`，建立显式 module 和 CLI contribution
- [x] 2.2 接通模块 Diagnostic/Read Model contribution，确认 Doctor 只读且不复制业务 writer/Repository

## 3. 最终装配与遗留退出

- [x] 3.1 将 Bootstrap 改为依赖有序的显式模块装配，并同步 Application Payload、资源 resolver 与全部 consumer imports
- [x] 3.2 删除旧 `interfaces/local-app/http`、`legacy-runtime-module` 和无消费者临时 Facade，补齐循环依赖、contribution 唯一性与 writer 唯一性契约

## 4. 测试与实际架构事实

- [x] 4.1 更新 HTTP、Doctor、Bootstrap、发布物和 changed-path verification owners，并通过聚焦测试证明行为等价
- [x] 4.2 按最终实现更新迁移台账、Buildr 当前知识与服务架构文档，确认 terminology 和 knowledge impacts 已收敛
