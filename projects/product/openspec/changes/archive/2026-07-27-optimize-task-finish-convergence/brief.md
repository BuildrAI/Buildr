# 主工作区收敛检查

一句话摘要：Task Finish 在集成和推送后，根据真实影响从 retained Workspace 运行必要的 runtime 与默认入口收敛，不重复 Candidate，也不依赖 Agent 猜路径。

## 背景与问题

任务环境已经可以独立开发、验证和集成，但主 Workspace 的 sync、doctor、默认 CLI 与 Local App 检查仍主要依赖 Agent 临时判断。结果是无影响任务也可能机械 sync，真正影响默认入口的任务又可能遗漏检查，且即将清理的 task checkout 可能继续被误用为入口来源。

## 目标与非目标

- 目标：把 retained Workspace 收敛登记为标准 finish step，按 changed paths 选择动作并保留证据。
- 目标：使用 retained checkout 的绝对 CLI 和明确 Workspace root。
- 目标：失败后只恢复本步骤和 cleanup 下游。
- 非目标：不重复完整 Candidate，不重写 CLI/Local App 安装器，不建立全局调度器。

## 核心流程

1. integration-push 通过并提供完整 changed paths。
2. 产品分类 runtime、CLI、Local App 和 unknown 影响。
3. retained doctor 始终执行；runtime 命中时才 sync 并再次 doctor。
4. CLI/Local App 命中时才交给现有 runtime-install provider；无影响返回 not-applicable。
5. 收敛证据进入 completion receipt，随后安全清理 task environment。

## 关键变化

- 新增 integration 后的 retained-convergence finish step。
- Action Registry 产品化影响判断与确定性计划。
- runtime-install 从“每次都判断”变为消费明确 impact evidence。
- retained 收敛不改变正式验证身份，也不重复 Candidate。

## 影响、风险与兼容性

旧 finish run 通过现有步骤补入逻辑兼容。changed paths 缺失时 fail closed；未知路径只披露，不自动扩大副作用。retained doctor 或 sync 失败不会回滚已成功 push，也不会重跑验证。

## 验收摘要

- 无 runtime/入口影响时只执行 doctor。
- runtime 影响时执行 doctor → sync → doctor。
- 默认入口影响只交接受影响入口。
- 缺少 retained identity 或 changed paths 时零执行并请求输入。
- resume 不重复 Candidate、integration 或 push。

## 技术入口

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `tasks.md`
