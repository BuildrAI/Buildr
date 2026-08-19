# 显示 Buildr Web 开发环境标识

一句话摘要：让 Buildr Web 页面显示开发环境徽标，并让浏览器标签页用 `Buildr Web Dev` 直接区分 Runtime 已确认的 development profile。

## 背景与问题

`Buildr Web Dev` 已与正式版拥有不同 Launcher、实例和 Data Root，但两者页面视觉完全相同。用户进入浏览器后无法确认当前环境，也难以快速发现错误入口或旧实例。

## 目标与非目标

- 目标：Runtime 把已解析并校验的 closed Web profile 注入同源入口页。
- 目标：应用壳仅在 `development` profile 下持续显示“开发版”，浏览器标签页产品名显示为 `Buildr Web Dev`。
- 目标：released、缺失或未知 profile 的页面不显示开发版标识，浏览器标签页产品名保持 `Buildr Web`。
- 非目标：不改变 Launcher、端口、实例、Data Root、Preview、签名或发布流程。

## 受影响用户与核心流程

使用 `Buildr Web Dev` 的本机开发者受影响。用户从 Development Launcher 或 development CLI 打开页面后，Runtime 注入 profile，React 应用壳读取该值并在所有路由的品牌区域显示“开发版”，浏览器标签页产品名同步显示 `Buildr Web Dev`；正式 npm Buildr Web 页面保持 `Buildr Web`。

## 关键变化

- 生产入口页新增 `buildr-web-profile` meta，由 Runtime 写入 closed profile。
- 前端只把精确 `development` 映射为可见标识，不做其他环境推断。
- 标识使用稳定 DOM identity、紧凑响应式样式，并进入正式 `web-dist`。
- 浏览器标签页沿用既有 Workspace 标题上下文，只在 development profile 下把产品名显示为 `Buildr Web Dev`。
- Runtime、前端契约和浏览器验证共同覆盖 development 页面/标题显示与 released 不显示。

## 影响、风险与兼容性

标识只用于展示，不参与权限、路由、数据或生命周期判断。旧 Runtime、新旧 dist 混用或 Vite 源入口缺少 profile 时不显示，因此保持兼容并优先避免把正式版误标为开发版。

## 验收摘要

- development 页面在所有路由持续显示“开发版”，浏览器标签页产品名显示为 `Buildr Web Dev`。
- released 页面不显示开发版标识，浏览器标签页产品名保持 `Buildr Web`。
- profile 缺失或未知时不从端口、URL、Workspace 或 Launcher 名称回退推断。
- 正式 `web-dist` 与 Runtime 注入、响应式页面均通过验证。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Spec](specs/buildr-web-channel-isolation/spec.md)
- [Tasks](tasks.md)
