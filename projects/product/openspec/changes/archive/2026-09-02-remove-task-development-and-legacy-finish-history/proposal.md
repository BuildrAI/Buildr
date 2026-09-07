## Why

任务研发已经失去独立消费者，却继续复制任务、OpenSpec、内容、当前认知和交付事实，并要求智能体维护候选、代次、统一决定和交接。旧五阶段 Task Finish 也只剩历史读取；用户已明确接受删除全部研发与旧收尾数据，不保留兼容入口或历史模型。

## What Changes

- **BREAKING**：整体删除 `buildr.task-development` capability、Task Development Application、Development Receipt、Content Target、Task Candidate/generation、`proceed|blocked`、Development Handoff、内部 driver、HTTP 和 Buildr Web 研发页签。
- **BREAKING**：删除 Task Planning Identity Application、内部 route、规范和测试；OpenSpec 与可选 Planning Review 直接读取当前真实产物，由 Agent 判断语义变化。
- **BREAKING**：通过连续 SQLite migration 删除 `task_development_current`、`task_finish_current` 及全部已有数据；不建立 history 表、备份表、双读或兼容接口。
- **BREAKING**：删除旧 `task finish inspect`、`task delivery inspect`、Terminal Delivery、Finish history adapter 和 Buildr Web 旧交付历史投影；Task Record 的 completed/abandoned 结果保持不变。
- OpenSpec propose/update/apply、Current Knowledge、Overview、Task Record、Review、Verification、Environment、Retrospective 和默认 `task-finish` Skill 继续围绕各自事实工作，不建立替代研发模块。
- 发布任务关联移除 Task Development 与旧 Finish evidence role；Product/Release Candidate 的 source、generation、CI、唯一 tarball、tag、npm 和 protected publication 语义保持不变。
- 删除专属实现和测试；保留且修改的实现、接口、fixture、helper、测试和 DTO 使用 TypeScript 单一人工源码，不以 `@ts-nocheck`、`any` 或类型断言掩盖边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 删除整个 capability 及其 current 数据语义。
- `task-planning-identity`: 删除整个只读语义身份 capability。
- `task-finish-execution`: 删除旧 Finish 历史读取 capability。
- `task-delivery-finish-module-architecture`: 删除旧 Finish/Terminal Delivery 模块装配与历史 adapter。
- `agent-task-workflows`: 正式研发和收尾不再包含 Development 或旧 Finish Application。
- `product-agent-skills`: 删除 Task Development provider、contract、binding 和 OpenSpec/Current Knowledge/Release Skill 依赖。
- `openspec-contract-guard`: preflight/converge 不再调用 Planning Identity 或写 Development planning。
- `current-knowledge-maintenance`: 专业结果直接交给 Agent，不再聚合到 Development 或作为 handoff 门禁。
- `task-review-results`: Planning/Completion Review 直接绑定真实审查对象，不引用 Planning Identity 或 Task Candidate。
- `task-record`: 删除研发页签、Development summary 和旧 Finish history 导航；保留 Task 顶层结果及已迁移 Parent 历史。
- `task-overview-query`: Overview 不再 join Development/Finish current 表或返回相应摘要。
- `task-professional-http-contracts`: 删除 Development GET 和旧 Finish/Terminal Delivery HTTP/DTO surface。
- `buildr-web-workspace-application`: 删除研发页签和旧交付历史投影，保留任务、证据、环境和复盘。
- `bounded-buildr-web-read-execution`: 删除 Development read worker operation。
- `workspace-structured-data-store`: 删除 Development/Finish current 表及迁移后的存储分类。
- `public-json-contracts`: 删除 Task Development、旧 Task Finish 和 Terminal Delivery JSON schema/registry。
- `task-lifecycle-core-module-architecture`: 删除 Development、Planning Identity、Finish、Terminal Delivery 模块与 runtime port。
- `release-collection-model`: 发布任务关联不再包含 Development/旧 Finish role，Product Candidate 模型保持不变。
- `open-source-release-governance`: release/support Task 直接使用任务、环境、Git、验证和当前交付事实，不要求 Development/旧 Finish。
- `buildr-package-assets`: npm/workspace package 不再携带 Task Development Skill、contract 或内部 route。
- `product-source-layout`: 保留且修改的相关源码与测试收敛为 TypeScript 单一人工源码。
- `product-verification-quality`: 验证集合删除退役模块专属 owner，新增无 Development/旧 Finish、迁移和发布候选不变性覆盖。
- `cli-product-surface`: 删除旧 Finish/Delivery inspect 命令与帮助。

## Impact

- Buildr Service：Task runtime 装配、SQLite migration、Overview、HTTP/JSON、OpenSpec sidebars、Current Knowledge、Release correlation、Doctor、静态检查、package assets 和测试。
- Buildr Web：TaskDetail 导航、Overview、API client、DTO、样式、Browser smoke 和正式 `web-dist`。
- 数据：删除全部 `task_development_current` 和 `task_finish_current` rows；保留 `tasks`、Review、Verification、Environment、Retrospective 及已迁移的 `legacy_parent_plan_json`。
- 兼容性：旧内部 route、HTTP、CLI、Skill、capability 和历史读取直接退出，不提供转发或占位响应。
- 非目标：不修改 Product/Release Candidate source、generation、CI、tarball、release selection、tag、npm 或 protected publication transaction。
