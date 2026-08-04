# task-metadata-publication Specification

## Purpose

定义一个明确 Task 的 canonical portable exact-owned-path metadata publication、snapshot/drift、Git Operations 调用、重试和失败边界。

## Requirements

### Requirement: Task Metadata Publication 必须是独立的窄生命周期能力
Buildr MUST 通过唯一 `task-metadata-publication` Skill 与 `buildr.task-metadata-publication/v1` capability 发布一个明确 Task 的 portable metadata，并 MUST required 消费 `buildr.git-operations/v1`；首版 MUST NOT 新增公共 Application、CLI、publication history 或第二个 Git executor。

#### Scenario: Agent 发现发布入口
- **WHEN** 用户或 lifecycle consumer 要求发布一个明确 Task 的 portable metadata
- **THEN** Agent MUST 只命中 `task-metadata-publication`
- **AND** MUST NOT 同时保留 `metadata-publication` 或其他同义入口

#### Scenario: publication 与其他 authority 分离
- **WHEN** publication 执行或失败
- **THEN** 它 MUST NOT 创建、修改或结束 Task Record、Environment、Development Candidate/generation/decision/handoff、Review/Verification Result、Finish evidence 或交付源码
- **AND** MUST NOT 把 metadata commit 解释为 Candidate、Finish 或 Task completion

### Requirement: publication scope 必须来自真实 writer 的 exact owned paths
Task Metadata Publication MUST只组合当前 writer contract 对同一 Task ID 声明的 portable exact owned paths，MUST NOT通过目录扫描、glob、`git add -A`、extension 或 exclusion list 推断 ownership。Task Record 的 Workspace-local structured declaration MUST贡献空 path 集合，且 MUST NOT阻塞其他 portable writer。

#### Scenario: 全部 portable records 存在
- **WHEN** `development.yml`、`verification.yml`、`reviews/planning.yml` 和 `reviews/completion.yml` 都由对应 writer 安全读取且存在
- **THEN** publication scope MUST精确包含这四个路径
- **AND** MUST为每个路径保留 owner capability identity，且不得加入 Task Record 数据库或旧 `task.yml`

#### Scenario: 部分可选 records 缺失
- **WHEN** 一个或多个 portable records 不存在
- **THEN** publication MUST只纳入实际存在的 declared paths
- **AND** MUST NOT创建占位文件、空目录、Task Record export 或默认 record

#### Scenario: 全部 declared paths 缺失且未被跟踪
- **WHEN** 当前 Task ID 下没有任何 portable declared path 存在，且 Git 当前 tree 也未跟踪这些 exact paths
- **THEN** publication MUST返回 `not-applicable` 且 Git effects 为空
- **AND** MUST保持 Task 目录、SQLite database 和 repository 不变

#### Scenario: 已跟踪的 declared path 当前缺失
- **WHEN** Git 当前 tree 跟踪一个 portable declared exact path 但该 path 在 live Workspace 中缺失
- **THEN** publication MUST把该 exact path 作为精确删除纳入 operation scope
- **AND** MUST NOT把旧 `task.yml`、数据库或同目录其他缺失/未声明内容推断为删除

#### Scenario: 禁止内容位于同一 Task 目录
- **WHEN** `.buildr/tasks/<task-id>/` 或 `.buildr/local/` 存在 `environment.json`、Task Record database、Finish、asset-review、runtime、Candidate、交付源码或其他 owner metadata
- **THEN** 这些内容 MUST NOT进入 publication scope、snapshot、commit 或 push authorization

#### Scenario: 其他 Task records 存在
- **WHEN** canonical Workspace 同时包含其他 Task 的 portable records 或 SQLite rows
- **THEN** publication MUST只处理调用方明确提供的 Task ID 及其 portable writer paths
- **AND** MUST NOT扫描、导出、暂存或提交其他 Task 的数据

### Requirement: publication 必须在 Git 写入前后核验同一 bytes snapshot
Task Metadata Publication MUST 对固定 owner/path 顺序记录 presence 与 SHA-256 bytes identity，并 MUST 在 commit 前后重新核验 live exact set 与 commit tree；任何 revision drift、path type变化或 ownership冲突 MUST fail closed。

#### Scenario: 普通文件 snapshot 稳定
- **WHEN** 所有 present paths 是普通文件、父级是普通目录且 pre/post bytes identity 一致
- **THEN** publication MUST 产生可复核的 snapshot identity
- **AND** MAY 把已选 commit operation 交给 Git Operations

#### Scenario: exact path 被占用或损坏
- **WHEN** declared path或其父级是 symlink、非普通文件/目录、越界、无法读取、writer报告损坏或多个 owner声明同一路径
- **THEN** publication MUST 在 Git 写入前返回 blocked
- **AND** MUST NOT 移动、修复、覆盖或删除现场

