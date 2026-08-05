## Context

Task Record 已使用 Workspace Structured Store；三个专业 lifecycle Application 仍通过 File Store repository 保存四个 YAML current records，并由 Metadata Publication 组合 exact paths 交给 Git Operations。这个结构同时存在本机数据库 authority 与 portable metadata authority，增加了 package、binding、runtime、consumer 和文档成本。

本次变化跨越 SQLite schema、三个 repository、composition root、Local App consumer 与 builtin capability 清退，但不改变各 Domain 对 closed schema、currentness、applicability、Candidate 或 handoff 的所有权。

### Authority / consumer / read / write 审计矩阵

| Current fact / capability | Domain / 唯一 writer | Repository / write | Readers / consumers | 切换结论 |
| --- | --- | --- | --- | --- |
| Task Record | Task Record Application | SQLite `tasks` 与scope tables | Task Skills、Development、Local App、Environment | 已是SQLite authority，保持现状 |
| Development Receipt | Task Development Application | filesystem `development.yml` | Development inspect、Local App、Finish handoff/carrier | repository切SQLite；Finish继续只读Application port |
| Verification Result | Task Verification Application | filesystem `verification.yml` | Verification CLI/Skill/Local App、Development gates | repository切SQLite；applicability仍由Application派生 |
| Planning Review Result | Task Review Application | filesystem `reviews/planning.yml` | Review CLI/Skill/Local App、Development planning gate | 与completion共享repository但保持独立slot |
| Completion Review Result | Task Review Application | filesystem `reviews/completion.yml` | Review CLI/Skill/Local App、Development completion gate | 与planning互不覆盖 |
| Metadata Publication | publication helper组合writer declarations；Git Operations执行commit/push | 无自身current record | task-metadata-publication Skill | 四类portable paths是唯一直接依赖；切换完成后整体删除 |
| Environment Receipt | Task Environment Application | 本机environment store | Development、环境管理 | 与current-record authority无直接耦合，保持现状 |
| Finish run/result | Task Finish Application | 本机Finish store / Delivery Carrier | Finish与诊断 | 只消费Development handoff port，保持现状 |

静态调用链审计确认：Local App server经`inspectTaskDevelopment`、`inspectTaskVerification`、`inspectTaskReview`读取；Development经同一Review/Verification Applications消费结果；Finish经`assertTaskDevelopmentCarrier`消费handoff。除三个filesystem repository及Metadata Publication helper/contract/tests外，current source中未发现直接打开上述四个YAML的consumer。

## Goals / Non-Goals

**Goals:**

- SQLite 成为五类 Task current records 的唯一持久化 authority。
- 通过最小窄表、外键和事务保证每个专业 current slot 的完整替换。
- 保持 Application、CLI、Skill、Local App、Development consumer 与 Finish consumer 的现有分层和公共 JSON identity。
- authority 切换完成后完整删除 Metadata Publication 及其 capability graph/runtime 痕迹。

**Non-Goals:**

- 不迁移、读取、删除或生成旧 YAML。
- 不保存历史、event、audit log、revision、CAS、lease、lock、scheduler 或同步状态。
- 不改造 Environment、Finish、Candidate carrier、日志和外部工具产物。
- 不设计 Buildr Server/Cloud schema、API 或本地数据库同步。

## Decisions

### 0. 完整 capability 清退使用 expected-absent convergence

Metadata Publication 的 canonical capability 只有本次要删除的 Requirements。原 convergence 能删除单个 Requirement，却会把“全部删除”投影为空 spec，无法通过 strict validation。由于这直接阻塞同一 authority 清退，本 Change 窄化补齐 convergence：plan/receipt 显式记录 before/expected existence，隔离投影先删除目标，canonical applier 原子删除并在批次失败时恢复 before bytes，observer 以“文件不存在”确认 expected state。不引入通用文件删除入口，也不改变仍有 Requirements 的 capability 行为。

### 1. 使用三个窄 current-state 表和完整 closed JSON payload

