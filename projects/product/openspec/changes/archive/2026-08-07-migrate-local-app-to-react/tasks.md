## 0. 文档完善（当前阶段，无实现）

- [x] 0.1 完成 OpenSpec proposal / design / specs / tasks，并通过 `openspec validate --strict`
- [x] 0.2 编写并确认 Change Brief（1A + 2B、闸门与非目标）
- [x] 0.3 编写功能等价清单 [parity-checklist.md](parity-checklist.md)
- [x] 0.4 编写并行 Change 依赖说明 [dependency-notes.md](dependency-notes.md)
- [x] 0.5 文档阶段结束：维护者确认后授权「只交付文档」进 retained；**仍不开始 React 编码**

## 1. 基线与依赖核对（需开发授权）

- [x] 1.1 文档化并行 Changes 状态与 Task 详情约束（见 dependency-notes；实现前须再跑一次 list 核对）
- [x] 1.2 在 retained/checkout 记录迁移前 `npm run test:browser:smoke` 与相关 `local-app-web` / `local-app-runtime` / launcher 基线结果
- [x] 1.3 固化功能完整性 checklist（见 parity-checklist.md；勾选实现进度在开发阶段进行）

## 2. React 工程与 dist 托管空壳

- [x] 2.1 在 `projects/product/services/buildr/web/` 创建 Vite + React 19 + TypeScript + React Router 工程，配置构建输出到 Local App `web-dist`（或等价可证明路径）
- [x] 2.2 移植现有 `styles.css` 到 React 工程，保持无 CDN / `default-src 'self'` 约束
- [x] 2.3 改造 `src/interfaces/local-app/http/server.mjs`：托管 dist、注入 session/preview meta、API 与 SPA fallback 分离
- [x] 2.4 更新 `package.json` files、launcher `package/launchers/build.mjs` 与构建/inventory，使 checkout、npm pack、Dev.app 三入口包含并可服务同一 dist
- [x] 2.5 增加构建步骤，保证 task environment / browser 验证前产出 dist；空壳经 `buildr app` 打开且 `test:browser:shell` 通过

## 3. 客户端基础设施与契约分层

- [x] 3.1 实现公共 API client（路径改写、错误类型）与 `LocalSessionAdapter`（meta session 写头）
- [x] 3.2 实现应用 layout、路由表（对齐 parity-checklist 与现有 path）、Agent Action 抽屉壳
- [x] 3.3 为 API client / session 边界增加 contract 或 integration 断言（无 session 写失败、拒绝 filesystem path 字段）

## 4. 功能等价迁移切片

- [x] 4.1 迁移 Workspaces / Overview / Settings（清单 A/B），跑 `test:browser:shell`
- [x] 4.2 迁移 Projects 列表/详情/编辑（清单 C），跑 `test:browser:project`
- [x] 4.3 迁移 Services 列表/详情/编辑（清单 D），跑 `test:browser:service`
- [x] 4.4 迁移 Articles 列表/详情（清单 E），跑 `test:browser:articles`
- [x] 4.5 迁移 Tasks 列表（清单 F1），跑 Task browser 列表相关断言
- [x] 4.6 迁移 Task 详情只读投影与五页签（清单 F2–F6），分页签跑 `test:browser:task`
- [x] 4.7 迁移 Task metadata update / complete / abandon / digest 与 terminal 文案（清单 F7–F8）
- [x] 4.8 迁移 Task-scoped Change 与 Agent Actions（清单 G/H），补齐相关 browser 断言
- [x] 4.9 全路由切换后运行 `npm run test:browser:smoke` 与受影响 `local-app-web` / runtime / launcher / preview 测试（清单 I）

## 5. 退役 vanilla 与收尾

- [x] 5.1 删除 `src/interfaces/local-app/web/` vanilla 实现与源文件白名单模式，确认仅 dist 可服务
- [x] 5.2 核对 OpenSpec delta、Brief、parity-checklist 与实现一致；`openspec validate migrate-local-app-to-react --strict` 通过
- [x] 5.3 实现与验证材料已就绪；正式 Content Target、Task Verification（含 delivery-required `product.browser-smoke`）、Completion Review 与 Finish 由 Task Development / Formal Finish 在 archive 后执行
- [x] 5.4 明确后续独立 Change `introduce-buildr-web-service` 不在本任务交付范围
