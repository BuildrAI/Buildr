# Tasks

## 1. 技能资产与登记

- [x] 1.1 新建 `skills/buildr-dev-preview/SKILL.md`：description 覆盖"用开发工作树代码 + 指定数据源起 Buildr Web 预览"的意图发现；正文包含适用边界（仅自举 workspace、不作为用户默认能力）、三数据源模式、托管优先与手工降级流程、停止与身份证据说明。
- [x] 1.2 在 `skills/manifest.yml` 追加 `buildr-dev-preview` 登记（workspace-local 形态：`path`、`description`、`assetIdentity`/`sourceIdentity` 使用 `workspace:f2f40b71-2382-5906-82bd-76a7927b59f3` 前缀）。
- [x] 1.3 核对 `projects/product/services/buildr/resources/` 未引入该技能，manifest 边界（package 资产清单）无新增分发。

## 2. 技能流程可用性自检

- [x] 2.1 按技能正文执行冒烟：构建 `services/buildr-web`（产物 `services/buildr/web-dist`）、隔离 `BUILDR_APP_DATA_DIR`、以工作树 `projects/product/buildr` 起 `web --port 0 --no-open`，空现场返回 loopback URL 且默认实例不受影响；`--task` 托管路径与快照播种在 `task-worktree-material-readability` 修复后实测通过；结束后停止进程并清理隔离根。
- [x] 2.2 核对技能中文表述与术语（工作树（Worktree）、canonical workspace、数据源模式），命令与标识符精确对应实现。

## 3. 核对

- [x] 3.1 `openspec validate internal-dev-preview-skill --strict` 与 `buildr openspec convergence preflight` 通过。
- [x] 3.2 知识影响核对：技能为自举 workspace 内部资产，`agent-task-workflows` delta 已覆盖边界；`knowledge/` 无需新增入口（内部预览流程与数据位置由 SKILL.md 与 buildr-data-design 既有说明覆盖）。
