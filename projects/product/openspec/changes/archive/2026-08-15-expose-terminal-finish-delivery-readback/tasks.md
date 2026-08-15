## 1. CLI 产品表面

- [x] 1.1 新增 `task delivery inspect` 只读 CLI adapter，解析 Task ID、`--target` 与 `--json` 并调用现有 Terminal Delivery Application。
- [x] 1.2 在 command metadata 中登记 agent-machine route 与 canonical help，并把既有 Terminal Delivery schema 纳入公开 JSON registry。

## 2. 文档与验证

- [x] 2.1 更新 CLI reference，说明按 Task 回读与 `task inspect`、`task finish inspect --run` 的边界。
- [x] 2.2 增加 CLI 参数、帮助、公开 JSON、delivered/current/无 run 及零写入边界的自动化测试。
- [x] 2.3 运行受影响测试、产品表面静态验证与 OpenSpec strict validation。

## 3. 当前认知

- [x] 3.1 创建并收敛 Change Brief 与 knowledge impact；确认无需修改 Project overview 或 glossary。
