# Buildr Service

本目录是 Product Project 下 `buildr` Service 的规则入口，承载 Buildr 的 npm package、CLI、Buildr Web Runtime、`web-dist` 托管与打包等可执行实现。

## 所有权边界

- Service 负责 npm package、CLI、Buildr Web Runtime、`web-dist` 托管与打包、运行源码、测试、维护脚本、随包交付资产及实现型文档。
- Buildr Web Frontend Service 的 React/Vite 权威前端源码属于 sibling Service `../buildr-web`；本 Service 拥有 Buildr Web Runtime，只消费正式构建产物并负责 `web-dist` 的托管与打包。
- Product Project 根负责 OpenSpec、项目级规则、capabilities、Command requirements、verification policy 与跨服务产品治理。
- 不在 Product Project 根和本 Service 之间复制 `src/`、`bin/`、`test/`、`scripts/`、`package/` 或 package metadata；`projects/product/buildr` 只允许作为薄兼容入口。

## 实现边界

- 父级 `projects/product/openspec/` 是产品语义 Change 的规范 authority；本 Service 不维护第二个 OpenSpec 根。
- 本 Service 拥有自身实现与测试；Product `verification.yml` 和 Task Verification Application 拥有交付验证声明与 current Result，命令执行位置或单次测试通过不得替代它们。
- 发布、Candidate、本机 CLI 安装和路径迁移必须证明开发 checkout、task worktree 与 npm package 三种入口一致。
