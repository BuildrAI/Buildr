## Context

Buildr 当前测试架构已经区分 Static、Unit、Component、Integration、System，changed planner、Candidate DAG、Candidate CI 与 publish workflow 也已有独立 owner。问题集中在最后一层治理质量：部分 contract tests 仍直接读取 Skill Markdown，断言句子、章节或先后位置；同一个稳定行为因此同时由 Application tests 和 Skill prose tests 持有，既增加维护噪音，也不能证明 alternate path 与 unrelated failure isolation。

本 Change 横跨治理 assets、Product verification registry、CI contract tests 与 release workflow contract，但不修改发布权限、数据模型或公开 Task lifecycle schema。

## Goals / Non-Goals

**Goals:**

- 让低成本测试优先证明 authority、identity、effects、公共结果与失败隔离。
- 为前序治理 Contribution 建立一个可执行的跨模块不变量集合，并复用已有最低充分 owner。
- 证明 changed/focused 不会隐式执行完整 Candidate；完整 Candidate 与正式 Release 只各承担自身主证据，并复用唯一冻结 tarball。
- 保留最终 Candidate、Release authority、OIDC、tag、npm integrity、公开 readback 和安装 smoke。

**Non-Goals:**

- 不新增通用测试平台、第二份 verification registry 或新的发布状态机。
- 不把 Skill Markdown 完全移出静态检查；frontmatter、binding、capability identity、受管投射与必要安全边界仍需验证。
- 不实现 legacy Parent correction，不修改 Parent 历史事实。
- 不通过减少 required gates、删场景或复用旧 identity evidence 来优化耗时。

## Decisions

### 1. 用结果不变量替代流程服从型 prose 断言

删除只验证 Skill 固定句子、篇幅、章节位置或命令顺序的 assertions。稳定能力选择、provider/binding、schema 与安全禁止项继续由 manifest/contract/static owner验证；可观察行为由 Domain/Application/CLI/HTTP integration测试验证。

没有选择把 Skill 全文转换成结构化 DSL：Skill 仍是 Agent 方法指导，强制结构化所有段落会建立第二个 workflow engine，并与 Core Rule 冲突。

### 2. 建立测试侧的跨模块不变量清单，但不建立新产品 authority

在 verification test code 中维护只读、不持久化的 invariant cases。每项 case 指向当前 machine-readable owner或公共结果，并至少覆盖一个 alternate path 或 unrelated failure。该清单只组织测试，不进入 Product Result、Task Result、registry schema 或 Buildr Web。

没有复制 Parent Plan 或 roadmap checklist；测试必须从当前 specs、contracts、registries 和实现取得事实。

### 3. 将开发反馈、完整 Candidate 与 Release 的拓扑分别验证

changed/focus tests断言其计划只选择 affected owner且单次 admission DAG去重；Candidate tests断言 full profile、唯一 artifact producer和每 step 单次执行；CI contract断言 shard只按真实 artifact dependency下载同一 artifact；publish contract断言只恢复/构建一次冻结 tarball并在 protected transaction前后完成 readback，不调用完整 Candidate入口。

没有把 publish 视为 Candidate 的重跑点：发布验证的目标是冻结 artifact 与不可逆公共副作用，而不是重新证明 source regression。

### 4. 性能优化只接受同 tree、同 owner 集合的证据

本 Change 优先删除重复 assertions与无价值 plan扩张，不修改最终 budget为正确性门禁。若 fixture或调度实现需要调整，必须保持primary owner集合、source/artifact identity和失败传播，并用同一 tree 的focus/affected/Candidate timing对照。

## Risks / Trade-offs

- [风险] 删除 prose 断言可能遗漏 Skill 路由回归 → 保留manifest description、capability binding、contract identity与runtime projection检查；用户可观察路径由integration owner覆盖。
- [风险] 新跨模块测试重复既有重型 journey → 只复用最低充分Application/public projection，不创建新的完整Workspace生命周期。
- [风险] changed planner优化错误地漏掉发布owner → 对verification registry、workflow和release source本身继续full-scope；对普通Skill或治理文档只选择其真实package/runtime owner。
- [风险] CI文本断言仍可能脆弱 → 优先解析YAML/registry和closed evidence set；仅对GitHub表达式无法结构化的稳定job/gate identity保留最小文本断言。

## Migration Plan

1. 先加入delta spec和新的结果不变量/拓扑测试，使旧实现的重复或脆弱路径可见。
2. 删除或改写被新owner覆盖的Skill prose assertions，并更新registry/changed-plan ownership。
3. 运行focused与affected反馈，核对owner集合、DAG去重和失败隔离。
4. 收敛并归档Change后形成冻结Task Candidate，只运行一次正式Product验证；Finish继续走现有唯一自举runner。

回滚时恢复测试与registry改动即可；不涉及数据库migration、远端发布配置变更或兼容数据写入。

## Open Questions

无。
