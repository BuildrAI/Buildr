# 收敛协调治理范围与人机界面

## 一句话摘要

Buildr 只把独立交付建模为正式 Child，只为真正的长期适用性或危险效果请求用户授权，并在 Web 中直接呈现专业 authority 派生的目标与正交结果。

## 背景与问题

前序治理重构已经把 Delivery、Activation、Cleanup、Diagnostics、Development evidence 与 Workspace health 收敛到各自专业 owner，但用户界面和 Agent guidance 仍有三类摩擦：routine Declaration maintenance 一律请求人工确认；任务概览展示技术字段而不是结果；不同页面分别解析 Markdown 文档链接。正式 Parent/Child 也需要明确排除普通协作分工。

## 目标与非目标

目标是为正式 Child 建立独立交付门槛，区分 routine Declaration maintenance 与用户决策，扩展Task Overview用户摘要，并统一具名Workspace相对Markdown引用。非目标是legacy Parent correction、terminal Task correction、自动迁移、任意文件读取、聚合store或重做已验收Parent Contribution UI。

## 受影响用户或角色

- 设定目标和做业务决定的用户：只在长期scope、capability承诺、危险效果或真实风险接受时被中断。
- 执行工作的Agent：自行完成routine维护和普通并行协作，并通过专业owner保存结果。
- 在Buildr Web查看任务的用户：先看到目标、Delivery、Activation、Cleanup、attention与必要授权，再按需展开技术事实。

## 核心流程

Agent先只读发现Declaration diff并分类；routine变化直接交给owner验证，长期适用性变化才请求精确授权。Task Overview使用一次SQLite查询读取已保存current facts并派生closed用户摘要；Web直接呈现。具名Markdown引用通过共享resolver解析到已登记Project，正文仍只由Project Document API读取。

## 关键变化

- 正式Child只代表可独立形成Candidate、evidence、Handoff与Delivery的Contribution。
- Declaration维护按语义影响分类，不再把全部内部维护交给用户。
- Task Overview新增正交用户摘要，Web不建立第二authority。
- Task、Project、Service共享Workspace相对Markdown引用解析，并区分解析与读取。
- 既有Parent Contribution四项摘要、横向进度行、Child导航和详情侧栏保持不变。

## 影响、风险与兼容性

变更涉及Product specs、workspace Skills、Buildr Task Overview read model、Buildr Web与tracked `web-dist`。无需SQLite migration；旧current facts缺失时保守显示unknown/not-applicable。任何scope、requiredness、capability、外部效果或证据冲突变化仍需用户决定。

## 验收摘要

普通协作不强制建Child；routine声明维护可由Agent完成但长期决策仍受控；Task Overview/Web分离呈现目标、Delivery、Activation、Cleanup、attention和authorization；所有文档入口共享安全解析且正文不可读不会伪装为引用非法或Task失败；既有Parent UI无回归。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Parent/Child delta](specs/parent-child-task-coordination/spec.md)
- [Declaration Intake delta](specs/project-declaration-intake/spec.md)
- [Task Overview delta](specs/task-overview-query/spec.md)
- [Buildr Web delta](specs/local-app-web-client/spec.md)
- [Tasks](tasks.md)
