## MODIFIED Requirements

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
