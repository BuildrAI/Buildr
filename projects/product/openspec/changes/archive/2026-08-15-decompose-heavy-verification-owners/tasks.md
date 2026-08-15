## 1. 性能基线与 Owner 拓扑

- [x] 1.1 固化声明、OpenSpec、Runtime、数据存储、Task Environment、Worktree、Task Finish 与公共 JSON 代表路径的拆分前 affected owner和调度成本基线
- [x] 1.2 将 Integration 按 Task、声明、OpenSpec、验证编排、Runtime、发布与数据存储拆成互斥 primary slices，并让 general exclusions只从统一registry派生
- [x] 1.3 拆分 Verification System 的 planner/编排、公共 JSON、OpenSpec audit，拆分 Workspace System 的 Project/Service、Task lifecycle、Worktree及Task Finish CLI/Product Journey
- [x] 1.4 将新增 owner接入本地Candidate profile与既有Candidate CI shards，保持runner、phase、artifact、Windows平台owner和gate拓扑

## 2. 选择、覆盖与开发反馈

- [x] 2.1 更新registry/owner union contract，证明Integration/System文件无遗漏、无重复且primary owner唯一
- [x] 2.2 更新changed planner代表路径测试，证明直接领域owner存在、无关sibling重型owner消失，并记录拆分后owner数量与调度成本
- [x] 2.3 更新Candidate/CI coverage契约，证明新增required owner全部进入原适用shard且稳定平台重复不变
- [x] 2.4 运行Fast与窄verification admission canary，在任何重型focused采样前修复registry/admission错误

## 3. 计时与预算

- [x] 3.1 对新增或显著改变的Integration/System owner在同一tree运行至少两轮focused成功采样，记录中位数、波动与文件union
- [x] 3.2 逐项处置任务二13条budget warning，区分结构拆分与完整生命周期独立校准，不使用统一倍增
- [x] 3.3 对比拆分前后代表affected plan，确认日常开发直接重型owner收窄、调度成本变化有解释且Candidate覆盖不减

## 4. 知识与归档就绪

- [x] 4.1 更新验证所有权文档与Buildr Service当前认知，记录领域owner适用场景、性能基线和13条warning的辅助结论
- [x] 4.2 完成current knowledge/terminology reconcile，并通过OpenSpec strict、convergence preflight与planning identity readiness
