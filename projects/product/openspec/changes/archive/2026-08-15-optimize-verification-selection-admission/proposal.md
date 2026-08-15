## Why

Buildr 已有较完整的验证集合，但部分生产源码变化只命中通用 Unit/Candidate owner，未自动选择已有的领域 Integration；同时 Full/affected 在首次反馈时会并发启动重型 DAG，使数秒可发现的契约错误拖到数分钟后才结束。需要在不减少 Candidate 完整覆盖的前提下，让选择更准确、失败更早、同一执行不重复验证。

## What Changes

- 为生产源码建立显式的领域验证 owner 映射，并对“已有领域 Integration 证据但源码未命中该 owner”的缺口 fail closed。
- 将 Task 读取模型等已确认缺口拆入有界 Integration slice，Candidate 仍聚合全部 slice 且每个测试文件只有一个 primary owner。
- 为验证 registry/planner/runner 变化增加廉价 canary，并把 Quick/canary 组织为重型 affected/full 之前的 admission wave。
- 同一次验证执行复用已通过的 admission step evidence，后续主 DAG 不重复运行相同步骤；admission 失败时不启动重型步骤。
- 保持 `verification.yml` 的稳定 capability ID、Candidate 行为覆盖和 GitHub Candidate 拓扑不减少。

不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`：补充生产源码到领域验证 owner 的完整性约束，以及同次执行的 admission wave、失败短路和 evidence 复用要求。

## Impact

- 主要影响 `services/buildr/test/verification/registry.mjs`、planner/runner、Integration 聚合入口及其契约测试。
- 更新 Buildr 验证 ownership/current knowledge，说明新增 slice、准入顺序与一次执行内的去重语义。
- 不修改 Project `verification.yml` schema 或 capability 声明，不改变 npm 发布、真实 Registry、平台兼容范围或 Task Verification Result schema。
