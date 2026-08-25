## Context

已交付 runtime 同时具备 closed v3 parser/planner/provider 与一个严格的 v2 normalizer。当前冲突不在技术可行性，而在产品承诺和自举采用状态：canonical specs、roadmap、package validation 仍把 v2 reader 绑定到一次性删除 Contribution，Product live declaration 仍为 v2；用户决定将该 reader 保留为长期历史兼容，同时要求 Buildr 立即用 live v3 声明验证新架构。

现有 v2 adapter 已经保持重要的保守边界：`applicability.paths` 只映射为 discovery，单一 invocation 只映射为 full，只有 `requiredForDelivery: true` 映射到 `task-delivery`，evidence 固定为 `legacy-declared`。现有 Product 高级 provider `buildr.product-verification/v1` 已能按 v3 Request 形成 affected、full、Product Candidate 和 release-only Plan，但 live declaration 尚未接入。

## Goals / Non-Goals

**Goals:**

- 把“v3-only authoring”与“v2 legacy reading”明确为两个同时成立、互不混淆的契约。
- 将 Product live declaration 迁移到 v3，并接入现有高级 provider 与独立 Browser capability。
- 让静态验证、Doctor、Skills、templates、docs、current knowledge 和 tests 对同一兼容承诺保持一致。
- 用真实 v2 fixture 与 Product live v3 分别证明两条路径，而不是用文档断言代替行为证据。

**Non-Goals:**

- 不为 v2 新增字段、writer、template 或 v3-only 目标语义。
- 不迁移 Pig、FreshX、Foundation 或其他外部 Workspace。
- 不改变 Verification Request、Plan、Execution Record、Result 或 Task lifecycle authority。
- 不执行真实 publish；Published Release 的最终 authority 仍属于发布流程。

## Decisions

### 1. 长期兼容只存在于 reader，不存在于 authoring surface

runtime 保留 closed v2 schema validation 与 normalization；所有 Skill、template、reference、示例和新声明只生成 v3。相比“到某日期删除”或“同时维护两套完整产品模型”，该方案既不遗忘历史 Workspace，也不会让 v2 继续演进成第二套模型。

合法 v2 继续产生 `info` 级、`userActionRequired: false` 的迁移提示，因为它仍是受支持但能力受限的输入；无效 v2 与无效 v3 都保持 blocking。Doctor finding 的稳定 code 可以保留以避免不必要的消费者破坏，但标题和说明必须移除“有界自举过渡/待删除”语义。

### 2. v2 normalizer 保持单向、保守和无增强

v2 只映射原本可证明的字段：paths→discovery、invocation→full、requiredForDelivery→task-delivery、evidence→legacy-declared。它不产生 affected/provider，也不允许 `product-candidate` 或 `published-release` 自动匹配。请求这些目标时由 planner 返回 coverage gap；这比猜测证据层级或把 full 冒充 affected 更诚实。

### 3. Product live v3 使用一个高级 provider capability 加一个独立 Browser capability

`product.verification` 作为 Product 私有 registry 的稳定公开门面：

- scope 为 Product；evidence 汇总 Product registry 可提供的 Static、Unit、Component、Integration、System；
- usable target 覆盖 `task-delivery`、`product-candidate` 和 `published-release`，但 release target 只形成 release-only contract/smoke Plan，不替代真实 publish transaction；
- affected/full 均引用 `buildr.product-verification/v1`，由 provider 依据 Request 选择真实 registry steps、依赖和 full reason。

`product.browser-smoke` 保持独立 command capability，因为它有 browser resource claim、条件 path discovery 和 Buildr Web 特定 preparation；它不应被塞进通用 provider declaration 或在每次 full 中无条件重复。

原 v2 的 `product.fast` 不进入 v3 live declaration，因为 Quick 只是开发反馈，不是 `usableFor` 中任何正式目标。`product.delivery`、`product.full-regression`、`product.candidate`、archive/convergence/release 等 v2 capability 不逐项机械迁移；其真实选择由 `product.verification` provider 的唯一 registry 持有，避免 declaration 复制执行图。

### 4. package 同时保护 v3 authoring 与 v2 compatibility

package include mapping 继续只投射 v3 reference/template/Skill；静态校验改为要求 Product live declaration 为 v3，并要求 v2 reader 的 schema version、保守 mapping、legacy evidence、Doctor finding 和 v2 regression fixture 仍存在。这样“用户新建什么”和“runtime 能读取什么”可分别验证。

### 5. 文档按当前行为、兼容边界和外部迁移时序分层

roadmap 从“尚未实现的目标架构”更新为“已实现、正在 Product 自举采用”；current knowledge 和 glossary 明确 v3 authoring/v2 legacy reading；v3 reference 中“v3 不接受 v2”只描述 v3 文件 schema，不再误写为 runtime 没有 compatibility reader。集鲜只保留试点映射和未来迁移前提，不声称本任务已完成迁移。

## Risks / Trade-offs

- [长期 reader 可能成为无人维护的隐性分支] → 用独立 v2 fixtures、package static validation 和 Doctor integration test 将其纳入常规回归 owner；不依赖人工记忆删除或维护。
- [用户可能把“兼容”理解为完整 v3 能力] → Doctor 文案明确“可继续使用但能力受限”，planner 对 v3-only target 返回 coverage gap，文档列出不映射能力。
- [单一 Product provider 隐藏内部选择原因] → provider 仍必须把 direct/dependency/full reason、execution unit 与 provider identity投射到统一 Plan；内部 DAG 不进入 declaration。
- [Product live declaration 变化使 verification selection 本身升级为 Full] → 先运行 focused contract/integration/provider tests，再运行真实 changed→Full；不降低 owner 或绕过正式验证。
- [Published Release 名称可能被误解为 publish 已完成] → capability proves 和文档只声称 release contract/smoke；实际 publish、published install 与 registry readback 继续由 release workflow authority 证明。

## Migration Plan

1. 先更新 specs、tests 和 static validation，保持 v2 reader 可运行。
2. 将 Product live declaration 原子改为 v3，并用 candidate CLI 运行 Doctor、Task Delivery affected/full、Product Candidate 与 release-only plan assertions。
3. 更新 Skills/reference、roadmap、document index、verification ownership 和 current knowledge，确保 active authority 不再要求删除 v2。
4. 运行 v2 fixture compatibility 与 Product live v3 provider/command execution tests，再执行 changed/full Product verification。
5. Converge/archive 本 Change，完成正式 Task Verification、Completion Review、Contribution Handoff 和 Finish。

回滚只需回退本 Change 的 Product declaration、契约和文档；v2 reader 从未删除，因此旧 Workspace 不存在数据迁移回滚问题。

## Open Questions

无。外部 Workspace 的迁移时机已明确为正式版发布和安装之后，由各自 authority 决定。
