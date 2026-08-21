## 1. Task Review 模块边界

- [x] 1.1 将 Task Review Domain、Application、Repository 与 CLI adapter 移入 `src/task` 的 flat-first 技术层，并修正内部 imports
- [x] 1.2 新增 Task Review HTTP prompt adapter，保持认证、请求字段与响应行为不变
- [x] 1.3 在 `src/task/module.mjs` 声明 Task Review required/provided capabilities、兼容端口及 CLI/HTTP contributions

## 2. Bootstrap 与旧入口退出

- [x] 2.1 按 Task Record → Task Review 顺序安装 modules，并让 runtime compatibility methods 只来自 module ports
- [x] 2.2 从 legacy runtime、全局 Task persistence、CLI Host 与 HTTP Host 删除 Task Review 的直接注册、import 和重复路由
- [x] 2.3 更新 Application Payload/architecture checks 与 Verification owner inputs，使新路径被完整覆盖且旧路径不存在

## 3. 行为等价测试

- [x] 3.1 更新并补充 module snapshot、dependency、contribution 唯一性和 Host 边界 contract tests
- [x] 3.2 更新 Task Review Domain、Repository、CLI/JSON、HTTP prompt 与 system journey tests 的路径和装配断言
- [x] 3.3 运行 typecheck、架构 contracts、Task Review unit/integration/system、公共 JSON/CLI/HTTP 与 package affected tests，修复本变更引入的问题
