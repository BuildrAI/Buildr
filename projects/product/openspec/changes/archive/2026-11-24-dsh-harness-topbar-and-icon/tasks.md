## 1. 实施

- [x] 1.1 在 `workspace.ts` 支持解析可选工作空间名称并提供 `workspaceDisplayName` 展示回退逻辑，在 `HarnessApp.tsx` 同步透传当前工作空间名称
- [x] 1.2 在 `client.tsx` 将左侧插件图标替换为无框 Buildr Harness 官方彩色 H 矢量图标，并在 macOS `Anchor` 中实现支持 `data-window-drag` 拖拽与双击缩放的 48px 轻量工作台顶栏
- [x] 1.3 补充 `workspace.test.ts` 单元测试，更新插件 README 与桌面验收说明

## 2. 验证与归档

- [x] 2.1 运行 `buildr-harness-dsh-plugin` 单元测试与 `build:dev` 构建产物核验，以及 `projects/product` 推送前全量静态检查与单元测试
- [x] 2.2 归档变更并同步到 `harness-dsh-desktop-plugin` 规范，提交合入 `dev` 后通过自举执行器更新开发插件并重开 DSH
