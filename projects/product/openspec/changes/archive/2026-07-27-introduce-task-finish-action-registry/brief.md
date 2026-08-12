# 引入 Task Finish Action Registry

## 一句话摘要

让 Buildr 产品持有标准收尾动作的执行事实：能确定的动作直接执行，语义 provider 按登记契约交接，只有登记外行为才由 Agent重新推理。

## 背景与问题

Task Finish 已有持久化状态机和 safe executor，但 Agent仍要猜测命令、参数、cwd、结果断言和 evidence 映射后传入 `--execution-plans`。真实收尾因此出现错误命令、路径修正、重复帮助查询和大量不可观察编排间隔。

## 目标与非目标

目标是用版本化 action registry 覆盖全部标准 finish steps，自动生成确定性计划和 fingerprint，并为语义步骤返回精确 provider handoff；registry 未覆盖、输入不能唯一解析或出现语义分支时，才返回 Agent reasoning fallback。非目标是把 Git 冲突、知识判断、repair 授权或删除决策伪装成 shell 自动化，也不新建第二套 finish 状态。

## 受影响用户或角色

- 要求“收尾”的用户：减少等待与试错，并能看清哪些动作由产品执行、哪些需要语义处理。
- 执行 Task Finish 的 Agent：不再为标准步骤猜命令，只在结构化 fallback 时推理。
- Buildr 维护者：可用 registry coverage 和 completion metrics 持续下沉稳定动作。

## 核心流程

`task finish run` 读取 checkpoint，使用当前 run identity 和 action context 解析 registry。`product-executable` entry 生成受控 execution plan并沿用现有 executor；`agent-provider` entry 返回 capability/action/evidence handoff；缺少输入返回明确字段；只有 registry miss、匹配歧义或登记外语义分支返回 `agent-reasoning-required`。

## 关键变化

- 新增版本化 Task Finish action registry 与全 step 完整性门禁。
- 新增 `task finish actions` 只读查询。
- `task finish run` 默认使用 registry，显式 plans 只作兼容/恢复入口。
- evidence 和 summary 标记 `registry` 或 `caller-supplied` 来源。

## 影响、风险与兼容性

现有 finish run schema、attempt、lease、recovery 和 receipt 保持兼容。初期部分语义步骤仍由 Agent调用登记 provider，因此不会一次消除全部编排时间；但这些步骤不再依赖命令猜测，并能按真实 metrics 逐项升级为产品 executor。

## 验收摘要

- 全部标准 steps 有唯一 registry entry。
- registry-ready 动作无需调用方 execution plans/fingerprints即可执行。
- provider handoff、输入缺口和真正 Agent fallback 可明确区分。
- actions 查询不修改 run。
- 历史 caller plan 路径继续可用且来源可辨识。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `tasks.md`
