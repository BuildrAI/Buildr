## Context

Local App React 客户端权威源码在 `product/buildr-web`，由 sibling `product/buildr` 构建进 `web-dist` 并以 loopback HTTP 同源托管。功能路由与 browser smoke（大量 `#…` / `data-nav` 钩子）已稳定。

本 Change 只做视觉/布局/交互组件重构。硬约束已由 Task Intent 与用户 Brief 闸门锁定：

- 路由 path 与功能行为等价（工作空间/项目/服务/文章/任务/Agent Action 等）
- API、同源 session、离线 CSP（无 CDN、无远程字体/脚本）不变；`antd` 与 `@ant-design/icons` 经 npm 安装并由 Vite 打进 dist
- 不扩大产品边界（不 create Task、不页内执行专业任务）
- 托管仍由 `buildr` 的 `web-dist`；正式验收 `buildr app` + browser-smoke，不以 Vite HMR 冒充完成
- 实现在 worktree；合入靠「收尾」

Brief「待确认决策」已于 2026-08-10 由用户关闭，并在同日修订为 Ant Design 5 + 柔和产品感（见下方 Decisions）。

## Goals / Non-Goals

**Goals:**

- 以 **Ant Design 5** 承载 Modal / Table / Form / Drawer / Layout 等交互面，统一 Local App 的柔和产品气质。
- 规格上把「行为等价」与「允许视觉重设计」分开；保留 browser smoke 稳定 DOM 钩子。
- 保持生产托管与 browser 验收路径。

**Non-Goals:**

- 不新增路由、不改 API 形状、不改 session/CSP 模型。
- 不引入云端托管、跨 Origin、CDN、远程字体/脚本。
- 不扩大 Local App 产品能力。
- 不以 Vite 开发服务器或 HMR 作为 Candidate/交付完成证据。
- **不作废项：** 杂志/编辑感实现与 Fraunces 杂志排版方向（已作废，不得恢复）。

## Decisions

### 1. 行为契约与视觉契约分离

`local-app-web-client` 继续要求：已挂载路由 path、用户可完成的功能步骤、API/session/产品边界与现网等价。外观（色板、字体、间距、组件造型、布局密度、动效）允许在 Brief 确认范围内变化；不得把“像素或 class 名冻结”写成行为等价。

### 2. 实现落点与托管边界不变

全部 UI 改动落在 `buildr-web`。`buildr` 继续 `build:web` → `web-dist` 托管。`antd` CSS 走打包（`antd/dist/reset.css` + css-in-js，`theme.cssVar`），禁止外链 CDN。为兼容 Ant Design 5 运行时对元素 `style` / 动态 `<style>` 的需求，Local App HTTP CSP 的 `style-src` 调整为 `'self' 'unsafe-inline'`；`script-src` / `connect-src` 等仍仅 `'self'`，不开放远程字体或脚本。

### 3. 视觉方向与覆盖范围（已确认 · 修订）

- **范围 A**：全应用换肤（壳层 + 工作空间首页 + 项目/服务/文章/任务/Agent Action 等）。
- **视觉方向 C**：柔和产品感——轻圆角、轻阴影、雾蓝/青绿主色；避免紫渐变、工具锐度、深色炫光、杂志衬线大标题。
- **UI 框架 A**：Ant Design 5（`antd@5` + `@ant-design/icons`；兼容 React 19）。

### 4. 浏览器测试钩子策略（已确认 A）

尽量保留现有稳定钩子。可用隐藏/包装节点挂 id，或给 antd 组件加 `id`。对 smoke 依赖原生 DOM 的控件（如 `#action-project option`、`#task-complete-no-change` 的 `selectOption`、任务页签 `role=button`）优先保留原生语义或等价钩子包装，不得为了绿测关掉断言。

代表性钩子：`#workspace-grid`、`.workspace-card`、`#workspace-empty`、`#overview-title`、`#project-count`、`#service-count`、`#start-actions`、`#preview-identity`、`#action-project`、`#action-goal`、`#action-prompt-output`、`[data-nav=…]`、task/project/service/articles 相关 id、`#close-agent-action` 等。

### 5. 柔和色板与主题 token（已确认 B）

根入口 `ConfigProvider`：`locale=zh_CN`，主题偏柔和（圆角 8–12、轻阴影、主色青绿/雾蓝）。

| Token / 用途 | 值 | 说明 |
|--------------|-----|------|
| `colorPrimary` | `#4f8f8a` | 柔和青绿主色 |
| `colorInfo` | `#5b8fa8` | 雾蓝信息色 |
| 页面底 | `#f3f6f6` | 浅雾底，非工具深绿 |
| 容器底 | `#ffffff` | 卡片/面板 |
| 主文字 | `#1e2a2a` | 低对比墨色 |
| 次级文字 | `#5c6b6a` | 柔和次级 |
| 边框 | `#d5e0de` | 轻线 |
| `borderRadius` | `10` | 8–12 区间 |

字体：系统中文字体栈（PingFang SC / Hiragino Sans GB / Noto Sans SC / Segoe UI），**不**自托管杂志衬线 woff2。

### 6. Ant Design 组件映射

| 场景 | antd 组件 |
|------|-----------|
| 应用壳 | `Layout` / `Menu` / `Button` / `Drawer` |
| Agent Action | `Drawer` + `Form` / `Input` / `Button` / `Alert`（smoke 关键 select 可保留原生） |
| 工作空间 | 卡片 grid + `Button` / `Alert` / 空状态 |
| Overview / Settings | `Form` / `Button` / `Alert` / `Statistic` 或 `Descriptions` |
| Projects / Services / Tasks 列表 | `Table` + 操作列；Tasks 筛选用 `Form` |
| Project / Service 编辑 | `Form` |
| Articles | `List` / `Card` + 详情 |
| Task 详情 | 页签保持 `button` 语义；`Descriptions` / `Form`；complete/abandon 用 `Modal.confirm` |

`styles.css` 降级为主题补充与少量布局（如 workspace grid、markdown），不再维护一整套手写杂志系统。

### 7. 验收只认生产托管 dist

开发可用 Vite 预览，但 Task Verification / Candidate 完成证据必须来自 `buildr app`（或夹具等价）托管的构建产物上的 browser-smoke。

## Risks / Trade-offs

- [antd 组件 DOM 与 smoke 选择器冲突] → 钩子策略 A；关键 id 显式保留；原生 select/option 与 button 页签不盲目替换。
- [外链 CSS/字体触碰 CSP] → 仅 npm + Vite 打包；禁止 CDN。
- [全应用换肤遗漏] → 按壳层→列表→详情→Agent Drawer 推进，shell + smoke 验收。

## Migration Plan

1. ~~用户确认 Brief「待确认决策」。~~（已完成；并修订为 2C + 5A）
2. 在 worktree 实现 `buildr-web` Ant Design 5 柔和产品重构（钩子保留）。
3. `build:web` 产出 dist，跑 production-hosted browser-smoke / shell。
4. OpenSpec converge/archive 与「收尾」合入 retained；不在文档阶段改 retained。

回滚：回退 `buildr-web` 提交即可；无数据迁移。

## Open Questions

以下 Brief「待确认决策」已关闭（2026-08-10，同日修订）：

1. **范围**：→ **A 全应用**
2. **视觉方向**：→ **C 柔和产品感**（杂志感作废）
3. **浏览器测试 DOM id**：→ **A 尽量保留**
4. **品牌色**：→ **B 全新柔和色板**（上表 token）
5. **UI 框架**：→ **A Ant Design 5**
