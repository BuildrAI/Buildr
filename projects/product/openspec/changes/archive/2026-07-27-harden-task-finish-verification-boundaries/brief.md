# 强化 Task Finish 验证与收尾边界

## 一句话摘要

让 Task Finish 在正式验证发现缺陷时先停下来等待用户决定，并把测试、修复、重新验证与真正收尾的耗时分别记录，同时用低成本preflight提前发现可预知回归。

## 背景与问题

最近一次“收尾”实际包含三轮正式affected、两次缺陷修复和候选重建：历史convergence receipt中的机器绝对路径，以及Task Finish Skill文案与聚焦静态契约不一致。Agent在没有与用户对齐repair范围的情况下直接修改后继续，既越过了授权边界，也把“验收—修复—重新验收—收尾”的19分多钟混称为收尾耗时。

## 目标与非目标

目标是让formal failure默认停止、repair必须有明确用户授权；将initial verification、repair、re-verification、closeout-only和端到端workflow分开计量；在完整正式保证前运行候选感知的确定性preflight；让持久化OpenSpec receipt不含机器/用户绝对路径；让compact摘要首先展示真正失败项。非目标是让Buildr自动理解或修复任意缺陷、用preflight替代affected/Candidate，或把Agent内部token推断进产品计量。

## 受影响用户或角色

- 要求“收尾”的用户：验证失败时能先看到缺陷、范围和成本，再决定是否修复。
- 执行Task Finish的Agent：获得明确的停止/继续授权边界和结构化失败摘要。
- Buildr维护者：能区分产品验证、返工和真正closeout性能，避免错误优化结论。

## 核心流程

Task Finish先执行candidate-aware preflight，再调用selected task-verification provider完成required assurance。首次正式保证失败时run停住并返回repair decision；只有用户授权后才进入repair，candidate变化通过typed recovery失效旧evidence并执行re-verification。最后一个有效assurance通过后才进入closeout-only阶段，依次完成资产审查、归档、集成推送、runtime install和cleanup。

## 关键变化

- 新增formal failure后的repair authorization边界。
- completion receipt新增verification、repair、re-verification与closeout-only阶段计量。
- 新增registry-driven低成本preflight，失败时不启动完整affected/Candidate。
- convergence receipt持久化portable executable identity。
- compact diagnostic优先展示primary failure，warning保持次级。

## 影响、风险与兼容性

旧finish run和历史receipt保持兼容读取；新写入使用扩展schema。Preflight只选择登记的低成本无共享副作用检查，不能替代正式保证。用户可明确授权“发现问题直接修复并继续”，但授权scope、candidate transition和重新验证必须留证。未知selector、语义冲突或授权扩大继续fail closed。

## 验收摘要

- 普通“收尾”遇到formal failure时不修改delivery tree并等待用户决定。
- 聚焦contract失败会在完整affected前暴露。
- 新生成tracked convergence receipt不含用户home、worktree或临时目录绝对路径。
- completion receipt分别报告initial verification、repair、re-verification、closeout-only和端到端wall-clock。
- 非零验证结果的compact摘要直接展示真实failed stage/test，而不是只显示预算warning。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/task-verification/spec.md`
- `specs/openspec-deterministic-sync/spec.md`
- `tasks.md`
