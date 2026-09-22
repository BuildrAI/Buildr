# 父任务完成时序图的来源与边界

[打开图示](task-parent-coordination.html) · [图源](task-parent-coordination.json) · [父任务协调](../../docs/flows/task-parent-coordination.md) · [任务系统代码地图](../../code-map/task-system.md)

这张时序图（Sequence Diagram）回答：父任务（Parent Task）怎样从当前成果，经过总体验收与明确授权，安全地保存完成结果。**子任务（Child Task）全部结束只是提交条件之一；整体目标的验收与父任务（Parent Task）的完成授权仍须独立成立。**

## 四个参与方

| 参与方 | 图中的职责 |
| --- | --- |
| 人 | 决定目标、审阅实际成果，明确授权完成指定父任务（Parent Task）。 |
| 调用入口 | 智能体（Agent）通过命令行（CLI）或接口（Interface）提交；也可以由人通过 Buildr Web 表单提交。两者是可替代入口，不是“智能体操纵网页”的固定调用链。 |
| Buildr | 任务应用（Application）读取当前观察，校验完成输入，在事务（Transaction）内核对版本、直接子任务（Child Task）状态及验收覆盖，再保存结果。 |
| 任务记录 | 持有父子关系、目标、状态与已登记结果；实际代码、文档和外部成果仍由各自权威来源持有。 |

人和调用入口之间的箭头表示核对与授权交接；其余箭头概括应用（Application）调用及记录读写。图中的“通过分支”和“拒绝分支”互斥，不表示一次请求先成功再被拒绝。

## 关系依据

| 图中关系 | 当前依据 |
| --- | --- |
| 读取父任务（Parent Task）、全部直接子任务（Child Task）及同一次观察的身份 | [查询应用](../../../services/buildr/src/modules/task/application/task-query-application.ts)的 `parentContext`、`parentContextShape`；[协调应用](../../../services/buildr/src/modules/task/application/parent-coordination-application.ts)的 `inspectParentCoordination`。查询读取当前任务结果，不从状态推断实际交付。 |
| 核对总体目标和每个直接子任务（Child Task）的成果、放弃或替代处置 | [父子任务协调规范](../../../openspec/specs/parent-child-task-coordination/spec.md)、[任务管理技能](../../../services/buildr/resources/workspace/skills/buildr/task-manager/SKILL.md)；网页表单见 [ParentCompletionFields.tsx](../../../services/buildr-web/src/features/task/components/ParentCompletionFields.tsx)。 |
| 保存明确授权的出处与原意 | [完成依据模型](../../../services/buildr/src/modules/task/domain/task.ts)的 `ParentCompletion.authorization`；[输入校验](../../../services/buildr/src/modules/task/application/task-validation.ts)要求 `source` 和 `statement` 非空；[网页输入转换](../../../services/buildr-web/src/features/task/components/parentCoordination.ts)记录网页中的明确完成确认。 |
| 携带记录版本与父子观察版本提交 | [命令应用](../../../services/buildr/src/modules/task/application/task-command-application.ts)的 `completeTask`、`completedRecord`；读取的 `recordDigest` 对应提交字段 `expectedRecordDigest`，读取的 `completion.snapshotIdentity` 对应 `parentCompletion.expectedSnapshot`。 |
| 事务（Transaction）内核对，拒绝过期观察、未结束子任务（Child Task）或遗漏处置 | [命令应用](../../../services/buildr/src/modules/task/application/task-command-application.ts)的 `mutateTaskPersistence`、`assertExpectedDigest`、`completedRecord`；父记录与直接子任务（Child Task）在同一写入事务（Transaction）中重读。 |
| 成功保存父任务（Parent Task）结果，不递归修改其他任务（Task） | [命令应用](../../../services/buildr/src/modules/task/application/task-command-application.ts)保存 `status=completed` 和 `result.parentCompletion`；[领域模型](../../../services/buildr/src/modules/task/domain/task.ts)定义验收、授权、观察身份与 `recordedAt`。 |
| 网页完成入口显示验收依据和当前阻塞原因 | [TaskCompleteModal.tsx](../../../services/buildr-web/src/features/task/components/TaskCompleteModal.tsx)、[ParentCompletionFields.tsx](../../../services/buildr-web/src/features/task/components/ParentCompletionFields.tsx)和 [parentCoordination.ts](../../../services/buildr-web/src/features/task/components/parentCoordination.ts)。页面入口与命令入口共享后端完成校验。 |

## 完成请求与拒绝原因

完成请求包含 `summary`、`expectedRecordDigest` 和 `parentCompletion`。后者保存 `expectedSnapshot`、总体验收 `acceptance.summary`、逐个直接子任务（Child Task）的 `acceptance.children`，以及明确授权 `authorization`。

| 条件 | 当前处理 |
| --- | --- |
| 父记录与已观察版本不一致 | 返回 `task_record_conflict`，重读当前记录后重新判断。 |
| 父子目标、关系、范围、状态或结果变化 | 返回 `parent_completion_conflict`，重读父子观察并核对验收依据。 |
| 仍有 `todo` 或 `active` 的直接子任务（Child Task） | 返回 `parent_completion_children_open`，父任务（Parent Task）保持未完成；不自动完成或放弃子任务（Child Task）。 |
| 逐项处置未精确覆盖当前直接子任务（Child Task） | 返回 `parent_completion_children_mismatch`，补齐或修正实际处置后再提交。 |
| 缺少完成依据、授权出处或授权陈述 | 输入校验拒绝；智能体（Agent）应核对已有有效授权，必要时再取得决定。 |

## 表达边界

明确授权指向当前父任务（Parent Task）的完成动作。**同一范围内已有且未撤回的有效授权继续有效，不要求每次提交都重新询问。** 目标、范围或成果变化后，调用者重新判断原授权是否仍然适用；系统对授权字段的校验不代表它已自行验证真实对话或业务成果。

工作摘要（Work Context）中的人的答复只保存答复，不会自动执行完成；它可以成为后续判断的材料，但仍须核对当前目标、实际成果与授权，再显式调用完成动作。完成入口只保存顶层任务（Task）状态和结果，不执行 Git、交付、验证或环境清理。

嵌套父任务（Parent Task）按层独立验收与授权；本图只展开一个父任务（Parent Task）及其直接子任务（Child Task）的完成边界。日常分工、接续与范围调整由智能体（Agent）结合当前现场判断，本图不是自动调度链，也没有新增状态机（State Machine）。

## 生成与检查

图源采用 Archify 时序格式，由 `deliver` 命令生成独立 HTML；布局为 1080×690，包含四个参与方和 14 条消息。图源与生成结果通过 9 项展示质量检查，构图错误和警告均为 0。实际页面的明暗主题、桌面尺寸、内嵌阅读和交互仍需以浏览器验收为准，结构检查不代替视觉检查或任务完成行为测试。
