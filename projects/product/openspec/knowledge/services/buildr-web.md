# Buildr Web Frontend Service

## 职责

`buildr-web` 是 Product Project 下与 `buildr` 同仓同级的 workspace Service，正式名称为 Buildr Web Frontend Service，拥有 Buildr Web 的 React/Vite/TypeScript 前端源码、依赖锁定与正式构建。它不托管生产 HTTP、不拥有 session 写保护模型，也不替代 CLI/Buildr Web Runtime。

## 接口与入口

- 源码根：`projects/product/services/buildr-web/`（`package.json` name：`@buildr-ai/buildr-web`，private）。
- 开发：`npm run dev`；正式构建：`npm run build`（也可由 `buildr` 的 `npm run build:web` / `dev:web` 委托）。
- 构建输出：正式构建默认写入 sibling `buildr` 的 `src/interfaces/local-app/web-dist/`（`emptyOutDir: true`）；验证可通过Vite `--outDir`覆盖到临时staging，只用于与tracked产物精确比较，不改变正式输出契约。
- OpenSpec 与 verification policy 仍在父级 Product Project；本 Service 通过 Service registry 登记并由 Buildr Web / doctor 可见。
- 全局壳层读取 sibling `buildr` 的只读Release Awareness API，在所有路由顶部展示GA/RC更新；用户可以复制精确`buildr update --track stable|candidate`命令，或把同一选择交给Agent。首版不从网页执行npm更新，也不替用户决定轨道。

## 数据与依赖

- 依赖 React 19、React Router、Vite、TypeScript，以及 Ant Design 5（`antd` + 必要 icons）；UI 方向为柔和产品感，依赖与字体均由 Vite 打入 `web-dist`，禁止 CDN/远程字体/远程脚本；前端工程自有 `package-lock.json`。
- 当Task构建或验证Buildr Web前端时，Agent从Task scope、`buildr`的`build:web`委托和Verification能力判断本Service需要准备，并在Task专属Environment Plan中为本Service登记独立Step。npm场景的Step使用本root的`package.json`/`package-lock.json`作为inputs、worktree-local`node_modules`作为output、Workspace Foundation受管npm作为executable，不从retained checkout或系统PATH借用TypeScript/Vite。
- 运行时依赖 `buildr` 消费 `web-dist` 并做同源 loopback 托管；已安装或仅含 dist 的环境不要求本 Service 源码或 Vite 开发服务器存在。
- 不引入独立 Git 仓、CDN、分域 CORS 或云端静态托管。
- Task 列表默认 `open` (todo + active)，可单独筛选 todo，并继续以 `retrospectiveState` 筛选复盘处置。Task 详情展示复盘来源，复盘 Tab 保持原始 Markdown 只读并展示后续 Task 实时状态。UI 不创建或激活 Task。
- Task概览的“父子任务协调”区块直接消费sibling `buildr` Parent Coordination Application read model，展示Parent Plan、Contribution disposition、直接Child顶层状态与saved handoff证明；前端不查询SQLite、不扫描文件系统、不缓存或回写Parent progress。legacy Task只展示absent提示。
- Task“证据”页使用一个共享Execution Record浏览器展示全部、Verification与Finish三种只读视图，按需读取detail与manifest声明的限量正文；Verification Result与研发页的Finish区块只提供进入同一浏览器的专业筛选入口，不复制record、Result或Finish current/terminal authority，也不提供locator、cleanup、GC或资源Inventory。

## 运行与验证

- 前端路由、DOM 交互或 Agent Action 变更后，在 `buildr` 生产托管路径下运行 browser smoke（或 affected selector）做直接反馈；package、lockfile、Vite或TypeScript配置变化选择完整Browser selector。selected Browser先完成临时staging build与tracked `web-dist`精确比较，零selector不得成功；尽量保留稳定 DOM id / `data-*` 钩子，不以 Vite HMR 冒充正式验收。
- Service registry 中 `source.path` 为 `projects/product/services/buildr-web`，与 `buildr` 路径不重叠。

## 局部术语

本 Service 当前不重定义 Project glossary。Buildr Web、session 与三入口语义以 [Buildr Service](buildr.md) 及相关 specs 为准。
