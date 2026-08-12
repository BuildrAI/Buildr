## 1. Portable Execution Record Read Model

- [x] 1.1 为 Task Execution Record Application 增加 closed portable list/detail projector 与 `all | verification | finish` Task-scoped 筛选，并覆盖跨 Task 拒绝和敏感字段缺失测试
- [x] 1.2 为正文 Store/Application 增加 manifest 白名单、完整性校验和 512 KiB UTF-8 preview 读取，并覆盖非法 filename、cleaned、截断和损坏正文测试

## 2. Local App HTTP

- [x] 2.1 扩展 bounded read executor/worker 的 list、detail、body-file closed operation 与容量、取消、错误隔离测试
- [x] 2.2 增加 Task-scoped execution record GET routes、stable JSON schemas、`no-store` 与安全 diagnostic 测试

## 3. Local App Web

- [x] 3.1 实现共享 execution record 浏览器、全部/Verification/Finish 筛选、详情与按需正文预览
- [x] 3.2 从 Verification Result 与 Finish current/terminal 区块接入同一浏览器的专业入口，并覆盖前端行为与构建产物

## 4. Knowledge and Direct Validation

- [x] 4.1 将 Change Brief、Buildr/buildr-web Service current knowledge 与术语/impact evidence 收敛到最终实现
- [x] 4.2 运行 OpenSpec strict validation、受影响 unit/integration/system/browser 测试与前端 build，并修复本 Change 直接反馈
- [x] 4.3 确认 Change apply tasks 完成且 canonical convergence 已具备前置条件
