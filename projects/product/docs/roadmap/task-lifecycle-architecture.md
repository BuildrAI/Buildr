# 任务体系架构路线图

## 当前结论

Buildr不再设置独立任务研发（Task Development）模块。一个正常任务由智能体（Agent）依据目标和真实现场，按需组合任务环境（Task Environment）、OpenSpec、当前认知（Current Knowledge）、任务审查（Task Review）、任务验证（Task Verification）、Git、业务工具与任务收尾（Task Finish）Skill完成。

Application只保存长期需要的业务事实，并保护具体写入的身份、版本、所有权和副作用安全；不保存可从代码、Git、文件、环境或外部系统重新观察的研发摘要，不给出统一`proceed / blocked`决定。

## 当前职责

| 责任主体 | 当前职责 |
|---|---|
| 人 | 目标、约束、业务判断、授权和结果验收 |
| Agent | 理解目标，重新观察现场，选择Skill和工具，组合开发、审查、验证、交付与善后 |
| Skill | 指导Agent的方法、检查点和局部失败处理，不成为状态机 |
| Task Record | 任务ID、目标、scope、Change引用、Parent/Child关系、顶层状态与结果 |
| Task Environment | 执行根、Preparation、Runtime、动态资源、恢复与安全清理 |
| OpenSpec | Change artifacts、严格验证、语义preflight、canonical sync与archive |
| Current Knowledge | Project/Service长期认知与术语事实 |
| Task Review | 两个可选current审查结果，不决定其他模块能否推进 |
| Task Verification | Project测试地图和一份current任务验证报告，不代跑测试或决定完成 |
| Git与业务工具 | 代码、文件、部署、发布及外部系统的真实结果 |
| Task Finish Skill | Agent按现场组合交付、Task结果登记与资源善后，不创建交付运行数据库 |

## 数据与接口

- `task_development_current`与`task_finish_current`由连续SQLite migration直接删除，包括已有数据；不建立history、backup、summary或replacement表。
- Task Candidate、候选代次、Content Target快照、统一决定、研发交接和旧机器收尾记录均不再是产品事实。
- 任务规划身份（Task Planning Identity）Application和内部route删除。Planning Review直接使用当前OpenSpec artifacts或专业接口已经返回的稳定identity。
- `GET /tasks/:taskId/development`、`task finish inspect`、`task delivery inspect`、研发页签及旧交付历史展示删除，不提供兼容转发。
- Task Overview只组合Task Record、Review、Verification和Environment；缺少某一专业row不影响其他事实。
- 旧Parent Plan已一次迁入`tasks.legacy_parent_plan_json`，只由Task Record/Parent Coordination读取，不回到研发模块。

## 完整使用方式

1. Agent读取Task目标、scope和当前现场；需要受管执行资源时准备或恢复Task Environment。
2. 有OpenSpec Change时直接维护proposal、design、delta specs、tasks、Brief和当前认知，通过strict validation与semantic preflight后实施并converge/archive。
3. Agent直接修改代码、文档或配置，并使用项目现有工具取得开发反馈。
4. 需要审查时，Agent对当前方案或完成结果执行Task Review；需要正式验证时，依据Project测试地图运行真实检查并记录Task Verification。
5. 交付时重新核对Git、文件、部署或外部系统结果；用Task Record保存已有任务的真实结果。
6. Task Environment按当前ownership、源版本、未保存内容和保留引用执行安全清理。局部清理失败不撤销已交付成果。

这些步骤由Agent按目标动态组合，不要求每个任务按固定顺序经过所有专业能力。

## 产品候选与发布

内部Task Candidate已经删除。产品候选或发布候选（Product/Release Candidate）仍由发布系统拥有source、generation、CI evidence、唯一tarball、tag、npm与受保护发布事务；本轮只解除它对旧任务研发和旧收尾证据角色的引用，不重构候选模型。

后续发布体系重构必须作为独立目标重新调查和授权。

## 已完成阶段

- Task Record、Parent/Child、Task Review、Task Verification、Task Environment与Task Retrospective已形成独立责任边界。
- 任务入口、总览、终态展示、Buildr Web和父子历史已退出研发聚合依赖。
- 任务研发、任务规划身份、旧Task Finish Application、专属接口、Web页签、测试组和两张current表已经退役。

## 后续边界

只有某个长期业务事实出现不可替代的稳定消费者，并且无法从权威现场重新观察时，才考虑新增确定性Application能力。不得以恢复旧流程、兼容已删除接口或展示历史为由重建研发聚合模块。
