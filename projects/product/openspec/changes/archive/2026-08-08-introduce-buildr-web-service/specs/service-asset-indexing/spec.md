## ADDED Requirements

### Requirement: Buildr 自举 Product 必须登记真实的 buildr-web Service
Buildr Product Project MUST 在 canonical Service registry 中登记承载 Local App 前端工程的 `buildr-web` Service，并 MUST 使用真实 workspace source path `projects/product/services/buildr-web`，而不是空壳、重复路径或只为界面展示生成的 fixture。`buildr-web` MUST 与 `buildr` 并列存在，且二者的 `source.path` MUST NOT 重叠。

#### Scenario: 读取 Product Service registry 中的 buildr-web
- **WHEN** CLI、doctor 或本机应用读取 Product Project 的 Service collection
- **THEN** registry MUST 返回 code 为 `buildr-web` 的 Service
- **AND** Service `source.path` MUST 等于 `projects/product/services/buildr-web`
- **AND** Service `source.type` MUST 为 `workspace`

#### Scenario: buildr 与 buildr-web 路径不重叠
- **WHEN** Application 同时定位 `product/buildr` 与 `product/buildr-web`
- **THEN** 两个 Service 的 `source.path` MUST 分别为 `projects/product/services/buildr` 与 `projects/product/services/buildr-web`
- **AND** Project root MUST NOT 将二者声明为同一 source path
