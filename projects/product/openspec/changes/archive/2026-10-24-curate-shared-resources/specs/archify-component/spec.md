## REMOVED Requirements

### Requirement: Archify 必须作为可选内置组件交付
**Reason**: Archify 转为 Buildr 自用技能，减少产品交付资源和内置能力边界。
**Migration**: 新空间不再发现内置组件；旧安装自动保全并转为自有技能，不要求用户重新安装。

### Requirement: Archify 必须保留可追溯完整发行内容
**Reason**: 完整上游发行不再由产品安装包交付。
**Migration**: Buildr 自用源与旧安装迁移保留完整来源、许可证和版本，不裁剪上游。

### Requirement: Archify 生命周期必须保留用户内容
**Reason**: 退出内置组件生命周期，改为工作空间自有技能。
**Migration**: 保留既有技能、定制、启停选择及图示，不覆盖用户级安装；只解除已确认的旧官方组件登记。

## ADDED Requirements

### Requirement: Archify 退出产品交付并保全旧安装
Buildr MUST NOT 将 Archify 程序、示例或内置组件声明纳入新安装包及当前官方共享集。旧共享集替换前 MUST 保全可核验的 Archify 来源；已安装空间重新准备时 MUST 自动转为自有技能并重建入口，保留已有本地内容、启停选择及图示。暂不可访问空间恢复后 MUST 仍能迁移，不依赖旧官方目录或网络下载。新安装 MUST NOT 创建旧来源保留数据。未知归属、损坏、符号链接或来源冲突 MUST 保留现场并给出具体失败，不静默覆盖。

#### Scenario: 新安装不携带绘图工具
- **WHEN** 用户安装新版并初始化工作空间
- **THEN** MUST 不交付或注册 Archify，其他能力正常可用

#### Scenario: 旧空间在全局更新后恢复
- **WHEN** 官方共享目录已更新且原先不可访问的旧空间恢复并重试
- **THEN** MUST 从已保全来源准备自有 Archify，保持完整附件、合法入口及图示

#### Scenario: 定制内容和外部安装
- **WHEN** 空间已有本地 Archify 内容或用户层同名安装
- **THEN** MUST 保留它们，不以退出内置为由覆盖或删除
