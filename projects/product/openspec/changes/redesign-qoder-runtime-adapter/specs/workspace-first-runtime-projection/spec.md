## MODIFIED Requirements

### Requirement: 新增 adapters 使用各自认证的 Skills root 与 activation
Buildr MUST 将产品 Buildr Skill、workspace Skills 和 Skill install plans 投射到每个新增 runtime 为当前工作目录认证的 workspace destination Skills root，并公开其 activation 与 reload guidance。

#### Scenario: 共享 `.agents` Skills 投射
- **WHEN** Buildr 为 `cursor` 或 `trae` 安装或渲染 Skills
- **THEN** Buildr MUST 使用 `.agents/skills/<skill>/SKILL.md`
- **AND** Skill install plans MUST 位于 `.agents/buildr/skill-install-plans/`

#### Scenario: Vendor Skills 投射
- **WHEN** Buildr 为 `trae-work` 或 `workbuddy` 安装或渲染 Skills
- **THEN** Buildr MUST 分别使用 `.trae` 或 `.codebuddy` 作为当前工作目录的 runtime root
- **AND** 每个 adapter MUST 继续保留独立 descriptor、activation、evidence 和 contract tests

#### Scenario: Qoder 双 Skills root 投射
- **WHEN** Buildr 为 `qoder` 安装或渲染产品 Skill、workspace Skills 或 Skill install plans
- **THEN** Buildr MUST 将同一受管 asset 同时投射到 `.agents/skills/<skill>/SKILL.md` 与 `.qoder/skills/<skill>/SKILL.md`
- **AND** 两个 root MUST 各自使用独立 destination 控制的所有权回执，MUST NOT 用符号链接或内容复制伪装另一根已受管
- **AND** 当某根失去对应 source 时，同一范围 reconcile MUST 只清理该根的 orphan 受管目标
- **AND** Skill 名称冲突 preflight MUST 在写入任一根之前覆盖两个 root 的已有 inventory，并保持整次零写入

#### Scenario: Qoder 按安装形态声明 Skills 发现语义
- **WHEN** Buildr 公开 `qoder` 的 Skills discovery metadata
- **THEN** descriptor MUST 声明 `.qoder/skills` 为文档承诺的项目级发现根、`.agents/skills` 为受目标版本配置控制的共享发现根
- **AND** descriptor MUST 把无法从文件系统枚举的来源表达为 `partial` inventory assurance，而不是 runtime 健康 finding
- **AND** runtime list、runtime check 与 adapter 文档 MUST 说明用户级同名 Skill 覆盖项目级 Skill，Buildr MUST NOT 宣称已证明当前 Agent 全局无同名 Skill

#### Scenario: Skills 需要 reload 或新会话
- **WHEN** adapter 的 Skills activation 是 `explicit-reload` 或 `session-start`
- **THEN** runtime list、runtime check 和公开 adapter 文档 MUST 提供对应 reload 或新会话 guidance
- **AND** Buildr MUST NOT 将文件已写入描述为当前会话已经加载

### Requirement: 新增 adapters 的 checker 报告环境与前置条件事实
Buildr MUST 让每个新增 adapter 的 `runtime-check` 区分投射状态、安装/版本 probe 状态和 activation guidance，并且只执行随产品静态声明的有限时 probe；probe MUST 与目标平台以及该 runtime 已声明的每种安装形态适配，声明多个 surface 时每个 surface MUST 各自可自动探测或明确标注 `manual`。没有稳定、安全、跨安装形态的自动 probe 时，descriptor MUST 使用 `manual` probe 并给出确认 guidance。

#### Scenario: Environment probe 可自动执行
- **WHEN** descriptor 声明静态 command installation 或 version probe
- **THEN** runtime check MUST 使用静态 executable 和 arguments 在有限超时内执行
- **AND** 输出 MUST 包含 probe 状态与可审计 evidence

#### Scenario: Environment 只能人工确认
- **WHEN** 目标 surface 没有稳定、安全、跨安装形态的 command probe
- **THEN** descriptor MUST 使用 `manual` probe 并给出确认 guidance
- **AND** runtime check MUST NOT 把该项报告为自动检查成功

