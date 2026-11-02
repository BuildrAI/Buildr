## ADDED Requirements

### Requirement: 新请求的全局默认权限

Buildr MUST 在新请求未提供 permissionMode 时采用 full-access，包括 CLI agent send、prepare-send/send 和统一解析调用。显式 default 或 full-access MUST 保留；无效值 MUST 报错。Web 无偏好且无历史运行的新对话 MUST 使用相同默认。

#### Scenario: 省略与显式选择
- **WHEN** 支持完全访问的接入收到省略 permissionMode 的新请求
- **THEN** 预览、执行和运行记录 MUST 使用 full-access，显式 default MUST 改为 default

#### Scenario: 接入未支持完全访问
- **WHEN** 接入未声明 full-access 或 DSH 原生目录没有 danger-full-access
- **THEN** 省略权限 MUST 使用可确认的原生 default，显式 full-access MUST 在交付工作指令前报错，预览和运行记录 MUST 显示实际权限

#### Scenario: 历史运行与旧请求
- **WHEN** 历史运行缺失权限字段或重试旧幂等摘要
- **THEN** 历史运行 MUST 仍解释为 default，旧摘要 MUST 仅允许显式 default 匹配，省略值 MUST NOT 因新默认而误复用旧请求
