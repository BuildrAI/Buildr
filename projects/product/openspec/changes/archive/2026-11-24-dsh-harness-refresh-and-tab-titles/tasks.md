## 1. 实施

- [x] 1.1 提取纯逻辑模块 `refresh.ts`，覆盖标签名称映射与中栏/右栏刷新快捷键解析和防抢占判定
- [x] 1.2 移除底部刷新提示条并保留未交互静默更新，为中栏与右栏工具标签接入 `Cmd + R`（宿主 `page.refresh`）刷新及右栏无前缀标题
- [x] 1.3 新增单元测试 `refresh.test.ts`，更新插件 README 与桌面验收说明

## 2. 验证与归档

- [x] 2.1 运行 `buildr-harness-dsh-plugin` 单元测试、`build:dev` 打包检查，以及全量 `test:static` 与 `test`
- [x] 2.2 归档变更并同步到 `harness-dsh-desktop-plugin` 规范
