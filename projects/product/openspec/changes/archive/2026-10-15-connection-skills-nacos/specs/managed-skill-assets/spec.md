## ADDED Requirements

### Requirement: 技能清单登记可选连接声明引用
工作空间（Workspace）`skills/manifest.yml` 的技能（Skill）条目 MUST 支持可选 `connectionDefinitions` 数组，引用该技能源目录内的声明，例如 `assets/connection.yml`。声明 MUST 复用已有技能源身份、登记、启用和内容读取机制；未声明连接用途的技能（Skill）MUST 保持原有行为，不建立第二套技能加载系统。

#### Scenario: 登记自制连接技能
- **WHEN** 用户登记完整本地技能（Skill）并声明 `connectionDefinitions: [assets/connection.yml]`
- **THEN** Buildr MUST 从该已登记技能源读取连接声明并保留技能（Skill）的 `assetIdentity`、`sourceIdentity`，不另复制一份连接方法正文

#### Scenario: 普通技能不声明连接用途
- **WHEN** 已有技能（Skill）没有 `connectionDefinitions`
- **THEN** 技能（Skill）发现、内容增强和投射 MUST 继续有效，不要求补充连接声明

### Requirement: 新连接技能源统一使用标准目录
连接技能（Connection Skill）MUST 通过现有技能（Skill）机制登记到 `skills/connections/<skill-id>/`，包含完整入口、声明和必要附件。完整本地源登记 MUST 使用标准目标；直接登记已有目录时 MUST 要求源已位于标准位置并给出明确诊断，不擅自移动用户文件。清单中不符合标准的连接来源 MUST 仅作局部诊断，不加载或迁移；本未发布功能 MUST NOT 为试验布局保留兼容目标。普通技能及唯一清单机制 MUST 保持原有行为。

#### Scenario: 从私有代码库导入完整接入
- **WHEN** 用户通过现有完整目录入口新增登记带连接声明的技能源
- **THEN** 成果登记到 `skills/connections/<skill-id>/`，清单引用准确路径，所有附件保持可用，不另建连接安装器

#### Scenario: 手工清单使用非标准布局
- **WHEN** 某个带连接声明的技能源登记在 `skills/connections/<skill-id>/` 之外
- **THEN** 连接目录报告该来源位置不符合规范，不加载或自动移动；其他有效来源及普通技能仍可使用

### Requirement: 连接声明引用及内容被安全解析
连接声明引用 MUST 位于所选技能源的受支持目录内，不能通过绝对路径、路径逃逸或符号链接读取外部文件。Buildr MUST 校验声明格式、定义身份及重复引用，并报告缺失、格式不支持或字段错误；连接目录（Connection Catalog）MUST 可由当前有效声明重建，不成为独立源权威。

#### Scenario: 声明引用逃出技能源
- **WHEN** `connectionDefinitions` 含越界路径或目标经过符号链接
- **THEN** Buildr MUST 拒绝该连接声明，不读取目标内容、不启动程序，并报告具体引用及原因

#### Scenario: 声明已修改而目录观察陈旧
- **WHEN** 已登记连接声明的内容变化
- **THEN** Buildr MUST 依据当前源和观察摘要重新解析或明确报告陈旧，不继续把旧目录内容当作当前事实

### Requirement: 连接技能完整附件复用既有投射
本地及随包连接技能（Skill）的声明、参考材料和程序 MUST 复用现有完整目录投射，保持相对路径、原始字节、适用可执行状态及归属回执（Ownership Receipt）。投射 MUST 不执行随附程序、不安装其依赖、不建立真实登录态，也不能取得外部同名资产的所有权。

#### Scenario: 投射带声明和程序的 Nacos 技能
- **WHEN** 启用技能（Skill）包含 `assets/connection.yml` 和 `scripts/` 下的程序
- **THEN** Buildr MUST 保全这些附件及路径，并分别报告投射完成和程序可用性，不把前者当成后者的证明

#### Scenario: 使用已解析远端单文件来源
- **WHEN** 技能（Skill）只有 `resolved.kind: skill-url` 的单个原始 `SKILL.md`
- **THEN** Buildr MUST 保持单文件分发边界，不推测相邻附件；未获得连接声明或所需程序时 MUST 报告接入成果缺失

### Requirement: 技能生命周期保留连接绑定与来源诊断
技能（Skill）登记、更新、停用、取消登记和投射 MUST 保留现有身份与冲突治理，并披露受影响的连接定义和实例。安装另一份同系统技能（Skill）MUST 不改变已有连接实例（Connection Instance）绑定；停用或缺失 MUST 保留团队实例文件和本机个人认证，不能自动接管、删除或导出认证。

#### Scenario: 官方与用户 Nacos 方法同时存在
- **WHEN** 用户以不同技能（Skill）身份登记另一份 Nacos 接入成果
- **THEN** 两份方法 MUST 可分别被发现和明确选择，既有实例 MUST 保持原绑定及来源身份

#### Scenario: 取消技能登记
- **WHEN** 用户取消某连接技能（Skill）的登记
- **THEN** Buildr MUST 披露绑定受影响的实例，保留技能源、实例配置和个人认证，不声称已同步卸载其他会话的投射
