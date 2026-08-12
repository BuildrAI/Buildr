# 让正式收尾生成有语义的提交信息

## 一句话摘要

让 Agent 在正式 Task Finish 启动前提供有语义的交付提交信息，由产品确定性冻结并在 Delivery Carrier 与恢复路径中复用，Task ID 只作为追踪 trailer。

## 背景与问题

Task Finish 会把冻结的 Task Contribution 重新应用到最新 Delivery Baseline 并创建新的 carrier commit，因此任务分支原有提交主题不会自然保留。当前实现固定使用“交付 + Task ID”，导致近期正式交付的 Git 历史集中退化为内部标识，无法说明最终改动内容，也不符合 Buildr 已有提交信息约定。

## 目标与非目标

目标是由 Agent判断 `feat`、`fix`、scope、中文subject与可选body，产品只负责校验、规范化、加入`Buildr-Task` trailer、冻结identity并在同一run中机械复用。

非目标是不从diff或Change ID自动生成语义，不改写既有Git历史，不新增provider/store/template registry，也不处理self-bootstrap convergence commit的独立模板。

## 受影响用户或角色

- 使用正式Task Finish交付的Agent：首次run前需要明确提交信息，resume不重复提供。
- 阅读Git历史的维护者：提交主题重新表达最终内容，Task ID仍可追踪。
- 已有blocked/cleanup-pending run：升级后继续兼容恢复，不要求迁移。

## 核心流程

Agent完成Development handoff后，根据最终内容形成符合仓库约定的完整commit message并启动Task Finish。产品在任何run/carrier副作用前规范化message、拒绝空主题或“交付 + 当前Task ID”占位主题、维护`Buildr-Task` trailer并冻结identity。prepare使用该message创建Delivery Carrier；target-race、Delivery Adaptation和resume核验并复用同一identity。公开Result只投影subject与identity。

## 关键变化

- 首次`task finish run`新增必需的语义commit message输入。
- Finish current run持有唯一完整message恢复事实。
- Carrier commit和适配后HEAD必须匹配冻结message。
- 新run不再生成“交付 + Task ID”；legacy run只为既有恢复保持兼容。

## 影响、风险与兼容性

Agent仍可能提供格式合法但内容一般的主题，产品不会越界做语义推断；Skill与CLI会明确要求提交前复核。完整body只在Finish owner和Git commit中存在，其他authority不复制。已有run不backfill、不迁移，新的首次run才应用必需输入。

## 验收摘要

- 新run缺少、空白或占位message时零副作用blocked。
- Carrier commit保留Agent subject/body并包含`Buildr-Task` trailer。
- resume、target-race与Delivery Adaptation复用同一message identity。
- 公开Result不复制完整body，legacy run仍可恢复。
- Task Finish unit、integration、system、contract与受影响产品验证通过。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Finish Execution Delta](specs/task-finish-execution/spec.md)
- [Tasks](tasks.md)
