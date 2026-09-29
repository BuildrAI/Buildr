## ADDED Requirements

### Requirement: 标准 Agent runtime 协议是唯一默认支持面
Buildr MUST 只把标准 `AGENTS.md` 规则协议与 `.agents/skills/` 技能协议作为默认支持的运行时接入面；MUST NOT 把任何品牌的目录约定、规则文件格式或技能根作为产品默认支持面。专有实现 MUST 属于例外，只有存在可审计的宿主原生能力缺口证据、且已独立立项时才 SHALL 注册为 supported adapter。

#### Scenario: 标准适配器是默认解析结果
- **WHEN** 调用方提供 `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy`、`codex`、`dsh` 或其他有效运行时身份，且未显式选择例外适配器
- **THEN** Buildr MUST 使用 `agents-standard` 作为文件投射适配器，并保留调用方提供的运行时身份
- **AND** MUST NOT 为该身份注册、借用或报告品牌专用适配器

#### Scenario: 注册专有例外必须有宿主原生能力缺口证据
- **WHEN** 维护者提议把某个品牌注册为独立的 supported adapter
- **THEN** 提议 MUST 附带可审计的宿主原生能力缺口证据，说明标准 `AGENTS.md` 协议或 `.agents/skills/` 协议为何不能服务该宿主
- **AND** 缺少该证据时 Buildr MUST NOT 注册该适配器

#### Scenario: 已注册例外只填补缺口
- **WHEN** Buildr 报告当前 supported adapters
- **THEN** 结果 MUST 只包含 `agents-standard` 与已附缺口证据的例外适配器
- **AND** 每个例外 MUST 只为该缺口实现投射，MUST NOT 为标准协议已覆盖的语义重复实现完整内容副本

### Requirement: 退役适配器的既有投射按所有权证明清理
Buildr MUST 在适配器退役后处理其既有投射，而不是让其留在磁盘上失去归属。处理 MUST 幂等；MUST 只删除能证明属于 Buildr 的文件；MUST 在无法证明所有权时保留文件并报告；MUST 在无法安全分离时整组零写入并保持可回滚。

#### Scenario: 可证明所有权的退役投射
- **WHEN** 退休适配器的规则桥、技能镜像或状态命名空间可由 Buildr 受管标记或所有权回执证明属于 Buildr
- **THEN** Buildr MUST 在受管操作中删除这些文件与对应回执
- **AND** 重复执行同一范围的退役处理 MUST 不新增、更新或误删文件

#### Scenario: 所有权无法证明
- **WHEN** 内容已漂移、含未知额外文件、缺少回执或来源身份不一致
- **THEN** Buildr MUST 保留文件，并在退役报告或 doctor 中说明具体路径与原因
- **AND** MUST NOT 猜测所有权或静默删除

#### Scenario: 退役目标与用户内容共存
- **WHEN** 退休目标路径同时包含 Buildr 受管内容与用户内容
- **THEN** Buildr MUST 只移除可证明属于 Buildr 的部分并保留用户内容
- **AND** 无法安全分离时 MUST 整组零写入并报告冲突

## MODIFIED Requirements

### Requirement: 现有 supported runtime 迁移保持兼容
Buildr MUST 在采用统一 adapter contract 后保持 `codex`、`dsh` 和 `claude-code` 的公开命令、runtime targets、managed ownership、冲突和清理语义兼容。

#### Scenario: Codex parity
- **WHEN** Buildr 使用 `agents-standard` adapter render 或 check 相同 workspace 状态，且调用方身份为 `codex`、`dsh` 或其他有效运行时身份
- **THEN** Buildr MUST 保持 native `AGENTS.md`、`.agents/skills/`、Skill install plans、managed marker 和 doctor 结果的既有语义
- **AND** Buildr MUST 保留调用方提供的运行时身份，不把结果改写为 `agents-standard`

#### Scenario: Claude Code parity
- **WHEN** Buildr 使用 `claude-code` adapter render 或 check 相同 workspace 状态
- **THEN** Buildr MUST 保持同目录 `CLAUDE.md` reference bridges、`.claude/skills/`、Skill install plans、managed marker 和 doctor 结果的既有语义

#### Scenario: 重复同步保持幂等
- **WHEN** 任一 supported adapter 在源资产与目标状态不变时连续同步两次
- **THEN** 第二次同步 MUST 不新增、更新或删除 runtime 文件

### Requirement: 标准默认选择保留已有接入事实
Buildr MUST 使用同一选择规则处理初始化、同步、投射、检查和组件维护，并分别表达请求运行时身份与实际适配器（Adapter）。

#### Scenario: 标准品牌与默认值
- **WHEN** 调用方传 `codex`、`dsh`，或没有既有接入事实且未指定运行时
- **THEN** Buildr MUST 选择 `agents-standard`
- **AND** 未指定身份时 MUST 保持身份未知，不伪造 `codex` 或 `dsh`

