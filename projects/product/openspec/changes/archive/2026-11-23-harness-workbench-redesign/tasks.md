## 1. 依赖与架构契约准备
- [x] 1.1 在 `buildr-harness-web/package.json` 增加 `@codemirror/merge` (`6.12.2`) 并同步锁文件与工作树依赖。
- [x] 1.2 建立 `harness-workbench-redesign` OpenSpec 变更契约与任务关联。

## 2. 后端通用底座迁移与目录工作台补齐 (`buildr-harness` -> `buildr` 复用)
- [x] 2.1 将只读文件批量校验、提交执行、放弃更改、模型生成、提交材料与 AI 提交说明生成模块迁入 `buildr-harness/src/workbench/` 并导出；`buildr` 改为透传复用并保留研发任务与规则扩展。
- [x] 2.2 修复 `directory-checkouts.ts` 的 Git 感知目录发现与 `skipLocations` 跳过逻辑。
- [x] 2.3 在 `directory-workbench.ts`、`server.ts`、`web-endpoint.ts` 补齐 `catalog`、`authors`、`history` 筛选、`branch-switch` 局部名、批量 `fetch`、`commit-*`、`discard-*` 与 `file` 编辑器快照。

## 3. 前端通用组件迁移与布局对齐 (`buildr-harness-web` -> `buildr-web` 复用)
- [x] 3.1 将执行模型选择、通用 `file-editing` 会话/编辑器/差异编辑器、通用 `explorer` 面板/提示条与 `source-control` 操作/提交/丢弃/分支/筛选组件迁入 `buildr-harness-web` 并通过边界检查；`buildr-web` 改为直接复用并扩展研发能力。
- [x] 3.2 完善右侧栏布局与向左侧弹出适配，重做 `HarnessDirectoryWorkbench`、`DirectorySourceControl` 与 `DirectoryExplorer`，移除冗余切换器、平铺按钮、普通文本框与多余折叠图标。

## 4. 验证与规范同步
- [x] 4.1 同步主规范 `openspec/specs/harness-directory-workbench/spec.md` 与架构/代码地图文档。
- [x] 4.2 补齐并执行 `buildr-harness` 单元测试、集成测试、`buildr-harness-web` 静态边界检查与浏览器端到端验证（含截图检查），并执行 `buildr` / `buildr-web` 相关静态/单测验证。
