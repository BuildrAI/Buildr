## ADDED Requirements

### Requirement: 网站回落字段必须显式声明且受限

连接声明 SHALL 支持可选 `presentation.websiteFallbackField`，且该字段 MUST 精确引用声明中类型为 `url` 的配置字段；不存在、非网址类型、认证字段或非法引用 SHALL 使该声明产生明确的局部校验诊断。未提供该属性的声明 SHALL 保持兼容，Buildr MUST 不按 `apiBaseUrl` 等常见字段名猜测网站目标。

回落声明 SHALL 仅影响公开网站入口的候选选择，不改变连接实例身份、认证目标、配置内容或程序上下文（Context）。最终公开网站入口 SHALL 继续通过现有安全地址过滤。

#### Scenario: 合法基础网址引用
- **WHEN** 声明将 `presentation.websiteFallbackField` 设为自身已声明的 `url` 配置字段
- **THEN** 定义可解析并保留该引用，网站候选按覆盖值是否为空决定是否使用它

#### Scenario: 回落引用非法
- **WHEN** 回落字段引用不存在的键、文本字段或认证字段
- **THEN** 当前声明解析失败并指出回落引用问题，不影响其他合法连接

#### Scenario: 旧声明没有回落属性
- **WHEN** 已有声明只含 `websiteField`，即使另有基础网址字段
- **THEN** 解析及网站选择保持兼容，不推断或写入额外网站目标
