## Context

P0.1 至 P0.5 已交付四类 portable Task records：Task Record、Development Receipt、Verification Result、Planning/Completion Review Result；每类都有唯一 writer、closed schema、canonical path 和原子写入。Task Environment 的 `environment.json`、Task Finish run、asset-review、mutations、worktree 与 runtime 均是本机或控制状态。P0.6 已交付 Skill-only Git Operations，负责 consumer 已选定的单次 commit/push，但不决定 publication scope。

P0.7 要补的是两层之间的薄边界：writer 声明哪些 exact paths 可发布，Metadata Publication 对这些 bytes 建立同一时刻 snapshot，并把已选 commit/push 分别交给 Git Operations。它不得成为第二个 record parser、Git executor、Candidate/Finish authority 或 publication history store。

## Goals / Non-Goals

**Goals:**

- 只发布 canonical Workspace 中一个明确 Task 的五个 portable exact paths；可选记录缺失时不创建占位。
- 由各真实 writer contract 声明 owner/path/portable eligibility；publication 只组合声明，不扫描目录或猜测 schema。
- 在 Git 写入前后证明 exact file set 与 bytes identity 没有漂移，避免跨时刻混合 snapshot。
- commit 与 push 分别调用 Git Operations，保留两个独立 Result、完整 range gate 与部分失败事实。
- 支持无 Git 的 local-only 结果、push rejection 后复用内容等价 commit，以及退役引用的最小 diagnostic。

**Non-Goals:**

- 不增加公共 Application、CLI、数据库、registry、scheduler、daemon、锁、租约、CAS、跨文件事务或 publication history。
- 不发布 Environment、Finish、asset-review、mutations、worktree/runtime、Candidate、交付源码、其他 Task 或其他 owner metadata。
- 不 amend 已共享 Candidate commit，不自动 stash/reset/rebase/merge/force push，不建设第二套 Git Receipt/executor。
- 不实现 Task Board、Retrospective、P0.8 Finish effects 或批量 Workspace publication。

## Decisions

### 1. 唯一 Skill + contract + 无状态 helper

新增 `task-metadata-publication`，提供 `buildr.task-metadata-publication/v1`，required 依赖 `buildr.git-operations/v1`。Skill 负责从用户/consumer 取得 canonical Workspace、Task ID、repository、source/target ref、remote 和允许的 commit/push effects，并按 writer declaration 组合 publication scope。

随 Skill 发布一个确定性 `scripts/publication.mjs`，只做 preflight/snapshot/verify/equivalent-commit/range evidence，不执行 `git add`、`git commit` 或 `git push`。helper 通过 stdout 返回无状态 JSON token/result，不写 publication receipt/history。这样既能把 bytes/race 检查固化，又不会新增公共 Application/CLI 或第二个 Git executor。

备选方案是公共 `buildr task metadata publish` Application/CLI，但首版没有共享人类客户端、独立数据模型或产品 writer 需求，会扩大公共 API 和重复 Git orchestration，因此拒绝。

### 2. writer contract 是 ownership authority

四个 writer capability contracts 增加 portable publication declaration：

| owner | exact path |
|---|---|
| `buildr.task-record/v1` | `.buildr/tasks/<task-id>/task.yml` |
| `buildr.task-development/v1` | `.buildr/tasks/<task-id>/development.yml` |
| `buildr.task-verification/v3` | `.buildr/tasks/<task-id>/verification.yml` |
| `buildr.task-review/v1` | `.buildr/tasks/<task-id>/reviews/planning.yml`、`completion.yml` |

publication Skill/helper 内的只读 declaration table 必须与这些 contracts 完全一致，package/static tests 负责防漂移。publisher 不解析 YAML/JSON schema；Task identity、record validity、reference availability 等由对应 writer read model 判断。`environment.json` 没有 portable declaration，所以不是“已声明但被过滤”，而是从未进入 eligible set。

备选方案是扫描 `.buildr/tasks/<task-id>` 或使用 glob/exclusion list，无法证明新 sibling 的 owner，会随未来模块静默扩大 scope，因此拒绝。

### 3. snapshot token 绑定 presence 与 bytes

preflight 只接受合法 Task ID、canonical 非 linked-worktree Workspace 和真实 repository containment。对声明中的每个 path，helper 逐级 `lstat`：存在项必须是普通文件、所有父级必须是普通目录、不得为 symlink；缺失可选项记录为 absent，不创建文件。Task 目录/精确 path 被占用、逃逸或 ownership declaration 冲突时 fail closed。

