## 1. 任务环境调用绑定

- [x] 1.1 为 environment-local 与 external-product 产品解析结构化绝对 CLI invocation
- [x] 1.2 将 invocation 写入 task environment receipt，并在 create/context/adopt 输出与 execution readiness 中核验
- [x] 1.3 增加旧 receipt 兼容和调用入口漂移的单元、集成测试

## 2. 标准消费者迁移

- [x] 2.1 让 Task Finish Action Registry 使用 `cliInvocation` 的 command 与 argsPrefix 生成执行计划
- [x] 2.2 保留显式 `cliSource` caller 兼容，同时删除按 Workspace root 猜测默认入口的路径
- [x] 2.3 更新 Registry 契约测试和 CLI/JSON 文档

## 3. 当前认知与任务跟踪

- [x] 3.1 更新 Buildr Service、OpenSpec Change 流程和相关技术文档中的调用绑定事实
- [x] 3.2 更新并发任务开发与验证看板，登记本 Change、范围和完成证据
- [x] 3.3 完成 current knowledge reconcile、术语核对和 task asset review

## 4. 验证与交付

- [x] 4.1 运行 OpenSpec strict、contract guard 和受影响单元/集成验证
- [x] 4.2 运行 checkout-local runtime doctor，并完成 Candidate 基线审计
- [x] 4.3 归档 Change，集成并推送目标分支，安全清理 task environment
