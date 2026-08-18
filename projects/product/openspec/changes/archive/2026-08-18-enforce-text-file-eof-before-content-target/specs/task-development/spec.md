## ADDED Requirements

### Requirement: Task Development 在 Content Target 前检查新增文本文件 EOF
Task Development Skill MUST 在内容固定且调用 `observe` 形成 Content Target 前，要求 Agent 检查 Task 本次新增的全部文本文件是否满足 required Core 的 EOF 不变量。Git-backed scope 的检查 MUST 覆盖 tracked-added 文件与未忽略的 untracked 文件；该动作 MUST NOT 扩大为未触达存量文件的批量清理。

#### Scenario: Git-backed Task 准备观察 Content Target
- **WHEN** Git-backed Task 已完成内容修改并准备调用 `observe`
- **THEN** Agent MUST 检查本次 tracked-added 与未忽略的 untracked 文本文件
- **AND** 每个被检查文件 MUST 恰好以一个换行符结束且不得包含末尾空白行
- **AND** Agent MUST 在检查通过后才调用 `observe`

#### Scenario: 新增文本文件存在末尾空白行
- **WHEN** Content Target 前置检查发现本次新增文本文件以额外空白行结束
- **THEN** Agent MUST 在调用 `observe` 前修正该文件
- **AND** 后续 Content Target 与验证证据 MUST 基于修正后的 bytes，不得复用与旧 bytes 绑定的证据

#### Scenario: 仓库存在未触达存量 EOF 问题
- **WHEN** Task scope 外或本次未新增的存量文本文件不满足 EOF 不变量
- **THEN** Task Development MUST NOT 仅为清理存量问题而扩大当前 Task 的 Content Target
- **AND** Agent MUST 继续对本次新增文件执行完整检查
