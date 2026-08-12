# Buildr Web Service

本目录是 Product Project 下 `product/buildr-web` Service 的规则入口，承载 Local App 的 React/Vite 前端源码与正式构建。

## 所有权边界

- Service 拥有 Local App 前端工程：`package.json`、Vite/TypeScript 配置、`src/` 与前端依赖锁定。
- 正式构建产物写入 sibling `buildr` 的 `src/interfaces/local-app/web-dist/`；运行时同源 loopback 托管、session 注入与三入口打包仍由 `product/buildr` 负责。
- OpenSpec、verification policy 与跨服务产品治理仍在父级 `projects/product/`；本目录不维护独立 OpenSpec 根。
- 已安装或仅含 dist 的环境不得依赖本 Service 源码树或 Vite 开发服务器。

## UI 栈与验收

- UI 以 Ant Design 5（`antd` + 必要 icons）承载布局/表格/表单/弹层，视觉方向为柔和产品感；依赖与字体均由 Vite 打入 `web-dist`，禁止 CDN/远程字体/远程脚本。
- 正式浏览器验收走 `buildr app` 生产托管的 `web-dist`；尽量保留稳定 DOM id / `data-*` 钩子供 browser smoke 使用。

## 前端开发规则

开发、修改或重构本 Service 的 React 前端时必须遵守本节。目标是模块化（Modularization）、组件化（Componentization），以及样式、结构（JSX）与业务逻辑清晰分离，保证可维护性。

### 目录与模块边界

按职责落位，禁止把无关职责堆进同一文件或目录：

| 目录 / 文件 | 职责 |
|-------------|------|
| `src/app/` | 应用壳：布局、全局 Context、跨页壳层交互 |
| `src/pages/` | 路由页面及其**页面内组件** |
| `src/components/` | **公共组件**：跨页复用、无路由绑定的展示/交互组件 |
| `src/api/` | HTTP / session / workspace 数据访问，不含 UI |
| `src/lib/` | 纯工具、标签映射、与 UI 弱耦合的共享逻辑 |
| `src/store/` | **仅在已获准引入正式全局 Store 后**使用；按领域存放，缺省不创建 |
| `src/theme.ts` | Ant Design 主题 token |
| `src/styles.css` | 全局与壳层补充样式；非组件私有样式的默认入口 |
| `src/App.tsx` / `src/main.tsx` | 路由装配与应用启动，保持薄 |

- 新功能优先沿现有边界扩展；不得为图省事在 `pages/` 内复制 `api/` 客户端，或在 `api/` 内引入 React 组件。
- 纯函数、格式化、文案映射优先放 `lib/`，不要塞进组件文件底部无限膨胀。

### 组件分层：页面内组件 vs 公共组件

组件按复用范围分成两类，落位不得混淆：

| 类型 | 落位 | 判定 |
|------|------|------|
| 页面内组件（Page-local） | `src/pages/<PageName>/` 或与页面对应的子目录（如 `pages/task-detail/`） | 只服务某一个路由页面或其子 Tab；可依赖该页的路由参数、页面状态与业务文案 |
| 公共组件（Shared） | `src/components/` | 被两个及以上页面/壳层使用，或明确设计为通用 UI；不得绑定单一路由或单一页面的业务语义 |

约定：

- 页面入口文件（如 `TasksPage.tsx`）负责路由级编排；从该页拆出的局部 UI 先作为**页面内组件**放在同页目录，不要一拆就进 `components/`。
- 仅当第二处真实复用出现，或组件已剥离页面特有数据形状与文案后，再提升为**公共组件**迁入 `src/components/`。
- 禁止反向依赖：公共组件不得 import `pages/`；页面内组件不得被其他页面直接引用（需要共享时先提升为公共组件）。
- `src/app/` 中的壳层组件视为应用级公共能力，同样不得依赖具体 `pages/`。

### 组件化

- 一个文件默认导出一个主要组件；文件名与组件名一致（如 `TasksPage.tsx` → `TasksPage`）。
- 组件只做一件事：页面负责编排；页面内/公共子组件负责局部展示或局部交互。
- Props 类型显式声明；避免隐式 `any` 与过大的“万能 props 包”。
- 公共组件不得硬编码某一路由或某一页面的业务文案与数据形状；页面特有逻辑留在页面或页面内组件。
- 新增 UI 交互优先使用已有 Ant Design 能力；自定义组件只在 antd 无法表达产品语义时引入。

