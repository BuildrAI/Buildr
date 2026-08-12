# Local App React 迁移：功能等价清单

本文固化迁移前后必须保持的用户可观察行为。实现阶段按切片勾选；**本文件只定义清单，不代表已实现或已跑通 browser-smoke。**

路径约定：全局路由无前缀；Workspace 内路径实际为 `/workspaces/<workspaceId><suffix>`（suffix 为下表「逻辑 path」）。

## A. Shell 与全局

| ID | 逻辑 path / 行为 | 验收要点 | Browser |
|----|------------------|----------|---------|
| A1 | `/` 工作空间列表 | 列出已登记 Workspace；可打开/登记相关入口 | shell |
| A2 | 侧栏导航与面包屑 | Workspace 上下文名称/路径展示正确 | shell |
| A3 | 退出应用 | 同源 session 确认后退出；非法 Origin/session 拒绝 | shell |
| A4 | preview 身份条 | preview 实例显示 instance/branch/head；不改 Dev.app identity | shell |
| A5 | SPA 深链刷新 | 直接打开深链仍回到正确视图 | shell |

## B. Workspace 开始与设置

| ID | 逻辑 path | 验收要点 | Browser |
|----|-----------|----------|---------|
| B1 | `/overview` | Getting Started / 开始工作投影可读 | shell |
| B2 | `/settings` | 工作空间 name/description 等允许的低风险编辑 | shell |

## C. 项目

| ID | 逻辑 path | 验收要点 | Browser |
|----|-----------|----------|---------|
| C1 | `/projects` | 列表：code、name、description、source、migration 标识 | project |
| C2 | `/projects/:code` | 详情只读；身份与来源事实 | project |
| C3 | `/projects/:code/edit` | 仅允许约定 metadata；revision 冲突可感知 | project |
| C4 | Agent Action | 生成范围明确的 Agent prompt，不直接 create Project | project |

## D. 服务

| ID | 逻辑 path | 验收要点 | Browser |
|----|-----------|----------|---------|
| D1 | `/services` | 列表与过滤 | service |
| D2 | `/services/:project/:service` | 详情只读 | service |
| D3 | `/services/:project/:service/edit` | 低风险 metadata 编辑 | service |
| D4 | Agent Action | prompt-only，不直接改 Service 源码仓 | service |

## E. 文章

| ID | 逻辑 path | 验收要点 | Browser |
|----|-----------|----------|---------|
| E1 | `/articles` | 文章/publications 列表 | articles |
| E2 | `/articles/:id` | 详情与 Markdown（含同源图片约束） | articles |

## F. 任务

| ID | 逻辑 path / 行为 | 验收要点 | Browser |
|----|------------------|----------|---------|
| F1 | `/tasks` | 列表与筛选 | task |
| F2 | `/tasks/:id` 概览 | Task Record 顶层事实；不 create Task | task |
| F3 | 研发页签 | Application read model；terminal 文案（delivered / unproven / no-change 等） | task |
| F4 | 证据页签 | Review 与 Verification 独立 loading；不伪造 Result | task |
| F5 | 复盘页签 | 只读复盘投影（若适用） | task |
| F6 | 环境页签 | Environment inspect / 有界 probe 语义 | task |
| F7 | update / complete / abandon | 受控 mutation + digest 冲突处理 | task |
| F8 | active unknown / stale / ready 等 | 与现有 browser fixture 语义一致 | task |

## G. Task-scoped Change

| ID | 逻辑 path | 验收要点 | Browser |
|----|-----------|----------|---------|
| G1 | `/tasks/:id/changes/:project/:change` | 只读 Change 详情 + Brief；不写 Change 文件 | task |

## H. Agent Actions（跨页）

| ID | 行为 | 验收要点 | Browser |
|----|------|----------|---------|
| H1 | 抽屉打开/关闭 | 各页入口可用 | shell + 各 selector |
| H2 | 复制 prompt | 复制不等于已执行；不含非法 path 字段 | 各 selector |

## I. 安全与托管（横切）

| ID | 行为 | 验收要点 | 证据 |
|----|------|----------|------|
| I1 | 无 session 写失败 | Application mutation 前拒绝 | contract / integration |
| I2 | 跨 Origin 写失败 | 同上 | contract / integration |
| I3 | 无 CDN | 静态资源同源 | 产物检查 + shell |
| I4 | 生产托管 dist | smoke 不依赖 Vite HMR | browser-smoke |
| I5 | 三入口一致 | checkout / npm / Dev.app 同壳 | package / launcher |

## 切片与 tasks.md 映射

| 切片 | 清单 ID | tasks.md |
|------|---------|----------|
| 空壳 + Shell | A*, I*（部分） | 2.x、3.x |
| Workspaces | B* | 4.1 |
| Projects | C* | 4.2 |
| Services | D* | 4.3 |
| Articles | E* | 4.4 |
| Tasks 列表 | F1 | 4.5 |
| Task 详情 | F2–F8 | 4.6–4.7 |
| Change | G* | 4.8 |
| Agent Actions | H* | 4.8 |
| 全量 | 全部 | 4.9、5.x |

## 明确不在本 Change 等价范围

- 新建全局 Change 目录路由（现网 `changes.js` 已无挂载路由，属残留，随 vanilla 删除即可）。
- 任何云端托管页面、登录态、多租户。
- `buildr-web` Service 拆分后的独立发布流程。
