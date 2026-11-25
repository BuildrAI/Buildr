# 变更提案：统一 DSH 开发插件包名并修复双插件互切白屏

## Why

1. 当前本机开发版 DSH 插件使用了 `@buildr-ai/buildr-harness-dsh-plugin-dev` 与 `@buildr-ai/buildr-development-dsh-plugin-dev` 包名，与正式包 `@buildr-ai/dsh-buildr-harness`、`@buildr-ai/dsh-buildr-development` 命名体系不一致；同时两个插件未导出 `locale/*.json` 与图标资源，导致 DSH 已安装插件页直接露出原始包名与默认拼图图标。
2. 两个插件同时在 DSH 注册并先后打开时（先开 Buildr Development 再开 Buildr Harness），双方共享单槽位 `main.conversation` 且使用相同的 `priority: -100`。按 DSH 加载顺序 Harness 的订阅先于 Development 触发，会在 Development 释放槽位前同步注册同优先级槽位引发异常，阻断 `Shell` 状态广播与会话对齐，导致 Harness 内容区白屏；此外同目录会话下的同步 `align()` 调用还存在 `selectPanel(null)` 竞争隐患。

## What Changes

- **统一本机开发插件包名**：
  - 将 Harness 开发插件包名由 `@buildr-ai/buildr-harness-dsh-plugin-dev` 统一为 `@buildr-ai/dsh-buildr-harness-dev`。
  - 将 Development 开发插件包名由 `@buildr-ai/buildr-development-dsh-plugin-dev` 统一为 `@buildr-ai/dsh-buildr-development-dev`。
- **补齐插件页元数据**：
  - 两个插件（开发版与正式版）构建产物均输出并导出 `locale/en.json`、`locale/zh.json`（含 `meta.title` 与 `meta.description`）和 `icon.svg`（官方矢量图标，并在 `package.json` 声明 `icon` 字段）。
- **彻底修复双插件任意顺序互切与同目录重入**：
  - 为四条插件通道分配互不冲突的 `main.conversation` 优先级（正式 Harness `-100`、开发 Harness `-101`、正式 Development `-102`、开发 Development `-103`）。
  - 在订阅分发、槽位注册与 `align()` 调度中增加异常隔离与微任务对齐调度，保证切换面板与同目录共享 DSH 会话时双插件状态严格互斥、互不遮挡或卡死。
- **自举脚本兼容平滑迁移**：
  - `dsh-development-plugin.mjs` 支持识别本工作空间已安装的旧开发包名，在确认 DSH 退出后先卸载旧包、清理残留条目并安装新包名产物，对新旧包名同时存在的情况阻断并报告。

## Impact

- 受影响规范：`development-dsh-desktop-plugin`、`harness-dsh-desktop-plugin`
- 受影响服务与资产：`buildr-harness-dsh-plugin`、`buildr-development-dsh-plugin`、自举同步技能脚本与测试、架构文档。
