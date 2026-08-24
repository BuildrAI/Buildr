# 父任务贡献项动态迁移进度视图

一句话摘要：父任务页面把稳定计划与真实子任务、贡献绑定及贡献交接动态组合为中文迁移进度视图，不把执行进度写回父任务计划。

## 背景与问题

当前父任务按计划优先级展示贡献项，实际子任务、交付证明和等待依赖分散，用户难以快速判断正在推进、可以启动和仍被阻塞的工作。页面还混用 Parent、Child、Contribution、Planning Review 等英文术语。

## 目标与非目标

目标是按“进行中 / 已交付”“可启动”“等待依赖”分组，展示可导航的真实子任务及中文状态，并只用 Contribution Handoff 证明交付和生成交付摘要。非目标是改变 Parent Plan、Parent/Child relation、Development、Review、Verification、Finish 或增加进度存储。

## 受影响角色

- 协调父任务的用户：可直接识别实际迁移状态、阻塞依赖和下一步。
- 执行子任务的用户：可从父任务进入标准子任务详情，仍按独立任务生命周期工作。

## 核心流程

用户打开父任务概览后，页面读取 Parent Coordination v3，按 Contribution binding 与 eligibility 分组；有关联子任务时显示其标题、任务编号、中文状态与详情链接；只有匹配交接存在时才显示已交付、剩余、取代及下一步，否则即使子任务已完成也显示“交付未证明”。

## 关键变化

- 贡献项从计划优先级列表改为动态迁移状态分组。
- 实际子任务可从父任务直接进入既有任务详情路由。
- 用户可见业务术语和状态统一为中文。
- 等待项直接显示具体依赖和阻塞原因。

## 影响、风险与兼容性

变更仅影响 `buildr-web` 只读展示与测试，复用既有 API 和路由。旧数据缺少交接时采用保守的“交付未证明”展示；不迁移数据、不新增 writer，回滚前端即可恢复原界面。

## 验收摘要

- 三个分组顺序、互斥归类和中文文案正确。
- 实际子任务标题和操作均可进入标准子任务详情。
- Child `completed` 不替代 Contribution Handoff。
- 交付摘要、依赖和阻塞原因来自当前 read model。
- 普通进度刷新不写 Parent Plan，也不影响规划审查 currentness。

## 技术 artifacts

- [proposal.md](proposal.md)
- [design.md](design.md)
- [delta spec](specs/local-app-web-client/spec.md)
- [tasks.md](tasks.md)
