# 发布前完整演练与统一候选环境准备

## 一句话摘要

把完整多平台候选验证前移到正式发布集合之外，支持任务先针对精确预期发布树反复演练到全绿，再一次性提升并运行最终候选版确认。

## 背景与问题

当前正式发布集合冻结后才首次经历干净检出、macOS、Windows、宿主 Node、唯一产物和全部候选分片。各作业又分别拼装依赖与生成物准备，导致本地温环境无法暴露跨作业缺口，正式发布集合因此被多次重新打开。

## 目标与非目标

- 目标：建立无公开副作用的发布演练、精确预期发布树、全绿提升门禁和统一候选环境准备。
- 目标：演练与最终候选版复用同一验证图，最终发布阶段只做一次确认。
- 非目标：不改变 npm、标签、GitHub Release 或 Environment 审批边界，不取消最终候选版验证。

## 受影响用户或角色

- Buildr 维护者：在支持任务内集中发现并修复完整发布问题。
- 发布智能体（Release Agent）：只在全绿演练后改变正式发布集合。

## 核心流程

支持提交先留在 `dev` 或支持分支；演练所有者从 current frozen release 加有序待选提交形成临时 prospective source，使用同一 Candidate workflow 跑完全平台。失败继续回到支持任务；全绿后显式提升 exact rehearsal commit/tree，运行一次 final Candidate，再进入既有 `main` 与发布授权流程。

## 关键变化

- 新增发布演练（Release Rehearsal）及可提升证据。
- 新增候选环境准备（Candidate Environment Preparation）闭合档位。
- 新增 `promote-rehearsal` 门禁，替代失败候选后的反复 reopen/update/freeze。
- Candidate evidence 增加 purpose、source tree 与 rehearsal identity。

## 影响、风险与兼容性

演练成本接近完整候选版，但只在支持提交准备进入发布集合前运行。临时 carrier 必须由 owner 精确清理。既有已冻结 release 历史保持有效；未公开的失败 Candidate 不复用。

## 验收摘要

- 干净 macOS、Windows、宿主 Node、唯一产物和全部候选分片在正式选择前全绿。
- workflow 不再自行拼装候选依赖、DTO、Test Context 或 `web-dist`。
- 未全绿演练无法改变正式 release refs；全绿提升后正式 commit/tree 与演练一致。

## 技术产物入口

- `design.md`
- `specs/release-collection-model/spec.md`
- `specs/product-verification-quality/spec.md`
- `specs/open-source-release-governance/spec.md`
