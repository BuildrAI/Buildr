# Buildr Service

本目录是 Product Project 下 `buildr` Service 的规则入口，承载 Buildr 的 npm package、CLI、本机应用 HTTP/运行时（runtime）、`web-dist` 托管与打包等可执行实现。

## 所有权边界

- Service 负责 npm package、CLI、本机应用 HTTP/runtime、`web-dist` 托管与打包、运行源码、测试、维护脚本、随包交付资产及实现型文档。
- Local App React/Vite 权威前端源码属于 sibling Service `../buildr-web`；本 Service 通过 `npm run build:web` 消费其构建产物。
- Product Project 根负责 OpenSpec、项目级规则、capabilities、Command requirements、verification policy 与跨服务产品治理。
- 不在 Product Project 根和本 Service 之间复制 `src/`、`bin/`、`test/`、`scripts/`、`package/` 或 package metadata；`projects/product/buildr` 只允许作为薄兼容入口。

## 开发与验证

- 修改产品语义时，OpenSpec change 仍维护在父级 `projects/product/openspec/`。
- package、源码和测试命令从本 Service package root 执行；Project 级验证负责组合父级 OpenSpec 与本 Service 实现。
- 发布、Candidate、本机 CLI 安装和路径迁移必须证明开发 checkout、task worktree 与 npm package 三种入口一致。
