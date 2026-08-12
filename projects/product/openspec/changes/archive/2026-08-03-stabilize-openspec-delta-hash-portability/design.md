## Context

`parseOpenSpecChangeDelta` 为每个 delta spec 保留绝对 `file` 路径，以便当前进程读取和诊断；但它也把该路径直接拼入 `deltaHash`。`deltaHash` 随后进入 convergence plan、receipt 和 delta-change 判断，使相同的 committed Change 因 clone、worktree 或本机目录不同而得到不同身份。

## Goals / Non-Goals

**Goals:**

- 让同一组逻辑 delta 文件及其规范化内容在任意 checkout 中生成同一个 `deltaHash`。
- 保持哈希输入有序、可移植且与当前文件系统绝对路径解耦。
- 对旧的本机路径哈希保持 fail-closed：不伪造相等，而是沿用既有的 delta 已变化重规划路径。

**Non-Goals:**

- 不改变 delta Requirement parser、canonical 同步、CLI 参数、receipt schema 或 OpenSpec 上游版本。
- 不建立旧哈希到新哈希的迁移表，也不为了复用旧 receipt 重写其身份。
- 不包含测试性能优化或无关的收敛重构。

## Decisions

### 1. 使用逻辑文件标识构造唯一哈希输入

按 capability 名称排序后，哈希一个稳定的结构化序列：每项只包含逻辑路径 `specs/<capability>/spec.md` 与 `normalizeOpenSpecContractText` 后的内容。该逻辑路径由已校验的 capability 名称生成，始终使用 `/`；不从 `changeRoot` 或 `path.relative()` 派生，因此不会携带 POSIX/Windows 分隔符差异。

选择结构化序列而非继续拼接绝对或相对字符串，是为了让多文件边界明确，并把“用于读文件的绝对路径”与“可移植的 delta identity”分开。`capabilities` 中现有的绝对 `file` 字段保留给本次进程的 I/O 与诊断。

### 2. 旧 receipt 仅按既有身份不匹配路径失效

算法变更后，旧 receipt 的 `deltaDigest` 不会等于新算法计算出的值。产品不得用当前 checkout 的路径回推、改写或假装兼容旧 identity；现有收敛流程将它视为 delta identity 已变并以当前 canonical 事实重新规划。这样不会把机器相关的旧证明错误带入新的 portable identity。

### 3. 在 parser 边界验证可移植性

新增直接覆盖 `parseOpenSpecChangeDelta` 的测试，分别在两个不同的临时绝对根创建相同 delta，并断言 hash 相等，同时验证逻辑路径或规范化内容变化会改变 hash。测试不依赖实际 clone、全局 OpenSpec CLI 或收敛时间，以便只证明本缺陷的输入边界。

## Risks / Trade-offs

- [Risk] 已有活跃 Change 的旧 receipt 在升级后需要一次重新规划。→ 保留现有 fail-closed mismatch 行为，不自动采纳或改写 receipt。
- [Risk] 将相对路径由运行时推导可能再次引入平台差异。→ 固定从 capability 名称生成 POSIX logical path，并在跨根测试中断言结果。
- [Risk] 修改哈希序列可能掩盖文件读取所需的绝对路径。→ 仅改变 hash serialization，保留 `file` 字段及其所有 I/O 使用者。
