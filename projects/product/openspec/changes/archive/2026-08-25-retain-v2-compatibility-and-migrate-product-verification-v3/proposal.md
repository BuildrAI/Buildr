## Why

Workspace Verification v3 已经实现并完成 Buildr 自举，但当前 canonical contract 仍把 v2 reader 描述为必须删除的短期过渡，Buildr Product live `verification.yml` 也仍停留在 v2。这既与“历史 Workspace 可持续使用、由 Doctor 提示迁移”的产品决定冲突，也使 Buildr 无法用自身 live declaration 证明 v3 的真实应用路径。

## What Changes

- 将兼容策略改为：v3 是唯一的新声明与新能力 authoring contract；runtime 长期保留 closed v2 reader，并把合法 v2 规范化到统一内部能力模型。
- Doctor 对合法 v2 返回非阻塞迁移提示；v2 不获得 affected、Product Candidate、Published Release 或 provider 等 v3-only 语义，请求缺失能力时形成精确 coverage gap。
- 修订 package contract：继续只发布 v3 reference/template 和 v3 authoring guidance，但 runtime/package 必须保留可审计的 v2 legacy reader、schema 与回归 fixture。
- 将 Buildr Product live `verification.yml` 迁移到 closed v3，按验证对象、affected/full 范围、evidence、usable target 与 Product 高级 provider/command 的真实边界建模。
- 更新 roadmap、current knowledge、术语、Skill/reference 与静态验证，删除“尚未实现”“迁移后删除 v2”等过时表述。
- 同时验证一份 v2 fixture 的兼容规划/执行路径和 Buildr Product live v3 的规划/provider/执行路径。
- 不迁移 Pig、FreshX、Foundation 等外部 Workspace；它们等待正式版发布并安装后，由各自 Workspace authority 单独迁移。

本 Change 不包含破坏性变更：v2 读取兼容被保留；新声明仍只允许 v3。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-test-capabilities`：把有界自举期 v2 reader 改为长期、封闭、能力受限的 legacy compatibility，并修订 Doctor 契约。
- `buildr-package-assets`：随包只提供 v3 authoring 资料，同时保留 runtime v2 legacy reader/schema/fixture，不再要求删除全部 v2 支持。
- `product-verification-quality`：要求 Buildr Product live declaration 使用 v3，并用真实 provider/command 边界表达 Task Delivery、完整日常证据和 Product Artifact Candidate。

## Impact

- `projects/product/verification.yml` 与 Product verification 静态校验。
- Project verification parser/normalizer、Doctor finding 文案及其 contract/integration/system tests。
- `task-verification` 的 v3 reference/template、Project Testing/Declaration Intake guidance 与 package parity checks。
- canonical OpenSpec specs、`openspec/knowledge`、roadmap、文档索引和验证 ownership 文档。
- 不改变 Task/Verification/Execution Record authority，不引入外部系统副作用，也不修改集鲜 Workspace。
