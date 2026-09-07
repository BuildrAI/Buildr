# 最终任务系统收敛

用户得到的是一套更直接的任务系统：任务记录（Task Record）只保存长期业务事实，Buildr Web直接展示这些事实；审查、验证、父任务协调和真实交付各自独立，不再经过任务总览（Task Overview）聚合或统一流程判断。

## 本次改变

- 删除独立Task Overview应用、查询、HTTP接口、客户端和专属测试。
- Task Record删除`noChange`、反向`childTaskIds`、重复展示字段和SQLite行级`schema_version`；全部非创建写入都比较当前`recordDigest`。
- 保留`isParent`、直接`parentTaskId`、结果摘要、更正历史和复盘文档摘要；Children只查询派生。
- 删除无运行时消费者的旧贡献协调表和辅助实现。
- 统一使用父任务协调（Task Parent Coordination）术语。
- 发布、自举、Git、Worktree、Review和Verification继续使用自己的真实事实，不向Task Record写入交付或环境代理状态。

## 不在本次范围

不新增、删除或重命名任务相关技能（Skill），不调整capability provider/binding，不创建UI Prototype，也不重新设计已经完成的Review、Verification、Worktree、Retrospective或统一Task Environment退役结果。全量Skill结构另行只读审查后再决定。
