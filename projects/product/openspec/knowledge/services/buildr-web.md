# Buildr Web Service

## 职责

`buildr-web` 是 Product Project 下与 `buildr` 同仓同级的 workspace Service，拥有 Local App 的 React/Vite/TypeScript 前端源码、依赖锁定与正式构建。它不托管生产 HTTP、不拥有 session 写保护模型，也不替代 CLI/runtime。

## 接口与入口

- 源码根：`projects/product/services/buildr-web/`（`package.json` name：`@buildr-ai/buildr-web`，private）。
- 开发：`npm run dev`；正式构建：`npm run build`（也可由 `buildr` 的 `npm run build:web` / `dev:web` 委托）。
- 构建输出：相对路径写入 sibling `buildr` 的 `src/interfaces/local-app/web-dist/`（`emptyOutDir: true`）。
- OpenSpec 与 verification policy 仍在父级 Product Project；本 Service 通过 Service registry 登记并由 Local App / doctor 可见。

## 数据与依赖

- 依赖 React 19、React Router、Vite 与 TypeScript；前端工程自有 `package-lock.json`。
- 运行时依赖 `buildr` 消费 `web-dist` 并做同源 loopback 托管；已安装或仅含 dist 的环境不要求本 Service 源码或 Vite 开发服务器存在。
- 不引入独立 Git 仓、CDN、分域 CORS 或云端静态托管。

## 运行与验证

- 前端路由、DOM 交互或 Agent Action 变更后，在 `buildr` 生产托管路径下运行 browser smoke（或 affected selector）做直接反馈。
- Service registry 中 `source.path` 为 `projects/product/services/buildr-web`，与 `buildr` 路径不重叠。

## 局部术语

本 Service 当前不重定义 Project glossary。Local App、session 与三入口语义以 [Buildr Service](buildr.md) 及相关 specs 为准。