#### Scenario: 退役品牌的运行时身份
- **WHEN** 调用方传 `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 或其他有效运行时身份
- **THEN** Buildr MUST 保留该身份，并选择 `agents-standard` 作为文件投射适配器
- **AND** MUST NOT 因该身份报错，也 MUST NOT 将其报告为独立 supported adapter

#### Scenario: 保留已有专用接入
- **WHEN** 调用方没有指定运行时或适配器（Adapter），且现场存在唯一既有受管接入方式
- **THEN** Buildr MUST 保留该方式
- **AND** 多个不等价选择存在时写入 MUST 请求明确选择，不静默切换为标准

#### Scenario: 显式覆盖
- **WHEN** 调用方传入有效 `--adapter`
- **THEN** Buildr MUST 采用该明确文件约定，保留请求运行时身份
- **AND** 显式选择不授权接管任何外部文件

#### Scenario: 无效 adapter id
- **WHEN** 调用方传入不支持的 `--adapter` 值
- **THEN** Buildr MUST 明确失败并报告当前支持的 adapter id
- **AND** MUST NOT 静默回退到标准适配器或其他品牌

#### Scenario: 运行时身份不按适配器标识解析
- **WHEN** 调用方以运行时身份调用受管命令（`render`、`sync`、`runtime check`、`skills render`、`skill install`）
- **THEN** Buildr MUST 按选择规则把该身份解析为实际适配器，MUST NOT 把运行时身份当作适配器标识直接查找
- **AND** 身份缺失时 MUST 记为未指定，MUST NOT 把紧随其后的选项当成身份

## REMOVED Requirements

### Requirement: Buildr 支持五个新增 Agent runtime adapters
**Reason**: 宿主原生能力取证与既有 `standard-default` 政策表明，这五个品牌可以由标准 `AGENTS.md` 与 `.agents/skills/` 协议服务；继续注册独立适配器会把逐品牌规则桥与技能镜像变成产品默认维护面，并让专有实现缺少证据门槛。

**Migration**: 调用方继续使用 `--agent <brand>` 或 `buildr sync <brand>` 时，运行时身份被保留并解析到 `agents-standard`；需要显式文件约定时改用 `--adapter agents-standard` 或 `--adapter claude-code`。既有品牌投射由退役处理清理或报告。

### Requirement: 新增 adapters 按目标 runtime 机制投射 Rules
**Reason**: 该要求只服务已退役的五个品牌专属规则文件与 root bridge；标准协议要求由标准适配器与 Claude Code 例外要求覆盖。

**Migration**: 删除 `.cursor/rules/buildr.mdc`、`.qoder/rules/buildr/*.md`、`.trae/rules/buildr.md`、root `CLAUDE.local.md` 桥与 root `CODEBUDDY.md` 桥的投射；既有文件由退役处理清理或报告。

### Requirement: Vendor rule files 与 root bridge 遵守通用 runtime 安全边界
**Reason**: 该要求是品牌规则文件与 root 引用桥的安全边界实例；这五个品牌的规则文件与 root 桥随适配器退役，要求失去对象。其安全语义继续由通用的声明式计划、写入前冲突发现、orphan 清理与稳定同步要求覆盖。

**Migration**: 保留的 planner 继续只生成声明式 `RuntimePlan` 并复用通用 target validation、冲突预检、managed ownership、orphan cleanup 与 reconcile；既有品牌规则文件与 root 桥由退役处理清理或报告。

### Requirement: 新增 adapters 使用各自认证的 Skills root 与 activation
**Reason**: 该要求只描述已退役品牌各自的 Skills root、共享 `.agents` 所有权与 Qoder 双根取舍；标准 `.agents/skills/` 投射与 Claude Code `.claude/skills/` 投射继续由标准适配器和例外要求覆盖。

**Migration**: 删除 `.qoder`、`.trae`、`.codebuddy` 技能镜像与相关按根所有权回执；既有镜像由退役处理清理或报告。

### Requirement: 新增 adapters 的 checker 报告环境与前置条件事实
**Reason**: 该要求服务的品牌安装形态与版本探测在生产实现中没有真实生产者，只留下未使用的机制与品牌专属报告面；删除后 doctor 不再报告品牌安装与版本事实。

**Migration**: 删除安装与版本 probe 机制及品牌专属 macOS bundle、`defaults` 与 command 探测；需要确认宿主版本时由用户按文档自行确认，产品不再声称已探测。

### Requirement: 每个新增 adapter 保留独立兼容证据与分层验证状态
**Reason**: 该要求为已退役品牌保留独立契约证据与 fixture；退役后不再存在对应 adapter，其证据与测试失去对象。

**Migration**: 删除这五个品牌的 descriptor fixture、capability evidence 与品牌专属 contract tests；标准适配器与 Claude Code 例外的既有证据继续保留。

### Requirement: Qoder adapter 声明多 surface 安装事实
**Reason**: `qoder` 不再作为独立 supported adapter 注册，其 surface 声明与探测要求失去对象。

**Migration**: 删除 `qoder` 的 `ide`、`cli` surface 声明与对应 runtime check 输出；`qoder` 作为运行时身份继续按标准默认解析。
