# archify-component Specification

## Purpose
规定 Archify 退出 Buildr 产品交付后的旧安装保全与工作空间自有技能（Skill）迁移；Buildr 自举工作空间独立维护绘图来源，绘图始终是可选能力。

## Requirements

### Requirement: Archify 必须保持独立可选使用
Archify MUST NOT 成为 OpenSpec、任务完成或正式验证的必需依赖。组件（Component）安装 MUST NOT 生成图、启动浏览器、安装全局命令或自动升级上游内容。

#### Scenario: 不使用绘图能力
- **WHEN** Archify 未安装或已卸载
- **THEN** 无关的开发、OpenSpec 与任务交付动作 MUST 继续适用原有规则

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
