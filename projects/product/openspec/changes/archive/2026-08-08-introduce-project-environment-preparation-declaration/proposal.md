## Why

Task Environment 当前只能由 Agent 为每个 Task 临时登记完整 Plan，Project 没有可复用、可审计的环境准备事实。相同 Project/Service 的 Task 因而需要重复分析技术栈，Project-only Task 被错误归为无需准备，长期准备入口变化也不能让旧 Plan 与 Receipt 基于声明来源失效。

## What Changes

- 在 Project 根新增可选 `preparation.yml`，以 closed `buildr.project-environment-preparation/v1` 声明 Project-wide 或 Service-scoped 的 Environment Preparation Recipe。
- **BREAKING**：新增 Task Environment Plan v2 与 Receipt v5；新 Plan 必须保存声明来源、Recipe identity、Task scope 选择与规范化 Step 快照，旧 Plan v1 / Receipt v4 只读兼容。
- `prepare` 从 Agent 提交的 Recipe 选择形成 Task Plan并幂等执行；`inspect` 只读比较声明、Recipe、executable、input 与 output identity，任何漂移均准确 blocked/stale。
- 支持 Project-only、多 Service、Project-wide 与 Service-scoped Recipe；缺失声明时允许 Agent 显式提交 `task-inline` Plan 作为一次性 fallback，但不静默写入 Project 声明。
- CLI、SQLite current、Local App、Doctor、public schema、Skills、文档、fixtures 与 fresh-environment 测试统一消费同一 Declaration → Plan → Receipt 模型。
- 不扫描仓库 manifests，不增加 Node/Python/Go/Rust 适配器，不引入第二套 Environment store 或跨 worktree `node_modules`。

## Capabilities

### New Capabilities

- `project-environment-preparation-declarations`: 定义 Project 环境准备声明、Recipe scope、closed Step、identity、Doctor 与 Agent 选择边界。

### Modified Capabilities

- `task-environment-preparation-plans`: Task Plan 从临时多 Service Step 列表升级为绑定 Project declaration/Recipe identity 的 Project/Service scope 执行快照。
- `task-environments`: Environment Receipt、prepare/inspect、恢复与漂移语义升级为声明来源可审计的 v5 current facts。
- `project-registry`: Project context asset 增加可选 `preparation.yml`，并保持注册与诊断不静默生成声明。
- `workspace-structured-data-store`: SQLite `task_environment_current` 继续作为唯一 authority，并持久化 Receipt v5 而不增加 sibling store。
- `local-app-web-client`: Environment Tab 展示声明来源、Recipe、Project/Service scope 与逐 Step readiness，只读取保存的 current。
- `buildr-package-assets`: 随包交付新的 Environment contract、Skill reference/template、schema 与 runtime reader/writer。

## Impact

- 主要实现：`services/buildr/src/domain/task-environment/`、`application/task-environment/`、SQLite repository、CLI、Doctor 与 Local App read model。
- Agent 资产：`task-environment`、`task-triage`、Task Development/OpenSpec sidebars、capability contract、reference/template 与 package manifest。
- Product 声明：新增 `projects/product/preparation.yml`，明确 `buildr` 与 `buildr-web` 的两套 lockfile-local 依赖准备。
- 兼容性：v1 Plan / v4 Receipt 只读；首次使用新 `prepare` 必须显式选择 Recipe 或提交 `task-inline` Plan。
