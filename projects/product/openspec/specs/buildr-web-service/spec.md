# buildr-web-service Specification

## Purpose

Product 下 `buildr-web` Service 的登记、源码根、React/Vite 所有权，以及向 `buildr` 交付可托管静态构建产物的交接边界。

## Requirements

### Requirement: Product 必须登记同仓 workspace Service buildr-web
Buildr Product Project MUST 在 canonical Service registry（`services/manifest.yml`）中登记 `buildr-web` Service。该 Service MUST 使用 `source.type: workspace`，且 `source.path` MUST 等于 `projects/product/services/buildr-web`。`buildr-web` MUST 与 `buildr` 位于同一上级 Git workspace，MUST NOT 要求独立 Git remote 或虚构 Service Git 状态。

#### Scenario: 读取 Product Service registry 中的 buildr-web
- **WHEN** CLI、doctor 或本机应用读取 Product Project 的 Service collection
- **THEN** registry MUST 返回 code 为 `buildr-web` 的 Service
- **AND** Service `source.path` MUST 等于 `projects/product/services/buildr-web`
- **AND** Service `source.type` MUST 为 `workspace`

#### Scenario: 定位 buildr-web 资产
- **WHEN** Application 通过 Service metadata 定位 `product/buildr-web`
- **THEN** 对应目录 MUST 存在并包含 Buildr Web 前端工程与 Service 级说明（如 `AGENTS.md`）
- **AND** Project root MUST NOT 将前端源码工程声明为第二份 package root 与 `buildr` 重叠

### Requirement: buildr 必须在构建或打包时消费 buildr-web 产物并继续同源托管
`buildr` Buildr Web HTTP interface MUST继续通过loopback同源托管正式Buildr Web静态产物。开发构建 MAY把`buildr-web`输出物化到精确ignored的sibling `buildr/web-dist/`；Browser和Candidate/打包步骤 MUST接受显式隔离输出目标并消费本次matching生成物，不得要求Git tracked `web-dist`。运行已安装npm package、Launcher或仅含dist的环境时，主机 MUST NOT要求`buildr-web`源码树存在。

#### Scenario: 构建交接写入可证明托管路径
- **WHEN** 维护者执行本地可启动Buildr Web开发构建
- **THEN** 步骤 MAY将静态产物置于ignored `buildr/web-dist/`
- **AND** Buildr Web HTTP MUST能从该路径服务shell并注入本机session meta
- **AND** 构建 MUST不改变Git tracked/index状态

#### Scenario: Candidate构建交接到隔离暂存
- **WHEN** Candidate或Browser owner为Buildr Web构建提供显式输出目录
- **THEN** Vite MUST把静态资产写入该目录并返回可枚举的matching生成物
- **AND** 下游 MUST只消费该输出，不扫描或回退到checkout本地dist

#### Scenario: 无 buildr-web 源码仍可打开已打包应用
- **WHEN** 环境仅有已包含Web dist的`buildr` package或Launcher bundle
- **THEN** Buildr Web MUST仍可通过loopback HTTP打开
- **AND** MUST NOT依赖`projects/product/services/buildr-web`、Vite或TypeScript在运行时存在

### Requirement: buildr-web 必须拥有 Buildr Web React/Vite 源码与构建
`buildr-web` Service MUST 是 Buildr Web React/Vite/TypeScript 前端源码与前端构建脚本的唯一权威位置。迁移完成后，`product/buildr` Service MUST NOT 继续保留权威的前端源工程根（例如 `web/`）作为第二事实源。

#### Scenario: 前端源码所有权
- **WHEN** 维护者定位 Buildr Web 前端源码
- **THEN** 源码 MUST 位于 `projects/product/services/buildr-web`
- **AND** MUST NOT 要求在 `projects/product/services/buildr/web` 保留并行权威源

#### Scenario: 前端构建产出静态资产
- **WHEN** 维护者或 CI 在 `buildr-web` 执行正式前端构建
- **THEN** 构建 MUST 产出可被 `buildr` 消费的静态资产集合
- **AND** 构建 MUST NOT 要求运行时启动 Vite 开发服务器才能生成可托管产物
