# dsh-plugin-distribution Specification

## Purpose
规定 Buildr 在 DSH 桌面版中的独立插件如何构建、安装、更新与复用页面，使插件交付不依赖 Buildr 主包发版，并清楚区分构建、公开发布和真实桌面生效。

## Requirements

### Requirement: 插件必须是独立版本的可安装组合包
Buildr DSH 插件（Plugin）SHALL 由独立服务（Service）维护源码、构建、验证和包版本。正式产物 MUST 含 DSH 可加载的主机端、客户端、组合层和准确兼容声明，MUST 默认启用且不含本机路径、凭证或安装时构建脚本。插件未变化时，Buildr 主包发版 MUST NOT 强制重建或重发插件。

#### Scenario: 从公开包安装
- **WHEN** 目标 DSH 版本兼容且已公开发布的插件包通过 DSH 插件管理入口安装到目标配置档（Profile）
- **THEN** DSH MUST 从包内组合层注册并启用 Buildr 入口，无需先运行 Buildr 的 `dsh-plugin prepare` 命令
- **AND** 插件 MUST 在点击时发现本机对应 Buildr 安装或给出明确缺失反馈

#### Scenario: 插件未变化而 Buildr 主包发布
- **WHEN** 当前插件源码、交付契约和兼容基线与最近已发布插件版本一致
- **THEN** Buildr 主包发布 SHALL 复用该插件版本，不生成新的插件版本或将其压缩包捆入主包

### Requirement: 插件发布必须与主包分离且可核验
插件 SHALL 使用自己的版本、候选产物和发布事实；公开发布 MUST 使用已验证的同一包字节，并须取得针对确切版本与内容的授权。Buildr 主包发版前 MUST 核对是否有尚未发布的插件变化；有变化时 SHALL 先准备可安装插件候选并报告发布状态，未获插件发布授权时 MUST NOT 声称“已同步发布”。

#### Scenario: 有插件更新的 Buildr 发布准备
- **WHEN** 待发布 Buildr 源码包含最近插件发布版本之后的插件变化
- **THEN** 发布准备 MUST 明确标出插件待发布版本、候选产物和验证边界
- **AND** 插件公开发布与 Buildr 主包公开发布 MUST 各自使用对应授权和发布证据

#### Scenario: 插件发布失败或未获授权
- **WHEN** 插件候选已构建但公开发布尚未完成
- **THEN** 产品 MUST 报告候选而非已发布，且一条对话安装承诺 MUST 不以未公开包为依据

### Requirement: 正式版与开发版须安全复用右侧页面
插件 SHALL 在客户端重载、插件重新启用或 DSH 桌面重启后，优先聚焦由同一入口创建、仍存在于当前会话且记录地址与最新 Buildr 健康地址一致的浏览器标签。正式版与开发版 MUST 分开记录身份，MUST NOT 误认彼此标签或因地址变化覆盖旧页面。没有可信标签身份或地址时 MUST 另开正确页面而不猜测用户手动打开的标签。

#### Scenario: 重启后同一地址
- **WHEN** 插件创建的 Buildr 标签在 DSH 重启后仍位于当前会话，且健康地址未变
- **THEN** 再次点击 MUST 聚焦该标签，不新建、不导航或刷新

#### Scenario: 地址变化或标签不存在
- **WHEN** 记录的标签已关闭，或健康地址与记录地址不同
- **THEN** 插件 MUST 打开本次健康查询返回的地址，并 MUST 保留仍存在的旧页面及其内容

#### Scenario: 另一入口或手动浏览器标签
- **WHEN** 当前会话只有另一 Buildr 入口创建的标签，或存在无法通过 DSH 公开接口确认地址的手动浏览器标签
- **THEN** 插件 MUST NOT 将其当作自己已验证的页面
