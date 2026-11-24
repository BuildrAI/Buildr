## Purpose

定义 Buildr 中 Magpie 作为本机模型供应商的接入、准备、绑定与模型来源展示边界。使用户可以复用或准备网关、在兼容的执行方中准确选择模型，同时保留外部实例与账号的管理权。

## ADDED Requirements

### Requirement: Magpie 作为独立模型来源

Buildr SHALL 提供内置 Magpie 模型供应商。连接时 MUST 校验本机网关身份，支持默认端口、可观察的端口设置及用户明确输入的本机地址。Buildr MUST 读取已绑定网关的模型目录并保留实际上游模型标识，不静默替换或切换来源。断开或移除仅解除 Buildr 模型绑定，不管理 Magpie 上游账号或接管外部实例。

#### Scenario: 连接已有实例
- **WHEN** 用户连接一个有效的已运行本机 Magpie
- **THEN** 系统 MUST 复用该实例并读取其模型目录，不另行安装或启动

#### Scenario: 默认端口被非 Magpie 占用
- **WHEN** 候选本机端口无法核验 Magpie 身份
- **THEN** 系统 MUST NOT 将其作为 Magpie 使用或停止占用端口的进程

### Requirement: 用户按需准备 Magpie

未发现有效实例时，系统 SHALL 允许用户明确请求准备并启动受管 Magpie。系统 MUST 校验官方发行物，使用隔离的用户目录并仅在本机启动；不得写入外部 Magpie 配置、导入凭据或设置开机启动。模型目录为空时 MUST 区分网关可达但尚无模型，提供进入 Magpie 管理界面的方式。

#### Scenario: 已安装包可复用
- **WHEN** 用户明确请求下载并启动且受管程序已经安装
- **THEN** 系统 MUST 核验并复用本机安装，不重复下载

### Requirement: 模型选择器区分 Magpie 来源

对话模型选择器 SHALL 沿用现有布局，以 `模型名 · Magpie` 显示 Magpie 模型，不更改其他供应商模型的标签。系统 MUST NOT 将不明路由与账号的额度展示为某个模型的确定额度。

#### Scenario: 与直连同名
- **WHEN** Magpie 与其他供应商提供同名模型
- **THEN** 两个选项 MUST 保持各自绑定，且仅 Magpie 的模型名后有 ` · Magpie`
