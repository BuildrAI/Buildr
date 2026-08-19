## Why

`buildr-self-bootstrap-sync` 当前直接消费 `buildr.task-finish-result/v2`，Task Finish 内部结果升级为多仓库 v3 后，runner 在任何 activation effect 前因 schema 与 carrier 路径假设失配而停止。继续为 runner 逐个追加 v3、v4、v5 分支会让内部状态演进持续传播到跨模块消费者，因此现在需要由 Product CLI 提供稳定、面向自举的公开输入投影。

## What Changes

- 为 `task finish run|inspect --detail self-bootstrap` 增加稳定的 `buildr.task-finish-self-bootstrap-input/v1` 输出；Product 负责把当前及受支持的旧内部 Result 归一化到该契约。
- 投影显式表达 Task/run/Workspace/target identity、Finish mode、Workspace repository、repository carrier 集合、activation paths、delivery ref、resume 与 Delivery Adaptation 恢复事实，不向 runner 暴露内部 Result schema。
- `buildr-self-bootstrap-sync` 只消费稳定投影，不再识别 `buildr.task-finish-result/v2|v3|...`；对同 major 的未知字段保持兼容，对未知投影 major 或不完整语义 fail closed。
- 多仓库 Result 只使用唯一 Workspace repository 的 frozen activation paths，同时验证 run-owned carrier container 下全部实际 carrier；无 Workspace contribution 时自举为 not-applicable。
- 保留现有 `compact|full` 输出和内部 Task Finish Result，不构成破坏性变更。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `public-json-contracts`：新增稳定自举输入 schema 与 `task finish run|inspect` 的 `self-bootstrap` detail，明确兼容演进和 coverage 要求。
- `task-finish-execution`：自举 runner 改为消费 Product-owned 投影，并以 repository-aware 规则处理当前与 foreign carrier。

## Impact

- Product CLI：Task Finish 参数解析、结果投影、公开 schema registry、help 与 JSON coverage。
- Self-bootstrap Skill：`skills/buildr-self-bootstrap-sync/SKILL.md`、bundled runner 及其 current/foreign carrier 证明逻辑。
- 测试：Task Finish projection/CLI、self-bootstrap v2/v3 归一化、多仓库 Workspace 选择、嵌套 carrier、未知契约拒绝与兼容字段场景。
- 不修改 SQLite schema、Task Finish 五阶段、现有 run、remote delivery 或普通 Workspace 行为。
