# 将 Task Current Records 收敛到 SQLite

## 一句话摘要

让单机版 Task Record、Development、Verification 与两个 Review current records 统一以 Workspace SQLite 为唯一持久化 authority，并完整清退不再有价值的 Task Metadata Publication。

## 背景与问题

Task Record 已进入 `.buildr/local/workspace.sqlite`，但三个专业 lifecycle Application 仍保存四个 YAML，并额外依赖 publication Skill 将它们组合进 Git。这造成双存储边界、跨 Skill capability 与用户认知成本，也与单机 Workspace 数据不经 Git 同步的产品决定冲突。

## 目标与非目标

本 Change 只增加最小 current-state schema、切换三个 repository，并在全部 consumer 完成 authority 切换后删除 Metadata Publication。旧 YAML 不迁移、不读取、不双写；Environment、Finish、Candidate carrier、日志与外部产物保持现状；不建设 history、event log、通用数据库框架、同步或 Server/Cloud 协议。

## 核心流程

各专业 Application 继续独占 closed schema、writer、digest、currentness/applicability 与业务错误；SQLite repository 只按 Task ID/Review type 事务保存完整 normalized payload。CLI、Skill、Local App、Development 与 Finish 始终通过 Application 读取。Git Operations只处理用户或其他consumer明确选择的普通Git内容。

## 关键变化

- 连续 migration 建立 Development、Verification、Review 三个窄 current-state tables。
- 四类旧 YAML 从 current runtime reader/writer中消失并保持 inert。
- 删除 Task Metadata Publication source、contract、binding、helper、package/runtime、tests、spec与文档。
- current knowledge 与讨论稿明确“同一SQLite不等于合并专业模块或共享状态机”。

## 影响、风险与兼容性

这是未正式发布产品上的有意 authority reset；旧本地 current records不会出现于新runtime。公开operation JSON的schema identity保持不变，持久化位置字符串改为SQLite logical locator。最大自举风险是旧runtime不识别新migration，因此候选Development/handoff与Finish必须遵循Task Environment及Delivery Carrier边界完成。

## 验收摘要

- 五类Task current records的唯一持久化authority均为SQLite。
- 旧YAML存在时零读取、零迁移、零双写。
- Local App与完整Task lifecycle consumers无回归。
- package/runtime/capability graph和current文档无Metadata Publication残留。
- formal Verification、runtime sync、Doctor、Change收敛与Task Finish全部完成。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Workspace Structured Store delta](specs/workspace-structured-data-store/spec.md)
- [Task Development delta](specs/task-development/spec.md)
- [Task Verification delta](specs/task-verification/spec.md)
- [Task Review delta](specs/task-review-results/spec.md)
- [Metadata Publication removal delta](specs/task-metadata-publication/spec.md)
- [OpenSpec deterministic sync delta](specs/openspec-deterministic-sync/spec.md)
- [Implementation tasks](tasks.md)
