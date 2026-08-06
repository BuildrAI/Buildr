---
schemaVersion: buildr.capability-contract/v1
id: buildr.task-asset-review
version: 1
---

# 任务资产审查

## Purpose

审查任务执行过程，识别值得长期沉淀的 Rule、Skill、contract、文档或自动化候选。

## Consumer Obligations

consumer 必须提供任务事实、实际摩擦、现有资产，以及“仅审查”和“已授权沉淀”之间的边界。

## Minimum Guarantees

provider 必须区分证据与推测，检查现有资产的所有权，避免重复建设；未经授权不得将候选正式沉淀为资产。

## Effects and Authorization

允许进行只读审查并报告候选。编辑或安装长期资产属于独立生命周期，需要另行授权。

## Result Evidence

返回已审查证据、有候选或无候选的结论、建议的 owner 和资产类型、重复性检查、置信度及下一步动作。

## Decision Points

证据不足、所有权不明确、现有资产已覆盖需求，或请求的变更会绕过正确流程改变产品语义时，必须停止沉淀。

## Allowed Variations

在保持只读审查边界的前提下，provider 可以采用组织自定义的审查准则、分类体系、评分方法和证据来源。
