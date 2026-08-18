## 1. Task Intent 文档引用

- [x] 1.1 实现 Workspace 相对 Markdown 链接到 Task scope 内已登记 Project 文档的安全解析。
- [x] 1.2 在 Task 详情以受限 Markdown 呈现 Intent，并提供只读文档预览、路径信息和明确错误状态。
- [x] 1.3 保持预览内相对 `.md` 导航仍受同一 Project 边界约束。

## 2. 验证与产品事实

- [x] 2.1 增加解析单元测试、Task 页面集成测试和生产托管 browser smoke 场景。
- [x] 2.2 更新受影响的 Buildr Web / Buildr current knowledge，并生成受管 `web-dist`。
- [x] 2.3 使用 Task Record writer 为父任务写入 `service-architecture.md` 的 Markdown 引用，并恢复其 current Parent planning facts。
- [x] 2.4 运行 affected 验证、OpenSpec strict validation 与 archive readiness 检查。
