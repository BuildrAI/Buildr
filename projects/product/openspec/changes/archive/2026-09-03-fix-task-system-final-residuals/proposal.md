## Why

任务系统已完成主要模块退役和职责拆分，但当前规范、说明与实现仍有最后一批相互矛盾的要求；同时 Verification 写入可被并发静默覆盖、Task Record 历史引用失效会扩散为整条读取失败、Web 默认加载全部历史任务，CLI 帮助与严格 TypeScript 迁移也未收敛。这些残留会让 Agent 依据错误契约工作，并在并发或历史对象迁移时破坏当前事实的可读性。

## What Changes

- 删除当前 canonical specs 和 current knowledge 对 Task Overview、Task Environment、Task Development、Task Execution Record、旧 Finish、Contribution Handoff 与 Task 内部 workflow router 的正向要求，只保留必要的退役边界；历史 Change、连续 migration 和明确 legacy fixture 不改写。
- Task Verification `record` 强制携带调用方观察到的 `absent|reportDigest`，Repository 在同一 `BEGIN IMMEDIATE` 事务内比较、替换、回读并提交，冲突返回稳定诊断和最新摘要且不自动重试。
- Task Record 读取始终返回结构有效的 SQLite 记录，并以响应级局部诊断表达当前 Project、Service 或 Change 不可用；新引用继续严格校验，移除失效引用或修改无关字段不受阻。
- Buildr Web 任务列表首次默认 `open`，复盘筛选自动切换到 `all`，保留全部显式状态筛选、请求代次保护与空 Workspace/无匹配结果区分，并移除详情页重复 DOM ID。
- 修正 Task CLI catalog/help，使 `activate`、终态事实更正和每个命令的真实副作用边界一致可见。
- 删除 `src/task` 保留能力中的全部 `@ts-nocheck`，为 Task Record、Review、Verification、父任务协调及其 CLI/HTTP/Repository/module ports 建立实际类型，并从 `unknown` 收窄外部 JSON。
- 增加静态与行为测试，阻止当前规范再次正向恢复退役任务模块或错误 `.mjs` 路径。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-structured-data-store`: 删除已退役 Task Execution Record 表的当前正向要求，确认 fresh/upgrade 最新 schema 仅保留真实当前任务表。
- `public-json-contracts`: 删除 Execution Record GC/readback 与旧 Parent workflow JSON 的当前要求，并补充 Verification 并发冲突及 Task 引用局部诊断契约。
- `task-execution-module-boundaries`: 当前模块图只保留 Task Record、Review、Verification、父任务协调、Worktree 与 Preview 的独立 owner。
- `skill-capability-contracts`: 用当前 Task Record、Review、Verification、父任务协调与默认收尾契约替换 Development、Parent Plan、Contribution Handoff 和旧 Finish 协作要求。
- `product-source-layout`: 任务核心保留能力收敛为严格 TypeScript 单一人工源码，路径与真实 `.ts` 实现一致。
- `task-review-module-architecture`: Task Review 的 Domain、Application、Repository、CLI、HTTP 和 module port 使用实际 TypeScript 类型与真实路径。
- `task-verification`: `record` 增加调用方摘要并在 Repository 内提供原子并发保护。
- `task-record`: 读取隔离历史引用可用性，新增引用继续校验，删除失效引用或无关更新不受旧引用阻塞。
- `buildr-web-workspace-application`: 任务列表默认与复盘筛选、详情局部诊断和唯一 DOM ID 行为对齐。
- `buildr-web-client`: 删除已退役 Execution Record 当前视图要求，并准确描述现有 Task 列表/详情客户端。
- `buildr-web-browser-verification`: 浏览器验收覆盖默认 open、复盘终态、请求竞态、空 Workspace/无匹配和唯一 DOM ID。
- `cli-product-surface`: Task 命令目录、帮助文字与实际动作及副作用一致。
- `product-verification-quality`: 增加退役能力正向规范残留与 Task TypeScript 边界的静态回归检查。
- `agent-task-workflows`: 用v4测试地图、Agent直接执行与最终报告替换v3 Request/Plan/provider工作流。
- `buildr-package-assets`: 随包只交付当前Task Verification v4 contract/provider/reference/template和入口。

## Impact

- `services/buildr/src/task/**`、CLI/HTTP contracts、公共 JSON、DTO 生成源与生成结果。
- `services/buildr-web/src/pages/**`、API DTO 与任务浏览器测试。
- `services/buildr/test/**`、SQLite fresh/upgrade、Task Record/Review/Verification/Parent Coordination、CLI help、HTTP 与 package/static 验证。
- `openspec/specs/**`、`openspec/knowledge/**`、`docs/**` 及直接消费本次接口变化的 `task-manager`、`task-verification` Skill。
- 这是有意的调用契约收紧：旧的 Verification `record` 调用未提供已观察摘要时将被拒绝；后端 Task list 未传 `status` 仍保持 `all` 兼容语义。
