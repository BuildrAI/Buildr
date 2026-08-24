## Context

Contract audit 从 verification base 依次回放当前 candidate 新增的 archived deltas。同日目录使用字典序，因此后创建但名字更小的 `adapt-*` 会先于 `isolate-*` 回放。

## Goals / Non-Goals

**Goals:** 让最终回放状态与已经验证的 canonical Requirement 一致。

**Non-Goals:** 不修改实现、运行时行为或 audit 排序算法。

## Decisions

增加一个字典序位于 `isolate-*` 之后的完整 MODIFIED delta，内容逐字表达最终 canonical Requirement。这样不篡改既有 archive，也不为当前 Task 扩大产品实现。

## Risks / Trade-offs

- [额外 archive provenance] → Brief 明确这是同日 replay 顺序收敛，不声称新产品行为。

## Migration Plan

Deterministic converge 后由现有 contract audit 回放验证；无需运行时迁移。

## Open Questions

无。
