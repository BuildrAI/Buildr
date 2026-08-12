## Why

Local App（`product/buildr-web`）已完成 React 迁移与功能接线，但视觉、布局与动效仍偏工具脚手架，信息层级与本机工具气质不够统一。现在需要在**不改路由 path、API、同源 session 与离线 CSP**的前提下，用 frontend-design 方向重构 UI，让本机应用观感达到可交付水准；视觉方向与范围须先由 Brief 闸门确认，再进入实现。

## What Changes

- 在 `product/buildr-web` 重构 Local App 视觉系统（色板/字体/间距/组件样式）、壳层与页面布局，以及有限、有目的的动效。
- 明确规格：交互与路由行为保持等价；允许在确认的范围内做视觉重设计，不把“像素级外观冻结”当作行为等价。
- 轻触 browser 验证契约：正式验收仍走 `buildr app` 生产托管的 `web-dist`；DOM 测试钩子策略由用户在 Brief 中确认（尽量保留或允许重写并同步测试）。
- 不扩大产品边界：不 create Task、不在页内执行专业任务；不引入 CDN/远程字体/远程脚本。
- 不包含破坏性 API 或路由变更；合入仍靠 Task「收尾」。

## Capabilities

### New Capabilities

<!-- 无新增 capability；本 Change 修订既有 Local App Web 与 browser 验证契约。 -->

### Modified Capabilities

- `local-app-web-client`：区分「路由/交互/产品边界等价」与「允许视觉/布局/动效重设计」；固化离线 CSP、同源 session、生产 dist 托管与 frontend-design 实现边界。
- `local-app-browser-verification`：重申生产托管验收（不以 Vite HMR 冒充完成）；补充浏览器测试 DOM 钩子策略（保留或重写并同步测试）的可验证要求。

## Impact

- `product/buildr-web`：样式、布局组件、页面结构与动效；可能调整稳定 DOM id / `data-*` 钩子（取决于 Brief 决策）。
- `product/buildr`：通常仅消费更新后的 `web-dist`；若钩子变更则同步 `test/browser-smoke` 选择器。不改 HTTP session、CSP 写死策略或 API。
- OpenSpec / Brief：本 Change artifacts；current knowledge 在实现收敛阶段按真实影响更新 `buildr-web` 说明（若观感/验收表述变化）。
- 正式验收：`buildr app` + browser-smoke（或 affected selector）；实现只在 Task worktree，合入靠「收尾」。
