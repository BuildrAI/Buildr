## ADDED Requirements

### Requirement: Archify 必须作为可选内置组件交付
Buildr MUST 将固定版本 Archify 作为 `archify` 内置组件（Component）提供，设置 `defaultEnabled: false`、`required: false`，复用现有组件（Component）生命周期。

#### Scenario: 默认不安装
- **WHEN** 初始化或同步尚未选择 Archify 的工作空间（Workspace）
- **THEN** `archify` MUST 可被发现为可用组件（Component），但 MUST NOT 创建其技能（Skill）源或运行时（Runtime）投射

#### Scenario: 显式安装
- **WHEN** 用户选择安装 `archify` 且无所有权冲突
- **THEN** Buildr MUST 登记已安装状态并投射完整技能（Skill）目录

### Requirement: Archify 必须保留可追溯完整发行内容
Buildr MUST 使用固定的正式上游发行包，保存版本、来源、发行包摘要及 MIT 许可证，完整交付该发行包的程序、模板、参考文件和元数据。首次接入版本 MUST 为 2.16.0；MUST NOT 复制个人目录的依赖、缓存或输出图。

#### Scenario: 安装后直接使用
- **WHEN** 已安装目录在满足上游 Node 版本要求的环境运行
- **THEN** 随附程序 MUST 能渲染并校验代表性图示，无需从个人目录读取程序或在技能（Skill）目录额外安装依赖

### Requirement: Archify 生命周期必须保留用户内容
Buildr MUST 对 Archify 使用现有完整性、重复同步、更新和卸载保护，MUST NOT 自动覆盖用户级同名安装，也 MUST NOT 将项目图文件作为组件（Component）成员。

#### Scenario: 重复同步与安全更新
- **WHEN** 已安装成员匹配受管版本并再次同步
- **THEN** Buildr MUST 保持未变化内容稳定，并通过既有三方比较处理后续版本

#### Scenario: 用户修改成员
- **WHEN** 用户修改已安装的 Archify 程序且该内容不同于已安装和当前随包版本
- **THEN** 更新或卸载 MUST 保留该内容并报告冲突

#### Scenario: 卸载保留图文件
- **WHEN** 用户卸载未修改的 Archify 组件（Component）
- **THEN** Buildr MUST 清理该组件（Component）受管成员与投射，并保留项目 JSON、HTML 和独立用户级安装

### Requirement: Archify 必须保持独立可选使用
Archify MUST NOT 成为 OpenSpec、任务完成或正式验证的必需依赖。组件（Component）安装 MUST NOT 生成图、启动浏览器、安装全局命令或自动升级上游内容。

#### Scenario: 不使用绘图能力
- **WHEN** Archify 未安装或已卸载
- **THEN** 无关的开发、OpenSpec 与任务交付动作 MUST 继续适用原有规则
