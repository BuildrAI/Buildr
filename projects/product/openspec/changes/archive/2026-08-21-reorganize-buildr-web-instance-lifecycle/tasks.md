## 1. Web 生命周期模块

- [x] 1.1 将默认实例 receipt、启动锁、PID、Secret、健康探测和认证退出适配迁入扁平的 `web/infrastructure`。
- [x] 1.2 将默认实例启动、复用、Launcher handoff、端口 fallback、信号和 maintenance 编排迁入 `web/application`。
- [x] 1.3 将 Preview 启动、枚举、停止、Environment resource ownership 和清理迁入 `web/application`。

## 2. 接口与 Bootstrap

- [x] 2.1 建立 `web/interfaces/cli` command contributions 与 `web/module.mjs`，保持现有参数、输出和错误语义。
- [x] 2.2 在 Bootstrap 显式安装 Web module，删除旧 Web command routes 和 HTTP Server 的生命周期注册职责。
- [x] 2.3 删除旧 `interfaces/local-app/runtime` 生命周期入口并更新全部生产 imports。

## 3. 验证与发布闭包

- [x] 3.1 更新单元、集成、系统和 contract tests 的 imports 与 Web module/maintenance 架构断言。
- [x] 3.2 更新 Application Payload、changed-path selector、Verification owner 和 managed mutation 检查，覆盖 `src/web/**` 且不形成重复 owner。
- [x] 3.3 更新长期架构文档中的 Web 扁平分层与本 Child/后续 HTTP Host 边界。
- [x] 3.4 运行 OpenSpec strict validation、类型检查、受影响验证及默认实例/Preview/Launcher 定向回归，并记录结果。
