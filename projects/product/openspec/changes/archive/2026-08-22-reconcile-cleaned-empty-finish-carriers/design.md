## Context

Task Finish 当前 writer 会删除单仓 carrier，或在多仓最后一个 carrier 删除后删除空 run container；删除失败不会形成 cleaned 结论。兼容问题来自较旧的已交付 Result：稳定投影已经把 repository carrier 写为 `availability: cleaned`、`root: null`，磁盘上却仍可能存在精确 run-owned 的空 container。现有 self-bootstrap inventory 只支持“真实 carrier 仍存在”的 ownership proof，因此把这种历史残留误判为 `unprovable`。

该目录位于 Workspace 固定受管根，但仍属于另一个 Finish run。兼容逻辑必须同时避免两个风险：不能把任意空目录当作 Buildr-owned，也不能因 Buildr 自己的历史空壳阻断当前已交付 Task 的 activation。

## Goals / Non-Goals

**Goals:**

- 对 Product Result 已明确声明 cleaned 的历史空 run container 建立独立、可审计的证明。
- 在任何 target lease、Git、sync、安装、Doctor 或 Finish resume 副作用前，以非递归删除收敛该空目录。
- 删除后重新枚举 inventory，并在 Result 中保留 `stale-empty-container` observation/effect。
- 对非空、symlink、越界和 identity 不匹配继续 fail closed。

**Non-Goals:**

- 不重新定义 active/cleanup_pending carrier 的 ownership proof 或跨 owner cleanup 权限。
- 不放宽 tracked/staged/untracked 用户内容的 cleanliness 规则。
- 不改变 Finish writer、Delivery、Task 生命周期、Environment cleanup 或远端 Git 策略。
- 不新增依赖、公共 CLI 参数、HTTP/SQLite schema 或普通 Workspace capability。

## Decisions

1. **采用独立的 cleaned-container proof，不复用 active carrier proof。** active proof 要求每个 repository carrier 有绝对 root 且真实存在；cleaned Result 的契约恰好是 `root: null`。独立 proof 会要求稳定 input schema、精确 run/Workspace/container、所有 carrier `availability: cleaned` 且 `root: null`，并核对 `workspaceRepository.carrier` 与 carrier 集合的 selector/identity/cleaned 状态。

2. **只允许删除完全为空的真实目录。** runner 使用已有 inventory 的非 symlink、固定根直接子目录与 realpath containment 事实，并再次读取目录确认零条目；删除使用非递归 `rmdir`。不采用 recursive remove，也不忽略空目录中的隐藏文件。

3. **先证明并删除，再重新枚举。** 命令入口先通过 Product inspect 取得每个候选的稳定 Result，再收敛全部可证明的 stale empty container；随后重新发现和 inspect 剩余条目，再生成正常 recovery plan。这样后续 cleanliness ignored roots 只包含仍真实存在的 proven carrier。

4. **兼容删除失败按 `unprovable` 阻断。** race、权限或目录突然非空均不得被吞掉；runner 返回精确 diagnostic，并保持 activation effects 为空。成功删除记录为 `stale-empty-container` observation，而不冒充 owner Finish cleanup 或修改其 Product Result。

5. **不修改当前 Finish writer。** 当前单仓删除整个 carrier/container，多仓最后一个 carrier 删除后 `rmdir` 空 container，且异常会阻止 cleaned 完成。重复实现另一套 writer cleanup 会扩大 authority，不能解决历史 Result 兼容问题。

## Risks / Trade-offs

- [检查后到删除前目录发生变化] → 使用非递归 `rmdir`，只要出现任何条目就失败并阻断。
- [伪造或错配旧 Result] → 只接受 Product `task finish inspect` 的稳定 self-bootstrap 投影，并逐项验证 schema、run、Workspace、container、selector、identity、availability 与 root。
- [删除 foreign run 目录被误解为接管 owner cleanup] → 仅删除已经由 Result 声明无 repository carrier 的空容器，不执行 owner resume、不改 Result/Task/Environment，也不读取业务内容。
- [兼容 observation 在重新枚举后丢失] → 将成功收敛事实显式并入 recovery plan/result，便于诊断和回归测试。

## Migration Plan

交付新 runner 后，后续 self-bootstrap invocation 会在 activation 前自动收敛满足证明的历史空容器。无需迁移 SQLite 或批量扫描；不满足证明的目录维持原有 blocked 行为。回滚只需回滚 runner/spec 变更，不影响既有 Finish Result。

## Open Questions

无。
