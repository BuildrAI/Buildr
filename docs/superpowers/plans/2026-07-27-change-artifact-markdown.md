# Change Artifact Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让变更详情页的 Brief 与 OpenSpec 产物以安全 Markdown 排版展示。

**Architecture:** 新增本地 `markdown.js`，用 DOM API 解析常用 Markdown；`change-detail.js` 的 Brief 与 artifact 面板共用该渲染器；样式扩展现有 brief/artifact 面板。

**Tech Stack:** 原生 ES module、DOM API、Node test runner、既有 local-app CSS。

## Global Constraints

- 不引入 npm Markdown 依赖或 CDN
- 遵守 CSP：`script-src 'self'`
- 禁止对源 Markdown 使用 `innerHTML`
- 提交信息使用简体中文

---

### Task 1: Markdown 渲染器

**Files:**
- Create: `projects/product/services/buildr/src/interfaces/local-app/web/markdown.js`
- Create/Modify: `projects/product/services/buildr/test/unit/local-app-markdown.test.mjs`

- [ ] 编写失败的单元测试（标题、列表、加粗、代码、链接、表格、XSS 文本转义）
- [ ] 实现 `renderMarkdown(markdown) -> DocumentFragment|HTMLElement`
- [ ] 跑通单元测试并提交

### Task 2: 接入变更详情页

**Files:**
- Modify: `projects/product/services/buildr/src/interfaces/local-app/web/features/change-detail.js`
- Modify: `projects/product/services/buildr/src/interfaces/local-app/web/styles.css`
- Modify: `projects/product/services/buildr/test/unit/local-app-web.test.mjs`
- Modify: `projects/product/services/buildr/test/browser-smoke/local-app-browser.test.mjs`（如需）

- [ ] 更新静态断言要求使用 markdown renderer
- [ ] Brief 与 artifact 面板改用 `renderMarkdown`
- [ ] 增加 `.markdown-body` 样式
- [ ] 跑相关 unit / browser smoke 测试并提交
