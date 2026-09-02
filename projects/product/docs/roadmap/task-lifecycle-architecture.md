# 任务体系架构路线图

## 当前结论

Buildr不设置统一任务研发或任务环境模块。一个正常任务由智能体（Agent）依据目标和真实现场，按需组合Worktree、OpenSpec、当前认知（Current Knowledge）、任务审查（Task Review）、任务验证（Task Verification）、Git、业务工具、Preview与任务收尾（Task Finish）。

Application只保存长期需要的业务事实，并保护具体写入的身份、版本、所有权和副作用安全；不保存可从代码、Git、文件、进程、Project配置或外部系统重新观察的事实，不给出统一`ready / blocked`决定。

## 当前职责

| 责任主体 | 当前职责 |
|---|---|
| 人 | 目标、约束、业务判断、授权和结果验收 |
| Agent | 重新观察现场，选择Skill和工具，组合开发、审查、验证、交付与善后 |
| Skill | 指导Agent的方法、检查点和局部失败处理，不成为状态机 |
| Task Record | 任务ID、目标、scope、Change引用、Parent/Child关系、顶层状态与结果 |
| Worktree | 可选的独立Git位置、分支、证据和精确删除安全 |
| Project/Service | 真实构建、依赖、代码生成和运行入口 |
| Preview及其他资源owner | 创建、登记、核验owner并释放自己的动态资源 |
| OpenSpec | Change artifacts、严格验证、语义preflight、canonical sync与archive |
| Current Knowledge | Project/Service长期认知与术语事实 |
| Task Review | 可选current审查结果，不决定其他模块能否推进 |
| Task Verification | Project测试地图和一份current任务验证报告，不代跑测试或决定完成 |
| Git与业务工具 | 代码、文件、部署、发布及外部系统的真实结果 |
| Task Finish Skill | Agent按现场组合交付、Task结果登记与具体owner善后 |

## 数据与接口

- `task_development_current`、`task_finish_current`与`task_environment_current`由连续SQLite migration直接删除，包括已有数据；不建立history、backup、summary或replacement表。
- Task Candidate、准备Plan、Environment Receipt、统一决定、研发交接和旧机器收尾记录均不再是产品事实。
- `task environment *`CLI、Environment HTTP、Buildr Web Environment页签和相关能力绑定删除，不提供兼容转发。
- Task Overview只组合Task Record、Review、Verification等当前专业事实；缺少某一专业row不影响其他事实。

## 完整使用方式

Agent按现场独立选择：

1. 普通工作直接使用已确认Workspace；需要隔离Git位置时创建matching Worktree。
2. 当前动作需要依赖或代码生成时，从Project/Service根调用真实准备入口；失败只修复或重试该动作。
3. Node、CLI、环境变量、工作目录和运行入口在使用前即时解析，不冻结成Task回执。
4. 创建Preview或其他动态资源时，由创建能力保存最小owner事实并负责释放。
5. Review、Verification、OpenSpec和交付直接使用当前工作根与各自权威事实，不要求任何环境记录。
6. 成果成立后先保持交付与Task结果，再分别清理Preview等资源和Worktree；dirty、owner不明或版本漂移时拒绝具体删除。

这些步骤不要求固定顺序，也不要求为了成功状态补造记录。

## 产品候选与发布

内部Task Candidate已经删除。产品候选或发布候选（Product/Release Candidate）仍由发布系统拥有source、generation、CI evidence、唯一tarball、tag、npm与受保护发布事务。Release Preparation直接在matching release Worktree使用冻结source和Project exact Node，不读取任务环境事实。

## 已完成阶段

- Task Record、Parent/Child、Task Review、Task Verification、Worktree、Preview与Task Retrospective形成独立责任边界。
- 任务研发、任务规划身份、旧Task Finish Application和统一Task Environment已经退役。
- 普通任务不创建环境记录；局部准备或清理失败不撤销已成立成果。

## 后续边界

只有某个长期业务事实出现不可替代的稳定消费者，并且无法从权威现场重新观察时，才考虑新增确定性Application能力。未来真实需求可以独立演进，但不得以恢复旧流程、展示历史或统一许可为由重建任务环境。
