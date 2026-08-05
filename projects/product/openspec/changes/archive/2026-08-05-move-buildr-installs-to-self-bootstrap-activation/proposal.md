## Why

共用 Task Finish 当前根据 Buildr Product 源码路径直接安装默认 development CLI 和 `Buildr Dev.app`，把 Buildr 自举机器副作用误设为所有 Workspace 的通用交付门禁。现有 `buildr-self-bootstrap` Component 已经承担自举 package 收敛，适合在 Formal Finish 成功后统一接管这些仅属于 Buildr 自举 Workspace 的 activation 行为。

## What Changes

- 从共用 Task Finish Product executor 与 terminal delivered 门禁中移除 development CLI 和 development Local App 安装权责。
- 保留共用 Finish 的五阶段、Delivery Carrier 等价、普通 push/远端回读、必要 runtime render、retained Doctor 和 Environment cleanup。
- 将现有 `buildr-self-bootstrap-sync` 收敛为单一 self-bootstrap activation 能力，只消费成功 Finish Result 中冻结的 Task Contribution paths，按 package、CLI、Local App 影响去重选择动作并运行最终 Doctor。
- 明确 self-bootstrap activation 失败发生在 Formal Finish 之后，不回写 Finish、Development、Verification、Review、Task Record 或 Environment cleanup 事实。
- 保持 `buildr.task-finish-result/v2` 可读取；旧 `runtimeInstall`、`localAppDelivery` 字段若保留，只具兼容性 `not-applicable` 语义，不再拥有 delivered gate authority。
- 普通用户 Workspace 不安装 self-bootstrap Component，不获得其 Skill、Contribution、路径分类或本机 installer/launcher 副作用。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 调整通用 Task Finish 与 Workspace 专属 post-Finish maintenance 的责任边界、Result delivered 证明和失败语义。
- `buildr-package-assets`: 调整 `buildr-self-bootstrap` Component 的专属 activation 组合、用户 Workspace 隔离与 package/runtime parity 要求。

## Impact

- Product OpenSpec current specs、Brief/current knowledge 与术语核对。
- `task-finish-product-executor.mjs`、`task-finish-impact.mjs`、Task Finish v2 Result/read model 与 terminal delivery projection。
- `buildr-self-bootstrap` Component contribution、专属 Skill、integrity 与当前自举 Workspace runtime projection。
- CLI/Local App installer 调用边界、Doctor、package/runtime parity，以及 Unit、Integration、System、Browser fixtures。
- 不新增数据库、第二 writer、事件总线、daemon、缓存、公共 activation registry、插件协议或第二 capability graph。
