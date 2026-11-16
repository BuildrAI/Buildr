## ADDED Requirements

### Requirement: 工作空间选择必须优先显示名称
Harness Web MUST 显示准确来源提供的工作空间名称；目录型工作空间 MUST 优先显示用户保存的名称，名称未填写时 MUST 使用目录名称并保留完整路径供核对。名称 MUST NOT 替代执行范围身份；名称缺失或来源离线时 MUST 保留准确身份回退。

#### Scenario: 选择已登记工作空间
- **WHEN** 宿主范围发现提供工作空间名称
- **THEN** 独立页面 MUST 使用该名称而不是来源加 UUID，选择仍绑定原范围

### Requirement: 添加目录工作空间必须通过本机选择并支持命名
独立 Harness Web MUST 提供服务所在本机的目录选择器，确认目录后登记并直接用于新对话；添加表单 MUST 支持填写名称并持久保存；名称留空 MUST 使用所选目录名。目录 MUST 通过选择器取得，MUST NOT 提供手填路径入口。取消 MUST NOT 登记或发送消息。不支持图形选择的平台 MUST 明确说明，保留已填写名称，不登记工作空间。接口 MUST 校验页面写入权限。

#### Scenario: 选择及取消目录
- **WHEN** 用户添加工作空间并选择本机已有目录
- **THEN** 系统 MUST 核验并登记该目录、选择对应工作空间；取消选择 MUST 保留原状态

#### Scenario: 自定义名称与默认名称
- **WHEN** 用户选择目录并填写名称或将名称留空
- **THEN** 系统 MUST 保存填写的名称或默认目录名，刷新后仍显示同一名称；名称不改变目录身份

### Requirement: Development 必须保留对话模块展开偏好
Development MUST 在同浏览器配置域内记住用户明确选择的展开或收起状态，刷新时恢复；无偏好保持收起默认。浏览器存储不可用 MUST NOT 阻止当前操作；恢复 MUST NOT 发送消息。

#### Scenario: 刷新恢复展开
- **WHEN** 用户展开或收起对话模块后刷新页面
- **THEN** 外层模块 MUST 恢复相同状态，原对话由 Harness 自身恢复
