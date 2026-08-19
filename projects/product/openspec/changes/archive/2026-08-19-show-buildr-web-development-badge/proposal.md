## Why

`Buildr Web Dev` 已与正式版在 Launcher、实例和 Data Root 上完成隔离，但页面本身没有持续可见的环境标识，用户打开浏览器后仍无法确认当前是否处于开发环境。现在需要让页面直接展示 Runtime 已确认的 development profile，避免继续依赖应用名称、端口或 URL 猜测环境。

本次变更不包含破坏性变更。

## What Changes

- Buildr Web Runtime 在同源入口页面注入已经解析并校验的 Web profile。
- 应用壳仅在 profile 为 `development` 时持续显示“开发版”标识，并把浏览器标签页产品名显示为 `Buildr Web Dev`；`released` profile 继续显示 `Buildr Web`，页面不显示开发版标识。
- 前端只接受 Runtime 注入的 closed profile 值，不根据端口、URL、Workspace 或 Launcher 文件名推断环境。
- 保持现有 Preview 身份条、端口策略、实例隔离和 Data Root 隔离不变。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `buildr-web-channel-isolation`: 增加普通 Buildr Web 页面必须按可信 Web profile 区分 development 与 released 的可见环境标识要求。

## Impact

- `buildr` Service：Local App HTTP Runtime 的入口页 profile 注入及相关集成/系统测试。
- `buildr-web` Service：应用壳环境标识、浏览器标签页标题、样式、构建产物与浏览器验收。
- 不新增依赖，不改变公开 API、Launcher binding、端口或持久化数据结构。
