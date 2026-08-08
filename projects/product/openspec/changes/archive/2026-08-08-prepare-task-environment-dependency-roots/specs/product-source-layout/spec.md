## MODIFIED Requirements

### Requirement: Product Project 治理根与可执行 Service 根必须分离
Buildr自举Product MUST将项目治理资产保留在Product Project root，并 MUST将npm package、CLI、运行源码、测试、维护脚本和交付源资产放入已登记的Buildr Service root，二者不得形成双重实现事实源。Product Project root MAY包含closed `task-environment.yml`作为Project级Service dependency declaration，但该文件 MUST NOT使Project root成为package root；Product Project root在完成package root迁移后 MUST NOT保留`package.json`、`package-lock.json`、`node_modules`或其`.bin`可执行入口。

#### Scenario: 检查 Product Project root
- **WHEN** Agent、CI或release检查`projects/product/`
- **THEN** root MAY包含OpenSpec、docs、knowledge、Project/Service治理声明、`task-environment.yml`和薄`buildr`兼容入口
- **AND** MUST NOT包含npm package metadata、`node_modules`、可执行产品源码、测试树或第二份Buildr实现

#### Scenario: Task Environment声明被误作Package root
- **WHEN** Project root存在`task-environment.yml`
- **THEN** layout/static verifier MUST把它识别为Project治理声明
- **AND** MUST仍拒绝在同一root新增`package.json`、`package-lock.json`、`node_modules`或编译器入口

#### Scenario: 检测已废弃 package root 的遗留依赖
- **WHEN** 架构verifier在不含package metadata的`projects/product/`发现`node_modules`
- **THEN** verifier MUST失败并明确该目录是已废弃package root的遗留依赖
- **AND** 诊断 MUST指向`projects/product/services/buildr`作为唯一允许安装和解析Buildr开发依赖的package root
- **AND** 诊断 MUST NOT建议`buildr update`、`buildr sync`或doctor自动删除该目录

#### Scenario: 检查 Buildr Service root
- **WHEN** verifier扫描`projects/product/services/buildr/`
- **THEN** 该目录 MUST是`@buildr-ai/buildr` package、运行源码、验证、维护脚本和交付源资产的唯一源码根
- **AND** Service root MUST提供Service-level `AGENTS.md`

#### Scenario: 从旧开发入口运行 Buildr
- **WHEN** 用户或Agent执行`projects/product/buildr`
- **THEN** 该入口 MUST作为薄兼容bridge调用Buildr Service的CLI
- **AND** bridge MUST NOT复制运行实现或建立第二份package root
