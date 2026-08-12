## MODIFIED Requirements

### Requirement: Product Project 治理根与可执行 Service 根必须分离
Buildr自举Product MUST将治理资产保留在Product Project root，并 MUST将npm package、CLI、运行源码、测试、维护脚本和交付源资产放入已登记Buildr Service root。Product Project root MUST不以`task-environment.yml`或其他技术栈准备清单成为Environment Plan authority，并 MUST不包含`package.json`、`package-lock.json`、`node_modules`或编译器入口。

#### Scenario: 检查 Product Project root
- **WHEN** Agent、CI或release检查`projects/product/`
- **THEN** root MAY包含OpenSpec、docs、knowledge、Project/Service治理声明和薄`buildr`入口
- **AND** MUST不包含Project级Task Environment技术栈计划、npm metadata、node_modules、可执行产品源码或第二份Buildr实现

#### Scenario: Task Environment声明被误作Package root
- **WHEN** layout verifier发现`projects/product/task-environment.yml`
- **THEN** verifier MUST失败并说明Environment Plan由Agent按Task登记
- **AND** MUST不把该文件继续识别为package或Project治理authority

#### Scenario: 检测已废弃 package root 的遗留依赖
- **WHEN** 不含package metadata的`projects/product/`发现node_modules
- **THEN** verifier MUST失败并指出它是遗留依赖
- **AND** MUST不建议sync或doctor自动删除用户数据

#### Scenario: 检查 Buildr Service root
- **WHEN** verifier扫描`projects/product/services/buildr/`
- **THEN** 该目录 MUST是`@buildr-ai/buildr` package、运行源码、验证、维护脚本和交付源资产的唯一源码根
- **AND** Service root MUST提供Service-level `AGENTS.md`

#### Scenario: 从旧开发入口运行 Buildr
- **WHEN** 用户或Agent执行`projects/product/buildr`
- **THEN** 该入口 MUST作为薄兼容bridge调用Buildr Service的CLI
- **AND** bridge MUST不复制运行实现或建立第二份package root
