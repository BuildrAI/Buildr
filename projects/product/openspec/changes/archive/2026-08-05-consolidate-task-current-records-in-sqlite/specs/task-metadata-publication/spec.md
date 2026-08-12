## REMOVED Requirements

### Requirement: Task Metadata Publication 必须是独立的窄生命周期能力
**Reason**: Task current records 已全部收敛为不参与Git或同步的Workspace SQLite本地事实，独立publication lifecycle不再有产品价值。

**Migration**: 删除Skill、contract、provider/binding、helper、package/runtime、tests与current文档；不提供替代route。

### Requirement: publication scope 必须来自真实 writer 的 exact owned paths
**Reason**: 专业writers不再声明portable paths，current records只存在于SQLite。

**Migration**: Git Operations仅处理用户或其他consumer明确选择的普通Git内容。

### Requirement: publication 必须在 Git 写入前后核验同一 bytes snapshot
**Reason**: 不再存在Task metadata Git publication operation。

**Migration**: 无；删除对应helper与tests。

### Requirement: commit 与 push 必须是两个独立 Git Operations
**Reason**: Task metadata不再触发commit或push。

**Migration**: Git Operations自身的commit/push边界保持不变，但删除该consumer。

### Requirement: publication 重试必须复用内容等价的安全 commit
**Reason**: 不再存在Task metadata publication retry或publication commit。

**Migration**: 无；删除对应state与tests。

### Requirement: 无 Git Workspace 必须保留 local records
**Reason**: local records统一由SQLite保存，无需publication能力提供降级语义。

**Migration**: 无Git Workspace与Git Workspace均使用同一SQLite authority。

### Requirement: 历史引用 diagnostic 必须由 writer 提供且不改写 record
**Reason**: publication不再消费writer diagnostics或portable references。

**Migration**: 各专业Application继续独立提供自身current read model；不建立替代publication diagnostic。
