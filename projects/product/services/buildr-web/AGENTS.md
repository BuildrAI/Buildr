# Buildr Web Service

本目录是 Product Project 下 `product/buildr-web` Service 的规则入口，承载 Local App 的 React/Vite 前端源码与正式构建。

## 所有权边界

- Service 拥有 Local App 前端工程：`package.json`、Vite/TypeScript 配置、`src/` 与前端依赖锁定。
- 正式构建产物写入 sibling `buildr` 的 `src/interfaces/local-app/web-dist/`；运行时同源 loopback 托管、session 注入与三入口打包仍由 `product/buildr` 负责。
- OpenSpec、verification policy 与跨服务产品治理仍在父级 `projects/product/`；本目录不维护独立 OpenSpec 根。
- 已安装或仅含 dist 的环境不得依赖本 Service 源码树或 Vite 开发服务器。

## 开发与构建

- 在本目录执行 `npm install`、`npm run dev`、`npm run build`。
- 从 `product/buildr` 也可使用 `npm run build:web` / `npm run dev:web`（委托到本目录）。
- 修改前端路由、DOM 交互或 Agent Action 后，在 `product/buildr` 走生产托管路径的 browser smoke 做反馈。
