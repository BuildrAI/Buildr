## Why
Harness 工作空间仅显示来源与内部标识，添加时要求手填路径；Development 刷新固定收起，增加用户重复操作。需要以名称和本机选择器降低使用成本，无破坏性变更。

## What Changes
- 工作空间按来源提供的名称展示，目录工作空间默认目录名，身份不变。
- 独立 Harness 添加工作空间优先本机图形目录选择，取消不登记；添加表单提供可选名称，留空使用目录名；不提供手填路径入口。
- Development 记住对话模块展开选择；修复单窗口重置倒计时及供应商顺序。
- 移除对话顶部系统提示词按钮，配置和执行记录保留。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `harness-web-composition`: 工作空间名称、本机目录选择及 Development 展开偏好。

## Impact
buildr-harness 的范围目录和受认证网页接口，buildr 的宿主名称投射，以及两前端的展示与偏好。没有新依赖，不读取默认账号配置，不把认证有效期当订阅到期。
