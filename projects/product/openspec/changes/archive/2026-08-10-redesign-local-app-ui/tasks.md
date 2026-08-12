## 1. Brief 闸门与设计基线

- [x] 1.1 取得用户对 Brief「待确认决策」的明确选择（范围 / 视觉方向 / DOM 钩子 / 品牌色 / UI 框架），并写回 Brief 与 design Open Questions 关闭说明
- [x] 1.2 按确认范围列出受影响页面/壳层清单与动效预算，确认不改路由 path、API、session、CSP 与产品边界；design 已改为柔和产品感 + Ant Design 5

## 2. 视觉系统与壳层

- [x] 2.1 在 `buildr-web` 安装 `antd@5` / `@ant-design/icons`，配置 ConfigProvider（zh_CN + 柔和 token），精简 `styles.css` 并移除杂志字体
- [x] 2.2 重构应用壳层：antd `Layout` / `Drawer` / `Button`；保留 `data-nav` 与结构钩子；Agent Action 用 Drawer
- [x] 2.3 加入克制的页面进入动效，尊重 `prefers-reduced-motion`

## 3. 范围内页面换肤

- [x] 3.1 工作空间首页：antd Button / Alert / Empty；保留 `#workspace-grid` / `.workspace-card`
- [x] 3.2 全应用页面落地 antd：Overview/Settings（Form/Statistic/Descriptions）、Projects/Services/Tasks（Table+Form）、编辑页 Form、Articles List/Card、Task 详情 Form/Button、AgentActionDrawer Form/Input/Button/Alert
- [x] 3.3 构建 `web-dist`，确认产物无 CDN/远程字体/远程脚本引用

## 4. Browser 钩子与直接验证反馈

- [x] 4.1 钩子策略保留：核对 smoke 关键选择器仍可用（含原生 select/option 与 dialog.confirm）
- [x] 4.2 在生产托管路径跑 `test:browser:shell` 与 `test:browser:smoke`，修复本 Change 直接反馈
- [x] 4.3 运行 OpenSpec `validate redesign-local-app-ui --strict` 与前端 build，修复直接失败

## 5. Current knowledge 与 archive readiness

- [x] 5.1 按真实影响 reconcile Brief / `buildr-web`（及必要时 browser 验收表述）current knowledge 与 terminology
- [x] 5.2 确认 Change apply tasks 完成且具备 canonical convergence/archive 前置条件（不在本列表执行 Task Finish）
