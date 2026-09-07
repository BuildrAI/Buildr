# 清除已退役任务工作流的主规范残留

## Why

Task Development、Task Planning Identity与旧Task Finish规范已经删除，但收敛后的其他主规范仍有少量早期Requirement正向要求这些能力。它们与当前实现和刚建立的退役规范冲突，必须在交付前删除。

## What Changes

- 删除或改写仍正向要求Task Development、Planning Identity、Development Handoff、Task Candidate或旧Finish Application的Requirement与Scenario。
- 保留用于明确“不得恢复”的退役边界，以及旧Parent Plan一次性迁移和连续SQLite migration的历史事实。
- 发布关联不再列出self-bootstrap或旧Finish派生carrier；Product Candidate模型保持不变。

## Capabilities

### Modified Capabilities

- `agent-task-workflows`
- `bounded-buildr-web-read-execution`
- `buildr-package-assets`
- `cli-product-surface`
- `openspec-deterministic-sync`
- `product-agent-skills`
- `product-source-layout`
- `product-verification-quality`
- `public-json-contracts`
- `release-collection-model`
- `task-lifecycle-core-module-architecture`
- `task-overview-query`
- `task-record`
- `task-retrospectives`

## Impact

只修改规范和相应当前知识链接，不修改运行代码、数据、HTTP或发布候选行为。
