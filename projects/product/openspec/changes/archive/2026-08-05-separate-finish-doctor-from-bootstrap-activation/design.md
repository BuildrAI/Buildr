# Design: 分离 Finish Doctor 与自举 runtime 激活

## Decision

Common Finish 调用 `doctor --target <retained> --json`，不选择 Agent adapter，并继续以 `health.ready === true` 为交付门禁。Doctor 的 inventory 语义仍检查 Workspace、store、capability graph与已发现 runtimes；未选中 runtime 的 drift 只作为非行动性 inventory evidence，不阻止通用交付。

Buildr 自举 activation 在完成 package sync和development CLI/Local App适用动作后，调用 `doctor --agent <agent> --target <retained> --json`。因此 selected runtime readiness 只在拥有并执行该专属能力的 Workspace 中成为自举激活门禁。

## Boundary

- 不修改 Doctor Domain 或全局 health 语义。
- 不接受 warning、error 或 exit status 的例外；Common Finish 仍要求现有 Doctor 的 `health.ready`。
- 不新增 Result 字段、store、writer、phase 或恢复协议。
