## ADDED Requirements

### Requirement: DSH 运行时身份与投射保持分层证据
Buildr 的 DSH 接入 SHALL 保留真实运行时标识（Runtime ID）`dsh`，并把规则（Rule）与技能（Skill）投射交由共享的标准适配器（Standard Adapter）`agents-standard` 承担；MUST NOT 新增独立 `dsh` 适配器（Adapter），也 MUST NOT 借用其他产品的供应商适配器身份。DSH 特有的插件（Plugin）交付维护 SHALL 独立于适配器层。只有规则入口、产品技能（Skill）、工作空间与项目技能（Skill）、安装计划和运行时检查五项现有能力均有明确实现与证据时，才 SHALL 将 DSH 报告为受支持运行时（Runtime）。

#### Scenario: 仅完成桌面入口
- **WHEN** DSH 中 Buildr 按钮可见或插件（Plugin）安装成功，但尚未验证规则（Rule）与技能（Skill）发现
- **THEN** Buildr MUST 将结果限定为桌面入口或插件（Plugin）交付
- **AND** MUST NOT 将其报告为完整运行时（Runtime）接入

#### Scenario: 发现路径受限
- **WHEN** DSH 实际发现目录、作用域或刷新语义不能表达现有 Buildr 源资产
- **THEN** 系统 MUST 明确相关支持缺口，不得静默忽略技能（Skill）或退回供应商专用格式
- **AND** 缺口 MUST 只影响相关接入，不否定其他已验证能力

### Requirement: DSH 插件交付维护独立于适配器
DSH 插件（Plugin）交付与维护协调 SHALL 作为 DSH 特有的产品能力维护；插件（Plugin）SHALL 只负责界面动作与右侧导航，Buildr SHALL 继续拥有启动、安装身份、健康查询和业务数据。适配器（Adapter）层采用共享标准适配器时，本能力 MUST NOT 依赖新增独立适配器身份。

#### Scenario: 安装与升级
- **WHEN** 已授权安装或更新 Buildr 的 DSH 插件（Plugin）
- **THEN** 交付 MUST 使用 DSH 受支持管理入口并遵守精确版本兼容与依赖构建授权
- **AND** MUST NOT 直接运行包管理器改写桌面版受管配置
- **AND** MUST 保持插件（Plugin）源资产由 Buildr 产品工程维护，不以修改本机安装副本替代正式交付

#### Scenario: 受支持自动路径缺失
- **WHEN** DSH 没有可调用的安装或维护路径
- **THEN** Buildr MUST 报告具体缺失能力和已验证的人工管理入口
- **AND** MUST NOT 伪造自动安装或将本机单次安装报告为正式接入完成

#### Scenario: 退出不影响业务数据
- **WHEN** 禁用或卸载 DSH 插件（Plugin）
- **THEN** Buildr MUST 保持安装与业务数据不被删除
- **AND** MUST NOT 擅自停止已经运行的 Buildr Web
