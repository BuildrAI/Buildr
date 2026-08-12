## 1. Action contract

- [x] 1.1 定义 Task Development action contract，覆盖 action 说明、closed input schema、最小示例与稳定发现 envelope。
- [x] 1.2 让 Task Development Application 的 action 顶层字段白名单消费同一 contract，同时保留现有深层语义校验。

## 2. Driver discovery

- [x] 2.1 实现全局和 action 级 `--help`，并保证发现路径不 compose runtime、不要求 Task/Workspace。
- [x] 2.2 实现 action 级 `--schema` 与 `--example`，对未知或歧义发现请求失败关闭。
- [x] 2.3 保持普通 action、错误 envelope 和 `--profile` 输出兼容。

## 3. Verification and knowledge

- [x] 3.1 增加 action contract 单元测试和 driver 发现集成测试，覆盖同源字段、零 runtime composition、兼容与失败场景。
- [x] 3.2 更新直接受影响的静态契约检查与必要的 Service 说明，不扩展为全局命令 schema 规范。
- [x] 3.3 运行 OpenSpec strict validation、聚焦测试和受影响快速反馈，并完成当前认知收敛检查。
