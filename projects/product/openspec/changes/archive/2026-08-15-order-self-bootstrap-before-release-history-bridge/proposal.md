## Why

候选版准备在 release Task Finish 后、`main → dev` 历史衔接完成后才调用 self-bootstrap runner，会让 runner 面对包含 merge commit 的后继链并按既有安全契约零副作用阻断。该问题不影响远端候选内容或测试，但会留下未完成的本地 development successor 激活，因此发布编排必须在产生 bridge merge 前消费 matching Finish Result。

## What Changes

- 将 matching release Task 的 self-bootstrap activation 固定在 `dev → main` PR 与 `main → dev` 历史衔接之前完成。
- 为发布历史衔接增加可校验的 self-bootstrap closeout evidence 门禁；缺失、非终态、run/ref 不匹配或已过期的 evidence 均在 merge/push 前失败关闭。
- 保持 `buildr-self-bootstrap-sync` runner 为唯一 activation orchestrator，不放宽其 descendant merge、dirty tree、remote drift 等零副作用保护。
- 补充发布 Skill、检查清单、当前认知与回归测试，覆盖 passed、not-applicable、缺失/不匹配 evidence 以及 bridge 仍保持 candidate tree 的场景。
- 不包含破坏性变更；这是 Buildr 自举发布维护流程的收紧。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 发布准备必须先完成或确定不适用 matching self-bootstrap activation，才能进入发布 PR 后的历史衔接；bridge 必须验证同一 run/ref 的 closeout evidence。

## Impact

- `skills/buildr-release/SKILL.md` 的发布准备顺序与失败恢复说明。
- `projects/product/services/buildr/scripts/release/bridge-main-to-dev.mjs` 的输入和前置门禁。
- release history bridge 与 self-bootstrap 集成/契约测试、验证 registry 映射。
- `projects/product/services/buildr/docs/release-checklist.md` 与 Product 当前认知中的发布/自举顺序说明。
