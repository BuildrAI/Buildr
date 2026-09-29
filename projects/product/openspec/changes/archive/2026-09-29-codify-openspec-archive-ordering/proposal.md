# Proposal: codify-openspec-archive-ordering

## Why

OpenSpec change 的归档（`buildr openspec converge`）时点目前没有流程规定，实际执行顺序依赖临场判断。已确认的演进教训：

1. 归档放在任务收尾才发现 delta 与主线新事实冲突时，必须回头重新开发，冲突暴露太晚。
2. 不先同步主线最新规格就归档，可能把语义冲突静默固化进主规格；且实现技能的归档授权措辞与收尾授权口径存在双头判定。
3. 2026-09-29 任务 relax-dev-node-guard-to-range 的成功顺序（提交实现 → 变基最新 dev → 补跑验证 → preflight → converge → 集成）是临场拼出的，需要固化为规范。

工具能力盘点确认现有原语足够：converge 自含重检且内部已含试归档（plan 失败零写入），preflight 提供开发信号；缺口只在流程顺序与授权措辞。

## What Changes

- `openspec-contract-guard` 新增预归档检查规则：preflight 与主规格漂移审查必须在任务工作树变基到开发主线最新提交之后、converge 之前执行；对变基前基线的 preflight 不作为归档输入。冲突按三类处理：基线陈旧重新变基、delta 失配回到 change artifacts 修订、同一 requirement 语义冲突请求用户决定。
- `openspec-contract-guard` 修改动作边界：归档授权判定委托任务收尾交付语义（收尾或明确要求归档即已授权），实现阶段自身不默认归档；converge 在变基后的任务工作树上、集成进主线之前执行。
- `buildr-development-openspec` 候选冻结序列纳入预归档检查；明确归档后的验证适用性判断（归档仅移动 change 目录与写主规格时复用候选验证结果）。
- 产品侧同步修改注入文本 `openspec-apply-sidebar.md` 与 `openspec-archive-converge.md`，并更新 `component.yml` integrity hash。

## Capabilities

### 修改的 Capabilities

- `openspec-contract-guard`: 新增预归档检查 Requirement；修改"同步与归档必须保持动作边界"补充归档授权委托与执行位置。
- `buildr-development-openspec`: 修改"OpenSpec apply 阶段批量安排验证"把预归档检查纳入候选冻结；修改"Buildr 产品候选版本必须完成隔离验证"补充归档后验证适用性场景。

## Impact

- 产品源：`services/buildr/resources/workspace/components/buildr/openspec/contributions/` 两个文件 + `component.yml` integrity。
- 不修改 CLI runtime 行为（符合本规格"OpenSpec 自举不改变 runtime 行为"边界）。
- 不修改 task-finish 技能：现有"交付成果"行已支持收尾包含规范归档。
