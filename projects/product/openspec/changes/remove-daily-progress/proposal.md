# Proposal: remove-daily-progress

## Why

用户反馈项目每日演进（Project Daily Progress）功能没有实际用处，明确要求删除全部相关代码与内容；如果以后有需求，再按当时目标重新设计。该能力横跨 CLI、HTTP API、Buildr Web 界面、随包 Skill 与规范承诺，作为可观察产品能力移除，先以本 Change 收敛，再归档同步主规范。

## What Changes

- **BREAKING** 删除 Project 每日演进能力：`buildr project daily-progress record|inspect|list` 命令、`.buildr/daily-progress/` 本机 YAML 读写、Project/Task 只读每日演进 HTTP API。
- **BREAKING** 删除 Buildr Web 的每日演进与统一“动态”页：`features/project-daily-progress`、工作台动态页签与概览“每日演进/项目变化”区块、项目详情“项目动态”入口与副屏。
- **BREAKING** 删除随包 `project-daily-progress` Skill 及其资源登记，Agent 不再通过产品内置 Skill 生成每日演进。
- 移除 `.gitignore` 模板中的 `/.buildr/daily-progress/` 条目；本机既有演进文件不再被产品读写，亦不随产品删除用户文件。
- 删除 `src/modules/task/daily-progress/` 模块及其在 task module、bootstrap registry、workbench 聚合与公共 JSON 登记中的接线。
- 更新知识文档、代码地图、验证登记与相关测试；保留已归档 OpenSpec 历史与 CHANGELOG 记录作为以后重新设计的参考。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `project-daily-progress`: 移除全部每日演进产品要求（存储位置、覆盖重跑、生成边界、Skill 契约、gitignore、CLI/JSON、Web 只读展示、四问摘要、Task 关联、他人提交、变更文件）。
- `workspace-daily-progress-module-architecture`: 移除 Daily Progress 模块归属与迁移边界要求（能力随功能整体删除）。
- `daily-workbench`: 移除“每日演进按来源范围展示”与包含动态来源的旧读取要求；保留概览边界，并新增不依赖动态页签的工作台可见范围读取要求。
- `buildr-web-client`: 移除“项目详情必须提供每日演进视图”；修改壳层要求，工作台不再提供动态入口。
- `buildr-web-service`: 移除 Project Daily Progress 作为领域组合场景，改用通用领域功能组合场景；Project 详情不再组合每日演进。
- `buildr-web-workspace-application`: 移除“本机 HTTP 必须提供只读每日演进 API”；修改导航层级场景，工作台导航不再包含动态。
- `cli-product-surface`: 移除每日演进 agent-machine 命令登记要求。
- `product-agent-skills`: 移除“产品内置 Skill 必须能发现并执行项目每日演进”。
- `public-json-contracts`: 移除“每日演进 JSON 必须声明稳定 schema identity”及相关 schema identity。
- `product-source-layout`: 修改涉及 Daily Progress 的拆分、CLI 边界与资产 support 描述，去除每日演进归属约束。

## Impact

- 代码：`projects/product/services/buildr` 的 `src/modules/task/daily-progress/`、`task/module.ts`、`workbench` 模块、`bootstrap/cli/registry.ts`、`bootstrap/runtime.ts`、`infrastructure/contracts/public-json.ts`、`web/http/http-operation-coverage.ts`、`workspace/application/workspace-operations.ts`；`projects/product/services/buildr-web` 的 `features/project-daily-progress/`、`workbench` 相关页面组件、app 导航与路由、project 详情。
- 资源：`resources/workspace/skills/buildr/project-daily-progress/`、`resources/workspace/gitignore`、`resources/manifest.yml`。
- 测试：删除 daily-progress 专属测试文件，更新 registry/ownership/dispositions、契约测试、公开 JSON 测试、workbench 与 Web 相关测试；验证输入读取器对已删除的 Git 跟踪源安全保留缺失身份。
- 文档：`knowledge/` 的 daily-progress 流程文档、索引、术语表、代码地图与技术图说明；`docs/cli-reference.md`。
- 兼容：已发布版本生成的 `.buildr/daily-progress/` 文件留在本机但失去读取入口；不承诺旧地址迁移，相关 HTTP 路径与 CLI 命令直接失效（**BREAKING**）。
