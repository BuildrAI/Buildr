## 1. Development launcher 运行来源

- [x] 1.1 拆分 release 与 development builder：Release 继续复制 Node runtime、Buildr application 和依赖，Development 只生成平台入口、图标和 identity。
- [x] 1.2 为 development identity 增加 source root、checkout identity、Workspace Node runtime path/version 与来源字段，并保留 release identity 兼容性。
- [x] 1.3 实现 macOS 与 Windows checkout-backed 启动脚本：校验 source root、CLI 入口和受管 Node probe，启动当前 checkout 的 `bin/buildr.mjs app --port 4317`。
- [x] 1.4 收窄 launcher status/install/rollback 的 development 诊断，显示 source root、observed checkout、Node identity 和运行实例 identity，并阻止静默回退。

## 2. Contract 与生命周期验证

- [x] 2.1 更新 macOS/Windows launcher tests，证明 Release 仍自包含而 Development 不包含 Node、动态库、Buildr source snapshot 或 `node_modules`。
- [x] 2.2 增加 checkout-backed 启动测试，覆盖源码变更后重启读取当前 checkout、source path 含空格、source 缺失、Node 缺失/漂移和错误反馈。
- [x] 2.3 保留并验证 development staging、运行中实例停止、原子切换、失败 rollback、正式 launcher 隔离和卸载边界。
- [x] 2.4 更新 public JSON/launcher contract 与 package parity 检查，确认双平台 identity、启动命令和 Release/Development 行为一致可诊断。

## 3. 文档与交付验证

- [x] 3.1 更新 CLI、产品架构和 launcher 文档，说明 Release 自包含、Development checkout-backed、源码变更后的重启与 Node 恢复规则。
- [x] 3.2 完成 current knowledge reconcile，确认 launcher/runtime/安装责任的当前事实与 OpenSpec 一致。
- [x] 3.3 运行 affected launcher tests、package/static validation、Buildr Dev 安装与启动健康检查，记录 Release 不变和 Development 体积/来源证据。
