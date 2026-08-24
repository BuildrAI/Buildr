## ADDED Requirements

### Requirement: Buildr Browser verification必须消费声明的Web工具链准备
`product.browser-smoke`适用时 MUST通过Project Verification capability preparation reference要求`buildr-web`当前声明的依赖Recipe，并 MUST在staging build或Chrome启动前证明锁定依赖output与项目本地TypeScript executable current。Browser verifier MUST NOT借用全局TypeScript、retained checkout `node_modules`或未登记目录。

#### Scenario: Buildr Web本地工具链current
- **WHEN** Browser capability被selected且matching Environment已准备current `buildr-web` Recipe
- **THEN** staging build MUST从Task Environment允许的Buildr Web execution root解析项目本地TypeScript与Vite
- **AND** browser preflight通过后才能构建staging dist和启动Chrome

#### Scenario: 只有全局TypeScript可用
- **WHEN** Buildr Web本地依赖output缺失，但系统PATH存在另一版本TypeScript
- **THEN** Browser verification MUST在构建前blocked并指向matching Environment preparation
- **AND** MUST不使用全局TypeScript继续执行或把版本差异报告为页面失败

#### Scenario: Browser capability不适用
- **WHEN** changed target没有选择`product.browser-smoke`
- **THEN** Verification preparation closure MUST不包含`buildr-web` Browser辅助Recipe
- **AND** MUST不安装Buildr Web依赖、构建staging dist或启动Chrome
