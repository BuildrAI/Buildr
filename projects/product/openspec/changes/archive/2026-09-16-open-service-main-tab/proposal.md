## Why

项目中的服务目前先进入分屏预览，需要再次点击才能进入主页。用户要求项目与服务主页统一在主屏标签页（Tab）中浏览，减少一次跳转。

## What Changes

- 项目内点击服务，直接追加或激活主屏服务主页标签页（Tab），保留项目主页及其现场。
- 移除项目内服务的分屏预览入口；文档与变更继续使用既有分屏。
- 保持服务地址、身份、编辑能力和主屏标签复用规则；无接口或数据兼容性破坏。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-client`: 项目内服务打开位置改为主屏，右侧对象范围排除服务主页。

## Impact

影响 `ProjectDetailPage.tsx`、前端相关检查和 `knowledge/docs/services/buildr-web.md`。复用既有导航与主屏页面保留机制，不新增依赖、接口或智能体操作能力。
