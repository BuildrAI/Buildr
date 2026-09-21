## MODIFIED Requirements

### Requirement: 新增 adapters 使用各自认证的 Skills root 与 activation
Buildr MUST 将产品 Buildr Skill、workspace Skills 和 Skill install plans 投射到每个新增 runtime 为当前工作目录认证的 workspace destination Skills root，并公开其 activation 与 reload guidance。

#### Scenario: 共享 `.agents` Skills 投射
- **WHEN** Buildr 为 `cursor` 或 `trae` 安装或渲染 Skills
- **THEN** Buildr MUST 使用 `.agents/skills/<skill>/SKILL.md`
- **AND** Skill install plans MUST 位于 `.agents/buildr/skill-install-plans/`
- **AND** 同一共享 root 内已由其他 adapter 所有权回执声明的同路径目标 MUST NOT 被本 adapter 声明为 orphan 或报告为冲突，清理由持有回执的 adapter 执行

#### Scenario: Vendor Skills 投射
- **WHEN** Buildr 为 `trae-work` 或 `workbuddy` 安装或渲染 Skills
- **THEN** Buildr MUST 分别使用 `.trae` 或 `.codebuddy` 作为当前工作目录的 runtime root
- **AND** 每个 adapter MUST 继续保留独立 descriptor、activation、evidence 和 contract tests

#### Scenario: Qoder 双 Skills root 投射
- **WHEN** 考虑把 `.agents/skills` 作为 `qoder` 的第二个 workspace destination Skills root 写入
- **THEN** Buildr MUST NOT 为该 runtime 写入 `.agents/skills`：该根由声明它为自身 runtime root 的 adapter（`codex`、`cursor`、`trae`）或用户维护，同一 `.agents` 路径上两个 adapter 的渲染内容不一致，镜像写入只会与他方受管文件冲突
- **AND** Buildr MUST NOT 为 `qoder` 产生按根分段的 Skills 所有权回执或按根迭代的清理目标

#### Scenario: Qoder 单一 Skills root 投射
- **WHEN** Buildr 为 `qoder` 安装或渲染产品 Skill、workspace Skills 或 Skill install plans
- **THEN** Buildr MUST 只使用 `.qoder` 作为该 adapter 的 workspace destination Skills root，并沿用单根所有权回执
- **AND** `.qoder/skills` MUST 足以覆盖 `qoder` 已声明的全部安装形态，Buildr MUST NOT 以"补另一个根"为由写入他方持有的共享根

#### Scenario: Qoder 按安装形态声明 Skills 发现语义
- **WHEN** Buildr 公开 `qoder` 的 Skills discovery metadata
- **THEN** descriptor MUST 声明 `.qoder/skills` 为文档承诺的项目级发现根，并把 `.agents/skills` 表达为受宿主配置开关控制、由其他 adapter 或用户维护的共享发现根
- **AND** descriptor MUST NOT 把该共享发现根声明为 Buildr 为 `qoder` 写入的 root
- **AND** descriptor MUST 把无法从文件系统枚举的来源表达为 `partial` inventory assurance，而不是 runtime 健康 finding
- **AND** runtime list、runtime check 与 adapter 文档 MUST 说明用户级同名 Skill 覆盖项目级 Skill，Buildr MUST NOT 宣称已证明当前 Agent 全局无同名 Skill

#### Scenario: Skills 需要 reload 或新会话
- **WHEN** adapter 的 Skills activation 是 `explicit-reload` 或 `session-start`
- **THEN** runtime list、runtime check 和公开 adapter 文档 MUST 提供对应 reload 或新会话 guidance
- **AND** Buildr MUST NOT 将文件已写入描述为当前会话已经加载
