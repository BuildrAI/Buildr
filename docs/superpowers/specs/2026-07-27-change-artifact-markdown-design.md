# 变更详情页 OpenSpec 产物 Markdown 展示

## 目标

变更详情页中的 OpenSpec 产物（提案、设计、规格、任务）与 Brief，以可读 Markdown 排版展示，而不是纯文本 `<pre>`。

## 范围

- 改：`change-detail.js` 产物面板与 Brief
- 增：本地轻量 `markdown.js`（DOM 构建，无 CDN / 无 npm 依赖）
- 不改：后端 API、变更目录、Agent Action

## 语法支持

标题、段落、有序/无序列表、加粗/斜体、行内代码、围栏代码块、链接（仅 http/https）、GFM 表格。

## 安全

全部通过 DOM API / `textContent` 构建节点，不使用 `innerHTML` 注入源 Markdown。

## 验证

单元测试覆盖语法与安全；更新 change-detail 与 browser smoke 相关断言。
