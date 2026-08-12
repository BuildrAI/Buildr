## ADDED Requirements

### Requirement: Product 必须登记同仓 workspace Service buildr-web
Buildr Product Project MUST 在 canonical Service registry（`services/manifest.yml`）中登记 `buildr-web` Service。该 Service MUST 使用 `source.type: workspace`，且 `source.path` MUST 等于 `projects/product/services/buildr-web`。`buildr-web` MUST 与 `buildr` 位于同一上级 Git workspace，MUST NOT 要求独立 Git remote 或虚构 Service Git 状态。

#### Scenario: 读取 Product Service registry 中的 buildr-web
- **WHEN** CLI、doctor 或本机应用读取 Product Project 的 Service collection
- **THEN** registry MUST 返回 code 为 `buildr-web` 的 Service
- **AND** Service `source.path` MUST 等于 `projects/product/services/buildr-web`
- **AND** Service `source.type` MUST 为 `workspace`

#### Scenario: 定位 buildr-web 资产
- **WHEN** Application 通过 Service metadata 定位 `product/buildr-web`
- **THEN** 对应目录 MUST 存在并包含 Local App 前端工程与 Service 级说明（如 `AGENTS.md`）
- **AND** Project root MUST NOT 将前端源码工程声明为第二份 package root 与 `buildr` 重叠

### Requirement: buildr-web 必须拥有 Local App React/Vite 源码与构建
`buildr-web` Service MUST 是 Local App React/Vite/TypeScript 前端源码与前端构建脚本的唯一权威位置。迁移完成后，`product/buildr` Service MUST NOT 继续保留权威的前端源工程根（例如 `web/`）作为第二事实源。

#### Scenario: 前端源码所有权
- **WHEN** 维护者定位 Local App 前端源码
- **THEN** 源码 MUST 位于 `projects/product/services/buildr-web`
- **AND** MUST NOT 要求在 `projects/product/services/buildr/web` 保留并行权威源

#### Scenario: 前端构建产出静态资产
- **WHEN** 维护者或 CI 在 `buildr-web` 执行正式前端构建
- **THEN** 构建 MUST 产出可被 `buildr` 消费的静态资产集合
- **AND** 构建 MUST NOT 要求运行时启动 Vite 开发服务器才能生成可托管产物

### Requirement: buildr 必须在构建或打包时消费 buildr-web 产物并继续同源托管
`buildr` Local App HTTP interface MUST 继续通过 loopback 同源托管已纳入 `buildr` 的 Local App 构建产物（现有 `src/interfaces/local-app/web-dist` 或等价可证明路径）。`buildr` 的开发构建、npm pack 或 launcher 构建步骤 MUST 从 `buildr-web` 构建输出复制或同步到该托管路径。运行已安装 npm package、launcher 或仅含 dist 的 checkout 时，主机 MUST NOT 要求 `buildr-web` 源码树存在。

#### Scenario: 构建交接写入可证明托管路径
- **WHEN** 维护者执行会产出可发布或可启动 Local App 的 `buildr` 构建/打包步骤
- **THEN** 步骤 MUST 将 `buildr-web` 的静态构建产物置于 `buildr` 可证明的 web dist 路径
- **AND** Local App HTTP MUST 能从该路径服务 shell 并注入本机 session meta

#### Scenario: 无 buildr-web 源码仍可打开已打包应用
- **WHEN** 环境仅有已包含 web dist 的 `buildr` package 或 launcher bundle
- **THEN** Local App MUST 仍可通过 loopback HTTP 打开
- **AND** MUST NOT 依赖 `projects/product/services/buildr-web` 在运行时存在
