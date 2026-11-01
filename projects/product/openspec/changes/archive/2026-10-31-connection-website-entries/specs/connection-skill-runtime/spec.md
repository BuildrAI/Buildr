## ADDED Requirements

### Requirement: 具名多网站声明与独立安全投影

接入声明 SHALL 可选提供 `presentation.websites`，为最多16个 `{id,label,field}` 的有序数组，编号合法且唯一，名称为非空且不超过120字符的文本，字段仅引用已声明的非秘密 `url` 配置字段。应用 SHALL 使用字段默认值及既有网址安全规则独立校验每项，公开返回 `{id,label,url}` 数组 `websiteLinks`，不执行认证、程序或外部访问，不修改配置或认证。

存在多入口声明（包括空数组）时 SHALL 优先于旧单入口声明，`websiteUrl` SHALL 为 `null`；缺失或无效的单项 SHALL 不阻断其他有效项，也 MUST 不回落或猜测另一个目标。未声明多入口时 SHALL 保留旧 `websiteField`、`websiteFallbackField` 和 `websiteUrl` 行为。

#### Scenario: 两个具名目标
- **WHEN** 方法声明两个合法网址配置字段及对应具名入口
- **THEN** 公开观察按声明顺序返回两个名称与准确地址，不产生单个默认网站

#### Scenario: 一项地址不安全
- **WHEN** 多入口的一项包含认证信息或使用非 HTTP/HTTPS 协议，另一项合法
- **THEN** 仅合法项提供入口，配置诊断独立保留，原配置与认证不变

#### Scenario: 无入口与旧式兼容
- **WHEN** 多入口为空或全部无效
- **THEN** 不返回可点击目标，也不使用旧单入口补齐

#### Scenario: 单入口继续回落
- **WHEN** 未声明多入口，旧声明允许网站覆盖缺失时使用基础地址
- **THEN** 继续返回原有安全单个 `websiteUrl`，不改变原回落边界
