## Context

Buildr 当前用单一 registry 编排 Fast、Changed、Focus 和 Candidate，但 step 只记录 executor、inputs、profile、预算和调度信息，没有测试意图、执行边界和事实 owner。`fast` profile 包含整个 `integration-fast`，而 `test:unit` 中也混有真实文件系统、Git 和进程测试，因此入口名称与真实边界、成本不一致。

本轮以 Project Testing v1 为判断框架，不新建通用测试平台。现有 Node `node:test`、registry、planner、DAG 与 timing evidence 继续作为 Buildr 项目内部实现。

## Goals / Non-Goals

**Goals:**

- 让每个 registry step 能直接回答主要意图、执行边界、编排场景、owner、证明范围和目标成本。
- 让 `npm test` / `test:fast` 成为真实 Quick 入口，并以实际测量证明反馈缩短。
- 建立窄而真实的 Component 层，恢复 Unit、Component、Integration 的执行边界。
- 保持 changed/focus 的任务相关选择和 Candidate 的完整覆盖不减。

**Non-Goals:**

- 不修改 Task Verification declaration schema、Result 或 Finish 生命周期。
- 不重命名所有历史目录、step id 或公共 npm script。
- 不拆分通用 DAG、调度器、资源平台，也不引入新的测试框架。
- 不在本轮扩展 Acceptance、Browser、性能、安全或 Release 测试模型。

## Decisions

### 1. 分类事实进入现有 registry

每个 step 增加一个有界 `testing` 记录，使用 Project Testing 已定义的枚举，并由 registry validation 检查完整性。环境和副作用继续由 executor、concurrency class、resources 与已有 evidence 表达，不复制第二份执行 schema。

记录字段为：`ownerScope`、`primaryIntent`、`executionBoundary`、`orchestrationScenarios`、`targetDurationMs`、`proves` 和 `primaryEvidenceOwner`。默认 `primaryEvidenceOwner` 是当前 step id；只有真实辅助证据出现时才指向另一个 owner。

替代方案是只维护 Markdown 归类表，但它容易与真实 planner 漂移；另建 catalog 又会形成第二份 registry，因此不采用。

### 2. Fast 名称兼容，语义映射到 Quick

保留 `npm test`、`test:fast` 和内部 `fast` profile，避免破坏现有 CI、文档和维护习惯；Project Testing 分类将其编排场景明确记为 `Quick`。Quick step 必须有低成本目标，不得包含 System 边界；Integration 只有在独立实测足够低成本时才能加入。

当前整个 `integration-fast` 不满足该条件，因此退出 `fast` profile，但仍保留 Candidate membership、changed inputs 和 focus identity。名称暂不重命名，避免本轮产生 alias/迁移协议；文档明确名称不再代表 Quick 资格。

### 3. 按真实边界迁移测试，不按目录美化

- 纯逻辑、parser、值对象和注入 fake 后的单一逻辑单元保留在 `test/unit`。
- `service-application` 这类同进程有界组装、外部协作者由 fake 替代的测试进入新 `test/component`。
- 直接使用真实文件系统、Git 或子进程的历史 Unit 测试迁入既有 Integration 集合，并退出 Quick；changed/focus 仍按实现 owner 选择它们。

增加轻量边界回归，防止 Unit/Component 测试再次直接引入真实进程、网络或文件系统依赖。第一版不要求为填充 Component 数量改写生产架构。

### 4. 成本目标用于治理，不把性能波动冒充正确性失败

registry 保存每个 step 的目标耗时，Quick contract 对边界与目标值做静态门禁；真实 timing summary 用于本轮前后对比和后续校准。普通机器抖动仍只产生 timing warning，不因一次耗时增长改变测试正确性结论。

### 5. Task Verification 声明只追随稳定入口事实

`verification.yml` 继续只声明少量稳定能力。`product.fast` invocation 不变，只把 `proves` 更新为真实的 Quick 组成；不把 registry 分类卡复制进 declaration，也不增加 capability 数量。

## Risks / Trade-offs

- [部分历史 Unit 测试退出每次 Quick] → 由 changed inputs 在相关改动时选择，并由 Candidate 完整运行；迁移前逐项核对 owner，不删除测试。
- [`integration-fast` 名称继续与成本不符] → registry 分类和文档成为当前事实；是否重命名留给后续实践，不在本轮维护兼容 alias。
- [Component 第一版覆盖较薄] → 只迁移能明确证明为有界组装的测试，不为层级完整制造无价值测试。
- [step 级分类不能替代每个 test case 的长期审查] → 本轮以 step 为最小治理单位，并保留后续按实际热点继续拆分的路径。
