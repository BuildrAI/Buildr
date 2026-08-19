## Why

`broaden-self-bootstrap-successor-activation` 已经把 self-bootstrap runner 收敛为“已发布、无 merge、精确远端一致的线性 successor 不依赖普通提交 trailer”，但 `task-closeout-orchestration` 中较早的 latest-target Requirement 仍保留“每个 commit 必须具有 Buildr provenance”的旧文本。两段 canonical Requirement 直接冲突，并在准备 `0.1.0-rc.20` 时被 OpenSpec candidate audit 暴露，必须先恢复单一契约再继续发布。

## What Changes

- 修订 `Runner 必须在 activation 副作用前有界收敛 latest target` Requirement，使其与同一 spec 的幂等恢复 Requirement、当前实现、Skill、测试和 current knowledge 一致。
- 明确普通 published linear descendant 的作者、工具与 `Buildr-Task` 或 closeout trailer 不构成 activation 前置条件，同时继续要求 Finish frozen ref 祖先关系、无 merge、clean checkout、可 fast-forward 和精确 remote/branch 回读。
- 保留 “Latest target 已包含其他 Buildr 交付” 场景身份，并将其条件扩展为覆盖任意已发布线性后继；不修改 runner 实现、持久数据、公开 API 或既有安全边界。
- 本变更不包含破坏性变化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-closeout-orchestration`：移除 latest-target Requirement 中与已接受 successor activation 语义冲突的 provenance 前置条件，并保留其余 authority 与副作用门禁。

## Impact

- Product canonical spec：`openspec/specs/task-closeout-orchestration/spec.md`。
- OpenSpec candidate audit 与 `0.1.0-rc.20` 发布准备恢复一致的 delta/canonical 证据。
- 不修改生产实现、测试入口、依赖、数据库、Task/Finish schema 或 npm 发布行为。
