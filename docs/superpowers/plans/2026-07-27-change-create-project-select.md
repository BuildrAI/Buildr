# 创建变更项目下拉 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「创建变更」所属项目改为从已登记项目下拉选择，空态与「接入服务」一致。

**Architecture:** 仅改本机 App 前端 `renderChangeForm`，对齐 `renderServiceForm` 的 `/api/v1/projects` 填充逻辑；不改 prompt API 契约。

**Tech Stack:** Buildr local-app 静态 JS、Playwright browser smoke。

## Global Constraints

- 工作目录：`.worktrees/change-create-project-select`
- 空态文案：`请先创建项目`（value 为空）
- 选项展示：`名称（code）`
- 不改继续/审查变更分支

---

### Task 1: 改创建变更表单为项目下拉

**Files:**
- Modify: `projects/product/services/buildr/src/interfaces/local-app/web/features/agent-actions.js`
- Test: `projects/product/services/buildr/test/browser-smoke/local-app-browser.test.mjs`

**Interfaces:**
- Consumes: `GET /api/v1/projects` → `{ projects: [{ code, name, ... }] }`
- Produces: `POST /api/v1/prompts/change-create` body `{ projectCode, goal }`（不变）

- [x] **Step 1: 扩展 browser smoke（change）断言创建变更下拉**
- [x] **Step 2: 将 `renderChangeForm` 创建分支改为 async select，对齐服务表单填充**
- [x] **Step 3: `open()` 对 change 使用 `void renderChangeForm(context)`**
- [x] **Step 4: 运行 `npm run test:browser:change` 并确认通过**
