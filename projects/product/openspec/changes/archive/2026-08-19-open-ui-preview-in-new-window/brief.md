# 预演页支持新窗口打开

Task 预演舞台用「新窗口打开」替换「隔离预览」，点击后打开当前选中 UI Preview 的同一内容 URL；iframe 隔离保持不变。

## 背景与问题

舞台只展示静态「隔离预览」，无法把当前页面放到独立窗口对照。内容响应本就可以顶层打开并保持 opaque origin。

## 目标

- 可展示当前页面时提供「新窗口打开」。
- 新窗口加载 iframe 正在使用的同一 Task-scoped 内容 URL。
- 更新 OpenSpec 与当前认知中的预演交互描述。

## 非目标

- 不生成 UI Preview HTML。
- 不改变内容 API、CSP、sandbox 或 session 边界。
- 不把预演 HTML 注入父页面 DOM。

## 受影响用户或角色

- 在 Buildr Web Task 详情「预演」Tab 查看预演稿的人。

## 核心流程

1. 用户在预演列表选择页面，舞台 iframe 加载内容 URL。
2. 用户点击「新窗口打开」。
3. 浏览器以新窗口打开同一 URL；CSP 继续强制 opaque origin。

## 关键变化

预演舞台从状态文案改为打开当前页面的动作控件；隔离承诺不变。

## 影响 / 风险 / 兼容性

新窗口仍同源，session cookie 会带上；预演脚本仍不能读取 Buildr API 或父 DOM。弹窗拦截时保留 iframe。

## 验收摘要

- 有可展示页面时，舞台有「新窗口打开」，无「隔离预览」。
- 按钮目标 URL 与 iframe `src` 相同。
- iframe 仍为 `sandbox="allow-scripts"`，内容响应 CSP 含 opaque-origin sandbox。

## 技术 artifacts

- Change：`openspec/changes/open-ui-preview-in-new-window/`
- 规范：`specs/local-app-web-client/spec.md`
- 实现：`services/buildr-web/src/pages/task-detail/PreviewTab.tsx`
