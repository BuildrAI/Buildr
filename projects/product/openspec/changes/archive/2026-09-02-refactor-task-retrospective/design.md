## Context

当前Task Retrospective把Agent生成的自由Markdown、三态处置、批量查询、后续Task来源和Buildr Web工作台作为一个独立专业模块维护。真实Workspace已有167份报告，其中115份长期处于`pending`；状态与后续关系并不能可靠表达用户是否已经决定。与此同时，Task Execution、旧Finish和统一Environment数据已经删除，Buildr无法取得完整耗时、工具轨迹或Token，只能由Agent根据当前可见事实复盘。

新的真实需求是：Agent可以快速生成复盘，但人的注意力不足以立即查看和决定。复盘正文需要本地长期可见，Task需要表达这份文档是否仍等待人的决定；它们均不应随代码仓库提交。

## Goals / Non-Goals

**Goals:**

- 让Agent在用户明确要求后生成一份本机Markdown复盘，并让人可从Task详情直接查看。
- 由Task Record保存不可从代码、Git或文档重新观察的最小事实：关联文档版本及人是否已决定。
- 删除独立Retrospective Application、数据库正文、处置队列、专用关系和内部Driver。
- 保持复盘缺失、内容变化或尚未决定不影响任何Task或专业结果。
- 直接删除全部旧复盘数据，不建立历史、导出、双读或兼容转发。

**Non-Goals:**

- 不自动生成、提示、批量处理或处置复盘。
- 不采集完整会话、隐藏推理、工具日志、耗时或Token。
- 不建立行动项、经验库、报告平台、全文索引或通用文档系统。
- 不把复盘决定解释为后续改进已完成。
- 不重构Task Record的其他目标、状态、父子、结果或更正语义。

## Decisions

### 1. 复盘正文是本机文件，不是SQLite Result

每个Task使用固定派生路径：

```text
.buildr/local/task-retrospectives/<task-id>.md
```

`.buildr/local/`已经是Workspace本机数据边界并被Git忽略。Agent在用户明确授权生成复盘后写入文件；Buildr不把正文复制到SQLite、Git、发布物、Current Knowledge或Task Result。

选择固定路径而不是任意文档引用，是为了覆盖无Project的Workspace Task，并避免路径逃逸、跨Project归属和任意本地文件读取。每个Task只有一份当前本机文档，不保存版本历史；用户需要历史时由外部文件备份或另存承担。

### 2. Task Record只保存文档版本和人的决定状态

Task Record新增可空字段：

```ts
type TaskRetrospectiveDocument = {
  state: 'pending-decision' | 'decided';
  documentDigest: `sha256-${string}`;
};
```

`null`只表示当前没有登记复盘文档，不表示遗漏、失败或待办。`pending-decision`表示已登记文档仍等待人的明确决定；`decided`只表示人已经决定是否继续行动，不表示任何后续Task已经实施。

Task Record返回固定派生的`documentPath`作为只读投影，不在SQLite重复保存路径。文档生成或内容变化后，Agent以当前Task `recordDigest`登记实际文件摘要并设为`pending-decision`。只有用户明确表达已经决定后，调用方才能把同一文档版本设为`decided`。

不保留`handled|no-action`、note、disposedAt或专用关系。若用户决定继续，Agent复用或创建普通Task，并在其目标中按需引用来源Task或本机复盘路径；若决定不行动，只记录`decided`。

### 3. 文件与SQLite保持可恢复的非原子组合

Agent先原子写临时文件并替换固定Markdown，再调用Task Record更新。Application在Task Record事务前验证：Task终态、固定路径、普通文件、非符号链接、非空Markdown、固定最大体积和实际SHA-256；随后在SQLite事务内比较`recordDigest`并保存摘要与状态。

文件成功而Task更新失败时保留文件，下一次只重新核对并登记。Task状态已更新后文件被外部修改时，详情读取返回摘要漂移并把有效展示解释为“内容已变化、等待重新决定”；它不自动写SQLite，也不影响Task结果。再次登记新摘要会进入`pending-decision`。