token 按固定 owner/path 顺序记录 `present|absent`、size、SHA-256 bytes、repository/Workspace/Task identity 和 ref inputs，并计算整体 digest。Git Operations commit 后，helper 对 live paths 与 commit tree 同时复核 token：任何 presence/bytes 变化、额外 commit path、symlink/corruption 或 repository/ref drift 都阻止 push。已经产生但未通过 post-commit verification 的 local commit保留为实际 effect，不自动回滚。

### 4. Git Operations 分两次调用

`commit` 调用只被授权精确 present paths和新的 metadata-only commit；禁止 `git add -A`，保留所有 scope 外 staged/dirty/untracked。Metadata commit 不与 Candidate/delivery commit 混合，也不 amend 已共享 commit。post-commit verification 成功后才允许 `push` 调用。

`push` 前由 helper 标注内容等价的 publication commits，Git Operations 再核验 destination 与完整 unpublished range；range 中任何不属于当前 verified publication commit 的 commit 都 blocked。commit 成功而 push 失败时，两个 Result 分别保留，local commit 不回滚。

备选方案是一个“commit+push”黑盒动作，但会丢失部分失败与安全重试边界，因此拒绝。

### 5. 等价 commit 重试与 no-op

重试先观察 destination..source range：若存在一个未共享 commit，其 diff 只包含当前 present exact paths、blob bytes 与当前 snapshot 完全相同且没有删除/额外路径，则复用该 commit，不再创建重复提交；如果等价 commit 已在 destination，返回 aligned/no-op。无法证明未共享、内容等价或 scope 单一时不 amend、不复用。

已共享 Candidate/delivery commit一律冻结。Metadata Publication 只创建新的独立 metadata commit；未来 record 变化再创建新 commit。

### 6. reference diagnostic 不改写历史

publication 先调用 Task Record writer read model取得 reference diagnostics。Project/Service/Change 已归档、退役或当前不可用但 record bytes 仍可由 writer 安全读取时，保留历史 bytes并在 Result 中报告 diagnostic，不改写记录，也不阻塞 publication。Task/Workspace identity 不匹配、record 损坏、不支持 schema、path occupied 或 writer 无法安全读取时 blocked。其他专业记录同样只接受各 writer 的读取结论，publisher 不自行修复。

### 7. 无 Git 与失败保持 lifecycle 不变

canonical Workspace 不在 Git repository 时，helper 返回 `local-only / not-applicable`、当前 eligible paths 和 snapshot identity，不调用 Git Operations，records 原样保留。任何 publication blocked/partial failure 都不得调用 Task Manager terminal mutation，也不得改变 Development Candidate/generation/decision/handoff、Verification/Review Result 或 Finish evidence。

## Risks / Trade-offs

- [Skill orchestration 依赖 Agent 正确保留两个 Git Result] → contract 明确最小输入、顺序、snapshot token 和 Result；System fixtures覆盖 commit、push、部分失败与重试。
- [contract 文本与 helper declaration table 漂移] → package static validation 与 focused test逐项比较 capability/version/path/eligibility。
- [writer 在 snapshot 与 commit 间更新] → commit 后同时比较 live bytes 与 commit blobs；不通过则保留 local effect但禁止 push。
- [scope 外 staged 内容让单次 commit难以隔离] → Git Operations 按既有 contract fail closed，不清理用户 index。
- [首版无持久 publication history] → 通过 Git commit/range和每次无状态 Result恢复；若未来需要跨会话 workflow state，另建窄 Change，不预设数据库/Receipt。

## Migration Plan

1. 新增 writer declarations、新 capability contract、Skill/helper、package assets与 tests，不修改现有 writer schema或 bytes。
2. 更新 workspace baseline、bootstrap/current docs与 capability binding；不创建同义入口，不恢复 P0.6 predecessor。
3. 在任务环境中完成 focused/affected/full Candidate验证并形成 Development handoff。
4. Task Finish 集成候选后，从 retained Product source sync Codex runtime并运行 Doctor；此时新入口与 binding 才正式生效。
5. 若激活前验证失败，保留现有 writers/Git Operations与 binding不变；新 capability尚未进入 retained runtime，无需数据回滚。

## Open Questions

无。第一版 deliberately 不引入公共 CLI、持久 history或通用 transaction；后续记录类型必须由其 owner在独立 Change中显式加入 declaration。