### 样式 / 结构 / 逻辑分离

三者不得糊成单块“大文件”：

1. **结构（JSX）**：组件渲染树只描述界面结构与组件组合；避免在 JSX 中堆长段计算、数据变换或副作用。
2. **业务逻辑**：数据获取、状态流转、事件处理、派生计算放在组件外的函数、hooks 或邻近的 `*.ts` 模块中；页面文件以编排为主。
3. **样式**：
   - 主题色、圆角、字体等设计 token 以 `theme.ts` 与 CSS 变量为准，禁止在组件内散落魔法色值。
   - 全局壳层与跨页样式写在 `styles.css`；组件私有样式使用明确前缀的 class，或与组件同目录的局部样式模块，不得污染全局选择器。
   - 禁止内联大段样式对象替代可复用样式；允许少量布局相关的动态 style（如宽度计算）。
   - 不得引入 CDN/远程 CSS、远程字体或远程脚本。

### 状态与数据流

默认不用独立全局 Store（如 Redux、Zustand）。按范围由近到远存放状态：

1. **页面 / 组件局部**：`useState` / `useReducer` / 页面内 hooks（默认首选）。
2. **应用壳共享**：`src/app/` 的 React Context（如 `AppShellContext`），只放跨页壳层真正需要的状态与动作。
3. **API 模块变量**：仅限 `src/api/` 内为请求装配所需的最小事实（如 `workspaceState.ts` 的 `workspaceId`），不是业务 Store。

正式全局 Store 的引入门槛：

- **仅当真正需要**时才引入：同一份可变业务状态被多个无关页面/深层组件稳定共享，且 Context 造成明显多余重渲染、prop drilling（层层传参）不可维护，或需要可测试的独立状态模块。
- 引入前须说明：共享范围、为何现有 `useState` / Context 不够、Store 的边界与非目标（不把服务端列表缓存、表单草稿一股脑塞进 Store）。
- 获准引入后，Store 代码集中在 `src/store/`（或等价单一目录），按领域拆分；页面仍经 hooks/选择器消费，禁止在随意文件里新建第二套全局状态方案。
- 未达门槛时，禁止“先上 Store 再说”或为单个页面预建全局 Store。

其他约定：

- 服务端数据经 `src/api/` 访问；页面不得直接 `fetch` 绕过现有 client / session 适配。
- 派生数据用纯函数计算；能在渲染前算清的，不要埋进 JSX。
- 副作用（请求、订阅、DOM 钩子）集中在明确的 `useEffect` / 事件处理中，并写清依赖与清理。

### 可维护性硬约束

- 单文件过长（大致超过 ~400 行）或同时承担“请求 + 表格配置 + 表单 + 弹层 + 样式”时，必须拆分后再继续加功能。
- 修改现有页面时保持原模块边界；重构拆分优先抽出：类型与常量 → 纯函数 → 页面内组件 → 数据 hooks；确认跨页复用后再提升为公共组件。
- 稳定 DOM `id` / `data-*` 钩子是验收契约，重命名或删除前必须确认 browser smoke / 自动化仍可用。
- 新增依赖必须服务明确前端职责，并保持同源打包；不得为样式或逻辑引入会破坏 CSP / 离线托管的远程资源。
- TypeScript 保持严格；公共类型与 API 响应形状放在靠近使用方的模块，避免循环依赖。

### 反模式（禁止）

- 在单个 Page 文件中混写大段 CSS 字符串、复杂业务算法与完整 JSX，导致无法单独阅读任一职责。
- 复制粘贴近乎相同的表格/表单块到多个页面，而不抽取公共组件或 `lib` 助手；也禁止尚未跨页复用就把页面内组件提前塞进 `src/components/`。
- 在展示组件内发起未封装的网络请求，或在 `api/` 中操作 React 状态。
- 未证明跨页共享必要就引入 Redux/Zustand 等正式全局 Store，或并行维护多套状态方案。
- 用新的全局 class 名覆盖 antd 内部结构作为默认定制方式（优先 theme token；确需覆盖时范围最小化并注释原因）。

## 开发与构建

- 在本目录执行 `npm install`、`npm run dev`、`npm run build`。
- 从 `product/buildr` 也可使用 `npm run build:web` / `npm run dev:web`（委托到本目录）。
- 修改前端路由、DOM 交互或 Agent Action 后，在 `product/buildr` 走生产托管路径的 browser smoke 做反馈。