### 4. 复用Task Record接口，不保留Retrospective Application

Task Record `update`增加三种互斥的复盘文档操作：登记当前文件、标记已决定、清除登记。全部提交当前`recordDigest`；标记已决定还提交调用方已观察的文档摘要。清除只删除Task Record关联，不删除文件。

Buildr Web通过Task Record拥有的固定只读文档接口读取Markdown。接口只接受Task ID，不接受路径、limit、maxBytes或正文写入；返回当前文件摘要、登记摘要、有效状态、内容和局部诊断。固定服务端体积上限保护浏览器和HTTP，不形成可配置批量预算。

Task查询直接读取Task-owned状态，支持`missing|pending-decision|decided|all`。删除`hasRetrospective`兼容查询。详情把复盘卡片放在“概览”，删除独立复盘Tab。

### 5. Task Record使用新的closed版本且不转发旧行为

删除`retrospectiveSourceTaskIds`并新增新的`retrospective`形状会改变closed Task Record，因此升级Task Record capability、record和公开结果版本。所有随包consumer一次升级；旧版本契约和来源参数退役，不提供空字段、转发接口或双版本运行路径。

### 6. 旧Retrospective数据直接删除

新增连续migration先删除`task_retrospective_sources`，再删除`task_retrospective_current`，并把既有Task迁入新的Task Record schema，`retrospective`统一为`null`。同一次合法本机数据升级还会安全删除可证明位于canonical Workspace内的`.buildr/asset-review/`旧目录；符号链接或归属不明时拒绝删除并返回局部诊断。历史migration保持原字节和checksum，使旧Workspace仍能顺序升级；新建数据库执行完整链后也不保留旧表。

### 7. 保留纯Skill，删除独立能力

`task-retrospective`继续作为可选内置Skill，但不再`provides buildr.task-retrospective`，只依赖当前Task Record provider。Skill指导Agent调查真实事实、写固定本机Markdown、登记文档、区分事实/推断/缺失，并在用户决定后使用普通Task。确定性流程候选只在证据充分时进入报告，不是每份报告的强制结构。

## Risks / Trade-offs

- **本机文件不会跨设备同步** → 这是与Task Record相同的明确单机边界；界面显示本机路径和可用性，不声称云端可见。
- **文件和SQLite不能形成单一原子事务** → 固定“文件先写、记录后登记”顺序，任何中断都保留可重新观察的文件；摘要漂移只形成局部提示。
- **外部直接修改文件可能使列表状态暂时陈旧** → 详情读取重新计算摘要；状态不参与门禁，Agent处理前必须重新读取文档。列表不扫描文件系统。
- **删除旧数据不可恢复** → 用户已明确授权不导出、直接删除；migration不保留legacy表。
- **Task Record版本升级影响consumer较广** → 只做复盘字段的窄breaking升级，并通过package、runtime、HTTP、CLI和DTO一致性验证；不保留旧契约转发。
- **共享MJS迁移扩大改动面** → 只迁移本Change实际保留且修改的人工源码和测试；退役文件直接删除，未触及模块不顺带转换。

## Migration Plan

1. 先调整Task Record schema、domain、repository、Application、CLI/HTTP和查询，新增本机文档登记与读取能力。
2. 更新Buildr Web概览卡片、状态过滤和安全Markdown展示，删除旧复盘Tab。
3. 更新纯Skill和全部Task Record consumer binding，退役独立复盘contract、route和package资产。
4. 删除Retrospective Domain/Application/Repository/Driver/HTTP与专属测试。
5. 新增连续SQLite migration，直接删除旧两表并迁移Task Record；不修改旧migration。
6. 收敛Current Knowledge、生成DTO和验证声明，运行旧库升级、新库初始化、focused、完整低成本、功能及浏览器验证。

## Open Questions

无。正文位置、两态语义、旧数据直接删除和不进入Git均已由用户确认。
