## ADDED Requirements

### Requirement: runtime Skill 的 adapter context 不得声明读取者身份
Buildr 向 runtime `SKILL.md` 注入 adapter context 时 MUST 将其限制为投射或消费所需的非身份事实，并 MUST NOT 把投射 adapter 声明为当前读取者或需要 `<agent>` 的操作默认值。

#### Scenario: 多个 Agent 能发现同一 Skill root
- **WHEN** 一个 runtime Skill 目标目录可能被投射 adapter 之外的 Agent 发现
- **THEN** 该 Skill 的执行正文 MUST 保持对读取者身份中立
- **AND** adapter-specific 投射 identity MUST 继续保存在 Doctor 或 receipt 等机器证据中

#### Scenario: 产品入口 Skill 投射到不同 runtime root
- **WHEN** Buildr 为任一 supported adapter 生成产品入口 Buildr Skill
- **THEN** 生成的 `SKILL.md` MUST NOT 包含“当前 Agent Adapter”、当前安装 adapter 声明或固定 adapter 维护命令
- **AND** 各 adapter 的 runtime root、activation 和 checker MUST 继续由 adapter registry 决定
