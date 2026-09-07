## Context

用户需要的是：Agent在计划或完成结果值得审查时，针对当前真实对象给出可复用结论；人能查看结论并决定是否采纳。Review不是Task推进许可，也不应由Application替Agent选择审查范围。

当前v1 Result有两个问题：`inspect`接受调用方target并由Application给出`current|stale|unknown`，Task Development又读取该投影作为Planning/Completion gate；同时writer没有比较已观察版本。旧Finish association只应留在历史payload，不能继续参与Review current。

## Goals / Non-Goals

**Goals**

- Review可在没有Development、Candidate或Environment的普通active Task上独立形成。
- Agent依据Task目标与现场选择subject identity、方法和审查范围。
- Application只校验Result完整性、Task/slot身份、CAS和原子写入。
- 人、Agent、CLI和Web读取同一current Result，不派生统一推进状态。
- current v1 rows一次转换，之后只有v2读写。

**Non-Goals**

- 不保存diff、Git ref、文件清单、日志、对话、执行计划或审批。
- 不让Review决定Task完成、交付、Candidate或Parent验收。
- 不建设通用Review平台、历史表、通知或后台Agent。
- 不在本Change全面重构Task Development Candidate/decision/handoff模型。

## Decisions

### 1. 职责先于数据

人负责提出目标、业务判断、必要授权和结果验收。Agent读取Task、真实审查对象和已有Result，按`task-review` Skill使用`rg`、Git、测试、Browser、HTTP或外部系统完成审查。Project/Service拥有代码、架构、测试和业务规则。

Buildr Interface只提供`inspect`与`record`。Application验证active Task、closed Result、slot和CAS；Repository原子写SQLite。Buildr Web只展示Result并生成携带Task ID、review type和必要上下文的短指令。

### 2. Result v2只保存长期业务事实

Result保存`taskId`、`reviewType`、`subjectIdentity`、`method`、`reviewed`、`uncovered`、`findings`、`conclusion`和`completedAt`。`subjectIdentity`由Agent从真实对象或owner接口取得；Buildr不重算。Planning与Completion只表示审查语境，不是流程阶段。

结论使用`accepted|changes-requested`，只表达本次审查意见。它不等于Task ready、proceed或blocked。

不保存subject summary、适用性、revision、runner、日志、文件路径、Candidate、Handoff或gate，因为没有独立长期消费者或可从authority重新观察。

### 3. inspect不判断对象是否变化

`inspect(taskId)`只返回两个slot的current Result、`resultDigest`和观察时间。Agent要继续审查时重新读取真实subject identity并自行比较；Application不接受planning/completion target参数，也不返回applicability。

### 4. record使用当前Result digest做CAS

调用方先inspect，空slot使用`expectedCurrentDigest: "absent"`，已有slot使用其`resultDigest`。Repository在同一`BEGIN IMMEDIATE`事务内读取current、验证可解码v2、比较digest、写入并回读。冲突返回当前digest且零写入。digest仍由规范序列化Result派生，不新增revision列。

### 5. 一次迁移而非双读

新增连续migration重建`task_review_current`：`target_identity`改为`subject_identity`，v1 JSON改成v2，结论映射为新枚举，保留Task/type/method/reviewed/uncovered/findings/completedAt语义。迁移逐行验证数量、identity、query columns和JSON；非法数据整次rollback。完成后Domain只接受v2。

旧Finish association、Development Receipt中的Review gates和已归档Change保留原始字节作为历史证据；新Review reader不读取它们。

### 6. Task Development不再消费Review

Task Development module删除Review Application requires。current观察、planning、observe与freeze不调用Review；新写Receipt不形成Planning/Completion gate，`gate` action退役。Candidate只取决于自身current Task context、planning、Content Target和Change disposition；后续decision/handoff只使用Development自身事实与Current Knowledge。

这会把`buildr.task-development` capability从v3提升到v4，并一次更新默认binding、consumer依赖与随包contract。Receipt仍为v3数据schema以兼容历史值；capability版本和持久化schema版本不是同一件事。

历史Receipt与Handoff中的gates保持可读，不能被Review新Result刷新或当作current准入。

### 7. Interface与Web保持窄

CLI：

- `task review inspect <task-id>`
- `task review record ... --subject-identity ... --expected-current <absent|sha256-...>`

HTTP只保留Task详情GET；删除`POST /prompts/task-review`及其Schema/DTO/client。Web Agent action在前端形成最小指令，Agent随后读取Skill和现场。页面显示“已记录/未记录”、subject identity、method、证据和局部结论，不显示current/stale、adopted或Development gate。

## Risks / Trade-offs

- 旧自动化使用`--target-identity`或inspect target参数将失败：CLI help、Skills与测试原子切换，不保留兼容stub。
- v1 outcome改名会影响展示：migration和Web labels同批更新。
- Review不再替调用方判断stale：这是有意把可重新观察的判断交还Agent，避免第二事实源。
- Development gate删除会使旧流程测试失效：专属断言直接删除或改为“Review变化不影响Development”。

## Migration Plan

1. 增加v1→v2 SQLite migration及真实历史数据fixture。
2. 切换Review Domain/Repository/Application/CLI到v2与CAS。
3. 删除prompt HTTP/Application/DTO/client。
4. 删除Task Development Review requires、读取和gate action；保留历史decode。
5. 更新Web、Skills、canonical debt、current knowledge和测试。
6. 完成strict/preflight、migration、并发、无Development、HTTP/CLI/Web与完整受影响验证后converge/archive。

Migration失败时事务回滚，v1表和JSON保持原样。实现回退只回退代码；已成功应用的前向migration由旧版本拒绝读取，不尝试降级数据库。