#### Scenario: snapshot 后 writer 更新 record
- **WHEN** 任一 declared path 在 snapshot 后发生 presence 或 bytes 变化
- **THEN** post-commit verification MUST 阻止 push并报告 drift path
- **AND** MUST 保留已实际产生的 local commit effect，不自动 reset、amend或回滚

#### Scenario: commit 含额外路径
- **WHEN** metadata commit tree diff包含 snapshot 以外的路径、删除或不同 blob bytes
- **THEN** publication MUST 将该 commit判为不合格并阻止 push

### Requirement: commit 与 push 必须是两个独立 Git Operations
Task Metadata Publication MUST 依次选择 `commit` 与 `push` 两次 Git Operation并保留两个独立 Result；commit MUST 只包含 verified present paths，push MUST 在完整 unpublished range 全部属于当前 verified publication scope 时才执行。

#### Scenario: 只 commit
- **WHEN** caller 只授权 local metadata commit
- **THEN** publication MUST 调用一次 commit operation且 MUST NOT push
- **AND** MUST 报告 local history changed、remote unchanged

#### Scenario: 只 push 已验证 commit
- **WHEN** caller明确选择一个已通过 snapshot/commit verification的 metadata commit并授权 remote/ref
- **THEN** publication MUST 在完整 range gate通过后调用一次 push operation
- **AND** MUST NOT重新 commit dirty内容

#### Scenario: commit 后 push
- **WHEN** caller授权 commit和push
- **THEN** publication MUST 先完成 commit Result和post-commit verification，再独立执行push并返回push Result
- **AND** 两次 operation MUST NOT 被表示为原子 transaction

#### Scenario: range 含 scope 外 unpublished commit
- **WHEN** destination..source完整 range含不是当前 verified publication scope的commit
- **THEN** publication/Git Operations MUST 在remote零写入状态 blocked
- **AND** MUST NOT自动扩大scope、rebase、merge、换ref或force push

#### Scenario: push rejection
- **WHEN** metadata commit成功但普通push被拒绝
- **THEN** commit Result MUST保持 succeeded，push Result MUST为 blocked
- **AND** local metadata commit MUST保留且remote MUST保持未改变

### Requirement: publication 重试必须复用内容等价的安全 commit
Task Metadata Publication MUST 在重试commit前检查是否已有未共享、scope单一且blob bytes与当前snapshot等价的metadata commit；能证明时 MUST复用而不产生重复commit，不能证明时 MUST fail closed或创建新的独立commit而不得改写共享历史。

#### Scenario: push失败后安全重试
- **WHEN** 前次local metadata commit未共享、diff只含当前exact paths且bytes与新snapshot完全等价
- **THEN** publication MUST复用该commit并直接重新进入push gate
- **AND** MUST NOT生成重复commit

#### Scenario: 等价commit已在destination
- **WHEN** destination已包含当前等价metadata commit
- **THEN** publication MUST返回 aligned/no-op且不得再次commit或push

#### Scenario: Candidate commit已经共享
- **WHEN** source上存在已共享Candidate或delivery commit
- **THEN** publication MUST把它视为冻结历史并创建独立metadata commit
- **AND** MUST NOT amend、reset、rebase或改写该commit

### Requirement: 无 Git Workspace 必须保留 local records
Task Metadata Publication MUST 支持 canonical Workspace 不在 Git repository中的情况，并 MUST 在不删除或改写records的前提下返回明确的 `local-only / not-applicable` Result。

#### Scenario: canonical Workspace 没有 Git
- **WHEN** caller明确Task与canonical Workspace但该Workspace不属于Git repository
- **THEN** publication MUST返回local-only、eligible paths和snapshot identity
- **AND** MUST NOT调用Git Operations或创建Git占位状态

### Requirement: 历史引用 diagnostic 必须由 writer 提供且不改写 record
Task Metadata Publication MUST 使用对应 writer read model取得Task/Project/Service/Change reference diagnostic，MUST NOT自行解析或修复record schema；已归档、退役或当前不可用引用在record仍安全可读时 MUST保留bytes并作为非阻塞diagnostic返回。

#### Scenario: 历史 Change 已归档
- **WHEN** Task Record writer仍能读取有效record且引用被解析为archived或retired
- **THEN** publication MUST保留并发布原record bytes
- **AND** MUST报告reference diagnostic而不得改写引用

#### Scenario: reference 当前缺失
- **WHEN** Project、Service或Change当前不可用但writer返回完整有效record与availability diagnostic
- **THEN** publication MUST把该diagnostic返回给caller且 MAY继续发布

#### Scenario: writer 无法安全读取
- **WHEN** Task/Workspace identity不匹配、record损坏、schema不支持、path occupied或writer返回blocked
- **THEN** publication MUST blocked并保持所有lifecycle records与Git状态不变
