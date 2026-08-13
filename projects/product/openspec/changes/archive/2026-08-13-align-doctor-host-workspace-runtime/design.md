## Context

Doctor 实现已分别投影 npm/development installation、Host/development main runtime 与 Workspace Node。唯一漂移来自 canonical `doctor 必须只读诊断 Workspace Node toolchain` 仍包含旧 platform Product Node 分支。

## Goals / Non-Goals

**Goals:**

- 让 canonical Doctor contract 只描述当前存在的 npm Host Node、development runtime 与 Workspace Node。
- 保留只读、无 PATH 猜测、runtime role 不合并边界。

**Non-Goals:**

- 不新增 Product Node、SEA、platform installation 或新的实现分支。
- 不修改发布、Launcher 或 Workspace Node 生命周期。

## Decisions

保留原 Requirement 与三个 scenario identity，通过 MODIFIED delta 将 platform/Product Node 替换为 npm Host Node 或 development runtime；Doctor 继续只读、不得扫描 PATH、不得合并 Host 与 Workspace ownership。

## Risks / Trade-offs

- [历史平台术语仍存在] → 只保留在 archive/glossary 的未来能力说明，不进入 current Doctor contract。

## Migration Plan

1. strict validate delta。
2. deterministic converge canonical spec并归档 Change。
3. 重新生成 Task planning identity并运行 Candidate。

## Open Questions

无。

## Verification

OpenSpec strict/converge、Doctor/status tests、完整 Candidate 与 Completion Review共同证明契约和实现一致。
