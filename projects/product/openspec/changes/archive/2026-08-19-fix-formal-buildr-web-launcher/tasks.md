## 1. Launcher 端口与生命周期实现

- [x] 1.1 将正式 npm Launcher binding 升级为带 closed `webPort` 策略的兼容版本，支持 install/repair 指定端口、默认 `4457`、`0` 随机和 v1 安全迁移。
- [x] 1.2 在 released Launcher 启动路径中实现同 start lock 内的单次 `EADDRINUSE` 随机回退，并保持健康实例复用、普通 CLI 与 development profile 语义不变。
- [x] 1.3 将 macOS 正式 Launcher 改为同步 preflight 后退出的短生命周期入口，由独立后台运行器执行 npm entry、日志与失败提示。

## 2. 验证与收敛

- [x] 2.1 补充 binding/CLI、默认与显式端口、端口占用回退、macOS wrapper 结构和重复打开的 focused 测试。
- [x] 2.2 使用正式 release artifact 路径构建一次未发布的隔离 npm candidate，在 task-owned 临时 target 安装并验证首次打开、重复打开、`4457` 与占用回退，不覆盖当前正式 Launcher。
- [x] 2.3 更新直接相关 current knowledge 与 Change companion evidence，运行 strict validation、语义 preflight、受影响验证并完成 deterministic convergence/archive readiness。
