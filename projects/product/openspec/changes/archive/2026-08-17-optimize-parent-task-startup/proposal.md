## Why

新的 Parent Task 虽然已有 Parent Plan、Planning Review、Task Entry Snapshot 和独立专业 writer，但从激活到首个 Child 之前仍缺少一条完整、可发现的安全路径。Agent 当前必须自行发现轻量 Environment、Parent Plan Review 后的 Development 刷新以及协调型 Parent 的停止点，容易误用候选 CLI、重复 Review 或跟随普通 Task 的 `develop-and-observe` 建议。

## What Changes

- 为 Parent Coordination 增加只读启动就绪投影，基于现有 Task、Environment、Development、Parent Plan、Planning Review 和 Contribution dependencies 返回 `ready|blocked`、精确 blockers 与当前可启动 Contributions，不建立新状态或 writer。
- 让 `buildr task next` 在 Parent Plan 与 Planning Review current 后返回 Parent-aware next，而不是普通 Task 的 `develop-and-observe`。
- 增加受控的 Parent planning refresh 动作：直接复用 saved Parent Plan 与 current Planning Review 更新 Development planning gate，调用方不再重构完整 planning JSON或调用内部 driver。
- 为 Parent Plan record/reconcile 输入和 refresh 动作补齐公开 CLI help、schema/example 与 JSON/package parity 覆盖。
- 更新内置 `task-triage`、`task-development` 和相关入口 guidance，固定“Git 基线 → activate → coordination-only shared Environment → Development begin → Parent Plan → Planning Review → refresh → Child-ready”的顺序，并明确一个 Contribution 同时只能绑定一个 Child；需要拆分时先 reconcile。
- 不增加跨 Git、Environment、Review 和 Development 的原子 `parent start` writer，不自动创建 Child，不自动 Review，也不放宽现有 writer provenance。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `parent-child-task-coordination`: 增加 Parent 启动就绪投影、可启动 Contribution 判定与安全 planning refresh 行为。
- `task-entry-snapshot`: 在 Parent 已采用 Parent Plan 时返回 Parent-aware typed next，并继续保持 response-only、零写入。
- `agent-task-workflows`: 固定 Parent 从激活到首个 Child 前的标准安全编排和停止条件。
- `cli-product-surface`: 增加 Parent planning refresh 与 Parent Plan schema/example 的公开 CLI surface。
- `public-json-contracts`: 登记新增 Parent readiness/refresh JSON 结构及 checkout/npm parity 要求。

## Impact

- 影响 Parent Coordination、Task Development、Task Entry Snapshot、CLI registry/help 与 public JSON registry。
- 影响 Buildr 内置 `task-triage`、`task-development` 及 package/runtime 投射内容。
- 需要覆盖 Parent startup readiness、Review 消费、candidate writer 防护、legacy Parent、依赖未满足和 checkout/npm parity 的测试。
- 不新增SQLite表、Receipt、Result、migration或第二套 Parent progress authority。
