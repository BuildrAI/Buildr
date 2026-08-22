# 保持候选 Sync 最终契约回放

## 一句话摘要

用排序在后的窄 delta 重申候选 self-sync 的 projection-only 最终语义，使同日 archived Change 回放与 canonical spec 一致。

## 背景与问题

实现和 canonical spec 已正确，但同日 archive 字典序让旧 delta 在兼容 delta 之后回放，正式 contract audit 因此失败。

## 目标与非目标

- 目标：修正 archive replay provenance。
- 非目标：不修改产品实现、CLI 或运行时行为。

## 核心变化与验收

归档一份完整最终 Requirement；contract audit 必须通过，且 Git 内容除 OpenSpec provenance 外不再变化。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Runtime projection delta](specs/workspace-first-runtime-projection/spec.md)
- [Tasks](tasks.md)