新增连续 migration，建立：

- `task_development_current(task_id PRIMARY KEY, record_json)`
- `task_verification_current(task_id PRIMARY KEY, result_json)`
- `task_review_current(task_id, review_type, result_json, PRIMARY KEY(task_id, review_type))`

三个表的 `task_id` 均外键指向 `tasks(task_id)` 并级联删除；`review_type` 只允许 `planning|completion`。payload 保存由对应 Domain normalize 后的完整 closed value。这样无需把专业业务字段复制成 SQL schema，也不会让 repository 或查询层接管 currentness/applicability。

没有选择通用 metadata key/value table，也没有预建字段化查询模型：当前真实读取全部按 Task ID 和 Review type 定位整值，外键、主键和 SQLite 自动索引已经覆盖需求。

### 2. repository 独占 SQLite I/O，Application 保持专业 authority

三个 filesystem repository 替换为 sqlite repository。Application 在 mutation 前完成 Task、Environment、target 和 closed schema 判断；repository 只接受完整 normalized value，以 `BEGIN IMMEDIATE`、upsert、写后读取验证和 commit 完成整值替换。任一阶段失败 rollback，原 current row 保持有效。

read/inspect 只通过 repository 取 payload，再由 Domain normalize 并由 Application 派生 digest/currentness/applicability。CLI、Skill、Local App、Development 与 Finish 不打开数据库、不执行 SQL。

### 3. 旧 YAML 完全 inert

新 repository 不包含 YAML fallback、导入器或兼容写入。旧文件存在、损坏或内容冲突均不影响 SQLite current record。产品未正式发布，因此这是一项明确的 prerelease authority reset，而不是迁移流程。

### 4. 保持公开 JSON schema identity，存储位置改为 logical locator

现有 operation result 中的 `path`/`file` 字符串继续保留，以避免无关的公开 schema major 升级；其值改为稳定的 `workspace-sqlite:task-development/<task-id>`、`workspace-sqlite:task-verification/<task-id>` 或 `workspace-sqlite:task-review/<task-id>/<review-type>` logical locator。它不表示可直接打开的文件，也不泄露数据库绝对路径。

### 5. authority 切换后原子清退 Metadata Publication 产品能力

在三个 repository、consumer 和回归验证先完成后，删除 Skill、contract、provider/binding、helper、package declarations、runtime source、专项 tests 和 canonical spec；同步修改 Git Operations consumer 路由及所有 current 产品描述。历史 archived Changes 保留原文。

## Risks / Trade-offs

- [旧 CLI 无法读取更新后的 schema] → 在隔离 Task Environment 中完成候选验证和 handoff；按 Task Finish 的 candidate/runtime 边界完成集成，retained runtime 只在集成后同步。
- [JSON payload 损坏或未知字段] → 每次 read/write 都通过现有 Domain closed normalization fail closed，Doctor 继续负责 SQLite migration/integrity 健康。
- [删除 publication 后留下 capability consumer] → package/static validation 和 Doctor capability graph 同时断言 provider、binding、requirement 与 runtime projection 均不存在。
- [事务内写后验证失败] → 验证发生在 commit 前并 rollback；不采用 filesystem rename/backup 语义。

## Migration Plan

1. 增加不可变连续 migration 与 schema/upgrade tests。
2. 引入三个 sqlite repository，并切换 composition root；验证旧 YAML inert。
3. 验证 Local App、Development、Candidate、handoff 与 Finish consumer。
4. 删除 Metadata Publication 全部 current source/contract/package/spec/tests/docs，并验证 capability graph。
5. 运行正式 Verification，收敛 current knowledge/specs，完成 runtime sync、Doctor、Finish 与 Task cleanup。

回滚只通过恢复本次源码/迁移候选实现；不修改已应用 migration bytes，也不尝试从旧 YAML 恢复数据。

## Open Questions

无。Server/Cloud 协作模型明确留给后续独立任务。
