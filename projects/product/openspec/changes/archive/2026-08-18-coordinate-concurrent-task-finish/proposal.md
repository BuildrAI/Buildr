## Why

多个正式任务可以并行形成隔离 Delivery Carrier，但 Buildr 自举 Workspace 的 post-Finish runner 目前把任何 foreign carrier 都当作全局阻塞，并且可能在发现 target-race 前已经执行 sync、安装和重启。这使本可独立推进的任务互相停止，增加无效恢复和人工介入。

## What Changes

- 保持普通 Workspace 的五阶段 Task Finish 与短 target lease，不为用户 Workspace 增加自举阶段，也不把 carrier 创建全局串行化。
- 让 Buildr 自举 runner 在副作用前复用同一 Finish target lease：共享目标交付或自举激活互斥，其他任务仍可并行准备和适配自己的 carrier。
- 将已证明 owner、路径和 identity 的 foreign carrier 视为隔离共存事实；只有不可证明的 carrier 或真实共享目标占用才阻塞当前激活。
- 在 sync、安装和重启前收敛 latest target，并有界恢复 same-run target-race；需要 Delivery Adaptation 时先返回匹配 carrier/token，不产生激活副作用。
- 在 Delivery Adaptation 诊断中提供完整冻结提交消息和来自 Task Environment 的受控依赖准备提示。
- 对 push 后远端回读增加有限重试；持续失败仍保留同一 run/carrier 的精确恢复事实。
- 不新增任务队列、原型平台、数据库状态机或通用调度器。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`：补充 Delivery Adaptation 完整操作提示、有限远端回读重试，以及同一目标共享资源等待不阻塞 carrier 准备的要求。
- `task-closeout-orchestration`：补充自举激活复用 target lease、foreign carrier 隔离共存、激活副作用前 latest-target/target-race 收敛和自动恢复要求。

## Impact

- Buildr Service：Task Finish target lease 内部协调入口、Delivery Adaptation Result、远端回读与相关 unit/integration/system tests。
- Buildr 自举 Workspace：`buildr-self-bootstrap-sync` runner、Skill/Component contribution、integrity 与组合测试；普通用户 Workspace 不安装这些自举资产。
- Product OpenSpec 与 current knowledge：Task Finish、task closeout orchestration、技术架构和 Buildr Service 说明。
- 不改变 Task Development Candidate、Formal Verification、Completion Review、Task Record writer 或普通 Workspace Finish 生命周期。
