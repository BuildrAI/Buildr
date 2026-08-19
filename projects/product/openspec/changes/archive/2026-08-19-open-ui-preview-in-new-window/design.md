## Context

预演舞台右侧目前是不可点击的「隔离预览」状态文案。iframe 已从 Task-scoped 内容 URL 加载页面，该 URL 也可作为顶层文档打开，并继续受 opaque-origin CSP 约束。用户要求把该文案改成「新窗口打开」，用新窗口打开当前预演页面。

## Goals / Non-Goals

**Goals:**

- 当前可展示预演页面时，舞台提供「新窗口打开」。
- 激活后打开 iframe 正在使用的同一相对内容 URL。
- 保留 `sandbox="allow-scripts"` iframe、CSP 与不注入父 DOM。

**Non-Goals:**

- 不生成新的 UI Preview HTML。
- 不改变内容 API、previewId、session 或 writer 边界。
- 不启用 `allow-same-origin`，不改 CSP，不把预演脚本并入 Buildr Web。
- 不提供多窗口同步或编辑能力。

## Decisions

1. **替换状态文案，不并列**：舞台标题区不再展示「隔离预览」；隔离由 iframe 与响应头保证，控件文案表达用户动作。
2. **同源 `window.open`**：使用当前 `previewSource`（与 iframe `src` 相同的相对 URL），`noopener,noreferrer`。浏览器把该 URL 当顶层文档打开；`frame-ancestors 'self'` 只限制嵌入，不阻止顶层导航。
3. **稳定 DOM id**：按钮 id 为 `task-preview-open-window`，供 browser smoke 断言文案、可点击，以及 `href`/打开目标与 iframe `src` 一致。
4. **用户手势**：只在按钮 click 中调用 `window.open`，避免弹窗拦截。

## Risks / Trade-offs

- 新窗口仍走 Buildr Web 同源 HTTP，session cookie 会带上；opaque-origin CSP 继续阻止预演脚本读取 Buildr API 或父页面。这与现有「直接打开内容响应」承诺一致。
- 弹窗被拦截时页面保持 iframe 预览；不另做 toast 作为本 Change 范围。