#### Scenario: 文件系统无法证明 Agent 已加载投射
- **WHEN** Buildr 只能证明 Rules 或 Skills 投射存在，无法从文件系统证明目标 Agent 已在会话中加载
- **THEN** runtime list、runtime check 或权威文档 MUST 提供对应 activation guidance
- **AND** runtime check MUST NOT 仅因没有真实 Agent marker smoke 而生成当前用户必须处理的 prerequisite warning

#### Scenario: macOS desktop probe 仅在 macOS 执行
- **WHEN** TRAE Work 或 WorkBuddy descriptor 在 `darwin` 平台执行 runtime check
- **THEN** installation/version probe MAY 使用静态声明的 macOS `defaults` executable 和参数
- **AND** 输出 MUST 包含 probe 状态与可审计 evidence

#### Scenario: 非 macOS desktop probe 使用人工确认
- **WHEN** TRAE Work 或 WorkBuddy descriptor 在 Windows 或 Linux 平台执行 runtime check
- **THEN** descriptor MUST 使用 `manual` installation/version probe 和确认应用版本或安装位置的 guidance
- **AND** runtime check MUST 返回 `manual` 状态
- **AND** MUST NOT 将 macOS `defaults` 的 ENOENT 或其他平台不适用错误报告为 installation missing、version unavailable 或 `userActionRequired` prerequisite warning

#### Scenario: Qoder 按安装形态组合探测
- **WHEN** runtime check 在 macOS 探测 `qoder` 的安装形态
- **THEN** descriptor MUST 使用静态声明的 bundle identifier 判定桌面 App 与 IDE 是否存在，并 MAY 同时执行静态 command probe 判定 Qoder CLI
- **AND** 命中任一安装形态时 MUST 报告 installation present 并列出命中的形态与证据
- **AND** Buildr MUST NOT 仅因 PATH 上不存在 `qoder` 命令而把已存在的桌面 App 或 IDE 报告为 installation missing 或 version unavailable

#### Scenario: Qoder CLI surface 独立可判定
- **WHEN** `qoder` descriptor 声明 `cli` surface 且目标平台不是 macOS，或 bundle 与 command probe 都无可审计证据
- **THEN** 对应 surface MUST 表达为 `manual` 探测结果并给出安装或版本确认 guidance
- **AND** runtime check MUST NOT 把无法自动确认表述为已验证

#### Scenario: 其他自动 probe 仍保持安全边界
- **WHEN** descriptor 声明 command installation 或 version probe
- **THEN** runtime check MUST 使用静态 executable 和 arguments，在有限超时内执行
- **AND** 除 Windows `.cmd`/`.bat` shim 所需的平台启动适配外 MUST 不经过任意 shell command 字符串
- **AND** 输出 MUST 包含 probe 状态与可审计 evidence

## ADDED Requirements

### Requirement: Qoder adapter 声明多 surface 安装事实
Buildr MUST 让 `qoder` adapter descriptor 声明其真实存在的产品安装形态，并 MUST 使 `runtime list --json`、`runtime check qoder` 与 doctor 的 runtime metadata 用同一份声明描述这些形态，避免把单一 IDE 形态当作该 runtime 的唯一事实。

#### Scenario: Runtime list 暴露 Qoder surfaces
- **WHEN** Agent 运行 `buildr runtime list --json`
- **THEN** `qoder` descriptor MUST 同时声明 `ide` 与 `cli` surface
- **AND** 每个 surface MUST 关联其探测方式（自动或 `manual`）与 activation guidance
- **AND** Buildr MUST NOT 为 `qoder` 猜测未声明的安装形态或目录

#### Scenario: 投射一致时安装形态缺席只报告事实
- **WHEN** `qoder` 的 Rules 与 Skills 投射 identity 与 source 一致，但 `qoder` 的任何安装形态都无法自动确认
- **THEN** runtime check MUST 报告投射为一致、安装形态为未确认，并保留确认 guidance
- **AND** 该结果 MUST NOT 表现为需要用户修复投射的行动项
