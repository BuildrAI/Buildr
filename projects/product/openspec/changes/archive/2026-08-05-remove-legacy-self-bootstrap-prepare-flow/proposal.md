# Proposal: 移除旧自举 prepare/publish 流程

## Why

`move-buildr-installs-to-self-bootstrap-activation` 已把自举收敛统一为 Formal Task Finish 成功后的单一 activation，但 canonical `buildr-package-assets` 仍保留旧的 Doctor 阻塞后 pre-Finish prepare、恢复 Finish、再 publish 的要求。这会同时授权两套互斥流程，必须在交付前删除旧 authority。

## What Changes

- 删除“自举 Workspace 必须分离同步准备与发布” requirement 及三个旧 scenario。
- 将 package verification 的“两段式自举”要求改为只验证 post-Finish activation，并保留 `already-contained` 覆盖。
- 不改变实现、Result schema、Task Finish 五阶段或新 activation 的路径分类。

## Scope

- Project: `product`
- Capabilities: `buildr-package-assets`, `agent-task-workflows`
- Implementation: canonical spec correction only; current implementation and knowledge already express the new boundary.
